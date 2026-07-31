# Census — Technical Specification

> Status: design locked, pre-implementation. First deployment target is **Sepolia** — see [§14](#14-deployment-and-remaining-decisions).
>
> **Census** is the collection. An individual token is an **entry**.

---

## 1. Overview and scope

A 10,000-piece fully onchain collection. Every token is a 40×40 portrait bitmap stored in contract storage, and every token **is** an agent — an ERC-8004 identity with exactly one specialized skill, registered in the ERC-8257 Agent Tool Registry, reachable over HTTP, and paid over x402.

There is no frontend. Minting, renting, and operating all happen through APIs and through Claude. A holder who wants manual control imports the wallet into a normal wallet application.

**What we build:** the art + mint contract, the art pipeline, and the shared RESTAP server.

**What we do not build:** identity, reputation, discovery, payment, or marketplace infrastructure. All of that already exists as published standards and live services.

---

## 2. Architecture

| Layer | Component | Status |
|---|---|---|
| Identity | ERC-8004 Identity Registry, bound at mint via ERC-8217 / `adapter8004` | Draft, published |
| Reputation | ERC-8004 Reputation Registry | Draft, published |
| Token metadata | ERC-8048 key-value store, 721t key convention | Draft, published (`0xdf670be1`) |
| Discovery | ERC-8257 Agent Tool Registry; also reachable via OpenSea MCP `search_tools` / `get_tool` | Draft, published (`0xf1dc8075`) |
| Agent ↔ agent transport | RESTAP | v0.1.4-beta, not an ERC |
| Human ↔ agent transport | MCP, exposed per token at `endpoint[mcp]` | Available |
| Market data | OpenSea MCP | Available |
| Trading | Seaport via `@opensea/sdk` | Available |
| Event feed | `@opensea/stream-js` | Available |
| Payment | x402 | Available |
| **Art + mint** | **Our contract** | Live on Sepolia |
| **Art pipeline** | **`pipeline/`** | Built |
| **Agent runtime** | **Our shared RESTAP server** | To build |
| **Mint tooling** | **`pipeline/AGENTS.md`** | Built |

### On "Draft"

Every ERC this project uses is **Draft** status — ERC-8004, ERC-8048, ERC-8217, and ERC-8257 all are. That is normal for standards of this generation; almost nothing in the agent space has reached Final. Draft is not the meaningful distinction.

**The distinction that matters is whether a readable specification exists at all:**

- **Published on `eips.ethereum.org` with a number** — the interface is fixed, citable, and safe to build against. All four above qualify.
- **404, forum thread only** — no spec to design against.

**Not depended on.** ERC-8338 (Token-Bound Executable Skills) and ERC-8239 (Agent Skill Registry) both return 404 on `eips.ethereum.org`. Tracked, not built against. ERC-8257 covers the same need and is published.

**Residual risk to accept:** a Draft interface can still change. ERC-8048 and ERC-8257 both carry ERC-165 interface IDs, so a breaking change would be detectable rather than silent — but a migration path should be assumed rather than ruled out.

### Transport split

Three transports, three distinct roles. Do not collapse them.

- **RESTAP — agent to agent.** Chosen specifically for `/news`, which is bidirectional but **never triggers a reply**. With 10,000 agents able to hire one another, two agents calling each other in a cycle would drain their owners' funds in minutes. RESTAP solves loop prevention at the protocol level.
- **MCP — human to agent.** Each token exposes `endpoint[mcp]`. A renter adds the agent to their own Claude and uses it directly as a tool. This is the primary human interface, and it is why the project needs no frontend.
- **OpenSea MCP — us to market data.** The shared server consumes it rather than running an indexer.

---

## 3. Token and art

### 3.1 Bitmap format

- **Resolution:** 40 × 40 = 1,600 pixels, row-major, origin top-left.
- **Bit depth:** **2-bit — four tones.** 3,200 bits = **400 bytes** = 13 `uint256` words (128 bits padding). Locked; irreversible after launch.
- **Tone values:** `0` = background (white), `1` and `2` = mid tones, `3` = full ink (black). A pixel counts as **lit** for density and signature purposes if its value is non-zero.
- **Storage:** SSTORE2 — the bitmap is written once as contract bytecode and read with `EXTCODECOPY`. Never mutated after mint.
- **Padding:** trailing bits are zero and must be masked out of every popcount and comparison.

Four tones buy shading and edge definition that pure black-and-white cannot carry, at 400 bytes instead of 200 — a difference that is negligible in gas terms. The style constraints of §3.2 still apply: four tones are for deliberate shading, not for anti-aliasing or dithering, which read as noise at this resolution.

### 3.2 Subject and style

Every portrait is **head and shoulders, front-facing**, on a white background: flat, high contrast, strong silhouette, no gradient, no background elements. At 40×40 with two bits per pixel, a soft or gradient-heavy source image binarizes to mud. The style constraints are not aesthetic preference; they are what survives the encoding.

There is **no framing mask**. Consistency is produced by the pipeline's brief and trait system and checked (softly) by preflight — not enforced by contract geometry.

### 3.3 Render path

`tokenURI(tokenId)` returns a data URI containing SVG generated entirely onchain from the stored bitmap, using row-scan RLE to keep the output compact. No IPFS, no gateway, no external host. Wallets and marketplaces read the artwork directly from the contract.

### 3.4 The 8×8 signature

The uniqueness key. 40 divides evenly by 8, so downsampling is exact:

1. Partition the 40×40 grid into 64 blocks of 5×5 (25 pixels each).
2. Each block yields one bit: set if the block's lit-pixel count ≥ 13 (majority of 25). For 2-bit art, a pixel counts as lit if its value is non-zero.
3. Concatenate row-major into a `uint64`.

Stored as `mapping(uint64 => bool) signatureUsed`, giving **O(1)** duplicate rejection.

This deliberately compares *coarse silhouette*, not exact pixels — a one-pixel shift does not manufacture a "new" character. It also does not attempt near-neighbour rejection; comparing a candidate against up to 10,000 stored signatures onchain is too expensive, so exact-match rejection is the whole check. See [DECISIONS.md](DECISIONS.md).

---

## 4. Mint flow

### 4.1 Sequence

Minting is **one transaction**. There is no separate registration or "awaken" step — a token that exists is an agent.

1. **Off-chain, on the minter's own machine.** The minter runs `pipeline/` with their own agent. It assigns traits, has the agent draw the portrait, binarizes it to a 40×40 bitmap, computes the 8×8 signature, and calls `validate()` as a free `staticcall`. **We pay nothing for generation** (§11).
2. **`mint(bitmap, context)`** — a single transaction that:
   - runs the hard checks (§4.3) and reverts on failure
   - writes the bitmap via SSTORE2
   - records the 8×8 signature
   - draws a skill slot from the remaining pool (§4.4), which determines the class
   - writes ERC-8048 metadata keys (§5)
   - binds an ERC-8004 identity (§6)
   - registers the agent in the ERC-8257 Agent Tool Registry (§7)
   - mints the ERC-721 to the caller

### 4.2 Preflight

```solidity
function validate(bytes calldata bitmap, address minter)
    external
    view
    returns (bool ok, uint8 reason, uint8[] memory warnings);
```

A free `staticcall`. The pipeline calls it before every mint attempt, so a minter never hits a surprise revert. `reason` maps to a hard failure; `warnings` carries the soft checks.

### 4.3 Checks

**Hard — the mint reverts. Two checks only.**

| Check | Rule |
|---|---|
| Uniqueness | The 8×8 signature must not already exist |
| Density | Lit pixels must be within **8%–70%** of 1,600 → **[128, 1120]** |

Density catches only the two degenerate cases: a blank canvas and a solid block. The band is intentionally wide.

**Soft — advisory only, reported by `validate()`, never blocking.**

| Check | Rule | Starting threshold |
|---|---|---|
| Symmetry | Hamming distance between the left half and the mirrored right half of the 8×8 signature — flags portraits that are not front-facing | warn above **10** of 32 comparable bits |
| Top-corner clearance | Lit-pixel density inside the two 8×8 top corner blocks — flags bad framing | warn above **25%** in either corner |
| Silhouette clarity | Share of lit pixels that are isolated (no lit 4-neighbour) — flags dithering and noise | warn above **15%** |
| Tone balance | Share of lit pixels at full ink (value `3`) — flags art that ignores the mid tones and wastes the 2-bit depth | warn below **30%** |

These are **advisory only and never block a mint**, so getting them wrong costs nothing. They are tunable at any time — they live in the pipeline's reporting, not in consensus-critical logic. Calibrate against the first few hundred real portraits.

### 4.4 Skill and class assignment

Class is **not** rolled as a probability. The contract holds a pool of 10,000 remaining skill slots with the exact quotas of §8.2. Each mint **draws one slot from the remaining pool**; the drawn skill implies the class.

This guarantees the final distribution is exact by construction — no probability drift, no possibility of ending with 4 Skulls or 400.

The draw index derives from `keccak256(block.prevrandao, tokenId, msg.sender)`.

**Grinding — accepted, and bounded.** A minter can wrap `mint()` in a contract that reverts unless the draw yields a Skull, retrying until it does. This is accepted rather than fixed, for two reasons:

1. The pool draw guarantees the final distribution regardless. Grinding shifts *who* receives what, never the totals — there will be exactly 300 Executors either way.
2. The **per-wallet cap** (§4.5) bounds how much any one party can grind into, and every attempt still costs gas.

The alternative — two-phase commit-reveal — closes the attack completely but breaks the single-transaction mint, which is a core design commitment (D3). Not worth the trade.

### 4.5 Price and access

**Minting is free.** There is no mint price. The minter pays only gas, from a wallet they fund themselves. We carry no cost on either side: not generation (their agent), not gas (their wallet).

**Per-wallet cap: 5.** One address may mint at most five tokens.

The cap does two jobs with one rule. It stops a single party sweeping a free supply, and it bounds rarity grinding (§4.4). It does not stop a determined actor from splitting across wallets — nothing cheap does — but it makes accumulation visible and expensive rather than trivial.

---

## 5. Onchain metadata

All metadata lives in the token's ERC-8048 key-value store, following the **721t** key convention. Interface ID `0xdf670be1`; `MetadataSet` is emitted on every write.

### 5.1 Relationship to 721t

721t is nxt3d's **reference implementation** of an agent metadata profile on ERC-721, not a standard. The standard is ERC-8048. 721t supplies two separable things, and Census takes only one of them.

- **The key convention — adopted in full.** Other agents' tooling can read Census entries with no Census-specific code. Free interoperability for zero work.
- **`AgentNFT.sol` — not inherited.** It is a plain mintable ERC-721 with owner-writable metadata. None of what Census needs is in it: SSTORE2 bitmap storage, onchain SVG rendering, the validate/uniqueness/density checks, the skill pool draw, the per-wallet cap, or adapter binding at mint.

**The critical divergence:** 721t exposes `setMetadata` so the owner can write *any* key. Census must not. See below.

### 5.2 Key permissions

| Key | Value | Writable by |
|---|---|---|
| `skill` | Skill identifier (§8.2) | **Nobody — contract-set at mint, immutable** |
| `class` | `human` \| `agent` \| `alien` \| `skull` | **Nobody — contract-set at mint, immutable** |
| `context` | UTF-8 markdown: the agent's persona and what its skill does | Owner |
| `endpoint[restap]` | `https://<host>/a/<tokenId>` — agent-to-agent | Owner |
| `endpoint[mcp]` | `https://<host>/mcp/<tokenId>` — human-to-agent, addable to Claude | Owner |
| `endpoint[x402]` | `https://<host>/pay/<tokenId>` — payment endpoint | Owner |
| `address[<chain-id>]` | Per-chain address, ERC-7930 interoperable format | Owner |

`skill` and `class` are the quota assignment. If an owner could rewrite them, the caps in §8.2 would mean nothing and the entire scarcity model would collapse. They are written once by `mint()` and have no setter.

**Owner-writable endpoints are deliberate, and they soften the project's largest compromise.** Because an owner can repoint `endpoint[restap]` at a server they run themselves, **the shared host (§9) is a default rather than a lock-in.** Anyone who wants to operate their own agent runtime can, without permission and without leaving the collection. The corresponding ERC-8257 registration is updated through `updateToolMetadata()`, which is creator-only.

### Traits

Traits live in ERC-8048 keys, **not** in the bitmap. They can therefore be extended after launch with negligible cost and no change to the artwork.

**There is no gender trait.** Persona text uses gender-neutral language throughout.

---

## 6. Agent identity

Every token binds to an **ERC-8004 Identity Registry** record at mint via **ERC-8217** semantics. The ERC-8004 Identity Registry is itself an ERC-721 with URI storage, so an agent identity is natively a token — no bridging concept is required, only a binding.

ERC-8217 stores only the binding contract address under a reserved metadata key; token details are read back from a singleton via `bindingOf()`:

```solidity
interface IERCAgentBindings {
    enum TokenStandard { ERC721, ERC1155, ERC6909 }

    struct Binding {
        TokenStandard standard;
        address tokenContract;
        uint256 tokenId;
    }

    event AgentBound(
        uint256 indexed agentId,
        TokenStandard indexed standard,
        address indexed tokenContract,
        uint256 tokenId,
        address registeredBy
    );

    function bindingOf(uint256 agentId) external view returns (Binding memory);
}
```

We bind as `TokenStandard.ERC721`. The record is minimal and immutable, and control flows to whoever holds our token.

**Decision: use `adapter8004` for the Sepolia deployment.** It registers an ERC-8004 identity, takes permanent custody of the identity token, and forwards control to whoever owns the bound external token.

**Sepolia deployment, verified on chain:**

| | |
|---|---|
| Proxy | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| Implementation | `0x31a68e5bc0224ad081d6ec20229b05f558609257` (ERC-1967, ~12.6 KB) |
| `owner()` | `0x03302Df40186D9B85faEA4fbb6cC5da028B23149` |

`bindingOf(uint256)` responds with the expected ABI. The EIP-1967 admin slot is zero, consistent with UUPS — upgrade authority sits with `owner()` on the implementation.

**Revisit before the production deployment.** `adapter8004` is UUPS-upgradeable and admin-managed, so a collection claiming full onchain autonomy would be entrusting its identity layer to a contract whose implementation an admin can change. On a free testnet deployment that is the right trade — it is proven, live, and removes work from the critical path. For production the alternative is implementing ERC-8217 binding ourselves against the Identity Registry directly: more work, no external trust dependency.

The binding interface is identical either way, so the swap is contained and does not ripple through the rest of the design.

The ERC-8004 **Reputation Registry** is where per-agent feedback accumulates. We write nothing to it ourselves; renters post signed reputation signals after calls. It is the only mutable per-agent state in the system, and it is free to us.

---

## 7. Tool registry

Each agent registers in the **ERC-8257 Agent Tool Registry** (`IToolRegistry`, interface ID `0xf1dc8075`) at mint. A registration commits a **metadata URI + manifest hash**, anchored to the offchain manifest through origin-binding and creator self-attestation. Pricing and access details are deferred to the manifest layer.

- The URI points to the agent's RESTAP catalog (`/.well-known/restap.json` scoped to that token).
- The manifest hash commits to the skill definition.

The hash gives a free integrity property: **an agent cannot silently change the service it advertises.** Changing the definition changes the hash, and the change is visible onchain.

Relevant registry functions: `registerTool()`, `getToolConfig()`, `updateToolMetadata()` and `setAccessPredicate()` (creator-only), `deregisterTool()`, and `hasAccess()` / `tryHasAccess()`.

Discovery works through the registry directly, and also through OpenSea MCP's `search_tools` / `get_tool`, which already query it.

### Access predicates — relevant to a planned optional layer

ERC-8257 delegates access control to pluggable external contracts implementing `IAccessPredicate` (interface ID `0xbdf9dc18`): `hasAccess()`, `name()`, `getRequirements()`. The specification explicitly follows the pattern set by Seaport zones and Uniswap v4 hooks.

**This is the natural implementation for exclusive leasing (§15).** Rather than building a custom leasing mechanism, an owner sets an access predicate that returns `false` for everyone except the exclusive renter for the duration of the lease. No new contract surface, no changes to the collection contract, and `getRequirements()` makes the lease machine-readable to other agents — so the market can see that a skill is locked up.

Worth validating early: it turns an optional layer into roughly a day of work instead of a subsystem.

---

## 8. Skills

### 8.1 Baseline capability — every agent, free

Every agent, regardless of class or skill, has:

- OpenSea reads (collections, items, stats, activity) via OpenSea MCP
- Event listening via `@opensea/stream-js`
- Seaport writes via `@opensea/sdk` — create listings, make offers, fulfill orders, cancel
- A wallet
- x402 payment (send and receive)

Infrastructure is nobody's monopoly. Nobody pays to rent an API.

### 8.2 Specialty skills

What is rented is **judgment**, not data access. Everyone has the same feed; the skill is knowing what to do with it.

| Class | Skill | Thesis | Quota |
|---|---|---|---|
| Human | **Mint Scanner** | Scans new deploys and drops, catches them early | 3,000 |
| Human | **Arbitrageur** | Mispricing, below-floor listings | 3,000 |
| Agent | **Tracker** | Watches specific wallets, reports smart-money movement | 1,500 |
| Agent | **Token Hunter** | New tokens, liquidity movements | 1,000 |
| Alien | **Trend Reader** | Sees what is heating up early | 700 |
| Alien | **Fraud Detector** | Copy collections, wash trading, suspicious volume | 500 |
| Skull | **Executor** | Acts the moment conditions are met, without confirmation | 300 |

**Total: 10,000.** Class totals: Human 6,000 (60%), Agent 2,500 (25%), Alien 1,200 (12%), Skull 300 (3%).

### 8.3 Per-skill I/O contracts

All calls go through `POST /talk` as JSON. Every response includes a `reasoning` field — the judgment is the product, so it is always returned.

**Mint Scanner**
```
in : { chains: string[], timeWindowHours: number, filters?: {...} }
out: { candidates: [{ contract, chain, deployedAt, mintPrice, supply, signal, reasoning }] }
```

**Arbitrageur**
```
in : { collections?: string[], watchlist?: string[], minSpreadBps: number }
out: { opportunities: [{ item, listedPrice, fairValue, spreadBps, reasoning }] }
```

**Tracker**
```
in : { wallets: string[], since: timestamp }
out: { movements: [{ wallet, action, item, price, timestamp }], summary, reasoning }
```

**Token Hunter**
```
in : { chains: string[], minLiquidityUsd: number, maxAgeHours: number }
out: { tokens: [{ address, chain, liquidityUsd, ageHours, signal, reasoning }] }
```

**Trend Reader**
```
in : { timeframe: "1h"|"24h"|"7d", category?: string }
out: { trending: [{ collection, momentum, volumeChangePct, reasoning }] }
```

**Fraud Detector**
```
in : { target: { type: "collection"|"wallet", id: string } }
out: { verdict: "clean"|"suspicious"|"fraudulent", confidence, flags: [...], evidence, reasoning }
```

**Executor** — the only skill with side effects, which is why it is the rarest.
```
in : { condition: {...}, action: {...}, budget: {...}, expiry: timestamp }
out: { accepted: bool, executionId, reasoning }
→ on execution, posts to the requester's /news endpoint (never expects a reply)
```

---

## 9. RESTAP server

**A single shared host serves all 10,000 agents by default.** Per-owner hosting is more decentralized in principle and would not happen in practice, so the shared host is what makes the collection work on day one.

**But it is a default, not a lock-in.** `endpoint[restap]` is owner-writable (§5.2), so any owner can repoint their entry at a server they run themselves — no permission needed, no fork, still in the collection. The shared host is a service, not a chokepoint.

This bounds the "fully onchain" claim honestly: **the artwork and the identity are fully onchain; the agent runtime is not.** Documentation says so plainly rather than overclaiming.

### Collection-level discovery: `llms.txt`

Alongside the per-token catalogs, the host serves an **`llms.txt`** at its root describing Census to any agent that arrives cold: what the collection is, the seven skills and their I/O contracts, how to enumerate entries, how to read an entry's catalog, and how to pay over x402.

For a project whose users are largely other agents, this is the front door. It is also cheap to keep current and can be regenerated whenever skills change.

### Endpoints, per token

| Endpoint | Method | Purpose |
|---|---|---|
| `/a/<tokenId>/.well-known/restap.json` | GET | Capability catalog — skill, I/O schema, price, x402 endpoint |
| `/a/<tokenId>/talk` | POST | Skill invocation. Optional SSE streaming via `Accept` header |
| `/a/<tokenId>/news` | GET/POST | Read/write, **never triggers a reply** — loop prevention |
| `/mcp/<tokenId>` | — | MCP surface for human Claude clients |
| `/pay/<tokenId>` | — | x402 payment endpoint |

The catalog advertises the agent as base URL with type `RESTAP`, making it discoverable alongside MCP and A2A in ERC-8004.

RESTAP deliberately does not define tool invocation semantics, long-running task orchestration, session lifecycle, or authentication. Sessions are optional via `session_id`; the server is stateless by default.

---

## 10. Rental flow (x402)

1. A renter (agent or human via Claude) discovers an agent through the ERC-8257 registry or OpenSea MCP `search_tools`.
2. The renter reads the agent's `/.well-known/restap.json` for schema and price.
3. The renter `POST`s to `/talk`. The server responds **HTTP 402** with payment terms.
4. The renter pays over x402.
5. The server runs the skill and returns the result.
6. The renter optionally posts a signed reputation signal to the ERC-8004 Reputation Registry.

**The fee goes to the token's owner.** The owner sets the price — this is the system's primary strategic decision and the game sits here: how do you price against the other 2,999 Arbitrageurs?

### Cost model

The system is self-funding:

| Cost | Borne by |
|---|---|
| Image generation at mint | The minter's own Claude — **zero to us** |
| Skill call inference | Our server runs it, but the renter's x402 payment covers each call |
| Fixed | Contract deployment + one server |

Nothing scales with collection size except call volume, and call volume pays for itself.

---

## 11. Art pipeline

Lives in `pipeline/`. The owner says what the character is; the pipeline assigns the
traits, has an agent draw it, binarizes to 400 bytes, and checks the result against the
deployed contract for free before anything is spent.

```
traits  →  prompt  →  agent draws  →  trim → resize → quantise → despeckle  →  validate()
```

**Who draws.** The owner's own agent, in the owner's session, using its own image
generation. No API key lives in the pipeline. **Claude is not a supported route** — it
has no image generation, and neither of its alternatives (SVG, or a script drawing
straight onto the grid) produced art good enough at 40×40. Both formats remain accepted
inputs because they work, but the supported path is an agent that emits raster.

**The loop is what carries quality, not the model.** Every attempt to make 40×40 pixel
art from a text prompt in one shot produces mud, and it is structural rather than a
model failure: the generator renders 1024×1024, 99.8% of it is discarded, and what
survives is cut to four tones. Detail and soft edges are exactly what a generator is
good at and exactly what the reduction destroys. What the pipeline adds is feedback —
`build` prints an ASCII render of the real result and every warning the contract would
raise, so the agent can see the collapse and draw again. A one-shot API call cannot do
that; an agent in a conversation can.

**Traits are ours, the subject is theirs.** Nine categories, no gender, drawn
deterministically from a seed and checked for uniqueness. The subject leads the prompt so
the entry is recognisably what was asked for; the traits follow so ten thousand entries
still read as one collection. They are written to the token as ERC-8048 keys
(`trait[species]`, `trait[hair]`, …).

**Three things carry the quality**, and all three were wrong in the pipeline this was
adapted from:

- *Trim to the subject.* Generators leave a lot of empty background; spending pixels on
  nothing is unaffordable when there are 1,600 of them.
- *Area filter last.* A single LANCZOS jump to 40×40 rings, and ringing quantises into
  halos and speckle. LANCZOS to 320, then BOX.
- *Percentile tone split.* Fixed grey cut points fail on any source whose contrast is not
  what you assumed, and shifting them to hit a density target drags the ink threshold down
  with them — a flat mid-grey image with no blacks. Splitting the lit pixels by percentile
  of their own distribution guarantees a full tonal range whatever comes in.

**`binarize.py` mirrors `src/lib/Bitmap.sol`** — signature, density, and every warning
threshold. Verified to agree with the contract's own `validate()`. If the two ever
diverge, the mint reverts.

## 12. Agent instructions

Distributed to minters, installed into their own Claude. Contains:

- The locked system prompt for portrait generation, with the style constraints of §3.2
- The binarization script (source image → 40×40 bitmap at the chosen bit depth)
- The 8×8 signature computation
- A `validate()` preflight caller that loops locally until the bitmap is clean
- The mint transaction builder
- Persona generation, gender-neutral

The package is what produces collection-wide consistency. The contract only prevents the two degenerate cases; **style coherence is the package's job, not the chain's.**

---

### 12.1 Implementation notes

Decisions made while building that changed the design rather than just the code.

**Batch minting.** `mintBatch(bytes[], string[])` mints up to the caller's remaining allowance in one transaction. Every entry still gets its own artwork, skill draw and ERC-8004 identity — only the fixed costs are shared: one transaction base fee instead of N, and the quota pool, mint counter and caller balance go warm after the first. Measured at **383k per entry versus 754k minting separately, a 50% saving**. Since the wallet cap is five, batching is the normal path rather than an edge case, and the pipeline should default to it.

**One slot per entry.** `signature` (64) + `agentId` (24) + `skill` (8) + `bitmap` pointer (160) is exactly 256 bits, so everything an entry is lands in a single `SSTORE`. `agentId` is `uint24` because the ERC-8004 registry will not issue 16.7M identities. The quota array carries its own running total in index 7 for the same reason — eight `uint16` values share one word, so the skill draw reads and writes one slot instead of two.

**Nothing is duplicated into the 8004 registry.** `context` already lives on Census and the endpoints live in the RESTAP catalog, so `register` is called with no metadata entries. `agentURI` is the RESTAP *base*, not the catalog path: discovery is defined as `GET {base}/.well-known/restap.json`, so appending it was both redundant and a longer string for the adapter to store. Shorter turned out to be more correct, not merely cheaper.

**Endpoints are derived, not stored.** `endpoint[restap]`, `endpoint[mcp]` and `endpoint[x402]` are computed from `baseHost` and the token id at read time. Only an explicit owner override is stored, and it takes priority. This keeps three cold storage writes out of every mint, and it means entries that were never touched follow the shared host automatically if it moves — no per-token migration. Overrides are unaffected by a host change, which is exactly right: an owner who has moved to their own runtime should not be dragged back.

**`Bitmap.analyze` works a row at a time.** A row is exactly 10 bytes, so one `mload` covers it and each 5-pixel block column is a 10-bit slice of that word; `(x | x >> 1) & 0x155` collapses each 2-bit tone to a single "lit" bit. Eight block counters are then packed into a single stack word (32 bits each, and a block tops out at 25 so the fields cannot carry), which keeps a bounds check and an MLOAD/MSTORE pair out of all 320 inner iterations. Together these cut the function from ~434k gas to 85k — it was the single largest term in `mint`.

## 13. Draft contract interfaces

```solidity
interface ICollection {
    // --- mint ---
    function validate(bytes calldata bitmap, address minter)
        external view
        returns (bool ok, uint8 reason, uint8[] memory warnings);

    function mint(bytes calldata bitmap, string calldata context)
        external
        returns (uint256 tokenId);

    function mintBatch(bytes[] calldata bitmaps, string[] calldata contexts)
        external
        returns (uint256[] memory tokenIds);

    // --- art ---
    function bitmapOf(uint256 tokenId) external view returns (bytes memory);
    function signatureOf(uint256 tokenId) external view returns (uint64);
    function tokenURI(uint256 tokenId) external view returns (string memory);

    // --- agent ---
    function skillOf(uint256 tokenId) external view returns (uint8);
    function classOf(uint256 tokenId) external view returns (string memory);
    function agentIdOf(uint256 tokenId) external view returns (uint256);

    // --- supply ---
    function remaining(uint256 skill) external view returns (uint16);
    function remainingTotal() external view returns (uint16);
}

// ERC-8048, interface id 0xdf670be1
interface IERC8048 {
    event MetadataSet(uint256 indexed tokenId, string key, bytes value);
    function metadata(uint256 tokenId, string calldata key)
        external view returns (bytes memory);
}
```

---

## 14. Deployment and remaining decisions

### 14.0 Live on Sepolia

| | |
|---|---|
| Census | `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` |
| adapter8004 | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| ERC-8004 Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |
| Deployer | `0x21AcB554118029815eF4C61BDa33523B626743F3` |
| `baseHost` | `https://census.example` — placeholder, settable |

Verified end to end against live infrastructure, not a mock:

- Entries 1–3 minted; each holds its own ERC-8004 identity (agent ids 9086, 9087, 9088) and `isController(agentId, owner)` returns true for all three, so control follows the token as designed.
- Entry 2 drew **Executor / Skull**, the 3% class — the pool draw works.
- Quotas decremented correctly (10,000 → 9,997); `mintedBy` tracked.
- `validate` preflight returned `ok` with advisory warning `[4]` (flat tone) and did not block, exactly as specified.
- Duplicate signature reverted `DuplicateSignature()`; writing `skill` reverted `ImmutableKey()`; a blank canvas returned reason 2.
- `bitmapOf(1)` returned all 400 bytes byte-identical to what was submitted, and `tokenURI(1)` produced a 12,345-character data URI containing a 6,772-byte SVG of 117 rects — rendered entirely from contract storage.

**Measured gas on chain:** first mint 586,981 (everything cold); batch of two 999,560, i.e. 499,780 per entry. The real adapter proved **cheaper** than the mock had predicted, so the earlier local estimates were conservative rather than optimistic.

### 14.1 Deployment path

**Sepolia first.** The full system deploys to Sepolia and runs end to end there — contract, art pipeline, shared RESTAP server, ERC-8004 binding via `adapter8004`, tool registry entries, and x402 rentals against testnet funds.

Sepolia is not a rehearsal for a subset. Everything ships, and the collection is exercised as a working economy before any production deployment is considered.

**Sepolia is disposable.** Nothing deployed there is permanent. The contract can be redeployed as often as needed, skills can be rewritten, quotas retuned, `llms.txt` and the agent instructions regenerated at will. There is no migration burden, no upgrade path to preserve, and no state worth rescuing. Iterate freely and destructively.

This has a design consequence worth stating: **decisions that are irreversible in production are still cheap to revisit on Sepolia.** Bit depth, quota table, the immutable key set, and the validation thresholds should all be stress-tested against real usage there — because the mainnet deployment is the point of no return for every one of them.

### 14.2 Settled since the first draft

| Decision | Locked to |
|---|---|
| Bit depth | **2-bit, four tones** (§3.1) |
| Mint price | **Free.** Minter pays only gas, from a wallet they fund (§4.5) |
| Per-wallet cap | **5** (§4.5) |
| Rarity grinding | **Accepted**, bounded by the wallet cap (§4.4) |
| Soft-check thresholds | Starting values set, tunable, non-blocking (§4.3) |
| Identity binding | **`adapter8004`** for Sepolia; revisit for production (§6) |
| First network | **Sepolia** |

### 14.3 Still open

**Production chain** — the only remaining open decision. Deferred until Sepolia has run. Base and Ethereum mainnet are both live for `adapter8004`.

Gas is the deciding input, so it was measured rather than estimated. All figures are `forge test` against a mock adapter; the real one mints an actual ERC-8004 token and will add roughly 100–200k, to be confirmed by a fork test.

| Path | Gas per entry |
|---|---|
| Single mint, warm contract | 753,501 |
| **Batched, 4 at a time** | **383,352** |

Down from **1,434,340** at first working version — a 73% reduction on the batched path. See §12.1 for what produced it.

Where a batched entry's gas goes, and what is actually reducible:

| Item | Gas | Reducible? |
|---|---|---|
| SSTORE2, 400 bytes | 112,427 | No — 32k `CREATE` plus 200/byte is the protocol price |
| `adapter.register` (mock; real is higher) | ~95,000 | Only by reversing D3 |
| `Bitmap.analyze` | 85,259 | Perhaps 20k more, in assembly |
| ERC-721 mint | ~48,000 | No |
| Entry slot, cold | 22,100 | No — already one packed slot |
| `signatureUsed`, cold | 22,100 | No — uniqueness depends on it |
| `context` storage | ~23,600 | Yes, but it moves the persona off chain |

A plain ERC-721 mint costs 50–70k. This is roughly six times that because it does six things a plain mint does not: store 400 bytes of art on chain, open an ERC-8004 identity in an external registry, validate 1,600 pixels, record a uniqueness key, draw from a capped pool, and seed metadata. **The cost is the work, not an inefficiency.**

| Chain | Gas price | Batched mint | Single mint |
|---|---|---|---|
| Base | ~0.01 gwei | fractions of a cent | fractions of a cent |
| Ethereum mainnet | 10 gwei | ~0.0038 ETH | ~0.0075 ETH |
| Ethereum mainnet | 30 gwei | ~0.0115 ETH | ~0.0226 ETH |

D21 removed cost as an argument against mainnet by moving gas to the minter. Measurement puts a version of it back: **a mint that is free but costs tens of dollars in gas is not meaningfully free**, and it would quietly select for wealthy minters — which cuts against a per-wallet cap whose whole purpose is broad distribution.

**Optimisation cannot settle this.** Without reversing a locked decision the floor is around 350k per batched entry. The two items that would move it further are both decisions, not code:

- Dropping the at-mint ERC-8004 binding saves ~95k and more against the real adapter — but reintroduces the activation step D3 exists to prevent.
- 1-bit art halves the SSTORE2 term to ~56k — but reverses D20.

Together those would reach roughly 200k. Neither is recommended; they are listed so the ceiling is known rather than rediscovered.

Choosing Base changes the cost by three orders of magnitude; further gas work changes it by tens of percent. The two are not alternatives and should not be traded off against each other.

---

## 15. Rejected designs

Recorded so they are not re-proposed. Full reasoning in [DECISIONS.md](DECISIONS.md).

| Rejected | Reason |
|---|---|
| Breeding / offspring | Not wanted; added a whole subsystem |
| Teams / partnerships | Dynamic lived between agents, added nothing to the artwork |
| Skill decay / wear | Grim; managing death is not fun |
| Organ growth on rental | An onchain write per rental, and it duplicated the ERC-8004 Reputation Registry |
| Burn for points | Rewarding burns makes people burn for the reward, not for market reasons |
| Editable / programmable canvas | The moment humans edit pixels, the agent becomes unnecessary and the thesis collapses |
| Organ ↔ skill binding | Skills bind to the character instead; accepted cost is losing "big ears = listener" legibility |
| Gender traits | Not wanted |
| Mint-authority signature | We would pay for every image generated — unaffordable |
| Rigid framing mask | Too strict; replaced by soft preflight warnings |
| Near-distance uniqueness | O(n) comparison against 10,000 signatures is too expensive onchain |

## 16. Optional layers

Neither is required for the system to work. Both can ship later without migration.

**Exclusive leasing.** An owner leases their skill exclusively to one renter for a period; nobody else can rent it during that window, and the renter pays a premium. With capped quotas this enables cornering — locking up 50 of 300 Executors moves the price for everyone. It adds one rule, costs almost nothing (leases are rare, unlike per-call writes), touches no artwork, and opens a genuine strategic layer.

Implementation is close to free: ERC-8257 access predicates (§7) already provide exactly this shape. The owner sets a predicate that denies everyone except the exclusive renter until expiry, and `getRequirements()` makes the lock machine-readable so the rest of the market can see it.

**Burn as pure supply destruction.** Burning permanently reduces the supply of a skill type, raising the value of every remaining one — a buyback-and-burn applied to capability supply rather than token supply. **Burning must never be rewarded**; the only consequence may be the market one. Burned agents stay renderable and are marked dead, so the collection accumulates a visible graveyard and thinned skill types are legible at a glance.

Known risk: burning benefits every holder of that skill type, not just the burner, so free-riding may mean it never happens. That is acceptable — it is an optional layer, not load-bearing.

# Census decision log

These decisions define the hardened mint-core release. Reopen one only when new
evidence changes its premise.

## Locked

### D1 — Standards are snapshots, not floating dependencies

ERC-8004, ERC-8048, and ERC-8217 are locked to the upstream commits in
`standards-lock.md`. Weekly CI reports drift but never edits an ABI or deployment.

### D2 — Runtime is a separate phase, not removed

ERC-8257, RESTAP, MCP, x402, the seven skill runtimes, and Executor authorization are
not required for an NFT to be born as an ERC-8004 agent, so they remain outside the
mint-core deployment. The original shared-runtime economy is restored as Phase 2 and
is specified in `RUNTIME-PLAN.md`.

### D3 — One-transaction identity binding

Census mints temporarily to itself, calls the controller-gated ERC-8217 adapter, then
transfers to the minter. There is no activation transaction. This creates two ERC-721
`Transfer` events and is required by the real adapter.

### D4 — Immutable canonical host and one-way launch

The Vercel production project URL is constructor state. It must be HTTPS with no
trailing slash. Deployment starts closed. `openMinting()` is owner-only and one-way;
there is no admin pause or close power.

### D5 — One 209-byte immutable art record

The first 200 bytes are the one-bit bitmap; the final nine bytes are trait indices in
pipeline category order. Signature and density calculations see only the bitmap.

### D6 — Trait assignment is a pipeline rule

The pipeline assigns traits from a persistent secure seed and prevents normal rerolls.
The contract enforces vocabulary validity and immutability, but cannot prove that a user
did not construct another valid `bytes9`. This limitation is explicit rather than
overstated.

### D7 — Metadata permissions are split

`skill`, `class`, and the entire `trait[...]` namespace are immutable. The current NFT
owner can write other ERC-8048 keys. The ERC-8048 event follows the locked four-field
form with the indexed key duplicated in readable form.

### D8 — Owner control plus a separate execution wallet

ERC-8217 control and runtime revenue follow NFT ownership. Phase 2 also gives every
entry a separate, lazily provisioned execution wallet for agent-to-agent payments and
authorized actions. That wallet is not the identity or controller; recovery, transfer
rotation, and spending policy remain owner-controlled. The owner can fully opt out of
the shared host through adapter `setAgentURI` and owner-writable endpoint metadata.

### D9 — Draft IDs and receipts are different identities

`draftId` identifies local work. Only decoded `EntryMinted` receipts establish actual
`tokenId` and `agentId`. Legacy numbered output files remain artifacts and are never
silently treated as minted tokens.

### D10 — Exact simulation is mandatory

The sender is derived locally from `PRIVATE_KEY`, never logged as a key or written to a
file. The exact single or batch transaction is simulated with the same sender before
broadcast. Chain failures stop; visual warnings are informational.

### D11 — Registration is truthful and read-only

The service reads live chain state, confirms adapter binding, uses the onchain SVG and
current context, disables caching, and returns inactive discovery-only
`registration-v1` JSON. It contains no runtime.

### D12 — Production URL precedes contract deployment

Because the host is immutable, rollout must obtain the stable Vercel production URL
before deploying Census. Minting opens only after production environment addresses and
live responses are verified.

### D13 — The prototype is archive-only

`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` demonstrates the earlier design. It is
never an active pipeline or README address.

### D14 — Production art is agent-native raster

An image-capable IDE agent is the default source, but users may also supply PNG, JPEG,
or WebP directly. Builds record optional `agent:*`, `user:*`, or `tool:*` provenance.
Python, SVG, ASCII, and procedural rollout smoke art are not production sources. Only
effectively blank or solid output is a visual hard failure; all composition metrics are
informational. Chain-safety failures remain non-bypassable.

Density above 35% is an informational readability warning. The agent checks the actual
40×40 preview once and redraws only when facial or primary-trait shapes visibly merge;
the warning has no confirmation flag and is not a mint blocker by itself.

### D15 — One-bit framing and palette are collection constants

The source is aspect-preserving cover-cropped once to 40×36 and placed at y=4 on the
40×40 canvas. This keeps a four-pixel top margin while anchoring shoulders to the
bottom and both sides. Threshold 128 produces a
200-byte MSB-first bitmap. The onchain renderer uses only charcoal `#34343A` and warm
pastel `#E9DDC7`.

### D16 — One permanent registration project

Registration URIs include both the Census contract address and token ID. This prevents
cross-deployment token-ID collisions while every deployment reuses the same Vercel
project and canonical host. The service verifies the requested contract through the
ERC-8217 binding instead of relying on one mutable `CENSUS_ADDRESS` environment value.

### D17 — Vercel deployments go directly to production

The owner has retired preview deployments for Census. Registration and runtime deploys
target their existing permanent production projects directly unless the owner later
changes this decision. Narrow runtime canaries remain capability-gated even though
they run on the production host. Git project roots are fixed to `registration-service`
and `runtime-service`; the monorepo root is never a deployment source.

### D18 — OpenSea supplies bounded Arbitrageur market observations

OpenSea remains the future MCP tool-discovery integration and is also the direct
read-only market source for Arbitrageur. The runtime uses active listing and best-offer
REST endpoints rather than wallet/trading SDK methods or a long-lived Stream socket.
The origin is fixed to `api.opensea.io`, the instant key stays in Vercel secrets and is
rotated before its 30-day expiry, and each call is bounded to 20 combined OpenSea slugs
or `slug:tokenId` targets. Reports compare raw amounts only when currencies and decimals
match, with one explicit exception: Ethereum mainnet native ETH and canonical WETH are
treated as a 1:1 economic pair. Every such result declares that conversion is required
and that wrapping gas is excluded. Reports remain gross observations, never guaranteed
profit or transaction advice; no order is built, signed, simulated, or submitted.

### D19 — Tracker is bounded by wallet, page, time, and immutable skill assignment

Tracker uses OpenSea's read-only account-events endpoint with the same secret-managed
API key. Input is limited to 10 Ethereum addresses, one chain, transfer/sale/mint event
types, and a start timestamp. Each wallet receives one request capped at 200 events;
pagination is disclosed as truncation rather than followed. Reports carry direction,
NFT and transaction evidence but make no ownership or trading conclusion.

Tracker runtime code may deploy inactive, but its canary cannot be attached to a token
with another skill. No current v3 token has skill index 2. Draft seeds and trait indices
will not be rerolled or selected to force one; activation waits for a naturally assigned
Tracker entry and then uses the exact-token double gate.

### D20 — Token Hunter uses age, volume, and safety evidence without inventing liquidity

Token Hunter uses OpenSea's trending-token endpoint followed by bounded token-detail
lookups. A call reads one page of at most 100 summaries and at most 20 details. Candidate
age comes from `genesis_date`, falling back to OpenSea `created_at`; 24-hour USD volume
is the activity threshold; and only an exact OpenSea `OK` status qualifies. The engine
reports that earliest known activity is not guaranteed deployment time and that volume
is not pool liquidity. It does not request swap quotes or produce transactions.

V3 token 4 / agent 9123 has immutable skill index 3 and is the exact production canary.
Its flag remains independent from Mint Scanner, Arbitrageur, and the unavailable Tracker
canary.

### D21 — Trend Reader preserves provider rank and exact interval evidence

Trend Reader uses one OpenSea trending-collections request followed by at most 10
collection-stat requests. Inputs are one supported chain, `1h`/`24h`/`7d`, one optional
documented category, and a maximum of 10 results. Output preserves provider rank and
attaches total and exact matching interval statistics. A missing interval remains null;
Census does not infer it from another window or claim an independent momentum score.

No current v3 token has skill index 4, so the engine deploys inactive. The archived v2
`night-ledger` identity is not promoted back into the active canary set merely to fill
the gap. Activation waits for a naturally assigned current-v3 entry.

### D22 — Report-only flags may all be open while exact-token gates remain mandatory

Fraud Detector completes the six report-only engines using bounded OpenSea collection
metadata/stats or one public account profile. It surfaces provider labels and facts but
does not calculate a fraud score, infer fraud from non-verification, or accuse a target.

At the owner's direction all six report-only feature flags are enabled in production.
The second gate remains an exact allowlist containing current v3 tokens 1–5; immutable
onchain skill assignment determines which engine each token can invoke. Missing skill
types do not become callable, and future tokens are not automatically trusted. Executor
is not a report-only engine and remains unimplemented and disabled.

## Active Sepolia record

- Census: `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- minting: irreversibly open
- rollout token/agent: `1 / 9119` (`threshold-keeper`)
- rollout transaction:
  `0xe6f91c84898e30ae0c23d6533ad3f5b79cc7f28c39c4b3844f49ecb443fc7d90`
- first v3 batch: tokens `2–5`, agents `9121–9124`, transaction
  `0x8117fb3679291b0f8a3e14d03e385059cfaf57971ab195702354f894538ace45`

The archived v1 address is `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`; its
token/agent `1 / 9100` remains available through the permanent address-routed host.

Gas figures in project documents are Foundry mock comparisons: about 710k per separate
mint and 429k per entry in a four-entry batch, a 40% saving. They are not live adapter
estimates.

## Collection constants retained

- supply 10,000
- maximum five mints per address
- free mint apart from gas
- one capped skill per token
- immutable onchain artwork
- 40×40, one bit, 200 bitmap bytes
- exact skill quotas: 3000, 3000, 1500, 1000, 700, 500, 300

## Rejected for the mint-core deployment

- automatic ABI upgrades after upstream drift
- mutable canonical host
- admin pause after launch
- a placeholder deployment host
- creating or funding a separate agent wallet before the Phase 2 custody and spending
  model passes Sepolia tests
- treating identity registration as a claim that runtime services are active
- automatic migration of legacy output filenames to token IDs
- owner mutation of skill, class, or visual traits
- normal CLI reroll

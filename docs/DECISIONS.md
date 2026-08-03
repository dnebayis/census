# Census decision log

These decisions define the hardened mint-core release. Reopen one only when new
evidence changes its premise.

## Locked

### D1 — Standards are snapshots, not floating dependencies

ERC-8004, ERC-8048, and ERC-8217 are locked to the upstream commits in
`standards-lock.md`. Weekly CI reports drift but never edits an ABI or deployment.

### D2 — Runtime is permanently report-only

RESTAP, MCP, and all seven skill runtimes are a separate shared service rather than
part of minting. Open ERC-8257 tools are registered on the Census Sepolia registry;
OpenSea discovery waits for upstream Sepolia indexing. Transaction execution and payment
protocols are permanently outside the Census runtime design.

### D3 — One-transaction identity binding

Census mints temporarily to itself, calls the controller-gated ERC-8217 adapter, then
transfers to the minter. There is no activation transaction. This creates two ERC-721
`Transfer` events and is required by the real adapter.

### D4 — Immutable canonical host and one-way initial launch

The Vercel production project URL is constructor state. It must be HTTPS with no
trailing slash. Deployment starts closed. `openMinting()` is owner-only and one-way;
the initial closed state cannot be restored. D26 supersedes the original no-pause rule
for v6 by adding owner-only emergency pause/unpause for new mints; it never pauses
transfers or reads.

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

### D8 — Owner control without an agent wallet

ERC-8217 control follows NFT ownership. Census does not create a separate agent or
execution wallet. The owner can fully opt out of the shared host through adapter
`setAgentURI` and owner-writable endpoint metadata.

### D9 — Draft IDs and receipts are different identities

`draftId` identifies pre-mint work. Only decoded `EntryMinted` receipts establish actual
`tokenId` and `agentId`. Legacy numbered output files remain artifacts and are never
silently treated as minted tokens.

### D10 — Exact simulation is mandatory

The sender is derived from an encrypted Cast keystore; `PRIVATE_KEY` is a legacy
environment-only fallback. Neither form is logged or written to an artifact. The exact
single or batch transaction is simulated with the same sender before broadcast. Chain
failures stop; visual warnings are informational.

### D11 — Registration is truthful and read-only

The service reads live chain state, confirms adapter binding, uses the onchain SVG and
current context, and returns inactive discovery-only `registration-v1` JSON. Errors use
`no-store`; missing tokens and successful active-v6 responses use bounded caches. It
contains no transaction runtime.

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
bottom and both sides. Threshold 128 is the reproducible baseline conversion; D25
defines the implemented draft-local exception for a dense source. Every selected result is
a 200-byte MSB-first bitmap. The onchain renderer uses only charcoal `#34343A` and warm
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

OpenSea is the direct read-only market source for Arbitrageur. ERC-8257 discovery is
registered independently on Sepolia, which OpenSea does not currently index. The
runtime uses active listing and best-offer REST endpoints rather than wallet/trading SDK
methods or a long-lived Stream socket.
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

Tracker cannot be attached to a token with another skill. Draft seeds and trait indices
are never rerolled or selected to force one. V6 token 5 is the naturally assigned active
Tracker entry.

### D20 — Token Hunter uses age, volume, and safety evidence without inventing liquidity

Token Hunter uses OpenSea's trending-token endpoint followed by bounded token-detail
lookups. A call reads one page of at most 100 summaries and at most 20 details. Candidate
age comes from `genesis_date`, falling back to OpenSea `created_at`; 24-hour USD volume
is the activity threshold; and only an exact OpenSea `OK` status qualifies. The engine
reports that earliest known activity is not guaranteed deployment time and that volume
is not pool liquidity. It does not request swap quotes or produce transactions.

V3 token 4 / agent 9123 has immutable skill index 3 and is the verified production
example. Its flag remains independent from Mint Scanner, Arbitrageur, and Tracker.

### D21 — Trend Reader preserves provider rank and exact interval evidence

Trend Reader uses one OpenSea trending-collections request followed by at most 10
collection-stat requests. Inputs are one supported chain, `1h`/`24h`/`7d`, one optional
documented category, and a maximum of 10 results. Output preserves provider rank and
attaches total and exact matching interval statistics. A missing interval remains null;
Census does not infer it from another window or claim an independent momentum score.

No current v6 token has skill index 4, so the engine is unreachable through the active
collection. The archived v2 `night-ledger` identity is not promoted into the active
canary set merely to fill the gap. Activation waits for a naturally assigned v6 entry.

### D22 — Report-only access is collection-scoped

Fraud Detector completes the six market-data report engines using bounded OpenSea collection
metadata/stats or one public account profile. It surfaces provider labels and facts but
does not calculate a fraud score, infer fraud from non-verification, or accuse a target.

At the owner's direction all seven report-only feature flags are enabled in production.
Access is restricted to `ACTIVE_CENSUS_ADDRESS`; the adapter binding and immutable
onchain skill assignment determine which engine each token can invoke. Future matching
tokens from the active contract work without manual allowlist maintenance, while
archived or unrelated deployments remain blocked.

### D23 — Executor is retired; Advisor is permanently report-only

The archived v3 contract's seventh immutable skill was named Executor. It is not
implemented and must never be treated as an authorization surface. V4 replaces it with
Advisor while preserving the 300-entry quota. V4 also preserved the old skill-derived
Skull label; D24 retires that unrelated visual mapping. Advisor accepts a goal,
bounded HTTPS evidence links, constraints, and a risk preference; it returns suggestions,
limitations, and the same links. Every runtime result is marked `reportOnly: true` and
`transactionCapability: "none"`. Census never builds calldata, approvals, signature
requests, trades, transfers, or contract calls.

### D24 — Visual class follows Species, never skill

`skill` describes what an entry can report; it is unrelated to portrait anatomy.
`class` is deterministically derived from the immutable Species trait: human variants
map to `Human`, android maps to `Agent`, skull-faced maps to `Skull`, and every other
non-human species maps to `Alien`. `classOf`, ERC-8048 `class` metadata, and tokenURI all
read that same stored Species byte. V4 is archived because it derived class from skill,
which labelled visually human tokens as Skull.

### D25 — Density correction is draft-local

The default crop, palette, threshold 128, and onchain 1%–95% hard band remain collection
constants. One dense portrait does not justify changing every normal portrait. The
implemented calibration first renders the default bitmap, leaves results at or below
45% unchanged, and creates lighter candidates only for that draft. Selection must preserve recognizable
facial and primary-trait shapes, and the chosen threshold and candidate statistics must
be persisted. Token 2 is immutable and remains a testnet regression fixture. This
pipeline change requires no Census redeployment.

### D26 — V6 is a 5K collection with emergency mint pause and optional royalty

V6 is a new Sepolia deployment rather than an upgrade. Supply is 5,000, wallet and
batch caps are five, and skill quotas are `[1500,1500,750,500,350,250,150]`. The owner
may pause and unpause only new mints; transfers and all reads remain available. Exact
bitmap hashes are globally reserved onchain in addition to coarse signatures, while
the official pipeline adds source-hash and 24-pixel near-copy protection.

ERC-2981 reports 500 bps to the immutable deployer receiver. Census does not restrict
transfers or promise marketplace enforcement. A central validator and two-phase trait
reservation remain rejected, so direct valid trait selection and targeted bitmap edits
are documented boundaries.

Species expands to twelve weighted values and the nine-category layout remains bytes9.
User-facing flow hides Species, seed, threshold, RPC and ABI choices. The user's role
and identity control the subject while assigned Species controls anatomy.

### D27 — One-eye and aquatic assignments are retired; preview approval is mandatory

The first v6 batch showed that Single Large Eye becomes unreadable and Aquatic Humanoid
can produce fin-like silhouettes at 40×40. Their immutable contract indices cannot be
removed from deployed v6 or edited on existing tokens. The official pipeline therefore
assigns zero weight to Aquatic Humanoid, One Eye Scarred Shut, Single Large Eye and
Eyepatch, and refuses an old unminted draft containing them.

Every future mint must be bound to a palette-exact PNG that was displayed to the user.
The bitmap-hash review records Species match, readability, complete top framing and
explicit approval. At least one extra blank row is required after the four reserved top
rows. Direct contract calls remain outside this pipeline guarantee; absolute vocabulary
removal would require a new deployment.

### D28 — Production-only public documentation and explicit v7 gate

The permanent registration origin serves only production project/API information and
the official agent-workflow link. It does not publish development-host instructions or
a hosted signing endpoint. Deployments continue directly to the two existing production
projects.

V7 is not assumed. It is justified only if Aquatic Humanoid and one-eye indices must be
invalid even for direct contract callers. Pipeline retirement, frontend copy, RPC
rotation and art improvements do not independently require a new contract.

### D29 — v7 retires the unreadable indices at the contract level

The v6 contract accepts every in-range trait index, so a direct caller could still mint
Aquatic Humanoid (Species 8) or the one-eye Eyes values 4, 8 and 11 that the official
pipeline refuses. v7 closes that gap in the contract itself: `TraitData.retired` flags
Species 8 and Eyes {4, 8, 11}, `mint`/`mintBatch` revert `RetiredTraits`, and both
`validate` views return the new `ERR_RETIRED` (13). The trait string decoders are
untouched, so any existing token that already carries those indices still renders.

v7 is deployed on Sepolia at `0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`
(tx `0xffc9f0a71a6b13219b7dff5867d83ed06639f2c4b0e346f74670e8bd8af1137e`, block 11411049),
closed at deploy per D4. The archived v6 `0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab` is
immutable and unchanged — it still accepts the historical indices. Pipeline
`RETIRED_ASSIGNMENTS` already covers the same set, so the offchain flow and the v7
contract agree.

## Active Sepolia record

- Census v7: `0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- supply: 5,000; wallet/batch cap: 5
- retired at contract level: Species 8, Eyes {4, 8, 11} → `RetiredTraits` / `ERR_RETIRED`
- royalty: ERC-2981, 500 bps, no transfer enforcement
- deploy transaction:
  `0xffc9f0a71a6b13219b7dff5867d83ed06639f2c4b0e346f74670e8bd8af1137e` (block 11411049)

Archived v6 is `0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab`; tokens 1–5 / agents
9256–9260 remain immutable and its minting stays irreversibly open. Archived v5 is
`0x5863E1d0539c659204B097359AC1a75C51144E78`; tokens 1–2 / agents 9247–9248 remain
preserved. Earlier v4 and older addresses are retained in config.

The archived v1 address is `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`; its
token/agent `1 / 9100` remains available through the permanent address-routed host.

Gas figures in project documents are 3 August 2026 Foundry mock comparisons: about 739k
per separate mint and 454k per entry in a four-entry batch, a 39% saving. They are not
live adapter estimates.

## V6 collection constants

- supply 5,000
- maximum five mints per address
- maximum five entries per batch
- free mint apart from gas
- one capped skill per token
- immutable onchain artwork
- 40×40, one bit, 200 bitmap bytes
- exact skill quotas: 1500, 1500, 750, 500, 350, 250, 150
- exact hash and coarse-signature duplicate rejection
- owner-only emergency pause for new minting
- ERC-2981 5% royalty signalling

## Rejected for the mint-core deployment

- automatic ABI upgrades after upstream drift
- mutable canonical host
- pausing transfers or metadata reads
- a placeholder deployment host
- creating or funding a separate agent wallet
- treating identity registration as a claim that runtime services are active
- automatic migration of legacy output filenames to token IDs
- owner mutation of skill, class, or visual traits
- normal CLI reroll

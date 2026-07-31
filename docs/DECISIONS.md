# Census decision log

These decisions define the hardened mint-core release. Reopen one only when new
evidence changes its premise.

## Locked

### D1 — Standards are snapshots, not floating dependencies

ERC-8004, ERC-8048, and ERC-8217 are locked to the upstream commits in
`standards-lock.md`. Weekly CI reports drift but never edits an ABI or deployment.

### D2 — Runtime standards are deferred

ERC-8257, RESTAP, MCP, x402, the seven skill runtimes, and Executor authorization are
not required for an NFT to be born as an ERC-8004 agent. They are removed from v1 code
and reconsidered only when real runtime manifests and authorization rules exist.

### D3 — One-transaction identity binding

Census mints temporarily to itself, calls the controller-gated ERC-8217 adapter, then
transfers to the minter. There is no activation transaction. This creates two ERC-721
`Transfer` events and is required by the real adapter.

### D4 — Immutable canonical host and one-way launch

The Vercel production project URL is constructor state. It must be HTTPS with no
trailing slash. Deployment starts closed. `openMinting()` is owner-only and one-way;
there is no admin pause or close power.

### D5 — One 409-byte immutable art record

The first 400 bytes are the two-bit bitmap; the final nine bytes are trait indices in
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

### D8 — The NFT owner is the controller and recipient

No separate agent wallet is created. ERC-8217 control follows NFT ownership. Future
runtime revenue is intended for the current NFT owner. The owner can fully opt out of
the shared registration host through adapter `setAgentURI`.

### D9 — Draft IDs and receipts are different identities

`draftId` identifies local work. Only decoded `EntryMinted` receipts establish actual
`tokenId` and `agentId`. Legacy numbered output files remain artifacts and are never
silently treated as minted tokens.

### D10 — Exact simulation is mandatory

The sender is derived locally from `PRIVATE_KEY`, never logged as a key or written to a
file. The exact single or batch transaction is simulated with the same sender before
broadcast. Hard failures stop. Advisory warnings require `--accept-warnings`.

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

## Active Sepolia record

- Census: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`
- canonical host: `https://census-registration.vercel.app`
- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- minting: irreversibly open
- rollout token/agent: `1 / 9100`

Gas figures in project documents are Foundry mock comparisons: about 829k per separate
mint and 458k per entry in a four-entry batch. They are not live adapter estimates.

## Collection constants retained

- supply 10,000
- maximum five mints per address
- free mint apart from gas
- one capped skill per token
- immutable onchain artwork
- 40×40, four tones, 400 bitmap bytes
- exact skill quotas: 3000, 3000, 1500, 1000, 700, 500, 300

## Rejected for this phase

- automatic ABI upgrades after upstream drift
- mutable canonical host
- admin pause after launch
- a placeholder deployment host
- a separate agent wallet
- treating identity registration as a claim that runtime services are active
- automatic migration of legacy output filenames to token IDs
- owner mutation of skill, class, or visual traits
- normal CLI reroll

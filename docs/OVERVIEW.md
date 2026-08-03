# Census overview

Census records 10,000 faces and what each one does. A token contains a 40×40 one-bit
portrait, one onchain-assigned skill, a class derived from its immutable Species trait,
nine pipeline-assigned visual traits, and an ERC-8004 identity.

Active Sepolia Census v5 is `0x5863E1d0539c659204B097359AC1a75C51144E78`.
Registration is served from `https://census-registration-dnebayis.vercel.app`; adapter and
Identity Registry are `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` and
`0x8004a818bfb912233c491871b3d84c89a494bd9e`. Permissionless minting is irreversibly
open. V5 tokens 1–2 / agents 9247–9248 have skills Arbitrageur and Mint Scanner; both
have immutable Species-derived Alien class. Archived v4 tokens 1–3 / agents 9244–9246
retain skills Advisor, Advisor, and Tracker, but their skill-derived class labels are historical.
Archived v3 tokens 1–5 and v2 tokens 1–4 remain
available through the same address-routed registration project.

## What exists in this phase

Minting is the product boundary:

1. A draft receives a secure persistent seed and nine visual traits.
2. An IDE agent generates a raster portrait from those locked traits, or the user
   supplies a PNG, JPEG, or WebP.
3. The pipeline shows the exact one-bit 40×40 preview and informational art metrics.
   Only effectively blank or solid output must be replaced. Duplicate, wallet, trait,
   and exact transaction checks remain automatic.
4. Census writes a single 209-byte immutable art record, draws a capped skill, registers
   an ERC-8004 identity, and transfers the NFT to the minter in one transaction.
5. A read-only service publishes the current ERC-8004 registration JSON.

The shipped `census-mint` skill orchestrates this loop. Procedural Python/SVG deployment
smoke art is deliberately outside the production path.

Portrait prompts use only Census-owned visual rules, not the names of unrelated
collections. A dense portrait is corrected at the individual draft level; global
threshold and contract changes are intentionally avoided. The ordered implementation
work is recorded in `NEXT-STEPS.md`.

The registration JSON starts with `active: false`, empty `services`, and empty
`supportedTrust`. Its ERC-8004-required `x402Support` compatibility field is always
`false`; Census implements no payment protocol. An identity is not evidence that a
runtime exists.

## Ownership and identity

The current NFT owner controls the adapter-bound agent identity. Ownership transfer
therefore transfers control. Census and its shared runtime create no wallet and never
build, sign, or submit transactions.

An owner who wants to stop using the shared registration service can call the adapter's
`setAgentURI` and point the identity to another valid registration file.

## Immutable and mutable data

Immutable:

- 200-byte one-bit bitmap
- nine trait indices and vocabulary interpretation
- capped functional skill and Species-derived visual class
- canonical registration host
- ERC-8004 binding

Owner-writable:

- `context`
- any other ERC-8048 metadata key except `skill`, `class`, and `trait[...]`
- the adapter-level `agentURI`, which provides full opt-out

## Runtime phase

All seven skill names are bounded report-only services on the shared RESTAP/MCP runtime
and are registered as open ERC-8257 tools on the Census Sepolia registry. `Advisor`
returns cautious suggestions and source links from supplied evidence. OpenSea search
does not currently index Sepolia. No skill has an execution path.

# Census overview

Census records 10,000 faces and what each one does. A token contains a 40×40 one-bit
portrait, one onchain-assigned skill and class, nine pipeline-assigned visual traits,
and an ERC-8004 identity.

Active Sepolia Census is `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`.
Registration is served from `https://census-registration-dnebayis.vercel.app`; adapter and
Identity Registry are `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` and
`0x8004a818bfb912233c491871b3d84c89a494bd9e`. Permissionless minting is irreversibly
open. Its v3 entries are tokens 1–5 / ERC-8004 agents 9119 and 9121–9124; archived v2 tokens 1–4 remain
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

The registration JSON starts with `active: false`, empty `services`, and empty
`supportedTrust`. Its ERC-8004-required `x402Support` compatibility field is always
`false`; Census implements no payment protocol. An identity is not evidence that a
runtime exists.

## Ownership and identity

The current NFT owner controls the adapter-bound agent identity. Ownership transfer
therefore transfers control. Census v3 and its shared runtime create no wallet.

An owner who wants to stop using the shared registration service can call the adapter's
`setAgentURI` and point the identity to another valid registration file.

## Immutable and mutable data

Immutable:

- 200-byte one-bit bitmap
- nine trait indices and vocabulary interpretation
- skill and class
- canonical registration host
- ERC-8004 binding

Owner-writable:

- `context`
- any other ERC-8048 metadata key except `skill`, `class`, and `trait[...]`
- the adapter-level `agentURI`, which provides full opt-out

## Runtime phase

The first six skill names are bounded report-only services on the shared RESTAP/MCP
runtime. ERC-8257 discovery remains future work. Executor ships last and requires
separate explicit authorization; implementation follows `RUNTIME-PLAN.md`.

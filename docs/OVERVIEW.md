# Census overview

Census records 10,000 faces and what each one does. A token contains a 40×40 one-bit
portrait, one onchain-assigned skill and class, nine pipeline-assigned visual traits,
and an ERC-8004 identity.

Active Sepolia Census is `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`.
Registration is served from `https://census-registration-v2.vercel.app`; adapter and
Identity Registry are `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` and
`0x8004a818bfb912233c491871b3d84c89a494bd9e`. Permissionless minting is irreversibly
open. Genesis token 1 is ERC-8004 agent 9104.

## What exists in this phase

Minting is the product boundary:

1. A draft receives a secure persistent seed and nine visual traits.
2. An image-capable IDE agent generates a raster portrait from those locked traits.
3. The agent inspects the source and exact one-bit 40×40 preview, redraws structural
   failures or materially unreadable art, and reviews advisory metrics once. The
   pipeline checks duplicates, wallet allowance, and exact transaction behavior.
4. Census writes a single 209-byte immutable art record, draws a capped skill, registers
   an ERC-8004 identity, and transfers the NFT to the minter in one transaction.
5. A read-only service publishes the current ERC-8004 registration JSON.

The shipped `census-mint` skill orchestrates this loop. Procedural Python/SVG deployment
smoke art is deliberately outside the production path.

The registration JSON starts with `active: false`, `x402Support: false`, empty
`services`, and empty `supportedTrust`. This is deliberate: an identity is not evidence
that a runtime exists.

## Ownership and identity

The current NFT owner controls the adapter-bound agent identity. Ownership transfer
therefore transfers control. Census creates no separate agent wallet. If a future
runtime earns revenue, the current NFT owner is the intended recipient.

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

## Deferred systems

The seven skill names and quotas remain collection taxonomy, but their runtimes do not
exist in this phase. RESTAP, MCP, x402, Executor permissions, ERC-8257 tool registration,
frontend work, reputation UX, and separate wallets require their own design and threat
model before activation.

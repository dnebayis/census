# Census overview

Census records 10,000 faces and what each one does. A token contains a 40×40 four-tone
portrait, one onchain-assigned skill and class, nine pipeline-assigned visual traits,
and an ERC-8004 identity.

Active Sepolia Census is `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`.
Registration is served from `https://census-registration.vercel.app`; adapter and
Identity Registry are `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` and
`0x8004a818bfb912233c491871b3d84c89a494bd9e`. Minting is open.

## What exists in this phase

Minting is the product boundary:

1. A draft receives a secure persistent seed and nine visual traits.
2. An agent draws the portrait; the pipeline reduces it to a 400-byte bitmap.
3. The pipeline checks quality, duplicates, wallet allowance, and exact transaction
   behavior.
4. Census writes a single 409-byte immutable art record, draws a capped skill, registers
   an ERC-8004 identity, and transfers the NFT to the minter in one transaction.
5. A read-only service publishes the current ERC-8004 registration JSON.

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

- 400-byte bitmap
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

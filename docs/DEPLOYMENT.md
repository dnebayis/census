# Sepolia deployment record

## Active v2

- Census: `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`
- deploy transaction:
  `0x45187c39f56701180f0a72fe9617bc91050cb5d13d87fb27d6de16cbe43f5c74`
- source verification: Sourcify exact match, job
  `b5f65814-e0ba-44f1-be18-b2168c733bcd`
- canonical host: `https://census-registration-v2.vercel.app`
- Vercel preview deployment: `dpl_DCPJYQ5LAE7u99M3F8U2UfSc9oqQ`
- Vercel production deployment: `dpl_CMrqGWAX6BSP6Fv71ivnXTxShu2v`
- mint status: closed; no `openMinting()` transaction has been sent
- bitmap/art record: 200-byte one-bit bitmap / 209-byte SSTORE2 record
- palette: `#34343A` foreground / `#E9DDC7` background

## Pending launch gate

- no v2 token or agent ID exists yet
- production service is configured against v2 and returns 404 for missing tokens
- minting remains closed until the reviewed first entry can be minted, its binding and
  registration URI verified, and the one-way launch explicitly approved

## Fixed dependencies

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`

## Archived v1 and prototype

V1 Census `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4` remains historical
with token 1 / ERC-8004 agent 9100 at `https://census-registration.vercel.app`. Its
deployment, open-mint, and rollout transactions remain in Git history.

Prototype Census `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` is historical. Neither
archived address may be used by the active pipeline.

# Census

Census is a capped collection of 10,000 fully-onchain 40×40 portraits. Every token is
created together with an ERC-8004 identity through the ERC-8217 adapter. The portrait,
skill, class, and nine trait indices are immutable.

This repository currently delivers the hardened mint core and a read-only ERC-8004
registration service. RESTAP, MCP, x402, the seven skill runtimes, Executor
authorization, ERC-8257, a frontend, and a separate agent wallet are intentionally
outside this phase.

## Deployment status

| Component | Sepolia |
|---|---|
| Census v3 | [`0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`](https://sepolia.etherscan.io/address/0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc) — mint open |
| Registration | [`https://census-registration-dnebayis.vercel.app`](https://census-registration-dnebayis.vercel.app) — permanent single project |
| ERC-8217 adapter | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| ERC-8004 Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |
| Archived v2 | [`0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`](https://sepolia.etherscan.io/address/0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC) — tokens 1–4 preserved |
| Archived v1 | [`0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`](https://sepolia.etherscan.io/address/0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4) — original endpoint preserved |
| Archived prototype | [`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`](https://sepolia.etherscan.io/address/0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5) |

V3 permissionless minting is irreversibly open and currently has no minted entries.
Archived v2 genesis draft `genesis-registrar`
minted token 1 and ERC-8004 agent 9104; its live registration is
[`/a/<contract>/1/registration.json`](https://census-registration-dnebayis.vercel.app/a/0x3763feca935668e1ffc191f3c509f3a545b3acbc/1/registration.json).
The first production batch minted `night-ledger`, `signal-auditor`, and
`archive-courier` as tokens 2–4 / agents 9106–9108 in transaction
[`0x7db94f…b3428`](https://sepolia.etherscan.io/tx/0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428).
V1 rollout entry 1 remains bound to ERC-8004 agent 9100 at its original host. Archived
deployments are historical only; scripts and examples must not use them as active
addresses.

Production art remains agent-native by default, while any PNG, JPEG, or WebP upload is
also accepted. [`census-mint`](skills/census-mint/SKILL.md) generates the one-bit 40×40
result and reports visual statistics without forcing iterative redraws. Procedural
Python/SVG smoke art is not a production input.

The approved v2 visual fixture is
[the 40×40 one-bit preview](docs/assets/census-v2-1bit-preview-v2.png), with its
[source comparison](docs/assets/census-v2-source-vs-1bit-v2.png). It records the locked
four-pixel top margin and 28.2% example density; it is a quality fixture, not a minted
entry.

## Mint invariants

- Deployment starts with minting closed. The owner can call `openMinting()` exactly
  once; there is no pause or close function.
- `canonicalHost` is fixed at construction, must start with `https://`, and cannot end
  in `/`.
- Every identity URI is
  `https://<canonicalHost>/a/<censusAddress>/<tokenId>/registration.json`. The contract
  address namespace lets every deployment share one permanent registration project.
- Only effectively blank or solid bitmaps are rejected (below 1% or above 95%
  foreground). Composition warnings never block minting.
- One SSTORE2 record contains 200 bitmap bytes followed by nine trait-index bytes.
- `bitmapOf` exposes only the bitmap. `traitsOf` and `traitOf` read the suffix.
- `skill`, `class`, and every `trait[...]` key are immutable. The current NFT owner can
  write other ERC-8048 keys.
- Agent control and the economic recipient are the current NFT owner. Census does not
  create a separate agent wallet.

## Development

```sh
forge fmt --check
forge test -vv
python3 -m unittest -v pipeline/test_pipeline.py
cd registration-service && npm ci && npm test && npm audit --audit-level=high
```

The current local Foundry mock measurement is about 710k gas per separate mint and 429k
per entry for a four-entry batch, a 40% saving. A single measured mint is about 781k.
These numbers include the mock
adapter and are comparison figures, not a prediction of production transaction cost.

## Documents

- [Technical specification](docs/SPEC.md)
- [Locked decisions](docs/DECISIONS.md)
- [Plain-language overview](docs/OVERVIEW.md)
- [Standards lock](docs/standards-lock.md)
- [Sepolia deployment record](docs/DEPLOYMENT.md)
- [Pipeline guide](pipeline/README.md)
- [Agent-native mint skill](skills/census-mint/SKILL.md)
- [Handoff](HANDOFF.md)

# Census

Census is a capped collection of 10,000 fully-onchain 40×40 portraits. Every token is
created together with an ERC-8004 identity through the ERC-8217 adapter. The portrait,
skill, class, and nine trait indices are immutable.

This repository delivers the hardened mint core, a read-only ERC-8004 registration
service, bounded report-only runtime skills over RESTAP and MCP, and seven open ERC-8257
tool registrations on Sepolia. Every skill is read-only and limited to observations,
suggestions, evidence, and links; see
[`docs/RUNTIME-PLAN.md`](docs/RUNTIME-PLAN.md).

## Deployment status

| Component | Sepolia |
|---|---|
| Census v4 | [`0x629B4534D07F1E35a70a403f4521Cd95f34eb030`](https://sepolia.etherscan.io/address/0x629B4534D07F1E35a70a403f4521Cd95f34eb030) — mint open, Advisor-only boundary |
| Registration | [`https://census-registration-dnebayis.vercel.app`](https://census-registration-dnebayis.vercel.app) — permanent single project |
| Runtime | [`https://census-runtime-dnebayis.vercel.app`](https://census-runtime-dnebayis.vercel.app) — collection-scoped report-only production runtime; not advertised by registration |
| ERC-8217 adapter | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| ERC-8004 Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |
| ERC-8257 Tool Registry | `0xd61aa597398a83122fce07a94beddb91fce8f42e` — Census Sepolia reference deployment |
| Archived v3 | [`0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`](https://sepolia.etherscan.io/address/0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc) — tokens 1–5 preserved; immutable Executor retired |
| Archived v2 | [`0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`](https://sepolia.etherscan.io/address/0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC) — tokens 1–4 preserved |
| Archived v1 | [`0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`](https://sepolia.etherscan.io/address/0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4) — agent 9100 preserved |
| Archived prototype | [`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`](https://sepolia.etherscan.io/address/0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5) |

V4 permissionless minting is irreversibly open. Its first batch minted
`v4-ember-librarian`, `v4-quiet-navigator`, and `v4-pastel-analyst` as tokens 1–3 /
agents 9244–9246 with skills Advisor, Advisor, and Tracker in transaction
[`0x8e3806…c27`](https://sepolia.etherscan.io/tx/0x8e38064c74e3a93f27aa315af1b221352411c03b711b8d73cec8be4989ba7c27).
The
archived v3 first production entry,
`threshold-keeper`, minted token 1 / ERC-8004 agent 9119 in transaction
[`0xe6f91c…c7d90`](https://sepolia.etherscan.io/tx/0xe6f91c84898e30ae0c23d6533ad3f5b79cc7f28c39c4b3844f49ecb443fc7d90).
Its live registration is
[`/a/<contract>/1/registration.json`](https://census-registration-dnebayis.vercel.app/a/0x1ada8e305f684b13419c51ea40a09a3c5e4760bc/1/registration.json).
The archived v3 batch minted `dawn-cartographer`, `quiet-machinist`, `memory-diver`, and
`pastel-sentinel` as tokens 2–5 / agents 9121–9124 in transaction
[`0x8117fb…ace45`](https://sepolia.etherscan.io/tx/0x8117fb3679291b0f8a3e14d03e385059cfaf57971ab195702354f894538ace45).
Archived v2 genesis draft `genesis-registrar`
minted token 1 and ERC-8004 agent 9104; its live registration is
[`/a/<contract>/1/registration.json`](https://census-registration-dnebayis.vercel.app/a/0x3763feca935668e1ffc191f3c509f3a545b3acbc/1/registration.json).
The first production batch minted `night-ledger`, `signal-auditor`, and
`archive-courier` as tokens 2–4 / agents 9106–9108 in transaction
[`0x7db94f…b3428`](https://sepolia.etherscan.io/tx/0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428).
V1 rollout entry 1 remains bound to ERC-8004 agent 9100 through the permanent host. Archived
deployments are historical only; scripts and examples must not use them as active
addresses.

Production art remains agent-native by default, while any PNG, JPEG, or WebP upload is
also accepted. [`census-mint`](skills/census-mint/SKILL.md) uses an aspect-preserving
40×36 cover crop on the 40×40 canvas so portrait sources are not squeezed and shoulders
can reach both side edges, then generates the one-bit 40×40
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
- Agent control belongs to the current NFT owner. Census does not create a wallet,
  build transactions, request signatures, or submit contract calls.

## Development

```sh
forge fmt --check
forge test -vv
python3 -m unittest -v pipeline/test_pipeline.py
cd registration-service && npm ci && npm test && npm audit --audit-level=high
cd ../runtime-service && npm ci && npm test && npm audit --audit-level=moderate
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
- [ERC-8257 discovery record](docs/ERC8257.md)
- [Pipeline guide](pipeline/README.md)
- [Agent-native mint skill](skills/census-mint/SKILL.md)
- [Handoff](HANDOFF.md)

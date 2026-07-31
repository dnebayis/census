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
| Census v1 | pending the production Vercel canonical host; mint remains closed |
| ERC-8217 adapter | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| ERC-8004 Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |
| Archived prototype | [`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`](https://sepolia.etherscan.io/address/0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5) |

The prototype is historical only. Scripts and examples must not use it as an active
address.

## Mint invariants

- Deployment starts with minting closed. The owner can call `openMinting()` exactly
  once; there is no pause or close function.
- `canonicalHost` is fixed at construction, must start with `https://`, and cannot end
  in `/`.
- Every identity URI is
  `https://<canonicalHost>/a/<tokenId>/registration.json`.
- One SSTORE2 record contains 400 bitmap bytes followed by nine trait-index bytes.
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

The current local Foundry mock measurement is about 829k gas for separate mints and
458k per entry for a four-entry batch, a 45% saving. These numbers include the mock
adapter and are comparison figures, not a prediction of production transaction cost.

## Documents

- [Technical specification](docs/SPEC.md)
- [Locked decisions](docs/DECISIONS.md)
- [Plain-language overview](docs/OVERVIEW.md)
- [Standards lock](docs/standards-lock.md)
- [Pipeline guide](pipeline/README.md)
- [Handoff](HANDOFF.md)

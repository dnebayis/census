# Census

A record of 10,000 faces and what each one does.

10,000 portraits stored entirely onchain as 40×40 bitmaps, where every entry **is** an agent — an ERC-8004 identity with one specialized skill, born registered in a single transaction, with no activation step.

Agents rent skills they lack from agents that have them, paid over x402. The fee goes to the owner, who sets the price. There is no frontend: you mint through your own Claude, and every agent exposes an MCP endpoint you can add to Claude directly.

The artwork is written once at mint and never changes. What moves is ownership, reputation, and price.

---

## Documents

| Document | For |
|---|---|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | What it is and how it works, in plain language |
| [docs/SPEC.md](docs/SPEC.md) | The technical build specification |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every locked decision, its reasoning, and what was rejected |
| [pipeline/README.md](pipeline/README.md) | The art pipeline — traits, drawing, binarizing |
| [pipeline/AGENTS.md](pipeline/AGENTS.md) | How an agent drives the pipeline |
| [HANDOFF.md](HANDOFF.md) | Cold-start prompt for a new agent picking the project up |

## Status

**Live on Sepolia.** Contract deployed and verified end to end against real infrastructure — five entries minted, each holding its own ERC-8004 identity, art rendering from contract storage. The art pipeline runs and its output has been minted.

| | |
|---|---|
| Census | [`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`](https://sepolia.etherscan.io/address/0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5) |
| adapter8004 | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| ERC-8004 Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |

Nothing on Sepolia is permanent; redeploy freely.

**Minting is free.** No mint price; the minter funds their own wallet and pays only gas. Capped at 5 per address.

One decision remains open — the production chain. See [SPEC.md §14.3](docs/SPEC.md#143-still-open).

## What gets built

| | Status |
|---|---|
| The art + mint contract | **done** — live on Sepolia, 41 tests |
| The art pipeline (`pipeline/`) | **done** — traits, LLM drawing, binarize, preflight |
| The shared RESTAP server | to build |
| Agent instructions (`pipeline/AGENTS.md`) | **done** |

Identity, reputation, discovery, payment, and marketplace infrastructure are not built — they already exist as published standards and live services. See [SPEC.md §2](docs/SPEC.md#2-architecture).

## Development

Foundry. Copy `.env.example` to `.env` and fill in `SEPOLIA_RPC_URL` and `ETHERSCAN_API_KEY`.

```shell
forge build
```

```shell
forge test -vv
```

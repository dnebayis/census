# Census handoff

Repository: `https://github.com/dnebayis/census`

## Current phase

The hardened mint core and read-only ERC-8004 registration API are live. The shared
RESTAP/MCP runtime exposes seven bounded report-only skills for the active collection.
OpenSea does not currently index Sepolia tool registries. The archived v3 Executor has
no implementation or authorization path; v4 and v5 replace it with report-only Advisor.

`runtime-service/` contains the inactive protocol shell: `llms.txt`,
address-routed RESTAP discovery, JSON `/talk`, passive `/news`, and MCP 2026-07-28
Streamable HTTP. Every entry read verifies current Census state and ERC-8217 binding.
Vercel assigned its first deployment to the stable
`https://census-runtime-dnebayis.vercel.app` alias; its report-only engines are active
for matching active-v5 skills but are not advertised in registration JSON. V5 token 1
is Arbitrageur and token 2 is Mint Scanner; both have Species-derived Alien class.
Archived v4 tokens 1 and 2 are Advisor entries and token 3 is Tracker. Its bounded news queue and
sliding-window limits use Redis. The official 30 MB free Redis resource
`census-runtime-free` is connected to production only; its real queue and distributed
rate-limit integration test passed. Access is scoped to the active v5 Census contract
at `https://census-runtime-dnebayis.vercel.app`.

The Vercel Git project is linked to `dnebayis/census`, production branch `main`, with
Root Directory fixed to `runtime-service`. Never deploy the monorepo root manually;
that bypasses the root boundary and can package unrelated local artifacts.

The backend supports both Upstash REST credentials and the official Vercel Redis
`REDIS_URL`. The 30 MB free plan is being used for the bounded production canary at
the owner's direction; its durability limits still prevent broader activation.

The Mint Scanner engine performs bounded, newest-first Sepolia ERC-721 mint-log
scans and emits ranked candidates with transaction/block evidence and explicit
limitations. A live read-only scan and the Redis-backed integration passed; it remains
available only to matching immutable-skill entries on the active v5 Census contract.

External production verification passed on 2 August 2026. Token 2 RESTAP discovery
returned its live agent 9121 binding and `canary.available: true`; `/talk` and the MCP
`mint-scanner` tool returned evidence-backed reports over Sepolia. Token 3 returned
`runtime_inactive` through both surfaces, a missing token returned 404, and MCP emitted
Redis-backed rate-limit headers. The runtime uses the public dRPC Sepolia endpoint;
registration remains `active: false` and does not advertise runtime services.

Arbitrageur is implemented as the second report-only engine. It uses the fixed OpenSea
API origin, a secret-managed instant key, at most 20 combined collection-slug or
`slug:tokenId` targets, same-currency raw-unit comparisons, and order/source evidence.
It never builds or submits a transaction and does not claim net profit. The instant key
expires after 30 days and must be rotated before 2026-09-02. Its independent skill
flag is enabled for the active v5 Census contract; registration remains
inactive and the engine has no transaction capability.

External production checks passed on 3 August 2026 for token 3: RESTAP discovery
returned agent 9122 with the Arbitrageur canary available, `/talk` returned an OpenSea
report, and MCP exposed and invoked only the `arbitrageur` tool. Same-currency and
two-sided-order requirements correctly produced non-qualified observations rather than
false opportunities.

Mainnet ETH and canonical WETH now form the only allowed cross-currency comparison.
The output marks `currencyConversion.required: true`, states the 1:1 basis, and excludes
wrapping gas from the gross spread. Other currencies and Sepolia assets still require
exact matching.

Tracker is implemented as the third report-only engine using bounded OpenSea account
events: at most 10 wallets, transfer/sale/mint filters, one 200-event page per wallet,
transaction/source evidence, and explicit cursor truncation. Its independent gate is
historically had no v3 token with skill index 2. Do not bind
it to token 4 (Token Hunter) or reroll draft traits to force a Tracker token.

Token Hunter was production-verified with archived v3 token 4 / agent 9123. It reads one
OpenSea trending page (maximum 100), filters by `genesis_date`/`created_at` and 24-hour
USD volume, and checks at most 20 token details for exact `status: OK`. It never calls
volume liquidity, never requests a swap quote, and has its own skill flag.

Trend Reader is implemented as the fifth report-only engine: one OpenSea trending page,
`1h`/`24h`/`7d`, an optional documented category, and at most 10 collection-stat calls.
It preserves OpenSea rank, attaches exact interval/total evidence, and leaves unavailable
intervals null. No archived v3 token had skill index 4;
the archived v2 `night-ledger` is not an active canary.

Fraud Detector completes the six market-data report engines. It uses one OpenSea profile call
for wallets or collection metadata plus stats for collections, reports provider flags
and missing evidence, and never assigns a fraud score or accusation. Advisor is the
seventh report-only engine and returns suggestions plus source links from supplied
evidence. Production has all seven report-only flags enabled for the active Census
contract. Immutable skills still
prevent absent Tracker, Trend Reader, or Fraud Detector tokens from calling those
engines; a future matching token works without an environment update. No skill builds,
signs, or submits transactions.

Report-only invocation is gated by `ACTIVE_CENSUS_ADDRESS`, the adapter binding,
immutable skill assignment, and its skill-specific flag. Archived v3 token 2 was the
verified Mint Scanner canary; it is blocked after the active address moved again to v5. Registration remains
inactive even while a production canary is exercised.

Read, in order:

1. `docs/standards-lock.md`
2. `docs/DECISIONS.md`
3. `docs/SPEC.md`
4. `pipeline/AGENTS.md`
5. `docs/RUNTIME-PLAN.md`

## Fixed infrastructure

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- Census Sepolia ERC-8257 Tool Registry:
  `0xd61aa597398a83122fce07a94beddb91fce8f42e`
- Active Census v5: `0x5863E1d0539c659204B097359AC1a75C51144E78`
- Archived v4: `0x629B4534D07F1E35a70a403f4521Cd95f34eb030`
- Archived v3: `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`
- Canonical registration origin: `https://census-registration-dnebayis.vercel.app`
- Archived v2: `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`
- Archived v1: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`
- Archived prototype: `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`

V5 minting is irreversibly open. Deploy transaction:
`0x06143fed9e41de4099ff34194bb50930040ff0402262b948fc753d0f672991a9`;
open-mint transaction:
`0x9e12c0bb5053f40a5a3d57f30cf8e5cafcff68b253bc0efeaef903133a479280`.
It uses the broad 1%–95% density band and derives class from Species. Its first batch
minted tokens 1–2 / agents 9247–9248 with skills Arbitrageur and Mint Scanner in
transaction `0x442d85b53862e66a6ec9b831a65aecd2f93d03c0ce0eb13834ee305019fd2318`.
Archived v4 minted tokens 1–3 / agents
9244–9246 with skills Advisor, Advisor, and Tracker in transaction
`0x8e38064c74e3a93f27aa315af1b221352411c03b711b8d73cec8be4989ba7c27`
at block `11406617`. All three production registration URLs returned HTTP 200 with
`no-store`; missing-token probes returned 404 and every adapter binding matched.

Archived v3 used open transaction
`0x6f004d10f293fe8f42a71b843509dac57619565b144ed961fe2f6d4b7281f094`.
Its first production entry is
`threshold-keeper`, token 1 / ERC-8004 agent 9119, minted in transaction
`0xe6f91c84898e30ae0c23d6533ad3f5b79cc7f28c39c4b3844f49ecb443fc7d90`
at block `11390845`. Its verified registration URI is
`https://census-registration-dnebayis.vercel.app/a/0x1ada8e305f684b13419c51ea40a09a3c5e4760bc/1/registration.json`.

The first v3 batch transaction is
`0x8117fb3679291b0f8a3e14d03e385059cfaf57971ab195702354f894538ace45`
at block `11390925`:

- `dawn-cartographer`: token 2 / agent 9121
- `quiet-machinist`: token 3 / agent 9122
- `memory-diver`: token 4 / agent 9123
- `pastel-sentinel`: token 5 / agent 9124

All four registration URLs returned HTTP 200 with `no-store`; each adapter binding and
Identity Registry URI matched.

Archived v2 genesis draft `genesis-registrar` is token 1 / ERC-8004 agent 9104; mint transaction:
`0x45d5308d1004940b6db4930b54b3e190b0bc5ca501b341ddb68c210e653527a4`.
Its verified registration URI is
`https://census-registration-dnebayis.vercel.app/a/0x3763feca935668e1ffc191f3c509f3a545b3acbc/1/registration.json`.
The first production batch transaction is
`0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428`
at block `11389367`:

- `night-ledger`: token 2 / agent 9106
- `signal-auditor`: token 3 / agent 9107
- `archive-courier`: token 4 / agent 9108

All three production registration URLs returned HTTP 200 with `no-store`; the missing
token probe returned 404, and each live adapter binding and Identity Registry URI
matched.
The archived v1 rollout token 1 remains ERC-8004 agent 9100 at
`https://census-registration-dnebayis.vercel.app/a/0x62514267a0f203e73b66c4f6fa1ed71a6db6bfa4/1/registration.json`.

Production creation now starts at `skills/census-mint/SKILL.md`. The IDE agent must use
real raster image generation and can inspect the source/comparison/palette preview.
Only effectively blank or solid output requires regeneration. Art metrics are
informational and never block minting; PNG/JPEG/WebP user uploads are also accepted.
Python/SVG smoke drawings are archive proof, not collection art.

## Safety-critical rollout order

The production-only rollout completed in this order:

1. Push the reviewed source and deploy the registration service to production.
2. Run its unit/schema/404/chain-read tests.
3. Obtain the stable public Vercel production project URL.
4. Deploy Census to Sepolia with that exact URL; it starts closed.
5. Set `ADAPTER_ADDRESS`, `IDENTITY_REGISTRY_ADDRESS`, `CHAIN_ID`, and
   `SEPOLIA_RPC_URL` in Vercel production and deploy the address-routed service.
6. Verify registration JSON and the Identity Registry `agentURI` are identical for a
   real token.
7. Only then call the irreversible `openMinting()`.

Future contract deployments reuse this one registration project. Their URIs include
the Census contract address, so token IDs cannot collide. Never deploy with a temporary
immutable host.

## Verification

```sh
forge test -vv
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  forge test --match-path test/SepoliaFork.t.sol -vv
python3 -m unittest -v pipeline/test_pipeline.py
cd registration-service
npm ci
npm test
npm audit --audit-level=high
cd ../runtime-service
npm ci
npm test
npm audit --audit-level=moderate
```

The fork test performs a real adapter registration on fork state, checks the
registration URI and binding, then transfers the NFT and verifies controller authority
follows ownership.

## Pipeline facts

`draftId` is the stable local identity. A secure seed and trait assignment are written
once to `<draftId>.draft.json`; reopening does not reroll. Build records source and
bitmap SHA-256 hashes, optional source provenance, and stats. Mint derives the sender from `PRIVATE_KEY`,
simulates the exact call, batches multiple drafts, and writes real receipt token/agent
IDs under `output/mints/`.

Files `output/7`, `8`, and `9` are legacy artifacts, not proof of minting and not
automatic token IDs.

`config/sepolia.json` is the machine-readable active deployment record.
`skills/census-mint/scripts/verify_registration.py` reproduces the external 200/404,
cache, live adapter binding, and Identity Registry URI checks.

Production registration deploys use the native Vercel GitHub connection from
`dnebayis/census` `main` to the permanent `census-registration-dnebayis` project. Its
Root Directory is `registration-service`; no duplicate GitHub Actions deployment is
used.

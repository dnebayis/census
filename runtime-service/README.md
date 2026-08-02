# Census shared runtime

This directory is the inactive Phase 2 protocol shell. It is deliberately separate
from `registration-service`; there is one permanent registration project and one
permanent runtime project at `https://census-runtime-dnebayis.vercel.app`.

Implemented surfaces:

- `GET /llms.txt`
- `GET /a/<censusAddress>/<tokenId>/.well-known/restap.json`
- `POST /a/<censusAddress>/<tokenId>/talk`
- `GET|POST /a/<censusAddress>/<tokenId>/news`
- Streamable HTTP MCP at `/mcp/<censusAddress>/<tokenId>`

Every per-entry request reads live Census state and verifies the ERC-8217 adapter
binding. `/talk` and MCP tool calls return `runtime_inactive`; no LLM, payment, wallet,
or external action runs. `/news` never invokes an LLM and never emits a reply. Its
The storage layer supports Upstash REST and standard Vercel Redis connections. Both use
an atomic bounded queue; distributed sliding-window limits protect `/talk`, `/news`, and
MCP. No production credentials are committed.

The first report-only engine, Mint Scanner, is implemented. It scans bounded
Sepolia block ranges for standard ERC-721 mint events, groups them by collection, and
returns transaction/block evidence plus explicit limitations. A local read-only report
can be run with `npm run scan:mint` after setting `SEPOLIA_RPC_URL`.

Arbitrageur is the second implemented report-only engine. It reads OpenSea active
listings and offers, compares only matching currencies in raw units, and emits
order-level evidence and marketplace attribution. Results are explicitly gross
observations: gas, fees, royalties, slippage, approvals, order races, and execution risk
are not simulated. Requests are limited to 20 combined OpenSea collection slugs or
`slug:tokenId` targets and the fixed `api.opensea.io` origin.

On Ethereum mainnet only, native ETH and canonical WETH are compared at their 1:1
wrapping relationship. A qualifying cross-currency result explicitly reports that
conversion is required and that wrapping gas is not included. No other token aliases or
testnet wrapped assets are normalized.

Unpaid public canary execution requires the skill-specific flag and an exact
`CANARY_AGENT_KEYS` match. The verified Mint Scanner canary is Census v3 token 2.
Arbitrageur token 3 is enabled as an independently gated production canary with a
secret-managed `OPENSEA_API_KEY`. Registration remains `active: false`; the engine is
report-only and cannot submit a transaction.

Tracker is the third implemented report-only engine. It reads the official OpenSea
account-events endpoint for at most 10 exact wallet addresses, a caller-supplied start
time, and transfer/sale/mint filters. Each wallet request is capped at one 200-event
page; a returned cursor is reported as `truncated` and is never followed automatically.
The engine emits direction, NFT details, transaction evidence, source URLs, and explicit
limitations. Its independent gate remains inactive because no current v3 token has the
Tracker skill trait. Census trait selection is never bypassed to manufacture a canary.

Token Hunter is the fourth implemented report-only engine and is assigned to v3 token
4 / agent 9123. It reads at most 100 OpenSea trending-token summaries, filters them by
earliest known activity and 24-hour USD volume, then checks at most 20 token-detail
records for an exact `OK` safety status. The API does not expose pool liquidity, so the
public input is deliberately named `minVolume24hUsd`; volume is never presented as
liquidity. Results contain age basis, momentum, volume, holder/verification fields,
OpenSea attribution, and explicit limitations. No swap quote or transaction is built.

Trend Reader is the fifth implemented report-only engine. It reads one OpenSea trending
collection page for `1h`, `24h`, or `7d`, optionally filters one documented category,
and attaches at most 10 collection-stat responses. It preserves OpenSea's rank, reports
the exact matching interval when available, leaves missing intervals null, and never
invents a Census momentum score. Its independent gate remains inactive because no
current v3 token has skill index 4; the archived v2 `night-ledger` is not reused as an
active canary.

Fraud Detector is the sixth and final report-only engine. A collection assessment reads
OpenSea collection metadata and stats; a wallet assessment reads one public OpenSea
profile. It reports provider enforcement, verification, safelist, NSFW, profile-age,
and self-declared-agent fields without assigning a fraud score or making an accusation.
Missing profiles and non-verification are explicitly insufficient evidence. No current
v3 token has skill index 5.

All six report-only feature flags are enabled in production. The exact allowlist contains
only current v3 tokens 1–5, so each existing token can execute only its immutable skill.
Tracker, Trend Reader, and Fraud Detector remain unreachable until an exact matching v3
token is minted and deliberately added. Executor is not implemented or enabled.

Required local environment:

- `RUNTIME_ORIGIN` — stable HTTPS origin, no trailing slash
- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `CHAIN_ID` (`11155111`)
- `OPENSEA_API_KEY` — required by OpenSea-backed report engines; instant keys expire
  after 30 days and require rotation
- `UNPAID_MINT_SCANNER_ENABLED` and `UNPAID_ARBITRAGEUR_ENABLED` — independent gates
- `UNPAID_TRACKER_ENABLED` — reserved independent gate; keep false until an exact
  Tracker-trait token exists and passes production checks
- `UNPAID_TOKEN_HUNTER_ENABLED` — independent exact-token gate for token 4
- `UNPAID_TREND_READER_ENABLED` — reserved independent gate; keep false until an exact
  current-v3 Trend Reader token exists
- `UNPAID_FRAUD_DETECTOR_ENABLED` — reserved independent gate for an exact matching token
- `CANARY_AGENT_KEYS` — exact lowercase `<censusAddress>:<tokenId>` allowlist
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the Vercel-provided
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases)
- alternatively, `REDIS_URL` from the official Vercel Redis integration

After Redis is connected, run the destructive-safe integration canary against a
throwaway namespaced key with `RUN_REDIS_INTEGRATION=1 npm test`. The test deletes its
key in a `finally` block.

Do not add runtime services to ERC-8004 registration JSON and do not set `active: true`
until storage and rate-limit integration tests, x402, skill execution, and external
canary checks pass.

Current deployment state: the stable production project is a narrow canary. The
official free Redis resource `census-runtime-free` is connected only to production,
the real queue and distributed limiter integration test passed, and Mint Scanner is
enabled only for exact v3 token 2 at
`https://census-runtime-dnebayis.vercel.app`. Registration remains inactive.

External production checks passed on 2 August 2026: token 2 discovery, `/talk`, MCP
initialize, MCP tool execution, and Redis rate-limit headers succeeded; token 3 stayed
inactive and a missing token returned 404. `SEPOLIA_RPC_URL` uses the public dRPC
Sepolia endpoint because Mint Scanner requires addressless ERC-721 `eth_getLogs`
queries, which some public providers reject.

Arbitrageur code, deterministic provider fixtures, and fail-closed checks pass. Its
production gate is limited to the exact token 3 agent key. Rotate the current OpenSea
instant key before 2026-09-02.

External production checks passed on 3 August 2026: token 3 RESTAP discovery returned
agent 9122 and `canary.available: true`; `/talk` returned a report-only OpenSea result;
MCP listed and invoked only the `arbitrageur` tool. A collection currency mismatch and
a token without both active sides remained observations, not opportunities.

The official 30 MB free plan is currently used for the bounded production canary at
the owner's direction. It does not provide the persistence guarantees required for
broader production activation.

# Census shared runtime

This directory contains the bounded report-only runtime. It is deliberately separate
from `registration-service`; there is one permanent registration project and one
permanent runtime project at `https://census-runtime-dnebayis.vercel.app`.

Implemented surfaces:

- `GET /llms.txt`
- `GET /a/<censusAddress>/<tokenId>/.well-known/restap.json`
- `POST /a/<censusAddress>/<tokenId>/talk`
- `GET|POST /a/<censusAddress>/<tokenId>/news`
- Streamable HTTP MCP at `/mcp/<censusAddress>/<tokenId>`
- `GET /.well-known/ai-tool/<skill-slug>.json`
- `POST /tools/<skill-slug>`

Every per-entry request reads live Census state and verifies the ERC-8217 adapter
binding. Disabled skills return `runtime_inactive`; no wallet or state-changing action
runs. `/news` never invokes an LLM and never emits a reply.
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

Public report execution requires the skill-specific flag and an
`ACTIVE_CENSUS_ADDRESS` match. The adapter binding and immutable onchain skill are read
before report generation, so current and future tokens from the active Census contract need no
manual token allowlist. Archived contracts remain blocked. Registration remains
`active: false`; these engines are report-only and cannot submit a transaction.

Tracker is the third implemented report-only engine. It reads the official OpenSea
account-events endpoint for at most 10 exact wallet addresses, a caller-supplied start
time, and transfer/sale/mint filters. Each wallet request is capped at one 200-event
page; a returned cursor is reported as `truncated` and is never followed automatically.
The engine emits direction, NFT details, transaction evidence, source URLs, and explicit
limitations. V6 token 5 / agent 9260 is the naturally assigned Tracker entry. Census
trait selection is never bypassed to manufacture a canary.

Token Hunter is the fourth implemented report-only engine and was verified with archived v3 token
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
invents a Census momentum score. No active v6 Trend Reader entry exists yet; the archived
v2 `night-ledger` is not reused as an
active canary.

Fraud Detector is the sixth market-data report engine. A collection assessment reads
OpenSea collection metadata and stats; a wallet assessment reads one public OpenSea
profile. It reports provider enforcement, verification, safelist, NSFW, profile-age,
and self-declared-agent fields without assigning a fraud score or making an accusation.
Missing profiles and non-verification are explicitly insufficient evidence. V6 token 1
/ agent 9256 is the naturally assigned Fraud Detector entry.

All seven report-only feature flags are enabled in production. Every valid token on the
active Census contract can invoke only its immutable report skill after the adapter binding
check. Tracker, Trend Reader, and Fraud Detector become reachable automatically when a
matching token is naturally minted. Advisor is the seventh report-only engine. It turns
user-supplied evidence into cautious suggestions and source links. No skill builds
calldata, approvals, signature requests, trades, transfers, or contract calls.

Required local environment:

- `RUNTIME_ORIGIN` — stable HTTPS origin, no trailing slash
- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `CHAIN_ID` (`11155111`)
- `OPENSEA_API_KEY` — required by OpenSea-backed report engines; instant keys expire
  after 30 days and require rotation
- `ACTIVE_CENSUS_ADDRESS` — the only collection allowed to use report-only engines
- `ERC8257_CREATOR_ADDRESS` — lowercase creator committed in all tool manifests
- `REPORT_MINT_SCANNER_ENABLED`, `REPORT_ARBITRAGEUR_ENABLED`,
  `REPORT_TRACKER_ENABLED`, `REPORT_TOKEN_HUNTER_ENABLED`,
  `REPORT_TREND_READER_ENABLED`, and `REPORT_FRAUD_DETECTOR_ENABLED` — independent
  per-skill gates
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the Vercel-provided
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases)
- alternatively, `REDIS_URL` from the official Vercel Redis integration

Seven ERC-8257 manifests are served from the runtime origin and registered as open tools
with IDs 1–7 on Sepolia registry
`0xd61aa597398a83122fce07a94beddb91fce8f42e`. Each invocation still requires a live
adapter-bound token whose immutable skill matches the tool slug. The manifests contain
no pricing or access block, and the registry entries use a zero predicate. OpenSea's
current canonical deployment list does not include Sepolia, so these records are not
claimed as OpenSea-indexed.

After Redis is connected, run the destructive-safe integration canary against a
throwaway namespaced key with `RUN_REDIS_INTEGRATION=1 npm test`. The test deletes its
key in a `finally` block.

Do not add runtime services to ERC-8004 registration JSON and do not set `active: true`
until storage, rate-limit, skill-execution, and external checks pass.

Current deployment state: the stable production project is a bounded report-only runtime. The
official free Redis resource `census-runtime-free` is connected only to production,
the real queue and distributed limiter integration test passed. The Vercel production
configuration is pinned to active v6 at
`https://census-runtime-dnebayis.vercel.app`. Registration remains inactive.

Historical v3 production checks passed on 2 August 2026: token 2 discovery, `/talk`, MCP
initialize, MCP tool execution, and Redis rate-limit headers succeeded; token 3 stayed
inactive and a missing token returned 404. `SEPOLIA_RPC_URL` uses the public dRPC
Sepolia endpoint because Mint Scanner requires addressless ERC-721 `eth_getLogs`
queries, which some public providers reject.

Arbitrageur code, deterministic provider fixtures, and fail-closed checks pass. Its
production gate is limited to agents with the matching immutable skill on the configured
active Census contract. The OpenSea key exposed in chat must be revoked immediately and
replaced only as a production secret.

Historical v3 production checks passed on 3 August 2026: token 3 RESTAP discovery returned
agent 9122 and `canary.available: true`; `/talk` returned a report-only OpenSea result;
MCP listed and invoked only the `arbitrageur` tool. A collection currency mismatch and
a token without both active sides remained observations, not opportunities.

The official 30 MB free plan is currently used for the bounded production canary at
the owner's direction. It does not provide the persistence guarantees required for
broader production activation.

Archived v5 token 1 / agent 9247 Arbitrageur and token 2 / agent 9248 Mint Scanner
passed production discovery, `/talk`, MCP, rate-limit, 404 and report-only checks on
3 August 2026. Active v6 naturally contains Fraud Detector (token 1), Arbitrageur
(tokens 2 and 4), Mint Scanner (token 3) and Tracker (token 5). V6 token 2 discovery and
token 3 Mint Scanner report execution are the production health canaries. Arbitrageur
market execution fails closed until the exposed OpenSea key is rotated; no new runtime
project is needed.

# Census report-only runtime

Production origin: `https://census-runtime-dnebayis.vercel.app`.

This service gives an adapter-bound Census token access to its immutable skill as a
bounded, read-only report. It never builds calldata, requests approvals or signatures,
trades, transfers assets, creates a wallet, or submits a transaction. X402 and payment
handling are absent.

## Production surfaces

- `GET /llms.txt`
- `GET /a/<censusAddress>/<tokenId>/.well-known/restap.json`
- `POST /a/<censusAddress>/<tokenId>/talk`
- `GET|POST /a/<censusAddress>/<tokenId>/news`
- Streamable HTTP MCP at `/mcp/<censusAddress>/<tokenId>`
- `GET /.well-known/ai-tool/<skill-slug>.json`
- `POST /tools/<skill-slug>`

Every token route reads current Census state, verifies the ERC-8217 adapter binding,
requires `ACTIVE_CENSUS_ADDRESS`, and checks the token's immutable skill. Archived or
unrelated contracts are rejected. Registration remains `active: false`; these discovery
surfaces do not claim transaction-capable agent operation.

## Engines

| Skill | Production data | Boundary |
| --- | --- | --- |
| Mint Scanner | bounded Sepolia ERC-721 mint logs | evidence only |
| Arbitrageur | bounded OpenSea listings and offers | gross comparison only; no order |
| Tracker | bounded OpenSea account events | no ownership or trading conclusion |
| Token Hunter | OpenSea trending-token and detail records | volume is not liquidity |
| Trend Reader | OpenSea collection rank and interval stats | no invented score |
| Fraud Detector | OpenSea collection/account labels | no fraud accusation or score |
| Advisor | user-supplied HTTPS evidence | suggestions and links only |

All seven production flags are enabled, but an engine is reachable only when a token on
the active Census contract naturally owns the matching skill. V6 token 1 is Fraud
Detector, tokens 2 and 4 are Arbitrageur, token 3 is Mint Scanner, and token 5 is
Tracker. No trait or skill is rerolled to manufacture a canary.

## Production configuration

- `RUNTIME_ORIGIN`
- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `CHAIN_ID=11155111`
- `ACTIVE_CENSUS_ADDRESS`
- `OPENSEA_API_KEY`
- `ERC8257_CREATOR_ADDRESS`
- `REPORT_MINT_SCANNER_ENABLED`
- `REPORT_ARBITRAGEUR_ENABLED`
- `REPORT_TRACKER_ENABLED`
- `REPORT_TOKEN_HUNTER_ENABLED`
- `REPORT_TREND_READER_ENABLED`
- `REPORT_FRAUD_DETECTOR_ENABLED`
- Upstash REST credentials or `REDIS_URL`

Secrets belong only in the existing `census-runtime-dnebayis` production project. The
OpenSea key exposed in chat must be revoked and replaced before OpenSea-backed canaries
are considered healthy. The replacement must never enter repository files, browser
code, logs, or responses.

Redis provides the bounded news queue and distributed sliding-window rate limits. The
current free resource is suitable for the limited production canary, not a promise of
durable storage. Structured logs must not include credentials or submitted user secrets.

## ERC-8257

Seven report-tool manifests are served from the production origin and registered as IDs
1-7 at Sepolia registry `0xd61aa597398a83122fce07a94beddb91fce8f42e`.
They have a zero access predicate and no pricing or payment block. OpenSea does not list
Sepolia among its canonical registry chains, so Census does not claim OpenSea tool-search
indexing.

## Verified production state

Archived v5 token 1/agent 9247 and token 2/agent 9248 passed discovery, `/talk`, MCP,
rate-limit, 404, adapter-binding and report-only checks on 3 August 2026. Active v6 token
2 discovery and token 3 Mint Scanner execution are the health canaries. The daily
production workflow checks both services. OpenSea-backed execution remains fail-closed
until the exposed key is rotated.

Deploy only to the existing production project. Do not create another runtime project
or a preview deployment.

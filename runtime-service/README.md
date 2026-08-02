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

The first report-only engine, Mint Scanner, is implemented locally. It scans bounded
Sepolia block ranges for standard ERC-721 mint events, groups them by collection, and
returns transaction/block evidence plus explicit limitations. It is not wired to public
invocation yet. A local read-only report can be run with `npm run scan:mint` after
setting `SEPOLIA_RPC_URL`.

Unpaid public canary execution requires both `UNPAID_MINT_SCANNER_ENABLED=true` and an
exact `CANARY_AGENT_KEYS` match. The initial verified canary is Census v3 token 2. All
other entries remain inactive, and registration remains `active: false`.

Required local environment:

- `RUNTIME_ORIGIN` — stable HTTPS origin, no trailing slash
- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `CHAIN_ID` (`11155111`)
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

The official 30 MB free plan is currently used for the bounded production canary at
the owner's direction. It does not provide the persistence guarantees required for
broader production activation.

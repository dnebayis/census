# Census shared runtime

This directory is the inactive Phase 2 protocol shell. It is deliberately separate
from `registration-service`; there is one permanent registration project and, later,
one permanent runtime project.

Implemented surfaces:

- `GET /llms.txt`
- `GET /a/<censusAddress>/<tokenId>/.well-known/restap.json`
- `POST /a/<censusAddress>/<tokenId>/talk`
- `GET|POST /a/<censusAddress>/<tokenId>/news`
- Streamable HTTP MCP at `/mcp/<censusAddress>/<tokenId>`

Every per-entry request reads live Census state and verifies the ERC-8217 adapter
binding. `/talk` and MCP tool calls return `runtime_inactive`; no LLM, payment, wallet,
or external action runs. `/news` never invokes an LLM and never emits a reply. Its
production storage uses Upstash Redis with an atomic bounded queue. Distributed sliding
window limits protect `/talk`, `/news`, and MCP. No production credentials are committed.

Required local environment:

- `RUNTIME_ORIGIN` — stable HTTPS origin, no trailing slash
- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `CHAIN_ID` (`11155111`)
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the Vercel-provided
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases)

Do not add runtime services to ERC-8004 registration JSON and do not set `active: true`
until storage and rate-limit integration tests, x402, skill execution, and external
canary checks pass.

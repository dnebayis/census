# Census registration service

This directory serves the read-only ERC-8004 registration API and the static Census
project page. It has no wallet connection, transaction path, dashboard, agent runtime,
MCP, RESTAP or payment service.

`GET /a/<censusAddress>/<tokenId>/registration.json` reads Sepolia, verifies the Census
token's ERC-8217 adapter binding, and returns the current context and fully-onchain SVG
as ERC-8004 `registration-v1`. Address routing lets all archived deployments share the
one permanent Vercel project without token-ID collisions.

Required Vercel production environment variables:

- `SEPOLIA_RPC_URLS` — two comma-separated RPC endpoints; `SEPOLIA_RPC_URL` is fallback
- `ADAPTER_ADDRESS`
- `IDENTITY_REGISTRY_ADDRESS`
- `CHAIN_ID` (`11155111`)
- `ACTIVE_CENSUS_ADDRESS` — v6 address eligible for short successful-response cache

Active-v6 successes use a short CDN cache; archived collections use `no-store`.
Unknown tokens use a short 404 cache. Binding/chain failures return 502 with `no-store`.
The public client is reused, requests time out after five seconds, RPC fallback is
supported and concurrent reads for one token are coalesced.

Deploy only to the existing `census-registration-dnebayis` production project. Do not
create preview deployments or additional Vercel projects.

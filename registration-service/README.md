# Census registration service

This directory is intentionally a read-only ERC-8004 registration API. It has no
frontend, agent runtime, MCP, RESTAP, executor, payment, or wallet service.

`GET /a/<censusAddress>/<tokenId>/registration.json` reads Sepolia, verifies that the
Census token is bound to the expected ERC-8217 adapter agent, and returns the current
context and fully-onchain SVG in an ERC-8004 `registration-v1` document. Including the
collection address lets every Census deployment share one permanent Vercel project
without token-ID collisions.

Required Vercel environment variables:

- `SEPOLIA_RPC_URL`
- `ADAPTER_ADDRESS`
- `IDENTITY_REGISTRY_ADDRESS`
- `CHAIN_ID` (`11155111`)

Responses are never cached because the NFT owner can update context and can opt out by
calling the adapter's `setAgentURI`.

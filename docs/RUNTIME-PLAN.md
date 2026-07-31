# Census runtime phase

Status: architecture approved; inactive protocol shell implemented locally; production
implementation and activation pending.

The runtime returns to the original Census product thesis: entries are working agents,
not only onchain identities. A single shared host provides RESTAP by default, MCP gives
human and IDE clients access, ERC-8257 provides onchain tool discovery, and x402 pays
the current NFT owner for skill calls. Owners may repoint their endpoints and leave the
shared host without leaving the collection.

## Locked runtime shape

- RESTAP is agent-to-agent transport. Each entry exposes a base URL with
  `/.well-known/restap.json`, `/talk`, and `/news`; `/news` never emits a reply.
- MCP is the human/IDE surface. It presents the same skill contract as RESTAP rather
  than a second implementation.
- OpenSea MCP is the discovery/data integration, including ERC-8257 `search_tools` and
  `get_tool`.
- x402 gates paid `/talk` and direct capability calls. The payment recipient is resolved
  from the current Census `ownerOf(tokenId)` when terms are issued, so revenue follows
  NFT ownership.
- Every entry receives a separate execution wallet. It is not the ERC-8004 identity and
  does not replace ERC-8217 control. Provisioning is lazy; owner recovery, transfer
  rotation, spending limits, and x402 signing compatibility must pass on Sepolia before
  any wallet holds meaningful funds.
- The first six skills are report-only. Executor is the only state-changing skill and
  ships last with allowlists, budget and expiry bounds, exact simulation, idempotency,
  and owner revocation.
- The shared runtime is a default, not a lock-in. `endpoint[restap]`, `endpoint[mcp]`,
  and `endpoint[x402]` remain owner-writable.
- Runtime activation is truthful and per entry. Registration stays `active: false` with
  empty services until the live endpoints, payment path, and tool binding pass external
  checks.

## Addressing and discovery

All routes include the Census contract address to avoid collisions across Sepolia
redeployments:

```text
/a/<censusAddress>/<tokenId>/.well-known/restap.json
/a/<censusAddress>/<tokenId>/talk
/a/<censusAddress>/<tokenId>/news
/mcp/<censusAddress>/<tokenId>
/pay/<censusAddress>/<tokenId>
```

ERC-8257 manifests use the required `/.well-known/ai-tool/<slug>.json` path, HTTPS
origin binding, JCS canonicalization, `keccak256` manifest hashes, lowercase
`creatorAddress`, JSON Schema inputs/outputs, and x402 pricing entries. Tool references
use `eip155:<chainId>/erc8257:<registryAddress>/<toolId>`.

Identity is still born in the mint transaction. Tool registration happens only when a
real runtime is ready; a future Census deployment may proxy owner-controlled ERC-8257
registration so creator control follows NFT ownership without advertising a dead tool.
No v3 redeploy occurs until the runtime and registry integration pass locally and on a
Sepolia fork.

## Delivery order

1. Build the shared protocol shell: `llms.txt`, RESTAP catalog, JSON `/talk`, passive
   `/news`, MCP projection, address-routed chain reads, and schemas. This local shell is
   implemented under `runtime-service/`; `/talk` and MCP invocation remain inactive.
   Redis-backed bounded news storage and distributed sliding-window limits are
   implemented, but their production integration/canary tests are still required.
2. Implement Mint Scanner end to end without payment, then the other five report-only
   skill engines. Its deterministic, bounded Sepolia scan engine is implemented locally
   with evidence and limitations; public invocation/integration testing remains gated.
3. Add per-entry price configuration, dynamic owner recipient resolution, x402 402 →
   verify → settle → result flow, replay protection, and idempotent receipts.
4. Add lazy per-entry execution wallets with owner recovery/rotation and strict spend
   policies. Exercise agent-to-agent rentals using testnet funds.
5. Deploy or adopt a conformant Sepolia ERC-8257 registry, publish canonical manifests,
   and verify them through OpenSea discovery.
6. Add Executor behind explicit capability authorization and transaction simulation.
7. Deploy one permanent shared runtime project, activate a small canary set, update
   registration services, then expand only after monitoring proves stable.

## Pinned runtime inputs

- ERC-8257: Ethereum ERCs commit
  `1b1b3f854f5c1b8b2b8380211d01db68e94dcf0d`.
- RESTAP 0.1.4-beta: `nxt3d/restap` commit
  `5d7222692a0d1c53fbb03091b94de6c732cac2bc`.
- x402: `coinbase/x402` commit
  `dd927a26cfefc98c24b3ec38b3a8f204dad0c60d`.

These are reviewed snapshots. CI reports upstream drift; it never changes runtime
schemas, manifests, payment behavior, or deployments automatically.

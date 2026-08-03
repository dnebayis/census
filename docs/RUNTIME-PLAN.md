# Census runtime phase

Status: seven bounded report-only engines implemented; collection-scoped production
runtime deployed to the single permanent project.

Entries are working report agents, not only onchain identities. A single shared host
provides RESTAP by default, MCP gives human and IDE clients access, and future ERC-8257
support can provide onchain tool discovery. Owners may repoint their endpoints and leave
the shared host without leaving the collection.

## Locked runtime shape

- RESTAP is agent-to-agent transport. Each entry exposes a base URL with
  `/.well-known/restap.json`, `/talk`, and `/news`; `/news` never emits a reply.
- MCP is the human/IDE surface. It presents the same skill contract as RESTAP rather
  than a second implementation.
- OpenSea MCP is the discovery/data integration, including ERC-8257 `search_tools` and
  `get_tool`.
- All seven skills are report-only. Advisor accepts bounded user-supplied evidence and
  returns cautious suggestions plus source links.
- The shared runtime is a default, not a lock-in. `endpoint[restap]`, `endpoint[mcp]`,
  and other non-reserved endpoint metadata remain owner-writable.
- Runtime activation is truthful and per entry. Registration stays `active: false` with
  empty services until the live endpoints and tool binding pass external checks.
- Census implements no payment protocol, creates no agent or execution wallet, and has
  no transaction-construction, signature, trade, transfer, or contract-call path.

## Addressing and discovery

All routes include the Census contract address to avoid collisions across Sepolia
redeployments:

```text
/a/<censusAddress>/<tokenId>/.well-known/restap.json
/a/<censusAddress>/<tokenId>/talk
/a/<censusAddress>/<tokenId>/news
/mcp/<censusAddress>/<tokenId>
```

ERC-8257 manifests use the required `/.well-known/ai-tool/<slug>.json` path, HTTPS
origin binding, JCS canonicalization, `keccak256` manifest hashes, lowercase
`creatorAddress`, and JSON Schema inputs/outputs. Tool references use
`eip155:<chainId>/erc8257:<registryAddress>/<toolId>`.

Identity is still born in the mint transaction. Tool registration happens only when a
real runtime is ready; a future Census deployment may proxy owner-controlled ERC-8257
registration so creator control follows NFT ownership without advertising a dead tool.
V4 was deployed only after the runtime and registry integration passed locally and on a
Sepolia fork.

## Delivery order

1. Build the shared protocol shell: `llms.txt`, RESTAP catalog, JSON `/talk`, passive
   `/news`, MCP projection, address-routed chain reads, and schemas. This local shell is
   implemented under `runtime-service/`; matching report-only skills are scoped to
   active v5 entries. V5 token 1 exposes Arbitrageur and token 2 exposes Mint Scanner;
   archived v4 tokens 1 and 2 expose Advisor and token 3 exposes Tracker but are no
   longer accepted by the active gate.
   Redis-backed bounded news storage and distributed sliding-window limits are
   implemented for both Upstash REST and standard Redis connections. The standard
   Redis queue and limiter passed a real integration test against
   `census-runtime-free`. The resource is production-only and the active v5 Census
   collection is enabled for report-only execution. The earlier v3 RESTAP, MCP,
   inactive-token, missing-token, chain-read, and Redis rate-limit checks passed on
   2 August 2026; v5 token 1 and token 2 external canary verification remains pending.
   This bounded canary does not make the non-persistent free database a durability gate
   for broader activation.
2. Implement Mint Scanner end to end, then the other six report-only
   skill engines. Its deterministic, bounded Sepolia scan engine is implemented with
   evidence and limitations; invocation is collection-scoped and skill-gated.
   Arbitrageur's bounded OpenSea listing/offer comparison
   engine and independent v5 token 1 gate are implemented and enabled as the bounded
   production canary with the secret-managed instant key. Tracker's bounded OpenSea
   account-event engine and independent gate are implemented but unreachable until
   a naturally assigned matching v5 token exists. Token Hunter's bounded OpenSea
   trending/detail engine and archived v3 token 4 verification are implemented. The remaining
   Trend Reader's bounded OpenSea ranking/stats engine and independent gate are also
   implemented but remain unreachable until a matching v5 token exists. The
   Fraud Detector's bounded provider-label assessment is implemented as the sixth and
   final market-data report engine. Advisor is the seventh report-only engine. All seven report-only flags are enabled for the active
   Census contract. Future matching tokens work automatically after adapter-binding and
   immutable-skill checks; currently absent skill types remain unreachable.
3. A conformant Sepolia ERC-8257 registry is deployed at
   `0xd61aa597398a83122fce07a94beddb91fce8f42e`; seven open report-tool manifests and
   focused invocation routes are implemented and registered as tool IDs 1–7. OpenSea
   does not currently list Sepolia
   among its canonical registry chains, so OpenSea search verification remains pending
   upstream network support rather than being falsely claimed.
4. Keep every skill inside the tested advisory-only boundary; transaction execution is
   explicitly rejected as a product direction.
5. Deploy one permanent shared runtime project, activate a small canary set, update
   registration services, then expand only after monitoring proves stable.

## Pinned runtime inputs

- ERC-8257: Ethereum ERCs commit
  `1b1b3f854f5c1b8b2b8380211d01db68e94dcf0d`.
- RESTAP 0.1.4-beta: `nxt3d/restap` commit
  `5d7222692a0d1c53fbb03091b94de6c732cac2bc`.

These are reviewed snapshots. CI reports upstream drift; it never changes runtime
schemas, manifests, or deployments automatically.

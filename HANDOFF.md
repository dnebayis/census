# Census v6 handoff

## Current truth — 3 August 2026

Census v6 is deployed and open on Sepolia at
`0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab`. It caps supply at 5,000, limits wallets
and batches to five, supports owner-only mint pause/unpause, rejects exact bitmap and
coarse silhouette reuse, validates a 280-byte UTF-8 context, and reports an immutable 5%
ERC-2981 royalty.

Deployment transaction: `0x5ffc78c41977536b63891b68dcd8dbfcbde129f3641db971313df5cce7e18d5b`.
Open transaction: `0xca2df7ad64df21a7dd7dd9c965f56e0b3fd8a9799ff6667f185773752ebedc52`.
First batch transaction: `0x08be0a0b56c5c82e1619c8249c7251d6ac00d0bf2ee9634f3e9998661511b50f`.

The rollout minted five visually reviewed drafts as tokens 1–5 and agents 9256–9260.
The production registration route returns all five, and token 1's HTTP document,
adapter binding, agent ID and Identity Registry URI were matched live. V5
`0x5863E1d0539c659204B097359AC1a75C51144E78` is preserved as an open testnet archive.

## Completed implementation

- Contract: 5K supply, exact bitmap hash registry, pause, reentrancy protection,
  context validation, immutable metadata namespaces, expanded trait vocabulary and
  ERC-2981.
- Pipeline: secure one-time seed, hidden public Species control, draft-local dense-art
  calibration, exact/coarse/24-pixel duplicate checks, Species review lock, encrypted
  Cast keystore option, exact simulation and receipt-derived mint records.
- Art correction after the first batch: Aquatic Humanoid and all one-eye assignments
  have zero public weight and are rejected before mint. A hash-bound exact PNG preview,
  complete top framing, readability and explicit user approval are mandatory.
- Art regression: Border Observer, unchanged 28.2% fixture, sparse fixture and five new
  Census-only portraits. No RAO, Basies, Flux or Gemini reference language is used.
- Registration: static project page, address-routed registration API, reusable fallback
  RPC client, five-second timeout, coalescing and differentiated cache/error behavior.
- Runtime: report-only engines. Skills provide analysis and links; they never execute a
  trade, approval, transfer or other financial action.
- Production v5 canaries: token 1 Arbitrageur discovery/talk and token 2 Mint Scanner
  discovery/talk/MCP returned 200; rate headers and report-only capability were present;
  a missing token returned 404.
- Production v6 canaries: token 2 Arbitrageur discovery is available; token 3 Mint
  Scanner `/talk` returns 200 with `reportOnly: true` and `transactionCapability: none`.
  Arbitrageur market execution currently fails closed with `market data unavailable`
  until the exposed OpenSea key is rotated.

## Locked boundaries

There is no central EIP-712 validator or reservation service. Exact bitmap reuse is
impossible onchain, but targeted pixel edits and directly chosen valid trait indices
cannot be absolutely prevented. Similarity protection beyond the coarse signature is a
property of the official pipeline.

Pause stops only new mints. ERC-2981 announces but does not force royalty payment.
The v6 mint contract has no x402 payment flow, executor, ERC721-C, separate agent wallet,
RESTAP or ERC-8257 integration. The separate production runtime exposes report-only
RESTAP/MCP routes and ERC-8257 discovery without transaction authority.

## Remaining work

`docs/NEXT-STEPS.md` is the only active backlog. Immediate operator actions are OpenSea
key rotation, a second independent Sepolia registration RPC, production canary reruns,
and OpenSea metadata/royalty ingestion checks for v6 tokens 1-5. The next art step is a
five-portrait reviewed regression batch.

V7 is a product decision, not an assumed deployment. It is needed only if retired
Aquatic/one-eye indices must also become impossible through direct contract calls. If
selected, v7 must deploy closed and become active only after the existing production
registration and runtime projects have passed external checks. Do not create another
Vercel project or a preview deployment.

Run the complete test and audit suite before every direct-main push. Daily production
health and weekly standards drift workflows are the ongoing monitors.

## User flow

```text
character → assigned immutable traits → normal portrait → calibrated one-bit preview
→ user approval → exact simulation → mint
```

Normal users should see character, preview, public funding address and plain-language
errors only. Contract/RPC/seed/threshold/ABI details remain agent concerns. Private key,
mnemonic and keystore password must never be logged or pasted into chat.

The deployed token 1 remains immutable and documents why these assignments were
retired. Removing the values from the contract itself requires a future deployment;
the official v6 pipeline does not produce or accept them again.

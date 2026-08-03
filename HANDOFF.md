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
- Art regression: Border Observer, unchanged 28.2% fixture, sparse fixture and five new
  Census-only portraits. No RAO, Basies, Flux or Gemini reference language is used.
- Registration: static project page, address-routed registration API, reusable fallback
  RPC client, five-second timeout, coalescing and differentiated cache/error behavior.
- Runtime: report-only engines. Skills provide analysis and links; they never execute a
  trade, approval, transfer or other financial action.
- Production v5 canaries: token 1 Arbitrageur discovery/talk and token 2 Mint Scanner
  discovery/talk/MCP returned 200; rate headers and report-only capability were present;
  a missing token returned 404.

## Locked boundaries

There is no central EIP-712 validator or reservation service. Exact bitmap reuse is
impossible onchain, but targeted pixel edits and directly chosen valid trait indices
cannot be absolutely prevented. Similarity protection beyond the coarse signature is a
property of the official pipeline.

Pause stops only new mints. ERC-2981 announces but does not force royalty payment.
There is no x402 payment flow, executor, ERC721-C, separate agent wallet, RESTAP or
ERC-8257 integration in v6.

## Remaining operator actions

The non-secret active address is pinned to v6 in both existing Vercel project
configurations. Dashboard authentication is still needed to configure a second secret
RPC endpoint in `SEPOLIA_RPC_URLS`. Deploy production only; do not create a preview or
another Vercel project.

The OpenSea key shared in chat must be revoked in the OpenSea dashboard and replaced as
a production-only runtime secret. Do not remove the old production value before a new
one is ready, and never place the replacement in repository files or frontend code.
After rotation, production-redeploy runtime and verify OpenSea ingestion for v6 token
1–5.

Run the complete local suite before every direct-main push. Daily production health and
weekly standards drift workflows are the ongoing monitors.

## User flow

```text
character → assigned immutable traits → normal portrait → calibrated one-bit preview
→ user approval → exact simulation → mint
```

Normal users should see character, preview, public funding address and plain-language
errors only. Contract/RPC/seed/threshold/ABI details remain agent concerns. Private key,
mnemonic and keystore password must never be logged or pasted into chat.

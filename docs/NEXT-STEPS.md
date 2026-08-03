# Remaining work

Status date: 3 August 2026. V6 contract rollout, five-item batch, registration binding,
production Docs/API page, art calibration and mandatory preview approval are complete.
The following list is the single source of truth for unfinished work.

## P0 - credentials and production resilience

1. Revoke the OpenSea API key exposed in chat and create a replacement before
   2 September 2026. Store it only as the `census-runtime-dnebayis` production secret,
   redeploy that existing project, and confirm that secrets do not appear in bundles,
   responses or logs.
2. Add an independent second Sepolia endpoint to the registration project's
   `SEPOLIA_RPC_URLS`. Verify fallback, five-second timeout, coalesced reads, 502
   `no-store`, short 404 cache and successful-token cache behavior in production.
3. Rerun the production canaries after both changes: registration page, token 1 binding,
   missing-token 404, v6 token 2 Arbitrageur discovery, v6 token 3 Mint Scanner report,
   rate-limit headers and report-only capability.

## P1 - marketplace verification

4. Verify OpenSea ingestion for v6 tokens 1-5: image, `Class`, `Skill`, all nine Title
   Case string traits, `background_color`, collection supply and ERC-2981 5% royalty
   signalling. Record provider/indexing delays as observations; do not treat royalty
   payment as enforceable.

## P1 - portrait regression and next mint

5. Prepare five new unminted portraits through the official agent workflow. Each final
   preview must have two readable eyes, correct Species/Class anatomy, a complete head
   below the reserved top rows, a readable mouth and no fin-like aquatic silhouette.
6. Compare the five previews against Border Observer, the unchanged 28.2% fixture and
   the sparse fixture. Record density, selected threshold, framing, Species readability
   and duplicate distance. Do not change the global palette, crop or threshold to fix a
   single draft.
7. Show the exact palette PNGs and wait for explicit approval. Only then simulate the
   exact batch and mint at most five entries. Decode token/agent mappings from the
   receipt and verify every production registration document.

## Product decision - v7

8. Done: retired values are now impossible for direct contract callers. v7
   (`TraitData.retired`, `RetiredTraits`, `ERR_RETIRED`; DECISIONS.md D29) is deployed
   closed on Sepolia at `0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`
   (tx `0xffc9f0a71a6b13219b7dff5867d83ed06639f2c4b0e346f74670e8bd8af1137e`, block
   11411049). The archived v6 stays immutable and still accepts those historical indices.
9. Remaining v7 activation: repoint the two existing production projects to the v7 address
   and redeploy, verify registration/runtime reads against v7, then `openMinting()` and
   record the open tx. Archive v6 in config (done). Do not create a new Vercel project or
   deploy for a pipeline/frontend change alone.

## Continuous operations

10. Keep the daily production-health workflow and weekly standards-drift workflow
    green. Investigate chain 502s, binding mismatches, cache regressions, rate-limit
    failures and standards drift; never auto-update an ABI or deployment.

## Still out of scope

Do not add a central mint validator, trait reservation service, x402, transaction
executor, wallet custody, ERC721-C, enforced royalties, a new Vercel project or preview
deployments without a new explicit product decision.

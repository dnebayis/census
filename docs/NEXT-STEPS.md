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

8. Decided: retired values should be impossible even for direct contract callers. The
   v7 candidate implementing this is prepared and tested in `src` (`TraitData.retired`,
   `RetiredTraits`, `ERR_RETIRED`; see DECISIONS.md D29). It is not deployed — the live
   v6 contract is immutable and still accepts those historical indices.
9. Remaining v7 work is the gated deploy cycle only: deploy the candidate with minting
   closed, repoint the two existing production projects and documentation, verify
   registration/OpenSea reads, then open minting and archive v6. This requires an
   explicit deploy decision; do not deploy for a pipeline or frontend change alone.

## Continuous operations

10. Keep the daily production-health workflow and weekly standards-drift workflow
    green. Investigate chain 502s, binding mismatches, cache regressions, rate-limit
    failures and standards drift; never auto-update an ABI or deployment.

## Still out of scope

Do not add a central mint validator, trait reservation service, x402, transaction
executor, wallet custody, ERC721-C, enforced royalties, a new Vercel project or preview
deployments without a new explicit product decision.

# Census remaining work

This list starts from the active v5 deployment and its first two minted entries. It is
ordered; finish and verify one item before moving to the next.

## 1. Draft-local density calibration

Token 2, `v5-border-observer`, proves that a valid portrait can still be visually too
dense. Its 58% foreground comes mainly from source hatching, dark hair, sunglasses,
helmet, and hoodie merging after reduction. The token is immutable and remains an
honest testnet example; it cannot be edited in place.

Do not change the contract density band, palette, crop, or global threshold to repair
one portrait. That would alter otherwise healthy future portraits and would not change
already-minted art.

Implement a conditional, draft-local calibration path:

1. Build the normal threshold-128 preview first.
2. Leave drafts at or below 45% foreground unchanged.
3. For drafts above 45%, create lighter candidate previews from that draft only,
   targeting 32%–42% foreground while retaining the same crop, traits, and source.
4. Select the smallest correction that keeps species, eyes, mouth, expression, and
   primary accessories readable. Never select by density alone.
5. Persist the selected threshold, mode, candidate statistics, and bitmap hash in the
   draft manifest so the build is reproducible.
6. Keep the existing 1%–95% contract band as the hard safety boundary; calibration is
   an art-quality step, not a new mint blocker.

Before enabling this path by default, regression-test it with the stored Border
Observer source, the 28.2% normal fixture, a sparse portrait, and at least five new
unminted portraits. This requires pipeline and documentation changes only; no contract
redeployment is required.

## 2. Validate the simplified prompt language

Generate five unminted drafts using the Census-only prompt language: clean graphic
portrait, flat light face planes, sparse deliberate linework, and no hatching or texture
fill. Compare their default previews with the current v5 pair. Accept the prompt change
only if traits remain recognizable and median density falls without producing empty
faces.

## 3. Reverify the active v5 runtime canaries

Run external production checks against v5 token 1 (`Arbitrageur`, agent 9247) and token
2 (`Mint Scanner`, agent 9248): discovery, `/talk`, MCP initialization and invocation,
rate limiting, missing-token behavior, live adapter binding, and report-only response
fields. Keep ERC-8004 registration `active: false` with empty services until product
policy explicitly changes.

## 4. Package the human-facing creation flow

Reduce the normal path to draft → upload/generate → preview → mint. Hide contract
addresses, seed handling, threshold selection, RPC choice, and single-versus-batch ABI
selection behind the existing CLI and IDE skill. Add concise error messages and one
copyable quick-start example without internal project history or external style names.

## 5. Operational follow-up

- Rotate the OpenSea instant key before 2 September 2026.
- Monitor the permanent registration and runtime production projects without creating
  duplicate projects or preview deployments.
- Continue weekly standards-drift reporting without automatic ABI changes.
- Mint additional testnet batches only after the density calibration regression set
  passes.

# Next steps

V6 contract, calibration, five-portrait regression set, first batch and live
registration binding are complete. Remaining work is operational rather than a new
contract design.

The official v6 pipeline has retired Aquatic Humanoid and one-eye assignments and now
requires an exact displayed preview with explicit approval. Existing v6 tokens are
immutable. Decide on a v7 deployment only if these values must also become impossible
through direct contract calls; pipeline-level removal requires no redeploy.

1. Re-authenticate the existing `dnebayis` Vercel project and configure a second
   Sepolia endpoint in secret-managed `SEPOLIA_RPC_URLS`. The public active v6 address
   is already pinned in both project configurations.
2. Revoke the OpenSea key previously exposed in chat, create a replacement in OpenSea,
   store it only as the runtime production secret, and production-redeploy. Never put
   the key in the frontend, repository, CLI output or logs.
3. Verify OpenSea ingestion of Class, Skill and all nine string traits for v6 token 1–5.
   ERC-2981 support can be checked separately; payment is marketplace-dependent.
4. Run the daily registration/runtime health workflow and weekly standards-drift job.
   Investigate 502s, binding mismatches, unexpected cache headers or canary failures.
5. Continue minting only through `brief → image → build → review → simulation → mint`.
   Add new low-frequency vocabulary only in a future deployment because vocab is
   contract-immutable.

Do not add a central validator, x402, transaction executor, wallet custody, ERC721-C or
new Vercel project without a new explicit product decision.

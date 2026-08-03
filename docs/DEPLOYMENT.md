# Deployment record

## Active v7 — Sepolia

- Census: `0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`
- chain ID: `11155111`
- adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- Identity Registry: `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- deploy tx / block: `0xffc9f0a71a6b13219b7dff5867d83ed06639f2c4b0e346f74670e8bd8af1137e` / `11411049`
- open tx / block: `0x2187ac3d297412dd1f3aa9db97f26b3b783983dd76b8611b7813e52c3c5122c0` / `11411209`
- change from v6: rejects retired trait indices (Species 8, Eyes {4, 8, 11}) via
  `TraitData.retired` → `RetiredTraits` / `ERR_RETIRED` (13); all other behaviour identical
- supply / wallet / batch caps: `5000 / 5 / 5`
- royalty: ERC-2981, 500 bps, immutable deployer receiver
- state: minting open, not paused

v7 deployed closed, then opened; it holds no tokens yet. Live reads confirm `SUPPLY = 5000`,
`mintingOpen = true`, `paused = false`, and `validate()` returns `ERR_RETIRED` (13) for
each retired index. Both production services are repointed to v7: registration serves the
v7 address (missing tokens 404), and the runtime treats v7 as the active collection while
rejecting archived-v6 execution (v6 `/talk` returns 503, discovery `active: false`).

## Archived v6 rollout — Sepolia

v6 `0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab` deployed closed
(`0x5ffc78c41977536b63891b68dcd8dbfcbde129f3641db971313df5cce7e18d5b` / block 11407058),
opened (`0xca2df7ad64df21a7dd7dd9c965f56e0b3fd8a9799ff6667f185773752ebedc52` / 11407077),
then minted its first exact five-item batch
(`0x08be0a0b56c5c82e1619c8249c7251d6ac00d0bf2ee9634f3e9998661511b50f` / 11407080). It stays
irreversibly open and immutable:

| Token | Agent | Draft | Skill | Class |
| ---: | ---: | --- | --- | --- |
| 1 | 9256 | v6-botanical-astronaut | Fraud Detector | Alien |
| 2 | 9257 | v6-midnight-radio-host | Arbitrageur | Alien |
| 3 | 9258 | v6-desert-cartographer | Mint Scanner | Agent |
| 4 | 9259 | v6-street-racer | Arbitrageur | Alien |
| 5 | 9260 | v6-orbital-archivist | Tracker | Agent |

All five production registration documents returned HTTP 200. Token 1 was independently
matched to agent 9256, adapter binding, Identity Registry URI, chain ID and contract.
On 3 August 2026 the production root and token 3 registration route returned 200, a
missing token returned 404, and live contract reads reported `mintingOpen = true` and
`paused = false`.

## Operational controls

`pauseMinting()` and `unpauseMinting()` are owner-only. Pause does not affect transfers,
ownership handover or reads. Ownership uses the contract's safe handover mechanism.
Royalty reporting does not enforce payment.

The deployable runtime size with optimizer runs set to 1 is 24,341 bytes, leaving 235
bytes under EIP-170. Gas numbers in the repository are test-environment comparisons,
not current Sepolia fee quotations.

## Archived deployments

V5 `0x5863E1d0539c659204B097359AC1a75C51144E78` remains irreversibly open on testnet but
is archive-only. Earlier v4, v3, v2, v1 and prototype addresses remain in
`config/sepolia.json`; none is an active pipeline default.

## Production state note

The existing registration and runtime projects pin the non-secret
`ACTIVE_CENSUS_ADDRESS` to v6 in their production configuration. Registration uses the
intended short CDN cache and runtime rejects archived collections. No new Vercel project
or preview deployment is permitted. No v7 address exists; see `NEXT-STEPS.md` for the
decision gate that would justify another deployment.

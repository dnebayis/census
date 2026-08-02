# Sepolia deployment record

## Active v5

- Census: `0x5863E1d0539c659204B097359AC1a75C51144E78`
- deploy transaction:
  `0x06143fed9e41de4099ff34194bb50930040ff0402262b948fc753d0f672991a9`
- deploy block: `11406675`
- source verification: Sourcify exact match, job
  `c368d633-ab19-40b6-9160-1de5867d3cfd`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- registration project: `dnebayis` account / `0xshawtys-projects` scope /
  `census-registration-dnebayis`
- registration production deployment: `dpl_G3fxrGdcyW4QVLmbp3vnZZxrYttk`
- runtime production deployment: `dpl_AqCWKJGitdk4xAG4t2QVJAswqLMP`
- repeatable deployment: native Vercel GitHub connection, production branch `main`,
  Root Directory `registration-service`
- open-mint transaction:
  `0x9e12c0bb5053f40a5a3d57f30cf8e5cafcff68b253bc0efeaef903133a479280`
- open-mint block: `11406691`
- mint status: irreversibly open; there is no pause or close function
- density hard band: 16–1520 lit pixels (1%–95%); art warnings are informational
- bitmap/art record: 200-byte one-bit bitmap / 209-byte SSTORE2 record
- palette: `#34343A` foreground / `#E9DDC7` background
- seventh skill: Advisor, 300 exact quota, report-only
- class: derived from immutable Species, never from skill
- minted supply at rollout: `0`

The permanent route is:

```text
https://census-registration-dnebayis.vercel.app/a/<censusAddress>/<tokenId>/registration.json
```

The Census address namespace lets all future deployments use this same Vercel project
without colliding on token IDs. The service has no mutable `CENSUS_ADDRESS` setting; it
validates the requested collection against the live ERC-8217 binding.

## Archived v4 production entries

V4 Census `0x629B4534D07F1E35a70a403f4521Cd95f34eb030` minted tokens 1–3 /
agents 9244–9246 with skills Advisor, Advisor, and Tracker in transaction
`0x8e38064c74e3a93f27aa315af1b221352411c03b711b8d73cec8be4989ba7c27`
at block `11406617`. It is archived because visual class followed skill instead of the
immutable Species trait. Its tokens and registrations remain preserved.

## Archived v3 production entries

V3 Census `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc` minted tokens 1–5 / agents
9119 and 9121–9124. It was archived because its immutable seventh skill was named
Executor. That skill has no runtime implementation; the tokens and registrations remain
preserved through the same permanent service.

## Archived v2 production entries

V2 Census `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC` minted:

- `genesis-registrar`: token 1 / agent 9104
- `night-ledger`: token 2 / agent 9106
- `signal-auditor`: token 3 / agent 9107
- `archive-courier`: token 4 / agent 9108

Their adapter URIs were migrated to the permanent `dnebayis` registration project
before the old Vercel project was retired. HTTP 200, `no-store`, missing-token 404,
binding, and Identity Registry URI checks were repeated after migration.

V2 batch transaction:
`0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428`.

## Abandoned and historical deployments

`0x3DBd72ffE620A6000547495016b7cb810BF41CA4` is a tokens-zero deployment that
accidentally reused the v2 host before address-routed registration was introduced. It
was never active and must not be used.

V1 Census `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4` remains historical with
token 1 / ERC-8004 agent 9100. Its URI migration transaction is
`0x76e3e85fae650ec18c587d19c4424c5fcf87fb3f1dbf38e9562aecc169eb82ac`.
Prototype Census
`0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` is also historical. No archived address
may be used by the active pipeline.

## Fixed dependencies

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`

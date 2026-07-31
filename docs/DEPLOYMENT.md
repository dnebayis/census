# Sepolia deployment record

## Active v3

- Census: `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`
- deploy transaction:
  `0x6d5ec0e686997f513a151c099aa7703885a2fc56defb20b60959e5bb0fa9f945`
- deploy block: `11389677`
- source verification: Sourcify exact match, job
  `6f5278ce-6ed3-4269-bfb2-caac8b0f4623`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- registration project: `dnebayis` account / `0xshawtys-projects` scope /
  `census-registration-dnebayis`
- Vercel production deployment: `dpl_6Q8hVkh2jCS8gEpsUrfg3nhtPNfn`
- repeatable deployment: native Vercel GitHub connection, production branch `main`,
  Root Directory `registration-service`
- open-mint transaction:
  `0x6f004d10f293fe8f42a71b843509dac57619565b144ed961fe2f6d4b7281f094`
- open-mint block: `11389684`
- mint status: irreversibly open; there is no pause or close function
- density hard band: 16–1520 lit pixels (1%–95%); art warnings are informational
- bitmap/art record: 200-byte one-bit bitmap / 209-byte SSTORE2 record
- palette: `#34343A` foreground / `#E9DDC7` background
- rollout token/agent: `1 / 9119` (`threshold-keeper`)
- rollout transaction:
  `0xe6f91c84898e30ae0c23d6533ad3f5b79cc7f28c39c4b3844f49ecb443fc7d90`

The permanent route is:

```text
https://census-registration-dnebayis.vercel.app/a/<censusAddress>/<tokenId>/registration.json
```

The Census address namespace lets all future deployments use this same Vercel project
without colliding on token IDs. The service has no mutable `CENSUS_ADDRESS` setting; it
validates the requested collection against the live ERC-8217 binding.

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

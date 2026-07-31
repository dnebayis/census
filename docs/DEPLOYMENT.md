# Sepolia deployment record

## Active

- Census: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`
- deploy transaction:
  `0xc1a233b263bda9f1018b380831ddba4780d63e9922acc7ea080864d6c440eaf2`
- canonical host: `https://census-registration.vercel.app`
- Vercel production deployment: `dpl_7gSqeQWFLMdrXiD91F4VHjTdSjGB`
- open-mint transaction:
  `0x9cf94c2b8a75b307103c94b419541152fee0f219fb49c980f09118fb30a69889`
- mint status: open; there is no pause or close function

## Rollout proof

- draft: `rollout-smoke`
- token ID: `1`
- ERC-8004 agent ID: `9100`
- mint transaction:
  `0x96120d28fa71de05767d77f655c52b8dd558402c5519455bc5578c42bef8ee87`
- registration URI:
  `https://census-registration.vercel.app/a/1/registration.json`
- adapter binding: ERC-721, active Census, token 1
- registration state: `active: false`, `x402Support: false`, no services or trust claims

The rollout portrait is a technical smoke artifact. It is not the production visual
quality bar and must never be used as an agent-native prompt or source reference.

## Fixed dependencies

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`

## Archived

Prototype Census `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` is historical and
must not be used by the pipeline.

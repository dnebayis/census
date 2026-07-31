# Sepolia deployment record

## Active v2

- Census: `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`
- deploy transaction:
  `0x45187c39f56701180f0a72fe9617bc91050cb5d13d87fb27d6de16cbe43f5c74`
- source verification: Sourcify exact match, job
  `b5f65814-e0ba-44f1-be18-b2168c733bcd`
- canonical host: `https://census-registration-v2.vercel.app`
- Vercel preview deployment: `dpl_BNJbhJZWqcnP1j9Ka11YS3ayqCgE`
- Vercel production deployment: `dpl_BegzB711CaDveVWD4HbsQiQBoReH`
- repeatable deployment: `.github/workflows/deploy-registration-v2.yml` tests and
  deploys the repository's `registration-service` directory to the v2 Vercel project
  whenever that directory changes on `main`
- open-mint transaction:
  `0x097fe1b72a541b2df6d0c98ab181e945d0dae26f458bf3ebc403962dda7148ab`
- mint status: irreversibly open; there is no pause or close function
- bitmap/art record: 200-byte one-bit bitmap / 209-byte SSTORE2 record
- palette: `#34343A` foreground / `#E9DDC7` background

## Launch state

- the one-way launch was explicitly approved and executed on Sepolia
- genesis draft: `genesis-registrar`
- token ID / ERC-8004 agent ID: `1 / 9104`
- mint transaction:
  `0x45d5308d1004940b6db4930b54b3e190b0bc5ca501b341ddb68c210e653527a4`
- block: `11389267`
- registration URI:
  `https://census-registration-v2.vercel.app/a/1/registration.json`
- production verification: HTTP 200, `no-store`, missing-token 404, binding back to
  active Census token 1, and Identity Registry URI exact match

## First production batch

- transaction:
  `0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428`
- block: `11389367`
- `night-ledger`: token 2 / ERC-8004 agent 9106
- `signal-auditor`: token 3 / ERC-8004 agent 9107
- `archive-courier`: token 4 / ERC-8004 agent 9108
- production verification: every token returned HTTP 200 with `no-store`; the
  missing-token probe returned 404; adapter bindings and Identity Registry URIs
  matched the corresponding v2 registration URL

## Fixed dependencies

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`

## Archived v1 and prototype

V1 Census `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4` remains historical
with token 1 / ERC-8004 agent 9100 at `https://census-registration.vercel.app`. Its
deployment, open-mint, and rollout transactions remain in Git history.

Prototype Census `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5` is historical. Neither
archived address may be used by the active pipeline.

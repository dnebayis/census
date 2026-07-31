# Census handoff

Repository: `https://github.com/dnebayis/census`

## Current phase

Only the hardened mint core and read-only ERC-8004 registration API are in scope.
ERC-8257, RESTAP, MCP, x402, seven skill implementations, Executor authorization,
frontend work, and separate agent wallets are deferred.

Read, in order:

1. `docs/standards-lock.md`
2. `docs/DECISIONS.md`
3. `docs/SPEC.md`
4. `pipeline/AGENTS.md`

## Fixed infrastructure

- ERC-8217 adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- ERC-8004 Identity Registry:
  `0x8004a818bfb912233c491871b3d84c89a494bd9e`
- Active Census: `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`
- Canonical registration origin: `https://census-registration-v2.vercel.app`
- Archived v1: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`
- Archived prototype: `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`

V2 minting is irreversibly open. The open transaction is
`0x097fe1b72a541b2df6d0c98ab181e945d0dae26f458bf3ebc403962dda7148ab`.
Genesis draft `genesis-registrar` is token 1 / ERC-8004 agent 9104; mint transaction:
`0x45d5308d1004940b6db4930b54b3e190b0bc5ca501b341ddb68c210e653527a4`.
Its verified registration URI is
`https://census-registration-v2.vercel.app/a/1/registration.json`.
The first production batch transaction is
`0x7db94f76591fd74d5e8fbb50c5ae13019f7062951b175138e2c6f407a90b3428`
at block `11389367`:

- `night-ledger`: token 2 / agent 9106
- `signal-auditor`: token 3 / agent 9107
- `archive-courier`: token 4 / agent 9108

All three production registration URLs returned HTTP 200 with `no-store`; the missing
token probe returned 404, and each live adapter binding and Identity Registry URI
matched.
The archived v1 rollout token 1 remains ERC-8004 agent 9100 at
`https://census-registration.vercel.app/a/1/registration.json`.

Production creation now starts at `skills/census-mint/SKILL.md`. The IDE agent must use
real raster image generation and inspect the source/comparison/palette preview.
Structural failures still stop minting. Art metrics remain advisory and may be
explicitly accepted after visual review; Python/SVG smoke drawings are archive proof,
not collection art.

## Safety-critical rollout order

The initial rollout completed in this order:

1. Push the reviewed source and deploy the registration service to preview.
2. Run its unit/schema/404/chain-read tests.
3. Obtain the stable public Vercel production project URL.
4. Deploy Census to Sepolia with that exact URL; it starts closed.
5. Set `CENSUS_ADDRESS`, `ADAPTER_ADDRESS`, `IDENTITY_REGISTRY_ADDRESS`, `CHAIN_ID`, and
   `SEPOLIA_RPC_URL` in Vercel production and redeploy.
6. Verify registration JSON and the Identity Registry `agentURI` are identical for a
   real token.
7. Only then call the irreversible `openMinting()`.

Future redeployments must preserve this order. Never deploy with a temporary immutable
host.

## Verification

```sh
forge test -vv
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  forge test --match-path test/SepoliaFork.t.sol -vv
python3 -m unittest -v pipeline/test_pipeline.py
cd registration-service
npm ci
npm test
npm audit --audit-level=high
```

The fork test performs a real adapter registration on fork state, checks the
registration URI and binding, then transfers the NFT and verifies controller authority
follows ownership.

## Pipeline facts

`draftId` is the stable local identity. A secure seed and trait assignment are written
once to `<draftId>.draft.json`; reopening does not reroll. Build records source and
bitmap SHA-256 hashes, `agent:*` provenance, and stats. Mint derives the sender from `PRIVATE_KEY`,
simulates the exact call, batches multiple drafts, and writes real receipt token/agent
IDs under `output/mints/`.

Files `output/7`, `8`, and `9` are legacy artifacts, not proof of minting and not
automatic token IDs.

`config/sepolia.json` is the machine-readable active deployment record.
`skills/census-mint/scripts/verify_registration.py` reproduces the external 200/404,
cache, live adapter binding, and Identity Registry URI checks.

Production registration deploys are owned by
`.github/workflows/deploy-registration-v2.yml`. The workflow uses repository secrets
for the Vercel token, org ID, and v2 project ID; it runs service tests and audit before
deploying the complete `registration-service` directory.

# Census

Census is a capped collection of 5,000 fully-onchain 40×40 one-bit portraits on
Ethereum Sepolia. A user describes the character; Census assigns and locks nine visual
traits, the pipeline produces a portrait and preview, and minting binds the NFT to an
ERC-8004 identity.

## Active deployment

| Component | Sepolia / production |
| --- | --- |
| Census v7 | [`0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`](https://sepolia.etherscan.io/address/0x7519855640cDBe8600CFF13fd98983A1bBFE46e0) |
| Adapter | `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92` |
| Identity Registry | `0x8004a818bfb912233c491871b3d84c89a494bd9e` |
| Registration | https://census-registration-dnebayis.vercel.app |
| Network | Ethereum Sepolia (`11155111`) |

V7 deployed closed in transaction
[`0xffc9…137e`](https://sepolia.etherscan.io/tx/0xffc9f0a71a6b13219b7dff5867d83ed06639f2c4b0e346f74670e8bd8af1137e).
It is v6 with contract-level rejection of the retired trait indices (Aquatic Humanoid and
the one-eye Eyes values); everything else — supply, caps, pause, duplicate protection and
ERC-2981 — is unchanged. The archived v6
[`0xEC36…B4ab`](https://sepolia.etherscan.io/address/0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab)
remains irreversibly deployed and open; its tokens 1–5 (agents 9256–9260) stay immutable.
Older v5 and earlier deployments remain archive-only.

## What v6 guarantees

- Supply is 5,000; at most five tokens may be minted per wallet and per batch.
- New mints can be paused and unpaused only by the owner. Transfers, ownership changes,
  metadata, art and registration reads continue while paused.
- Exact bitmap hashes and the existing coarse silhouette signatures cannot be minted
  twice. The official pipeline also blocks exact source reuse and portraits within 24
  pixels of an existing bitmap.
- Context is non-empty, valid UTF-8 and at most 280 bytes. Art, context, class, skill and
  all nine trait metadata namespaces are immutable after mint.
- ERC-2981 reports a 5% royalty to the immutable deployer receiver. It is marketplace
  signalling, not a transfer restriction or guaranteed royalty enforcement.
- `mint` and `mintBatch` are reentrancy protected; adapter state is called only after
  Census effects are committed.

No central mint signature is used. Consequently a caller using the contract directly
can choose any valid trait indices, and targeted bitmap edits may evade similarity
checks. Those are explicit boundaries, not security claims.

## Character and trait model

The user controls the subject, role, clothing direction and overall feeling. Census
generates a secure draft seed and assigns traits once; normal use exposes neither seed,
species nor reroll controls. Species controls anatomy: a Grey Alien samurai must still
look alien, a Skull entry must have a skull face, and an Agent must show android seams.

OpenSea attributes are `Class`, `Skill`, `Species`, `Age`, `Hair`, `Eyes`, `Facial`,
`Expression`, `Headwear`, `Attire` and `Accessory`, with human-readable string values
and `background_color: "E9DDC7"`. The expanded vocabulary includes VR Headset,
Cybernetic Lens, Tech Hood, Flight Suit, Respirator and other low-frequency values.
The official pipeline no longer assigns Aquatic Humanoid or one-eye values; their
indices remain only because v6 metadata is immutable and existing testnet tokens cannot
be edited.

## Human flow

```text
character description → locked traits → normal portrait → draft calibration
→ final 40×40 preview → user confirmation → exact simulation → mint
```

Start with:

> Use the Census workflow at `https://github.com/dnebayis/census/tree/main/skills/census-mint` and the public API docs at `https://census-registration-dnebayis.vercel.app/#api`. Create a Census portrait for: `<character>`. Preserve the character’s role and identity, let Census assign and lock the immutable traits, display the final palette-exact 40×40 one-bit PNG in this conversation, and wait for my explicit approval before simulating or minting on Sepolia.

The agent uses an encrypted Cast keystore and displays only the public address for
funding. Private keys, mnemonic phrases and passwords must never be pasted into chat,
written to artifacts, sent to a public API or logged.

## Repository

- `src/` — Census v6 and onchain art
- `pipeline/` — deterministic draft, calibration, review and safe batch minting
- `registration-service/` — static project page plus read-only ERC-8004 registration API
- `runtime-service/` — report-only discovery/talk/MCP services; never trades, approves,
  transfers or performs a financial action for the user
- `skills/census-mint/` — IDE-agent mint workflow
- `docs/` — specification, decisions, deployment record and remaining work

The mint contract implements ERC-8004, ERC-8048, ERC-8217 and ERC-2981. The separate
production runtime exposes report-only RESTAP, MCP and ERC-8257 discovery; none of them
can transact. X402 payments and transaction executors are absent.

Current unfinished work is maintained only in [`docs/NEXT-STEPS.md`](docs/NEXT-STEPS.md).
It covers OpenSea key rotation, a second production RPC, marketplace ingestion checks,
the next five-portrait regression batch and the optional v7 product decision.

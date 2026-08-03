# Census hardened mint-core specification

## 1. Scope

Implemented: ERC-721 collection, ERC-8048 metadata, ERC-8217 adapter binding to an
ERC-8004 identity, immutable artwork and traits, safe local pipeline, read-only
registration service, Sepolia rollout.

Runtime scope: RESTAP, MCP, seven report-only skill engines, and seven open ERC-8257
Sepolia registrations. `Advisor` replaces `Executor`; all skills are permanently limited
to observations, suggestions, evidence, and links. Payment protocols, transaction
construction, signatures, contract calls, and execution wallets are out of scope. OpenSea search awaits upstream Sepolia indexing. Delivery
gates are in `RUNTIME-PLAN.md`. A frontend remains outside the product direction.

The production `runtime-service/` implements address-routed RESTAP discovery, `/talk`,
passive `/news`, and MCP for adapter-bound tokens whose immutable skill and collection
gate match. Registration continues to return `active: false` and empty services. The ERC-8004 registration
compatibility field `x402Support` remains fixed to `false`; there is no implementation.
Its Mint Scanner and all other engines remain report-only and evidence-backed; runtime
availability does not grant transaction capability or make registration active.

The normative standards and upstream commits are in `standards-lock.md`.

## 2. Contract

Constructor:

```solidity
constructor(address adapter, string canonicalHost)
```

`adapter` must be deployed code. `canonicalHost` must start with `https://`, must not
end with `/`, and has no setter.

Public mint API:

```solidity
validate(bytes bitmap, bytes9 traits, address minter)
mint(bytes bitmap, bytes9 traits, string context)
mintBatch(bytes[] bitmaps, bytes9[] traits, string[] contexts)
bitmapOf(uint256 tokenId) returns (bytes)
traitsOf(uint256 tokenId) returns (bytes9)
traitOf(uint256 tokenId, uint8 category) returns (string)
```

Minting is closed initially. The owner can call `openMinting()` once. No function can
pause or close minting afterward.

### 2.1 Art record

SSTORE2 data is exactly 209 bytes:

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 200 | 40×40 row-major bitmap, one bit per pixel, MSB-first |
| 200 | 9 | one vocabulary index per trait category |

Bitmap analysis always uses bytes 0–199. The nine trait categories are Species, Age,
Hair, Eyes, Facial, Expression, Headwear, Attire, and Accessory.

Invalid bitmap length, effectively blank/solid density, duplicate signature, closed
minting, sold out supply, wallet cap, and invalid traits are hard failures. The density
band is deliberately broad at 1%–95%. Informational warnings cover density above 35%,
asymmetry, crowded corners, and isolated noise. The dense-art warning requires one
visual preview check but no CLI approval flag and never blocks by itself.

### 2.2 Identity

During mint, Census owns the new token long enough to call the real controller-gated
adapter:

```text
mint to Census
→ adapter.register(ERC721, Census, tokenId, agentURI)
→ transfer NFT to msg.sender
```

The URI is exactly:

```text
<canonicalHost>/a/<censusAddress>/<tokenId>/registration.json
```

The returned global `agentId` is stored and emitted in `EntryMinted`. Ownership transfer
changes adapter control because the binding resolves the NFT's current owner.

### 2.3 ERC-8048 and tokenURI

`metadata(tokenId,"skill")`, `"class"`, and valid `trait[...]` keys are derived from
immutable state. All keys with the `trait[` prefix are reserved against writes. Other
keys, including `context`, are writable only by the current NFT owner.

`skill` describes function and is assigned from the capped skill pool. `class` describes
the portrait species and is derived from immutable `trait[Species]`: human variants map
to `Human`, android maps to `Agent`, skull-faced maps to `Skull`, and the remaining
non-human species map to `Alien`. Skill assignment cannot change visual class.

`MetadataSet` is:

```solidity
event MetadataSet(
    uint256 indexed tokenId,
    string indexed indexedKey,
    string key,
    bytes value
);
```

`tokenURI` is an onchain JSON data URI with onchain SVG image plus Class, Skill, and all
nine visual attributes.

## 3. Pipeline

`draftId` is a 1–64 character local identifier. `--id` remains a deprecated alias that
prints a transition warning.

Creating a draft writes:

- subject
- 128-bit secure random seed
- human-readable traits and nine indices
- packed `bytes9`
- build and mint sections, initially null

Reopening the same draft reuses the assignment. There is no normal reroll command.

Production art defaults to an image-capable IDE agent, while users may directly supply
PNG, JPEG, or WebP. The build stores optional `agent:*`, `user:*`, or `tool:*`
provenance. Python, SVG, ASCII, procedural smoke art, and the rollout artifact are
excluded from the production mint path.

The agent creates a normal high-contrast clean graphic portrait with flat light face
planes, sparse linework, and no external collection reference, then inspects the original,
side-by-side comparison, and exact one-bit 40×40 PNG. The pipeline cover-crops the source
without distortion once to 40×36, places it at y=4 on a 40×40 canvas, thresholds at 128, and packs the
result into 200 bytes. The locked render palette is charcoal `#34343A` on warm pastel
`#E9DDC7`.
Only output outside the broad 1%–95% density band requires regeneration. Advisory
metrics and secondary-trait visibility never block minting. Build records source
filename and SHA-256, bitmap SHA-256, bitmap/stats filenames, all analysis statistics,
signature, warnings, and mintability. Existing artifacts and same-batch signatures are
checked separately.

Threshold 128 remains the default. A planned draft-local calibration may create lighter
candidates only when the default result exceeds 45% foreground. Normal drafts remain
byte-for-byte unchanged, and the selected threshold and candidate statistics must be
persisted. This is pipeline-only work and requires no contract redeployment; see
`NEXT-STEPS.md`.

Mint:

1. loads and hash-verifies every draft;
2. rejects only hard local failures and reports visual warnings;
3. derives sender from `PRIVATE_KEY`;
4. selects `mint` for one draft or `mintBatch` for multiple drafts;
5. simulates that exact call with the same sender;
6. broadcasts only if simulation succeeds;
7. decodes every `EntryMinted`;
8. writes transaction hash, block, real token ID, and real agent ID to a separate mint
   record and back into each draft manifest.

The private key is neither printed nor persisted. Files `output/7`–`output/9` are
legacy artifacts only.

## 4. Registration service

Route:

```text
GET /a/<censusAddress>/<tokenId>/registration.json
```

The service validates the requested Census address, performs a current block read,
confirms token existence, reads `agentId`, context, and tokenURI, and verifies
`bindingOf(agentId)` points back to the exact Census token. One permanent Vercel
project can therefore serve every deployment without token-ID collisions.

Response:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Census #1",
  "description": "<current context>",
  "image": "data:image/svg+xml;base64,...",
  "services": [],
  "x402Support": false,
  "active": false,
  "registrations": [{
    "agentId": 123,
    "agentRegistry": "eip155:11155111:<identity-registry>"
  }],
  "supportedTrust": []
}
```

Invalid/missing tokens return 404. Configuration, RPC, malformed onchain metadata, or
missing/mismatched binding returns 502. Every response is `no-store`.

## 5. Deployment

Fixed Sepolia infrastructure:

- adapter: `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`
- Identity Registry: `0x8004a818bfb912233c491871b3d84c89a494bd9e`

Active rollout:

- Census v5: `0x5863E1d0539c659204B097359AC1a75C51144E78`
- canonical host: `https://census-registration-dnebayis.vercel.app`
- minting: irreversibly open
- deploy transaction:
  `0x06143fed9e41de4099ff34194bb50930040ff0402262b948fc753d0f672991a9`
- open-mint transaction:
  `0x9e12c0bb5053f40a5a3d57f30cf8e5cafcff68b253bc0efeaef903133a479280`
- first v5 batch: tokens `1–2`, agents `9247–9248`, skills `Arbitrageur`,
  `Mint Scanner`, classes `Alien`, `Alien`, transaction
  `0x442d85b53862e66a6ec9b831a65aecd2f93d03c0ce0eb13834ee305019fd2318`

Archived v4: `0x629B4534D07F1E35a70a403f4521Cd95f34eb030`; tokens 1–3 remain
registered, but its skill-derived visual class semantics are historical.

Archived v3: `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`; its tokens 1–5 remain
registered through the permanent address-routed service. Its immutable Executor name is
historical and has no runtime implementation.

Archived v2: `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`; its tokens 1–4
remain registered through the permanent address-routed service.

Archived v1: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`, whose token 1
remains ERC-8004 agent 9100 through the permanent address-routed registration host.

Archived prototype: `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`.

Deployment order is production service → production URL → closed Census → production
environment addresses → live endpoint/binding verification → `openMinting`.

The local mock comparison is approximately 710k gas per separate mint and 429k per
entry in a four-entry batch, a 40% saving; a single measured mint is about 781k. It
measures batching directionally and does not model the live adapter's exact gas.

## 6. Acceptance

- all Solidity, pipeline, and service suites pass;
- contract runtime remains below the EIP-170 limit;
- 200-byte bitmap equivalence still holds with the 209-byte art record;
- nine traits round-trip and reject bad indices;
- immutable namespaces and tokenURI attributes are covered;
- batch receipts map every draft to distinct token/agent IDs;
- duplicates, cap failures, trait failures, effectively blank/solid art, and simulation
  reverts stop before broadcast; visual warnings do not;
- Sepolia fork verifies real adapter registration, URI, binding, and ownership control;
- production registration JSON matches `registration-v1`;
- no pause/close authority exists after launch.

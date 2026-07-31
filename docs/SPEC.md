# Census hardened mint-core specification

## 1. Scope

Implemented: ERC-721 collection, ERC-8048 metadata, ERC-8217 adapter binding to an
ERC-8004 identity, immutable artwork and traits, safe local pipeline, read-only
registration service, Sepolia rollout.

Deferred: ERC-8257, RESTAP, MCP, x402, seven skill runtimes, Executor authorization,
frontend, separate agent wallet.

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

SSTORE2 data is exactly 409 bytes:

| Offset | Length | Meaning |
|---:|---:|---|
| 0 | 400 | 40×40 row-major bitmap, two bits per pixel |
| 400 | 9 | one vocabulary index per trait category |

Bitmap analysis always uses bytes 0–399. The nine trait categories are Species, Age,
Hair, Eyes, Facial, Expression, Headwear, Attire, and Accessory.

Invalid bitmap length/density, duplicate signature, closed minting, sold out supply,
wallet cap, and invalid traits are hard failures. Soft warnings cover asymmetry,
crowded corners, noise, and insufficient full ink.

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
<canonicalHost>/a/<tokenId>/registration.json
```

The returned global `agentId` is stored and emitted in `EntryMinted`. Ownership transfer
changes adapter control because the binding resolves the NFT's current owner.

### 2.3 ERC-8048 and tokenURI

`metadata(tokenId,"skill")`, `"class"`, and valid `trait[...]` keys are derived from
immutable state. All keys with the `trait[` prefix are reserved against writes. Other
keys, including `context`, are writable only by the current NFT owner.

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

Build records source filename and SHA-256, bitmap SHA-256, bitmap/stats filenames, all
analysis statistics, signature, warnings, and mintability. Existing artifacts and
same-batch signatures are checked separately.

Mint:

1. loads and hash-verifies every draft;
2. rejects hard local failures and unaccepted warnings;
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
GET /a/<tokenId>/registration.json
```

The service performs a current block read, confirms token existence, reads `agentId`,
context, and tokenURI, and verifies `bindingOf(agentId)` points back to the exact Census
token.

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

- Census: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`
- canonical host: `https://census-registration.vercel.app`
- minting: open
- rollout token 1 / ERC-8004 agent 9100

Archived prototype: `0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5`.

Deployment order is preview service → production URL → closed Census → production
environment addresses → live endpoint/binding verification → `openMinting`.

The local mock comparison is approximately 829k gas per separate mint and 458k per
entry in a four-entry batch. It measures batching directionally and does not model the
live adapter's exact gas.

## 6. Acceptance

- all Solidity, pipeline, and service suites pass;
- contract runtime remains below the EIP-170 limit;
- 400-byte bitmap equivalence still holds with the 409-byte art record;
- nine traits round-trip and reject bad indices;
- immutable namespaces and tokenURI attributes are covered;
- batch receipts map every draft to distinct token/agent IDs;
- warnings, duplicates, cap failures, trait failures, and simulation reverts stop before
  broadcast;
- Sepolia fork verifies real adapter registration, URI, binding, and ownership control;
- production registration JSON matches `registration-v1`;
- no pause/close authority exists after launch.

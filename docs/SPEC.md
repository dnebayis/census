# Census v6 specification

## 1. Scope

Census v6 combines ERC-721 portraits, ERC-8004 identity registration, ERC-8048
immutable metadata conventions, ERC-8217 ownership control and ERC-2981 royalty
reporting. ERC-8257, RESTAP, MCP transaction execution, x402 payments, separate agent
wallets and enforced royalties are out of scope.

## 2. Collection and mint state

- `SUPPLY = 5000`
- wallet cap = 5
- batch cap = 5
- skill quotas = `[1500, 1500, 750, 500, 350, 250, 150]`
- deployment begins with minting closed
- owner opens initial minting once with `openMinting()`
- owner may later use `pauseMinting()` and `unpauseMinting()`
- pause affects only `mint` and `mintBatch`

`mint(bytes,bytes9,string)` and `mintBatch(bytes[],bytes9[],string[])` are non-reentrant.
Effects and duplicate reservations are committed before the external adapter call.

## 3. Validation

`validate(bytes,bytes9,address,string)` returns distinct hard-failure reasons for closed
or paused minting, exact bitmap duplicate, coarse signature duplicate, bitmap/trait
shape, invalid trait value, empty/invalid/overlong context, supply exhaustion and wallet
cap. The legacy three-argument view remains for compatibility.

Context must be valid UTF-8, non-empty and no longer than 280 bytes. Every accepted
bitmap stores `keccak256(bitmap)` in `bitmapHashUsed`. The existing 64-bit silhouette
signature remains a second global duplicate key. Batch validation also rejects repeats
inside the call.

## 4. Art storage

The source is cover-cropped without distortion to 40×36, placed at y=4 on a 40×40
canvas and packed row-major/MSB-first into 200 bytes. The charcoal foreground is
`#34343A`; the pastel background is `#E9DDC7`. Nine trait bytes are appended, producing
one 209-byte SSTORE2 record. Bitmap analysis and `bitmapOf` use only the first 200 bytes.

Threshold 128 is immutable for drafts at or below 45% density. A denser draft evaluates
`120, 112, 104, 96, 88, 80, 72, 64, 56, 48, 40`; the highest threshold reaching the
32–42% target while retaining Species, eye, mouth and primary-accessory readability is
selected. Manifest calibration data includes mode, candidate statistics, selected
threshold and final bitmap hash.

The official pipeline rejects repeated source hashes, repeated bitmap hashes, repeated
coarse signatures and any 40×40 bitmap within Hamming distance 24 of an existing draft.
Only exact bitmap and coarse signature uniqueness are onchain guarantees.

## 5. Traits

Trait byte order is fixed:

1. Species
2. Age
3. Hair
4. Eyes
5. Facial
6. Expression
7. Headwear
8. Attire
9. Accessory

Official pipeline targets over 5,000 assignments are Human 42%; Cat-like Humanoid and
Grey Alien 9% each; Android and Reptilian Humanoid 8% each; Ape-like Humanoid 7%;
Skull-faced Figure 6%; Insectoid Humanoid 5%; Horned Alien 4%; Crystalline Being and
Avian Humanoid 1% each. Aquatic Humanoid has zero public assignment weight.

The expanded vocabulary includes Textured Crop, Dreadlocks, Bob Cut, Shaved Geometric
Pattern, VR Headset, Cybernetic Lens, Luminous Eyes, Wraparound Glasses, Circuit Seams,
Ritual Markings, Facial Piercings, Focused, Curious, Stern, Pilot Cap, Antenna Crown,
Tech Hood, Open-face Space Helmet, Techwear Jacket, Flight Suit, Ceremonial Armour,
Utility Vest, Holographic Earpiece, Respirator, Data Cable and Neck Interface.

Aquatic Humanoid, One Eye Scarred Shut, Single Large Eye and Eyepatch remain at their
immutable v6 indices for historical decoding but have zero assignment weight and are
rejected by the official build/mint flow. Existing tokens are not mutated. Absolute
contract-level removal would require a new deployment.

The manifest hides seed and Species selection from normal user options and has no
reroll. The subject determines role and identity; assigned Species determines anatomy.
Class is derived only from Species: Human variants map to Human, Android maps to Agent,
Skull-faced Figure maps to Skull and all other non-human species map to Alien.

The contract enforces vocabulary validity and metadata immutability, not centralized
trait assignment. Direct valid contract calls remain possible by design.

The agent must display the palette-exact 40×40 PNG before mint. Review records are bound
to the bitmap hash and require Species match, two-eye/readability confirmation, complete
top framing and explicit user approval. The first foreground row must be below the four
reserved rows so the head cannot touch the crop boundary.

## 6. Metadata and royalties

`tokenURI` returns onchain JSON and SVG with `background_color: "E9DDC7"`. OpenSea
attributes are Title Case string traits without `display_type`: `Class`, `Skill`,
`Species`, `Age`, `Hair`, `Eyes`, `Facial`, `Expression`, `Headwear`, `Attire`,
`Accessory`.

`skill`, `class`, `context` and every `trait[...]` ERC-8048 namespace are immutable.
The owner may write other allowed ERC-8048 keys. The current NFT owner is the revenue
recipient and identity controller; no separate agent wallet exists.

The immutable deployer address is the ERC-2981 receiver. `royaltyInfo` returns 500 bps
of sale price and `supportsInterface` reports ERC-2981. No transfer-level enforcement
is installed.

## 7. Registration

The constructor permanently stores an HTTPS canonical host with no trailing slash.
The address-routed agent URI is:

```text
https://census-registration-dnebayis.vercel.app/a/<censusAddress>/<tokenId>/registration.json
```

Registration-v1 JSON contains name, context-derived description, onchain image, actual
agent ID, Identity Registry CAIP-style address and chain ID. Until transaction-capable
runtime exists it declares `active: false`, `x402Support: false`, `services: []` and
`supportedTrust: []`.

Unknown tokens return 404; missing binding or chain read failures return 502. Errors use
`no-store`; missing tokens use a short CDN cache; successful active-v6 responses use a
short CDN cache. The client is reused, two RPC endpoints may be configured, reads time
out after five seconds and concurrent reads for the same token are coalesced.

## 8. Active rollout

Active v6: `0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab`, Sepolia. Tokens 1–5
are agents 9256–9260. The full transaction and deployment record is in
`docs/DEPLOYMENT.md` and `config/sepolia.json`. V5
`0x5863E1d0539c659204B097359AC1a75C51144E78` is archived and must not be used by the
mint pipeline.

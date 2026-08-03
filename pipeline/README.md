# Census agent-native art pipeline

An IDE agent can generate the artwork, or a user can supply a raster directly. The CLI
assigns persistent visual traits, converts raster art into the exact onchain bitmap,
and simulates the exact transaction before minting. It is not an image generator.

Active Sepolia Census v7 is `0x7519855640cDBe8600CFF13fd98983A1bBFE46e0`; its
registration origin is `https://census-registration-dnebayis.vercel.app`. Supply is
5,000, minting is owner-pausable, and v7 rejects the retired trait indices at the contract
level. The adapter is `0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`. The archived v6
`0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab` (tokens 1–5, agents 9256–9260) stays
immutable. This phase covers ERC-8004, ERC-8048, ERC-8217 and ERC-2981 in the mint
contract. The separate runtime is report-only.

## Setup

```sh
cd pipeline
python3 -m pip install -r requirements.txt
```

## Draft, build, mint

```sh
python3 generate.py brief \
  --draft tired-bureaucrat \
  --subject "a tired bureaucrat"

# The IDE agent generates a raster from the printed brief, then:
python3 generate.py build \
  --draft tired-bureaucrat \
  --file output/tired-bureaucrat.agent-v1.png \
  --generator agent:<ide-name>

# The agent displays output/tired-bureaucrat.png. After explicit user approval:
python3 generate.py review \
  --draft tired-bureaucrat \
  --species-match --framing-ok --readable --user-approved

ETH_KEYSTORE_ACCOUNT=census python3 generate.py mint \
  --draft tired-bureaucrat
```

For multiple drafts, repeat `--draft`; the CLI automatically uses `mintBatch`. Context
defaults to each draft subject. `--persona`, `--generator`, `--census`, and `--rpc`
remain optional overrides.

The 3 August 2026 Foundry mock comparison is about 739k gas per separate mint and 454k
per entry in a four-entry batch, a 39% saving. It is directional, not a live fee quote.

```sh
ETH_KEYSTORE_ACCOUNT=census python3 generate.py mint \
  --draft one \
  --draft two
```

`--id` remains a deprecated alias and prints a warning. It does not mean token ID.

For Codex and compatible IDE agents, use the repo skill at
`skills/census-mint/SKILL.md`. It creates the prompt from the immutable draft manifest,
uses the IDE's image generation and opens the source and 40×40 previews for visual
review. The exact PNG must be displayed to and approved by the user before minting.
Species anatomy, complete top framing and overall readability are mandatory visual
checks. Production build inputs are raster-only:
PNG, JPEG, or WebP. Python drawings, SVG, ASCII, and the historical rollout smoke image
are not accepted as production art.

Generated prompts use only the Census visual rules: clean graphic portrait, flat light
face planes, sparse deliberate linework, and no hatching or unrelated collection name.

## Persistent assignment

The first `brief` uses a cryptographically secure 128-bit seed. It writes
`<draftId>.draft.json` immediately, reserving that trait combination even before a
drawing exists. Reopening the same draft reuses the stored seed and traits. There is no
reroll command.

The manifest contains:

- draft ID and subject
- seed
- readable traits, nine indices, and packed `bytes9`
- optional agent, user, or tool provenance
- source file hash
- bitmap hash
- density/signature/quality statistics
- receipt-derived mint record when minted

## Safety before broadcast

The pipeline:

- hash-checks built artifacts;
- rejects retired official-flow assignments: Aquatic Humanoid and one-eye values;
- checks duplicates against existing artifacts and separately inside a batch;
- requires a current, readable, completely framed, user-approved 40×40 PNG;
- refuses only effectively blank or solid drafts;
- reports advisory warnings without blocking, including a >35% density readability risk;
- derives the sender from an encrypted Cast keystore; `PRIVATE_KEY` remains a
  legacy environment-only option;
- simulates the exact `mint` or `mintBatch` call with that sender;
- broadcasts only after simulation succeeds.

The key is passed only to the transaction tool. It is not logged or written.

After success, the pipeline decodes `EntryMinted` events and writes
`output/mints/<transactionHash>.json` with each `draftId`, actual `tokenId`, `agentId`,
transaction hash, and block number.

Paused minting, invalid context, exact/coarse/near duplicate, wallet, trait, and
simulation failures remain
non-bypassable.

Threshold 128 remains the normal path. Results at or below 45% remain byte-for-byte
unchanged. Denser drafts alone evaluate descending candidates and select the highest
threshold reaching 32–42% while preserving Species and primary facial readability.
The chosen mode, threshold, candidates and bitmap hash are persisted.

## Bitmap and traits

The source portrait is aspect-preserving cover-cropped once to 40×36 and placed at y=4
on the 40×40 canvas, leaving four empty rows above the head while keeping the shoulders
at the bottom and both side edges. At least one additional blank row must remain before
the first head pixel, preventing hair, ears, horns or headwear from being cropped. A
default threshold of 128 produces a row-major, MSB-first, one-bit bitmap of exactly 200
bytes. Signature and density calculations mirror `src/lib/Bitmap.sol`. The preview and
onchain SVG use charcoal `#34343A` on warm pastel `#E9DDC7`.

Nine category indices are packed as `bytes9` in this order. Normal use does not expose
seed, Species or reroll choices:

1. Species
2. Age
3. Hair
4. Eyes
5. Facial
6. Expression
7. Headwear
8. Attire
9. Accessory

The contract appends these nine bytes to the bitmap in one 209-byte SSTORE2 record.

## Output files

| File | Meaning |
|---|---|
| `<draftId>.draft.json` | persistent draft, build, and receipt mapping |
| `<draftId>.hex` | 200-byte one-bit bitmap calldata |
| `<draftId>.traits` | readable traits and packed indices |
| `<draftId>.json` | build statistics and warnings |
| `<draftId>.png` | palette-exact preview |
| `<draftId>.src.png` | original source when applicable |
| `<draftId>.compare.png` | source beside the 40×40 result |
| `mints/<tx>.json` | receipt-derived batch mapping |

Old numbered files 7–9 are legacy artifacts. Their names are not token IDs and they are
not considered minted without a receipt record.

The active chain coordinates are machine-readable in `config/sepolia.json`. After a
receipt, the skill's `verify_registration.py` independently checks the production 200,
missing-token 404, cache policy, ERC-8004 agent ID, adapter binding, and Identity
Registry URI.

## Tests

```sh
python3 -m unittest -v test_pipeline.py
```

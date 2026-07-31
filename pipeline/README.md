# Census agent-native art pipeline

An IDE agent can generate the artwork, or a user can supply a raster directly. The CLI
assigns persistent visual traits, converts raster art into the exact onchain bitmap,
and simulates the exact transaction before minting. It is not an image generator.

Active Sepolia Census is `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`; its
registration origin is `https://census-registration-dnebayis.vercel.app`. Minting is
irreversibly open and the deployment currently has no entries. The adapter is
`0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92`. This phase covers ERC-8004, ERC-8048,
and ERC-8217 only.

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
  --file output/tired-bureaucrat.png

PRIVATE_KEY=… python3 generate.py mint \
  --draft tired-bureaucrat
```

For multiple drafts, repeat `--draft`; the CLI automatically uses `mintBatch`. Context
defaults to each draft subject. `--persona`, `--generator`, `--census`, and `--rpc`
remain optional overrides.

The Foundry mock comparison is about 710k gas per separate mint and 429k per entry in a
four-entry batch, a 40% saving. It is directional, not a live fee quote.

```sh
PRIVATE_KEY=… python3 generate.py mint \
  --draft one \
  --draft two
```

`--id` remains a deprecated alias and prints a warning. It does not mean token ID.

For Codex and compatible IDE agents, use the repo skill at
`skills/census-mint/SKILL.md`. It creates the prompt from the immutable draft manifest,
uses the IDE's image generation and can open the source and 40×40 previews for visual
review. Art metrics are informational; only effectively blank or solid output is
rejected. Production build inputs are raster-only:
PNG, JPEG, or WebP. Python drawings, SVG, ASCII, and the historical rollout smoke image
are not accepted as production art.

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
- checks duplicates against existing artifacts and separately inside a batch;
- refuses only effectively blank or solid drafts;
- reports advisory warnings without blocking;
- derives the sender locally from `PRIVATE_KEY`;
- simulates the exact `mint` or `mintBatch` call with that sender;
- broadcasts only after simulation succeeds.

The key is passed only to the transaction tool. It is not logged or written.

After success, the pipeline decodes `EntryMinted` events and writes
`output/mints/<transactionHash>.json` with each `draftId`, actual `tokenId`, `agentId`,
transaction hash, and block number.

Hard mintability, duplicate, wallet, trait, and simulation failures remain
non-bypassable.

## Bitmap and traits

The source portrait is reduced once to 36×36 and placed at y=4 on a 40×40 canvas,
leaving four empty rows above the head while keeping the shoulders at the bottom. A
fixed threshold of 128 produces a row-major, MSB-first, one-bit bitmap of exactly 200
bytes. Signature and density calculations mirror `src/lib/Bitmap.sol`. The preview and
onchain SVG use charcoal `#34343A` on warm pastel `#E9DDC7`.

Nine category indices are packed as `bytes9` in this order:

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

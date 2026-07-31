# Census agent-native art pipeline

The IDE agent generates the artwork, visually reviews the reduced portrait, and drives
this pipeline. The CLI assigns persistent visual traits, converts raster art into the
exact onchain bitmap, and simulates the exact transaction before minting. It is not an
image generator.

Active Sepolia Census is `0x3763fEcA935668E1fFC191F3C509f3A545B3ACBC`; its
registration origin is `https://census-registration-v2.vercel.app`. Minting is
irreversibly open; genesis draft `genesis-registrar` is token 1 / agent 9104. The adapter is
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
  --file output/tired-bureaucrat.agent-v1.png \
  --generator agent:codex-imagegen

PRIVATE_KEY=… python3 generate.py mint \
  --draft tired-bureaucrat \
  --persona "keeps the ledger" \
  --census "$CENSUS" \
  --rpc "$RPC"
```

For multiple drafts, repeat `--draft` and `--persona` in matching order. The CLI
automatically uses `mintBatch`.

The Foundry mock comparison is about 685k gas per separate mint and 404k per entry in a
four-entry batch, a 42% saving. It is directional, not a live fee quote.

```sh
PRIVATE_KEY=… python3 generate.py mint \
  --draft one --persona "first context" \
  --draft two --persona "second context" \
  --census "$CENSUS" --rpc "$RPC"
```

`--id` remains a deprecated alias and prints a warning. It does not mean token ID.

For Codex and compatible IDE agents, use the repo skill at
`skills/census-mint/SKILL.md`. It creates the prompt from the immutable draft manifest,
uses the IDE's image generation, opens the source and 40×40 previews for visual review,
and redraws the same draft on any warning. Production build inputs are raster-only:
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
- image-capable agent provenance
- source file hash
- bitmap hash
- density/signature/quality statistics
- receipt-derived mint record when minted

## Safety before broadcast

The pipeline:

- hash-checks built artifacts;
- requires declarative `agent:*` provenance for each raster build;
- checks duplicates against existing artifacts and separately inside a batch;
- refuses non-mintable drafts;
- requires `--accept-warnings` when advisory warnings exist;
- derives the sender locally from `PRIVATE_KEY`;
- simulates the exact `mint` or `mintBatch` call with that sender;
- broadcasts only after simulation succeeds.

The key is passed only to the transaction tool. It is not logged or written.

After success, the pipeline decodes `EntryMinted` events and writes
`output/mints/<transactionHash>.json` with each `draftId`, actual `tokenId`, `agentId`,
transaction hash, and block number.

The agent-native skill never uses `--accept-warnings`: it redraws, visually checks the
palette-exact preview, and stops without minting if it cannot reach a clean result in
four attempts.

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

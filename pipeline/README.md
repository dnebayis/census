# Census art pipeline

The pipeline assigns persistent visual traits, converts artwork into the exact onchain
bitmap, and simulates the exact transaction before minting.

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

# Draw from the printed brief, then:
python3 generate.py build \
  --draft tired-bureaucrat \
  --file drawing.png

PRIVATE_KEY=… python3 generate.py mint \
  --draft tired-bureaucrat \
  --persona "keeps the ledger" \
  --census "$CENSUS" \
  --rpc "$RPC"
```

For multiple drafts, repeat `--draft` and `--persona` in matching order. The CLI
automatically uses `mintBatch`.

```sh
PRIVATE_KEY=… python3 generate.py mint \
  --draft one --persona "first context" \
  --draft two --persona "second context" \
  --census "$CENSUS" --rpc "$RPC"
```

`--id` remains a deprecated alias and prints a warning. It does not mean token ID.

## Persistent assignment

The first `brief` uses a cryptographically secure 128-bit seed. It writes
`<draftId>.draft.json` immediately, reserving that trait combination even before a
drawing exists. Reopening the same draft reuses the stored seed and traits. There is no
reroll command.

The manifest contains:

- draft ID and subject
- seed
- readable traits, nine indices, and packed `bytes9`
- source file hash
- bitmap hash
- density/signature/quality statistics
- receipt-derived mint record when minted

## Safety before broadcast

The pipeline:

- hash-checks built artifacts;
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

## Bitmap and traits

The bitmap is 40×40, row-major, four tones, two bits per pixel, exactly 400 bytes.
Signature and density calculations mirror `src/lib/Bitmap.sol`.

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

The contract appends these nine bytes to the bitmap in one 409-byte SSTORE2 record.

## Output files

| File | Meaning |
|---|---|
| `<draftId>.draft.json` | persistent draft, build, and receipt mapping |
| `<draftId>.hex` | 400-byte bitmap calldata |
| `<draftId>.traits` | readable traits and packed indices |
| `<draftId>.json` | build statistics and warnings |
| `<draftId>.png` | palette-exact preview |
| `<draftId>.src.png` | original source when applicable |
| `<draftId>.compare.png` | source beside the 40×40 result |
| `mints/<tx>.json` | receipt-derived batch mapping |

Old numbered files 7–9 are legacy artifacts. Their names are not token IDs and they are
not considered minted without a receipt record.

## Tests

```sh
python3 -m unittest -v test_pipeline.py
```

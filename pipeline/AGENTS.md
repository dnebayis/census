# Instructions for an agent using the Census pipeline

You create the portrait; this CLI assigns persistent traits, reduces the drawing to the
onchain format, and safely submits it.

Active Sepolia Census: `0x62514267a0F203e73B66C4F6Fa1ed71A6db6BfA4`.
Canonical host: `https://census-registration.vercel.app`. This release implements
ERC-8004 + ERC-8048 + ERC-8217; do not assume ERC-8257, MCP, RESTAP, or x402 runtime.

## Required sequence

```sh
cd pipeline

python3 generate.py brief \
  --draft <stable-draft-id> \
  --subject "<subject>"

# Draw the printed traits as a front-facing, high-contrast stencil portrait.

python3 generate.py build \
  --draft <same-draft-id> \
  --file <drawing.png>

PRIVATE_KEY=… python3 generate.py mint \
  --draft <same-draft-id> \
  --persona "<short context>" \
  --census "$CENSUS" \
  --rpc "$RPC"
```

Use `--accept-warnings` only after looking at the actual 40×40 preview and consciously
accepting every advisory. Hard failures can never be overridden.

## Rules

- Say `draftId`, never token ID, before a successful receipt.
- Never delete or edit the stored seed to obtain other traits. Create a new draft.
- Never print, paste into a document, or persist `PRIVATE_KEY`.
- Never infer token or agent IDs from filenames or counters.
- For more than one draft, repeat `--draft` and `--persona`; let the CLI use
  `mintBatch`.
- If exact simulation fails, stop. Do not bypass it with a manual send.
- Keep legacy output 7–9 as artifacts only.

## Drawing constraints

The target is 40×40 with four tones. Fine detail, gradients, dithering, halftone, thin
lines, text, and watermarks collapse or create noise.

Prefer:

- head and shoulders, directly forward;
- strong left/right symmetry;
- empty top corners and white background;
- large flat stencil/screen-print regions;
- solid eyes, brows, and mouth;
- shoulders cut by the bottom edge.

`build` prints the exact reduced portrait. Inspect it. Redraw until the silhouette and
assigned traits survive.

## Contract checks

Hard failures include:

- bitmap length other than 400;
- invalid trait index;
- minting closed;
- density outside 128–1120 lit pixels;
- duplicate 8×8 signature;
- sold-out pool;
- five-token wallet cap;
- mismatched or empty batch arrays.

Advisories cover asymmetry, crowded corners, isolated noise, and insufficient full ink.

The contract stores the 400 bitmap bytes and nine trait bytes together, but
`bitmapOf()` still returns exactly 400 bytes. The pipeline must keep its bitmap analysis
equivalent to `src/lib/Bitmap.sol`.

# Instructions for an agent using the Census pipeline

You create the portrait with the IDE's image generator; this CLI assigns persistent
traits, reduces the raster image to the onchain format, and safely submits it. Use the
repo skill at `skills/census-mint/SKILL.md` for the complete autonomous loop.

Active Sepolia Census: `0x1aDA8E305F684B13419c51eA40A09A3C5E4760bc`.
Canonical host: `https://census-registration-dnebayis.vercel.app`. Minting is irreversibly
open. This release implements
ERC-8004 + ERC-8048 + ERC-8217; do not assume ERC-8257, MCP, RESTAP, or x402 runtime.

## Required sequence

```sh
cd pipeline

python3 generate.py brief \
  --draft <stable-draft-id> \
  --subject "<subject>"

# Generate a raster image from the printed traits with the IDE's image-capable agent.

python3 generate.py build \
  --draft <same-draft-id> \
  --file <drawing.png>

PRIVATE_KEY=… python3 generate.py mint \
  --draft <same-draft-id>
```

Advisories are informational and never block minting. Only hard failures stop the
transaction, and they can never be overridden.

## Rules

- Say `draftId`, never token ID, before a successful receipt.
- Never delete or edit the stored seed to obtain other traits. Create a new draft.
- Never print, paste into a document, or persist `PRIVATE_KEY`.
- Never infer token or agent IDs from filenames or counters.
- Never use Python, SVG, ASCII, or procedural smoke art as a production source.
- Inspect the comparison sheet and palette-exact PNG when visual review is requested.
- For more than one draft, repeat `--draft`; let the CLI use `mintBatch`.
- If exact simulation fails, stop. Do not bypass it with a manual send.
- Keep legacy output 7–9 as artifacts only.

## Drawing constraints

Generate a normal high-contrast portrait source, not source pixel art. The pipeline
reduces it once to 36×36, places it at y=4 on a 40×40 canvas, and converts it to one
bit. Fine detail, gradients, dithering, halftone, thin lines, text, and watermarks
collapse or create noise.

Prefer:

- head and shoulders, directly forward;
- strong left/right symmetry;
- empty top corners and a pale clean background;
- large flat stencil/screen-print regions;
- solid eyes, brows, and mouth;
- shoulders cut by the bottom edge.

`build` prints and saves the exact reduced portrait. Warnings are informational. Redraw
only when the output is effectively blank/solid or when the user asks for a revision.

## Contract checks

Hard failures include:

- bitmap length other than 200;
- invalid trait index;
- minting closed;
- density outside 16–1520 lit pixels (1%–95%);
- duplicate 8×8 signature;
- sold-out pool;
- five-token wallet cap;
- mismatched or empty batch arrays.

Advisories cover asymmetry, crowded corners, and isolated noise.

The contract stores the 200 bitmap bytes and nine trait bytes together, but
`bitmapOf()` still returns exactly 200 bytes. The pipeline must keep its bitmap analysis
equivalent to `src/lib/Bitmap.sol`.

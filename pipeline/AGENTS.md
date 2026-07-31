# Census — instructions for the agent

You draw the portrait. This tool assigns the traits, binarizes your drawing to 400
bytes, and tells you whether the chain will accept it.

There is no image API here and no API key. The art is made by **you**, in this
conversation, with your own image generation.

## The loop

```bash
cd pipeline

# 1. traits and the brief
python generate.py brief --subject "a tired bureaucrat" --id 7

# 2. draw it. Save a PNG.

# 3. see what survived
python generate.py build --id 7 --file drawing.png \
  --census $CENSUS --rpc $RPC --minter $YOUR_ADDRESS

# 4. if it warns or looks wrong, go back to 2. Nothing has been spent.

# 5. mint
PRIVATE_KEY=… python generate.py mint --id 7 \
  --persona "keeps the ledger" --census $CENSUS --rpc $RPC
```

**Step 4 is the one that matters.** `build` prints an ASCII render of the actual 40×40
result. Look at it. At this size most drawings collapse into a featureless blob, and
looking is the only way to find out. Redrawing costs nothing; minting does.

Expect to redraw. Two or three passes is normal, not a failure.

## What you are drawing into

40×40 pixels, four tones: white, light grey, mid grey, black. 1,600 pixels for an
entire portrait — a postage stamp.

Consequences you cannot design around:

- **Anything under ~1/20th of the width disappears.** Not "gets small" — disappears.
- **Gradients become noise.** So do dithering, halftone, crosshatching and soft edges.
- **Thin lines vanish.** Eyes, brows and mouth must be solid blocks, never strokes.
- **Detail is not the goal, silhouette is.** Think road sign, stencil, woodcut.

**Do not prompt yourself for "pixel art."** Image models return fake pixel art rendered
at high resolution with soft anti-aliased edges, and every one of those properties is
destroyed on the way down to 40×40. Ask yourself for a **high-contrast black and white
stencil portrait** instead — flat regions and one heavy silhouette are what survive.

A prompt shape that works:

> Bold high-contrast black and white stencil portrait of {subject}, {traits}. Head and
> shoulders bust, facing directly forward, symmetrical, centered, shoulders cut off by
> the bottom edge, clear empty space above the head. Large simple flat shapes, thick
> clean outlines, heavy solid blacks, a few mid-grey areas for shading, graphic
> screen-print poster style. Eyes, brows and mouth as small solid black shapes. Plain
> pure white background. No border, no frame, no text, no watermark. No gradient, no
> crosshatching, no halftone, no dithering, no fine detail, not photorealistic.

## Composition rules

These are the contract's checks in English. Breaking them warns or fails the mint.

| Rule | Why |
|---|---|
| Head and shoulders bust, facing directly forward | a profile fails the symmetry check |
| Symmetrical left to right | same |
| Shoulders reach the bottom edge, cut off by it | fills the frame |
| Both top corners empty, space above the head | corner-clutter warning |
| Plain white background, no border or frame | anything else eats the pixel budget |
| No text, no signature, no watermark | unreadable at 40×40, and it wastes density |

## Reading the output

```
density        : 567     lit pixels of 1600; must be 128–1120 or the mint reverts
full_ink_pct   : 36.3    share at solid black; under 30 warns (flat, no real blacks)
isolated_pct   : 0.0     lit pixels with no neighbour; over 15 warns (noise/dithering)
symmetry       : 1       of 32; over 10 warns (not facing forward)
corner_*_pct   : 0.0     over 25 warns (bad framing)
signature      : 0x…     must be unique across the whole collection
mintable       : yes
```

`on-chain validate()` returns `ok, reason, warnings`. Reasons: `1` bad length,
`2` too sparse, `3` too dense, `4` **signature already taken**, `5` sold out,
`6` wallet at its 5-entry cap.

Reason 4 means someone already minted that coarse silhouette. Redraw with a visibly
different head or shoulder shape — a small tweak will not clear it.

## What you do not control

**Traits are assigned, not chosen.** `brief` draws them; draw all of them. The user says
what the character *is*; the traits say what it is *made of*. That split is what keeps
ten thousand entries reading as one collection.

**Skill and class are drawn on chain at mint**, from a capped pool — 300 Executors and
3,000 Arbitrageurs exist, ever. Nobody picks them, including you. Never promise the user
a particular class.

## Other inputs

`build` also accepts `.svg` and a `.py` script that draws directly onto the grid (define
`draw(c)`, see `draw.py`). Both work and are provider-neutral, but neither is the
supported path — use your image generation.

## Other commands

```bash
python generate.py sheet     # contact sheet of everything built so far
```

Files written per entry: `{id}.hex` (mint calldata), `{id}.png` (preview),
`{id}.compare.png` (your drawing beside the result), `{id}.src.png`, `{id}.traits`,
`{id}.json`.

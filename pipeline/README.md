# Census Art Pipeline

Your agent draws the portrait. This tool assigns the traits, binarizes the drawing to
400 bytes, and tells you whether the chain will accept it.

**There is no image API and no API key.** The owner talks to their own agent — Codex,
or any agent with real image generation — and that agent draws during the conversation.
This is the point of the project, not an implementation detail.

**Claude is not a supported route.** It has no image generation, so its only options are
writing SVG or a drawing script, and neither produced art good enough at 40×40. Both
input formats are still accepted because they work and cost nothing to keep, but nothing
here is built around them.

Adapted from the Basies pipeline. Same files, same shape; the generation step is now the
owner's own agent, and the bitmap format, trait system and checks are Census's.

## Setup

```bash
cd pipeline
pip install -r requirements.txt
```

Pillow and numpy. Nothing else, no keys.

Agents should read [AGENTS.md](AGENTS.md) — it is written for them.

## The loop

```bash
# 1. traits and the drawing brief
python generate.py brief --subject "a tired bureaucrat" --id 7

# 2. the agent draws, saves a PNG or SVG

# 3. binarize and check
python generate.py build --id 7 --file drawing.svg \
  --census 0x7734226FaAFEb74d5f123b366c8a7a7f0B5d13F5 \
  --rpc https://ethereum-sepolia-rpc.publicnode.com \
  --minter 0xYourAddress

# 4. if it warns or looks wrong, redraw — nothing is spent yet

# 5. mint
PRIVATE_KEY=… python generate.py mint --id 7 \
  --persona "keeps the ledger" --census $CENSUS --rpc $RPC
```

```bash
python generate.py sheet     # contact sheet of everything built so far
```

## Why the loop matters more than the model

Every attempt to generate 40×40 pixel art from a text prompt in one shot produces mud,
and it is not the model's fault. The chain is lossy by construction:

```
model renders 1024×1024  →  99.8% of it is discarded  →  the rest is cut to four tones
```

Detail, texture and soft edges are exactly what a diffusion model is good at and exactly
what the reduction destroys. No successful pixel PFP collection was made this way —
Punks, Nouns and the rest are composed from parts authored at native resolution.

What this pipeline does instead is close the loop. `build` prints an ASCII render of the
real 40×40 result plus every warning the contract would raise, so the agent can *see*
that its drawing collapsed and draw again. A one-shot API call cannot do that. An agent
in a conversation can, and that iteration is worth more than any model upgrade.

## Output

| File | Contents |
|---|---|
| `{id}.hex` | 400-byte bitmap as hex — mint calldata |
| `{id}.png` | 640×640 preview in the palette the chain renders |
| `{id}.compare.png` | the agent's drawing beside the 40×40 result |
| `{id}.traits` | assigned traits and the subject |
| `{id}.json` | density, signature, warnings |
| `{id}.src.png` | what the agent drew |
| `contact.png` | grid of every entry built so far |

## Processing

```
trim to subject  →  LANCZOS to 320  →  BOX area filter to 40×40
                 →  four tones, split by percentile
                 →  despeckle, fill single holes
                 →  sweep the background cut until density lands mid-band
```

Three of those carry the quality, and all three were wrong in the pipeline this was
adapted from:

**Trim to the subject.** Generators leave a lot of empty background. Spending pixels on
nothing is unaffordable when there are 1,600 of them.

**Area filter last.** A single LANCZOS jump to 40×40 rings, and ringing quantises into
halos and speckle. LANCZOS to 320, then BOX.

**Percentile tone split.** Fixed grey cut points fail on any source whose contrast is not
what you assumed, and shifting them to hit a density target drags the ink threshold down
with them — a flat mid-grey image with no blacks. Splitting the lit pixels by percentile
of their own distribution guarantees a full tonal range whatever comes in.

## Traits

Nine categories, no gender (DECISIONS D12). Assigned, never chosen: the user says what
the character *is*, the traits say what it is *made of*. That split is what keeps ten
thousand entries reading as one collection.

| Category | Options | | Category | Options |
|---|---|---|---|---|
| Species | 10 | | Expression | 9 |
| Age | 3 | | Headwear | 12 |
| Hair | 13 | | Attire | 10 |
| Eyes | 12 | | Accessory | 12 |
| Facial | 11 | | | |

Option 0 is the plain or absent case in most of them, so accessories stay uncommon and
the average face stays readable. Traits are written to the token as ERC-8048 keys
(`trait[species]`, `trait[hair]`, …), not packed into a `bytes8` — the contract has a
key-value store, so there is nothing to pack.

## Bitmap format

400 bytes. 40×40, two bits per pixel, row-major, MSB-first, so a row is exactly 10 bytes.

```
flatIndex = y * 40 + x
byteIndex = flatIndex >> 2
shift     = 6 - ((flatIndex & 3) << 1)
tone      = (bitmap[byteIndex] >> shift) & 3
```

Tones: `0` background, `1` light, `2` mid, `3` full ink. A pixel is *lit* when non-zero.

`binarize.py` mirrors `src/lib/Bitmap.sol` — signature, density and every threshold. If
the two ever disagree, the mint reverts.

## Checks

Hard, enforced on chain. Outside these, `mint` reverts:

| Check | Rule |
|---|---|
| Length | exactly 400 bytes |
| Density | 128–1120 lit pixels (8–70%) |
| Uniqueness | the 8×8 signature must be unused |

Advisory, reported but never blocking:

| Warning | Trigger |
|---|---|
| Flat tone | under 30% of lit pixels at full ink |
| Noisy | over 15% of lit pixels isolated |
| Asymmetric | signature halves differ by more than 10 of 32 bits |
| Crowded corner | either 8×8 top corner over 25% lit |

All four are computed locally before you transact, and have been verified to agree with
the contract's own `validate()`.

## Files

| | |
|---|---|
| `generate.py` | the CLI: `brief`, `build`, `mint`, `sheet` |
| `traits.py` | assignment, uniqueness, and the description the brief is built from |
| `binarize.py` | image → bitmap, plus the analysis the contract performs |
| `svgraster.py` | SVG → image using Pillow alone, no libcairo needed |
| `output.py` | files, previews, contact sheet |
| `config.py` | grid, tones, thresholds, trait vocabulary |
| `draw.py` | native 40×40 drawing helpers, for the `.py` input |
| `AGENTS.md` | instructions for the agent |

## Adapted from Basies

| Basies | Census |
|---|---|
| 1 bit/pixel, 200 bytes | 2 bits/pixel, 400 bytes |
| single threshold at 128 | four tone levels, percentile split |
| `resize((40,40), LANCZOS)` | two-stage, area filter last |
| no cropping | trim to subject, pad square |
| no cleanup | despeckle, fill holes |
| 9:16 | 1:1, head and shoulders, front facing |
| Flux Dev via Replicate, API key | the owner's own agent, no key |
| — | Claude route tried and dropped: no image generation |
| one shot | draw, check, redraw |
| traits are metadata only | traits build the brief |
| Gender trait | removed |
| `bytes8` packed traits | ERC-8048 keys |
| character type chosen off chain | class is drawn **on chain**, not chosen |
| no contract check | signature dedupe plus a free on-chain `validate()` |

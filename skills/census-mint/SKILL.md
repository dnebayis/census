---
name: census-mint
description: Create, visually review, and safely mint Census portraits from an IDE agent session. Use when the user asks to create, draw, prepare, batch, or mint a Census agent/NFT, or asks to improve Census art quality. This skill owns the agent-native raster generation loop; it does not implement runtime skills, MCP, RESTAP, payments, or a frontend.
---

# Census Mint

Create the art with the IDE's image-capable agent or use a user-supplied raster. Keep
the draft's seed and traits stable, show the actual 40×40 result when useful, and
publish only when the user explicitly asked to mint.

## Locate the project

Resolve the repository containing `pipeline/generate.py` and `config/sepolia.json`.
When this installed skill is a symlink, resolve it before walking up to the repository.
Read `config/sepolia.json` for live addresses; never copy an archived address from old
artifacts.

## Decide the stopping point

- “create”, “draw”, “prepare”, or “show” means stop after a passing preview.
- “mint” or an equally explicit request authorizes the transaction after all gates pass.
- A batch request uses one CLI `mint` command with repeated `--draft` arguments.

Do not ask for contract addresses, trait choices, a seed, or a token ID. The project
already owns those decisions. Ask only when the subject or intended context is genuinely
missing.

## Prepare a persistent draft

From `pipeline/`, create a readable stable `draftId` and run:

```sh
python3 generate.py brief --draft <draftId> --subject "<subject>"
```

Reopening a draft must reuse its manifest. Never edit its seed or trait indices and
never invent a reroll. Read `<output>/<draftId>.draft.json`, then generate the image
prompt with:

```sh
python3 ../skills/census-mint/scripts/prompt_from_manifest.py \
  --manifest <output>/<draftId>.draft.json
```

Read [quality-gate.md](references/quality-gate.md) before generating.

## Generate and inspect

Use the installed `imagegen` skill and its built-in image-generation path. Produce a
normal high-resolution, high-contrast square portrait source with flat light face
planes, sparse deliberate linework, and no hatching or texture fill; do not ask the
generator for pixel art or name an unrelated collection as a style reference. The
pipeline performs the only aspect-preserving 40×36 cover crop,
places it at y=4 on the 40×40 canvas, and applies the Census one-bit geometry with its
two-color palette. Copy the chosen output into the project as
`<output>/<draftId>.agent-v<attempt>.png`. Do not substitute Python, SVG, ASCII art, a
procedural placeholder, or the historical rollout-smoke image.

Inspect the source image, then run:

```sh
python3 generate.py build \
  --draft <draftId> \
  --file <output>/<draftId>.png
```

Use the actual agent identifier when another image-capable IDE agent generated it.
Inspect both `<draftId>.compare.png` and the palette-exact 1-bit `<draftId>.png` with an image
viewer. Also read `<draftId>.json`.

Redraw the same draft only when:

- `mintable` is false; or
- the non-blocking dense-art warning is present and the agent's one visual inspection
  confirms that the face, eyes, mouth, or primary traits have merged into a dark mass.

The deliberately broad density band rejects only effectively blank or solid output.
All advisory warnings and secondary-trait losses are informational. A warning requires
one look at the actual palette preview, not a CLI confirmation flag. When a portrait is
visibly too dark, revise only that draft's source with lighter flat planes and less
texture. Do not change the collection-wide threshold to repair one draft. Duplicate
checks, wallet limits, invalid traits, and failed exact simulation remain hard failures.

## Mint only on explicit instruction

Require `PRIVATE_KEY` to exist in the local environment, but never read it into chat,
print it, persist it, or pass it anywhere except the existing pipeline command. Prefer
`SEPOLIA_RPC_URL`, then `RPC_URL`; otherwise use `publicRpc` from `config/sepolia.json`.

Run the CLI with the active Census address:

```sh
python3 generate.py mint \
  --draft <draftId>
```

The CLI must derive the sender, simulate the exact call, and decode the receipt. Never
bypass a failed simulation with a manual transaction.

After success, take the real `token_id` from the mint record and run:

```sh
python3 ../skills/census-mint/scripts/verify_registration.py --token-id <tokenId>
```

Report the final preview path, transaction hash, token ID, agent ID, and verified
registration URL. Before a receipt, call the work item only `draftId`, never token ID.

## Safety boundaries

- Treat files numbered 7–9 and `rollout-smoke` as legacy proof artifacts.
- Never overwrite a minted draft or infer IDs from filenames.
- Never claim runtime availability: registration remains `active: false`, has no
  services, and does not create an agent wallet.
- Never mint a non-raster source. Provenance may be `agent:*`, `user:*`, or `tool:*`
  and defaults to `user:raster`.
- Never delete a failed attempt merely to hide it; the selected build may overwrite the
  canonical preview, while source attempts remain available for review.

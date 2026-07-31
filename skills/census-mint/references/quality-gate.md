# Census visual quality gate

Judge the source and the palette-exact 40×40 preview separately. A polished source is
not sufficient if its important forms disappear after reduction.

## Prompt contract

Use a high-resolution monochrome editorial stencil or screen-print portrait, not pixel
art. Require:

- one head-and-shoulders subject, directly front-facing;
- strong centered silhouette and near bilateral symmetry;
- plain pure-white background and empty upper corners;
- large black, dark-grey, and light-grey shapes;
- readable solid eyes, brows, nose, and mouth;
- shoulders cut by the bottom edge;
- every assigned trait expressed with a large, unmistakable shape;
- no text, logo, watermark, border, scene, prop clutter, gradients, halftone, or
  hairline detail.

The image generator may render at high resolution. The pipeline, not the generator,
owns the 40×40 conversion.

## Visual pass

The reduced preview passes only when all are true:

1. The species, head shape, eyes, expression, headwear/hair, attire, and accessory can
   be recognized without consulting the source.
2. Eyes and mouth remain distinct; the face is not a single dark mass.
3. The outer silhouette is continuous and the shoulders anchor the bottom edge.
4. The top corners are empty and there is no accidental frame.
5. All four palette tones have a useful role rather than random speckle.
6. The result looks intentionally illustrated, not procedurally filled.

## Retry order

Correct only the most important failure each attempt:

1. composition and crop;
2. silhouette and density;
3. face readability;
4. missing assigned trait;
5. stray detail or tonal noise.

Do not change the subject, seed, or traits during retries. If the pipeline emits any
warning, treat it as a redraw request in the agent-native workflow.

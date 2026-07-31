# Census visual quality gate

Judge the source and the palette-exact 40×40 preview separately. A polished source is
not sufficient if its important forms disappear after reduction.

## Prompt contract

Match the RAO/Basies final visual language, but generate a normal source illustration
before reduction. Require:

- square close-up portrait headshot, directly front-facing;
- the head is centered with clean space above the hair and shoulders reaching the
  bottom;
- a high-resolution vintage ink/woodcut source, not source pixel art;
- broad high-contrast shapes and controlled facial detail that survive reduction;
- a final chunky 1-bit bitmap aesthetic like Macintosh 1984 icons;
- detailed facial features clearly visible in the final 40×40 preview;
- exactly two final colors: Census charcoal `#34343A` and warm pastel `#E9DDC7`;
- every assigned trait expressed with a large unmistakable pixel shape;
- no final grey levels, gradients, antialiasing, dithering, text, watermark, border or
  scenery.

The image generator renders a normal high-resolution portrait. The pipeline alone owns
the one reduction to 36×36, placement at y=4 on a 40×40 canvas, threshold, 1-bit
packing, and palette application.

## Visual pass

The reduced preview passes only when all are true:

1. The species, head shape, eyes, expression, and overall silhouette can be recognized
   without consulting the source. Secondary traits should remain visible when the
   reduction allows it, but a small lost detail is advisory rather than a structural
   failure.
2. Eyes and mouth remain distinct; the face is not a single dark mass.
3. The outer silhouette is continuous and the shoulders anchor the bottom edge.
4. The top corners are empty and there is no accidental frame.
5. Only foreground and background exist; there are no grey pixels or simulated shading.
6. The result looks intentionally illustrated, not procedurally filled.

## Retry order

Correct only the most important failure each attempt:

1. composition and crop;
2. silhouette and density;
3. face readability;
4. missing assigned trait;
5. stray detail or tonal noise.

Do not change the subject, seed, or traits during retries. Pipeline warnings trigger a
visual review. They require explicit CLI acceptance before minting, but do not require
repeated redraws when the user has chosen the less-strict art gate.

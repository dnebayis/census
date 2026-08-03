# Census visual quality gate

Judge the source and the palette-exact 40×40 preview separately. A polished source is
not sufficient if its important forms disappear after reduction.

## Prompt contract

Use the self-contained Census visual language and generate a normal source illustration
before reduction. Do not name or imitate an unrelated collection in user-facing prompts.
Require:

- exact square close-up portrait headshot, directly front-facing;
- the head is centered with generous clean space above hair, ears, horns and headwear;
  nothing touches or is cut by the source or final portrait's top edge;
- a high-resolution clean graphic portrait, not source pixel art;
- broad high-contrast shapes and controlled facial detail that survive reduction;
- flat light face planes, sparse deliberate linework, and no texture fill or hatching;
- a final chunky 1-bit bitmap aesthetic defined only by Census geometry and palette;
- detailed facial features clearly visible in the final 40×40 preview;
- exactly two final colors: Census charcoal `#34343A` and warm pastel `#E9DDC7`;
- every assigned trait expressed with a large unmistakable pixel shape;
- the assigned Species controls anatomy even when the user's character role is human-coded;
- one-eyed anatomy and fin-like aquatic silhouettes are retired from the official flow;
- no final grey levels, gradients, antialiasing, dithering, text, watermark, border or
  scenery.

The image generator renders a normal high-resolution square portrait. The pipeline alone owns
the one aspect-preserving cover crop to 40×36, placement at y=4 on a 40×40 canvas, threshold, 1-bit
packing, and palette application.

## Visual guidance

The following are quality suggestions, not mint requirements:

1. The species, head shape, both-eye region, expression, and overall silhouette can be recognized
   without consulting the source. Secondary traits should remain visible when the
   reduction allows it, but a small lost detail is advisory rather than a structural
   failure.
2. Eyes and mouth remain distinct; the face is not a single dark mass.
3. The outer silhouette is continuous and the shoulders anchor the bottom edge.
4. At least one additional blank row remains below the four reserved top rows; the head
   is visibly complete and there is no accidental frame.
5. Only foreground and background exist; there are no grey pixels or simulated shading.
6. The result looks intentionally illustrated, not procedurally filled.

Density above 35% emits a non-blocking readability warning. When it appears, inspect
the palette-exact 40×40 preview once. If dark texture or filled clothing overwhelms the
face, revise only that draft's source: remove hatching and texture, lighten the face and
clothing planes, and preserve the silhouette and assigned traits. Never change the
global threshold merely to repair one portrait.

## Retry order

Correct only the most important failure each attempt:

1. composition and crop;
2. draft-local dark fill and density;
3. face readability;
4. missing assigned trait;
5. stray detail or tonal noise.

Do not change the subject, seed, or traits during a retry. Pipeline warnings are
informational and require no CLI override. Retry only when the output is effectively
blank/solid, the dense preview is visibly unreadable, or the user explicitly asks for
an art revision.

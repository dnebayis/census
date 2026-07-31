#!/usr/bin/env python3
"""Create the image-generation prompt for one persistent Census draft."""

import argparse
import json
from pathlib import Path
from typing import Optional


TRAIT_ORDER = (
    "Species",
    "Age",
    "Hair",
    "Eyes",
    "Facial",
    "Expression",
    "Headwear",
    "Attire",
    "Accessory",
)


def build_prompt(manifest: dict, feedback: Optional[str] = None) -> str:
    subject = manifest.get("subject")
    traits = manifest.get("traits")
    if not isinstance(subject, str) or not subject.strip():
        raise ValueError("manifest has no subject")
    if not isinstance(traits, dict) or any(name not in traits for name in TRAIT_ORDER):
        raise ValueError("manifest has incomplete traits")

    trait_lines = "\n".join(f"- {name}: {traits[name]}" for name in TRAIT_ORDER)
    correction = f"\nTargeted correction:\n{feedback.strip()}\n" if feedback else ""
    return f"""Use case: stylized-concept
Asset type: source portrait for an immutable 40×40 onchain Census artwork
Primary request: Create one distinctive portrait of {subject.strip()}.
Assigned traits (all are mandatory):
{trait_lines}
Scene/backdrop: perfectly plain pure-white background
Style/medium: refined monochrome editorial stencil and screen-print illustration; high resolution, not pixel art
Composition/framing: square, centered head-and-shoulders bust, directly front-facing, near bilateral symmetry, shoulders cropped by the bottom edge, generous empty upper corners
Lighting/mood: graphic and controlled, with large intentional light-grey, mid-grey, and solid-black regions
Constraints: preserve a readable face and silhouette after reduction to 40×40; express every assigned trait with a large unmistakable shape
Avoid: profile or three-quarter pose, scenery, border, text, letters, numbers, logo, watermark, gradients, halftone, dithering, fine lines, tiny texture, isolated speckles, photorealistic background
{correction}"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--feedback")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    print(build_prompt(manifest, args.feedback))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

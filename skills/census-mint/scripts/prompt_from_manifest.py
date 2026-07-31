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
Scene/backdrop: pale clean background
Style/medium: a normal high-resolution vintage ink or woodcut portrait prepared for later reduction
Composition/framing: square close-up portrait headshot, directly front-facing, centered; leave clean space above the hair and keep shoulders at the bottom
Color: high-contrast grayscale or charcoal source with clearly separated light and dark masses
Constraints: strong anatomy; broad strokes; rich but controlled facial detail; express every assigned trait with a large unmistakable shape
Downstream: the pipeline—not the image generator—owns the single 40×40 reduction, thresholding, 1-bit packing, and Census palette
Avoid: pixel-art source, tiny hairline detail, profile, scenery, border, text, logo, watermark
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

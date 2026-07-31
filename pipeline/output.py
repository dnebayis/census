"""Output: save the bitmap, traits, preview and stats for one entry.

Adapted from Basies. Same two jobs — write a token, reload what already exists so a
batch stays unique — with three changes:

  - `.bin` becomes `.hex`, because what you actually do next is paste it into a
    `cast send` as calldata.
  - A `.png` preview is written, because at 40×40 you want to look at it before paying.
  - `.traits` holds readable JSON beside the packed bytes9 indices committed at mint.
"""

import json
import os
from io import BytesIO
from pathlib import Path

from PIL import Image

from binarize import unpack_bitmap
from config import BITMAP_BYTES, GRID_WIDTH, GRID_HEIGHT
from traits import to_indices, validate_traits

# Tone -> RGB, matching Art.sol's palette so the preview looks like what the chain renders.
PALETTE = {0: (233, 221, 199), 1: (52, 52, 58)}


def to_image(pixels, scale: int = 16) -> Image.Image:
    """Pixels -> a nearest-neighbour upscale, in the palette the chain renders."""
    img = Image.new("RGB", (GRID_WIDTH, GRID_HEIGHT))
    img.putdata([PALETTE[int(t)] for t in pixels])
    return img.resize((GRID_WIDTH * scale, GRID_HEIGHT * scale), Image.Resampling.NEAREST)


def save_preview(pixels, path: str, scale: int = 16) -> str:
    to_image(pixels, scale).save(path)
    return path


def save_comparison(pixels, source_image: bytes, path: str, scale: int = 12) -> str:
    """What the LLM drew beside what will actually be minted.

    Worth writing every time: at 40x40 the interesting question is never "is the source
    good" but "did anything survive", and the two side by side answer it instantly.
    """
    result = to_image(pixels, scale)
    h = result.height

    src = Image.open(BytesIO(source_image)).convert("RGB")
    src.thumbnail((h, h), Image.Resampling.LANCZOS)
    left = Image.new("RGB", (h, h), PALETTE[0])
    left.paste(src, ((h - src.width) // 2, (h - src.height) // 2))

    gap = 12
    sheet = Image.new("RGB", (h * 2 + gap, h), (245, 245, 245))
    sheet.paste(left, (0, 0))
    sheet.paste(result, (h + gap, 0))
    sheet.save(path)
    return path


def save_contact_sheet(output_dir: str, path: str = None, cols: int = 5,
                       scale: int = 4, pad: int = 8) -> str:
    """A grid of every entry generated so far.

    The single most useful artefact in the directory: ten thousand entries only work as
    a collection if they read as one next to each other, and that is not visible one
    file at a time.
    """
    files = sorted(Path(output_dir).glob("*.hex"),
                   key=lambda p: int(p.stem) if p.stem.isdigit() else 0)
    if not files:
        raise ValueError(f"no .hex files in {output_dir}")

    tiles = []
    for f in files:
        bitmap = bytes.fromhex(f.read_text().strip())
        if len(bitmap) == BITMAP_BYTES:
            tiles.append((f.stem, to_image(unpack_bitmap(bitmap), scale)))
    if not tiles:
        raise ValueError(f"no active {BITMAP_BYTES}-byte .hex files in {output_dir}")

    tw = th = GRID_WIDTH * scale
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new(
        "RGB",
        (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad),
        (245, 245, 245),
    )
    for i, (_, img) in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(img, (pad + c * (tw + pad), pad + r * (th + pad)))

    path = path or os.path.join(output_dir, "contact.png")
    sheet.save(path)
    return path


def save_token(
    output_dir: str,
    draft_id: str,
    bitmap: bytes,
    pixels,
    traits: dict,
    stats: dict,
    source_image: bytes = None,
) -> dict:
    """Write one entry's files.

    Creates:
      {tokenId}.hex      — 200-byte bitmap as hex, ready as mint calldata
      {tokenId}.png      — 640×640 nearest-neighbour preview
      {tokenId}.traits   — trait names and indices, JSON
      {tokenId}.json     — density, signature, warnings
      {draftId}.src.png  — what the IDE agent drew, before binarising

    Raises:
        ValueError: if the bitmap is the wrong length or the traits are not legal.
    """
    if len(bitmap) != BITMAP_BYTES:
        raise ValueError(f"bitmap must be exactly {BITMAP_BYTES} bytes, got {len(bitmap)}")
    if not validate_traits(traits):
        raise ValueError(f"invalid traits: {traits}")

    os.makedirs(output_dir, exist_ok=True)
    base = os.path.join(output_dir, str(draft_id))

    with open(base + ".hex", "w") as f:
        f.write(bitmap.hex())

    save_preview(pixels, base + ".png")

    with open(base + ".traits", "w") as f:
        json.dump({"traits": traits, "indices": list(to_indices(traits))}, f, indent=2)

    with open(base + ".json", "w") as f:
        json.dump({"draft_id": draft_id, "bytes": len(bitmap), **stats}, f, indent=2)

    if source_image:
        Image.open(BytesIO(source_image)).convert("RGB").save(base + ".src.png")
        try:
            save_comparison(pixels, source_image, base + ".compare.png")
        except Exception:
            pass  # a preview failing must never lose an otherwise good entry

    return {"hex": base + ".hex", "png": base + ".png", "traits": base + ".traits"}


def load_existing_traits(output_dir: str) -> set:
    """Reload trait index tuples already used, so a batch never draws a duplicate."""
    existing = set()
    path = Path(output_dir)
    if not path.exists():
        return existing

    for f in path.glob("*.traits"):
        try:
            data = json.loads(f.read_text())
            idx = data.get("indices")
            if idx:
                existing.add(tuple(idx))
        except (ValueError, OSError):
            continue

    # A draft owns its assignment as soon as it is created, before artwork is built.
    # Include manifests so two open drafts can never receive the same combination.
    for f in path.glob("*.draft.json"):
        try:
            idx = json.loads(f.read_text()).get("trait_indices")
            if idx:
                existing.add(tuple(idx))
        except (ValueError, OSError):
            continue

    return existing


def load_existing_signatures(output_dir: str) -> set:
    """Reload 8×8 signatures already produced.

    The contract rejects a duplicate signature outright, so catching it here saves a
    reverted transaction — two different trait sets can still land on the same coarse
    silhouette.
    """
    sigs = set()
    path = Path(output_dir)
    if not path.exists():
        return sigs

    for f in path.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            sig = data.get("signature")
            if sig and data.get("bytes") == BITMAP_BYTES:
                sigs.add(sig)
        except (ValueError, OSError):
            continue

    return sigs


def load_signature_owners(output_dir: str) -> dict:
    """Map each signature to every draft that currently owns it."""
    owners = {}
    path = Path(output_dir)
    if not path.exists():
        return owners
    for f in path.glob("*.json"):
        if f.name.endswith(".draft.json"):
            continue
        try:
            data = json.loads(f.read_text())
            sig = data.get("signature")
            if sig and data.get("bytes") == BITMAP_BYTES:
                owners.setdefault(sig, []).append(f.stem)
        except (ValueError, OSError):
            continue
    return owners


def draft_manifest_path(output_dir: str, draft_id: str) -> Path:
    return Path(output_dir) / f"{draft_id}.draft.json"


def load_draft_manifest(output_dir: str, draft_id: str) -> dict:
    path = draft_manifest_path(output_dir, draft_id)
    if not path.exists():
        raise ValueError(f"no draft {draft_id!r}; run `brief --draft {draft_id}` first")
    return json.loads(path.read_text())


def save_draft_manifest(output_dir: str, draft_id: str, manifest: dict) -> str:
    os.makedirs(output_dir, exist_ok=True)
    path = draft_manifest_path(output_dir, draft_id)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    os.replace(tmp, path)
    return str(path)

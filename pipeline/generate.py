#!/usr/bin/env python3
"""
Census Art Pipeline — driven by the owner's own agent.

There is no image API and no API key. The owner talks to their own agent — Codex, or
any agent with real image generation — and that agent draws the portrait during the
conversation. This tool assigns the traits, takes the drawing back, binarizes it to
400 bytes, and tells the agent whether the chain will accept it.

    python generate.py brief  --subject "a tired bureaucrat" --id 7
      ... the agent draws, however it can, and saves a file ...
    python generate.py build  --id 7 --file drawing.png
    python generate.py mint   --id 7 --persona "keeps the ledger"

`build` prints an ASCII preview and every warning the contract would raise, so the
agent can look at what actually survived the reduction and draw again. That loop is
the whole quality story: a one-shot API call cannot see that its output turned to mud
at 40x40; an agent in a chat can.
"""

import argparse
import json
import os
import subprocess
import sys
import time

from binarize import binarize_image, analyse, preview
from config import ACCEPTED_INPUTS, TRAIT_CATEGORIES
from output import (
    save_token, load_existing_traits, load_existing_signatures, save_contact_sheet,
)
from traits import generate_traits, describe


# ---------------------------------------------------------------- brief

BRIEF = """\
Draw this portrait. Save it as a PNG, then run:

    python generate.py build --id {token_id} --file <your file>

SUBJECT
  {subject}

TRAITS — these are assigned, draw all of them
  {trait_lines}

COMPOSITION — the contract checks these, they are not style preferences
  - Head and shoulders bust, facing directly forward. Not a profile, not three-quarter.
  - Symmetrical left to right.
  - Head in the upper middle. Shoulders reach the bottom edge and are cut off by it.
  - Both top corners empty. Leave clear space above the head.
  - Plain pure white background. No border, no frame, no text, no signature.

STYLE — this is reduced to 40x40 pixels with four tones, so
  - Large flat regions of one tone. Stencil or screen print, not a photograph.
  - Heavy solid black outline on the silhouette so the shape reads.
  - Eyes, brows and mouth as small solid black shapes, not fine lines.
  - Use mid greys for shading in solid areas.
  - No gradient, no dithering, no halftone, no crosshatching, no noise, no fine detail.
  - Anything under about 1/20th of the width disappears entirely. Draw nothing smaller.

`build` will print what survived the reduction plus any warnings. If it looks wrong or
warns, draw it again — that is expected, and it is why this step exists.
"""


def cmd_brief(args):
    existing = load_existing_traits(args.output)
    traits = generate_traits(
        args.id * 31337 + int(time.time()),
        existing,
        {"Species": args.species} if args.species is not None else None,
    )

    os.makedirs(args.output, exist_ok=True)
    with open(os.path.join(args.output, f"{args.id}.traits"), "w") as f:
        json.dump({"traits": traits, "subject": args.subject}, f, indent=2)

    print(BRIEF.format(
        token_id=args.id,
        subject=args.subject,
        trait_lines="\n  ".join(f"{k:<11} {traits[k]}" for k, _ in TRAIT_CATEGORIES),
    ))
    return 0


# ---------------------------------------------------------------- build


def _read_drawing(path: str):
    """Return (source_bytes_or_None, pixels_or_None).

    A .py script drew at native resolution and needs no binarising at all — that route
    has no lossy stage, so the pixels go straight through.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext not in ACCEPTED_INPUTS:
        raise ValueError(f"unsupported input {ext}; accepted: {', '.join(ACCEPTED_INPUTS)}")

    if ext == ".py":
        import draw

        return None, draw.run(path)

    if ext == ".svg" or (ext == ".txt" and "<svg" in open(path).read(400)):
        from io import BytesIO

        import svgraster

        buf = BytesIO()
        svgraster.render(open(path).read(), size=1024).save(buf, format="PNG")
        return buf.getvalue(), None

    return open(path, "rb").read(), None


def cmd_build(args):
    traits_path = os.path.join(args.output, f"{args.id}.traits")
    if not os.path.exists(traits_path):
        print(f"error: no traits for #{args.id}. Run `brief --id {args.id}` first.")
        return 1

    meta = json.load(open(traits_path))
    traits, subject = meta["traits"], meta.get("subject", "")

    source, px = _read_drawing(args.file)

    if px is not None:
        from binarize import pack_bitmap

        bitmap, stats = pack_bitmap(px), analyse(px)
        print("  drawn at native 40x40 — no downsample, nothing quantised\n")
    else:
        bitmap, px, stats = binarize_image(source)

    if stats["signature"] in load_existing_signatures(args.output) - {stats["signature"]}:
        print(f"error: signature {stats['signature']} is already taken — the contract "
              f"would reject this. Draw a visibly different silhouette.")
        return 1

    print(preview(px))
    print()
    for k in ("density", "density_pct", "full_ink_pct", "isolated_pct",
              "symmetry", "corner_tl_pct", "corner_tr_pct", "signature"):
        print(f"  {k:<15}: {stats[k]}")

    print("\n  warnings       : " + (", ".join(stats["warnings"]) or "none"))
    if not stats["mintable"]:
        print("  MINTABLE       : NO — density outside the hard band, mint would revert")
    else:
        print("  mintable       : yes")

    stats["subject"] = subject
    stats["traits"] = traits
    save_token(args.output, args.id, bitmap, px, traits, stats, source_image=source)
    print(f"\nwrote {args.output}/{args.id}.hex / .png / .compare.png / .json")

    if args.census and args.rpc:
        print(f"on-chain validate(): {_preflight(args.census, args.rpc, bitmap, args.minter)}")

    if stats["warnings"] or not stats["mintable"]:
        print("\nDraw it again if you can do better — nothing has been spent yet.")

    return 0 if stats["mintable"] else 1


def _preflight(census, rpc, bitmap, minter):
    try:
        r = subprocess.run(
            ["cast", "call", census, "validate(bytes,address)(bool,uint8,uint8[])",
             "0x" + bitmap.hex(), minter, "--rpc-url", rpc],
            capture_output=True, text=True, timeout=60,
        )
        return " ".join(r.stdout.split()) if r.returncode == 0 else f"error: {r.stderr.strip()}"
    except Exception as e:
        return f"skipped: {e}"


# ---------------------------------------------------------------- mint


def cmd_mint(args):
    hex_path = os.path.join(args.output, f"{args.id}.hex")
    if not os.path.exists(hex_path):
        print(f"error: no bitmap for #{args.id}. Run `build` first.")
        return 1

    key = os.environ.get("PRIVATE_KEY")
    if not key:
        print("error: PRIVATE_KEY is not set")
        return 1

    cmd = [
        "cast", "send", args.census, "mint(bytes,string)",
        "0x" + open(hex_path).read().strip(), args.persona,
        "--private-key", key, "--rpc-url", args.rpc,
    ]
    print(f"minting #{args.id}…")
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = r.stdout + r.stderr
    for line in out.splitlines():
        if line.startswith(("status", "gasUsed", "transactionHash", "Error")):
            print("  " + line)
    return r.returncode


# ---------------------------------------------------------------- sheet


def cmd_sheet(args):
    print(save_contact_sheet(args.output))
    return 0


# ---------------------------------------------------------------- cli


def main():
    ap = argparse.ArgumentParser(
        description="Census art pipeline — your agent draws, this checks and mints"
    )
    ap.add_argument("--output", default="./output")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("brief", help="assign traits and print the drawing brief")
    b.add_argument("--subject", required=True, help='what the character is')
    b.add_argument("--id", type=int, required=True)
    b.add_argument("--species", type=int, default=None,
                   help="force Species index (0-%d)" % (len(TRAIT_CATEGORIES[0][1]) - 1))
    b.set_defaults(fn=cmd_brief)

    c = sub.add_parser("build", help="binarize the agent's drawing and check it")
    c.add_argument("--id", type=int, required=True)
    c.add_argument("--file", required=True, help="PNG, SVG or any image the agent produced")
    c.add_argument("--census", default=None, help="deployed Census, for a free preflight")
    c.add_argument("--rpc", default=None)
    c.add_argument("--minter", default="0x0000000000000000000000000000000000000001")
    c.set_defaults(fn=cmd_build)

    m = sub.add_parser("mint", help="send the mint transaction")
    m.add_argument("--id", type=int, required=True)
    m.add_argument("--persona", required=True)
    m.add_argument("--census", required=True)
    m.add_argument("--rpc", required=True)
    m.set_defaults(fn=cmd_mint)

    s = sub.add_parser("sheet", help="contact sheet of everything built so far")
    s.set_defaults(fn=cmd_sheet)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Census art pipeline: persistent drafts, preflight simulation, and mint records."""

import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

from binarize import analyse, binarize_image, preview
from config import ACCEPTED_INPUTS, TRAIT_CATEGORIES
from output import (
    load_draft_manifest,
    load_existing_traits,
    load_signature_owners,
    save_contact_sheet,
    save_draft_manifest,
    save_token,
)
from traits import describe, generate_traits, to_indices


BRIEF = """\
Draw this portrait. Save it as a PNG, then run:

    python generate.py build --draft {draft_id} --file <your file>

SUBJECT
  {subject}

TRAITS — assigned once for this draft; draw all of them
  {trait_lines}

COMPOSITION
  - Head and shoulders bust, facing directly forward. Not a profile or three-quarter view.
  - Symmetrical left to right.
  - Head in the upper middle. Shoulders reach and are cut off by the bottom edge.
  - Both top corners empty. Plain pure white background.
  - No border, frame, text, signature, gradient, dithering, halftone or fine detail.

STYLE
  - Large flat stencil or screen-print regions with a heavy solid silhouette.
  - Eyes, brows and mouth are small solid black shapes, never fine lines.
  - Use solid mid-grey areas for shading.

`build` prints the real 40x40 result. Redraw when it looks wrong or warns.
"""

ENTRY_EVENT_TOPIC = None


def _run(cmd, *, timeout=120, check=False):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result


def _draft_id(args) -> str:
    value = getattr(args, "draft", None)
    legacy = getattr(args, "legacy_id", None)
    if value is None and legacy is not None:
        value = str(legacy)
        print("warning: --id is deprecated; use --draft", file=sys.stderr)
    if value is None:
        raise ValueError("--draft is required")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value):
        raise ValueError("draft id must be 1-64 letters, digits, '_' or '-'")
    return value


def _traits_hex(traits: dict) -> str:
    return "0x" + bytes(to_indices(traits)).hex()


def _sha256(data: bytes) -> str:
    return "0x" + hashlib.sha256(data).hexdigest()


def cmd_brief(args):
    draft_id = _draft_id(args)
    path = Path(args.output) / f"{draft_id}.draft.json"
    if path.exists():
        manifest = load_draft_manifest(args.output, draft_id)
        if manifest["subject"] != args.subject:
            raise ValueError(
                f"draft {draft_id!r} already belongs to subject {manifest['subject']!r}; "
                "create a new draft id"
            )
        traits = manifest["traits"]
    else:
        seed = secrets.randbits(128)
        traits = generate_traits(
            seed,
            load_existing_traits(args.output),
            {"Species": args.species} if args.species is not None else None,
        )
        manifest = {
            "version": 1,
            "draft_id": draft_id,
            "subject": args.subject,
            "seed": f"0x{seed:032x}",
            "traits": traits,
            "trait_indices": list(to_indices(traits)),
            "traits_hex": _traits_hex(traits),
            "build": None,
            "mint": None,
        }
        save_draft_manifest(args.output, draft_id, manifest)

    print(
        BRIEF.format(
            draft_id=draft_id,
            subject=args.subject,
            trait_lines="\n  ".join(f"{k:<11} {traits[k]}" for k, _ in TRAIT_CATEGORIES),
        )
    )
    return 0


def _read_drawing(path: str):
    ext = os.path.splitext(path)[1].lower()
    if ext not in ACCEPTED_INPUTS:
        raise ValueError(f"unsupported input {ext}; accepted: {', '.join(ACCEPTED_INPUTS)}")
    if ext == ".py":
        import draw

        return None, draw.run(path)
    raw = Path(path).read_bytes()
    if ext == ".svg" or (ext == ".txt" and b"<svg" in raw[:400]):
        from io import BytesIO

        import svgraster

        buf = BytesIO()
        svgraster.render(raw.decode(), size=1024).save(buf, format="PNG")
        return buf.getvalue(), None
    return raw, None


def cmd_build(args):
    draft_id = _draft_id(args)
    manifest = load_draft_manifest(args.output, draft_id)
    source, px = _read_drawing(args.file)

    if px is not None:
        from binarize import pack_bitmap

        bitmap, stats = pack_bitmap(px), analyse(px)
        source_bytes = Path(args.file).read_bytes()
        print("  drawn at native 40x40 — no downsample, nothing quantised\n")
    else:
        bitmap, px, stats = binarize_image(source)
        source_bytes = source

    owners = [owner for owner in load_signature_owners(args.output).get(stats["signature"], []) if owner != draft_id]
    if owners:
        print(
            f"error: signature {stats['signature']} already belongs to draft(s) "
            f"{', '.join(owners)}; draw a visibly different silhouette"
        )
        return 1

    print(preview(px))
    print()
    for key in (
        "density",
        "density_pct",
        "full_ink_pct",
        "isolated_pct",
        "symmetry",
        "corner_tl_pct",
        "corner_tr_pct",
        "signature",
    ):
        print(f"  {key:<15}: {stats[key]}")
    print("\n  warnings       : " + (", ".join(stats["warnings"]) or "none"))
    print("  mintable       : " + ("yes" if stats["mintable"] else "NO — density outside hard band"))

    stats["subject"] = manifest["subject"]
    stats["traits"] = manifest["traits"]
    save_token(args.output, draft_id, bitmap, px, manifest["traits"], stats, source_image=source)

    manifest["build"] = {
        "source_file": os.path.basename(args.file),
        "source_sha256": _sha256(source_bytes),
        "bitmap_sha256": _sha256(bitmap),
        "bitmap_file": f"{draft_id}.hex",
        "stats_file": f"{draft_id}.json",
        "stats": stats,
    }
    save_draft_manifest(args.output, draft_id, manifest)
    print(f"\nwrote {args.output}/{draft_id}.hex / .png / .json / .draft.json")
    if stats["warnings"] or not stats["mintable"]:
        print("\nDraw it again if you can do better — nothing has been spent yet.")
    return 0 if stats["mintable"] else 1


def _load_mint_drafts(args):
    draft_ids = args.drafts or []
    if args.legacy_ids:
        print("warning: --id is deprecated; use repeated --draft", file=sys.stderr)
        draft_ids.extend(str(i) for i in args.legacy_ids)
    if not draft_ids:
        raise ValueError("at least one --draft is required")
    if len(set(draft_ids)) != len(draft_ids):
        raise ValueError("the same draft cannot appear twice in one mint")

    personas = args.persona or []
    if len(personas) != len(draft_ids):
        raise ValueError("provide exactly one --persona for each --draft, in the same order")

    drafts = []
    signatures = set()
    for draft_id, persona in zip(draft_ids, personas):
        manifest = load_draft_manifest(args.output, draft_id)
        build = manifest.get("build")
        if not build:
            raise ValueError(f"draft {draft_id!r} has not been built")
        bitmap = bytes.fromhex((Path(args.output) / f"{draft_id}.hex").read_text().strip())
        if _sha256(bitmap) != build["bitmap_sha256"]:
            raise ValueError(f"draft {draft_id!r} bitmap changed after build")
        stats = build["stats"]
        if not stats["mintable"]:
            raise ValueError(f"draft {draft_id!r} is not locally mintable")
        if stats["warnings"] and not args.accept_warnings:
            raise ValueError(
                f"draft {draft_id!r} has warnings; redraw or pass --accept-warnings explicitly"
            )
        if stats["signature"] in signatures:
            raise ValueError(f"duplicate signature inside batch: {stats['signature']}")
        signatures.add(stats["signature"])
        drafts.append(
            {
                "id": draft_id,
                "manifest": manifest,
                "bitmap": "0x" + bitmap.hex(),
                "traits": manifest["traits_hex"],
                "persona": persona,
            }
        )
    return drafts


def _mint_call(drafts):
    if len(drafts) == 1:
        d = drafts[0]
        return "mint(bytes,bytes9,string)", [d["bitmap"], d["traits"], d["persona"]]
    return (
        "mintBatch(bytes[],bytes9[],string[])",
        [
            "[" + ",".join(d["bitmap"] for d in drafts) + "]",
            "[" + ",".join(d["traits"] for d in drafts) + "]",
            json.dumps([d["persona"] for d in drafts], separators=(",", ":")),
        ],
    )


def _sender(private_key):
    result = _run(["cast", "wallet", "address", "--private-key", private_key], check=True)
    return result.stdout.strip()


def _simulate(census, rpc, sender, signature, call_args):
    result = _run(
        ["cast", "call", census, signature, *call_args, "--from", sender, "--rpc-url", rpc],
        timeout=120,
    )
    if result.returncode:
        raise RuntimeError("exact mint simulation failed: " + (result.stderr or result.stdout).strip())


def _event_topic():
    global ENTRY_EVENT_TOPIC
    if ENTRY_EVENT_TOPIC is None:
        ENTRY_EVENT_TOPIC = _run(
            ["cast", "keccak", "EntryMinted(uint256,address,uint8,uint64,uint256)"],
            check=True,
        ).stdout.strip().lower()
    return ENTRY_EVENT_TOPIC


def _parse_receipt(receipt, drafts):
    logs = [log for log in receipt.get("logs", []) if log["topics"][0].lower() == _event_topic()]
    if len(logs) != len(drafts):
        raise RuntimeError(f"expected {len(drafts)} EntryMinted events, found {len(logs)}")
    records = []
    for draft, log in zip(drafts, logs):
        data = log["data"][2:]
        records.append(
            {
                "draft_id": draft["id"],
                "token_id": int(log["topics"][1], 16),
                "owner": "0x" + log["topics"][2][-40:],
                "skill": int(data[0:64], 16),
                "signature": f"0x{int(data[64:128], 16):016x}",
                "agent_id": int(data[128:192], 16),
            }
        )
    return records


def _save_mint_record(output_dir, receipt, records):
    tx_hash = receipt.get("transactionHash") or receipt.get("transaction_hash")
    block = receipt.get("blockNumber") or receipt.get("block_number")
    block_number = int(block, 16) if isinstance(block, str) and block.startswith("0x") else int(block)
    record = {"transaction_hash": tx_hash, "block_number": block_number, "entries": records}
    mint_dir = Path(output_dir) / "mints"
    mint_dir.mkdir(parents=True, exist_ok=True)
    (mint_dir / f"{tx_hash}.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


def cmd_mint(args):
    drafts = _load_mint_drafts(args)
    private_key = os.environ.get("PRIVATE_KEY")
    if not private_key:
        raise ValueError("PRIVATE_KEY is not set")
    sender = _sender(private_key)
    signature, call_args = _mint_call(drafts)
    print(f"simulating {len(drafts)} draft(s) from {sender}…")
    _simulate(args.census, args.rpc, sender, signature, call_args)

    result = _run(
        [
            "cast",
            "send",
            args.census,
            signature,
            *call_args,
            "--private-key",
            private_key,
            "--rpc-url",
            args.rpc,
            "--json",
        ],
        timeout=300,
    )
    if result.returncode:
        raise RuntimeError("mint failed: " + (result.stderr or result.stdout).strip())
    receipt = json.loads(result.stdout)
    records = _parse_receipt(receipt, drafts)
    mint_record = _save_mint_record(args.output, receipt, records)
    for draft, entry in zip(drafts, records):
        manifest = draft["manifest"]
        manifest["mint"] = {
            **entry,
            "transaction_hash": mint_record["transaction_hash"],
            "block_number": mint_record["block_number"],
        }
        save_draft_manifest(args.output, draft["id"], manifest)
        print(
            f"  {draft['id']} -> token {entry['token_id']}, agent {entry['agent_id']}, "
            f"skill {entry['skill']}"
        )
    print("  transaction:", mint_record["transaction_hash"])
    return 0


def cmd_sheet(args):
    print(save_contact_sheet(args.output))
    return 0


def _add_draft_arg(parser, *, multiple=False):
    kwargs = {"dest": "drafts" if multiple else "draft"}
    if multiple:
        kwargs["action"] = "append"
    parser.add_argument("--draft", **kwargs)
    legacy_kwargs = {
        "dest": "legacy_ids" if multiple else "legacy_id",
        "type": int,
        "help": argparse.SUPPRESS,
    }
    if multiple:
        legacy_kwargs["action"] = "append"
    parser.add_argument(
        "--id",
        **legacy_kwargs,
    )


def main():
    parser = argparse.ArgumentParser(description="Census art pipeline")
    parser.add_argument("--output", default="./output")
    sub = parser.add_subparsers(dest="cmd", required=True)

    brief = sub.add_parser("brief", help="create or reopen a persistent trait draft")
    brief.add_argument("--subject", required=True)
    _add_draft_arg(brief)
    brief.add_argument("--species", type=int, default=None)
    brief.set_defaults(fn=cmd_brief)

    build = sub.add_parser("build", help="binarize and inspect a draft drawing")
    _add_draft_arg(build)
    build.add_argument("--file", required=True)
    build.set_defaults(fn=cmd_build)

    mint = sub.add_parser("mint", help="simulate then mint one or more drafts")
    _add_draft_arg(mint, multiple=True)
    mint.add_argument("--persona", action="append", required=True)
    mint.add_argument("--accept-warnings", action="store_true")
    mint.add_argument("--census", required=True)
    mint.add_argument("--rpc", required=True)
    mint.set_defaults(fn=cmd_mint)

    sheet = sub.add_parser("sheet", help="contact sheet of built drafts")
    sheet.set_defaults(fn=cmd_sheet)

    args = parser.parse_args()
    try:
        return args.fn(args)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Census art pipeline: persistent drafts, preflight simulation, and mint records."""

import argparse
import getpass
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from binarize import binarize_image, preview
from config import ACCEPTED_INPUTS, BITMAP_BYTES, NEAR_DUPLICATE_PIXELS, TRAIT_CATEGORIES
from output import (
    load_draft_manifest,
    load_existing_traits,
    load_signature_owners,
    save_contact_sheet,
    save_draft_manifest,
    save_token,
)
from traits import generate_traits, official_traits_supported, to_indices


BRIEF = """\
Generate a normal high-resolution, high-contrast portrait source. Do not generate pixel
art; the pipeline owns the only 40x40 reduction and 1-bit conversion. Save it as a PNG,
then run:

    python generate.py build --draft {draft_id} --file <your file>

SUBJECT
  {subject}

TRAITS — assigned once for this draft; draw all of them
  {trait_lines}

IDENTITY
  - Preserve the requested character's role, attitude, and personal style.
  - Species controls anatomy and must be unmistakable in the face and silhouette.

COMPOSITION
  - Exact 1:1 square canvas; close-up headshot, directly front-facing, with generous clean space above every part of the head, ears, horns, hair, and headwear.
  - Nothing may touch or be cut by the source image's top edge.
  - Keep shoulders reaching the bottom and both side edges.
  - Broad flat shapes and sparse controlled facial detail that survive at 40x40.
  - Pale clean background, light face planes, and separated dark features.

STYLE
  - Normal high-resolution clean graphic portrait, not source pixel art.
  - The final preview uses the locked Census charcoal/pastel two-color palette.
  - No hatching, stippling, texture fill, large merged dark masses, border, frame,
    text, signature, watermark or scenery.

`build` prints the real 40x40 result. Warnings are informational.
"""

ENTRY_EVENT_TOPIC = None
PIPELINE_VERSION = 3
BITMAP_FORMAT = "census-1bit-v2"


def _run(cmd, *, timeout=120, check=False, env=None):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
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
        if manifest.get("version") != PIPELINE_VERSION:
            raise ValueError(
                f"draft {draft_id!r} uses a legacy bitmap format; create a new v2 draft"
            )
        if manifest["subject"] != args.subject:
            raise ValueError(
                f"draft {draft_id!r} already belongs to subject {manifest['subject']!r}; "
                "create a new draft id"
            )
        traits = manifest["traits"]
        if not official_traits_supported(traits):
            raise ValueError(
                f"draft {draft_id!r} uses a retired visual assignment; create a new draft id"
            )
    else:
        seed = secrets.randbits(128)
        traits = generate_traits(seed, load_existing_traits(args.output))
        manifest = {
            "version": PIPELINE_VERSION,
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
    return Path(path).read_bytes()


def _generator_provenance(value) -> str:
    value = value or "user:raster"
    if not re.fullmatch(r"(?:agent|user|tool):[a-z0-9][a-z0-9._-]{1,63}", value):
        raise ValueError("--generator must be agent:<name>, user:<name>, or tool:<name>")
    return value


def cmd_build(args):
    draft_id = _draft_id(args)
    manifest = load_draft_manifest(args.output, draft_id)
    generator = _generator_provenance(args.generator)
    source = _read_drawing(args.file)
    source_hash = _sha256(source)
    for other in Path(args.output).glob("*.draft.json"):
        if other.name == f"{draft_id}.draft.json":
            continue
        try:
            if json.loads(other.read_text()).get("build", {}).get("source_sha256") == source_hash:
                print(f"error: identical source image already belongs to draft {other.name[:-11]}")
                return 1
        except (OSError, ValueError, AttributeError):
            continue

    bitmap, px, stats = binarize_image(source)
    source_bytes = source

    owners = [owner for owner in load_signature_owners(args.output).get(stats["signature"], []) if owner != draft_id]
    if owners:
        print(
            f"error: signature {stats['signature']} already belongs to draft(s) "
            f"{', '.join(owners)}; draw a visibly different silhouette"
        )
        return 1

    for other in Path(args.output).glob("*.hex"):
        if other.stem == draft_id:
            continue
        try:
            candidate = bytes.fromhex(other.read_text().strip())
        except (OSError, ValueError):
            continue
        if len(candidate) != BITMAP_BYTES:
            continue
        distance = sum(bin(left ^ right).count("1") for left, right in zip(bitmap, candidate))
        if distance <= NEAR_DUPLICATE_PIXELS:
            print(
                f"error: portrait is only {distance} pixels different from draft {other.stem}; "
                "draw a genuinely different character"
            )
            return 1

    print(preview(px))
    print()
    for key in (
        "density",
        "density_pct",
        "isolated_pct",
        "symmetry",
        "corner_tl_pct",
        "corner_tr_pct",
        "signature",
        "headroom_rows",
    ):
        print(f"  {key:<15}: {stats[key]}")
    print("\n  warnings       : " + (", ".join(stats["warnings"]) or "none"))
    print("  mintable       : " + ("yes" if stats["mintable"] else "NO — density outside hard band"))

    stats["subject"] = manifest["subject"]
    stats["traits"] = manifest["traits"]
    save_token(args.output, draft_id, bitmap, px, manifest["traits"], stats, source_image=source)

    manifest["build"] = {
        "bitmap_format": BITMAP_FORMAT,
        "generator": generator,
        "source_file": os.path.basename(args.file),
        "source_sha256": source_hash,
        "bitmap_sha256": _sha256(bitmap),
        "bitmap_file": f"{draft_id}.hex",
        "stats_file": f"{draft_id}.json",
        "stats": stats,
    }
    save_draft_manifest(args.output, draft_id, manifest)
    print(f"\nwrote {args.output}/{draft_id}.hex / .png / .json / .draft.json")
    if stats["warnings"]:
        print("\nWarnings are informational and do not block minting.")
    if not stats["mintable"]:
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
    if personas and len(personas) != len(draft_ids):
        raise ValueError("provide exactly one --persona for each --draft, in the same order")

    drafts = []
    signatures = set()
    for index, draft_id in enumerate(draft_ids):
        manifest = load_draft_manifest(args.output, draft_id)
        persona = personas[index] if personas else manifest["subject"]
        build = manifest.get("build")
        if not build:
            raise ValueError(f"draft {draft_id!r} has not been built")
        if manifest.get("version") != PIPELINE_VERSION or build.get("bitmap_format") != BITMAP_FORMAT:
            raise ValueError(f"draft {draft_id!r} is not built for {BITMAP_FORMAT}")
        _generator_provenance(build.get("generator"))
        if not official_traits_supported(manifest.get("traits", {})):
            raise ValueError(
                f"draft {draft_id!r} uses a retired one-eye or aquatic assignment; "
                "create a new draft"
            )
        bitmap = bytes.fromhex((Path(args.output) / f"{draft_id}.hex").read_text().strip())
        if _sha256(bitmap) != build["bitmap_sha256"]:
            raise ValueError(f"draft {draft_id!r} bitmap changed after build")
        review = manifest.get("visual_review") or {}
        if (
            not review.get("species_match")
            or not review.get("framing_ok")
            or not review.get("readable")
            or not review.get("user_approved")
            or review.get("bitmap_sha256") != build["bitmap_sha256"]
        ):
            raise ValueError(
                f"draft {draft_id!r} needs an approved current preview; show the 40×40 PNG "
                "to the user, then run `review --species-match --framing-ok --readable "
                "--user-approved`"
            )
        stats = build["stats"]
        if stats.get("headroom_rows", 0) <= 4:
            raise ValueError(
                f"draft {draft_id!r} touches the top crop; regenerate it with visible headroom"
            )
        if not stats["mintable"]:
            raise ValueError(f"draft {draft_id!r} is not locally mintable")
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


def _wallet_credentials():
    private_key = os.environ.get("PRIVATE_KEY")
    if private_key:
        return ["--private-key", private_key], None

    keystore = os.environ.get("ETH_KEYSTORE")
    account = os.environ.get("ETH_KEYSTORE_ACCOUNT")
    if not keystore and not account:
        raise ValueError(
            "no signing wallet configured; create an encrypted local wallet with "
            "`cast wallet new ~/.foundry/keystores census` and set ETH_KEYSTORE_ACCOUNT=census"
        )
    args = ["--keystore", keystore] if keystore else ["--account", account]
    child_env = os.environ.copy()
    if not child_env.get("ETH_PASSWORD"):
        child_env["ETH_PASSWORD"] = getpass.getpass("Encrypted Cast wallet password: ")
    return args, child_env


def _sender(wallet_args, wallet_env):
    result = _run(["cast", "wallet", "address", *wallet_args], check=True, env=wallet_env)
    return result.stdout.strip()


def _require_v6(census, rpc):
    result = _run(["cast", "call", census, "SUPPLY()(uint256)", "--rpc-url", rpc], check=True)
    if int(result.stdout.strip()) != 5000:
        raise RuntimeError("configured contract is not Census v6 (expected supply 5000)")


def _require_funded(sender, rpc):
    result = _run(["cast", "balance", sender, "--rpc-url", rpc], check=True)
    if int(result.stdout.strip()) == 0:
        raise RuntimeError(
            f"wallet {sender} has no Sepolia ETH; fund this public address from "
            "https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
        )


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
    deployment = json.loads(
        (Path(__file__).resolve().parents[1] / "config" / "sepolia.json").read_text()
    )
    census = args.census or deployment["census"]
    rpc = (
        args.rpc
        or os.environ.get("SEPOLIA_RPC_URL")
        or os.environ.get("RPC_URL")
        or deployment["publicRpc"]
    )
    wallet_args, wallet_env = _wallet_credentials()
    sender = _sender(wallet_args, wallet_env)
    _require_v6(census, rpc)
    _require_funded(sender, rpc)
    signature, call_args = _mint_call(drafts)
    print(f"simulating {len(drafts)} draft(s) from {sender}…")
    _simulate(census, rpc, sender, signature, call_args)

    result = _run(
        [
            "cast",
            "send",
            census,
            signature,
            *call_args,
            *wallet_args,
            "--rpc-url",
            rpc,
            "--json",
        ],
        timeout=300,
        env=wallet_env,
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


def cmd_review(args):
    draft_id = _draft_id(args)
    manifest = load_draft_manifest(args.output, draft_id)
    build = manifest.get("build")
    if not build:
        raise ValueError(f"draft {draft_id!r} has not been built")
    if not args.species_match:
        raise ValueError("Species/Class mismatch: revise the source before minting")
    if not args.framing_ok:
        raise ValueError("framing rejected: no head, hair, ears, horns, or headwear may be cut")
    if not args.readable:
        raise ValueError("preview unreadable: revise the source before minting")
    if not args.user_approved:
        raise ValueError("show the exact 40×40 preview and wait for user approval")
    if build.get("stats", {}).get("headroom_rows", 0) <= 4:
        raise ValueError("head touches the portrait crop; regenerate with more top space")
    manifest["visual_review"] = {
        "species": manifest["traits"]["Species"],
        "species_match": True,
        "framing_ok": True,
        "readable": True,
        "user_approved": True,
        "bitmap_sha256": build["bitmap_sha256"],
        "reviewer": _generator_provenance(args.reviewer),
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    save_draft_manifest(args.output, draft_id, manifest)
    preview_path = (Path(args.output) / f"{draft_id}.png").resolve()
    compare_path = (Path(args.output) / f"{draft_id}.compare.png").resolve()
    print(f"Approved preview locked for {draft_id}: {manifest['traits']['Species']}")
    print(f"  preview: {preview_path}")
    print(f"  source comparison: {compare_path}")
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
    brief.set_defaults(fn=cmd_brief)

    build = sub.add_parser("build", help="binarize and inspect a draft drawing")
    _add_draft_arg(build)
    build.add_argument("--file", required=True)
    build.add_argument(
        "--generator",
        default="user:raster",
        help="optional provenance, for example agent:codex-imagegen or user:upload",
    )
    build.set_defaults(fn=cmd_build)

    review = sub.add_parser("review", help="lock the user-approved exact 40×40 preview")
    _add_draft_arg(review)
    review.add_argument("--species-match", action="store_true", required=True)
    review.add_argument("--framing-ok", action="store_true", required=True)
    review.add_argument("--readable", action="store_true", required=True)
    review.add_argument("--user-approved", action="store_true", required=True)
    review.add_argument("--reviewer", default="agent:visual-review")
    review.set_defaults(fn=cmd_review)

    mint = sub.add_parser("mint", help="simulate then mint one or more drafts")
    _add_draft_arg(mint, multiple=True)
    mint.add_argument("--persona", action="append", help="defaults to the draft subject")
    mint.add_argument("--accept-warnings", action="store_true", help=argparse.SUPPRESS)
    mint.add_argument("--census", help="defaults to config/sepolia.json")
    mint.add_argument("--rpc", help="defaults to environment or config/sepolia.json")
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

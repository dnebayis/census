import argparse
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

import generate
from binarize import analyse, unpack_bitmap
from output import load_existing_traits, load_signature_owners, save_draft_manifest
from traits import generate_traits, to_indices


VALID_TRAITS = {
    "Species": "human",
    "Age": "young",
    "Hair": "bald",
    "Eyes": "plain eyes",
    "Facial": "clean shaven",
    "Expression": "neutral",
    "Headwear": "bare head",
    "Attire": "plain collar",
    "Accessory": "none",
}


class PipelineTest(unittest.TestCase):
    def test_bitmap_python_matches_naive_reference_with_409_byte_records(self):
        rng = random.Random(80048217)
        for _ in range(256):
            record = rng.randbytes(400) + rng.randbytes(9)
            bitmap = record[:400]
            pixels = unpack_bitmap(bitmap)
            stats = analyse(pixels)

            lit = sum(tone != 0 for tone in pixels)
            signature = 0
            for block_row in range(8):
                for block_col in range(8):
                    count = 0
                    for row in range(5):
                        for col in range(5):
                            index = (block_row * 5 + row) * 40 + block_col * 5 + col
                            count += pixels[index] != 0
                    if count >= 13:
                        signature |= 1 << (block_row * 8 + block_col)

            self.assertEqual(stats["density"], lit)
            self.assertEqual(stats["signature"], f"0x{signature:016x}")

    def test_brief_persists_seed_and_assignment(self):
        with tempfile.TemporaryDirectory() as output:
            args = argparse.Namespace(
                draft="alpha",
                legacy_id=None,
                output=output,
                subject="a patient archivist",
                species=None,
            )
            with patch("generate.secrets.randbits", return_value=123):
                self.assertEqual(generate.cmd_brief(args), 0)
            first = json.loads((Path(output) / "alpha.draft.json").read_text())

            with patch("generate.secrets.randbits", side_effect=AssertionError("rerolled")):
                self.assertEqual(generate.cmd_brief(args), 0)
            second = json.loads((Path(output) / "alpha.draft.json").read_text())
            self.assertEqual(first["seed"], "0x0000000000000000000000000000007b")
            self.assertEqual(first["trait_indices"], second["trait_indices"])

    def test_unbuilt_draft_reserves_its_trait_combination(self):
        with tempfile.TemporaryDirectory() as output:
            save_draft_manifest(
                output,
                "reserved",
                {"trait_indices": [0, 0, 0, 0, 0, 0, 0, 0, 0]},
            )
            self.assertIn((0, 0, 0, 0, 0, 0, 0, 0, 0), load_existing_traits(output))

    def test_weighted_aliases_serialize_to_the_checked_combination(self):
        traits = generate_traits(1, forced={"Species": 3})
        self.assertEqual(to_indices(traits)[0], 0)

    def test_signature_owners_are_not_collapsed_to_a_set_bug(self):
        with tempfile.TemporaryDirectory() as output:
            Path(output, "one.json").write_text('{"signature":"0xabc"}')
            Path(output, "two.json").write_text('{"signature":"0xabc"}')
            self.assertEqual(load_signature_owners(output)["0xabc"], ["one", "two"])

    def test_mint_uses_single_or_batch_abi(self):
        first = {
            "bitmap": "0x01",
            "traits": "0x000000000000000000",
            "persona": "one",
        }
        second = {
            "bitmap": "0x02",
            "traits": "0x000000000000000000",
            "persona": "two",
        }
        signature, args = generate._mint_call([first])
        self.assertEqual(signature, "mint(bytes,bytes9,string)")
        self.assertEqual(args[-1], "one")

        signature, args = generate._mint_call([first, second])
        self.assertEqual(signature, "mintBatch(bytes[],bytes9[],string[])")
        self.assertEqual(args[0], "[0x01,0x02]")
        self.assertEqual(json.loads(args[2]), ["one", "two"])

    def test_warning_requires_explicit_acceptance(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(400)
            Path(output, "warn.hex").write_text(bitmap.hex())
            manifest = {
                "traits": VALID_TRAITS,
                "traits_hex": "0x000000000000000000",
                "build": {
                    "bitmap_sha256": generate._sha256(bitmap),
                    "stats": {
                        "mintable": True,
                        "warnings": ["asymmetric"],
                        "signature": "0x01",
                    },
                },
            }
            save_draft_manifest(output, "warn", manifest)
            args = argparse.Namespace(
                drafts=["warn"],
                legacy_ids=None,
                persona=["context"],
                output=output,
                accept_warnings=False,
            )
            with self.assertRaisesRegex(ValueError, "--accept-warnings"):
                generate._load_mint_drafts(args)
            args.accept_warnings = True
            self.assertEqual(generate._load_mint_drafts(args)[0]["id"], "warn")

    def test_batch_duplicate_stops_before_transaction(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(400)
            for draft_id in ("a", "b"):
                Path(output, f"{draft_id}.hex").write_text(bitmap.hex())
                save_draft_manifest(
                    output,
                    draft_id,
                    {
                        "traits": VALID_TRAITS,
                        "traits_hex": "0x000000000000000000",
                        "build": {
                            "bitmap_sha256": generate._sha256(bitmap),
                            "stats": {
                                "mintable": True,
                                "warnings": [],
                                "signature": "0xsame",
                            },
                        },
                    },
                )
            args = argparse.Namespace(
                drafts=["a", "b"],
                legacy_ids=None,
                persona=["one", "two"],
                output=output,
                accept_warnings=False,
            )
            with self.assertRaisesRegex(ValueError, "duplicate signature inside batch"):
                generate._load_mint_drafts(args)

    def test_receipt_maps_each_draft_to_real_token_and_agent_ids(self):
        topic = "0x" + "ab" * 32
        generate.ENTRY_EVENT_TOPIC = topic

        def word(value):
            return f"{value:064x}"

        receipt = {
            "logs": [
                {
                    "topics": [topic, "0x" + word(11), "0x" + word(0x1234)],
                    "data": "0x" + word(2) + word(0x55) + word(101),
                },
                {
                    "topics": [topic, "0x" + word(12), "0x" + word(0x1234)],
                    "data": "0x" + word(6) + word(0x66) + word(102),
                },
            ]
        }
        records = generate._parse_receipt(receipt, [{"id": "a"}, {"id": "b"}])
        self.assertEqual(
            [(r["draft_id"], r["token_id"], r["agent_id"]) for r in records],
            [("a", 11, 101), ("b", 12, 102)],
        )


if __name__ == "__main__":
    unittest.main()

import argparse
import io
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

import generate
from config import TRAIT_CATEGORIES
from PIL import Image
from binarize import analyse, binarize_image, pack_bitmap, resize_to_grid, threshold_binarize, unpack_bitmap
from output import PALETTE, load_existing_traits, load_signature_owners, save_draft_manifest
from traits import generate_traits, official_traits_supported, to_indices


VALID_TRAITS = {
    "Species": "Human",
    "Age": "Young",
    "Hair": "Bald",
    "Eyes": "Plain Eyes",
    "Facial": "Clean Shaven",
    "Expression": "Neutral",
    "Headwear": "Bare Head",
    "Attire": "Plain Collar",
    "Accessory": "None",
}


def approved_review(bitmap):
    return {
        "species_match": True,
        "framing_ok": True,
        "readable": True,
        "user_approved": True,
        "bitmap_sha256": generate._sha256(bitmap),
    }


class PipelineTest(unittest.TestCase):
    def test_brief_uses_self_contained_sparse_visual_language(self):
        brief = generate.BRIEF.lower()
        self.assertIn("broad flat shapes", brief)
        self.assertIn("no hatching", brief)
        self.assertIn("clean graphic portrait", brief)

    def test_one_bit_threshold_packing_and_census_palette(self):
        gray = Image.new("L", (40, 40), 255)
        gray.putpixel((0, 0), 128)
        gray.putpixel((1, 0), 129)
        pixels = threshold_binarize(gray)
        bitmap = pack_bitmap(pixels)

        self.assertEqual(len(bitmap), 200)
        self.assertEqual(bitmap[0], 0x80)
        self.assertEqual(PALETTE, {0: (233, 221, 199), 1: (52, 52, 58)})

        pixels[2] = 2
        with self.assertRaisesRegex(ValueError, "0 or 1"):
            pack_bitmap(pixels)

    def test_portrait_framing_reserves_four_rows_and_anchors_bottom(self):
        framed = resize_to_grid(Image.new("RGB", (80, 80), "black")).convert("L")
        self.assertTrue(all(framed.getpixel((x, y)) == 255 for y in range(4) for x in range(40)))
        self.assertTrue(
            all(framed.getpixel((x, y)) == 0 for y in range(4, 40) for x in range(40))
        )
        self.assertEqual(framed.getpixel((2, 39)), 0, "portrait must reach the bottom")

    def test_portrait_cover_crop_preserves_tall_source_proportions(self):
        source = Image.new("RGB", (100, 200), "white")
        source.paste("black", (40, 60, 60, 80))
        framed = resize_to_grid(source).convert("L")
        foreground = framed.point(lambda value: 255 if value <= 128 else 0)
        left, top, right, bottom = foreground.getbbox()
        self.assertLessEqual(abs((right - left) - (bottom - top)), 1)

    def test_dense_portrait_gets_nonblocking_readability_warning(self):
        pixels = [0] * 1600
        pixels[24 * 40 :] = [1] * (16 * 40)
        stats = analyse(pixels)
        self.assertEqual(stats["density_pct"], 40.0)
        self.assertIn("dense — facial detail may merge", stats["warnings"])
        self.assertTrue(stats["mintable"])

    def test_build_accepts_rasters_with_optional_provenance(self):
        with tempfile.TemporaryDirectory() as output:
            png = Path(output) / "portrait.png"
            buffer = io.BytesIO()
            Image.new("RGB", (64, 64), "white").save(buffer, format="PNG")
            png.write_bytes(buffer.getvalue())
            self.assertEqual(generate._read_drawing(str(png)), buffer.getvalue())

            svg = Path(output) / "portrait.svg"
            svg.write_text("<svg/>")
            with self.assertRaisesRegex(ValueError, "unsupported input"):
                generate._read_drawing(str(svg))
            with self.assertRaisesRegex(ValueError, "generator"):
                generate._generator_provenance("manual")
            self.assertEqual(
                generate._generator_provenance("agent:codex-imagegen"),
                "agent:codex-imagegen",
            )
            self.assertEqual(generate._generator_provenance(None), "user:raster")

    def test_bitmap_python_matches_naive_reference_with_209_byte_records(self):
        rng = random.Random(80048217)
        for _ in range(256):
            record = rng.randbytes(200) + rng.randbytes(9)
            bitmap = record[:200]
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

    def test_forced_trait_serializes_to_its_unique_contract_index(self):
        traits = generate_traits(1, forced={"Species": 3})
        self.assertEqual(to_indices(traits)[0], 3)
        self.assertEqual(traits["Species"], "Android with Visible Seams")

    def test_five_thousand_draws_follow_species_targets(self):
        species = next(options for key, options in TRAIT_CATEGORIES if key == "Species")
        counts = {name: 0 for name in species}
        vr = 0
        for seed in range(5000):
            traits = generate_traits(seed)
            counts[traits["Species"]] += 1
            vr += traits["Eyes"] == "VR Headset"
        self.assertTrue(1800 <= counts["Human"] <= 2200)
        self.assertTrue(20 <= counts["Crystalline Being"] <= 90)
        self.assertTrue(15 <= vr <= 80)
        self.assertEqual(counts["Aquatic Humanoid"], 0)
        self.assertTrue(all(official_traits_supported(generate_traits(seed)) for seed in range(5000)))

    def test_one_eye_and_aquatic_assignments_are_retired_from_public_flow(self):
        for eyes in ("One Eye Scarred Shut", "Single Large Eye", "Eyepatch"):
            traits = {**VALID_TRAITS, "Eyes": eyes}
            self.assertFalse(official_traits_supported(traits))
        self.assertFalse(
            official_traits_supported({**VALID_TRAITS, "Species": "Aquatic Humanoid"})
        )

    def test_headroom_metric_detects_a_portrait_touching_the_crop(self):
        pixels = [0] * 1600
        pixels[4 * 40 + 20] = 1
        self.assertEqual(analyse(pixels)["headroom_rows"], 4)
        self.assertIn("head touches portrait crop — regenerate with more top space", analyse(pixels)["warnings"])

    def test_dense_draft_calibrates_without_changing_global_threshold(self):
        image = Image.new("L", (40, 40))
        for x in range(40):
            for y in range(40):
                image.putpixel((x, y), 80 + 2 * x)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        _, _, stats = binarize_image(buffer.getvalue())
        self.assertEqual(stats["calibration"]["mode"], "draft-local")
        self.assertEqual(stats["calibration"]["selected_threshold"], 112)
        self.assertTrue(32 <= stats["density_pct"] <= 42)

    def test_border_observer_regression_uses_draft_local_calibration(self):
        source = Path(__file__).parent / "output" / "v5-border-observer.src.png"
        gray = resize_to_grid(Image.open(source)).convert("L")
        self.assertEqual(analyse(threshold_binarize(gray))["density_pct"], 58.0)
        _, _, calibrated = binarize_image(source)
        self.assertEqual(calibrated["calibration"]["mode"], "draft-local")
        self.assertLess(calibrated["calibration"]["selected_threshold"], 128)
        self.assertTrue(32 <= calibrated["density_pct"] <= 42)

    def test_normal_28_2_percent_fixture_is_byte_identical(self):
        pixels = [1] * 451 + [0] * (1600 - 451)
        self.assertEqual(analyse(pixels)["density_pct"], 28.2)
        image = Image.new("L", (40, 40), 255)
        image.putdata([0 if pixel else 255 for pixel in pixels])
        framed = resize_to_grid(image).convert("L")
        default = threshold_binarize(framed)
        # The crop reserves four top rows, so this fixture checks the invariant at the
        # conversion boundary rather than assuming source coordinates survive framing.
        self.assertLessEqual(analyse(default)["density_pct"], 45)
        self.assertEqual(
            pack_bitmap(default),
            pack_bitmap(threshold_binarize(framed, 128)),
        )

    def test_sparse_fixture_never_enters_calibration(self):
        image = Image.new("L", (40, 40), 255)
        for x in range(10, 20):
            for y in range(10, 20):
                image.putpixel((x, y), 0)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        _, _, stats = binarize_image(buffer.getvalue())
        self.assertEqual(stats["calibration"]["mode"], "default")
        self.assertEqual(stats["calibration"]["selected_threshold"], 128)

    def test_signature_owners_are_not_collapsed_to_a_set_bug(self):
        with tempfile.TemporaryDirectory() as output:
            Path(output, "one.json").write_text('{"bytes":200,"signature":"0xabc"}')
            Path(output, "two.json").write_text('{"bytes":200,"signature":"0xabc"}')
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

    def test_warning_is_informational_during_mint(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(200)
            Path(output, "warn.hex").write_text(bitmap.hex())
            manifest = {
                "version": generate.PIPELINE_VERSION,
                "traits": VALID_TRAITS,
                "traits_hex": "0x000000000000000000",
                "visual_review": approved_review(bitmap),
                "build": {
                    "bitmap_format": generate.BITMAP_FORMAT,
                    "generator": "agent:test-imagegen",
                    "bitmap_sha256": generate._sha256(bitmap),
                    "stats": {
                        "mintable": True,
                        "warnings": ["asymmetric"],
                        "signature": "0x01",
                        "headroom_rows": 5,
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
            self.assertEqual(generate._load_mint_drafts(args)[0]["id"], "warn")

    def test_persona_defaults_to_draft_subject(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(200)
            Path(output, "plain.hex").write_text(bitmap.hex())
            save_draft_manifest(
                output,
                "plain",
                {
                    "version": generate.PIPELINE_VERSION,
                    "subject": "a plain portrait",
                    "traits": VALID_TRAITS,
                    "traits_hex": "0x000000000000000000",
                    "visual_review": approved_review(bitmap),
                    "build": {
                        "bitmap_format": generate.BITMAP_FORMAT,
                        "generator": "user:raster",
                        "bitmap_sha256": generate._sha256(bitmap),
                        "stats": {"mintable": True, "warnings": [], "signature": "0x01", "headroom_rows": 5},
                    },
                },
            )
            args = argparse.Namespace(
                drafts=["plain"],
                legacy_ids=None,
                persona=None,
                output=output,
                accept_warnings=False,
            )
            self.assertEqual(
                generate._load_mint_drafts(args)[0]["persona"], "a plain portrait"
            )

    def test_legacy_two_bit_draft_cannot_enter_mint(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(400)
            Path(output, "legacy.hex").write_text(bitmap.hex())
            save_draft_manifest(
                output,
                "legacy",
                {
                    "version": 1,
                    "traits": VALID_TRAITS,
                    "traits_hex": "0x000000000000000000",
                    "visual_review": approved_review(bitmap),
                    "build": {
                        "bitmap_format": "census-2bit-v1",
                        "generator": "agent:test-imagegen",
                        "bitmap_sha256": generate._sha256(bitmap),
                        "stats": {"mintable": True, "warnings": [], "signature": "0x01", "headroom_rows": 5},
                    },
                },
            )
            args = argparse.Namespace(
                drafts=["legacy"],
                legacy_ids=None,
                persona=["context"],
                output=output,
                accept_warnings=False,
            )
            with self.assertRaisesRegex(ValueError, generate.BITMAP_FORMAT):
                generate._load_mint_drafts(args)

    def test_batch_duplicate_stops_before_transaction(self):
        with tempfile.TemporaryDirectory() as output:
            bitmap = bytes(200)
            for draft_id in ("a", "b"):
                Path(output, f"{draft_id}.hex").write_text(bitmap.hex())
                save_draft_manifest(
                    output,
                    draft_id,
                    {
                        "version": generate.PIPELINE_VERSION,
                        "traits": VALID_TRAITS,
                        "traits_hex": "0x000000000000000000",
                        "visual_review": approved_review(bitmap),
                        "build": {
                            "bitmap_format": generate.BITMAP_FORMAT,
                            "generator": "agent:test-imagegen",
                            "bitmap_sha256": generate._sha256(bitmap),
                            "stats": {
                                "mintable": True,
                                "warnings": [],
                                "signature": "0xsame",
                                "headroom_rows": 5,
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

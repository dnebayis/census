// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Bitmap} from "../src/lib/Bitmap.sol";

/// @notice Proves the optimised `Bitmap.analyze` is behaviourally identical to a naive
///         pixel-by-pixel reference.
/// @dev `analyze` was rewritten twice for gas — first from per-pixel reads to per-row word
///      loads, then from a `uint256[8] memory` accumulator to a packed stack word. Both
///      rewrites are the kind that can silently change results. This is a differential test
///      against a deliberately dumb implementation that mirrors the spec sentence for
///      sentence, fuzzed over arbitrary input.
contract BitmapEquivalenceTest is Test {
    /// @dev Straight transcription of SPEC §3.4. Slow, obvious, and independent of every
    ///      trick used in the real implementation.
    function _naive(bytes memory bm) internal pure returns (uint256 lit, uint64 sig) {
        for (uint256 br = 0; br < 8; ++br) {
            for (uint256 bc = 0; bc < 8; ++bc) {
                uint256 n;
                for (uint256 r = 0; r < 5; ++r) {
                    for (uint256 c = 0; c < 5; ++c) {
                        uint256 idx = (br * 5 + r) * 40 + (bc * 5 + c);
                        uint256 b = uint8(bm[idx >> 3]);
                        if (((b >> (7 - (idx & 7))) & 1) != 0) ++n;
                    }
                }
                lit += n;
                if (n >= 13) sig |= uint64(1) << uint64(br * 8 + bc);
            }
        }
    }

    function _pad(bytes memory seedBytes) internal pure returns (bytes memory bm) {
        bm = new bytes(200);
        for (uint256 i; i < 200; ++i) {
            bm[i] = seedBytes.length == 0 ? bytes1(0) : seedBytes[i % seedBytes.length];
        }
    }

    function testFuzz_MatchesNaiveReference(bytes memory raw) public pure {
        bytes memory bm = _pad(raw);

        (uint256 litFast, uint64 sigFast) = Bitmap.analyze(bm);
        (uint256 litSlow, uint64 sigSlow) = _naive(bm);

        assertEq(litFast, litSlow, "lit count diverged from reference");
        assertEq(sigFast, sigSlow, "signature diverged from reference");
    }

    function testFuzz_MatchesOnPseudorandomBitmaps(uint256 seed) public pure {
        bytes memory bm = new bytes(200);
        for (uint256 i; i < 200; ++i) {
            bm[i] = bytes1(uint8(uint256(keccak256(abi.encode(seed, i)))));
        }

        (uint256 litFast, uint64 sigFast) = Bitmap.analyze(bm);
        (uint256 litSlow, uint64 sigSlow) = _naive(bm);

        assertEq(litFast, litSlow);
        assertEq(sigFast, sigSlow);
    }

    function test_AllZero() public pure {
        bytes memory bm = new bytes(200);
        (uint256 lit, uint64 sig) = Bitmap.analyze(bm);
        assertEq(lit, 0);
        assertEq(sig, 0);
    }

    function test_AllFull() public pure {
        bytes memory bm = new bytes(200);
        for (uint256 i; i < 200; ++i) {
            bm[i] = 0xFF;
        }
        (uint256 lit, uint64 sig) = Bitmap.analyze(bm);
        assertEq(lit, 1600, "every pixel must count as lit");
        assertEq(sig, type(uint64).max, "every block must be set");
    }

    /// @dev The block-majority boundary is 13 of 25. Off-by-one here would reshape every
    ///      signature in the collection.
    function test_MajorityBoundaryIsThirteen() public pure {
        bytes memory bm = new bytes(200);
        // light exactly 12 pixels of block (0,0) — must stay unset
        _light(bm, 12);
        (, uint64 sig) = Bitmap.analyze(bm);
        assertEq(sig & 1, 0, "12 of 25 must not set the block bit");

        bm = new bytes(200);
        _light(bm, 13);
        (, sig) = Bitmap.analyze(bm);
        assertEq(sig & 1, 1, "13 of 25 must set the block bit");
    }

    function _light(bytes memory bm, uint256 count) internal pure {
        uint256 done;
        for (uint256 r = 0; r < 5 && done < count; ++r) {
            for (uint256 c = 0; c < 5 && done < count; ++c) {
                uint256 idx = r * 40 + c;
                uint256 b = idx >> 3;
                uint256 shift = 7 - (idx & 7);
                bm[b] = bytes1(uint8(uint8(bm[b]) | (uint8(1) << uint8(shift))));
                ++done;
            }
        }
    }
}

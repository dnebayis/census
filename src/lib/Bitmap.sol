// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Bitmap
/// @notice 40x40, 2 bits per pixel, row-major, MSB-first within each byte.
/// @dev 1600 pixels = 3200 bits = 400 bytes. 40 pixels per row divides evenly into
///      exactly 10 bytes, so no pixel ever straddles a row boundary.
///
///      Tone values: 0 = background, 1 and 2 = mid tones, 3 = full ink.
///      A pixel is "lit" when its value is non-zero.
///
///      Split by cost: `analyze` is all `mint` needs and touches each pixel once.
///      The soft-check helpers are only ever called from the `validate` view, so their
///      neighbour lookups never land in a transaction.
library Bitmap {
    uint256 internal constant DIM = 40;
    uint256 internal constant PIXELS = 1600;
    uint256 internal constant BYTE_LEN = 400;

    /// @notice Tone of a single pixel, 0-3.
    function pixelAt(bytes memory bm, uint256 idx) internal pure returns (uint256 v) {
        unchecked {
            uint256 b = uint8(bm[idx >> 2]);
            return (b >> (6 - ((idx & 3) << 1))) & 3;
        }
    }

    /// @notice Tone at (row, col).
    function pixelAtRC(bytes memory bm, uint256 row, uint256 col) internal pure returns (uint256) {
        unchecked {
            return pixelAt(bm, row * DIM + col);
        }
    }

    /// @dev LSB of each of five 2-bit fields inside a 10-bit chunk: bits 0,2,4,6,8.
    uint256 private constant FIELD_LSBS = 0x155;

    /// @notice Single pass producing everything `mint` needs.
    /// @return lit   count of non-zero pixels, over 1600
    /// @return sig   the 8x8 coarse silhouette used as the uniqueness key
    /// @dev The 64 blocks of 5x5 tile the grid exactly, so every pixel is counted once, and
    ///      a block bit is set when a majority of its 25 pixels are lit.
    ///
    ///      Works a row at a time rather than a pixel at a time. A row is exactly 10 bytes,
    ///      so one `mload` covers it and each 5-pixel block column is a 10-bit slice of that
    ///      word. `(x | x >> 1) & FIELD_LSBS` collapses each 2-bit tone to one bit saying
    ///      "lit", which is then summed directly. That replaces 1600 bounds-checked memory
    ///      reads with 40 loads, and is worth roughly 10x on the dominant cost in `mint`.
    function analyze(bytes memory bm) internal pure returns (uint256 lit, uint64 sig) {
        unchecked {
            for (uint256 br = 0; br < 8; ++br) {
                // Eight block counters packed into one stack word, 32 bits each. A block
                // tops out at 25, so the fields can never carry into one another. Holding
                // them on the stack instead of in a `uint256[8] memory` removes a bounds
                // check and an MLOAD/MSTORE pair from all 320 inner iterations.
                uint256 acc;

                for (uint256 r = 0; r < 5; ++r) {
                    uint256 word;
                    uint256 offset = (br * 5 + r) * 10;
                    // Safe past the final row: only the top 80 bits are ever read, and those
                    // always lie inside the 400-byte array.
                    assembly ("memory-safe") {
                        word := mload(add(add(bm, 0x20), offset))
                    }

                    for (uint256 bc = 0; bc < 8; ++bc) {
                        uint256 t = (word >> (246 - bc * 10)) & 0x3FF;
                        t = (t | (t >> 1)) & FIELD_LSBS;
                        t = (t & 1) + ((t >> 2) & 1) + ((t >> 4) & 1) + ((t >> 6) & 1) + ((t >> 8) & 1);
                        acc += t << (bc << 5);
                    }
                }

                for (uint256 bc = 0; bc < 8; ++bc) {
                    uint256 n = (acc >> (bc << 5)) & 0xFFFFFFFF;
                    lit += n;
                    // forge-lint: disable-next-line(unsafe-typecast) — br*8+bc is at most 63
                    if (n >= 13) sig |= uint64(1) << uint64(br * 8 + bc);
                }
            }
        }
    }

    /// @notice Hamming distance between the left half of the signature and the mirrored right half.
    /// @return d mismatches out of 32 comparable bits — high values mean the portrait is not front-facing.
    function symmetryDistance(uint64 sig) internal pure returns (uint256 d) {
        unchecked {
            for (uint256 r = 0; r < 8; ++r) {
                for (uint256 c = 0; c < 4; ++c) {
                    uint256 l = (sig >> (r * 8 + c)) & 1;
                    uint256 m = (sig >> (r * 8 + (7 - c))) & 1;
                    if (l != m) ++d;
                }
            }
        }
    }

    /// @notice Lit-pixel counts inside the two 8x8 top corner blocks, 64 pixels each.
    /// @dev A crowded corner means the head is framed badly or the background is not clear.
    function cornerDensity(bytes memory bm) internal pure returns (uint256 tl, uint256 tr) {
        unchecked {
            for (uint256 r = 0; r < 8; ++r) {
                for (uint256 c = 0; c < 8; ++c) {
                    if (pixelAtRC(bm, r, c) != 0) ++tl;
                    if (pixelAtRC(bm, r, DIM - 8 + c) != 0) ++tr;
                }
            }
        }
    }

    /// @notice Lit pixels with no lit orthogonal neighbour.
    /// @dev Dithering and noise produce many of these; deliberate shading produces few.
    function isolationCount(bytes memory bm) internal pure returns (uint256 isolated) {
        unchecked {
            for (uint256 r = 0; r < DIM; ++r) {
                for (uint256 c = 0; c < DIM; ++c) {
                    if (pixelAtRC(bm, r, c) == 0) continue;
                    bool touching = (r > 0 && pixelAtRC(bm, r - 1, c) != 0)
                        || (r + 1 < DIM && pixelAtRC(bm, r + 1, c) != 0) || (c > 0 && pixelAtRC(bm, r, c - 1) != 0)
                        || (c + 1 < DIM && pixelAtRC(bm, r, c + 1) != 0);
                    if (!touching) ++isolated;
                }
            }
        }
    }

    /// @notice Count of pixels at full ink (tone 3).
    /// @dev Compared against `lit` to flag art that ignores the mid tones and wastes the 2-bit depth.
    function fullInkCount(bytes memory bm) internal pure returns (uint256 full) {
        unchecked {
            for (uint256 i = 0; i < PIXELS; ++i) {
                if (pixelAt(bm, i) == 3) ++full;
            }
        }
    }
}

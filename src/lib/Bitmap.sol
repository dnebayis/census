// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Bitmap
/// @notice 40x40, 1 bit per pixel, row-major, MSB-first within each byte.
/// @dev 1600 pixels = 1600 bits = 200 bytes. Each row is exactly five bytes.
library Bitmap {
    uint256 internal constant DIM = 40;
    uint256 internal constant PIXELS = 1600;
    uint256 internal constant BYTE_LEN = 200;

    /// @notice Value of a single pixel, 0 or 1.
    function pixelAt(bytes memory bm, uint256 idx) internal pure returns (uint256) {
        unchecked {
            return (uint8(bm[idx >> 3]) >> (7 - (idx & 7))) & 1;
        }
    }

    /// @notice Value at (row, col).
    function pixelAtRC(bytes memory bm, uint256 row, uint256 col) internal pure returns (uint256) {
        unchecked {
            return pixelAt(bm, row * DIM + col);
        }
    }

    /// @notice Single pass producing the lit-pixel count and 8x8 coarse signature.
    /// @dev The 64 blocks of 5x5 tile the grid exactly. A signature bit is set when
    ///      at least 13 of a block's 25 pixels are foreground.
    function analyze(bytes memory bm) internal pure returns (uint256 lit, uint64 sig) {
        unchecked {
            for (uint256 br; br < 8; ++br) {
                uint256 acc;

                for (uint256 r; r < 5; ++r) {
                    uint256 word;
                    uint256 offset = (br * 5 + r) * 5;
                    assembly ("memory-safe") {
                        word := mload(add(add(bm, 0x20), offset))
                    }

                    for (uint256 bc; bc < 8; ++bc) {
                        uint256 t = (word >> (251 - bc * 5)) & 0x1F;
                        uint256 n = (t & 1) + ((t >> 1) & 1) + ((t >> 2) & 1) + ((t >> 3) & 1) + ((t >> 4) & 1);
                        acc += n << (bc << 5);
                    }
                }

                for (uint256 bc; bc < 8; ++bc) {
                    uint256 n = (acc >> (bc << 5)) & 0xFFFFFFFF;
                    lit += n;
                    // forge-lint: disable-next-line(unsafe-typecast) — br*8+bc is at most 63
                    if (n >= 13) sig |= uint64(1) << uint64(br * 8 + bc);
                }
            }
        }
    }

    /// @notice Hamming distance between the left half of the signature and its mirror.
    function symmetryDistance(uint64 sig) internal pure returns (uint256 d) {
        unchecked {
            for (uint256 r; r < 8; ++r) {
                for (uint256 c; c < 4; ++c) {
                    uint256 l = (sig >> (r * 8 + c)) & 1;
                    uint256 m = (sig >> (r * 8 + (7 - c))) & 1;
                    if (l != m) ++d;
                }
            }
        }
    }

    /// @notice Foreground counts inside the two 8x8 top corners.
    function cornerDensity(bytes memory bm) internal pure returns (uint256 tl, uint256 tr) {
        unchecked {
            for (uint256 r; r < 8; ++r) {
                for (uint256 c; c < 8; ++c) {
                    if (pixelAtRC(bm, r, c) != 0) ++tl;
                    if (pixelAtRC(bm, r, DIM - 8 + c) != 0) ++tr;
                }
            }
        }
    }

    /// @notice Foreground pixels with no foreground orthogonal neighbour.
    function isolationCount(bytes memory bm) internal pure returns (uint256 isolated) {
        unchecked {
            for (uint256 r; r < DIM; ++r) {
                for (uint256 c; c < DIM; ++c) {
                    if (pixelAtRC(bm, r, c) == 0) continue;
                    bool touching = (r > 0 && pixelAtRC(bm, r - 1, c) != 0)
                        || (r + 1 < DIM && pixelAtRC(bm, r + 1, c) != 0) || (c > 0 && pixelAtRC(bm, r, c - 1) != 0)
                        || (c + 1 < DIM && pixelAtRC(bm, r, c + 1) != 0);
                    if (!touching) ++isolated;
                }
            }
        }
    }
}

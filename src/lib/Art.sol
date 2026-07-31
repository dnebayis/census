// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Bitmap} from "./Bitmap.sol";
import {DynamicBufferLib} from "solady/utils/DynamicBufferLib.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Base64} from "solady/utils/Base64.sol";

/// @title Art
/// @notice Renders a 40x40 two-bit entry to SVG entirely onchain, with no external host.
/// @dev Row-scan run-length encoding: each row emits one rect per run of equal non-zero
///      tone. Background pixels are never drawn — the single backdrop rect covers them.
library Art {
    using DynamicBufferLib for DynamicBufferLib.DynamicBuffer;

    /// @dev A four-step ramp on white. Tone 0 is the backdrop and is never emitted.
    function toneColor(uint256 tone) internal pure returns (string memory) {
        if (tone == 1) return "#D4D4D4";
        if (tone == 2) return "#7A7A7A";
        return "#141414";
    }

    function svg(bytes memory bm) internal pure returns (string memory) {
        DynamicBufferLib.DynamicBuffer memory buf;
        buf.p(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="640" height="640" '
            'shape-rendering="crispEdges"><rect width="40" height="40" fill="#FFFFFF"/>'
        );

        unchecked {
            for (uint256 r = 0; r < Bitmap.DIM; ++r) {
                uint256 c;
                while (c < Bitmap.DIM) {
                    uint256 tone = Bitmap.pixelAtRC(bm, r, c);
                    if (tone == 0) {
                        ++c;
                        continue;
                    }
                    uint256 start = c;
                    while (c < Bitmap.DIM && Bitmap.pixelAtRC(bm, r, c) == tone) {
                        ++c;
                    }
                    buf.p(
                        bytes(
                            string.concat(
                                '<rect x="',
                                LibString.toString(start),
                                '" y="',
                                LibString.toString(r),
                                '" width="',
                                LibString.toString(c - start),
                                '" height="1" fill="',
                                toneColor(tone),
                                '"/>'
                            )
                        )
                    );
                }
            }
        }

        buf.p("</svg>");
        return string(buf.data);
    }

    /// @notice Full ERC-721 metadata as a base64 data URI. Nothing is hosted anywhere.
    function tokenURI(
        uint256 tokenId,
        bytes memory bm,
        string memory class_,
        string memory skill_,
        string memory context_
    ) internal pure returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg(bm))));

        string memory json = string.concat(
            '{"name":"Census #',
            LibString.toString(tokenId),
            '","description":',
            LibString.escapeJSON(context_, true),
            ',"image":"',
            image,
            '","attributes":[{"trait_type":"Class","value":"',
            class_,
            '"},{"trait_type":"Skill","value":"',
            skill_,
            '"}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}

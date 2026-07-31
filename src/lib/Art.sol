// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Bitmap} from "./Bitmap.sol";
import {TraitData} from "./TraitData.sol";
import {DynamicBufferLib} from "solady/utils/DynamicBufferLib.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Base64} from "solady/utils/Base64.sol";

/// @title Art
/// @notice Renders a 40x40 one-bit entry to SVG entirely onchain, with no external host.
/// @dev The bitmap geometry matches the RAO/Basies 1-bit style. Only the Census palette
///      differs: charcoal #34343A foreground on warm pastel #E9DDC7.
library Art {
    using DynamicBufferLib for DynamicBufferLib.DynamicBuffer;

    function svg(bytes memory bm) internal pure returns (string memory) {
        DynamicBufferLib.DynamicBuffer memory buf;
        buf.p(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="640" height="640" '
            'shape-rendering="crispEdges"><rect width="40" height="40" fill="#E9DDC7"/>'
        );

        unchecked {
            for (uint256 r = 0; r < Bitmap.DIM; ++r) {
                uint256 c;
                while (c < Bitmap.DIM) {
                    if (Bitmap.pixelAtRC(bm, r, c) == 0) {
                        ++c;
                        continue;
                    }
                    uint256 start = c;
                    while (c < Bitmap.DIM && Bitmap.pixelAtRC(bm, r, c) == 1) {
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
                                '" height="1" fill="#34343A"/>'
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
        string memory context_,
        bytes9 traits_
    ) internal pure returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg(bm))));

        DynamicBufferLib.DynamicBuffer memory buf;
        buf.p(
            bytes(
                string.concat(
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
                    '"}'
                )
            )
        );

        for (uint256 i; i < TraitData.COUNT; ++i) {
            buf.p(
                bytes(
                    string.concat(
                        ',{"trait_type":"',
                        TraitData.label(i),
                        '","value":"',
                        TraitData.value(i, uint8(traits_[i])),
                        '"}'
                    )
                )
            );
        }
        buf.p("]}");

        return string.concat("data:application/json;base64,", Base64.encode(buf.data));
    }
}

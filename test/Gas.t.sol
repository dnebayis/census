// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Bitmap} from "../src/lib/Bitmap.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {Census} from "../src/Census.sol";
import {MockAdapter8004} from "./mocks/MockAdapter8004.sol";

abstract contract BitmapFixture is Test {
    /// @dev Consumed only *after* each measurement window closes, so results cannot be
    ///      optimised away without being counted against the thing being measured.
    uint256 internal sink;

    function _setPixel(bytes memory bm, uint256 r, uint256 c, uint256 tone) internal pure {
        uint256 idx = r * 40 + c;
        uint256 b = idx >> 2;
        uint256 shift = 6 - ((idx & 3) << 1);
        uint8 cur = uint8(bm[b]);
        bm[b] = bytes1(uint8((cur & ~(uint8(3) << uint8(shift))) | (uint8(tone) << uint8(shift))));
    }

    function _bitmap(uint256 seed) internal pure returns (bytes memory bm) {
        bm = new bytes(400);
        for (uint256 r = 8; r < 36; ++r) {
            for (uint256 c = 10; c < 30; ++c) {
                _setPixel(bm, r, c, (r < 12 || c < 13 || c >= 27) ? 2 : 3);
            }
        }
        for (uint256 i = 0; i < 8; ++i) {
            if ((seed >> i) & 1 == 0) continue;
            for (uint256 r = 0; r < 5; ++r) {
                for (uint256 c = 0; c < 5; ++c) {
                    _setPixel(bm, r, i * 5 + c, 3);
                }
            }
        }
    }
}

/// @dev Measures library calls in-place. An earlier version of this file wrapped each probe
///      in an external contract that stored its result, which silently added ~44k of cold
///      SSTORE plus call overhead to every reading. Nothing here writes storage inside a
///      measurement window.
contract GasTest is BitmapFixture {
    function test_Breakdown() public {
        bytes memory bm = _bitmap(1);
        uint256 g;
        uint256 used;

        g = gasleft();
        (uint256 lit, uint64 sig) = Bitmap.analyze(bm);
        used = g - gasleft();
        console2.log("Bitmap.analyze        :", used);
        sink = lit + sig;

        g = gasleft();
        address p = SSTORE2.write(bm);
        used = g - gasleft();
        console2.log("SSTORE2.write (400B)  :", used);
        sink = uint160(p);

        g = gasleft();
        bytes memory back = SSTORE2.read(p);
        used = g - gasleft();
        console2.log("SSTORE2.read  (400B)  :", used);
        sink = back.length;
    }
}

contract BatchGasTest is BitmapFixture {
    Census internal census;

    address internal warmup = address(0xC0FFEE);
    address internal single = address(0x51);
    address internal batcher = address(0xBA7C);

    function setUp() public {
        census = new Census(address(new MockAdapter8004()), "https://census.example");
        // Keep the very first mint out of the comparison: it pays every one-time cold write
        // in the contract and would flatter everything measured after it.
        vm.prank(warmup);
        census.mint(_bitmap(200), "warmup");
    }

    function test_BatchVersusSingles() public {
        uint256 g = gasleft();
        for (uint256 i; i < 4; ++i) {
            vm.prank(single);
            census.mint(_bitmap(i + 1), "ctx");
        }
        uint256 singles = g - gasleft();

        bytes[] memory bms = new bytes[](4);
        string[] memory ctx = new string[](4);
        for (uint256 i; i < 4; ++i) {
            bms[i] = _bitmap(i + 100);
            ctx[i] = "ctx";
        }

        g = gasleft();
        vm.prank(batcher);
        census.mintBatch(bms, ctx);
        uint256 batch = g - gasleft();

        console2.log("4 separate mints      :", singles);
        console2.log("  per entry           :", singles / 4);
        console2.log("4 batched             :", batch);
        console2.log("  per entry           :", batch / 4);
        console2.log("saving %              :", 100 - (batch * 100) / singles);

        assertLt(batch, singles, "batching must be cheaper than separate mints");
    }
}

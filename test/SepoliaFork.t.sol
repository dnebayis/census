// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Census} from "../src/Census.sol";
import {IAdapter8004} from "../src/interfaces/IAdapter8004.sol";

interface IIdentityRegistry {
    function tokenURI(uint256 agentId) external view returns (string memory);
}

contract SepoliaForkTest is Test {
    address internal constant ADAPTER = 0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92;
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    bytes9 internal constant TRAITS = hex"09020c0b0a080b090b";

    function testFork_RegisterUriAndOwnershipControl() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        Census census = new Census(ADAPTER, "https://census-fork.example");
        census.openMinting();
        address alice = makeAddr("fork-alice");
        address bob = makeAddr("fork-bob");

        vm.prank(alice);
        uint256 tokenId = census.mint(_bitmap(), TRAITS, "fork verification");
        uint256 agentId = census.agentIdOf(tokenId);
        string memory expected = "https://census-fork.example/a/1/registration.json";

        IAdapter8004.Binding memory binding = IAdapter8004(ADAPTER).bindingOf(agentId);
        assertEq(binding.tokenContract, address(census));
        assertEq(binding.tokenId, tokenId);
        assertEq(IIdentityRegistry(IDENTITY).tokenURI(agentId), expected);
        assertTrue(IAdapter8004(ADAPTER).isController(agentId, alice));

        vm.prank(alice);
        census.transferFrom(alice, bob, tokenId);
        assertFalse(IAdapter8004(ADAPTER).isController(agentId, alice));
        assertTrue(IAdapter8004(ADAPTER).isController(agentId, bob));
    }

    function _bitmap() internal pure returns (bytes memory bm) {
        bm = new bytes(200);
        for (uint256 row = 8; row < 36; ++row) {
            for (uint256 col = 10; col < 30; ++col) {
                uint256 flat = row * 40 + col;
                uint256 byteIndex = flat >> 3;
                uint256 shift = 7 - (flat & 7);
                bm[byteIndex] = bytes1(uint8(uint8(bm[byteIndex]) | (uint8(1) << uint8(shift))));
            }
        }
    }
}

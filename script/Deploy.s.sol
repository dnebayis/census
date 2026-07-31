// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Census} from "../src/Census.sol";

/// @notice Deploys a closed Census against the live adapter8004.
/// @dev CANONICAL_HOST must already be the stable Vercel production origin. Minting remains
///      closed until the registration service is configured and `openMinting()` is called.
contract Deploy is Script {
    /// adapter8004 proxy, verified on chain (SPEC §6)
    address constant ADAPTER_SEPOLIA = 0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92;

    function run() external returns (Census census) {
        string memory canonicalHost = vm.envString("CANONICAL_HOST");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        census = new Census(ADAPTER_SEPOLIA, canonicalHost);
        vm.stopBroadcast();

        console2.log("Census   :", address(census));
        console2.log("adapter  :", ADAPTER_SEPOLIA);
        console2.log("host      :", canonicalHost);
        console2.log("mint open :", census.mintingOpen());
    }
}

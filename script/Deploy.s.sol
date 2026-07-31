// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Census} from "../src/Census.sol";

/// @notice Deploys Census against the live adapter8004.
/// @dev Sepolia is disposable (DECISIONS D26) — redeploy freely. `baseHost` is a
///      placeholder until the shared RESTAP server exists and is settable afterwards.
contract Deploy is Script {
    /// adapter8004 proxy, verified on chain (SPEC §6)
    address constant ADAPTER_SEPOLIA = 0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92;

    function run() external returns (Census census) {
        string memory baseHost = vm.envOr("BASE_HOST", string("https://census.example"));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        census = new Census(ADAPTER_SEPOLIA, baseHost);
        vm.stopBroadcast();

        console2.log("Census   :", address(census));
        console2.log("adapter  :", ADAPTER_SEPOLIA);
        console2.log("baseHost :", baseHost);
    }
}

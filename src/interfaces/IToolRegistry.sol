// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8257 — permissionless onchain registry for agent tools.
/// @dev ERC-165 interface id 0xf1dc8075. A registration commits a metadata URI plus a
///      manifest hash, so an agent cannot silently change the service it advertises.
interface IToolRegistry {
    function registerTool(string calldata metadataURI, bytes32 manifestHash) external returns (uint256 toolId);

    function updateToolMetadata(uint256 toolId, string calldata metadataURI, bytes32 manifestHash) external;

    function setAccessPredicate(uint256 toolId, address predicate) external;

    function getToolConfig(uint256 toolId)
        external
        view
        returns (address creator, string memory metadataURI, bytes32 manifestHash, address predicate);
}

/// @notice ERC-8257 pluggable access gate. Interface id 0xbdf9dc18.
/// @dev The natural implementation for exclusive leasing — a predicate that denies
///      everyone except one renter until expiry. See docs/SPEC.md §15.
interface IAccessPredicate {
    function hasAccess(uint256 toolId, address account) external view returns (bool);

    function name() external view returns (string memory);

    function getRequirements(uint256 toolId) external view returns (bytes memory);
}

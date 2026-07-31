// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8048 — onchain key-value metadata for token registries.
/// @dev ERC-165 interface id 0xdf670be1.
interface IERC8048 {
    event MetadataSet(uint256 indexed tokenId, string key, bytes value);

    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory);
}

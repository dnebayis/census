// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8048 — onchain key-value metadata for token registries.
/// @dev Locked to ethereum/ERCs commit 3173bbe1ad99fdc1f14cc7e54548e83e5e6da3fc.
///      ERC-165 interface id 0xdf670be1.
interface IERC8048 {
    event MetadataSet(uint256 indexed tokenId, string indexed indexedKey, string key, bytes value);

    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory);
}

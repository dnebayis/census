// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Locked public mint surface used by ABI conformance tests.
interface ICensusMintV1 {
    function validate(bytes calldata bitmap, bytes9 traits, address minter)
        external
        view
        returns (bool ok, uint8 reason, uint8[] memory warnings);
    function validate(bytes calldata bitmap, bytes9 traits, address minter, string calldata context)
        external
        view
        returns (bool ok, uint8 reason, uint8[] memory warnings);
    function mint(bytes calldata bitmap, bytes9 traits, string calldata context) external returns (uint256 tokenId);
    function mintBatch(bytes[] calldata bitmaps, bytes9[] calldata traits, string[] calldata contexts)
        external
        returns (uint256[] memory tokenIds);
    function bitmapOf(uint256 tokenId) external view returns (bytes memory);
    function traitsOf(uint256 tokenId) external view returns (bytes9);
    function traitOf(uint256 tokenId, uint8 category) external view returns (string memory);
}

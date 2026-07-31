// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter8004} from "../../src/interfaces/IAdapter8004.sol";

interface IOwnerOf {
    function ownerOf(uint256) external view returns (address);
}

/// @notice Stand-in for adapter8004 so tests run without forking Sepolia.
/// @dev Mirrors the real contract's semantics: it mints an agent id, records the binding,
///      and treats the bound token's owner as the controller.
contract MockAdapter8004 is IAdapter8004 {
    /// @dev Mirrors the live contract's error. Confirmed against Sepolia: the first attempt
    ///      to mint reverted with `NotController(census, type(uint256).max)` because Census
    ///      called `register` while the minter owned the token. The original mock had no
    ///      such check and happily accepted it, so the whole suite passed against a fiction.
    error NotController(address account, uint256 agentId);

    uint256 public nextAgentId = 1;

    mapping(uint256 => Binding) internal _binding;
    mapping(uint256 => string) public agentURI;
    mapping(uint256 => mapping(bytes32 => bytes)) internal _meta;

    function register(
        TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        string memory uri,
        MetadataEntry[] memory entries
    ) public returns (uint256 agentId) {
        // "Controller" for ERC-721 is literally `ownerOf(tokenId)`.
        if (IOwnerOf(tokenContract).ownerOf(tokenId) != msg.sender) {
            revert NotController(msg.sender, type(uint256).max);
        }
        agentId = nextAgentId++;
        _binding[agentId] = Binding({standard: standard, tokenContract: tokenContract, tokenId: tokenId});
        agentURI[agentId] = uri;
        for (uint256 i; i < entries.length; ++i) {
            _meta[agentId][keccak256(bytes(entries[i].key))] = entries[i].value;
        }
    }

    function register(TokenStandard standard, address tokenContract, uint256 tokenId, string calldata uri)
        external
        returns (uint256)
    {
        MetadataEntry[] memory none = new MetadataEntry[](0);
        return register(standard, tokenContract, tokenId, uri, none);
    }

    function bindingOf(uint256 agentId) external view returns (Binding memory) {
        return _binding[agentId];
    }

    function isController(uint256 agentId, address account) external view returns (bool) {
        Binding memory b = _binding[agentId];
        if (b.tokenContract == address(0)) return false;
        return IOwnerOf(b.tokenContract).ownerOf(b.tokenId) == account;
    }

    function getMetadata(uint256 agentId, string memory key) external view returns (bytes memory) {
        return _meta[agentId][keccak256(bytes(key))];
    }

    function setMetadata(uint256 agentId, string memory key, bytes memory value) external {
        _meta[agentId][keccak256(bytes(key))] = value;
    }
}

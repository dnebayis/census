// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8217 agent NFT identity bindings, as implemented by adapter8004.
/// @dev ERC-8004 lock: 503591a6e80e6e1affdd6403341e25269141f046.
///      ERC-8217 lock: 6ca6a3a3a5230c0a5ec30c21c3c3b9eba5ba8e29.
///      Sepolia proxy 0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92
///      (impl 0x31a68e5bc0224ad081d6ec20229b05f558609257, UUPS).
///      Every selector below was verified against the deployed runtime bytecode.
interface IAdapter8004 {
    enum TokenStandard {
        ERC721,
        ERC1155,
        ERC6909
    }

    struct Binding {
        TokenStandard standard;
        address tokenContract;
        uint256 tokenId;
    }

    struct MetadataEntry {
        string key;
        bytes value;
    }

    /// @dev selector 0x1fd8046a
    function register(
        TokenStandard standard,
        address tokenContract,
        uint256 tokenId,
        string memory agentURI,
        MetadataEntry[] memory metadata
    ) external returns (uint256 agentId);

    /// @dev selector 0xb68ca002
    function register(TokenStandard standard, address tokenContract, uint256 tokenId, string calldata agentURI)
        external
        returns (uint256 agentId);

    /// @dev selector 0x4d69ebc2
    function bindingOf(uint256 agentId) external view returns (Binding memory);

    /// @dev selector 0x158e711d — true when `account` controls the bound external token.
    function isController(uint256 agentId, address account) external view returns (bool);

    /// @dev selector 0xcb4799f2
    function getMetadata(uint256 agentId, string memory key) external view returns (bytes memory);

    /// @dev selector 0x466648da — controller-gated. Census deliberately does NOT route
    ///      `skill` or `class` through here: the controller is the token owner, so an owner
    ///      could diverge from the immutable quota assignment or Species-derived visual class.
    ///      Those two keys live on Census itself, with no setter.
    function setMetadata(uint256 agentId, string memory key, bytes memory value) external;

    /// @notice Update the ERC-8004 registration file URI. Controller-gated.
    function setAgentURI(uint256 agentId, string calldata newURI) external;
}

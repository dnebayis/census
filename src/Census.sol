// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {LibString} from "solady/utils/LibString.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";

import {Bitmap} from "./lib/Bitmap.sol";
import {Art} from "./lib/Art.sol";
import {TraitData} from "./lib/TraitData.sol";
import {IERC8048} from "./interfaces/IERC8048.sol";
import {IAdapter8004} from "./interfaces/IAdapter8004.sol";

/// @title Census
/// @notice A record of 10,000 faces and what each one does.
/// @dev Every entry is minted already registered as an ERC-8004 agent, holding exactly one
///      skill drawn from a capped pool. The bitmap is written once and never mutated.
///      See docs/SPEC.md for the full specification.
contract Census is ERC721, Ownable, ReentrancyGuard, IERC8048 {
    using LibString for uint256;

    // ---------------------------------------------------------------- constants

    uint256 public constant SUPPLY = 5_000;
    uint256 public constant MAX_PER_WALLET = 5;
    uint256 public constant MAX_CONTEXT_BYTES = 280;
    uint256 public constant ROYALTY_BPS = 500;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @dev Deliberately permissive 1%-95% density band. This rejects only effectively
    ///      blank or solid uploads; composition and visual quality are never mint gates.
    uint256 public constant DENSITY_MIN = 16;
    uint256 public constant DENSITY_MAX = 1520;

    /// @dev Soft thresholds. Advisory only — `validate` reports them, `mint` ignores them.
    uint256 internal constant WARN_SYMMETRY = 10; // of 32 comparable signature bits
    uint256 internal constant WARN_CORNER_PCT = 25; // of 64 pixels per corner
    uint256 internal constant WARN_ISOLATED_PCT = 15; // of lit pixels

    // hard failure codes returned by `validate`
    uint8 public constant OK = 0;
    uint8 public constant ERR_LENGTH = 1;
    uint8 public constant ERR_TOO_SPARSE = 2;
    uint8 public constant ERR_TOO_DENSE = 3;
    uint8 public constant ERR_DUPLICATE = 4;
    uint8 public constant ERR_SOLD_OUT = 5;
    uint8 public constant ERR_WALLET_CAP = 6;
    uint8 public constant ERR_MINT_CLOSED = 7;
    uint8 public constant ERR_TRAITS = 8;
    uint8 public constant ERR_PAUSED = 9;
    uint8 public constant ERR_EXACT_DUPLICATE = 10;
    uint8 public constant ERR_CONTEXT = 11;
    uint8 public constant ERR_BATCH = 12;

    // advisory warning codes
    uint8 public constant WARN_ASYMMETRIC = 1;
    uint8 public constant WARN_CROWDED_CORNER = 2;
    uint8 public constant WARN_NOISY = 3;

    // ---------------------------------------------------------------- errors

    error InvalidBitmap(uint8 reason);
    error SoldOut();
    error WalletCapReached();
    error DuplicateSignature();
    error DuplicateBitmap();
    error ImmutableKey();
    error NotEntryOwner();
    error NonexistentEntry();
    error AgentIdTooLarge(uint256 agentId);
    error InvalidHost();
    error MintingClosed();
    error MintingAlreadyOpen();
    error InvalidTraits();
    error InvalidAdapter();
    error MintingPaused();
    error MintingNotPaused();
    error InvalidContext();
    error InvalidBatch();

    // ---------------------------------------------------------------- immutables

    IAdapter8004 public immutable adapter;
    address public immutable royaltyReceiver;

    // ---------------------------------------------------------------- storage

    /// @dev Remaining slots per skill in indices 0-6, with the running total parked in
    ///      index 7 so all eight share a single slot — the draw reads and writes one word.
    ///      Drawing from a shrinking pool rather than rolling a probability makes the final
    ///      distribution exact by construction: there will be exactly 300 Advisors.
    uint16[8] internal _pool = [1500, 1500, 750, 500, 350, 250, 150, 5000];

    uint256 public totalMinted;

    function remaining(uint256 skill) public view returns (uint16) {
        return _pool[skill];
    }

    function remainingTotal() public view returns (uint16) {
        return _pool[7];
    }

    string public canonicalHost;
    bool public mintingOpen;
    bool public paused;

    /// @dev Exactly one 256-bit slot: 64 + 24 + 8 + 160. Everything an entry is, in one
    ///      SSTORE. `agentId` is uint24 because the ERC-8004 registry will not issue
    ///      16.7M identities, and the bitmap pointer rides along instead of costing its
    ///      own cold slot.
    struct Entry {
        uint64 signature;
        uint24 agentId;
        uint8 skill;
        address bitmap;
    }

    mapping(uint256 => Entry) internal _entry;
    mapping(uint64 => bool) public signatureUsed;
    mapping(bytes32 => bool) public bitmapHashUsed;
    mapping(address => uint256) public mintedBy;

    function signatureOf(uint256 tokenId) public view returns (uint64) {
        return _entry[tokenId].signature;
    }

    function skillOf(uint256 tokenId) public view returns (uint8) {
        return _entry[tokenId].skill;
    }

    function agentIdOf(uint256 tokenId) public view returns (uint256) {
        return _entry[tokenId].agentId;
    }

    /// @dev ERC-8048 store for the owner-writable keys only. `skill` and `class` are served
    ///      by `metadata()` straight from `skillOf` and have no setter anywhere.
    mapping(uint256 => mapping(bytes32 => bytes)) internal _meta;

    event EntryMinted(uint256 indexed tokenId, address indexed to, uint8 skill, uint64 signature, uint256 agentId);
    event MintingPausedStateChanged(bool paused);

    // ---------------------------------------------------------------- setup

    constructor(address adapter_, string memory canonicalHost_) {
        if (adapter_ == address(0) || adapter_.code.length == 0) revert InvalidAdapter();
        if (!_validHost(canonicalHost_)) revert InvalidHost();
        adapter = IAdapter8004(adapter_);
        canonicalHost = canonicalHost_;
        royaltyReceiver = msg.sender;
        _initializeOwner(msg.sender);
    }

    function name() public pure override returns (string memory) {
        return "Census";
    }

    function symbol() public pure override returns (string memory) {
        return "CENSUS";
    }

    /// @notice Permanently opens permissionless minting after the registration service is live.
    function openMinting() external onlyOwner {
        if (mintingOpen) revert MintingAlreadyOpen();
        mintingOpen = true;
    }

    /// @notice Stops only new minting. Existing tokens remain transferable and readable.
    function pauseMinting() external onlyOwner {
        if (!mintingOpen) revert MintingClosed();
        if (paused) revert MintingPaused();
        paused = true;
        emit MintingPausedStateChanged(true);
    }

    /// @notice Resumes minting after an emergency pause.
    function unpauseMinting() external onlyOwner {
        if (!paused) revert MintingNotPaused();
        paused = false;
        emit MintingPausedStateChanged(false);
    }

    // ---------------------------------------------------------------- skills

    function skillName(uint8 s) public pure returns (string memory) {
        if (s == 0) return "Mint Scanner";
        if (s == 1) return "Arbitrageur";
        if (s == 2) return "Tracker";
        if (s == 3) return "Token Hunter";
        if (s == 4) return "Trend Reader";
        if (s == 5) return "Fraud Detector";
        return "Advisor";
    }

    /// @notice Visual class for a Species vocabulary index.
    /// @dev Class is derived from the same immutable trait byte that drives the portrait,
    ///      never from the independently assigned runtime skill.
    function className(uint8 species) public pure returns (string memory) {
        return TraitData.className(species);
    }

    function classOf(uint256 tokenId) public view returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentEntry();
        return className(uint8(traitsOf(tokenId)[0]));
    }

    // ---------------------------------------------------------------- validation

    /// @notice Free preflight used by the local pipeline before every mint attempt.
    /// @return ok       true when `mint` would succeed for `minter`
    /// @return reason   hard failure code, 0 when ok
    /// @return warnings advisory codes — never block a mint
    function validate(bytes calldata bitmap, bytes9 traits_, address minter)
        external
        view
        returns (bool ok, uint8 reason, uint8[] memory warnings)
    {
        return _validate(bitmap, traits_, minter, "", false);
    }

    /// @notice Full preflight including the immutable context written during mint.
    function validate(bytes calldata bitmap, bytes9 traits_, address minter, string calldata context_)
        external
        view
        returns (bool ok, uint8 reason, uint8[] memory warnings)
    {
        return _validate(bitmap, traits_, minter, context_, true);
    }

    function _validate(bytes calldata bitmap, bytes9 traits_, address minter, string memory context_, bool checkContext)
        internal
        view
        returns (bool ok, uint8 reason, uint8[] memory warnings)
    {
        warnings = new uint8[](0);
        if (bitmap.length != Bitmap.BYTE_LEN) return (false, ERR_LENGTH, warnings);
        if (!TraitData.valid(traits_)) return (false, ERR_TRAITS, warnings);
        if (!mintingOpen) return (false, ERR_MINT_CLOSED, warnings);
        if (paused) return (false, ERR_PAUSED, warnings);
        if (checkContext && !_validContext(context_)) return (false, ERR_CONTEXT, warnings);

        bytes memory bm = bitmap;
        (uint256 lit, uint64 sig) = Bitmap.analyze(bm);
        if (lit < DENSITY_MIN) return (false, ERR_TOO_SPARSE, warnings);
        if (lit > DENSITY_MAX) return (false, ERR_TOO_DENSE, warnings);
        if (bitmapHashUsed[keccak256(bm)]) return (false, ERR_EXACT_DUPLICATE, warnings);
        if (signatureUsed[sig]) return (false, ERR_DUPLICATE, warnings);
        if (_pool[7] == 0) return (false, ERR_SOLD_OUT, warnings);
        if (mintedBy[minter] >= MAX_PER_WALLET) return (false, ERR_WALLET_CAP, warnings);

        warnings = _softWarnings(bm, lit, sig);
        return (true, OK, warnings);
    }

    function _softWarnings(bytes memory bm, uint256 lit, uint64 sig) internal pure returns (uint8[] memory out) {
        uint8[] memory tmp = new uint8[](3);
        uint256 n;

        if (Bitmap.symmetryDistance(sig) > WARN_SYMMETRY) tmp[n++] = WARN_ASYMMETRIC;

        (uint256 tl, uint256 tr) = Bitmap.cornerDensity(bm);
        if (tl * 100 > 64 * WARN_CORNER_PCT || tr * 100 > 64 * WARN_CORNER_PCT) tmp[n++] = WARN_CROWDED_CORNER;

        if (Bitmap.isolationCount(bm) * 100 > lit * WARN_ISOLATED_PCT) tmp[n++] = WARN_NOISY;

        out = new uint8[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = tmp[i];
        }
    }

    // ---------------------------------------------------------------- mint

    /// @notice Mint several entries at once, up to whatever the wallet cap still allows.
    /// @dev Every entry still gets its own artwork, skill draw and ERC-8004 identity — this
    ///      only shares the fixed costs. The transaction base fee is paid once instead of
    ///      per entry, and the quota pool, mint counter and caller balance go warm after the
    ///      first, which is where most of the saving comes from. Minting the full allowance
    ///      of five this way costs materially less than five separate transactions.
    function mintBatch(bytes[] calldata bitmaps, bytes9[] calldata traits_, string[] calldata contexts)
        external
        nonReentrant
        returns (uint256[] memory tokenIds)
    {
        uint256 n = bitmaps.length;
        if (n != contexts.length || n != traits_.length || n == 0 || n > MAX_PER_WALLET) revert InvalidBatch();
        if (mintedBy[msg.sender] + n > MAX_PER_WALLET) revert WalletCapReached();

        tokenIds = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            tokenIds[i] = _mintOne(bitmaps[i], traits_[i], contexts[i]);
        }
    }

    /// @notice Mint one entry. Free — the caller pays gas only.
    /// @dev One transaction produces the artwork, the skill assignment, the ERC-8004 identity
    ///      and the metadata. There is no activation step; an entry that exists is an agent.
    function mint(bytes calldata bitmap, bytes9 traits_, string calldata context_)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        return _mintOne(bitmap, traits_, context_);
    }

    function _mintOne(bytes calldata bitmap, bytes9 traits_, string calldata context_)
        internal
        returns (uint256 tokenId)
    {
        if (!mintingOpen) revert MintingClosed();
        if (paused) revert MintingPaused();
        if (bitmap.length != Bitmap.BYTE_LEN) revert InvalidBitmap(ERR_LENGTH);
        if (!TraitData.valid(traits_)) revert InvalidTraits();
        if (!_validContext(context_)) revert InvalidContext();
        if (_pool[7] == 0) revert SoldOut();
        if (mintedBy[msg.sender] >= MAX_PER_WALLET) revert WalletCapReached();

        bytes memory bm = bitmap;
        (uint256 lit, uint64 sig) = Bitmap.analyze(bm);

        if (lit < DENSITY_MIN) revert InvalidBitmap(ERR_TOO_SPARSE);
        if (lit > DENSITY_MAX) revert InvalidBitmap(ERR_TOO_DENSE);
        bytes32 bitmapHash = keccak256(bm);
        if (bitmapHashUsed[bitmapHash]) revert DuplicateBitmap();
        if (signatureUsed[sig]) revert DuplicateSignature();

        unchecked {
            tokenId = ++totalMinted;
            ++mintedBy[msg.sender];
        }

        signatureUsed[sig] = true;
        bitmapHashUsed[bitmapHash] = true;
        address ptr = SSTORE2.write(bytes.concat(bm, traits_));
        uint8 skill = _drawSkill(tokenId);

        // Written before the external call, not after. Saving one warm SSTORE by writing
        // it afterwards would leave a window in which `adapter` could read back an entry
        // with no skill and a null bitmap pointer.
        _entry[tokenId] = Entry({signature: sig, agentId: 0, skill: skill, bitmap: ptr});

        // Minted to this contract, not to the caller. `adapter.register` is controller-gated
        // and for ERC-721 the controller is literally `ownerOf(tokenId)`, so Census must own
        // the entry at the moment it registers. Ownership is handed to the minter immediately
        // afterwards, and control follows it — `isController` reads `ownerOf` live.
        //
        // The cost is a second Transfer event per mint (zero -> Census, Census -> minter).
        // The alternative is the minter registering in a separate transaction, which is the
        // activation step D3 exists to prevent.
        _mint(address(this), tokenId);

        string memory id = tokenId.toString();
        uint256 agentId = _bindIdentity(tokenId, id);

        _transfer(address(this), msg.sender, tokenId);

        // uint24 is the widest that still fits alongside the signature, skill and pointer
        // in one slot. The ERC-8004 registry is global and shared, so its ids are not ours
        // to predict — fail loudly rather than truncate into another agent's identity.
        if (agentId > type(uint24).max) revert AgentIdTooLarge(agentId);
        _entry[tokenId].agentId = uint24(agentId);

        _write(tokenId, "context", bytes(context_));

        emit EntryMinted(tokenId, msg.sender, skill, sig, agentId);
    }

    /// @dev Draws one slot from the remaining pool. Grinding can shift which caller receives
    ///      which skill, but never the totals — that is why this is accepted rather than
    ///      fixed with commit-reveal, which would break the single-transaction mint.
    function _drawSkill(uint256 tokenId) internal returns (uint8) {
        uint16[8] memory pool = _pool; // one SLOAD, eight values
        uint256 r = uint256(keccak256(abi.encode(block.prevrandao, tokenId, msg.sender))) % pool[7];
        uint256 acc;
        unchecked {
            for (uint8 i = 0; i < 7; ++i) {
                acc += pool[i];
                if (r < acc) {
                    --_pool[i];
                    --_pool[7];
                    return i;
                }
            }
        }
        revert SoldOut(); // unreachable while the pool is non-empty
    }

    /// @dev Registration discovery is deliberately the only runtime surface in this phase.
    function _bindIdentity(uint256 tokenId, string memory id) internal returns (uint256 agentId) {
        agentId = adapter.register(
            IAdapter8004.TokenStandard.ERC721,
            address(this),
            tokenId,
            string.concat(canonicalHost, "/a/", LibString.toHexString(address(this)), "/", id, "/registration.json")
        );
    }

    // ---------------------------------------------------------------- ERC-8048

    /// @notice Read any metadata key.
    /// @dev Three kinds of key, in priority order:
    ///      - `skill` / `class` are served from packed state and can never be written;
    ///      - `trait[...]` keys are served from the immutable art record;
    ///      - all other keys are owner-writable.
    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory) {
        if (!_exists(tokenId)) revert NonexistentEntry();
        bytes32 h = keccak256(bytes(key));

        if (h == keccak256("skill")) return bytes(skillName(_entry[tokenId].skill));
        if (h == keccak256("class")) return bytes(classOf(tokenId));
        (bool isTrait, uint256 category) = _traitCategory(h);
        if (isTrait) return bytes(traitOf(tokenId, uint8(category)));

        return _meta[tokenId][h];
    }

    /// @notice Update an owner-writable key.
    /// @dev `skill` is the quota assignment and `class` is derived from immutable Species.
    ///      Neither may diverge from the art record. Other ERC-8048 keys remain under the
    ///      current NFT owner's control.
    function setMetadata(uint256 tokenId, string calldata key, bytes calldata value) external {
        if (ownerOf(tokenId) != msg.sender) revert NotEntryOwner();
        bytes32 h = keccak256(bytes(key));
        if (
            h == keccak256("skill") || h == keccak256("class") || h == keccak256("context")
                || _hasTraitPrefix(key)
        ) revert ImmutableKey();
        _meta[tokenId][h] = value;
        emit MetadataSet(tokenId, key, key, value);
    }

    function _write(uint256 tokenId, string memory key, bytes memory value) internal {
        _meta[tokenId][keccak256(bytes(key))] = value;
        emit MetadataSet(tokenId, key, key, value);
    }

    // ---------------------------------------------------------------- art

    function bitmapOf(uint256 tokenId) public view returns (bytes memory) {
        if (!_exists(tokenId)) revert NonexistentEntry();
        return SSTORE2.read(_entry[tokenId].bitmap, 0, Bitmap.BYTE_LEN);
    }

    function traitsOf(uint256 tokenId) public view returns (bytes9 traits_) {
        if (!_exists(tokenId)) revert NonexistentEntry();
        bytes memory raw = SSTORE2.read(_entry[tokenId].bitmap, Bitmap.BYTE_LEN, Bitmap.BYTE_LEN + TraitData.COUNT);
        assembly ("memory-safe") {
            traits_ := mload(add(raw, 0x20))
        }
    }

    function traitOf(uint256 tokenId, uint8 category) public view returns (string memory) {
        if (category >= TraitData.COUNT) revert InvalidTraits();
        bytes9 traits_ = traitsOf(tokenId);
        return TraitData.value(category, uint8(traits_[category]));
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentEntry();
        uint8 s = _entry[tokenId].skill;
        return Art.tokenURI(
            tokenId,
            bitmapOf(tokenId),
            classOf(tokenId),
            skillName(s),
            string(_meta[tokenId][keccak256("context")]),
            traitsOf(tokenId)
        );
    }

    /// @notice ERC-2981 default royalty. The receiver is the immutable deploying address.
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = royaltyReceiver;
        royaltyAmount = salePrice * ROYALTY_BPS / BPS_DENOMINATOR;
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0xdf670be1 || id == 0x2a55205a || super.supportsInterface(id); // ERC-8048 / ERC-2981
    }

    function _validHost(string memory host) private pure returns (bool) {
        bytes memory b = bytes(host);
        if (b.length < 9 || b[b.length - 1] == "/") return false;
        bytes8 prefix;
        assembly ("memory-safe") {
            prefix := mload(add(b, 0x20))
        }
        return prefix == bytes8("https://");
    }

    function _hasTraitPrefix(string calldata key) private pure returns (bool) {
        bytes calldata b = bytes(key);
        return b.length >= 6 && b[0] == "t" && b[1] == "r" && b[2] == "a" && b[3] == "i" && b[4] == "t" && b[5] == "[";
    }

    function _validContext(string memory value) private pure returns (bool) {
        bytes memory b = bytes(value);
        if (b.length == 0 || b.length > MAX_CONTEXT_BYTES) return false;

        uint256 i;
        while (i < b.length) {
            uint8 c = uint8(b[i]);
            if (c < 0x80) {
                ++i;
                continue;
            }

            uint256 needed;
            uint32 codepoint;
            if (c >= 0xC2 && c <= 0xDF) {
                needed = 1;
                codepoint = c & 0x1F;
            } else if (c >= 0xE0 && c <= 0xEF) {
                needed = 2;
                codepoint = c & 0x0F;
            } else if (c >= 0xF0 && c <= 0xF4) {
                needed = 3;
                codepoint = c & 0x07;
            } else {
                return false;
            }
            if (i + needed >= b.length) return false;

            for (uint256 j = 1; j <= needed; ++j) {
                uint8 continuation = uint8(b[i + j]);
                if (continuation < 0x80 || continuation > 0xBF) return false;
                codepoint = (codepoint << 6) | (continuation & 0x3F);
            }
            if (
                (needed == 2 && codepoint < 0x800) || (needed == 3 && codepoint < 0x10000)
                    || (codepoint >= 0xD800 && codepoint <= 0xDFFF) || codepoint > 0x10FFFF
            ) return false;
            i += needed + 1;
        }
        return true;
    }

    function _traitCategory(bytes32 h) private pure returns (bool found, uint256 category) {
        for (uint256 i; i < TraitData.COUNT; ++i) {
            if (h == keccak256(bytes(TraitData.key(i)))) return (true, i);
        }
    }
}

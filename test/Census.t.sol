// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Census} from "../src/Census.sol";
import {Art} from "../src/lib/Art.sol";
import {IAdapter8004} from "../src/interfaces/IAdapter8004.sol";
import {MockAdapter8004} from "./mocks/MockAdapter8004.sol";
import {ICensusMintV1} from "./interfaces/ICensusMintV1.sol";

contract CensusTest is Test {
    Census internal census;
    MockAdapter8004 internal adapter;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    string internal constant HOST = "https://census.example";
    bytes9 internal constant TRAITS = hex"000000000000000000";

    event MetadataSet(uint256 indexed tokenId, string indexed indexedKey, string key, bytes value);

    function setUp() public {
        adapter = new MockAdapter8004();
        census = new Census(address(adapter), HOST);
        census.openMinting();
    }

    // ------------------------------------------------------------ helpers

    function _setPixel(bytes memory bm, uint256 r, uint256 c, uint256 tone) internal pure {
        uint256 idx = r * 40 + c;
        uint256 b = idx >> 3;
        uint256 shift = 7 - (idx & 7);
        if (tone != 0) bm[b] = bytes1(uint8(uint8(bm[b]) | (uint8(1) << uint8(shift))));
    }

    /// @dev A body that always lands inside the density band, plus 8 seed-controlled blocks
    ///      in the top signature row so every seed yields a distinct 8x8 signature.
    function _bitmap(uint256 seed) internal pure returns (bytes memory bm) {
        bm = new bytes(200);

        // torso + head mass: rows 8-35, cols 10-29 => 560 lit
        for (uint256 r = 8; r < 36; ++r) {
            for (uint256 c = 10; c < 30; ++c) {
                _setPixel(bm, r, c, 1);
            }
        }

        // signature bits: block row 0 (rows 0-4), block col i (cols 5i..5i+4)
        for (uint256 i = 0; i < 8; ++i) {
            if ((seed >> i) & 1 == 0) continue;
            for (uint256 r = 0; r < 5; ++r) {
                for (uint256 c = 0; c < 5; ++c) {
                    _setPixel(bm, r, i * 5 + c, 1);
                }
            }
        }
    }

    function _mint(address who, uint256 seed) internal returns (uint256 id) {
        vm.prank(who);
        id = census.mint(_bitmap(seed), TRAITS, "a quiet clerk who counts things");
    }

    // ------------------------------------------------------------ validation

    function test_MintStartsClosedAndOpensOnlyOnce() public {
        Census closed = new Census(address(adapter), HOST);
        (bool ok, uint8 reason,) = closed.validate(_bitmap(1), TRAITS, alice);
        assertFalse(ok);
        assertEq(reason, closed.ERR_MINT_CLOSED());

        vm.prank(alice);
        vm.expectRevert(Census.MintingClosed.selector);
        closed.mint(_bitmap(1), TRAITS, "ctx");

        closed.openMinting();
        vm.expectRevert(Census.MintingAlreadyOpen.selector);
        closed.openMinting();
    }

    function test_ConstructorRejectsInvalidCanonicalHost() public {
        vm.expectRevert(Census.InvalidHost.selector);
        new Census(address(adapter), "http://census.example");

        vm.expectRevert(Census.InvalidHost.selector);
        new Census(address(adapter), "https://census.example/");
    }

    function test_ValidateRejectsInvalidTraits() public view {
        bytes9 invalid = hex"00000000000000000c";
        (bool ok, uint8 reason,) = census.validate(_bitmap(1), invalid, alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_TRAITS());
    }

    function test_ValidateRejectsWrongLength() public view {
        (bool ok, uint8 reason,) = census.validate(new bytes(199), TRAITS, alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_LENGTH());
    }

    function test_ValidateRejectsBlankCanvas() public view {
        (bool ok, uint8 reason,) = census.validate(new bytes(200), TRAITS, alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_TOO_SPARSE());
    }

    function test_ValidateRejectsSolidBlock() public view {
        bytes memory bm = new bytes(200);
        for (uint256 i; i < 200; ++i) {
            bm[i] = 0xFF;
        }
        (bool ok, uint8 reason,) = census.validate(bm, TRAITS, alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_TOO_DENSE());
    }

    function test_ValidateAcceptsGoodBitmap() public view {
        (bool ok, uint8 reason,) = census.validate(_bitmap(1), TRAITS, alice);
        assertTrue(ok);
        assertEq(reason, census.OK());
    }

    function test_ValidateAcceptsSparseButVisibleBitmap() public view {
        bytes memory bm = new bytes(200);
        for (uint256 i; i < 100; ++i) {
            _setPixel(bm, 5 + i / 10, 10 + i % 10, 1);
        }
        (bool ok, uint8 reason,) = census.validate(bm, TRAITS, alice);
        assertTrue(ok);
        assertEq(reason, census.OK());
    }

    function test_ValidateAcceptsDenseButNotSolidBitmap() public view {
        bytes memory bm = new bytes(200);
        for (uint256 i; i < 1440; ++i) {
            _setPixel(bm, i / 40, i % 40, 1);
        }
        (bool ok, uint8 reason,) = census.validate(bm, TRAITS, alice);
        assertTrue(ok);
        assertEq(reason, census.OK());
    }

    function test_ValidateIsFreeAndMatchesMint() public {
        bytes memory bm = _bitmap(7);

        (bool ok,,) = census.validate(bm, TRAITS, alice);
        assertTrue(ok);

        vm.prank(alice);
        census.mint(bm, TRAITS, "ctx");

        // the same bitmap must now fail preflight for the same reason mint would revert
        (bool ok2, uint8 reason2,) = census.validate(bm, TRAITS, bob);
        assertFalse(ok2);
        assertEq(reason2, census.ERR_DUPLICATE());
    }

    function test_SoftWarningsDoNotBlockMint() public {
        // an off-centre blob: asymmetric and noisy, but still mintable
        bytes memory bm = new bytes(200);
        for (uint256 r = 5; r < 25; ++r) {
            for (uint256 c = 2; c < 20; ++c) {
                _setPixel(bm, r, c, 1);
            }
        }

        (bool ok,, uint8[] memory warnings) = census.validate(bm, TRAITS, alice);
        assertTrue(ok, "warnings must never block");
        assertGt(warnings.length, 0, "this shape should raise at least one warning");

        vm.prank(alice);
        census.mint(bm, TRAITS, "ctx");
        assertEq(census.totalMinted(), 1);
    }

    // ------------------------------------------------------------ mint

    function test_MintIsBornRegisteredInOneTransaction() public {
        uint256 id = _mint(alice, 1);

        assertEq(census.ownerOf(id), alice);

        uint256 agentId = census.agentIdOf(id);
        assertGt(agentId, 0, "no ERC-8004 identity was bound");

        IAdapter8004.Binding memory b = adapter.bindingOf(agentId);
        assertEq(b.tokenContract, address(census));
        assertEq(b.tokenId, id);
        assertEq(uint8(b.standard), uint8(IAdapter8004.TokenStandard.ERC721));

        // the entry's owner is its controller — no activation step anywhere
        assertTrue(adapter.isController(agentId, alice));
        assertEq(
            adapter.agentURI(agentId),
            string.concat(HOST, "/a/", LibString.toHexString(address(census)), "/1/registration.json")
        );
    }

    function test_TraitsRoundTripFromArtRecord() public {
        bytes9 traits_ = hex"09020c0b0a080b090b";
        vm.prank(alice);
        uint256 id = census.mint(_bitmap(1), traits_, "ctx");

        assertEq(census.traitsOf(id), traits_);
        assertEq(bytes(census.bitmapOf(id)).length, 200);
        assertEq(census.traitOf(id, 0), "ape-like humanoid");
        assertEq(census.traitOf(id, 8), "collar tag");
        assertEq(string(census.metadata(id, "trait[hair]")), "wild curly hair");
    }

    function test_InvalidTraitsRevertMint() public {
        vm.prank(alice);
        vm.expectRevert(Census.InvalidTraits.selector);
        census.mint(_bitmap(1), hex"0a0000000000000000", "ctx");
    }

    function test_MintIsFree() public {
        vm.deal(alice, 0);
        _mint(alice, 1);
        assertEq(census.totalMinted(), 1);
    }

    function test_DuplicateSignatureReverts() public {
        _mint(alice, 3);
        vm.expectRevert(Census.DuplicateSignature.selector);
        _mint(bob, 3);
    }

    function test_DistinctSeedsProduceDistinctSignatures() public {
        uint256 a = _mint(alice, 1);
        uint256 b = _mint(alice, 2);
        assertTrue(census.signatureOf(a) != census.signatureOf(b));
    }

    function test_WalletCapEnforced() public {
        for (uint256 i = 1; i <= 5; ++i) {
            _mint(alice, i);
        }
        assertEq(census.mintedBy(alice), 5);

        vm.expectRevert(Census.WalletCapReached.selector);
        _mint(alice, 6);

        // a different wallet is unaffected
        _mint(bob, 6);
        assertEq(census.mintedBy(bob), 1);
    }

    // ------------------------------------------------------------ batch

    function _batch(uint256 from, uint256 n) internal pure returns (bytes[] memory bms, string[] memory ctx) {
        bms = new bytes[](n);
        ctx = new string[](n);
        for (uint256 i; i < n; ++i) {
            bms[i] = _bitmap(from + i);
            ctx[i] = "ctx";
        }
    }

    function _traitBatch(uint256 n) internal pure returns (bytes9[] memory traits_) {
        traits_ = new bytes9[](n);
        for (uint256 i; i < n; ++i) {
            traits_[i] = TRAITS;
        }
    }

    function test_BatchMintsEachAsItsOwnAgent() public {
        (bytes[] memory bms, string[] memory ctx) = _batch(1, 4);
        bytes9[] memory traits_ = _traitBatch(4);

        vm.prank(alice);
        uint256[] memory ids = census.mintBatch(bms, traits_, ctx);

        assertEq(ids.length, 4);
        assertEq(census.totalMinted(), 4);
        assertEq(census.mintedBy(alice), 4);

        for (uint256 i; i < 4; ++i) {
            assertEq(census.ownerOf(ids[i]), alice);
            uint256 agentId = census.agentIdOf(ids[i]);
            assertGt(agentId, 0, "every batched entry must be born registered");
            assertTrue(adapter.isController(agentId, alice));

            IAdapter8004.Binding memory b = adapter.bindingOf(agentId);
            assertEq(b.tokenId, ids[i]);
        }

        // distinct agent identities, not one shared registration
        assertTrue(census.agentIdOf(ids[0]) != census.agentIdOf(ids[1]));
    }

    function test_BatchRespectsWalletCap() public {
        (bytes[] memory bms, string[] memory ctx) = _batch(1, 6);
        bytes9[] memory traits_ = _traitBatch(6);
        vm.prank(alice);
        vm.expectRevert(Census.WalletCapReached.selector);
        census.mintBatch(bms, traits_, ctx);
    }

    function test_BatchRejectsMismatchedArrays() public {
        (bytes[] memory bms,) = _batch(1, 3);
        bytes9[] memory traits_ = _traitBatch(3);
        string[] memory ctx = new string[](2);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Census.InvalidBitmap.selector, uint8(1)));
        census.mintBatch(bms, traits_, ctx);
    }

    function test_BatchRejectsDuplicateWithinItself() public {
        bytes[] memory bms = new bytes[](2);
        string[] memory ctx = new string[](2);
        bytes9[] memory traits_ = _traitBatch(2);
        bms[0] = _bitmap(5);
        bms[1] = _bitmap(5); // same signature twice in one call
        ctx[0] = "ctx";
        ctx[1] = "ctx";

        vm.prank(alice);
        vm.expectRevert(Census.DuplicateSignature.selector);
        census.mintBatch(bms, traits_, ctx);
    }

    function test_BitmapRoundTrips() public {
        bytes memory bm = _bitmap(9);
        vm.prank(alice);
        uint256 id = census.mint(bm, TRAITS, "ctx");
        assertEq(keccak256(census.bitmapOf(id)), keccak256(bm), "stored bitmap must be byte-identical");
    }

    // ------------------------------------------------------------ quotas

    function test_QuotaAccountingStaysExact() public {
        for (uint256 i = 1; i <= 5; ++i) {
            _mint(alice, i);
        }
        for (uint256 i = 6; i <= 10; ++i) {
            _mint(bob, i);
        }

        uint256 sum;
        for (uint256 i; i < 7; ++i) {
            sum += census.remaining(i);
        }
        assertEq(sum, census.remainingTotal(), "per-skill remainders must sum to the total");
        assertEq(census.remainingTotal(), 10_000 - census.totalMinted());
    }

    function test_GenesisQuotasMatchTheSpec() public view {
        assertEq(census.remaining(0), 3000); // Mint Scanner
        assertEq(census.remaining(1), 3000); // Arbitrageur
        assertEq(census.remaining(2), 1500); // Tracker
        assertEq(census.remaining(3), 1000); // Token Hunter
        assertEq(census.remaining(4), 700); // Trend Reader
        assertEq(census.remaining(5), 500); // Fraud Detector
        assertEq(census.remaining(6), 300); // Advisor
        assertEq(census.remainingTotal(), 10_000);
    }

    function test_ClassFollowsSpeciesVocabulary() public view {
        assertEq(census.className(0), "Human");
        assertEq(census.className(3), "Human");
        assertEq(census.className(4), "Alien"); // cat-like humanoid
        assertEq(census.className(5), "Alien");
        assertEq(census.className(6), "Agent"); // android
        assertEq(census.className(7), "Skull");
        assertEq(census.className(8), "Alien"); // reptilian
        assertEq(census.className(9), "Alien"); // ape-like humanoid
    }

    function test_ClassOfUsesSpeciesNotSkill() public {
        bytes9 humanTraits = bytes9(hex"0000040a0805090200");
        vm.prank(alice);
        uint256 humanId = census.mint(_bitmap(77), humanTraits, "ctx");

        bytes9 androidTraits = bytes9(hex"060005070304060600");
        vm.prank(alice);
        uint256 androidId = census.mint(_bitmap(78), androidTraits, "ctx");

        assertEq(census.classOf(humanId), "Human");
        assertEq(string(census.metadata(humanId, "class")), "Human");
        assertEq(census.traitOf(humanId, 0), "human");
        assertEq(census.classOf(androidId), "Agent");
        assertEq(string(census.metadata(androidId, "class")), "Agent");
        assertEq(census.traitOf(androidId, 0), "android with visible seams");
    }

    // ------------------------------------------------------------ ERC-8048

    function test_MetadataServesSkillAndClass() public {
        uint256 id = _mint(alice, 1);
        assertEq(string(census.metadata(id, "skill")), census.skillName(census.skillOf(id)));
        assertEq(string(census.metadata(id, "class")), census.classOf(id));
    }

    function test_SkillAndClassHaveNoSetter() public {
        uint256 id = _mint(alice, 1);

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "skill", bytes("Advisor"));

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "class", bytes("Skull"));

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "trait[species]", bytes("grey alien"));

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "trait[future]", bytes("reserved"));
    }

    function test_MetadataEmitsCurrentERC8048Event() public {
        uint256 id = _mint(alice, 1);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit MetadataSet(id, "note", "note", bytes("hello"));
        census.setMetadata(id, "note", bytes("hello"));
    }

    function test_RuntimeEndpointKeysAreEmptyUntilOwnerWritesThem() public {
        uint256 id = _mint(alice, 1);
        assertEq(census.metadata(id, "endpoint[restap]").length, 0);
        assertEq(census.metadata(id, "endpoint[mcp]").length, 0);
    }

    function test_CanonicalHostIsFixedAtConstruction() public {
        uint256 id = _mint(alice, 1);

        assertEq(census.canonicalHost(), HOST);
        assertEq(
            adapter.agentURI(census.agentIdOf(id)),
            string.concat(HOST, "/a/", LibString.toHexString(address(census)), "/1/registration.json")
        );
    }

    function test_OwnerCanWriteRuntimeKeysWithoutActivatingRuntime() public {
        uint256 id = _mint(alice, 1);

        vm.prank(alice);
        census.setMetadata(id, "endpoint[restap]", bytes("https://my-own-host.xyz/agent"));

        assertEq(string(census.metadata(id, "endpoint[restap]")), "https://my-own-host.xyz/agent");
        assertEq(census.metadata(id, "endpoint[mcp]").length, 0);
    }

    function test_NonOwnerCannotWriteMetadata() public {
        uint256 id = _mint(alice, 1);
        vm.prank(bob);
        vm.expectRevert(Census.NotEntryOwner.selector);
        census.setMetadata(id, "context", bytes("hijacked"));
    }

    function test_SupportsERC8048InterfaceId() public view {
        assertTrue(census.supportsInterface(0xdf670be1));
        assertTrue(census.supportsInterface(0x80ac58cd), "ERC721");
        assertTrue(census.supportsInterface(0x5b5e139f), "ERC721Metadata");
    }

    function test_MintAbiMatchesLockedSnapshot() public pure {
        assertEq(Census.validate.selector, ICensusMintV1.validate.selector);
        assertEq(Census.mint.selector, ICensusMintV1.mint.selector);
        assertEq(Census.mintBatch.selector, ICensusMintV1.mintBatch.selector);
        assertEq(Census.bitmapOf.selector, ICensusMintV1.bitmapOf.selector);
        assertEq(Census.traitsOf.selector, ICensusMintV1.traitsOf.selector);
        assertEq(Census.traitOf.selector, ICensusMintV1.traitOf.selector);
    }

    // ------------------------------------------------------------ art

    function test_TokenURIIsFullyOnchain() public {
        uint256 id = _mint(alice, 1);
        string memory uri = census.tokenURI(id);

        assertTrue(bytes(uri).length > 100);
        assertEq(_slice(uri, 0, 29), "data:application/json;base64,", "must be a self-contained data URI");
    }

    function test_TokenURICommitsToTraits() public pure {
        bytes memory bm = _bitmap(1);
        string memory a = Art.tokenURI(1, bm, "Human", "Arbitrageur", "ctx", hex"000000000000000000");
        string memory b = Art.tokenURI(1, bm, "Human", "Arbitrageur", "ctx", hex"040000000000000000");
        assertTrue(keccak256(bytes(a)) != keccak256(bytes(b)));
    }

    function test_RenderedSVGContainsRects() public {
        uint256 id = _mint(alice, 1);
        // decoding base64 onchain is awkward; assert the URI is large enough to hold
        // hundreds of run-length rects, which a blank render could not be
        assertGt(bytes(census.tokenURI(id)).length, 2000);
    }

    function test_RenderedSVGUsesOnlyLockedCensusPalette() public pure {
        string memory rendered = Art.svg(_bitmap(1));
        assertTrue(_contains(rendered, "#E9DDC7"));
        assertTrue(_contains(rendered, "#34343A"));
        assertFalse(_contains(rendered, "#FFFFFF"));
        assertFalse(_contains(rendered, "#141414"));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i; i <= h.length - n.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }

    function _slice(string memory s, uint256 start, uint256 len) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; ++i) {
            out[i] = b[start + i];
        }
        return string(out);
    }

    // ------------------------------------------------------------ gas

    function test_GasReportMint() public {
        uint256 g = gasleft();
        _mint(alice, 1);
        console2.log("mint gas:", g - gasleft());
    }
}

/// @dev Regressions for two hazards introduced while optimising for gas.
contract CensusOptimisationHazardTest is Test {
    Census internal census;
    HighIdAdapter internal adapter;
    address internal alice = address(0xA11CE);
    bytes9 internal constant TRAITS = hex"000000000000000000";

    function setUp() public {
        adapter = new HighIdAdapter();
        census = new Census(address(adapter), "https://census.example");
        census.openMinting();
    }

    function _setPixel(bytes memory bm, uint256 r, uint256 c, uint256 tone) internal pure {
        uint256 idx = r * 40 + c;
        uint256 b = idx >> 3;
        uint256 shift = 7 - (idx & 7);
        if (tone != 0) bm[b] = bytes1(uint8(uint8(bm[b]) | (uint8(1) << uint8(shift))));
    }

    function _bitmap() internal pure returns (bytes memory bm) {
        bm = new bytes(200);
        for (uint256 r = 8; r < 36; ++r) {
            for (uint256 c = 10; c < 30; ++c) {
                _setPixel(bm, r, c, 1);
            }
        }
    }

    /// @dev `agentId` is packed into uint24. The ERC-8004 registry is global, so its ids
    ///      are not ours to predict — an id past the field must revert, never truncate.
    function test_OversizedAgentIdRevertsInsteadOfTruncating() public {
        adapter.setNextId(uint256(type(uint24).max) + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Census.AgentIdTooLarge.selector, uint256(type(uint24).max) + 1));
        census.mint(_bitmap(), TRAITS, "ctx");
    }

    function test_LargestFittingAgentIdStillWorks() public {
        adapter.setNextId(type(uint24).max);
        vm.prank(alice);
        uint256 id = census.mint(_bitmap(), TRAITS, "ctx");
        assertEq(census.agentIdOf(id), type(uint24).max);
    }

    /// @dev The entry must be complete before `adapter.register` is called, because the
    ///      adapter is code we have not read and could read back into Census.
    function test_EntryIsReadableFromWithinTheAdapterCall() public {
        adapter.setProbe(address(census));
        vm.prank(alice);
        uint256 id = census.mint(_bitmap(), TRAITS, "ctx");

        assertGt(adapter.observedSkillPlusOne(), 0, "adapter never probed");
        assertTrue(adapter.observedBitmapNonZero(), "bitmap pointer was null mid-mint");
        assertEq(census.skillOf(id), adapter.observedSkillPlusOne() - 1);
    }
}

interface ICensusProbe {
    function skillOf(uint256) external view returns (uint8);
    function bitmapOf(uint256) external view returns (bytes memory);
}

contract HighIdAdapter is IAdapter8004 {
    uint256 public nextAgentId = 1;
    address public probe;
    uint256 public observedSkillPlusOne;
    bool public observedBitmapNonZero;

    mapping(uint256 => Binding) internal _binding;

    function setNextId(uint256 id) external {
        nextAgentId = id;
    }

    function setProbe(address p) external {
        probe = p;
    }

    function register(TokenStandard s, address tc, uint256 tid, string memory, MetadataEntry[] memory)
        public
        returns (uint256 agentId)
    {
        if (probe != address(0)) {
            observedSkillPlusOne = uint256(ICensusProbe(probe).skillOf(tid)) + 1;
            observedBitmapNonZero = ICensusProbe(probe).bitmapOf(tid).length == 200;
        }
        agentId = nextAgentId++;
        _binding[agentId] = Binding({standard: s, tokenContract: tc, tokenId: tid});
    }

    function register(TokenStandard s, address tc, uint256 tid, string calldata uri) external returns (uint256) {
        return register(s, tc, tid, uri, new MetadataEntry[](0));
    }

    function bindingOf(uint256 a) external view returns (Binding memory) {
        return _binding[a];
    }

    function isController(uint256, address) external pure returns (bool) {
        return true;
    }

    function getMetadata(uint256, string memory) external pure returns (bytes memory) {
        return "";
    }
    function setMetadata(uint256, string memory, bytes memory) external {}
    function setAgentURI(uint256, string calldata) external {}
}

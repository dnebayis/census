// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Census} from "../src/Census.sol";
import {Bitmap} from "../src/lib/Bitmap.sol";
import {IAdapter8004} from "../src/interfaces/IAdapter8004.sol";
import {MockAdapter8004} from "./mocks/MockAdapter8004.sol";

contract CensusTest is Test {
    Census internal census;
    MockAdapter8004 internal adapter;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    string internal constant HOST = "https://census.example";

    function setUp() public {
        adapter = new MockAdapter8004();
        census = new Census(address(adapter), HOST);
    }

    // ------------------------------------------------------------ helpers

    function _setPixel(bytes memory bm, uint256 r, uint256 c, uint256 tone) internal pure {
        uint256 idx = r * 40 + c;
        uint256 b = idx >> 2;
        uint256 shift = 6 - ((idx & 3) << 1);
        uint8 cur = uint8(bm[b]);
        cur = uint8((cur & ~(uint8(3) << uint8(shift))) | (uint8(tone) << uint8(shift)));
        bm[b] = bytes1(cur);
    }

    /// @dev A body that always lands inside the density band, plus 8 seed-controlled blocks
    ///      in the top signature row so every seed yields a distinct 8x8 signature.
    function _bitmap(uint256 seed) internal pure returns (bytes memory bm) {
        bm = new bytes(400);

        // torso + head mass: rows 8-35, cols 10-29 => 560 lit
        for (uint256 r = 8; r < 36; ++r) {
            for (uint256 c = 10; c < 30; ++c) {
                // vary tone so the full-ink share stays healthy
                uint256 tone = (r < 12 || c < 13 || c >= 27) ? 2 : 3;
                _setPixel(bm, r, c, tone);
            }
        }

        // signature bits: block row 0 (rows 0-4), block col i (cols 5i..5i+4)
        for (uint256 i = 0; i < 8; ++i) {
            if ((seed >> i) & 1 == 0) continue;
            for (uint256 r = 0; r < 5; ++r) {
                for (uint256 c = 0; c < 5; ++c) {
                    _setPixel(bm, r, i * 5 + c, 3);
                }
            }
        }
    }

    function _mint(address who, uint256 seed) internal returns (uint256 id) {
        vm.prank(who);
        id = census.mint(_bitmap(seed), "a quiet clerk who counts things");
    }

    // ------------------------------------------------------------ validation

    function test_ValidateRejectsWrongLength() public view {
        (bool ok, uint8 reason,) = census.validate(new bytes(399), alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_LENGTH());
    }

    function test_ValidateRejectsBlankCanvas() public view {
        (bool ok, uint8 reason,) = census.validate(new bytes(400), alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_TOO_SPARSE());
    }

    function test_ValidateRejectsSolidBlock() public view {
        bytes memory bm = new bytes(400);
        for (uint256 i; i < 400; ++i) {
            bm[i] = 0xFF;
        }
        (bool ok, uint8 reason,) = census.validate(bm, alice);
        assertFalse(ok);
        assertEq(reason, census.ERR_TOO_DENSE());
    }

    function test_ValidateAcceptsGoodBitmap() public view {
        (bool ok, uint8 reason,) = census.validate(_bitmap(1), alice);
        assertTrue(ok);
        assertEq(reason, census.OK());
    }

    function test_ValidateIsFreeAndMatchesMint() public {
        bytes memory bm = _bitmap(7);

        (bool ok,,) = census.validate(bm, alice);
        assertTrue(ok);

        vm.prank(alice);
        census.mint(bm, "ctx");

        // the same bitmap must now fail preflight for the same reason mint would revert
        (bool ok2, uint8 reason2,) = census.validate(bm, bob);
        assertFalse(ok2);
        assertEq(reason2, census.ERR_DUPLICATE());
    }

    function test_SoftWarningsDoNotBlockMint() public {
        // an off-centre blob: asymmetric and noisy, but still mintable
        bytes memory bm = new bytes(400);
        for (uint256 r = 5; r < 25; ++r) {
            for (uint256 c = 2; c < 20; ++c) {
                _setPixel(bm, r, c, 3);
            }
        }

        (bool ok,, uint8[] memory warnings) = census.validate(bm, alice);
        assertTrue(ok, "warnings must never block");
        assertGt(warnings.length, 0, "this shape should raise at least one warning");

        vm.prank(alice);
        census.mint(bm, "ctx");
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

    function test_BatchMintsEachAsItsOwnAgent() public {
        (bytes[] memory bms, string[] memory ctx) = _batch(1, 4);

        vm.prank(alice);
        uint256[] memory ids = census.mintBatch(bms, ctx);

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
        vm.prank(alice);
        vm.expectRevert(Census.WalletCapReached.selector);
        census.mintBatch(bms, ctx);
    }

    function test_BatchRejectsMismatchedArrays() public {
        (bytes[] memory bms,) = _batch(1, 3);
        string[] memory ctx = new string[](2);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Census.InvalidBitmap.selector, uint8(1)));
        census.mintBatch(bms, ctx);
    }

    function test_BatchRejectsDuplicateWithinItself() public {
        bytes[] memory bms = new bytes[](2);
        string[] memory ctx = new string[](2);
        bms[0] = _bitmap(5);
        bms[1] = _bitmap(5); // same signature twice in one call
        ctx[0] = "ctx";
        ctx[1] = "ctx";

        vm.prank(alice);
        vm.expectRevert(Census.DuplicateSignature.selector);
        census.mintBatch(bms, ctx);
    }

    function test_BitmapRoundTrips() public {
        bytes memory bm = _bitmap(9);
        vm.prank(alice);
        uint256 id = census.mint(bm, "ctx");
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
        assertEq(census.remaining(6), 300); // Executor
        assertEq(census.remainingTotal(), 10_000);
    }

    function test_ClassFollowsSkill() public view {
        assertEq(census.className(0), "Human");
        assertEq(census.className(1), "Human");
        assertEq(census.className(2), "Agent");
        assertEq(census.className(3), "Agent");
        assertEq(census.className(4), "Alien");
        assertEq(census.className(5), "Alien");
        assertEq(census.className(6), "Skull");
    }

    // ------------------------------------------------------------ ERC-8048

    function test_MetadataServesSkillAndClass() public {
        uint256 id = _mint(alice, 1);
        uint8 s = census.skillOf(id);

        assertEq(string(census.metadata(id, "skill")), census.skillName(s));
        assertEq(string(census.metadata(id, "class")), census.className(s));
    }

    function test_SkillAndClassHaveNoSetter() public {
        uint256 id = _mint(alice, 1);

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "skill", bytes("Executor"));

        vm.prank(alice);
        vm.expectRevert(Census.ImmutableKey.selector);
        census.setMetadata(id, "class", bytes("Skull"));
    }

    function test_EndpointsAreDerivedNotStored() public {
        uint256 id = _mint(alice, 1);
        assertEq(string(census.metadata(id, "endpoint[restap]")), string.concat(HOST, "/a/1"));
        assertEq(string(census.metadata(id, "endpoint[mcp]")), string.concat(HOST, "/mcp/1"));
        assertEq(string(census.metadata(id, "endpoint[x402]")), string.concat(HOST, "/pay/1"));
    }

    /// @dev Because endpoints are derived rather than stored, untouched entries follow the
    ///      shared host automatically — no per-token migration if the host ever moves.
    function test_UntouchedEntriesFollowBaseHost() public {
        uint256 id = _mint(alice, 1);

        census.setBaseHost("https://moved.example");

        assertEq(string(census.metadata(id, "endpoint[restap]")), "https://moved.example/a/1");
        assertEq(string(census.metadata(id, "endpoint[x402]")), "https://moved.example/pay/1");
    }

    /// @dev An explicit override wins over the derived default and is immune to host changes.
    function test_OverrideBeatsDerivedAndSurvivesHostChange() public {
        uint256 id = _mint(alice, 1);

        vm.prank(alice);
        census.setMetadata(id, "endpoint[restap]", bytes("https://my-own-host.xyz/agent"));

        census.setBaseHost("https://moved.example");

        assertEq(string(census.metadata(id, "endpoint[restap]")), "https://my-own-host.xyz/agent");
        // keys never overridden still track the new host
        assertEq(string(census.metadata(id, "endpoint[mcp]")), "https://moved.example/mcp/1");
    }

    /// @dev This is what makes the shared host a default rather than a lock-in.
    function test_OwnerCanRepointRestapEndpoint() public {
        uint256 id = _mint(alice, 1);

        vm.prank(alice);
        census.setMetadata(id, "endpoint[restap]", bytes("https://my-own-host.xyz/agent"));

        assertEq(string(census.metadata(id, "endpoint[restap]")), "https://my-own-host.xyz/agent");
    }

    function test_NonOwnerCannotWriteMetadata() public {
        uint256 id = _mint(alice, 1);
        vm.prank(bob);
        vm.expectRevert(Census.NotEntryOwner.selector);
        census.setMetadata(id, "context", bytes("hijacked"));
    }

    function test_SupportsERC8048InterfaceId() public view {
        assertTrue(census.supportsInterface(0xdf670be1));
    }

    // ------------------------------------------------------------ art

    function test_TokenURIIsFullyOnchain() public {
        uint256 id = _mint(alice, 1);
        string memory uri = census.tokenURI(id);

        assertTrue(bytes(uri).length > 100);
        assertEq(_slice(uri, 0, 29), "data:application/json;base64,", "must be a self-contained data URI");
    }

    function test_RenderedSVGContainsRects() public {
        uint256 id = _mint(alice, 1);
        // decoding base64 onchain is awkward; assert the URI is large enough to hold
        // hundreds of run-length rects, which a blank render could not be
        assertGt(bytes(census.tokenURI(id)).length, 2000);
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

    function setUp() public {
        adapter = new HighIdAdapter();
        census = new Census(address(adapter), "https://census.example");
    }

    function _setPixel(bytes memory bm, uint256 r, uint256 c, uint256 tone) internal pure {
        uint256 idx = r * 40 + c;
        uint256 b = idx >> 2;
        uint256 shift = 6 - ((idx & 3) << 1);
        bm[b] = bytes1(uint8((uint8(bm[b]) & ~(uint8(3) << uint8(shift))) | (uint8(tone) << uint8(shift))));
    }

    function _bitmap() internal pure returns (bytes memory bm) {
        bm = new bytes(400);
        for (uint256 r = 8; r < 36; ++r) {
            for (uint256 c = 10; c < 30; ++c) {
                _setPixel(bm, r, c, 3);
            }
        }
    }

    /// @dev `agentId` is packed into uint24. The ERC-8004 registry is global, so its ids
    ///      are not ours to predict — an id past the field must revert, never truncate.
    function test_OversizedAgentIdRevertsInsteadOfTruncating() public {
        adapter.setNextId(uint256(type(uint24).max) + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Census.AgentIdTooLarge.selector, uint256(type(uint24).max) + 1));
        census.mint(_bitmap(), "ctx");
    }

    function test_LargestFittingAgentIdStillWorks() public {
        adapter.setNextId(type(uint24).max);
        vm.prank(alice);
        uint256 id = census.mint(_bitmap(), "ctx");
        assertEq(census.agentIdOf(id), type(uint24).max);
    }

    /// @dev The entry must be complete before `adapter.register` is called, because the
    ///      adapter is code we have not read and could read back into Census.
    function test_EntryIsReadableFromWithinTheAdapterCall() public {
        adapter.setProbe(address(census));
        vm.prank(alice);
        uint256 id = census.mint(_bitmap(), "ctx");

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
            observedBitmapNonZero = ICensusProbe(probe).bitmapOf(tid).length == 400;
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
}

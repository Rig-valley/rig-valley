// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RigValleyDistributor} from "../src/RigValleyDistributor.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RigValleyDistributorTest is Test {
    RigValleyDistributor internal dist;
    MockStockToken internal token;

    address internal treasury = makeAddr("treasury");
    address internal pauser = makeAddr("pauser");
    address internal relayer = makeAddr("relayer");
    address internal player = makeAddr("player");
    uint256 internal signerKey = 0xA11CE;
    address internal signer;

    uint256 internal constant DAY = 1 days;
    uint256 internal constant CEILING = 1_000e18;
    uint256 internal constant MAX_CLAIM = 100e18;

    function setUp() public {
        signer = vm.addr(signerKey);
        token = new MockStockToken("NVIDIA Stock Token (Test)", "NVDA", 18, address(this));
        dist = new RigValleyDistributor(token, treasury, signer, pauser, DAY, CEILING, MAX_CLAIM);
        token.mint(address(dist), 10_000e18);
    }

    function _sign(address p, uint256 amount, uint256 nonce, uint256 expiry, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = dist.voucherDigest(p, amount, nonce, expiry);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_ClaimPaysPlayerEvenWhenRelayed() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 1, expiry, signerKey);
        vm.expectEmit(true, true, false, true);
        emit RigValleyDistributor.Claimed(player, 1, 5e18);
        vm.prank(relayer);
        dist.claim(player, 5e18, 1, expiry, sig);
        assertEq(token.balanceOf(player), 5e18);
        assertEq(token.balanceOf(relayer), 0);
        assertTrue(dist.usedNonces(1));
        assertEq(dist.paidInPeriod(), 5e18);
    }

    function test_RevertWhen_NonceReplayed() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 7, expiry, signerKey);
        dist.claim(player, 5e18, 7, expiry, sig);
        vm.expectRevert(RigValleyDistributor.NonceAlreadyUsed.selector);
        dist.claim(player, 5e18, 7, expiry, sig);
    }

    function test_RevertWhen_Expired() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 1, expiry, signerKey);
        vm.warp(expiry + 1);
        vm.expectRevert(RigValleyDistributor.VoucherExpired.selector);
        dist.claim(player, 5e18, 1, expiry, sig);
    }

    function test_RevertWhen_WrongSigner() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 1, expiry, 0xBAD);
        vm.expectRevert(RigValleyDistributor.InvalidSignature.selector);
        dist.claim(player, 5e18, 1, expiry, sig);
    }

    function test_RevertWhen_TamperedAmountOrPlayer() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 1, expiry, signerKey);
        vm.expectRevert(RigValleyDistributor.InvalidSignature.selector);
        dist.claim(player, 50e18, 1, expiry, sig);
        vm.expectRevert(RigValleyDistributor.InvalidSignature.selector);
        dist.claim(relayer, 5e18, 1, expiry, sig);
    }

    function test_RevertWhen_MalformedSignature() public {
        vm.expectRevert(RigValleyDistributor.InvalidSignature.selector);
        dist.claim(player, 5e18, 1, block.timestamp + 1, hex"1234");
    }

    function test_RevertWhen_ClaimTooLarge() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, MAX_CLAIM + 1, 1, expiry, signerKey);
        vm.expectRevert(RigValleyDistributor.ClaimTooLarge.selector);
        dist.claim(player, MAX_CLAIM + 1, 1, expiry, sig);
    }

    function test_PeriodCeilingAndRollover() public {
        uint256 expiry = block.timestamp + 30 days;
        for (uint256 i = 0; i < 10; i++) {
            dist.claim(player, MAX_CLAIM, i, expiry, _sign(player, MAX_CLAIM, i, expiry, signerKey));
        }
        assertEq(dist.remainingInPeriod(), 0);
        bytes memory sig = _sign(player, 1e18, 99, expiry, signerKey);
        vm.expectRevert(RigValleyDistributor.PeriodCeilingExceeded.selector);
        dist.claim(player, 1e18, 99, expiry, sig);

        vm.warp(block.timestamp + DAY);
        assertEq(dist.remainingInPeriod(), CEILING);
        dist.claim(player, 1e18, 99, expiry, sig);
        assertEq(dist.paidInPeriod(), 1e18);
    }

    function test_PauserCanPauseButNotUnpause() public {
        vm.prank(pauser);
        dist.pause();
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 1, expiry, signerKey);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        dist.claim(player, 5e18, 1, expiry, sig);

        vm.prank(pauser);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, pauser));
        dist.unpause();

        vm.prank(treasury);
        dist.unpause();
        dist.claim(player, 5e18, 1, expiry, sig);
    }

    function test_RevertWhen_StrangerPauses() public {
        vm.prank(player);
        vm.expectRevert(RigValleyDistributor.NotPauser.selector);
        dist.pause();
    }

    function test_RevokeNonceBlocksVoucher() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(player, 5e18, 3, expiry, signerKey);
        vm.prank(pauser);
        dist.revokeNonce(3);
        vm.expectRevert(RigValleyDistributor.NonceAlreadyUsed.selector);
        dist.claim(player, 5e18, 3, expiry, sig);
    }

    function test_WithdrawBackOnlyOwner() public {
        vm.prank(treasury);
        dist.withdrawBack(treasury, 1_000e18);
        assertEq(token.balanceOf(treasury), 1_000e18);

        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        dist.withdrawBack(signer, 1);
    }

    function test_RotateSigner() public {
        uint256 newKey = 0xB0B;
        vm.prank(treasury);
        dist.setVoucherSigner(vm.addr(newKey));
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory oldSig = _sign(player, 5e18, 1, expiry, signerKey);
        vm.expectRevert(RigValleyDistributor.InvalidSignature.selector);
        dist.claim(player, 5e18, 1, expiry, oldSig);
        dist.claim(player, 5e18, 1, expiry, _sign(player, 5e18, 1, expiry, newKey));
    }

    function test_RevertWhen_InvalidLimits() public {
        vm.prank(treasury);
        vm.expectRevert(RigValleyDistributor.InvalidLimits.selector);
        dist.setLimits(0, 1, 1);
    }

    function testFuzz_ClaimWithinLimits(uint256 amount, uint256 nonce) public {
        amount = bound(amount, 1, MAX_CLAIM);
        uint256 expiry = block.timestamp + 1 hours;
        dist.claim(player, amount, nonce, expiry, _sign(player, amount, nonce, expiry, signerKey));
        assertEq(token.balanceOf(player), amount);
        assertEq(token.balanceOf(address(dist)), 10_000e18 - amount);
    }
}

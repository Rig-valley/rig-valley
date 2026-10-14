// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Rig Valley reward distribution contract
/// @notice Pays NVDA Stock Token rewards to players against EIP-712 vouchers signed by the game server.
/// @dev Architecture (MASTERPLAN §10):
///  - The treasury (owner, hardware/offline wallet) tops this contract up periodically.
///  - The game server only holds the voucher-signing key. It cannot move funds on its own.
///  - Each voucher binds player, amount, nonce and expiry. Nonces are single-use.
///  - Payouts are capped per period and per voucher. If the server is compromised,
///    the maximum loss is bounded by the contract balance and the period ceiling.
///  - `claim` can be submitted by anyone (e.g. a gas-sponsoring relayer); funds always go to `player`.
contract RigValleyDistributor is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address player,uint256 amount,uint256 nonce,uint256 expiry)");

    /// @notice Reward token (NVDA Stock Token on Robinhood Chain).
    IERC20 public immutable token;

    /// @notice Server key allowed to sign vouchers.
    address public voucherSigner;

    /// @notice Emergency key allowed to pause (but never unpause or move funds).
    address public pauser;

    /// @notice Length of a payout period in seconds.
    uint256 public periodLength;

    /// @notice Maximum total payout per period.
    uint256 public periodCeiling;

    /// @notice Maximum amount a single voucher may pay.
    uint256 public maxClaimAmount;

    /// @notice Start timestamp of the current period.
    uint256 public currentPeriodStart;

    /// @notice Amount paid in the current period.
    uint256 public paidInPeriod;

    /// @notice Used (or revoked) voucher nonces.
    mapping(uint256 nonce => bool used) public usedNonces;

    event Claimed(address indexed player, uint256 indexed nonce, uint256 amount);
    event VoucherSignerUpdated(address indexed signer);
    event PauserUpdated(address indexed pauser);
    event LimitsUpdated(uint256 periodLength, uint256 periodCeiling, uint256 maxClaimAmount);
    event WithdrawnBack(address indexed to, uint256 amount);
    event NonceRevoked(uint256 indexed nonce);

    error ZeroAddress();
    error ZeroAmount();
    error VoucherExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error PeriodCeilingExceeded();
    error ClaimTooLarge();
    error NotPauser();
    error InvalidLimits();

    constructor(
        IERC20 token_,
        address owner_,
        address voucherSigner_,
        address pauser_,
        uint256 periodLength_,
        uint256 periodCeiling_,
        uint256 maxClaimAmount_
    ) EIP712("RigValleyDistributor", "1") Ownable(owner_) {
        if (address(token_) == address(0) || voucherSigner_ == address(0)) revert ZeroAddress();
        token = token_;
        voucherSigner = voucherSigner_;
        pauser = pauser_;
        _setLimits(periodLength_, periodCeiling_, maxClaimAmount_);
        currentPeriodStart = block.timestamp;
        emit VoucherSignerUpdated(voucherSigner_);
        emit PauserUpdated(pauser_);
    }

    // ---------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------

    /// @notice Pay out a voucher. Callable by anyone; tokens always go to `player`.
    function claim(address player, uint256 amount, uint256 nonce, uint256 expiry, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        if (player == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > expiry) revert VoucherExpired();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (amount > maxClaimAmount) revert ClaimTooLarge();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, player, amount, nonce, expiry)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != voucherSigner) revert InvalidSignature();

        _rollPeriod();
        if (paidInPeriod + amount > periodCeiling) revert PeriodCeilingExceeded();

        usedNonces[nonce] = true;
        paidInPeriod += amount;
        token.safeTransfer(player, amount);
        emit Claimed(player, nonce, amount);
    }

    /// @notice EIP-712 digest of a voucher (helper for off-chain tooling and tests).
    function voucherDigest(address player, uint256 amount, uint256 nonce, uint256 expiry)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, player, amount, nonce, expiry)));
    }

    /// @notice Amount that can still be paid in the current period.
    function remainingInPeriod() external view returns (uint256) {
        if (block.timestamp >= currentPeriodStart + periodLength) return periodCeiling;
        return paidInPeriod >= periodCeiling ? 0 : periodCeiling - paidInPeriod;
    }

    // ---------------------------------------------------------------------
    // Safety levers
    // ---------------------------------------------------------------------

    /// @notice Pause claims. Owner or the emergency pauser.
    function pause() external {
        if (msg.sender != owner() && msg.sender != pauser) revert NotPauser();
        _pause();
    }

    /// @notice Resume claims. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Invalidate a voucher nonce before it is used. Owner or pauser.
    function revokeNonce(uint256 nonce) external {
        if (msg.sender != owner() && msg.sender != pauser) revert NotPauser();
        usedNonces[nonce] = true;
        emit NonceRevoked(nonce);
    }

    /// @notice Return unused funds to the treasury.
    function withdrawBack(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit WithdrawnBack(to, amount);
    }

    function setVoucherSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        voucherSigner = signer;
        emit VoucherSignerUpdated(signer);
    }

    function setPauser(address pauser_) external onlyOwner {
        pauser = pauser_;
        emit PauserUpdated(pauser_);
    }

    function setLimits(uint256 periodLength_, uint256 periodCeiling_, uint256 maxClaimAmount_) external onlyOwner {
        _setLimits(periodLength_, periodCeiling_, maxClaimAmount_);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _setLimits(uint256 periodLength_, uint256 periodCeiling_, uint256 maxClaimAmount_) internal {
        if (periodLength_ == 0 || periodCeiling_ == 0 || maxClaimAmount_ == 0) revert InvalidLimits();
        periodLength = periodLength_;
        periodCeiling = periodCeiling_;
        maxClaimAmount = maxClaimAmount_;
        emit LimitsUpdated(periodLength_, periodCeiling_, maxClaimAmount_);
    }

    function _rollPeriod() internal {
        uint256 start = currentPeriodStart;
        if (block.timestamp >= start + periodLength) {
            uint256 elapsedPeriods = (block.timestamp - start) / periodLength;
            currentPeriodStart = start + elapsedPeriods * periodLength;
            paidInPeriod = 0;
        }
    }
}

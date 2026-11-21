// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title SMC_06_26_C1
/// @notice SERO Latam final payment contract — June 2026, sequence C1.
/// @dev Round-robin treasury list, two-step ownership, explicit relayer registration.
///      Deployer is NOT auto-added as relayer; pass initialRelayers_ in constructor.
contract SMC_06_26_C1 {
    string public constant NAME = "SMC_06_26_C1";
    string public constant VERSION = "1";
    string public constant CYCLE_ID = "SMC_06_26_C1";

    uint256 private constant FEE_LOW        = 15e16;    // 0.15 USDT
    uint256 private constant FEE_MID        = 25e16;    // 0.25 USDT
    uint256 private constant TIER_LOW_LIMIT = 10e18;    // 10 USDT
    uint256 private constant TIER_MID_LIMIT = 50e18;    // 50 USDT
    uint256 private constant FEE_HIGH_BPS   = 50;       // 0.5%
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant MAX_TREASURIES = 4;

    bytes32 private constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address user,address recipient,uint256 amount,uint256 fee,uint256 nonce,uint256 deadline,bytes32 clientTxId)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    IERC20 public immutable token;
    address public owner;
    address public pendingOwner;
    bool public paused;

    address[] private _treasuries;
    uint256 private _treasuryIndex;

    mapping(address => bool) public relayers;
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    struct Payment {
        address user;
        address recipient;
        uint256 amount;
        uint256 fee;
        uint256 nonce;
        uint256 deadline;
        bytes32 clientTxId;
    }

    event PaymentExecuted(
        bytes32 indexed clientTxId,
        address indexed user,
        address indexed recipient,
        uint256 amount,
        uint256 fee,
        uint256 nonce,
        address relayer,
        address treasury
    );
    event TreasuriesUpdated(address[] treasuries);
    event TreasuryRotated(address indexed treasury, uint256 slotIndex, uint256 rotationIndex);
    event RelayerUpdated(address indexed relayer, bool allowed);
    event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner_);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    error NotOwner();
    error NotPendingOwner();
    error NotRelayer();
    error PausedContract();
    error ZeroAddress();
    error Expired();
    error BadFee();
    error BadSignature();
    error NonceUsed();
    error BadAmount();
    error BadTreasuryList();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (!relayers[msg.sender]) revert NotRelayer();
        _;
    }

    /// @param token_             ERC-20 token used for payments and fees.
    /// @param initialTreasuries_ Fee recipients, 1–4 addresses, no zeros. Rotation starts at index 0.
    /// @param owner_             Initial owner. Two-step transfer required to change.
    /// @param initialRelayers_   Addresses allowed to call executePayment. Deployer NOT included unless listed here.
    constructor(
        address token_,
        address[] memory initialTreasuries_,
        address owner_,
        address[] memory initialRelayers_
    ) {
        if (token_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        _validateTreasuries(initialTreasuries_);

        token = IERC20(token_);
        owner = owner_;

        for (uint256 i = 0; i < initialTreasuries_.length; i++) {
            _treasuries.push(initialTreasuries_[i]);
        }
        emit TreasuriesUpdated(initialTreasuries_);
        emit OwnershipTransferred(address(0), owner_);

        for (uint256 i = 0; i < initialRelayers_.length; i++) {
            if (initialRelayers_[i] == address(0)) revert ZeroAddress();
            relayers[initialRelayers_[i]] = true;
            emit RelayerUpdated(initialRelayers_[i], true);
        }
    }

    // ── Fee logic ─────────────────────────────────────────────────────────────

    function quoteFee(uint256 amount) public pure returns (uint256) {
        if (amount == 0) revert BadAmount();
        if (amount < TIER_LOW_LIMIT) return FEE_LOW;
        if (amount <= TIER_MID_LIMIT) return FEE_MID;
        return (amount * FEE_HIGH_BPS) / BPS_DENOMINATOR;
    }

    function totalRequired(uint256 amount) external pure returns (uint256) {
        return amount + quoteFee(amount);
    }

    // ── EIP-712 ───────────────────────────────────────────────────────────────

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    function paymentDigest(Payment calldata payment) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_TYPEHASH,
                payment.user,
                payment.recipient,
                payment.amount,
                payment.fee,
                payment.nonce,
                payment.deadline,
                payment.clientTxId
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    // ── Core payment ──────────────────────────────────────────────────────────

    function executePayment(Payment calldata payment, bytes calldata signature) external onlyRelayer {
        if (paused) revert PausedContract();
        if (payment.user == address(0) || payment.recipient == address(0)) revert ZeroAddress();
        if (payment.amount == 0) revert BadAmount();
        if (payment.deadline < block.timestamp) revert Expired();
        if (usedNonces[payment.user][payment.nonce]) revert NonceUsed();
        if (payment.fee != quoteFee(payment.amount)) revert BadFee();

        address signer = ECDSA.recover(paymentDigest(payment), signature);
        if (signer != payment.user) revert BadSignature();

        usedNonces[payment.user][payment.nonce] = true;

        uint256 rotationIndex = _treasuryIndex;
        uint256 slotIndex = rotationIndex % _treasuries.length;
        address treasury = _treasuries[slotIndex];
        _treasuryIndex = rotationIndex + 1;

        SafeERC20.safeTransferFrom(token, payment.user, payment.recipient, payment.amount);
        SafeERC20.safeTransferFrom(token, payment.user, treasury, payment.fee);

        emit TreasuryRotated(treasury, slotIndex, rotationIndex);
        emit PaymentExecuted(
            payment.clientTxId,
            payment.user,
            payment.recipient,
            payment.amount,
            payment.fee,
            payment.nonce,
            msg.sender,
            treasury
        );
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Replace the full treasury list. Does not reset the rotation index.
    function setTreasuries(address[] calldata next) external onlyOwner {
        _validateTreasuries(next);
        delete _treasuries;
        for (uint256 i = 0; i < next.length; i++) {
            _treasuries.push(next[i]);
        }
        emit TreasuriesUpdated(next);
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        relayers[relayer] = allowed;
        emit RelayerUpdated(relayer, allowed);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Initiate two-step ownership transfer. Pass address(0) to cancel.
    function transferOwnership(address next) external onlyOwner {
        pendingOwner = next;
        emit OwnershipTransferInitiated(owner, next);
    }

    /// @notice Accept pending ownership transfer. Must be called by pendingOwner.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address old = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, owner);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function treasuries() external view returns (address[] memory) {
        return _treasuries;
    }

    function treasuryIndex() external view returns (uint256) {
        return _treasuryIndex;
    }

    function currentTreasury() external view returns (address) {
        return _treasuries[_treasuryIndex % _treasuries.length];
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _validateTreasuries(address[] memory list) internal pure {
        if (list.length == 0 || list.length > MAX_TREASURIES) revert BadTreasuryList();
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == address(0)) revert ZeroAddress();
            for (uint256 j = 0; j < i; j++) {
                if (list[i] == list[j]) revert BadTreasuryList();
            }
        }
    }
}

// ── Interfaces & Libraries ────────────────────────────────────────────────────

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

library SafeERC20 {
    error SafeTransferFailed();

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert SafeTransferFailed();
    }
}

library ECDSA {
    error BadSignatureLength();
    error BadSignatureS();
    error BadSignatureV();

    uint256 private constant HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    function recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) revert BadSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        if (uint256(s) > HALF_ORDER) revert BadSignatureS();
        if (v != 27 && v != 28) revert BadSignatureV();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignatureV();
        return signer;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FloatPool v3 — Investor vault with buyer collateral, seller stake, and insurance reserve
contract FloatPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    address public authorizedCore;

    uint256 public totalShares;
    uint256 public totalLockedCollateral; // buyer collateral in custody
    uint256 public sellerStakeTotal;      // seller security deposits in custody
    uint256 public insuranceReserve;      // accumulated from 1% payment fees

    mapping(address => uint256) public shares;
    mapping(uint256 => uint256) public lockedCollateral; // invoiceId → buyer collateral
    mapping(uint256 => uint256) public lockedSellerStake; // invoiceId → seller stake

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroShares();
    error InsufficientShares(uint256 requested, uint256 available);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error Unauthorized();
    error CoreAlreadySet();

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed investor, uint256 amount, uint256 shares);
    event Withdrawn(address indexed investor, uint256 shares, uint256 usdcReturned);
    event CoreSet(address indexed core);
    event AdvanceSent(address indexed to, uint256 amount);
    event CollateralLocked(uint256 indexed invoiceId, address indexed buyer, uint256 amount);
    event CollateralReleased(uint256 indexed invoiceId, address indexed to, uint256 amount);
    event CollateralSlashed(uint256 indexed invoiceId, uint256 amount);
    event SellerStakeRecorded(uint256 indexed invoiceId, uint256 amount);
    event SellerStakeReleased(uint256 indexed invoiceId, address indexed to, uint256 amount);
    event SellerStakeSlashed(uint256 indexed invoiceId, uint256 amount);
    event InsuranceFunded(uint256 amount);
    event InsuranceCoverUsed(uint256 indexed invoiceId, uint256 covered);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setAuthorizedCore(address _core) external onlyOwner {
        if (authorizedCore != address(0)) revert CoreAlreadySet();
        authorizedCore = _core;
        emit CoreSet(_core);
    }

    // ─── Investor actions ─────────────────────────────────────────────────────

    /// Deposit USDC, receive proportional shares.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 assets    = investorAssets();
        uint256 newShares = (totalShares == 0 || assets == 0)
            ? amount
            : (amount * totalShares) / assets;

        totalShares += newShares;
        shares[msg.sender] += newShares;
        emit Deposited(msg.sender, amount, newShares);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// Redeem shares for USDC at current share value.
    function withdraw(uint256 shareAmount) external nonReentrant {
        if (shareAmount == 0) revert ZeroShares();
        if (shares[msg.sender] < shareAmount)
            revert InsufficientShares(shareAmount, shares[msg.sender]);

        uint256 assets  = investorAssets();
        uint256 usdcOut = (shareAmount * assets) / totalShares;
        if (usdcOut == 0) revert ZeroAmount();

        uint256 liquid = availableLiquidity();
        if (usdcOut > liquid) revert InsufficientLiquidity(usdcOut, liquid);

        totalShares -= shareAmount;
        shares[msg.sender] -= shareAmount;
        emit Withdrawn(msg.sender, shareAmount, usdcOut);

        usdc.safeTransfer(msg.sender, usdcOut);
    }

    // ─── Core-only: advances ──────────────────────────────────────────────────

    /// Disburse advance to a seller. Only FloatCore.
    function advanceFunds(address to, uint256 amount) external nonReentrant onlyCore {
        uint256 liquid = availableLiquidity();
        if (amount > liquid) revert InsufficientLiquidity(amount, liquid);
        emit AdvanceSent(to, amount);
        usdc.safeTransfer(to, amount);
    }

    // ─── Core-only: buyer collateral ──────────────────────────────────────────

    /// Record buyer collateral already transferred into pool by FloatCore.
    function recordCollateral(uint256 invoiceId, uint256 amount) external onlyCore {
        if (amount == 0) return;
        lockedCollateral[invoiceId] = amount;
        totalLockedCollateral += amount;
        emit CollateralLocked(invoiceId, msg.sender, amount);
    }

    /// Return collateral to buyer on successful payment.
    function releaseCollateral(uint256 invoiceId, address to) external nonReentrant onlyCore {
        uint256 amount = lockedCollateral[invoiceId];
        if (amount == 0) return;
        lockedCollateral[invoiceId] = 0;
        totalLockedCollateral -= amount;
        emit CollateralReleased(invoiceId, to, amount);
        usdc.safeTransfer(to, amount);
    }

    /// Keep buyer collateral in pool on default (clear tracking, USDC stays).
    function slashCollateral(uint256 invoiceId) external nonReentrant onlyCore {
        uint256 amount = lockedCollateral[invoiceId];
        if (amount == 0) return;
        lockedCollateral[invoiceId] = 0;
        totalLockedCollateral -= amount;
        emit CollateralSlashed(invoiceId, amount);
        // USDC remains in pool, accrues to investors
    }

    // ─── Core-only: seller stake ──────────────────────────────────────────────

    /// Record seller stake withheld from advance. USDC is already in pool (never disbursed).
    function recordSellerStake(uint256 invoiceId, uint256 amount) external onlyCore {
        if (amount == 0) return;
        lockedSellerStake[invoiceId] = amount;
        sellerStakeTotal += amount;
        emit SellerStakeRecorded(invoiceId, amount);
    }

    /// Return seller stake on successful buyer payment.
    function releaseSellerStake(uint256 invoiceId, address to) external nonReentrant onlyCore {
        uint256 amount = lockedSellerStake[invoiceId];
        if (amount == 0) return;
        lockedSellerStake[invoiceId] = 0;
        sellerStakeTotal -= amount;
        emit SellerStakeReleased(invoiceId, to, amount);
        usdc.safeTransfer(to, amount);
    }

    /// Keep seller stake in pool on default — first-loss buffer.
    function slashSellerStake(uint256 invoiceId) external nonReentrant onlyCore {
        uint256 amount = lockedSellerStake[invoiceId];
        if (amount == 0) return;
        lockedSellerStake[invoiceId] = 0;
        sellerStakeTotal -= amount;
        emit SellerStakeSlashed(invoiceId, amount);
        // USDC remains in pool
    }

    // ─── Core-only: insurance reserve ────────────────────────────────────────

    /// Add to insurance reserve from payment fees. USDC already in pool.
    function fundInsurance(uint256 amount) external onlyCore {
        if (amount == 0) return;
        insuranceReserve += amount;
        emit InsuranceFunded(amount);
    }

    /// On default: draw from insurance reserve to cover the LP shortfall.
    /// shortfall = advance - buyerCollateral - sellerStake (already slashed).
    function coverFromInsurance(
        uint256 invoiceId,
        uint256 advance,
        uint256 collateral,
        uint256 stake
    ) external onlyCore {
        uint256 protected = collateral + stake;
        if (advance <= protected) return; // fully covered, insurance not needed
        uint256 shortfall = advance - protected;
        uint256 covered = shortfall < insuranceReserve ? shortfall : insuranceReserve;
        if (covered == 0) return;
        insuranceReserve -= covered;
        emit InsuranceCoverUsed(invoiceId, covered);
        // USDC stays in pool; LP investorAssets rises by `covered` (reserve released)
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// All USDC in the pool (includes all reserved amounts).
    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// USDC attributable to investors only (excludes all custody/reserve amounts).
    function investorAssets() public view returns (uint256) {
        uint256 bal = totalAssets();
        uint256 reserved = totalLockedCollateral + sellerStakeTotal + insuranceReserve;
        return bal > reserved ? bal - reserved : 0;
    }

    /// USDC available for new advances.
    function availableLiquidity() public view returns (uint256) {
        return investorAssets();
    }

    /// Value of 1e18 shares in USDC, based on investor assets only.
    function shareValue() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (investorAssets() * 1e18) / totalShares;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyCore() {
        if (msg.sender != authorizedCore) revert Unauthorized();
        _;
    }
}

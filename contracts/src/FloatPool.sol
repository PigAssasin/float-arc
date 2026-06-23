// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FloatPool v6a - Tokenized investor vault (fLP) with buyer collateral,
///        seller stake, and a bounded insurance reserve.
/// @dev LP shares are a transferable ERC20 ("Float LP" / fLP, 6 decimals to match USDC).
contract FloatPool is ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    address public authorizedCore;

    // Insurance reserve is capped at this share of investor assets; the rest of any
    // incoming fee accrues to LP yield instead of locking capital forever.
    uint256 public constant INSURANCE_TARGET_BPS = 1000; // 10%

    // Inflation/donation-attack guard: a minimum first deposit and permanently-locked
    // dead shares keep totalSupply away from the dust range that enables the attack.
    uint256 public constant MIN_FIRST_DEPOSIT = 1e6; // 1 USDC
    uint256 public constant DEAD_SHARES       = 1e3; // locked to address(0xdead) forever

    uint256 public totalLockedCollateral; // buyer collateral in custody
    uint256 public sellerStakeTotal;      // seller security deposits in custody
    uint256 public insuranceReserve;      // accumulated from 1% payment fees

    mapping(uint256 => uint256) public lockedCollateral; // invoiceId → buyer collateral
    mapping(uint256 => uint256) public lockedSellerStake; // invoiceId → seller stake

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroShares();
    error InsufficientShares(uint256 requested, uint256 available);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error Unauthorized();
    error CoreAlreadySet();
    error BelowMinFirstDeposit(uint256 amount, uint256 minimum);

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

    constructor(address _usdc) ERC20("Float LP", "fLP") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /// fLP uses 6 decimals to stay 1:1-scaled with USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setAuthorizedCore(address _core) external onlyOwner {
        if (authorizedCore != address(0)) revert CoreAlreadySet();
        authorizedCore = _core;
        emit CoreSet(_core);
    }

    // ─── Investor actions ─────────────────────────────────────────────────────

    /// Deposit USDC, receive proportional fLP shares.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        uint256 newShares;

        if (supply == 0) {
            // First deposit: enforce a minimum and lock dead shares forever.
            if (amount < MIN_FIRST_DEPOSIT) revert BelowMinFirstDeposit(amount, MIN_FIRST_DEPOSIT);
            newShares = amount;
            _mint(address(0xdEaD), DEAD_SHARES);
            _mint(msg.sender, newShares - DEAD_SHARES);
        } else {
            uint256 assets = investorAssets();
            newShares = assets == 0 ? amount : (amount * supply) / assets;
            if (newShares == 0) revert ZeroShares();
            _mint(msg.sender, newShares);
        }

        emit Deposited(msg.sender, amount, newShares);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// Redeem fLP shares for USDC at current share value.
    function withdraw(uint256 shareAmount) external nonReentrant {
        if (shareAmount == 0) revert ZeroShares();
        if (balanceOf(msg.sender) < shareAmount)
            revert InsufficientShares(shareAmount, balanceOf(msg.sender));

        uint256 assets  = investorAssets();
        uint256 usdcOut = (shareAmount * assets) / totalSupply();
        if (usdcOut == 0) revert ZeroAmount();

        uint256 liquid = availableLiquidity();
        if (usdcOut > liquid) revert InsufficientLiquidity(usdcOut, liquid);

        _burn(msg.sender, shareAmount);
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

    /// v6: pay out from investor assets (seller residual or protocol fee at settlement).
    /// Guarded by availableLiquidity so reserved buckets (collateral/stake/insurance) are untouched.
    function payTo(address to, uint256 amount) external nonReentrant onlyCore {
        if (amount == 0) return;
        uint256 liquid = availableLiquidity();
        if (amount > liquid) revert InsufficientLiquidity(amount, liquid);
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

    /// Add to insurance reserve from payment fees, capped at INSURANCE_TARGET_BPS of
    /// investor assets. Any excess fee stays in the pool as LP yield (not reserved).
    function fundInsurance(uint256 amount) external onlyCore {
        if (amount == 0) return;
        uint256 target = (investorAssets() * INSURANCE_TARGET_BPS) / 10_000;
        if (insuranceReserve >= target) return; // already at cap; fee becomes LP yield
        uint256 headroom = target - insuranceReserve;
        uint256 add = amount < headroom ? amount : headroom;
        insuranceReserve += add;
        emit InsuranceFunded(add);
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
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (investorAssets() * 1e18) / supply;
    }

    /// @dev Backward-compatible aliases for the pre-tokenization share API.
    function totalShares() external view returns (uint256) {
        return totalSupply();
    }

    function shares(address account) external view returns (uint256) {
        return balanceOf(account);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyCore() {
        if (msg.sender != authorizedCore) revert Unauthorized();
        _;
    }
}

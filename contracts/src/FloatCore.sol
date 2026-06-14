// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./FloatPool.sol";

/// @title FloatCore v3 — Invoice lifecycle with seller stake, invoice size cap, and insurance fee
contract FloatCore is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum InvoiceStatus {
        PENDING_APPROVAL,   // created by seller, awaiting buyer confirmation
        PENDING_COLLATERAL, // buyer confirmed, awaiting collateral lock
        FUNDED,             // collateral locked, advance sent to seller
        PAID,               // buyer paid in full (collateral + stake returned)
        DEFAULTED,          // past due date + grace, collateral + stake slashed
        CANCELLED           // timed out or buyer rejected
    }

    struct Invoice {
        address seller;
        address buyer;
        uint256 amount;      // face value (USDC, 6 dec)
        uint256 advance;     // face advance amount (e.g. 75% of amount)
        uint256 collateral;  // buyer security deposit
        uint256 stake;       // seller security deposit withheld from disbursement
        uint256 dueDate;     // unix timestamp for payment
        uint256 createdAt;   // for timeout + early repayment calc
        uint256 approvedAt;  // when buyer approved (collateral timeout clock)
        uint256 amountPaid;  // cumulative face value paid (installments)
        InvoiceStatus status;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant GRACE_PERIOD        = 7 days;
    uint256 public constant APPROVAL_TIMEOUT    = 72 hours;
    uint256 public constant COLLATERAL_TIMEOUT  = 48 hours;
    uint256 public constant MAX_DISCOUNT_BPS    = 200;   // 2% max early repayment discount
    uint256 public constant INSURANCE_FEE_BPS   = 100;   // 1% of invoice amount to insurance reserve
    uint256 public constant MAX_INVOICE_BPS     = 2000;  // single invoice advance max = 20% of available liquidity

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20     public immutable usdc;
    FloatPool  public immutable pool;

    uint256 public invoiceCount;

    mapping(uint256 => Invoice)  public invoices;

    // Seller credit
    mapping(address => uint256) public sellerPaidCount;
    mapping(address => uint256) public sellerTotalCount;

    // Buyer credit
    mapping(address => uint256) public buyerPaidCount;
    mapping(address => uint256) public buyerTotalCount;

    // ─── Anti-Sybil (production hooks; OFF by default on testnet) ────────────────
    // verificationRequired defaults to false and maxOutstandingPerSeller to 0 so the
    // testnet flow is completely open. An operator opts in for production (pluggable to EAS).
    address public attestor;
    bool    public verificationRequired;                  // false → no verification gate
    mapping(address => bool)    public verified;
    mapping(address => uint256) public outstandingAdvance; // seller => sum of un-repaid advances
    uint256 public maxOutstandingPerSeller;               // 0 = unlimited

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAmount();
    error InvalidDueDate();
    error InsufficientPoolLiquidity(uint256 requested, uint256 available);
    error InvoiceTooLarge(uint256 advance, uint256 maxAllowed);
    error InvoiceNotFound(uint256 id);
    error WrongStatus(InvoiceStatus current, InvoiceStatus expected);
    error NotBuyer(address caller, address expected);
    error ApprovalTimeoutNotReached(uint256 cancelableAt, uint256 current);
    error CollateralTimeoutNotReached(uint256 cancelableAt, uint256 current);
    error GracePeriodNotExpired(uint256 defaultableAfter, uint256 current);
    error SelfInvoice();
    error NotAttestor(address caller);
    error NotVerified(address who);
    error ExposureCapExceeded(uint256 attempted, uint256 cap);
    error Overpayment(uint256 attempted, uint256 remaining);

    // ─── Events ───────────────────────────────────────────────────────────────

    event InvoiceCreated(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 amount,
        uint256 advance,
        uint256 stake,
        uint256 collateral,
        uint256 dueDate
    );
    event InvoiceApproved(uint256 indexed id, address indexed buyer);
    event InvoiceRejected(uint256 indexed id, address indexed buyer);
    event CollateralLocked(uint256 indexed id, address indexed buyer, uint256 amount);
    event InvoiceFunded(uint256 indexed id, uint256 netDisbursed, uint256 stakeWithheld);
    event InvoicePaid(uint256 indexed id, address indexed buyer, uint256 amountPaid, uint256 discount);
    event PartialPayment(uint256 indexed id, uint256 amount, uint256 totalPaid);
    event CollateralReturned(uint256 indexed id, address indexed buyer, uint256 amount);
    event SellerStakeReturned(uint256 indexed id, address indexed seller, uint256 amount);
    event InvoiceDefaulted(uint256 indexed id, address indexed seller, uint256 collateralSlashed, uint256 stakeSlashed);
    event InvoiceCancelled(uint256 indexed id);
    event SellerScoreUpdated(address indexed seller, uint256 newScore);
    event BuyerScoreUpdated(address indexed buyer, uint256 newScore);
    event AttestorSet(address indexed attestor);
    event VerificationRequiredSet(bool required);
    event VerifiedSet(address indexed who, bool verified);
    event MaxOutstandingPerSellerSet(uint256 cap);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _pool) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        pool = FloatPool(_pool);
    }

    // ─── Admin: anti-Sybil config (no-op on testnet defaults) ───────────────────

    function setAttestor(address a) external onlyOwner {
        attestor = a;
        emit AttestorSet(a);
    }

    function setVerificationRequired(bool required) external onlyOwner {
        verificationRequired = required;
        emit VerificationRequiredSet(required);
    }

    function setMaxOutstandingPerSeller(uint256 cap) external onlyOwner {
        maxOutstandingPerSeller = cap;
        emit MaxOutstandingPerSellerSet(cap);
    }

    /// Mark an address verified. Callable by the owner or the configured attestor.
    function setVerified(address who, bool isVerified) external {
        if (msg.sender != owner() && msg.sender != attestor) revert NotAttestor(msg.sender);
        verified[who] = isVerified;
        emit VerifiedSet(who, isVerified);
    }

    // ─── Seller: create invoice ───────────────────────────────────────────────

    /// Seller creates an invoice. Status starts at PENDING_APPROVAL.
    /// Advance, stake, and collateral are pre-calculated and locked in the struct.
    function createInvoice(
        address buyer,
        uint256 amount,
        uint256 dueTimestamp
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (dueTimestamp <= block.timestamp) revert InvalidDueDate();
        if (buyer == msg.sender) revert SelfInvoice();

        // Verification gate — disabled by default (testnet). When enabled, both parties
        // must be verified. Pluggable to an external attestation source for production.
        if (verificationRequired) {
            if (!verified[msg.sender]) revert NotVerified(msg.sender);
            if (!verified[buyer])      revert NotVerified(buyer);
        }

        uint256 advanceBps    = sellerAdvanceBps(msg.sender);
        uint256 collateralBps = buyerCollateralBps(advanceBps, buyer);
        uint256 stakeBps      = sellerStakeBps(msg.sender);

        uint256 advance    = (amount * advanceBps)    / 10_000;
        uint256 collateral = (amount * collateralBps) / 10_000;
        uint256 stake      = (amount * stakeBps)      / 10_000;

        // Check pool liquidity covers the advance (buyer collateral + seller stake arrive later)
        uint256 liquidity = pool.availableLiquidity();
        if (liquidity < advance)
            revert InsufficientPoolLiquidity(advance, liquidity);

        // Single-invoice size cap: advance must not exceed 20% of available pool liquidity
        if (liquidity > 0 && advance > (liquidity * MAX_INVOICE_BPS) / 10_000)
            revert InvoiceTooLarge(advance, (liquidity * MAX_INVOICE_BPS) / 10_000);

        id = invoiceCount++;
        invoices[id] = Invoice({
            seller:     msg.sender,
            buyer:      buyer,
            amount:     amount,
            advance:    advance,
            collateral: collateral,
            stake:      stake,
            dueDate:    dueTimestamp,
            createdAt:  block.timestamp,
            approvedAt: 0,
            amountPaid: 0,
            status:     InvoiceStatus.PENDING_APPROVAL
        });

        sellerTotalCount[msg.sender]++;
        emit InvoiceCreated(id, msg.sender, buyer, amount, advance, stake, collateral, dueTimestamp);
    }

    // ─── Buyer: approve or reject ──────────────────────────────────────────────

    /// Buyer confirms the invoice is legitimate. Moves to PENDING_COLLATERAL.
    function approveInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_APPROVAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_APPROVAL);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        inv.status = InvoiceStatus.PENDING_COLLATERAL;
        inv.approvedAt = block.timestamp;
        emit InvoiceApproved(id, msg.sender);
    }

    /// Buyer rejects a fraudulent or incorrect invoice.
    function rejectInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_APPROVAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_APPROVAL);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        if (sellerTotalCount[inv.seller] > 0) sellerTotalCount[inv.seller]--;

        inv.status = InvoiceStatus.CANCELLED;
        emit InvoiceRejected(id, msg.sender);
        emit InvoiceCancelled(id);
    }

    // ─── Buyer: lock collateral ────────────────────────────────────────────────

    /// Buyer locks USDC collateral. Pool records seller stake, then advances seller net of stake.
    /// Buyer must approve FloatCore for inv.collateral before calling.
    function lockCollateral(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_COLLATERAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_COLLATERAL);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        // Re-check liquidity at lock time
        uint256 liquidity = pool.availableLiquidity();
        if (liquidity < inv.advance)
            revert InsufficientPoolLiquidity(inv.advance, liquidity);

        // Re-check single-invoice size cap (pool may have shrunk since creation)
        if (liquidity > 0 && inv.advance > (liquidity * MAX_INVOICE_BPS) / 10_000)
            revert InvoiceTooLarge(inv.advance, (liquidity * MAX_INVOICE_BPS) / 10_000);

        // Per-seller outstanding exposure cap (0 = unlimited)
        uint256 newOutstanding = outstandingAdvance[inv.seller] + inv.advance;
        if (maxOutstandingPerSeller != 0 && newOutstanding > maxOutstandingPerSeller)
            revert ExposureCapExceeded(newOutstanding, maxOutstandingPerSeller);
        outstandingAdvance[inv.seller] = newOutstanding;

        inv.status = InvoiceStatus.FUNDED;
        uint256 netDisbursed = inv.advance - inv.stake;

        emit CollateralLocked(id, msg.sender, inv.collateral);
        emit InvoiceFunded(id, netDisbursed, inv.stake);

        // INTERACTIONS (checks-effects-interactions pattern respected above)
        // 1. Pull buyer collateral → pool
        if (inv.collateral > 0) {
            usdc.safeTransferFrom(msg.sender, address(pool), inv.collateral);
            pool.recordCollateral(id, inv.collateral);
        }
        // 2. Record seller stake (USDC already in pool, never disbursed)
        if (inv.stake > 0) {
            pool.recordSellerStake(id, inv.stake);
        }
        // 3. Advance seller net of stake
        pool.advanceFunds(inv.seller, netDisbursed);
    }

    // ─── Buyer: pay invoice ────────────────────────────────────────────────────

    /// Pay the full remaining balance of a funded invoice in one shot.
    /// Early repayment of the remainder earns a discount (up to 2%).
    /// On settlement: collateral returned to buyer, stake to seller, 1% fee to insurance.
    function payInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.FUNDED)
            revert WrongStatus(inv.status, InvoiceStatus.FUNDED);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        uint256 remaining = inv.amount - inv.amountPaid;
        (uint256 amountDue, uint256 discount) = _discountOn(inv, remaining);

        // EFFECTS
        inv.amountPaid = inv.amount; // fully covered

        // INTERACTIONS: pull the discounted remainder, then settle
        usdc.safeTransferFrom(msg.sender, address(pool), amountDue);
        _settle(id, discount);
    }

    /// Pay an installment toward a funded invoice. No early-payment discount on
    /// partials (the discount is reserved for paying the whole remainder at once).
    /// Auto-settles when the cumulative amount reaches the face value.
    function payPartial(uint256 id, uint256 payAmount) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.FUNDED)
            revert WrongStatus(inv.status, InvoiceStatus.FUNDED);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);
        if (payAmount == 0) revert ZeroAmount();

        uint256 remaining = inv.amount - inv.amountPaid;
        if (payAmount > remaining) revert Overpayment(payAmount, remaining);

        // EFFECTS
        inv.amountPaid += payAmount;
        emit PartialPayment(id, payAmount, inv.amountPaid);

        // INTERACTIONS
        usdc.safeTransferFrom(msg.sender, address(pool), payAmount);

        if (inv.amountPaid == inv.amount) {
            _settle(id, 0);
        }
    }

    /// Finalize a fully-covered invoice: mark PAID, update scores, return
    /// collateral + stake, fund insurance. USDC for payment is already in the pool.
    function _settle(uint256 id, uint256 discount) internal {
        Invoice storage inv = invoices[id];
        uint256 insuranceFee = (inv.amount * INSURANCE_FEE_BPS) / 10_000;

        inv.status = InvoiceStatus.PAID;
        sellerPaidCount[inv.seller]++;
        buyerPaidCount[inv.buyer]++;
        buyerTotalCount[inv.buyer]++;
        outstandingAdvance[inv.seller] -= inv.advance;

        emit InvoicePaid(id, inv.buyer, inv.amount - discount, discount);
        emit CollateralReturned(id, inv.buyer, inv.collateral);
        emit SellerStakeReturned(id, inv.seller, inv.stake);
        emit SellerScoreUpdated(inv.seller, sellerScore(inv.seller));
        emit BuyerScoreUpdated(inv.buyer, buyerScore(inv.buyer));

        pool.releaseCollateral(id, inv.buyer);
        if (inv.stake > 0) {
            pool.releaseSellerStake(id, inv.seller);
        }
        // Total lifecycle payments (>= face - discount) back this fee.
        if (insuranceFee > 0) {
            pool.fundInsurance(insuranceFee);
        }
    }

    // ─── Anyone: mark default ─────────────────────────────────────────────────

    /// Mark an overdue invoice as DEFAULTED.
    /// Collateral + stake are slashed; insurance covers remaining LP shortfall.
    function markDefault(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.FUNDED)
            revert WrongStatus(inv.status, InvoiceStatus.FUNDED);

        uint256 defaultableAfter = inv.dueDate + GRACE_PERIOD;
        if (block.timestamp < defaultableAfter)
            revert GracePeriodNotExpired(defaultableAfter, block.timestamp);

        inv.status = InvoiceStatus.DEFAULTED;
        buyerTotalCount[inv.buyer]++;
        outstandingAdvance[inv.seller] -= inv.advance;
        // sellerPaidCount NOT incremented — score drops

        emit InvoiceDefaulted(id, inv.seller, inv.collateral, inv.stake);
        emit SellerScoreUpdated(inv.seller, sellerScore(inv.seller));
        emit BuyerScoreUpdated(inv.buyer, buyerScore(inv.buyer));

        // Layer 1: slash buyer collateral
        pool.slashCollateral(id);
        // Layer 2: slash seller stake (first-loss buffer before LP capital)
        if (inv.stake > 0) {
            pool.slashSellerStake(id);
        }
        // Layer 3: draw from insurance reserve to cover remaining LP shortfall
        pool.coverFromInsurance(id, inv.advance, inv.collateral, inv.stake);
    }

    // ─── Anyone: cancel timed-out invoices ────────────────────────────────────

    /// Cancel invoice if buyer did not approve within APPROVAL_TIMEOUT.
    function cancelApprovalTimeout(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_APPROVAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_APPROVAL);

        uint256 cancelableAt = inv.createdAt + APPROVAL_TIMEOUT;
        if (block.timestamp < cancelableAt)
            revert ApprovalTimeoutNotReached(cancelableAt, block.timestamp);

        if (sellerTotalCount[inv.seller] > 0) sellerTotalCount[inv.seller]--;
        inv.status = InvoiceStatus.CANCELLED;
        emit InvoiceCancelled(id);
    }

    /// Cancel invoice if buyer did not lock collateral within COLLATERAL_TIMEOUT.
    function cancelCollateralTimeout(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_COLLATERAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_COLLATERAL);

        uint256 cancelableAt = inv.approvedAt + COLLATERAL_TIMEOUT;
        if (block.timestamp < cancelableAt)
            revert CollateralTimeoutNotReached(cancelableAt, block.timestamp);

        if (sellerTotalCount[inv.seller] > 0) sellerTotalCount[inv.seller]--;
        inv.status = InvoiceStatus.CANCELLED;
        emit InvoiceCancelled(id);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function sellerScore(address seller) public view returns (uint256) {
        if (sellerTotalCount[seller] == 0) return 50;
        return (sellerPaidCount[seller] * 100) / sellerTotalCount[seller];
    }

    function buyerScore(address buyer) public view returns (uint256) {
        if (buyerTotalCount[buyer] == 0) return 50;
        return (buyerPaidCount[buyer] * 100) / buyerTotalCount[buyer];
    }

    /// Seller advance rate in bps. Tiers: 75/80/84/88%.
    /// Unproven sellers (no history) start in the conservative New tier, not Fair.
    function sellerAdvanceBps(address seller) public view returns (uint256) {
        if (sellerTotalCount[seller] == 0) return 7500; // New (unproven): 75%
        uint256 s = sellerScore(seller);
        if (s >= 86) return 8800; // Excellent: 88%
        if (s >= 71) return 8400; // Good:      84%
        if (s >= 41) return 8000; // Fair:      80%
        return 7500;              // New (penalty): 75%
    }

    /// Seller stake rate in bps. Inversely proportional to tier trust.
    function sellerStakeBps(address seller) public view returns (uint256) {
        if (sellerTotalCount[seller] == 0) return 1000; // New (unproven): 10%
        uint256 s = sellerScore(seller);
        if (s >= 86) return 500;  // Excellent: 5%
        if (s >= 71) return 600;  // Good:      6%
        if (s >= 41) return 800;  // Fair:      8%
        return 1000;              // New (penalty): 10%
    }

    /// Buyer collateral rate in bps.
    /// = max(buyer tier minimum, pool buffer needed to cover advance in full)
    function buyerCollateralBps(uint256 advanceBps, address buyer) public view returns (uint256) {
        uint256 score = buyerScore(buyer);
        uint256 tierBps;
        if (score >= 86) tierBps = 500;   // Excellent: 5%
        else if (score >= 71) tierBps = 1200; // Good:  12%
        else if (score >= 41) tierBps = 2000; // Fair:  20%
        else tierBps = 3000;               // New:      30%

        uint256 coverBps = 10_000 - advanceBps;
        return tierBps > coverBps ? tierBps : coverBps;
    }

    /// Preview the cost to pay off the REMAINING balance of a FUNDED invoice now.
    function earlyRepayAmount(uint256 id) external view returns (uint256 amountDue, uint256 discount) {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        return _discountOn(inv, inv.amount - inv.amountPaid);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// Apply the time-decayed early-payment discount to an arbitrary principal.
    function _discountOn(Invoice storage inv, uint256 principal)
        internal view returns (uint256 amountDue, uint256 discount)
    {
        if (principal == 0 || block.timestamp >= inv.dueDate) return (principal, 0);

        uint256 totalDuration = inv.dueDate - inv.createdAt;
        if (totalDuration == 0) return (principal, 0);

        uint256 timeLeft    = inv.dueDate - block.timestamp;
        uint256 discountBps = (timeLeft * MAX_DISCOUNT_BPS) / totalDuration;

        discount  = (principal * discountBps) / 10_000;
        amountDue = principal - discount;
    }
}

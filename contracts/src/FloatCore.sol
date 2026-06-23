// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./FloatPool.sol";

/// @title FloatCore v6a - Invoice lifecycle, seller stake, collateral, insurance, and fee settlement
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

    // v6b: who funds the advance. POOL = LPs (classic). BUYER = buyer self-finances
    // and earns the fee as a discount on their own payable (dynamic discounting).
    enum Financier { POOL, BUYER }

    struct Invoice {
        address seller;
        address buyer;
        uint256 amount;      // face value (USDC, 6 dec)
        uint256 advance;     // face advance amount paid upfront (liquidity, not cost)
        uint256 collateral;  // buyer security deposit
        uint256 stake;       // seller security deposit withheld from disbursement
        uint256 fee;         // v6: the only seller cost; split protocol/insurance/LP at settle
        uint256 dueDate;     // unix timestamp for payment
        uint256 createdAt;   // for timeout + early repayment calc
        uint256 approvedAt;  // when buyer approved (collateral timeout clock)
        uint256 amountPaid;  // cumulative face value paid (installments)
        InvoiceStatus status;
        Financier financier; // v6b: POOL (default) or BUYER (self-financed)
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant GRACE_PERIOD        = 7 days;
    uint256 public constant APPROVAL_TIMEOUT    = 72 hours;
    uint256 public constant COLLATERAL_TIMEOUT  = 48 hours;
    uint256 public constant MAX_DISCOUNT_BPS    = 200;   // legacy v4/v5, unused in v6a settlement
    uint256 public constant INSURANCE_FEE_BPS   = 100;   // (legacy v5, unused in v6 settle)
    uint256 public constant MAX_INVOICE_BPS     = 2000;  // single invoice advance max = 20% of available liquidity

    // v6 fee model: fee is the seller's only cost, split at settlement.
    uint256 public constant FEE_CAP_BPS         = 800;   // fee capped at 8% of face
    uint256 public constant PROTOCOL_FEE_BPS    = 1000;  // protocol takes 10% of the fee
    uint256 public constant INSURANCE_SHARE_BPS = 1500;  // 15% of the fee funds the insurance reserve
    // remainder (75%) of the fee accrues to LPs (mode 1)
    // v6b mode 2 (buyer-financed): buyer keeps 75% of the fee as a discount.
    // The remaining fee is protocol 10% + insurance 15%; no LP capital is at risk.
    uint256 public constant BUYER_DISCOUNT_BPS  = 7500;  // buyer keeps 75% of the fee in mode 2

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

    // ─── v5 Protocol safety (production hooks; OFF by default on testnet) ─────────
    // When strictCollateralEnabled is true, an UNVERIFIED buyer must post collateral
    // that, together with the seller stake, fully covers the advance. This drives the
    // default shortfall to zero (LPs cannot lose) and makes fake/collusion invoices
    // unprofitable (the attacker locks at least what they receive). Verified buyers
    // keep the normal, lighter tier collateral. Default false → testnet stays open.
    bool public strictCollateralEnabled;
    mapping(address => uint256) public outstandingBuyerAdvance; // buyer => sum of un-repaid advances
    uint256 public maxOutstandingPerBuyer;                      // 0 = unlimited

    // v6: protocol fee recipient
    address public treasury;

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroAmount();
    error InvalidDueDate();
    error AdvancePlusFeeExceedsFace(uint256 advance, uint256 fee, uint256 face);
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
    error BuyerExposureCapExceeded(uint256 attempted, uint256 cap);
    error Overpayment(uint256 attempted, uint256 remaining);
    error PartialNotAllowedInBuyerMode();

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
    event StrictCollateralSet(bool enabled);
    event MaxOutstandingPerBuyerSet(uint256 cap);
    event BuyerFinanced(uint256 indexed id, address indexed buyer, uint256 advanceFunded, uint256 buyerDiscount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _pool) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        pool = FloatPool(_pool);
        strictCollateralEnabled = true; // v5: safety ON by default
        treasury = msg.sender;          // v6: protocol fee recipient, owner-settable
    }

    // ─── Admin: anti-Sybil config (no-op on testnet defaults) ───────────────────

    /// v6: protocol fee recipient.
    function setTreasury(address t) external onlyOwner {
        treasury = t;
    }

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

    /// Toggle the v5 strict-collateral safety (full collateralization for unverified buyers).
    function setStrictCollateral(bool enabled) external onlyOwner {
        strictCollateralEnabled = enabled;
        emit StrictCollateralSet(enabled);
    }

    function setMaxOutstandingPerBuyer(uint256 cap) external onlyOwner {
        maxOutstandingPerBuyer = cap;
        emit MaxOutstandingPerBuyerSet(cap);
    }

    /// A buyer earns light, tier-based collateral only once verified. Unverified
    /// buyers must fully collateralize (see createInvoice) while strict mode is on.
    function isTrustedBuyer(address buyer) public view returns (bool) {
        return verified[buyer];
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
        uint256 collateralBps = buyerCollateralBps(buyer);
        uint256 stakeBps      = sellerStakeBps(msg.sender);

        // v5 safety: an unverified buyer must fully collateralize the advance
        // (collateral + stake >= advance) so a default leaves no LP shortfall and a
        // fake/collusion invoice is never profitable. Verified buyers keep light tier collateral.
        if (strictCollateralEnabled && !isTrustedBuyer(buyer)) {
            uint256 floorBps = advanceBps > stakeBps ? advanceBps - stakeBps : 0;
            if (collateralBps < floorBps) collateralBps = floorBps;
        }

        uint256 advance    = (amount * advanceBps)    / 10_000;
        uint256 collateral = (amount * collateralBps) / 10_000;
        uint256 stake      = (amount * stakeBps)      / 10_000;
        uint256 fee        = (amount * feeBpsForTerm(buyer, dueTimestamp - block.timestamp)) / 10_000;

        // v6 guard: advance + fee must leave a non-negative residual for the seller
        if (advance + fee > amount) revert AdvancePlusFeeExceedsFace(advance, fee, amount);

        // Pool liquidity is checked at lockCollateral for pool-financed invoices.
        // Buyer-financed invoices can be created even when LP liquidity is low because
        // the buyer funds the advance themselves in financeAsBuyer.

        id = invoiceCount++;
        invoices[id] = Invoice({
            seller:     msg.sender,
            buyer:      buyer,
            amount:     amount,
            advance:    advance,
            collateral: collateral,
            stake:      stake,
            fee:        fee,
            dueDate:    dueTimestamp,
            createdAt:  block.timestamp,
            approvedAt: 0,
            amountPaid: 0,
            status:     InvoiceStatus.PENDING_APPROVAL,
            financier:  Financier.POOL
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

        // Per-buyer outstanding exposure cap (0 = unlimited) — limits concentration
        // of advances funded against a single buyer across all sellers.
        uint256 newBuyerOutstanding = outstandingBuyerAdvance[inv.buyer] + inv.advance;
        if (maxOutstandingPerBuyer != 0 && newBuyerOutstanding > maxOutstandingPerBuyer)
            revert BuyerExposureCapExceeded(newBuyerOutstanding, maxOutstandingPerBuyer);
        outstandingBuyerAdvance[inv.buyer] = newBuyerOutstanding;

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

    // ─── Buyer: self-finance (v6b, dynamic discounting) ─────────────────────────

    /// Buyer funds the advance themselves and will earn the fee as a discount on their
    /// own payable. The buyer deposits the full advance (passed through to the seller),
    /// so the pool carries NO capital and NO risk. There is no separate collateral and
    /// no seller stake in this mode. The buyer must approve FloatCore for inv.advance.
    function financeAsBuyer(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.PENDING_COLLATERAL)
            revert WrongStatus(inv.status, InvoiceStatus.PENDING_COLLATERAL);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        // EFFECTS: buyer-financed mode has no pool collateral and no seller stake.
        inv.financier = Financier.BUYER;
        inv.collateral = 0;
        inv.stake = 0;
        inv.amountPaid = inv.advance; // the funded advance counts toward the face value
        inv.status = InvoiceStatus.FUNDED;

        uint256 buyerDiscount = (inv.fee * BUYER_DISCOUNT_BPS) / 10_000;
        emit BuyerFinanced(id, msg.sender, inv.advance, buyerDiscount);
        emit InvoiceFunded(id, inv.advance, 0);

        // INTERACTIONS: pull the advance from the buyer, pass the full advance to the seller.
        usdc.safeTransferFrom(msg.sender, address(pool), inv.advance);
        pool.advanceFunds(inv.seller, inv.advance);
    }

    // ─── Buyer: pay invoice ────────────────────────────────────────────────────

    /// Pay the full remaining balance of a funded invoice in one shot.
    /// v6a has no early repayment discount.
    /// On settlement: collateral returns to buyer, stake returns to seller, and fee shares settle.
    function payInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.FUNDED)
            revert WrongStatus(inv.status, InvoiceStatus.FUNDED);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

        uint256 remaining = inv.amount - inv.amountPaid;

        // v6b: a self-financing buyer keeps 75% of the fee as a discount, so they pay less.
        uint256 pull = remaining;
        uint256 buyerDiscount = 0;
        if (inv.financier == Financier.BUYER) {
            buyerDiscount = (inv.fee * BUYER_DISCOUNT_BPS) / 10_000;
            pull = remaining > buyerDiscount ? remaining - buyerDiscount : 0;
        }

        // EFFECTS
        inv.amountPaid = inv.amount; // fully covered

        // INTERACTIONS
        if (pull > 0) usdc.safeTransferFrom(msg.sender, address(pool), pull);
        _settle(id, buyerDiscount);
    }

    /// Pay an installment toward a funded invoice. Auto-settles when the cumulative
    /// amount reaches the face value.
    function payPartial(uint256 id, uint256 payAmount) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        if (inv.status != InvoiceStatus.FUNDED)
            revert WrongStatus(inv.status, InvoiceStatus.FUNDED);
        if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);
        if (payAmount == 0) revert ZeroAmount();
        // v6b: buyer-financed invoices settle in one shot (no installments).
        if (inv.financier == Financier.BUYER) revert PartialNotAllowedInBuyerMode();

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

    /// Finalize a fully-covered invoice (v6). Buyer has paid the full face into the pool.
    /// Return collateral + stake, split the fee (protocol + insurance + LP), and return the
    /// residual (face - advance - fee) to the seller. Seller's true cost is the fee only.
    function _settle(uint256 id, uint256 discount) internal {
        Invoice storage inv = invoices[id];

        uint256 fee          = inv.fee;
        uint256 protocolCut  = (fee * PROTOCOL_FEE_BPS)    / 10_000;
        uint256 insuranceCut = (fee * INSURANCE_SHARE_BPS) / 10_000;
        uint256 residual     = inv.amount - inv.advance - fee; // guard ensured >= 0 at creation

        inv.status = InvoiceStatus.PAID;
        sellerPaidCount[inv.seller]++;
        buyerPaidCount[inv.buyer]++;
        buyerTotalCount[inv.buyer]++;
        // Outstanding exposure is only tracked for pool-financed invoices.
        if (inv.financier == Financier.POOL) {
            outstandingAdvance[inv.seller] -= inv.advance;
            outstandingBuyerAdvance[inv.buyer] -= inv.advance;
        }

        emit InvoicePaid(id, inv.buyer, inv.amount, discount);
        emit CollateralReturned(id, inv.buyer, inv.collateral);
        emit SellerStakeReturned(id, inv.seller, inv.stake);
        emit SellerScoreUpdated(inv.seller, sellerScore(inv.seller));
        emit BuyerScoreUpdated(inv.buyer, buyerScore(inv.buyer));

        pool.releaseCollateral(id, inv.buyer);
        if (inv.stake > 0) {
            pool.releaseSellerStake(id, inv.seller);
        }
        // Insurance share (clamped to its 10% cap; excess stays as LP yield).
        if (insuranceCut > 0) {
            pool.fundInsurance(insuranceCut);
        }
        // Protocol cut leaves to the treasury.
        if (protocolCut > 0 && treasury != address(0)) {
            pool.payTo(treasury, protocolCut);
        }
        // Residual back to the seller. The LP share (fee - protocol - insurance) stays in the pool.
        if (residual > 0) {
            pool.payTo(inv.seller, residual);
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
        // sellerPaidCount NOT incremented — score drops

        emit InvoiceDefaulted(id, inv.seller, inv.collateral, inv.stake);
        emit SellerScoreUpdated(inv.seller, sellerScore(inv.seller));
        emit BuyerScoreUpdated(inv.buyer, buyerScore(inv.buyer));

        if (inv.financier == Financier.BUYER) {
            // Buyer-financed: the pool never funded this invoice (the buyer did and the
            // seller already received the advance). The buyer simply forfeits their funded
            // advance. No pool capital is at risk, so nothing to slash or cover.
            return;
        }

        // Pool-financed waterfall:
        outstandingAdvance[inv.seller] -= inv.advance;
        outstandingBuyerAdvance[inv.buyer] -= inv.advance;
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

    /// Raw repayment ratio 0-100 (display / back-compat). 50 for no history.
    function sellerScore(address seller) public view returns (uint256) {
        if (sellerTotalCount[seller] == 0) return 50;
        return (sellerPaidCount[seller] * 100) / sellerTotalCount[seller];
    }

    function buyerScore(address buyer) public view returns (uint256) {
        if (buyerTotalCount[buyer] == 0) return 50;
        return (buyerPaidCount[buyer] * 100) / buyerTotalCount[buyer];
    }

    /// v6 tier: 0=New, 1=Fair, 2=Good, 3=Excellent. Gated by BOTH a minimum number
    /// of paid invoices AND the repayment ratio, so a single 1/1 cannot reach Excellent.
    function _tier(uint256 paid, uint256 total) internal pure returns (uint256) {
        if (total == 0) return 0;
        uint256 ratio = (paid * 100) / total;
        if (paid >= 12 && ratio >= 95) return 3; // Excellent
        if (paid >= 5  && ratio >= 80) return 2; // Good
        if (paid >= 2  && ratio >= 60) return 1; // Fair
        return 0;                                 // New
    }

    function sellerTier(address seller) public view returns (uint256) {
        return _tier(sellerPaidCount[seller], sellerTotalCount[seller]);
    }

    function buyerTier(address buyer) public view returns (uint256) {
        return _tier(buyerPaidCount[buyer], buyerTotalCount[buyer]);
    }

    /// Seller advance (upfront liquidity, NOT cost). 80 / 85 / 88 / 90%.
    function sellerAdvanceBps(address seller) public view returns (uint256) {
        uint256 t = sellerTier(seller);
        if (t == 3) return 9000;
        if (t == 2) return 8800;
        if (t == 1) return 8500;
        return 8000;
    }

    /// Seller stake (skin in the game). 5 / 4 / 3 / 2%.
    function sellerStakeBps(address seller) public view returns (uint256) {
        uint256 t = sellerTier(seller);
        if (t == 3) return 200;
        if (t == 2) return 300;
        if (t == 1) return 400;
        return 500;
    }

    /// Buyer factoring fee per 30 days (the seller's only cost). 1.2 / 1.6 / 2.2 / 3.0%.
    function buyerFeeBpsPer30d(address buyer) public view returns (uint256) {
        uint256 t = buyerTier(buyer);
        if (t == 3) return 120;
        if (t == 2) return 160;
        if (t == 1) return 220;
        return 300;
    }

    /// Buyer light collateral (verified buyers). 25 / 18 / 12 / 8%.
    /// Unverified buyers are pushed to full collateral in createInvoice (v5 strict floor).
    function buyerCollateralBps(address buyer) public view returns (uint256) {
        uint256 t = buyerTier(buyer);
        if (t == 3) return 800;
        if (t == 2) return 1200;
        if (t == 1) return 1800;
        return 2500;
    }

    /// Fee in bps for a given term, capped. = feePer30d * ceil(term/30d), max FEE_CAP_BPS.
    function feeBpsForTerm(address buyer, uint256 termSeconds) public view returns (uint256) {
        uint256 periods = (termSeconds + 30 days - 1) / 30 days;
        if (periods == 0) periods = 1;
        uint256 bps = buyerFeeBpsPer30d(buyer) * periods;
        return bps > FEE_CAP_BPS ? FEE_CAP_BPS : bps;
    }

    /// Preview the cost to settle a FUNDED invoice now.
    /// Pool-financed invoices pay the full remaining face. Buyer-financed invoices
    /// pay the remaining face minus the buyer's v6b fee discount.
    function earlyRepayAmount(uint256 id) external view returns (uint256 amountDue, uint256 discount) {
        Invoice storage inv = invoices[id];
        if (inv.seller == address(0)) revert InvoiceNotFound(id);
        uint256 remaining = inv.amount - inv.amountPaid;
        if (inv.financier == Financier.BUYER) {
            discount = (inv.fee * BUYER_DISCOUNT_BPS) / 10_000;
            amountDue = remaining > discount ? remaining - discount : 0;
            return (amountDue, discount);
        }
        return (remaining, 0);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }
}

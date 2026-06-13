# Float Upgrade Plan — v2

## Overview

Three features approved for implementation before deadline Jul 13 2026:

1. **Buyer Collateral System** — protocol-level protection against pool drain attacks
2. **Early Repayment Discount** — incentive for buyers to pay before due date
3. **Multi-sig Buyer Approval** — fraud prevention, buyer must confirm invoice exists

---

## Feature 1: Buyer Collateral System

### Problem
Current design has a critical vulnerability:
- One person controls both seller and buyer wallets
- Creates a fake invoice, receives advance (75-88% of invoice)
- Never pays as buyer → pool absorbs the loss
- Repeatable until pool is drained

### Solution Design

Buyers have their own on-chain credit score (0-100, starts at 50).
When an invoice is created, the buyer must lock collateral before the pool advances the seller.
Collateral is returned on payment, forfeited on default.

#### Buyer Credit Score
```
buyerScore[address] = 50                          // new buyer
buyerScore[address] = paidCount * 100 / totalCount // after first invoice
```

Score updates atomically on `payInvoice()` and `markDefault()`.

#### Collateral Rate Formula
```
tierRate(buyer):
  score 0-40   → 30%
  score 41-70  → 20%
  score 71-85  → 12%
  score 86-100 → 5%

requiredCollateral = max(tierRate, 100% - advanceRate)
```

**Why max():** guarantees pool never loses money even on full default.

Example: New seller (advance 75%) + New buyer
- tierRate = 30%
- 100% - 75% = 25%
- requiredCollateral = max(30%, 25%) = **30%**
- Pool advances $75, buyer locks $30
- If default: pool loses $75 but recovers $30 collateral → net loss $45
  → Still some loss, but dramatically reduces drain attack surface

For attack to be profitable, attacker must control TWO wallets AND pre-fund the buyer wallet with collateral.

#### Collateral Table (New Seller 75% advance)
| Buyer Tier  | Lock    | Pool max loss | Old pool max loss |
|-------------|---------|---------------|-------------------|
| New         | 30%     | $45           | $75               |
| Fair        | 20%     | $55           | $75               |
| Good        | 12%     | $25% buffer   | $75               |
| Excellent   | 5%      | $25% - 5% covered | $75           |

#### Invoice Status Machine (updated)
```
PENDING_COLLATERAL → FUNDED → PAID
                           → DEFAULTED
```

Old: `createInvoice()` → immediately FUNDED
New: `createInvoice()` → PENDING_COLLATERAL → `lockCollateral()` → FUNDED

#### New Functions in FloatCore
```solidity
// Seller creates invoice, status = PENDING_COLLATERAL
function createInvoice(address buyer, uint256 amount, uint256 dueDate) external

// Buyer locks collateral, triggers pool advance to seller
function lockCollateral(uint256 invoiceId) external

// Returns required collateral amount for an invoice
function requiredCollateral(uint256 invoiceId) external view returns (uint256)

// Returns buyer's current credit score
function buyerScore(address buyer) external view returns (uint256)
```

#### New Storage in FloatCore
```solidity
mapping(address => uint256) public buyerPaidCount;
mapping(address => uint256) public buyerTotalCount;
mapping(uint256 => uint256) public invoiceCollateral; // locked amount per invoice

enum InvoiceStatus { PENDING_COLLATERAL, FUNDED, PAID, DEFAULTED }
```

#### New Functions in FloatPool
```solidity
// Called by FloatCore to receive buyer collateral
function receiveCollateral(uint256 invoiceId, address buyer, uint256 amount) external onlyFloatCore

// Called by FloatCore to return collateral on payment
function returnCollateral(uint256 invoiceId, address buyer) external onlyFloatCore

// Collateral is kept on default (already in pool, no action needed)
```

#### Collateral timeout
If buyer does not lock collateral within 48 hours, anyone can call `cancelInvoice(id)` to revert the invoice. This prevents sellers from griefing buyers with phantom invoices.

```solidity
function cancelInvoice(uint256 invoiceId) external {
    require(invoice.status == PENDING_COLLATERAL);
    require(block.timestamp > invoice.createdAt + 48 hours);
    invoice.status = CANCELLED;
}
```

#### Frontend Changes

**Seller dashboard:**
- Invoices in `PENDING_COLLATERAL` show a warning badge: "Awaiting buyer collateral"
- Advance amount shown only after buyer locks

**Buyer dashboard:**
- New section: "Invoices requiring your collateral"
- Shows required lock amount and deadline (48h)
- Two-step flow: Approve USDC → Lock Collateral → Invoice funded
- Collateral visible as "locked" in their position summary

---

## Feature 2: Early Repayment Discount

### Design

Buyer can pay before due date and receive a discount proportional to how early they pay.

```
discountRate = 2% (max)
daysEarly = dueDate - block.timestamp (in days)
totalDays = dueDate - createdAt (in days)

discount = (daysEarly / totalDays) * discountRate * amount
amountDue = amount - discount
```

**Pool math check (new seller, $100 invoice):**
- Pool advanced: $75
- Buyer pays early at 50% of term remaining: discount = 50% * 2% * $100 = $1
- Pool receives: $99
- Pool profit: $99 - $75 = $24 (vs $25 on full term)
- Acceptable: pool still earns spread, just slightly less

**Why buyers benefit:**
- Pay $99 instead of $100 = save $1 on $100
- Collateral returned earlier → can use for other invoices
- Buyer credit score update happens immediately

**New function in FloatCore:**
```solidity
function earlyRepayAmount(uint256 invoiceId) external view returns (uint256 amountDue, uint256 discount)

function payInvoice(uint256 invoiceId) external // uses current timestamp to auto-calculate discount
```

**Frontend:**
- Buyer dashboard shows "Pay now and save $X" if > 7 days before due date
- Real-time discount counter as days pass

---

## Feature 3: Multi-sig Buyer Approval

### Problem
Seller can create invoice against any buyer address (real or fake), claim advance, and blame buyer for "not paying." Buyer never knew the invoice existed.

### Solution: Two-phase invoice creation

**Phase 1 — Seller creates draft:**
`createInvoice(buyer, amount, dueDate)` → status = `PENDING_APPROVAL`

**Phase 2 — Buyer approves on-chain:**
`approveInvoice(invoiceId)` → status = `PENDING_COLLATERAL`

Only after buyer approves does the collateral step begin.

If buyer does not approve within 72 hours → anyone can cancel.

**Combined status machine:**
```
PENDING_APPROVAL (72h) → PENDING_COLLATERAL (48h) → FUNDED → PAID
                                                           → DEFAULTED
                      → CANCELLED (timeout or buyer rejects)
```

**New functions:**
```solidity
// Buyer explicitly accepts the invoice
function approveInvoice(uint256 invoiceId) external {
    require(msg.sender == invoice.buyer);
    require(invoice.status == PENDING_APPROVAL);
    invoice.status = PENDING_COLLATERAL;
}

// Buyer explicitly rejects
function rejectInvoice(uint256 invoiceId) external {
    require(msg.sender == invoice.buyer);
    invoice.status = CANCELLED;
}
```

**Frontend:**
- Buyer dashboard: new "Pending your approval" section (highest priority)
- Shows: seller address, invoice amount, due date, required collateral
- Approve / Reject buttons
- After approval → collateral lock flow begins

---

## Implementation Order

### Phase A — Contracts (do first, everything else depends on this)

1. Update `FloatCore.sol`:
   - Add buyer score mappings
   - Add `InvoiceStatus` enum with new states
   - Implement `createInvoice()` → PENDING_APPROVAL
   - Implement `approveInvoice()`, `rejectInvoice()`
   - Implement `lockCollateral()` → triggers advance
   - Implement `requiredCollateral()` view
   - Implement `payInvoice()` with early repayment discount logic
   - Implement `cancelInvoice()` for timeout cases
   - Update `markDefault()` to update buyer score

2. Update `FloatPool.sol`:
   - Add `receiveCollateral()` — onlyFloatCore
   - Add `returnCollateral()` — onlyFloatCore
   - Track locked collateral separately from free liquidity

3. Redeploy both contracts on Arc Testnet
4. Update `src/lib/contracts.ts` with new addresses and ABI

### Phase B — Frontend

5. Update `src/hooks/use-my-invoices.ts`:
   - Handle new status values (PENDING_APPROVAL, PENDING_COLLATERAL)
   - Add `buyerScore` read

6. Update `src/app/app/buyer/page.tsx`:
   - "Pending Approval" section with approve/reject actions
   - "Pending Collateral" section with lock flow
   - Early repayment: show discount amount if paying before due date
   - Show locked collateral in position summary

7. Update `src/app/app/seller/page.tsx`:
   - Invoice list shows PENDING_APPROVAL and PENDING_COLLATERAL statuses
   - Warning badge on invoices awaiting buyer action

8. Update `src/components/dashboard/InvoiceTable.tsx`:
   - New status badges: PENDING_APPROVAL (orange), PENDING_COLLATERAL (yellow)
   - Show collateral amount column

### Phase C — Deploy & Update Docs

9. `vercel --prod --yes` + alias to `float-arc.vercel.app`
10. Update `/docs` page with new mechanics

---

## ABI Changes Summary

### FloatCore new events
```solidity
event InvoiceApproved(uint256 indexed id, address buyer);
event InvoiceRejected(uint256 indexed id, address buyer);
event CollateralLocked(uint256 indexed id, address buyer, uint256 amount);
event CollateralReturned(uint256 indexed id, address buyer, uint256 amount);
event EarlyRepayment(uint256 indexed id, uint256 discount, uint256 amountPaid);
```

### Invoice struct (updated)
```solidity
struct Invoice {
    address seller;
    address buyer;
    uint256 amount;
    uint256 advance;
    uint256 dueDate;
    uint256 createdAt;     // new: for timeout calculation
    uint256 collateral;    // new: locked buyer collateral
    InvoiceStatus status;  // updated enum
}
```

---

## Risk Notes

- Collateral does NOT fully eliminate pool risk — reduces it significantly
- Drain attack cost increases: attacker must pre-fund buyer wallet
- Multi-sig approval eliminates phantom invoice fraud
- Early repayment slightly reduces yield but improves pool liquidity

Recommended audit before mainnet: reentrancy on `lockCollateral()`, approval timeout edge cases.

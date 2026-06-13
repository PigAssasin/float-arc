# Float — Implementation Plan

> **Deadline:** Mon Jul 13 2026 · **Remaining:** ~32 days (as of Jun 11 2026)
> **Current state:** UI/UX complete, all mock data, zero real contract calls
> **Source of truth for Arc:** https://docs.arc.io/ (read Jun 11 2026)

---

## Schedule

```
Phase 1 — Smart Contracts        4 days    Jun 12–15
Phase 2 — Contract Deployment    1 day     Jun 16
Phase 3 — Frontend Wiring        4 days    Jun 17–20
Phase 4 — Circle Tools           2 days    Jun 21–22
Phase 5 — Integration Testing    2 days    Jun 23–24
Phase 6 — Submission Prep        4 days    Jun 25–28
Buffer                           14 days   Jun 29–Jul 13
```

---

## Arc Testnet — Verified Facts (from docs.arc.io)

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042002` |
| EVM Hard Fork | **Osaka** (+ EIP-7708 from Amsterdam) |
| Gas token | USDC (18 dec internal / 6 dec ERC-20) |
| Block time | ~0.48s |
| Finality | Deterministic < 1s (1 confirmation = final) |
| maxFeePerGas floor | **20 Gwei minimum** (transactions below this pending forever) |
| maxPriorityFeePerGas | 0 Gwei (or 1 Gwei during high load) |
| PREVRANDAO | Always returns `0` — cannot use for randomness |
| Block timestamp | Second-level granularity; multiple blocks may share same timestamp |
| SELFDESTRUCT | Restricted at deploy (cannot burn native USDC) |
| RPC primary | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| USDC address | `0x3600000000000000000000000000000000000000` |
| EURC address | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| FxEscrow | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

> ⚠️ Arc mainnet addresses: **not yet available** as of Jun 2026

---

## Phase 1 — Smart Contracts

### 1.1 Architecture

Two separate contracts:

```
FloatPool.sol    — Investor liquidity: deposit / withdraw / share accounting
FloatCore.sol    — Invoice lifecycle + credit score + advance disbursement
                   FloatCore is the only authorized caller of pool funds
```

File locations: `contracts/FloatPool.sol`, `contracts/FloatCore.sol`

### 1.2 FloatPool.sol — Spec

```solidity
pragma solidity ^0.8.20;
// Imports: IERC20, ReentrancyGuard, Ownable (OpenZeppelin)

State:
  IERC20 public usdc;               // 0x3600...0000
  address public authorizedCore;    // set after FloatCore deploy
  uint256 public totalShares;
  uint256 public totalDeposited;    // principal
  uint256 public totalFeeAccrued;   // fee income from invoices

  mapping(address => uint256) public shares;

Functions:
  deposit(uint256 amount)            external nonReentrant
  withdraw(uint256 shareAmount)      external nonReentrant
  advanceFunds(address to, uint256)  external onlyCore nonReentrant
  repayFunds(uint256 amount)         external onlyCore nonReentrant
  totalAssets() → uint256            public view
  shareValue()  → uint256            public view   // totalAssets / totalShares scaled
  availableLiquidity() → uint256     public view   // totalAssets - outstanding advances

Events:
  Deposited(address investor, uint256 amount, uint256 shares)
  Withdrawn(address investor, uint256 shares, uint256 usdcReturned)
```

**Share accounting logic:**

```solidity
function deposit(uint256 amount) external nonReentrant {
    uint256 newShares = totalShares == 0
        ? amount                                    // first deposit: 1 share = 1 USDC
        : (amount * totalShares) / totalAssets();   // subsequent: proportional
    totalShares += newShares;
    shares[msg.sender] += newShares;
    // transfer USDC in, then update state
}

function withdraw(uint256 shareAmount) external nonReentrant {
    uint256 usdcOut = (shareAmount * totalAssets()) / totalShares;
    require(usdcOut <= availableLiquidity(), InsufficientLiquidity(...));
    totalShares -= shareAmount;
    shares[msg.sender] -= shareAmount;
    // transfer USDC out
}

function totalAssets() public view returns (uint256) {
    return usdc.balanceOf(address(this));
}
```

### 1.3 FloatCore.sol — Spec

```solidity
pragma solidity ^0.8.20;
// Imports: IERC20, ReentrancyGuard, Ownable, IFloatPool

State:
  struct Invoice {
    address seller;
    address buyer;
    uint256 amount;       // face value (6 dec USDC)
    uint256 advance;      // disbursed to seller
    uint256 dueDate;      // unix timestamp
    InvoiceStatus status; // FUNDED | PAID | DEFAULTED
  }

  uint256 public constant GRACE_PERIOD = 7 days;
  uint256 public invoiceCount;

  mapping(uint256 => Invoice)           public invoices;
  mapping(address => uint256)           public paidCount;
  mapping(address => uint256)           public totalCount;

Functions:
  createInvoice(address buyer, uint256 amount, uint256 dueTimestamp)
  payInvoice(uint256 id)
  markDefault(uint256 id)
  creditScore(address seller)   → uint256
  advanceRateBps(address seller) → uint256   // basis points: 9000 = 90%
  getInvoice(uint256 id)        → Invoice

Events:
  InvoiceCreated(uint256 indexed id, address seller, address buyer,
                 uint256 amount, uint256 advance, uint256 dueDate)
  InvoicePaid(uint256 indexed id, address buyer, uint256 amount)
  InvoiceDefaulted(uint256 indexed id, address seller)
  CreditScoreUpdated(address indexed seller, uint256 newScore)
```

**Credit score & advance rate:**

```solidity
function creditScore(address seller) public view returns (uint256) {
    if (totalCount[seller] == 0) return 50;
    return (paidCount[seller] * 100) / totalCount[seller];
}

function advanceRateBps(address seller) public view returns (uint256) {
    uint256 s = creditScore(seller);
    if (s >= 86) return 9500;  // Excellent: 95%
    if (s >= 71) return 9000;  // Good:      90%
    if (s >= 41) return 8500;  // Fair:      85%
    return 8000;               // New:       80%
}
```

**createInvoice flow (Checks → Effects → Interactions):**

```solidity
function createInvoice(address buyer, uint256 amount, uint256 dueTimestamp)
    external nonReentrant
{
    // CHECKS
    if (amount == 0) revert ZeroAmount();
    if (dueTimestamp <= block.timestamp) revert InvalidDueDate();

    uint256 rate    = advanceRateBps(msg.sender);
    uint256 advance = (amount * rate) / 10000;
    if (pool.availableLiquidity() < advance) revert InsufficientPoolLiquidity(...);

    // EFFECTS
    uint256 id = invoiceCount++;
    invoices[id] = Invoice(msg.sender, buyer, amount, advance, dueTimestamp, FUNDED);
    totalCount[msg.sender]++;
    emit InvoiceCreated(id, msg.sender, buyer, amount, advance, dueTimestamp);

    // INTERACTIONS
    pool.advanceFunds(msg.sender, advance);  // pool → seller
}
```

**payInvoice flow:**

```solidity
function payInvoice(uint256 id) external nonReentrant {
    Invoice storage inv = invoices[id];

    // CHECKS
    if (inv.status != FUNDED) revert InvoiceAlreadySettled(id);
    if (msg.sender != inv.buyer) revert NotBuyer(msg.sender, inv.buyer);

    // EFFECTS
    inv.status = PAID;
    paidCount[inv.seller]++;
    emit InvoicePaid(id, msg.sender, inv.amount);
    emit CreditScoreUpdated(inv.seller, creditScore(inv.seller));

    // INTERACTIONS — buyer pays full amount to pool
    bool ok = usdc.transferFrom(msg.sender, address(pool), inv.amount);
    if (!ok) revert USDCTransferFailed();
    pool.repayFunds(inv.amount);
}
```

**markDefault:**

```solidity
function markDefault(uint256 id) external {
    Invoice storage inv = invoices[id];
    if (inv.status != FUNDED) revert InvoiceAlreadySettled(id);
    // ⚠️ use >= not == because multiple blocks share the same timestamp on Arc
    if (block.timestamp < inv.dueDate + GRACE_PERIOD) {
        revert GracePeriodNotExpired(inv.dueDate + GRACE_PERIOD, block.timestamp);
    }
    inv.status = DEFAULTED;
    emit InvoiceDefaulted(id, inv.seller);
    emit CreditScoreUpdated(inv.seller, creditScore(inv.seller));
    // note: paidCount NOT incremented → score drops on next invoice
}
```

### 1.4 Custom Errors

```solidity
error InsufficientPoolLiquidity(uint256 requested, uint256 available);
error InvoiceAlreadySettled(uint256 invoiceId);
error NotBuyer(address caller, address expected);
error GracePeriodNotExpired(uint256 defaultableAfter, uint256 now);
error InvalidDueDate();
error ZeroAmount();
error USDCTransferFailed();
error Unauthorized();
```

### 1.5 Security Checklist

- [ ] `ReentrancyGuard` on every state-changing function in both contracts
- [ ] CEI pattern: all state updates before USDC transfers
- [ ] USDC `transfer`/`transferFrom` return value checked (or use SafeERC20)
- [ ] `advanceFunds` callable only by `authorizedCore` — not public
- [ ] No `PREVRANDAO` usage (always 0 on Arc)
- [ ] `block.timestamp` for due date uses `>=` not `==`
- [ ] No `uint256.max` approvals in UI — exact amounts only
- [ ] No SELFDESTRUCT in any contract

### 1.6 Back-test: Key Math

**Test A — Decimal overflow:**
```
Input:    $10,000 → amount = 10_000 * 1e6 = 10_000_000_000 (uint256)
Rate:     9000 bps (90%)
advance = 10_000_000_000 * 9000 / 10000 = 9_000_000_000 = $9,000 USDC ✓
Max safe: uint256 max >> 10^10 → no overflow ✓
```

**Test B — First deposit (totalShares = 0):**
```
totalShares = 0, totalAssets = 0
deposit(1000 USDC) → shares = 1000 (1:1 ratio, skip division) ✓
No division by zero ✓
```

**Test C — Share dilution after fee accrual:**
```
Start:   investor A deposits $1000 → 1000 shares, pool = $1000
Invoice: $1000 invoice, 90% advance → pool sends $900 to seller
Repay:   buyer pays $1000 → pool receives $1000, net gain $100
Pool now: $1100 (original $1000 + $100 fee)
New investor deposits $1000:
  newShares = 1000 * 1000 / 1100 = 909 shares (correctly diluted) ✓
```

**Test D — Withdraw with outstanding advances:**
```
Pool = $500K, outstanding advances = $480K
availableLiquidity = $20K
Investor tries to withdraw $50K:
  → revert InsufficientPoolLiquidity(50000e6, 20000e6) ✓
```

**Test E — Credit score boundary:**
```
Seller: 0 invoices → score = 50, rate = 8500 bps (85%) ✓
Seller: 21 paid / 24 total → score = 87 → rate = 9500 bps (95%) ✓
Seller: 1 default / 1 total → score = 0 → rate = 8000 bps (80%) ✓
```

### 1.7 Hardhat Test Cases

| ID | Scenario | Expected result |
|----|----------|-----------------|
| T-01 | First deposit 1000 USDC | 1000 shares minted, 1:1 |
| T-02 | Deposit when pool has fee accrued | shares < amount (diluted) |
| T-03 | createInvoice $10K, score=78 (Good) | advance=$9K sent to seller |
| T-04 | payInvoice before due date | PAID, pool+$1K fee, score up |
| T-05 | payInvoice with wrong buyer address | revert NotBuyer |
| T-06 | payInvoice on already-paid invoice | revert InvoiceAlreadySettled |
| T-07 | markDefault before grace period | revert GracePeriodNotExpired |
| T-08 | markDefault after due date + 7 days | DEFAULTED, event emitted |
| T-09 | createInvoice when pool insufficient | revert InsufficientPoolLiquidity |
| T-10 | withdraw more than availableLiquidity | revert InsufficientPoolLiquidity |
| T-11 | advanceFunds called by non-core | revert Unauthorized |
| T-12 | Score 0/0 invoices → default 50 | advance = 8500 bps (85%) |
| T-13 | Score jumps over tier boundary | advanceRate updates correctly |
| T-14 | Deposit → createInvoice → pay → withdraw with yield | withdrawAmount > depositAmount |

### CHECKPOINT 1
> ✅ All 14 Hardhat tests green before proceeding to Phase 2.

---

## Phase 2 — Contract Deployment

### 2.1 Hardhat config for Arc Testnet

```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.20",
  networks: {
    arc_testnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      gasPrice: "auto",       // Arc uses EIP-1559 EWMA model
    }
  }
};
```

> ⚠️ No official Hardhat guide in Arc docs — use standard EVM config with Chain ID 5042002.
> Circle's official deploy tutorial only covers their Smart Contract Platform SDK (template contracts).
> Custom contracts via Hardhat work fine since Arc is full EVM.

### 2.2 Deploy sequence

```bash
# 1. Get testnet USDC
open https://faucet.circle.com

# 2. Deploy FloatPool
npx hardhat run scripts/deploy-pool.js --network arc_testnet

# 3. Deploy FloatCore(poolAddress)
npx hardhat run scripts/deploy-core.js --network arc_testnet

# 4. Link: FloatPool.setAuthorizedCore(coreAddress)
npx hardhat run scripts/setup.js --network arc_testnet

# 5. Verify on ArcScan
open https://testnet.arcscan.app/address/<CONTRACT_ADDRESS>
```

### 2.3 Store addresses

```typescript
// src/lib/contracts.ts
export const CONTRACTS = {
  FLOAT_POOL: "0x...",   // fill after deploy
  FLOAT_CORE: "0x...",   // fill after deploy
  USDC:       "0x3600000000000000000000000000000000000000",
} as const;

export const USDC_DECIMALS = 6;
```

### CHECKPOINT 2
> ✅ One real `deposit()` tx confirmed on testnet.arcscan.app before Phase 3.

---

## Phase 3 — Frontend Wiring

### 3.1 Fix wagmi gas config first (before any tx)

```typescript
// src/lib/wagmi-config.ts — add gas overrides
export const arcTestnet = defineChain({
  id: 5042002,
  // ...existing config...
  fees: {
    // Arc requires minimum 20 Gwei — transactions below this stay pending forever
    defaultPriorityFee: parseGwei("1"),
  },
});
```

### 3.2 Replace mock data with contract reads

```typescript
// Pattern: replace MOCK_* constants with useReadContract hooks

// Credit score
const { data: score } = useReadContract({
  address: CONTRACTS.FLOAT_CORE,
  abi: FloatCoreABI,
  functionName: "creditScore",
  args: [address],
});

// Pool stats
const { data: tvl } = useReadContract({
  address: CONTRACTS.FLOAT_POOL,
  abi: FloatPoolABI,
  functionName: "totalAssets",
});

// Invoice list — use events, not storage scan
// Listen to InvoiceCreated events filtered by seller address
```

### 3.3 Seller — createInvoice (2-step flow)

**Step 1: Approve USDC**
```
Not needed for seller — pool sends advance TO seller.
Seller does NOT need to pre-approve anything to create invoice.
```

**Step 2: createInvoice**
```typescript
const { writeContract, isPending, isSuccess, error } = useWriteContract();

writeContract({
  address: CONTRACTS.FLOAT_CORE,
  abi: FloatCoreABI,
  functionName: "createInvoice",
  args: [
    buyerAddress,
    parseUnits(amount, 6),      // ⚠️ always parseUnits(x, 6) for USDC
    BigInt(dueDateTimestamp),
  ],
});
```

**After success:** `useQueryClient().invalidateQueries()` to refresh pool stats + invoice list.

### 3.4 Buyer — payInvoice (2-step flow)

Buyer pays 100% of invoice → MUST approve USDC to FloatCore first.

```
Step 1: Approve USDC
  usdc.approve(CONTRACTS.FLOAT_CORE, invoiceAmount)

Step 2: Pay invoice
  floatCore.payInvoice(invoiceId)
```

UI flow:
- Check `usdc.allowance(buyer, FLOAT_CORE)` on load
- If allowance < invoiceAmount → show "Step 1: Approve USDC" button (disabled Pay button)
- After approve tx confirmed → enable "Step 2: Pay Invoice" button
- After pay tx confirmed → mark invoice as paid in UI

**Error #1:** User skips approve → tx reverts with ERC20 insufficient allowance
→ Decode with `viem.decodeErrorResult`, show "Please approve USDC first"

**Error #2:** Amount mismatch — UI shows $12,000, user approved $12,000.00 but amount in contract is $12,000.50
→ Always read exact amount from `getInvoice(id).amount` before approve

### 3.5 Investor — deposit / withdraw

```typescript
// Deposit: approve USDC → call pool.deposit(amount)
// Withdraw: no approve needed → call pool.withdraw(shareAmount)

// Read share balance:
const { data: myShares } = useReadContract({
  functionName: "shares",
  args: [address],
});

// Read share value:
const { data: shareVal } = useReadContract({
  functionName: "shareValue",
});
```

### 3.6 Arc finality = 1 confirmation

```typescript
// Do NOT wait for multiple confirmations — 1 block = final on Arc
// wagmi default is 1 confirmation, which is correct
// DO NOT set confirmations: 2+ — this wastes 0.48s per extra confirmation
```

### 3.7 tx pending state in UI

Arc finalizes in <1s. UX pattern:
- Submit tx → show spinner "Confirming…"
- After 1 confirmation (~0.5s) → show success
- Do NOT show "pending" for more than 2 seconds

### CHECKPOINT 3
> ✅ Full Seller → Buyer flow works on Arc Testnet with real USDC.
> Pool balance increases after Buyer pays. Credit score updates on-chain.

---

## Phase 4 — Circle Tools Integration

### 4.1 Circle Wallets (required for submission)

Circle Wallets = developer-controlled wallets via API. Requires:
1. Sign up at https://console.circle.com
2. Create API Key + Entity Secret
3. Add to `.env.local` (NEVER commit):
   ```
   CIRCLE_API_KEY=...
   CIRCLE_ENTITY_SECRET=...
   ```

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets
```

```typescript
// src/lib/circle-adapter.ts
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

export const circleAdapter = createCircleWalletsAdapter({
  apiKey: process.env.NEXT_PUBLIC_CIRCLE_APP_ID!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!, // server-side only
});
```

> ⚠️ `CIRCLE_ENTITY_SECRET` must NEVER be in client bundle.
> If using Circle Wallets in frontend, proxy through an API route.

ConnectWalletButton will offer 2 options:
- MetaMask / injected (existing, keeps working)
- Circle Wallet (new option, embedded, no extension needed)

### 4.2 Circle App Kit — Send (P2P transfers)

For the buyer pay flow, can optionally use App Kit instead of raw wagmi:

```typescript
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";

const kit = new AppKit();
const result = await kit.send({
  from: { adapter, chain: "Arc_Testnet" },
  to: CONTRACTS.FLOAT_CORE,
  amount: invoiceAmountString,
  token: "USDC",
});
```

### 4.3 Circle Gateway (treasury routing)

GatewayWallet (`0x0077777...`) and GatewayMinter (`0x0022222...`) are already deployed on Arc Testnet.

For Float: Pool fee collection can route through GatewayWallet for institutional treasury management. Adds credibility to the submission without requiring complex integration.

### CHECKPOINT 4
> ✅ Demo connection flow using Circle Wallet (no MetaMask).
> At least one transaction signed via Circle Wallet visible on arcscan.app.

---

## Phase 5 — Integration Testing

Full end-to-end journeys on Arc Testnet with real USDC:

| Journey | Steps | Pass condition |
|---------|-------|----------------|
| **Investor → Pool** | Connect → Deposit $100 USDC → Check shares | TX on arcscan, balance changes |
| **Seller → Invoice** | Connect → Create $500 invoice → Receive $450 (90%) | Advance in wallet, invoice FUNDED |
| **Buyer → Pay** | Connect → Approve → Pay $500 → Invoice PAID | Pool +$500, seller score up |
| **Investor → Withdraw** | Withdraw all shares → Receive > $100 (yield) | shareValue > 1 |
| **Default path** | Create invoice → skip payment → 7d → markDefault | Score drops, DEFAULTED status |
| **Score tier change** | Multiple paid invoices → score crosses 71 | advanceRate changes 85% → 90% |
| **Insufficient pool** | Try createInvoice > availableLiquidity | revert + UI error message shown |
| **Wrong buyer** | Different wallet calls payInvoice | revert + UI error message shown |

### Known errors to handle in UI

| Error | Source | UI message |
|-------|--------|------------|
| `InsufficientPoolLiquidity` | Low pool funds | "Pool is currently low on liquidity. Try a smaller invoice or check back later." |
| `NotBuyer` | Wrong wallet | "This invoice is not assigned to your wallet." |
| `InvoiceAlreadySettled` | Double pay | "This invoice has already been paid." |
| `GracePeriodNotExpired` | Too early to default | "Invoice can be marked as default after [date]." |
| `USDCTransferFailed` | Circle address block | "USDC transfer failed. Your address may be restricted by Circle." |
| ERC20 insufficient allowance | Forgot approve | "Please approve USDC first (Step 1 of 2)." |
| RPC timeout | Arc node lag | Auto-retry with `rpc.blockdaemon.testnet.arc.network` |

### CHECKPOINT 5
> ✅ All 8 journeys pass on Arc Testnet with real wallets.
> Zero unhandled errors in browser console during normal flows.

---

## Phase 6 — Submission Prep

Required per `docs/hackathon-requirements.md`:

### 6.1 Architecture Diagram

Show data flow:
```
User Wallet (MetaMask / Circle Wallet)
    ↓
Next.js Frontend (Arc Testnet)
    ↓
FloatCore.sol ←→ FloatPool.sol
    ↓
USDC (0x3600...0000)
    ↓
Circle Gateway (treasury routing)
```

### 6.2 Video Demo (3–5 min)

Script:
1. Landing page overview (30s)
2. Investor deposits USDC into pool (45s)
3. Seller creates invoice, receives advance instantly (60s)
4. Buyer sees invoice, approves and pays (60s)
5. Investor withdraws with yield earned (30s)
6. Credit score tier upgrade demo (30s)

### 6.3 Circle Product Feedback (required section)

Must cover:
- Why we chose USDC / Circle Wallets / Circle Gateway
- What worked well
- What could be improved
- Recommendations for developer experience

### 6.4 Vercel deployment

```bash
npm install -g vercel
vercel --prod

# Required env vars in Vercel dashboard:
# NEXT_PUBLIC_CIRCLE_APP_ID
# NEXT_PUBLIC_FLOAT_CORE_ADDRESS
# NEXT_PUBLIC_FLOAT_POOL_ADDRESS
```

### 6.5 GitHub repo checklist

- [ ] README with setup instructions
- [ ] `.env.example` (no real secrets)
- [ ] Contract addresses in `src/lib/contracts.ts`
- [ ] ABI files in `src/lib/abi/`
- [ ] Architecture diagram in `/docs`
- [ ] No `.env` or private keys committed

### 6.6 Submission at app.ignyte.ae

URL: https://app.ignyte.ae/public/challenges/4B436318-C737-F111-9A49-6045BD14D400

Fields to fill:
- [ ] Title: "Float — Invoice Factoring on Arc"
- [ ] Short description
- [ ] Track: Track 2 — SME Trade Finance
- [ ] Email: ilovehentai3120@gmail.com
- [ ] Circle products: USDC, Wallets, Gateway
- [ ] GitHub repo URL
- [ ] Live demo URL (Vercel)
- [ ] Video demo URL
- [ ] Circle Product Feedback section

### CHECKPOINT 6 (Final)
> ✅ Submission form filled and confirmed before Jul 13 2026 00:00 UTC.

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Contract bug post-deploy | Medium | High | 14 Hardhat tests before deploy; buffer time to redeploy |
| Circle API key setup delay | Medium | Medium | Register console.circle.com on Day 1 of Phase 4 |
| Arc Testnet RPC downtime | Low | Medium | 4 fallback RPC providers (Blockdaemon, dRPC, QuickNode) |
| USDC transfer reverts (address block) | Very low | Low | Wrap in try/catch, handle gracefully |
| wagmi gas config wrong (< 20 Gwei) | Medium | High | Fix in Phase 3 Step 1 before any transaction |
| Pool drained / insufficient liquidity | Low | Medium | Faucet replenish; UI shows available liquidity |
| Submission deadline missed | Very low | Fatal | Buffer of 14 days; submit early if possible |

---

## What NOT to do

- ❌ Do NOT use `block.prevrandao` for any logic (always 0 on Arc)
- ❌ Do NOT use `SELFDESTRUCT` in contracts
- ❌ Do NOT set `maxFeePerGas` below 20 Gwei in any transaction
- ❌ Do NOT use `block.timestamp ==` for due date (use `>=`)
- ❌ Do NOT expose `CIRCLE_ENTITY_SECRET` in client-side code
- ❌ Do NOT commit `.env` files or private keys
- ❌ Do NOT use `uint256.max` for USDC approvals — exact amounts only
- ❌ Do NOT wait for more than 1 confirmation on Arc (1 block = final)
- ❌ Do NOT use floating-point math — all amounts in uint256 with 6 decimals
- ❌ Do NOT hardcode Arc addresses — always import from `src/lib/contracts.ts`

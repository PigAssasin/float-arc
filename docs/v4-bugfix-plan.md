# Float v4 — Bug Fix Plan

> Generated: 2026-06-14
> Status: PENDING

---

## Overview

Fixes identified after full post-deploy audit of Float v4.
Ordered by impact: runtime bugs first, cosmetic last.
Each task has a checkpoint to verify before moving on.

---

## Task 1 — Fix `COLLATERAL_TIMEOUT_S` in Seller page

**File:** `src/app/app/seller/page.tsx`

**Problem (two bugs, same block):**

1. `COLLATERAL_TIMEOUT_S = 120 * 3600` → 5 days.
   Contract constant is `COLLATERAL_TIMEOUT = 48 hours` (172 800 s).
   Result: "Cancel Invoice" button for collateral timeout appears 3 days too late.

2. Stale-collateral filter uses `inv.createdAt` instead of `inv.approvedAt`.
   Contract `cancelCollateralTimeout` checks `inv.approvedAt + COLLATERAL_TIMEOUT`.
   Result: UI timer starts from creation, contract timer starts from approval → can diverge
   by hours depending on how long buyer took to approve.

**Fix:**

```diff
- const COLLATERAL_TIMEOUT_S = 120 * 3600; // 432000
+ const COLLATERAL_TIMEOUT_S = 48 * 3600;  // 172800 — matches FloatCore.COLLATERAL_TIMEOUT

// In the stale-collateral filter (around line 608):
- inv.status === 1 && nowS > Number(inv.createdAt) + COLLATERAL_TIMEOUT_S
+ inv.status === 1 && Number(inv.approvedAt) > 0 && nowS > Number(inv.approvedAt) + COLLATERAL_TIMEOUT_S
```

**Also fix `StaleInvoiceCard` hours-stale display** (line 69 — currently calculates stale hours from
`createdAt` for collateral type too):

```diff
- const hoursStale = Math.floor((Date.now() / 1000 - Number(inv.createdAt) - (type === "approval" ? APPROVAL_TIMEOUT_S : COLLATERAL_TIMEOUT_S)) / 3600);
+ const baseTs = type === "collateral" && Number(inv.approvedAt) > 0
+   ? Number(inv.approvedAt)
+   : Number(inv.createdAt);
+ const hoursStale = Math.floor((Date.now() / 1000 - baseTs - (type === "approval" ? APPROVAL_TIMEOUT_S : COLLATERAL_TIMEOUT_S)) / 3600);
```

**Checkpoint 1:**
- [ ] `COLLATERAL_TIMEOUT_S === 48 * 3600` in source
- [ ] Stale-collateral filter references `inv.approvedAt` not `inv.createdAt`
- [ ] `hoursStale` calc uses correct base timestamp per type
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)

---

## Task 2 — Trigger refetch after partial payment confirmation

**File:** `src/app/app/buyer/page.tsx`

**Problem:**
After `partialPaid = true`, the UI shows "Refreshing balance…" but no actual refetch is called.
`amountPaid`, progress bar, and remaining balance stay stale until manual page reload.

**Fix:**
`useMyInvoices` hook returns a `refetch` function. Wire it up after partial confirmation.

Step 1 — Export `refetch` from `useMyInvoices`:

```ts
// src/hooks/use-my-invoices.ts — check if refetch is already returned.
// If not, return it from the hook: { invoices, isLoading, total, refetch }
```

Step 2 — In `BuyerPage`, destructure `refetch`:

```ts
const { invoices, isLoading, total, refetch } = useMyInvoices(address, "buyer");
```

Step 3 — Pass `refetch` into `FundedCard` as a prop:

```tsx
{funded.map((inv) => (
  <FundedCard key={String(inv.id)} inv={inv} address={address as `0x${string}`} onSettled={refetch} />
))}
```

Step 4 — In `FundedCard`, call `onSettled` when `partialPaid` or `paid` becomes true:

```ts
function FundedCard({ inv, address, onSettled }: { ...; onSettled?: () => void }) {
  // existing hooks ...
  // add useEffect:
  useEffect(() => {
    if (partialPaid || paid || markedDefault) onSettled?.();
  }, [partialPaid, paid, markedDefault]);
```

**Checkpoint 2:**
- [ ] `useMyInvoices` exports `refetch`
- [ ] `BuyerPage` passes `onSettled={refetch}` to `FundedCard`
- [ ] `FundedCard` calls `onSettled` on `partialPaid`, `paid`, `markedDefault`
- [ ] Manual test: submit a partial payment → progress bar updates without page reload
  (on testnet; alternatively verify the `useEffect` dependency array in code review)
- [ ] TypeScript compiles with no errors

---

## Task 3 — Fix contract NatSpec title (cosmetic)

**File:** `contracts/src/FloatCore.sol`

**Problem:**
Line 11: `/// @title FloatCore v3 — Invoice lifecycle with seller stake, invoice size cap, and insurance fee`
Should say v4 and reflect new features.

**Fix:**
```diff
- /// @title FloatCore v3 — Invoice lifecycle with seller stake, invoice size cap, and insurance fee
+ /// @title FloatCore v4 — Invoice lifecycle: seller stake, size cap, insurance, partial repayment, anti-Sybil hooks
```

Note: contract is already deployed. This change only matters for the repo source readability
and any future redeploy. No redeployment needed for this fix alone.

**Checkpoint 3:**
- [ ] Line 11 of FloatCore.sol says v4
- [ ] No other "v3" references remain in FloatCore.sol (grep check)

---

## Task 4 — Replace fake sparkline with real share value history

**File:** `src/app/app/investor/page.tsx`

**Problem:**
`const SPARKLINE = [62, 64, 61, 66, 68, ...]` is static dummy data.
It does not reflect the actual on-chain `shareValue()`.

**Decision point — two options:**

**Option A (simple):** Remove the sparkline entirely and show a static label
"Share value rises as fees accrue" with no chart. Zero maintenance.

**Option B (real data):** Read `shareValue()` once per render (already read as `rawShareValue`).
Because we only have one data point per session, we cannot draw a meaningful historical line.
Store the last N values in `sessionStorage` keyed by pool address and render them.
This gives a within-session sparkline — resets on reload but is never fake.

**Recommended: Option A** for hackathon scope. Option B is a future enhancement.

**Fix (Option A):**

```diff
- const SPARKLINE = [62, 64, 61, 66, 68, 65, 70, 72, 71, 74, 73, 77, 76, 80, 79, 84];
```

Replace the SVG sparkline block with a simple text indicator:

```tsx
<div className="hidden sm:flex flex-col gap-2 justify-center">
  <p className="text-gray-500 text-[10px] uppercase tracking-widest">Current share value</p>
  <p className="text-[#22c55e] font-bold text-2xl tabular-nums">
    ${shareValueRatio.toFixed(4)}
  </p>
  <p className="text-[10px] text-gray-600">rises as invoice fees accrue</p>
</div>
```

**Checkpoint 4:**
- [ ] `SPARKLINE` constant deleted from source
- [ ] No hardcoded chart data in investor page
- [ ] `shareValueRatio` displayed from real on-chain read
- [ ] TypeScript compiles with no errors

---

## Task 5 — Operational: re-seed pool v4

**Not a code change — manual action required by deployer wallet.**

**Problem:**
Pool v4 (`0x98bF7f0572f542fBD6365531D39C657779839375`) has ~$0.93 USDC.
Max single invoice advance = 20% of $0.93 ≈ $0.19.
Any demo invoice > $0.25 face value will revert `InvoiceTooLarge`.

**Action:**
1. Connect with deployer or investor wallet at https://float-arc.vercel.app/app/investor
2. Approve USDC → Deposit into pool (recommend at least $100 USDC for meaningful demo)
3. Verify "Pool TVL" and "Available Now" update on seller dashboard

**Checkpoint 5:**
- [ ] Pool TVL > $50 shown on investor page
- [ ] Seller page "Available Now" > $50
- [ ] Seller page "Max this invoice" > $10
- [ ] Creating a test invoice for $5 does NOT revert

---

## Task 6 — Circle Wallet integration (conditional)

**Condition:** Only needed if the hackathon judges require Circle Wallet as a functional
feature (Circle is a sponsor of the challenge). Current wallet connection is wagmi only.

**CLAUDE.md describes:**
- `POST /api/circle/init-user` — idempotent user creation
- `GET /api/circle/wallets` — list wallets
- Circle W3S SDK PIN challenge
- SDK: `@circle-fin/w3s-pw-web-sdk`

**Check first:** Do `src/app/api/circle/` routes actually exist?

```
Glob: src/app/api/circle/**
```

If routes exist and Circle API key is set on Vercel → implement UI flow.
If routes do not exist → create them + minimal UI (button "Create Circle Wallet" → PIN challenge).

This task is scoped separately because it depends on whether Circle API key works.
**Defer this task until Tasks 1–5 are done and pool is re-seeded.**

**Checkpoint 6 (if implemented):**
- [ ] `/api/circle/init-user` returns 200 or 409 (not 5xx)
- [ ] `/api/circle/wallets` returns wallet list
- [ ] W3SSdk PIN challenge appears in browser
- [ ] User can sign a transaction with Circle wallet

---

## Execution Order

```
Task 1 → Task 2 → Task 3 → Task 4 → (manual) Task 5 → (conditional) Task 6
```

Tasks 1–4 are pure code changes, no deploy needed for verification (TypeScript compile).
Task 5 is manual on-chain action.
Task 6 is conditional and scoped separately.

After Tasks 1–4: deploy to Vercel and run end-to-end smoke test.
After Task 5: verify demo flow works (seller create invoice → buyer approve → lock → pay).

---

## Post-fix smoke test checklist

- [ ] Seller page loads, shows correct pool liquidity and max invoice size
- [ ] Seller creates invoice → tx confirmed, invoice appears in "My Invoices"
- [ ] Buyer page loads, pending approval card visible
- [ ] Buyer approves invoice → status moves to PENDING_COLLATERAL
- [ ] Buyer locks collateral (approve USDC → lock) → status moves to FUNDED
- [ ] Buyer pays partial installment → progress bar updates without reload (Task 2)
- [ ] Buyer pays full amount → invoice moves to PAID, collateral returned
- [ ] Investor deposits → fLP balance shown
- [ ] Investor transfers fLP → balance changes
- [ ] Legacy pool banner appears for wallet with old shares
- [ ] AI assistant responds to "what is my score" with live on-chain data
- [ ] Stale collateral card appears at 48h past `approvedAt` (verify constant, not live test)

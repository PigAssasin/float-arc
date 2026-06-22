# Float v4 — Fix Plan (Circle Wallet + AI Assistant)

Generated: 2026-06-15
Deadline: Mon Jul 13 2026

---

## Issues to Fix (priority order)

| # | Issue | Severity | Redeploy? |
|---|-------|----------|-----------|
| 1 | Circle wallet connected but dashboards use `useAccount()` — user sees blank "Connect wallet" | CRITICAL | No |
| 2 | AI assistant `buildContext()` computes advance rate from raw score, misidentifies new sellers (50→80% instead of 75%) | MEDIUM | No |
| 3 | AI assistant reads `sellerScore` even for buyer/investor roles | LOW | No |

Contract insurance bug (partial+default) left out — requires pool redeploy + re-seed, not worth the risk before deadline.

---

## Task 1 — Create `useAppWallet` hook

**File:** `src/hooks/use-app-wallet.ts` (NEW)

**Goal:** Single source of truth for "who is connected" — merges wagmi + Circle.
Dashboards just call `useAppWallet()` and get `{ address, isConnected, isCircle }`.

**Steps:**
1. Import `useAccount` from wagmi and `useCircleWallet` from `use-circle-wallet`
2. If wagmi `isConnected` → return wagmi address, `isCircle: false`
3. Else if Circle `status === "connected"` → return Circle address, `isCircle: true`
4. Else → return `{ address: undefined, isConnected: false, isCircle: false }`

**Checkpoint:** Hook exports `{ address, isConnected, isCircle }` with correct values for both wallet types.

---

## Task 2 — Update `seller/page.tsx` to use `useAppWallet`

**File:** `src/app/app/seller/page.tsx`

**Steps:**
1. Replace `import { useAccount }` line with `import { useAppWallet }` from `@/hooks/use-app-wallet`
2. Replace `const { isConnected, address } = useAccount()` with `const { isConnected, address, isCircle } = useAppWallet()`
3. For write operations (createInvoice, cancelTimeout): if `isCircle`, disable with tooltip "Circle wallet is read-only — use MetaMask to transact"
4. Keep all reads identical (they only need `address`)

**Checkpoint:** Circle user can see their seller dashboard, credit score, invoice list. Create invoice form shows disabled state with clear message if Circle-only.

---

## Task 3 — Update `buyer/page.tsx` to use `useAppWallet`

**File:** `src/app/app/buyer/page.tsx`

**Steps:**
1. Same wagmi→useAppWallet swap
2. Write buttons (approveInvoice, lockCollateral, payInvoice, markDefault, payPartial): disable + tooltip if `isCircle`

**Checkpoint:** Circle user sees their buyer dashboard, funded invoices listed, write buttons gracefully disabled.

---

## Task 4 — Update `investor/page.tsx` to use `useAppWallet`

**File:** `src/app/app/investor/page.tsx`

**Steps:**
1. Same wagmi→useAppWallet swap
2. Deposit/withdraw buttons: disable + tooltip if `isCircle`

**Checkpoint:** Circle user sees pool stats, their fLP balance, earnings. Deposit/withdraw gracefully disabled.

---

## Task 5 — Fix `FloatAssistant.tsx` tier mislabeling

**File:** `src/components/shared/FloatAssistant.tsx`

**Problem (line 93-96):**
```ts
const advanceRate =
  score !== undefined
    ? score >= 86 ? 88 : score >= 71 ? 84 : score >= 41 ? 80 : 75
    : undefined;
```
A new seller has score 50 → this gives 80%, but `sellerAdvanceBps()` on-chain returns 7500 (75%) because `sellerTotalCount == 0`.

**Steps:**
1. Add `sellerAdvanceBps` to the `useReadContracts` call (index 5), conditional on `role === "seller"`
2. Derive `advanceRate` from `rawAdvanceBps / 100` instead of score-based formula
3. Keep score-based formula as fallback only if bps read fails
4. Move `sellerScore` read (index 4) behind `role === "seller"` guard — skip for buyer/investor

**Checkpoint:** New seller with score 50 sees "75% advance rate" in AI assistant context. Buyer/investor no longer have sellerScore noise in their context.

---

## Task 6 — Update `FloatAssistant` to use `useAppWallet`

**File:** `src/components/shared/FloatAssistant.tsx`

**Steps:**
1. Replace `const { address, isConnected } = useAccount()` with `useAppWallet()`
2. Circle users now get correct address for pool data reads and invoice reads

**Checkpoint:** Circle user opens Float Assistant → sees their invoices and pool stats, not empty context.

---

## Execution Order

```
Task 1 → Task 5 → Task 6 → Task 2 → Task 3 → Task 4
```
(Hook first, AI quick-wins, then dashboards in order of complexity)

## After all tasks

1. Run `npm run build` — must pass with no errors
2. Deploy: `vercel --prod --yes`
3. Verify on https://float-arc.vercel.app:
   - Connect Circle wallet → seller dashboard shows score/invoices
   - Connect Circle wallet → buyer dashboard shows invoices
   - AI assistant shows correct advance rate for new sellers

# Float v4 — Upgrade Plan (Critical Fixes + Product Expansion)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

> **Scope.** Fix the critical/high-severity issues found in the v3 audit, then ship three
> product upgrades: tokenized LP position, partial repayment, and an AI assistant with
> on-chain function calling.
>
> **Deployment strategy.** All Solidity changes (fixes + tokenize + partial repayment) are
> batched into a **single v4 redeploy**. We do not redeploy per fix. Frontend ABI/address
> updates happen once after v4 is live. The AI function-calling work is backend/frontend
> only and does not require a redeploy.
>
> **Branching.** Work on `feat/v4`. Do not commit to `master` until Phase 7 QA passes.

---

## Audit summary (what we are fixing)

| # | Severity | Issue | Phase |
|---|----------|-------|-------|
| 1 | 🔴 | Test suite tests the old v1 contract, not deployed v3 | Phase 1 |
| 2 | 🔴 | Self-dealing / Sybil drains the pool (~52% of face per cycle) | Phase 2 |
| 3 | 🟠 | "New" 75% tier unreachable; new sellers silently get 80% | Phase 2 |
| 4 | 🟠 | Insurance reserve grows unbounded, permanently locks LP capital | Phase 2 |
| 5 | 🟠 | ERC4626 first-depositor / donation inflation attack | Phase 2 / 3 |
| 6 | 🟡 | markDefault has no keeper incentive | Phase 2 (optional) |
| 7 | 🟡 | Invoice 20% cap not re-checked at lockCollateral | Phase 2 |
| 8 | 🟡 | Collateral window depends on approval timing (no approvedAt) | Phase 2 |
| 9 | 🟡 | Seller tooltip wording misleading (says 80%, really 72% net) | Phase 5 |
| 10 | 🟡 | maxInvoiceAmount hardcodes 0.2 instead of reading MAX_INVOICE_BPS | Phase 5 |

---

## Phase 0 — Prep & safety net

- [x] Create branch: `git checkout -b feat/v4`
- [x] Confirm Hardhat toolchain runs: `cd contracts && npx hardhat compile --force` (16 files OK)
- [x] Record current v3 deployed addresses in this file (rollback reference):
  - FloatPool v3: `0x1b643E7C7B640fc17F64D652fb4B3490c60D9819`
  - FloatCore v3: `0xc8934c61A580290fC63a374CEF4B4e03366930C9`
- [ ] Confirm deployer wallet has Arc Testnet USDC for gas. *(verify before Phase 5 deploy)*

**✅ Checkpoint 0 [DONE]:** `npx hardhat compile` succeeds, branch `feat/v4` created, addresses recorded.

---

## Phase 1 — Rewrite the test suite for v3 (safety net BEFORE changing contracts)

We write correct tests for the **current** v3 behavior first. This gives a green baseline,
documents real behavior, and lets us prove the self-dealing exploit as a failing-by-design test
that Phase 2 will then neutralize.

### 1.1 Fixture rewrite
- [ ] In [Float.test.js](../contracts/test/Float.test.js), fix setup so buyer approves USDC to **FloatCore** (collateral) and investor approves **FloatPool** (deposit). Mint USDC to seller too (for stake? no — stake is withheld from advance, seller needs nothing upfront; buyer needs collateral + payment).
- [ ] Replace all old symbol names:
  - `creditScore` → `sellerScore`
  - `advanceRateBps` → `sellerAdvanceBps`
  - `paidCount` → `sellerPaidCount`

### 1.2 Lifecycle tests (the real v3 flow)
- [ ] `createInvoice` only creates `PENDING_APPROVAL` and moves **no funds**.
- [ ] `approveInvoice` → status `PENDING_COLLATERAL`; wrong caller reverts `NotBuyer`.
- [ ] `lockCollateral` → pulls collateral, disburses `advance − stake` net to seller, status `FUNDED`. Assert seller balance delta == net, pool reserved buckets updated.
- [ ] `payInvoice` → buyer pays `amountDue`, collateral returned to buyer, stake returned to seller, 1% insurance funded, scores updated, status `PAID`.
- [ ] `payInvoice` twice reverts `WrongStatus`.
- [ ] `payInvoice` by non-buyer reverts `NotBuyer`.

### 1.3 Default waterfall tests
- [ ] `markDefault` before `dueDate + GRACE_PERIOD` reverts `GracePeriodNotExpired`.
- [ ] After grace: status `DEFAULTED` (enum value **4**), `InvoiceDefaulted` emitted with **4 args** `(id, seller, collateralSlashed, stakeSlashed)`.
- [ ] Assert waterfall: collateral slashed → stake slashed → insurance draws exactly `advance − collateral − stake`.

### 1.4 Tier tests (current behavior — documents the bug in #3)
- [ ] New seller: `sellerScore == 50`, `sellerAdvanceBps == 8000` (this asserts the CURRENT buggy behavior; Phase 2 will change the expected value to 7500 and update this test).
- [ ] After N paid invoices score climbs and rate caps at `8800`.

### 1.5 Pool / share-math tests
- [ ] First deposit mints shares 1:1.
- [ ] Second deposit after yield accrual gets diluted shares (keep the existing 909090909 assertion shape but recompute for v3).
- [ ] `withdraw` more shares than owned reverts `InsufficientShares`.
- [ ] Full-cycle yield test: investor deposits, one invoice funded+paid, investor withdraws more than deposited.

### 1.6 Invariant + exploit tests
- [ ] **Invariant:** after every state transition, `investorAssets() + totalLockedCollateral + sellerStakeTotal + insuranceReserve == usdc.balanceOf(pool)`. Add as a helper asserted at multiple points.
- [ ] **Exploit (expected to PASS now, proving the hole):** attacker uses wallet A=seller, B=buyer; funds an invoice; defaults; assert attacker net gain > 0 and pool net loss ≈ `advance − collateral − stake`. Tag with comment `// SECURITY: neutralized in Phase 2`.

**✅ Checkpoint 1 [DONE]:** `npx hardhat test` fully green — **20 passing** against unchanged v3 contracts. Exploit test proves LP loss = 520/1000 face (52%) on a self-dealing default. Invariant `investorAssets + collateral + stake + insurance == balanceOf(pool)` asserted across transitions.

---

## Phase 2 — Critical contract fixes

All edits in [FloatCore.sol](../contracts/src/FloatCore.sol) and [FloatPool.sol](../contracts/src/FloatPool.sol). Update tests in lockstep.

### 2.1 Fix #3 — New tier reachable (FloatCore)
- [ ] Gate tier functions on history. A seller with no history is "New", not "Fair":
  ```solidity
  function sellerAdvanceBps(address seller) public view returns (uint256) {
      if (sellerTotalCount[seller] == 0) return 7500; // New (unproven)
      uint256 s = sellerScore(seller);
      if (s >= 86) return 8800;
      if (s >= 71) return 8400;
      if (s >= 41) return 8000;
      return 7500;
  }
  function sellerStakeBps(address seller) public view returns (uint256) {
      if (sellerTotalCount[seller] == 0) return 1000; // New: 10%
      uint256 s = sellerScore(seller);
      if (s >= 86) return 500;
      if (s >= 71) return 600;
      if (s >= 41) return 800;
      return 1000;
  }
  ```
  Note: `advanceBps`/`stakeBps` are read in `createInvoice` **before** `sellerTotalCount++`, so the first invoice correctly uses New tier.
- [ ] Update Phase 1 tier test expectation: new seller advance == `7500`, stake == `1000`.

### 2.2 Fix #4 — Bounded insurance reserve (FloatPool)
- [ ] Add `uint256 public constant INSURANCE_TARGET_BPS = 1000; // 10% of investor assets`.
- [ ] Cap growth in `fundInsurance`:
  ```solidity
  function fundInsurance(uint256 amount) external onlyCore {
      if (amount == 0) return;
      uint256 target = (investorAssets() * INSURANCE_TARGET_BPS) / 10_000;
      if (insuranceReserve >= target) return;       // overflow stays as LP yield
      uint256 headroom = target - insuranceReserve;
      uint256 add = amount < headroom ? amount : headroom;
      insuranceReserve += add;
      emit InsuranceFunded(add);
  }
  ```
- [ ] Test: reserve never exceeds 10% of investor assets; once capped, the extra 1% fee accrues to `investorAssets` (LP yield) instead.

### 2.3 Fix #5 — Inflation guard (FloatPool)
> If Phase 3 (ERC20 tokenize) lands in the same v4, fold the dead-shares logic into the ERC20 `deposit`. If not, add it to the current mapping-based deposit now.
- [ ] Add constants `DEAD_SHARES = 1e3`, `MIN_FIRST_DEPOSIT = 1e6 // 1 USDC`.
- [ ] First deposit (`totalShares == 0`): require `amount >= MIN_FIRST_DEPOSIT`; mint `DEAD_SHARES` to a burn address (locked forever) and the remainder to the depositor.
- [ ] Test: donation attack — attacker deposits min, transfers large USDC directly to pool, second depositor still receives non-zero, fairly-priced shares (no round-to-zero theft).

### 2.4 Fix #2 — Anti-Sybil (FloatCore) — defense in depth
> **Constraint (user):** KYC / verification must NOT block normal usage during the testnet
> phase. So the verification gate ships **disabled by default** — it is a production hook,
> not an active testnet gate. The active testnet mitigation is the *permissionless* exposure
> cap, which needs no identity and does not block honest users up to a generous limit.
>
> Honest framing: without external identity this **mitigates** rather than eliminates Sybil.

**Layer A — Verification gate (present but OFF on testnet)**
- [ ] Add `mapping(address => bool) public verified;` and `address public attestor;`.
- [ ] Add `bool public verificationRequired;` — **default `false`** (testnet: nobody is gated).
- [ ] Add `setAttestor(address)` + `setVerificationRequired(bool)` (onlyOwner), `setVerified(address,bool)` (onlyAttestor).
- [ ] In `createInvoice`: **only** if `verificationRequired`, require `verified[msg.sender] && verified[buyer]`. When the flag is false (testnet default) this branch is skipped entirely — zero friction.
- [ ] Pluggable to EAS later by sourcing `setVerified` from an attestation. Document, don't build, for now.

**Layer B — Per-seller outstanding exposure cap (active, permissionless, no identity)**
- [ ] Add `mapping(address => uint256) public outstandingAdvance;` and `uint256 public maxOutstandingPerSeller;` (**0 = unlimited**, the testnet default; set a generous value only if we want to demo the cap).
- [ ] In `lockCollateral`: `outstandingAdvance[seller] += advance`; revert if `maxOutstandingPerSeller != 0 && it exceeds the cap`.
- [ ] In `payInvoice` and `markDefault`: `outstandingAdvance[seller] -= advance` (guard underflow).
- [ ] Tests: with the cap set, it blocks the Nth concurrent invoice and bounds the Phase 1 exploit; with the cap at 0 (testnet default) honest flows are unaffected. Verification-gate test runs with the flag toggled on, then left off for all other tests.

> **Net effect on testnet:** flows stay completely open (no verification, unlimited exposure
> by default). The security machinery exists and is unit-tested, but is dormant until an
> operator opts in for production.

### 2.5 Fix #7 — Re-check size cap at lock (FloatCore)
- [ ] In `lockCollateral`, after re-reading liquidity, also re-assert the 20% cap:
  ```solidity
  if (liquidity > 0 && inv.advance > (liquidity * MAX_INVOICE_BPS) / 10_000)
      revert InvoiceTooLarge(inv.advance, (liquidity * MAX_INVOICE_BPS) / 10_000);
  ```
- [ ] Test: shrink pool between create and lock so the cap binds; lock reverts.

### 2.6 Fix #8 — Collateral window from approval time (FloatCore)
- [ ] Add `uint256 approvedAt;` to the `Invoice` struct; set it in `approveInvoice`.
- [ ] `cancelCollateralTimeout` uses `approvedAt + COLLATERAL_TIMEOUT` instead of `createdAt + APPROVAL_TIMEOUT + COLLATERAL_TIMEOUT`.
- [ ] Note: struct change alters `getInvoice` tuple → frontend interface + ABI update in Phase 4/5.
- [ ] Test: buyer approves late, still gets full COLLATERAL_TIMEOUT to lock.

### 2.7 Fix #6 — markDefault keeper bounty (FloatCore) — OPTIONAL
- [ ] Add `KEEPER_BOUNTY_BPS` (e.g. 50 = 0.5%); on `markDefault`, transfer a small slice of slashed collateral to `msg.sender`. Skip if time-constrained.

**✅ Checkpoint 2 [DONE]:** 28 passing. Tier fix (new seller 7500/1000), insurance cap (accrual + clamp branch), anti-Sybil (verification gate OFF by default + exposure cap), lock-time size-cap re-check, and approval-based collateral timeout all tested. Exploit baseline updated (now 400/1000) and exposure-cap test bounds it. Inflation guard (#5) folded into Phase 3 ERC20 deposit. Keeper bounty (#6) skipped as optional. Slither: follow-up.

---

## Phase 3 — Product feature: Tokenize the LP position (ERC20 shares)

Make pool shares a transferable ERC20 (`Float LP` / `fLP`) so investors can exit or compose
on a secondary market without waiting for pool liquidity.

### 3.1 Convert FloatPool to ERC20
- [ ] Import OZ `ERC20`; `contract FloatPool is ERC20, ReentrancyGuard, Ownable`.
- [ ] Constructor: `ERC20("Float LP", "fLP")`.
- [ ] **Override `decimals()` to return 6** so shares stay 1:1-scaled with USDC and the existing `shareValue()` (1e18) math is unaffected.
- [ ] Remove `mapping(address=>uint256) public shares;` and `uint256 public totalShares;`. Replace all reads:
  - `shares[x]` → `balanceOf(x)`
  - `totalShares` → `totalSupply()`
- [ ] `deposit`: compute `newShares` against `totalSupply()`/`investorAssets()`, then `_mint`. Fold in the dead-shares + min-first-deposit guard from 2.3.
- [ ] `withdraw`: check `balanceOf(msg.sender)`, compute payout, `_burn`, transfer USDC. Keep the `availableLiquidity` guard.
- [ ] Keep `shareValue()` formula identical (now uses `totalSupply()`).

### 3.2 Tests
- [ ] LP token transfers between accounts; recipient can later `withdraw` against transferred shares.
- [ ] `totalSupply`/`balanceOf` behave like the old `totalShares`/`shares` in all Phase 1 share tests (port assertions).
- [ ] Dead shares present after first deposit; donation attack still neutralized.

**✅ Checkpoint 3 [DONE]:** 31 passing. FloatPool is now ERC20 `fLP` (decimals 6); transfer + withdraw-by-recipient tested; dead-shares + min-first-deposit neutralize the donation attack (tested). Backward-compat `shares()`/`totalShares()` aliases retained so the frontend needs minimal change.

---

## Phase 4 — Product feature: Partial repayment / installments (FloatCore)

Buyer can pay a funded invoice in multiple tranches before the due date.

### 4.1 Contract changes
- [ ] Add `uint256 amountPaid;` to the `Invoice` struct (cumulative paid, default 0).
- [ ] Refactor settlement into internal `_settle(uint256 id, uint256 discount)` that does: set `PAID`, increment scores, `releaseCollateral`, `releaseSellerStake`, `fundInsurance`, decrement `outstandingAdvance`, emit events.
- [ ] New `payPartial(uint256 id, uint256 payAmount)`:
  - require status `FUNDED`, `msg.sender == buyer`, `payAmount > 0`, `amountPaid + payAmount <= amount`.
  - `inv.amountPaid += payAmount`; pull `payAmount` → pool; emit `PartialPayment(id, payAmount, amountPaid)`.
  - **No early discount on partials** (discount is reserved for paying the full remainder at once).
  - if `amountPaid >= amount`: call `_settle(id, 0)`.
- [ ] Rework `payInvoice` to pay the **remainder** with early discount applied to the remainder:
  - `remaining = amount - amountPaid`; compute discount on `remaining` via `_earlyRepayAmount`-style logic; pull `remaining - discount`; set `amountPaid = amount`; `_settle(id, discount)`.
- [ ] Add event `PartialPayment(uint256 indexed id, uint256 amount, uint256 totalPaid)`.

### 4.2 Tests
- [ ] Two partial payments then a final one settles the invoice (collateral + stake returned once, scores update once).
- [ ] Partial overpay (`amountPaid + payAmount > amount`) reverts.
- [ ] `payInvoice` after a partial pays only the remainder; full early single-shot still gets discount.
- [ ] Invariant holds across partial payments.

**✅ Checkpoint 4 [DONE]:** 34 passing. `payPartial` accrues installments and auto-settles once at face value (collateral/stake/insurance handled once); overpay reverts; `payInvoice` pays the discounted remainder after partials. Struct exposes `amountPaid`; `earlyRepayAmount` previews the remaining balance.

---

## Phase 5 — Deploy v4 + wire frontend

### 5.1 Deploy
- [ ] Update [deploy.js](../contracts/scripts/deploy.js) to set new admin params post-deploy: `setAttestor`, `unverifiedAdvanceCap`, `maxOutstandingPerSeller`, `pool.setAuthorizedCore`.
- [ ] `npx hardhat run scripts/deploy.js --network arc_testnet`.
- [ ] Record v4 addresses here:
  - FloatPool v4: `__________`
  - FloatCore v4: `__________`
- [ ] Seed pool with an initial deposit (clears the dead-shares first-deposit gate) so the demo has liquidity.

### 5.2 Regenerate ABI + addresses
- [ ] Copy fresh ABIs from `contracts/artifacts/...` into [contracts.ts](../src/lib/contracts.ts) (FloatCoreABI, FloatPoolABI).
- [ ] Update `CONTRACTS.FLOAT_POOL` / `FLOAT_CORE` defaults to v4 addresses (and Vercel env `NEXT_PUBLIC_FLOAT_*_ADDRESS`).
- [ ] Update [CLAUDE.md](../CLAUDE.md) "Deployed Contracts" section to v4.

### 5.3 Frontend data layer
- [ ] [use-my-invoices.ts](../src/hooks/use-my-invoices.ts): add `amountPaid: bigint` to `OnChainInvoice` and the decode object (struct field order: seller, buyer, amount, advance, collateral, stake, dueDate, createdAt, **approvedAt**, **amountPaid**, status). Verify exact order against the new ABI tuple.
- [ ] Investor page: read `balanceOf`/`totalSupply` instead of `shares`/`totalShares`.

### 5.4 Frontend fixes #9, #10
- [ ] Seller tooltip ([seller/page.tsx](../src/app/app/seller/page.tsx)): reword to "You receive {netAdvanceRate}% now; {stakeRate}% stake returns when the buyer pays; {fee}% is the float fee." Derive tier label from `rateBps` (7500→New, 8000→Fair, 8400→Good, 8800→Excellent) instead of `scoreToTier(score)`.
- [ ] Replace hardcoded `0.2` in `maxInvoiceAmount` with a read of `MAX_INVOICE_BPS` from chain.

### 5.5 Frontend: partial repayment UI (buyer page)
- [ ] On a FUNDED invoice, show progress `amountPaid / amount` and a "Pay partial" input calling `payPartial`, plus the existing "Pay in full" (now pays remainder w/ discount).
- [ ] Handle `approve` of `payAmount` to FloatCore before `payPartial`.

### 5.6 Frontend: tokenized position UI (investor page) — light
- [ ] Show `fLP` balance and `shareValue`; optional "Transfer LP" action (`transfer(to, amount)` on FloatPool).

**✅ Checkpoint 5 [DONE]:** v4 deployed to Arc Testnet — Pool `0x98bF7f0572f542fBD6365531D39C657779839375`, Core `0x336Be2095425ac463c6E121461B68401c3209c85`; pool seeded ~84 USDC. ABIs regenerated, addresses updated in contracts.ts + .env.local + CLAUDE.md. Frontend wired: `amountPaid`/`approvedAt` decode, seller tier-from-rate + on-chain size cap + reworded tooltip, buyer installment UI (`payPartial` + progress), investor fLP transfer. `npx tsc --noEmit` clean. (`npm run build` in Phase 7.)

---

## Phase 6 — AI assistant function calling

Upgrade [api/chat/route.ts](../src/app/api/chat/route.ts) + [FloatAssistant.tsx](../src/components/shared/FloatAssistant.tsx)
so DeepSeek can query live chain data via tools instead of relying only on injected static context.

### 6.1 Server read client
- [ ] Add `src/lib/server-rpc.ts`: a viem `createPublicClient` for Arc Testnet (chain id 5042002, RPC from env) for server-side contract reads.

### 6.2 Tool definitions (OpenAI-style `tools`)
- [ ] `get_pool_stats()` → totalAssets, availableLiquidity, insuranceReserve, shareValue.
- [ ] `get_my_score({ address })` → sellerScore, sellerAdvanceBps, sellerStakeBps, tier.
- [ ] `get_my_invoices({ address, role })` → list with id, amount, advance, status, amountPaid, dueDate.
- [ ] `get_invoice_detail({ id })` → full struct + human-readable status + remaining due.

### 6.3 Tool dispatch loop
- [ ] In route.ts: send messages + tools to DeepSeek. If response has `tool_calls`, execute each via server-rpc, append `tool` role results, re-call. Loop (cap ~3 rounds) until a normal message, then **stream** that final answer (keep the existing `\r?\n` leftover-buffer SSE handling).
- [ ] Pass the connected wallet address from the client into the request body so tools can default `address`.
- [ ] Update system prompt: "You can call tools to read live on-chain data. Prefer calling a tool over guessing numbers."

### 6.4 Tests / manual QA
- [ ] Ask "why did my invoice #X fail / what's its status" → assistant calls `get_invoice_detail` and answers with real data.
- [ ] Ask "what's my advance rate" → calls `get_my_score`.
- [ ] Vietnamese answers still render correctly (multibyte SSE).

**✅ Checkpoint 6 [DONE]:** Assistant answers via live tool calls — verified end to end against deployed v4: "available liquidity" → get_pool_stats returned exact 83.93 USDC; EN + VN score questions → get_my_score returned New tier / 75% / 10% / fLP 83.93 with correct multibyte rendering. 4 tools (pool, score, invoices, detail), 3-round tool loop, full-address passed from the client. tsc + build clean.

---

## Phase 7 — Final QA, docs, ship

- [x] `cd contracts && npx hardhat test` — all green (34 passing).
- [x] `npx tsc --noEmit` and `npm run build` — clean.
- [x] AI assistant flow smoke-tested end to end against v4 (pool stats + score, EN + VN).
- [x] Update [README.md](../README.md): v4 addresses, new features. AI-attribution-free, no personal info.
- [x] Update [CLAUDE.md](../CLAUDE.md) contract addresses (local; gitignored).
- [x] Merge `feat/v4` → `master`, push, tag `v4.0`.
- [ ] **MANUAL (Vercel CLI not installed):** update Vercel env vars then redeploy:
  - `NEXT_PUBLIC_FLOAT_POOL_ADDRESS=0x98bF7f0572f542fBD6365531D39C657779839375`
  - `NEXT_PUBLIC_FLOAT_CORE_ADDRESS=0x336Be2095425ac463c6E121461B68401c3209c85`
  - `DEEPSEEK_API_KEY=<key>` (server-side; required for the assistant)
  - Then `npm i -g vercel && vercel --prod --yes && vercel alias <url> float-arc.vercel.app`
    (or set the vars in the Vercel dashboard and Redeploy). If the GitHub repo is connected to
    Vercel, the master push already triggered a build — just fix the env vars and redeploy.

**✅ Checkpoint 7 [DONE, except Vercel deploy]:** Tests green (34), build clean, AI verified, docs updated, merged to master + tagged v4.0 + pushed. Live deploy is the one remaining manual step (env vars + redeploy) because the Vercel CLI is not installed and v4 code must not be served against stale v3 env-var addresses.

---

## Risk notes & rollback

- **Redeploy resets all on-chain state** (invoices, scores, pool). Acceptable on testnet; seed fresh liquidity after deploy (Phase 5.1).
- **Struct field changes** (`approvedAt`, `amountPaid`) are the most common break: the frontend decode order in `use-my-invoices.ts` MUST match the new `getInvoice` tuple exactly. Verify against the regenerated ABI, not from memory.
- **Anti-Sybil is mitigation, not a cure.** Document in README that production needs real identity (EAS/KYC). The verification gate ships **disabled** so testnet stays frictionless; the permissionless exposure cap is the only layer that could affect usage and defaults to unlimited. Production operators opt in.
- **Rollback:** v3 addresses are recorded in Phase 0. If v4 has a critical bug, point `NEXT_PUBLIC_FLOAT_*_ADDRESS` back to v3 and redeploy frontend; no data migration needed.

## Suggested execution order (dependency-aware)

```
Phase 0 → Phase 1 (baseline)
        → Phase 2 (fixes)  ─┐
        → Phase 3 (ERC20)  ─┼─ all Solidity, same branch
        → Phase 4 (partial)─┘
        → Phase 5 (deploy v4 + frontend)
        → Phase 6 (AI tools, can overlap Phase 5)
        → Phase 7 (QA + ship)
```

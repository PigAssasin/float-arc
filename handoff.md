# Float Handoff Context

## 1. Project Phase
The project has completed **v4** and **v6a**. The current codebase reflects the shipped v6a economics update: fixed public fee schedule, residual return to the seller, fee split across protocol / insurance / LP, and updated tier gates. **v6b** (buyer finance / mode 2) remains intentionally deferred.

## 2. Current Goal
The immediate objective has shifted from implementation to keeping the shipped **v6a** economics aligned across code, docs, and deployment. The current protocol economics are the v6a pool-financed path, while `v6b` stays deferred until explicitly resumed.

## 3. What's Done
- **v6a is reflected in the current codebase and docs** (Core: `0xadAf850c7EA6Bb6c14bD91A41B6B2168A91142bD`, Pool: `0x866Af692C71D9e1d191be551981c546870413484`).
- Tokenized LP position (ERC20 `fLP`) is implemented.
- Partial repayment capability is live.
- DeepSeek AI assistant with live on-chain data querying is integrated.
- Hardhat test suite passes and the Next.js build is clean.

## 4. What's Pending (Work in Progress)
The remaining work is mostly documentation and release hygiene:
- Keep README and submission assets aligned with the shipped v6a economics.
- Decide whether to keep `v6b` dormant in code or remove it entirely before final release.
- If you want a production redeploy or VPS-hosted mirror, that can be handled next.

**v6b (Buyer Finance / Mode 2)** is still deferred until explicitly resumed.

## 5. Architectural Decisions (Locked)
- **Fixed and Public Fee:** Fees are driven by the *buyer's* tier and are fixed, not dynamically adjusting based on utilization.
- **Floating LP APY:** LP returns float with market demand (~8% reference at 50% utilization).
- **Phased Delivery (v6a then v6b):**
  - **Mode 1 (v6a):** Pool-financed. Pool provides the advance, seller has a stake, and fees are split (protocol 10%, insurance 15%, LP 75%).
  - **Mode 2 (v6b - Deferred):** Buyer-financed. Distinct accounting path where the buyer funds the advance upfront. No seller stake is required, and the pool's capital is not exposed.
- **Strict Collateral & Identity:** The system continues to use verification gates (currently soft-enabled on testnet, strict KYC planned for mainnet).

## 6. Important Files for Next Steps
- **`docs/v6-plan.md`:** The source of truth for the economic recalibration parameters and phase logic.
- **`contracts/src/FloatCore.sol`:** Needs updates for tier gates, `_settle` with residual logic, fee field addition, and `adv + f <= A` guard.
- **`contracts/src/FloatPool.sol`:** Needs updates for the new fee/origination accounting and residual payouts.
- **`contracts/test/Float.test.js`:** Needs comprehensive updates for the new cash-flow balance, invariants, and rounding dust checks.

## 7. Git Context
- **Current Branch:** `master`
- **Latest Commit:** `c55a5d9 (HEAD -> master, origin/master) Refine Float invoice financing flow`
- **Status:** Working tree is completely clean. No pending diffs.

# Float Handoff Context

## 1. Project Phase
The project has completed **v4**, **v6a**, and deployed **v6b**. v6b adds buyer finance / mode 2: the buyer funds the advance, skips collateral, and keeps 75% of the fee as a discount while the pool carries no LP exposure.

## 2. Current Goal
The immediate objective is release hygiene: keep docs, GitHub, and production deployment aligned with the shipped v6b contracts.

## 3. What's Done
- **v6b is reflected in the current codebase and docs** (Core: `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`, Pool: `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77`).
- Tokenized LP position (ERC20 `fLP`) is implemented.
- Partial repayment capability is live.
- DeepSeek AI assistant with live on-chain data querying is integrated.
- Hardhat test suite passes and the Next.js build is clean.

## 4. What's Pending (Work in Progress)
The remaining work is optional release polish:
- Run a manual wallet walkthrough on production for pool-financed and buyer-financed paths.
- Update submission assets if the final video or copy changes.
- If you want a VPS-hosted mirror, that can be handled next.

**v6b (Buyer Finance / Mode 2)** is deployed, production-wired, and test-covered.

## 5. Architectural Decisions (Locked)
- **Fixed and Public Fee:** Fees are driven by the *buyer's* tier and are fixed, not dynamically adjusting based on utilization.
- **Floating LP APY:** LP returns float with market demand (~8% reference at 50% utilization).
- **Phased Delivery (v6a then v6b):**
  - **Mode 1 (v6a):** Pool-financed. Pool provides the advance, seller has a stake, and fees are split (protocol 10%, insurance 15%, LP 75%).
  - **Mode 2 (v6b):** Buyer-financed. Distinct accounting path where the buyer funds the advance upfront. No seller stake is required, and the pool's capital is not exposed.
- **Strict Collateral & Identity:** The system continues to use verification gates (currently soft-enabled on testnet, strict KYC planned for mainnet).

## 6. Important Files for Next Steps
- **`docs/v6-plan.md`:** The source of truth for the economic recalibration parameters and phase logic.
- **`contracts/src/FloatCore.sol`:** Needs updates for tier gates, `_settle` with residual logic, fee field addition, and `adv + f <= A` guard.
- **`contracts/src/FloatPool.sol`:** Needs updates for the new fee/origination accounting and residual payouts.
- **`contracts/test/Float.test.js`:** Needs comprehensive updates for the new cash-flow balance, invariants, and rounding dust checks.

## 7. Git Context
- **Current Branch:** `master`
- **Latest Commit:** `c55a5d9 (HEAD -> master, origin/master) Refine Float invoice financing flow`
- **Status:** v6b release changes are ready to commit and push.

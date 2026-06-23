# Float — Project Context & Handoff Document

This document serves as the single source of truth for the Float project. It aggregates all critical context, project state, architectural decisions, and technical details to allow any AI assistant (e.g., Codex, Claude, DeepSeek) to immediately understand the project and continue development.

---

## 1. Project Phase & Current State

The project has completed **v4**, **v6a**, and deployed **v6b**. The current codebase reflects the shipped v6b buyer-finance update on top of v6a economics: fixed public fee schedule, residual return to the seller, fee split across protocol / insurance / LP, updated tier gates, and buyer-financed mode.

**Status: v6b is COMPLETE on Arc Testnet and production Vercel.**
The immediate objective has shifted from implementation to release hygiene and manual production walkthroughs.

### Deployed Contracts v6b (Arc Testnet)
- **Chain ID:** 5042002
- **USDC (Arc Testnet):** `0x3600000000000000000000000000000000000000`
- **FloatPool (fLP):** `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77`
- **FloatCore:** `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`

### What's Done
- **v6b is reflected in the current codebase and docs.**
- Tokenized LP position (ERC20 `fLP`) is implemented.
- Partial repayment capability is live.
- DeepSeek AI assistant with live on-chain data querying is integrated.
- Hardhat test suite passes (29/29) and the Next.js build is clean.

### What's Pending (Work in Progress)
The remaining work is optional release polish:
- Run a manual wallet walkthrough on production for pool-financed and buyer-financed paths.
- Update submission assets if the final video or copy changes.
- Optional: VPS-hosted mirror.

---

## 2. Core Concept & Economics (v6a)

> **Float your invoices. SMEs get paid today, not in 90 days.**

### Three Roles
- **Seller (SME):** Creates invoice → receives 80–90% upfront (based on credit score tier). Receives residual at settlement.
- **Buyer:** Approves invoice, locks collateral, pays 100% of invoice at due date.
- **Investor (LP):** Deposits USDC into pool → earns ~8% reference APY (floats with utilization), holds transferable `fLP`.

### Advance Rate Tiers (calibrated for protocol safety)
| Tier      | Score   | Advance | Stake | Light Collateral | Fee (Buyer tier, per 30d) |
|-----------|---------|---------|-------|------------------|---------------------------|
| New       | 0–40    | 80%     | 5%    | 25%              | 3.0%                      |
| Fair      | 41–70   | 85%     | 4%    | 18%              | 2.2%                      |
| Good      | 71–85   | 88%     | 3%    | 12%              | 1.6%                      |
| Excellent | 86–100  | 90%     | 2%    | 8%               | 1.2%                      |

*Note: Tiers are gated by min paid count (New <2, Fair >=2, Good >=5, Excellent >=12) AND ratio.*

### Settlement & Cash Flow (Mode 1 - Pool Financed)
1. **Lock:** Buyer sends collateral `C` to pool. Pool disburses `adv - st` (advance minus stake) to seller. `st` is recorded.
2. **Pay (Due):** Buyer pays full amount `A`.
   - Return `C` to buyer, return `st` to seller.
   - Fee split: protocol 10%, insurance 15%, **LP 75%**.
   - Residual (`A - adv - fee`) returned to seller.
   - **Seller true cost = fee only.**

### Protocol Safety & Risk Model
- **Three-layer default protection:** Seller stake (slashed first) → Insurance reserve (funded by 15% of fee) → LP buffer.
- **Strict Collateral Floor:** Unverified buyers must post collateral + stake >= advance. Verified buyers keep light tier collateral.
- **Exposure Caps:** Per-buyer and per-seller caps prevent concentration risk.

---

## 3. Architectural Decisions (Locked)

- **Fixed and Public Fee:** Fees are driven by the *buyer's* tier and are fixed, not dynamically adjusting based on utilization.
- **Floating LP APY:** LP returns float with market demand (~8% reference at 50% utilization).
- **Phased Delivery (v6a then v6b):**
  - **Mode 1 (v6a):** Pool-financed. Live now.
  - **Mode 2 (v6b):** Buyer-financed. Distinct accounting path where buyer funds the advance upfront.
- **Verification:** Currently soft-enabled on testnet (instant self-serve). Strict KYC (Didit) + attestor planned for mainnet.

---

## 4. Tech Stack & Infrastructure

- **Blockchain:** Arc Testnet (Chain ID: 5042002) - *100% on Arc, no cross-chain.*
- **Smart Contracts:** Solidity 0.8.20 + Hardhat
- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Wallet:** wagmi v2 + viem + Circle Wallets SDK (`@circle-fin/w3s-pw-web-sdk`)
- **Styling:** Tailwind CSS + custom Prisma Dark palette (`#E1E0CC`, `#DEDBC8`, `#101010`)
- **AI Assistant:** DeepSeek V3 (streaming, context-aware)

---

## 5. Lessons Learned & Development Patterns

### Web3 Frontend
- **On-chain data:** Use `useReadContracts` to batch-read all invoices, filter client-side.
- **Pool stats:** Read `totalAssets()` and `shareValue()` separately. Yield % = `(Number(shareValue) - 1e18) / 1e18 * 100`.
- **Wagmi v2:** Always pass `query: { enabled: count > 0 }` to skip empty batches. Use `useWaitForTransactionReceipt` to show confirmation state after `useWriteContract`.

### Circle Wallet Integration
- `POST /v1/w3s/users` is idempotent (409 = user exists).
- Call `POST /v1/w3s/users/token` to get `userToken` + `encryptionKey` every session.
- Initialize W3SSdk client-side only. Store `userId` in `sessionStorage` for security.

### Design System Rules (Do Not Break)
- **Primary text:** `#E1E0CC` (never pure white)
- **Card background:** `#101010` or `#212121`
- **Accent/primary:** `#DEDBC8`
- No em dashes (—) anywhere in user-facing text.
- UI/Code/Docs in English. Chat with the user in Vietnamese.

---

## 6. Important Files & Git Context

- **`docs/v6-plan.md`:** Source of truth for economic recalibration parameters.
- **`contracts/src/FloatCore.sol`:** Invoice lifecycle, scoring, fee settlement, residual logic.
- **`contracts/src/FloatPool.sol`:** Liquidity pool, stake, insurance, tokenized fLP, residual payouts.
- **Current Git Branch:** `master` (v6b release changes ready to commit and push).
- **Environment files:** Require `CIRCLE_API_KEY`, `NEXT_PUBLIC_CIRCLE_APP_ID`, `DEEPSEEK_API_KEY`.

---
*Generated by Antigravity on 2026-06-23 based on AGENTS.md, README.md, handoff.md, and docs/v6-plan.md.*

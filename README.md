# Float — On-Chain Invoice Factoring

> **Float your invoices. SMEs get paid today, not in 90 days.**

Float is a decentralized invoice factoring protocol on [Arc Testnet](https://arc.network). v6a is the current live economics: small businesses upload invoices, receive an immediate USDC advance, and the seller receives the residual back at settlement. Buyers pay at maturity. Liquidity providers earn yield from a fixed, public fee schedule.

v6b buyer finance remains deferred for now; the shipped flow is the pool-financed v6a path.

**Live demo:** [floatsme.xyz](https://floatsme.xyz) · [float-arc.vercel.app](https://float-arc.vercel.app)

---

## The Problem

SMEs issue invoices with 30-90 day payment terms but need cash to operate today. Traditional invoice factoring is slow, opaque, and requires bank relationships. Blockchain removes the middlemen.

## How It Works

```
Seller creates invoice
        │
        ▼
Pool advances 80–90% immediately ──► Seller receives USDC same block
        │
        ▼
Buyer locks collateral
        │
        ▼
Buyer pays the remaining face value at due date
        │
        ├─► Seller receives stake back
        ├─► Seller receives residual (face - advance - fee)
        ├─► Investor earns 75% of the fee
        └─► Collateral refunded to buyer
```

### Three Roles

| Role | Action | Outcome |
|------|--------|---------|
| **Seller (SME)** | Creates invoice, receives advance | 80–90% upfront, stake returned on buyer payment, residual returned at settlement |
| **Buyer** | Approves invoice, locks collateral, pays at maturity (in full or in installments) | Collateral fully refunded on payment |
| **Investor (LP)** | Deposits USDC into pool, holds transferable `fLP` | Earns the fee yield from every financed invoice |

### Credit Score Tiers

| Tier | Score | Advance Rate | Seller Stake |
|------|-------|-------------|--------------|
| New | 0–40 | 80% | 5% |
| Fair | 41–70 | 85% | 4% |
| Good | 71–85 | 88% | 3% |
| Excellent | 86–100 | 90% | 2% |

Score improves with on-time buyer payments.

### Protocol Safety

Float implements a three-layer default protection model:

1. **Seller stake** — 2-5% withheld from advance, slashed first on default
2. **Insurance reserve** — 15% of every fee funds a reserve capped at 10% of investor assets
3. **LP buffer** — absorbs final gap only after the above are exhausted

Single invoice advance is capped at 20% of pool liquidity to prevent concentration risk.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Arc Testnet (Chain ID 5042002, 1s finality) |
| Smart Contracts | Solidity 0.8.20 + Hardhat |
| Frontend | Next.js 14 (App Router) + TypeScript |
| Wallet | wagmi v2 + viem + Circle Wallets SDK |
| Styling | Tailwind CSS |
| AI Assistant | DeepSeek V3 (streaming, context-aware) |
| Deployment | Vercel |

---

## Smart Contracts

Deployed on Arc Testnet:

| Contract | Address |
|----------|---------|
| FloatPool (ERC20 `fLP`) | `0x866Af692C71D9e1d191be551981c546870413484` |
| FloatCore | `0xadAf850c7EA6Bb6c14bD91A41B6B2168A91142bD` |
| USDC | `0x3600000000000000000000000000000000000000` |

### FloatCore

Manages the full invoice lifecycle:

- `createInvoice(buyer, amount, dueDate)` — seller creates invoice
- `approveInvoice(id)` — buyer approves
- `lockCollateral(id)` — buyer locks collateral, pool funds advance
- `payInvoice(id)` — buyer repays the remaining balance; no early-payment discount in v6a
- `payPartial(id, amount)` — buyer repays in installments; auto-settles at face value
- `markDefault(id)` — anyone can call after grace period expires
- `sellerScore(address)` / `sellerAdvanceBps(address)` / `sellerStakeBps(address)` — credit system
- `buyerFeeBpsPer30d(address)` / `feeBpsForTerm(address, termSeconds)` — fixed public fee schedule

Production anti-Sybil hooks ship disabled by default (frictionless on testnet): an
optional verification gate, per-seller and per-buyer exposure caps, both operator-controlled.

### FloatPool

A tokenized vault: LP shares are a transferable ERC20 (`Float LP` / `fLP`, 6 decimals),
so investors can move or trade their position without waiting for pool liquidity. It tracks
four asset buckets:

- **Investor assets** — available for advances
- **Locked collateral** — held during invoice lifecycle
- **Seller stakes** — held until payment or default
- **Insurance reserve** — built from 1% of repayments, capped at 10% of investor assets

A minimum first deposit plus permanently-locked dead shares neutralize the classic
ERC4626 inflation/donation attack.

---

## Running Locally

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in: CIRCLE_API_KEY, NEXT_PUBLIC_CIRCLE_APP_ID, DEEPSEEK_API_KEY

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Compile & Deploy Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network arc_testnet
```

---

## Project Structure

```
src/
  app/
    app/
      seller/     — Invoice creation, advance preview, stale invoice management
      buyer/      — Invoice approval, collateral flow, repayment
      investor/   — Pool deposit/withdraw, yield tracking
    api/
      chat/       — DeepSeek streaming AI assistant
      circle/     — Circle Wallets integration
  components/
    shared/
      FloatAssistant.tsx   — AI chat widget
      WrongNetworkBanner   — Chain detection + auto-switch
    dashboard/
      DashboardNav         — Top navigation
      CreditScoreBadge     — On-chain score display
      InvoiceTable         — Invoice list with status
  hooks/
    use-my-invoices.ts     — On-chain invoice fetching (wagmi)
  lib/
    contracts.ts           — ABIs and deployed addresses
    wagmi-config.ts        — Arc Testnet chain config

contracts/
  src/
  FloatCore.sol          — Invoice lifecycle, credit scoring, fixed fee settlement
  FloatPool.sol          — Liquidity pool, stake, insurance, tokenized fLP
```

---

## Environment Variables

```env
# Circle Wallets (user-controlled, PIN-secured)
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=

# DeepSeek AI (Float Assistant)
DEEPSEEK_API_KEY=

# Deployer (contracts only, never in frontend)
DEPLOYER_PRIVATE_KEY=
```

---

## Hackathon

Built for **The Stablecoin Commerce Stack Challenge** (Ignyte x Circle x Arc)
Track 2 — SME Trade Finance and Working Capital

**Key integrations:**
- Arc Testnet — native USDC, 1-second finality, no MetaMask required
- Circle Wallets SDK — PIN-based wallets for non-crypto-native SMEs
- DeepSeek V3 — AI assistant with on-chain function calling (reads live pool, score, and invoice data)

**Highlights:**
- Tokenized LP position (`fLP` ERC20) — exit or compose without waiting for liquidity
- Installment repayment — buyers pay invoices in tranches
- Three-layer default protection (seller stake → fee-funded insurance reserve → LP buffer)
- 25 passing contract tests covering residual settlement, exposure caps, partial repayment, and a pool solvency invariant

---

## License

MIT

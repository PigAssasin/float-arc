# Float — On-Chain Invoice Factoring

> **Float your invoices. SMEs get paid today, not in 90 days.**

Float is a decentralized invoice factoring protocol on [Arc Testnet](https://arc.network). Small businesses upload invoices and receive an immediate USDC advance. Buyers pay at maturity. Liquidity providers earn yield on every advance.

**Live demo:** [float-arc.vercel.app](https://float-arc.vercel.app)

---

## The Problem

SMEs issue invoices with 30-90 day payment terms but need cash to operate today. Traditional invoice factoring is slow, opaque, and requires bank relationships. Blockchain removes the middlemen.

## How It Works

```
Seller creates invoice
        │
        ▼
Pool advances 75–88% immediately ──► Seller receives USDC same block
        │
        ▼
Buyer locks collateral
        │
        ▼
Buyer pays 100% at due date
        │
        ├─► Seller receives stake back
        ├─► Investor earns spread
        └─► Collateral refunded to buyer
```

### Three Roles

| Role | Action | Outcome |
|------|--------|---------|
| **Seller (SME)** | Creates invoice, receives advance | 75–88% upfront, stake returned on buyer payment |
| **Buyer** | Approves invoice, locks collateral, pays at maturity | Collateral fully refunded on payment |
| **Investor (LP)** | Deposits USDC into pool | Earns 12–25% spread from every advance |

### Credit Score Tiers

| Tier | Score | Advance Rate | Seller Stake |
|------|-------|-------------|--------------|
| New | 0–40 | 75% | 10% |
| Fair | 41–70 | 80% | 8% |
| Good | 71–85 | 84% | 6% |
| Excellent | 86–100 | 88% | 5% |

Score improves with on-time buyer payments.

### Protocol Safety (v3)

Float v3 implements a three-layer default protection model:

1. **Seller stake** — 5-10% withheld from advance, slashed first on default
2. **Insurance reserve** — 1% of every repayment builds a reserve fund that covers LP shortfall
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
| FloatPool | `0x1b643E7C7B640fc17F64D652fb4B3490c60D9819` |
| FloatCore | `0xc8934c61A580290fC63a374CEF4B4e03366930C9` |
| USDC | `0x3600000000000000000000000000000000000000` |

### FloatCore

Manages the full invoice lifecycle:

- `createInvoice(buyer, amount, dueDate)` — seller creates invoice
- `approveInvoice(id)` — buyer approves
- `lockCollateral(id)` — buyer locks collateral, pool funds advance
- `payInvoice(id)` — buyer repays, stake and collateral returned
- `markDefault(id)` — anyone can call after grace period expires
- `sellerScore(address)` / `sellerAdvanceBps(address)` — credit system

### FloatPool

ERC4626-style vault managing four asset buckets:

- **Investor assets** — available for advances
- **Locked collateral** — held during invoice lifecycle
- **Seller stakes** — held until payment or default
- **Insurance reserve** — built from 1% of repayments

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
    FloatCore.sol          — Invoice lifecycle, credit scoring
    FloatPool.sol          — Liquidity pool, stake, insurance
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
- DeepSeek V3 — context-aware AI assistant with live on-chain data

---

## License

MIT

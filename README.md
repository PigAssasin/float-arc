# Float - On-Chain Invoice Factoring

> Float your invoices. SMEs get paid today, not in 90 days.

Float is a decentralized invoice factoring protocol for SME working capital on Arc Testnet.
Sellers create invoices and receive USDC upfront. Buyers repay at maturity. Investors provide
pool liquidity and earn fee yield through transferable `fLP` shares.

The live contracts support two funding paths. In the standard path, the pool advances capital
after the buyer locks collateral. In the buyer-financed path, the buyer funds the seller's advance
directly and keeps 75% of the invoice fee as a discount. That second path lets an invoice move
forward even when pool liquidity is limited, without putting LP capital at risk for that invoice.

**Live demo:** [floatsme.xyz](https://floatsme.xyz)

---

## Current Status

- **Production frontend:** deployed on Vercel at [floatsme.xyz](https://floatsme.xyz)
- **Network:** Arc Testnet, chain ID `5042002`
- **Contracts:** live contracts deployed and wired into frontend
- **Tests:** 29 passing Hardhat tests
- **Build:** Next.js production build passes

| Contract | Address |
|----------|---------|
| FloatPool, ERC20 `fLP` | `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77` |
| FloatCore | `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637` |
| USDC on Arc Testnet | `0x3600000000000000000000000000000000000000` |

---

## Why Float Exists

SMEs often wait 30 to 90 days to get paid, even after delivering goods or services. Traditional
invoice factoring can be slow, opaque, paperwork-heavy, and inaccessible for small businesses.

Float turns invoice financing into an on-chain workflow:

1. A seller creates an invoice.
2. The buyer approves it.
3. The seller receives an upfront USDC advance.
4. The buyer repays at maturity.
5. Investors earn fee yield for supplying liquidity.

The result is faster working capital for SMEs, transparent risk controls for LPs, and a simpler
repayment experience for buyers.

---

## The Two Funding Modes

### Mode 1: Standard Pool Finance

This is the normal invoice factoring path.

1. Seller creates an invoice.
2. Buyer approves the invoice and locks collateral.
3. FloatPool advances 80% to 90% of the invoice face value to the seller.
4. Buyer repays the invoice at maturity.
5. Seller receives the residual amount back.
6. Buyer receives collateral back.
7. LPs earn 75% of the invoice fee.

Best for:

- Sellers who want immediate liquidity.
- Buyers who prefer collateral instead of funding the seller upfront.
- LPs who want fee yield from invoice financing demand.

### Mode 2: Buyer Finance

This path lets the buyer fund the advance directly.

1. Seller creates an invoice.
2. Buyer approves it.
3. Buyer funds the seller's advance directly.
4. Pool capital is not exposed to this invoice.
5. Buyer repays the remaining amount at maturity.
6. Buyer keeps 75% of the fee as a discount.

Best for:

- Buyers who want a cheaper total repayment.
- Invoices that should not depend on pool liquidity.
- Safer demos where LP capital should not take risk.

In Buyer Finance mode, a default creates **zero LP loss** because the buyer already funded the
advance.

---

## Economics

### Seller Advance Tiers

| Tier | Score | Advance | Seller Stake | Verified Buyer Collateral |
|------|-------|---------|--------------|---------------------------|
| New | 0-40 | 80% | 5% | 25% |
| Fair | 41-70 | 85% | 4% | 18% |
| Good | 71-85 | 88% | 3% | 12% |
| Excellent | 86-100 | 90% | 2% | 8% |

Score tiers also require enough paid invoice history:

- Fair: at least 2 paid invoices and 60% paid ratio
- Good: at least 5 paid invoices and 80% paid ratio
- Excellent: at least 12 paid invoices and 95% paid ratio

### Buyer Fee Schedule

Fees are fixed, public, and based on the buyer's payment history.

| Buyer Tier | Fee per 30 days |
|------------|-----------------|
| New | 3.0% |
| Fair | 2.2% |
| Good | 1.6% |
| Excellent | 1.2% |

Fee cap: 8% of invoice face value.

### Fee Split

Mode 1, Pool Finance:

- 10% protocol
- 15% insurance reserve
- 75% LP yield

Mode 2, Buyer Finance:

- 10% protocol
- 15% insurance reserve
- 75% buyer discount

---

## Protocol Safety

Float uses several layers of protection:

- Seller stake is withheld from the advance and slashed first on default.
- Buyer collateral protects pool-financed invoices.
- Insurance reserve is funded by 15% of invoice fees.
- Per-buyer and per-seller exposure caps limit concentration risk.
- Strict collateral mode is enabled by default for unverified buyers.
- Buyer Finance mode removes LP exposure entirely for that invoice.

Testnet verification is intentionally frictionless for demo purposes. Mainnet verification is planned
to use real KYC and a dedicated attestor key.

## Verification roadmap

Verification is the most important trust layer in Float's risk model.

Without strong verification, the protocol can only protect itself with economics:

- heavy collateral for unverified buyers
- seller stake
- exposure caps
- insurance reserve

That is enough to make fake invoices unattractive in strict mode, but it is not enough to justify
light collateral for buyers who look "trusted" only because they clicked a demo button.

### What testnet does today

The `/api/verify` route is intentionally simple. It marks an address as verified on demand so the
demo can show both collateral paths without forcing users through a real KYC flow.

This is useful for product demos, but it should not be treated as a real anti-collusion control.

### What production should do

Production verification should prove that the buyer and seller are real, separate business
identities before they receive any lighter collateral treatment.

Recommended flow:

1. Create a hosted KYC session with Didit for the applicant.
2. Collect legal business details and beneficial owner details off-chain.
3. Wait for an approved KYC result and webhook confirmation.
4. Run AML or sanctions screening before granting trusted status.
5. Have a dedicated attestor service sign `setVerified`, not the owner key.
6. Keep an internal record linking each verified on-chain address to the off-chain identity.
7. Refuse or revoke trusted status if buyer and seller resolve to the same entity or beneficial owner.

### Verification goals

A good verification system for Float should answer four questions:

1. Is this a real legal entity?
2. Does this wallet belong to that entity?
3. Is the buyer a different entity from the seller?
4. Can the protocol revoke or expire trust if the risk profile changes?

### Recommended policy

- Unverified buyers stay in strict collateral mode.
- Verified buyers unlock light collateral only after identity approval.
- Buyer-financed mode can stay open because it does not expose LP capital.
- Trust should be revocable, renewable, and tied to an attestor service with minimal privileges.

### Nice-to-have later

- Expiry timestamps for verification status
- Separate verification levels for buyer and seller
- Manual review queue for higher invoice sizes
- Compliance event logs for every trust decision
- Shared-ownership checks to catch buyer and seller controlled by the same people
- A public Dune dashboard for detailed pool analytics, invoice cohorts, yield breakdowns, and financing-mode trends

---

## Core Contracts

### FloatCore

Handles invoice lifecycle, scoring, financing mode, repayment, and default logic.

Important functions:

- `createInvoice(buyer, amount, dueDate)` - seller creates an invoice
- `approveInvoice(id)` - buyer approves the invoice
- `lockCollateral(id)` - buyer uses standard pool-financed mode
- `financeAsBuyer(id)` - buyer uses buyer-financed mode
- `payInvoice(id)` - buyer settles the invoice
- `payPartial(id, amount)` - buyer makes installments in pool-financed mode only
- `markDefault(id)` - anyone can mark default after grace period

### FloatPool

Holds investor liquidity, collateral, seller stakes, and insurance reserves. LP positions are ERC20
shares named `Float LP` with symbol `fLP`.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Blockchain | Arc Testnet |
| Contracts | Solidity 0.8.20, Hardhat |
| Frontend | Next.js 14 App Router, TypeScript |
| Wallet | wagmi v2, viem, Circle Wallets SDK |
| Styling | Tailwind CSS |
| AI Assistant | DeepSeek V3 |
| Deployment | Vercel |

---

## Project Structure

```text
src/
  app/
    app/
      seller/      Seller dashboard and invoice creation
      buyer/       Buyer approval, finance, collateral, repayment
      investor/    LP deposit, withdraw, and pool stats
    api/
      chat/        AI assistant API
      circle/      Circle Wallets integration
      verify/      Testnet verification route
  components/
    landing/       Public landing page sections
    shared/        Shared UI and assistant components
  hooks/           On-chain data hooks
  lib/             ABI, addresses, wagmi, and RPC helpers

contracts/
  src/
    FloatCore.sol  Invoice lifecycle and settlement logic
    FloatPool.sol  Liquidity pool and fLP shares
  test/
    Float.test.js  contract tests
  scripts/
    deploy.js      Arc Testnet deployment
    seed.js        Pool seeding helper
    gen-abi.js     ABI/address generation
```

---

## Running Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

```env
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=
DEEPSEEK_API_KEY=
DEPLOYER_PRIVATE_KEY=
```

Open [http://localhost:3000](http://localhost:3000).

---

## Tests and Build

Frontend:

```bash
npm run build
```

Contracts:

```bash
cd contracts
npm install
npx hardhat test
```

Deploy contracts:

```bash
cd contracts
npx hardhat run scripts/deploy.js --network arc_testnet
```

Deploy frontend:

```bash
vercel --prod --yes
```

---

## Hackathon Context

Built for **The Stablecoin Commerce Stack Challenge** by Ignyte, Circle, and Arc.

Track: **SME Trade Finance and Working Capital**

Key integrations:

- Arc Testnet for stablecoin settlement
- Circle Wallets SDK for PIN-secured user-controlled wallets
- DeepSeek V3 assistant with live on-chain context
- Vercel production deployment

Highlights:

- Buyer Finance mode
- Tokenized LP shares with `fLP`
- Fixed, public fee schedule
- Residual repayment to sellers
- Installment repayment for pool-financed invoices
- Three-layer default protection
- 29 passing contract tests

---

## License

MIT

# Float submission document

## Project

**Float**

Tagline: Float your invoices. SMEs get paid today, not in 90 days.

Track: SME Trade Finance and Working Capital

Live app: https://floatsme.xyz

GitHub: https://github.com/PigAssasin/float-arc

## Summary

Float is an on-chain invoice financing app for small and medium businesses. A seller creates an
invoice, the buyer approves it, and the seller receives a USDC advance before the invoice is due.
The buyer repays later. Investors can deposit USDC into FloatPool and earn fee yield through
transferable `fLP` shares.

The current contracts support two funding paths:

- Standard pool finance: the buyer locks collateral, the pool funds the seller, and LPs earn 75%
  of the invoice fee.
- Buyer-financed mode: the buyer funds the seller's advance directly and keeps 75% of the fee as
  a discount. Pool capital is not exposed to that invoice.

## Why it matters

SMEs often wait 30 to 90 days to get paid. That delay can block payroll, inventory, hiring, and
growth. Traditional invoice factoring is slow and paperwork heavy. Float turns the flow into a
transparent on-chain process with predictable pricing and fast USDC settlement.

## Products used

### Arc Testnet

- Chain ID: `5042002`
- USDC is the settlement asset and gas token.
- Float runs only on Arc Testnet.
- Standard EVM tooling works: Solidity, Hardhat, viem, and wagmi.

### Circle wallets

- SDK: `@circle-fin/w3s-pw-web-sdk`
- Wallet type: user-controlled, PIN-secured EOA
- App ID: `f06cb713-a2a3-57d2-9662-13607ec5f12f`
- Integration routes:
  - `POST /api/circle/init-user`
  - `GET /api/circle/wallets`
  - `POST /api/circle/create-wallet`
  - `POST /api/circle/execute-contract`

### USDC

All invoice amounts, advances, collateral, repayments, investor deposits, and withdrawals use
Arc Testnet USDC:

`0x3600000000000000000000000000000000000000`

## Live contracts

| Contract | Address |
|----------|---------|
| FloatCore | `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637` |
| FloatPool, ERC20 `fLP` | `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77` |
| USDC | `0x3600000000000000000000000000000000000000` |

## User flows

### Seller

1. Connect wallet.
2. Enter buyer address, invoice amount, and due date.
3. Create invoice.
4. Wait for buyer approval and funding.
5. Receive the advance.
6. Receive the residual when the buyer settles.

### Buyer

1. Connect the wallet named by the seller.
2. Review the invoice.
3. Approve or reject it.
4. Choose standard collateral mode or buyer-financed mode.
5. Repay at or before the due date.

### Investor

1. Connect wallet.
2. Deposit USDC into FloatPool.
3. Receive `fLP` shares.
4. Earn fee yield when pool-financed invoices settle.
5. Withdraw by redeeming `fLP` for USDC.

## Economics

Seller advance tiers:

| Tier | Score | Advance | Seller stake | Verified buyer collateral |
|------|-------|---------|--------------|---------------------------|
| New | 0-40 | 80% | 5% | 25% |
| Fair | 41-70 | 85% | 4% | 18% |
| Good | 71-85 | 88% | 3% | 12% |
| Excellent | 86-100 | 90% | 2% | 8% |

Buyer fee schedule:

| Buyer tier | Fee per 30 days |
|------------|-----------------|
| New | 3.0% |
| Fair | 2.2% |
| Good | 1.6% |
| Excellent | 1.2% |

Fee cap: 8% of invoice face value.

## Safety model

- Seller stake is withheld from the advance in pool-financed mode.
- Buyer collateral protects pool-financed invoices.
- Insurance reserve receives 15% of each fee.
- Per-seller and per-buyer exposure caps limit concentration risk.
- Strict collateral mode applies to unverified buyers.
- Buyer-financed invoices create zero LP loss because the buyer funds the advance directly.

## Technical stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Contracts | Solidity 0.8.20, Hardhat, OpenZeppelin |
| Wallets | wagmi v2, viem, Circle Wallets SDK |
| AI assistant | DeepSeek V3 with live on-chain reads |
| Hosting | Vercel |

## What is working now

- Seller dashboard
- Buyer dashboard
- Investor dashboard
- Standard pool-financed invoices
- Buyer-financed invoices
- Partial repayments for pool-financed invoices
- fLP deposits, withdrawals, and share value reads
- Circle wallet connection
- AI assistant with live pool, score, and invoice context
- Production deployment at https://floatsme.xyz

## Test status

- Hardhat contract tests: 29 passing
- Next.js production build: passing

## Notes

Float is a hackathon prototype running on testnet. The contracts use OpenZeppelin libraries,
custom errors, ReentrancyGuard, exposure caps, and strict collateral settings, but they have not
gone through a formal external audit.

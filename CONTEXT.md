# Float Project Context

This file is a compact source of truth for continuing the Float project.

## One Sentence

Float lets SMEs receive USDC advances against approved invoices, while buyers repay later and
investors earn transparent fee yield through an on-chain liquidity pool.

## Live State

- Version: current live contracts
- Production URL: https://floatsme.xyz
- Network: Arc Testnet
- Chain ID: `5042002`
- FloatPool: `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77`
- FloatCore: `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`
- USDC: `0x3600000000000000000000000000000000000000`
- Test status: 29 passing Hardhat tests
- Build status: Next.js production build passes

## Product Concept

Float has three user roles:

- Seller: creates an invoice and receives an upfront advance.
- Buyer: approves and repays the invoice.
- Investor: deposits USDC into FloatPool and receives transferable `fLP` shares.

The seller's true cost is the invoice fee. The seller receives the advance first, then receives the
residual at settlement.

## Funding modes

### Mode 1: Pool Finance

- Buyer locks collateral.
- Pool advances capital to the seller.
- Buyer repays at maturity.
- Fee split: 10% protocol, 15% insurance, 75% LP yield.
- Partial payments are allowed and settle once the invoice face value is reached.

### Mode 2: Buyer Finance

- Buyer funds the seller's advance directly.
- Pool capital is not exposed.
- Buyer receives 75% of the fee as a discount.
- Fee split: 10% protocol, 15% insurance, 75% buyer discount.
- Partial payments are disabled.
- Default produces zero LP loss.

## Economics

Seller tiers:

| Tier | Score | Advance | Stake | Verified buyer collateral |
|------|-------|---------|-------|---------------------------|
| New | 0-40 | 80% | 5% | 25% |
| Fair | 41-70 | 85% | 4% | 18% |
| Good | 71-85 | 88% | 3% | 12% |
| Excellent | 86-100 | 90% | 2% | 8% |

Buyer fee schedule:

| Tier | Fee per 30 days |
|------|-----------------|
| New | 3.0% |
| Fair | 2.2% |
| Good | 1.6% |
| Excellent | 1.2% |

Fee cap: 8% of invoice face value.

## Architecture

- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS.
- Wallet: wagmi v2, viem, Circle Wallets SDK.
- Contracts: Solidity 0.8.20, Hardhat.
- AI: DeepSeek V3 assistant with live on-chain context.
- Deployment: Vercel.

## Important Files

- `README.md` - public GitHub overview.
- `handoff.md` - short handoff for the next agent.
- `docs/v6-plan.md` - detailed economic plan and checklist.
- `contracts/src/FloatCore.sol` - invoice lifecycle and buyer-financed mode logic.
- `contracts/src/FloatPool.sol` - liquidity pool and fLP shares.
- `contracts/test/Float.test.js` - contract test suite.
- `src/lib/contracts.ts` - deployed addresses and ABI.
- `src/hooks/use-my-invoices.ts` - invoice reads.
- `src/hooks/use-app-wallet.ts` - browser wallet and Circle wallet merge logic.
- `src/app/app/buyer/page.tsx` - buyer collateral, buyer finance, and repayment UI.

## Development Rules

- Keep the app Arc-only.
- Keep code, UI text, docs, and commit messages in English.
- Chat with the user in Vietnamese.
- Do not commit `.env` files, private keys, mnemonics, or secrets.
- Use `viem` and wagmi patterns already present in the repo.
- Treat the addresses above as the current deployed contracts.

## Useful Commands

```bash
npm run build
```

```bash
cd contracts
npx hardhat test
```

```bash
cd contracts
npx hardhat run scripts/deploy.js --network arc_testnet
```

```bash
vercel --prod --yes
```

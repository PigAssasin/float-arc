# Float Handoff

This is the short project handoff for the next AI assistant or developer.

## Status

Float is live with **v6b**.

- Production: https://floatsme.xyz
- Network: Arc Testnet, chain ID `5042002`
- FloatPool: `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77`
- FloatCore: `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`
- USDC: `0x3600000000000000000000000000000000000000`
- Tests: 29 passing Hardhat tests
- Frontend: Next.js production build passes

## What v6b Adds

v6b adds **Buyer Finance**, also called mode 2.

Mode 1, Pool Finance:

- Buyer locks collateral.
- FloatPool advances capital to the seller.
- Buyer repays at maturity.
- LPs earn 75% of the fee.

Mode 2, Buyer Finance:

- Buyer funds the seller's advance directly.
- Pool capital is not exposed.
- Buyer keeps 75% of the fee as a discount.
- Partial payments are disabled for this mode.
- Default creates zero LP loss.

## Important Files

- `README.md` - GitHub-facing project overview.
- `docs/v6-plan.md` - full economic plan and implementation checklist.
- `contracts/src/FloatCore.sol` - invoice lifecycle and v6b mode logic.
- `contracts/src/FloatPool.sol` - pool accounting, fLP shares, collateral, stakes, insurance.
- `contracts/test/Float.test.js` - v6 and v6b test coverage.
- `src/lib/contracts.ts` - deployed addresses and ABI used by the frontend.
- `src/app/app/buyer/page.tsx` - buyer dashboard, collateral mode, buyer finance mode, repayment.
- `src/app/api/circle/execute-contract/route.ts` - Circle contract execution allowlist.

## Current Release State

Completed:

- v6b contracts deployed to Arc Testnet.
- Pool seeded after deployment.
- Frontend wired to v6b addresses.
- Vercel production deployed.
- GitHub updated with v6b release commit.
- README and handoff docs rewritten for clarity.

Optional next work:

- Manual production wallet walkthrough with seller, buyer, and investor wallets.
- Submission video and screenshot polish.
- Optional VPS mirror if needed.
- Mainnet KYC design with a dedicated attestor key.

## Rules To Preserve

- App is Arc-only.
- Code, UI text, and docs are English.
- Chat with the user in Vietnamese.
- Never commit `.env` files or private keys.
- Use `viem` for reads and wagmi hooks for React contract state.
- Keep user-facing text simple and avoid hidden financial promises.
- LP APY is a floating reference, not a guarantee.

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

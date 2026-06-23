# Float - Stablecoin Commerce Stack Challenge

## Hackathon context

- Event: The Stablecoin Commerce Stack Challenge by Ignyte, Circle, and Arc
- Track: SME Trade Finance and Working Capital
- Deadline: Mon Jul 13 2026
- Submission URL: https://app.ignyte.ae/public/challenges/4B436318-C737-F111-9A49-6045BD14D400

## Product

Float helps SMEs get paid sooner on approved invoices.

- Sellers create invoices and receive an 80-90% USDC advance.
- Buyers approve invoices and repay at maturity.
- Investors deposit USDC into FloatPool and earn fee yield through `fLP` shares.
- Buyer-financed mode lets the buyer fund the advance directly and keep 75% of the fee as a discount.

## Live deployment

- Production: https://floatsme.xyz
- Network: Arc Testnet
- Chain ID: `5042002`
- USDC: `0x3600000000000000000000000000000000000000`
- FloatPool: `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77`
- FloatCore: `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`

## Economics

| Tier | Score | Advance | Seller stake | Verified buyer collateral |
|------|-------|---------|--------------|---------------------------|
| New | 0-40 | 80% | 5% | 25% |
| Fair | 41-70 | 85% | 4% | 18% |
| Good | 71-85 | 88% | 3% | 12% |
| Excellent | 86-100 | 90% | 2% | 8% |

Buyer fees are fixed and public:

- New: 3.0% per 30 days
- Fair: 2.2% per 30 days
- Good: 1.6% per 30 days
- Excellent: 1.2% per 30 days
- Fee cap: 8% of invoice face value

Pool-financed fee split:

- 10% protocol
- 15% insurance reserve
- 75% LP yield

Buyer-financed fee split:

- 10% protocol
- 15% insurance reserve
- 75% buyer discount

## Verification roadmap

Testnet uses instant self-serve verification through `/api/verify` so the demo can show both collateral modes without real KYC.

Mainnet should use real KYC through Didit:

- Create KYC session.
- Send the user through hosted KYC.
- Process webhook decision.
- Call `setVerified` only after approval.
- Use a dedicated attestor key, not the owner key.
- Verify buyer and seller as separate real identities.

## Circle integration

- `CIRCLE_API_KEY` lives in `.env.local` and Vercel environment variables.
- `NEXT_PUBLIC_CIRCLE_APP_ID` is `f06cb713-a2a3-57d2-9662-13607ec5f12f`.
- Flow: `/api/circle/init-user`, `/api/circle/wallets`, W3S SDK initialization, PIN challenge.
- SDK: `@circle-fin/w3s-pw-web-sdk`.

## Stack

- Blockchain: Arc Testnet
- Frontend: Next.js 14 App Router and TypeScript
- Wallet: wagmi v2, viem, Circle Wallets SDK
- Styling: Tailwind CSS with the Prisma Dark palette
- Contracts: Solidity 0.8.20 and Hardhat
- Hosting: Vercel

## Lessons learned

- Use `invoiceCount()` and `useReadContracts` to batch-read invoices at hackathon scale.
- Filter invoices client side by buyer or seller address.
- Use `query: { enabled: count > 0 }` to skip empty wagmi reads.
- Use `useWaitForTransactionReceipt` after writes.
- Store Circle `userId` in `sessionStorage`, not `localStorage`.
- Call `POST /v1/w3s/users/token` every session to get a fresh `userToken` and `encryptionKey`.

## Design rules

- Primary text: `#E1E0CC`
- Card background: `#101010` or `#212121`
- Accent: `#DEDBC8`
- Do not use pure white for main text.
- Do not use em dashes or en dashes in user-facing text.
- Keep code, UI, and docs in English.
- Chat with the user in Vietnamese.

## Arc rules

- App is Arc-only.
- wagmi config must only include `arcTestnet`.
- Verify Arc addresses, ABI, and SDK details through Arc MCP when the tool is available.

## Code rules

- Never commit private keys, mnemonics, or `.env` files.
- Use `viem` for on-chain reads.
- Use wagmi hooks for React contract state.
- Handle wallet errors gracefully.
- Components use `PascalCase.tsx`.
- Hooks use `use-kebab-case.ts`.
- Contracts use `PascalCase.sol`.

## Git

- Commit messages follow `type(scope): message`.
- Never force-push to `main`.

# Float — Stablecoin Commerce Stack Challenge

## Hackathon Context
- **Event:** The Stablecoin Commerce Stack Challenge (Ignyte x Circle x Arc)
- **Track:** Track 2 — SME Trade Finance & Working Capital
- **Prize:** 1st: 5,000 USDC / 2nd: 3,000 USDC
- **Deadline:** Mon Jul 13 2026
- **Submission URL:** https://app.ignyte.ae/public/challenges/4B436318-C737-F111-9A49-6045BD14D400

## App: Float
> Float your invoices. SMEs get paid today, not in 90 days.

### Core Concept (final numbers)
- **Seller (SME):** Creates invoice → receives 80–90% advance (based on credit score tier and paid-count gates)
- **Buyer:** Pays 100% of invoice at due date (7-day grace period)
- **Investor:** Deposits USDC into pool → earns 75% of invoice fees
- **Recourse model:** Seller is liable if buyer defaults. Score drops, future rates restricted.

### Advance Rate Tiers (calibrated for protocol safety)
| Tier      | Score   | Advance | Pool buffer |
|-----------|---------|---------|-------------|
| New       | 0–40    | 80%     | 20%         |
| Fair      | 41–70   | 85%     | 15%         |
| Good      | 71–85   | 88%     | 12%         |
| Excellent | 86–100  | 90%     | 10%         |

### Deployed Contracts v6b (Arc Testnet)
- **FloatPool:** `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77` (ERC20 "Float LP" / fLP)
- **FloatCore:** `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`
- **v6b (buyer finance + v6a economics):** advance 80/85/88/90%, stake 5/4/3/2%, light collateral 25/18/12/8%;
  explicit term-scaled **fee** (buyer tier 3.0/2.2/1.6/1.2% per 30d, cap 8%) is the seller's only cost;
  seller gets the **residual** (face - advance - fee) back at settlement; fee split protocol 10% /
  insurance 15% / LP 75%; tiers gated by min paid count (2/5/12) + ratio; no early-repay discount.
  Adds buyer-financed mode where the buyer funds the advance and keeps 75% of the fee as a discount.
  Carries v5 strict collateral + per-buyer cap. 29/29 Hardhat tests pass. See `docs/v6-plan.md`.
- **Prev (v5):** Pool `0xb3a8EfC83aF7Bf598da7038D12341CC31B48e312`, Core `0xF13958B95E6D1E80362E2a5A9F41390bB88ece14`
- **USDC (Arc Testnet):** `0x3600000000000000000000000000000000000000`
- **Chain ID:** 5042002
- **v5 changes (Protocol Safety):** strict collateral floor ON by default
  (`strictCollateralEnabled`): an UNVERIFIED buyer must post collateral + stake >= advance,
  driving default shortfall to zero and making fake/collusion invoices unprofitable.
  Verified buyers keep light tier collateral. Plus per-buyer exposure cap
  (`maxOutstandingPerBuyer`). Verify path: `/api/verify` (attestor signs `setVerified`),
  `VerifyBadge` on buyer dashboard. 40/40 Hardhat tests pass.
- **Prev (v4):** Pool `0x98bF7f0572f542fBD6365531D39C657779839375`, Core `0x336Be2095425ac463c6E121461B68401c3209c85`

### Verification roadmap
- **Testnet (now):** `/api/verify` does instant self-serve verify (no real KYC) so the two
  collateral modes are demoable. Signs `setVerified` with the owner key (testnet only).
- **Mainnet (planned, NOT built yet):** real KYC via **Didit** (`x-api-key`, create-session →
  hosted KYC → webhook/decision → `setVerified` only on Approved), signed by a dedicated
  minimally-funded attestor (not the owner key). **Both buyer AND seller must be KYC-verified
  as distinct real identities** — this is the anti-collusion guarantee (a seller cannot also be
  their own buyer). Optionally layer Circle Compliance (AML address screening) once granted
  access (eligible-customers only). Decision: defer Didit to mainnet; testnet stays instant.

### Circle Integration
- **Circle API Key:** stored in `.env.local` as `CIRCLE_API_KEY`
- **Circle App ID:** `f06cb713-a2a3-57d2-9662-13607ec5f12f` (stored as `NEXT_PUBLIC_CIRCLE_APP_ID`)
- **Flow:** POST `/api/circle/init-user` → GET `/api/circle/wallets` → init W3SSdk → PIN challenge
- **SDK:** `@circle-fin/w3s-pw-web-sdk` — User-Controlled Wallets, PIN-secured EOA

### Production URL
- **Live:** https://floatsme.xyz (primary, canonical)
- **Deploy:** `vercel --prod --yes` — floatsme.xyz auto-updates (no manual alias needed)

## Stack
- Blockchain: Arc Testnet (Chain ID: 5042002)
- Frontend: Next.js 14 (App Router) + TypeScript
- Wallet: wagmi v2 + viem + Circle Wallets SDK
- Styling: Tailwind CSS + custom Prisma Dark palette (`#E1E0CC`, `#DEDBC8`, `#101010`)
- Contracts: Solidity 0.8.20 + Hardhat

## Lessons Learned Building Float

### On-chain data without an indexer
- Use `invoiceCount()` then batch-read all invoices with `useReadContracts`
- Filter client-side by buyer/seller address — works fine at hackathon scale
- For production: need a subgraph or event indexer

### wagmi v2 patterns that work
- `useReadContract` for single reads, `useReadContracts` for batch
- Always pass `query: { enabled: count > 0 }` to skip empty batches
- `useWaitForTransactionReceipt` to show confirmation state after write
- `useWriteContract` → get `hash` → pass to `useWaitForTransactionReceipt`

### Pool stats on landing page
- Read `totalAssets()` from FloatPool and `shareValue()` separately
- Batch-read all invoices to count funded/paid/defaulted states
- `shareValue` is 1e18-scaled: `(Number(shareValue) - 1e18) / 1e18 * 100` = yield %

### Circle Wallet integration
- `POST /v1/w3s/users` is idempotent — 409 = user already exists, not an error
- Must call `POST /v1/w3s/users/token` to get `userToken` + `encryptionKey` every session
- W3SSdk must be initialized client-side only (dynamic import or useEffect)
- Store `userId` in `sessionStorage`, not localStorage, for security

### Vercel deployment
- Video assets go in `/public` — Next.js serves them statically
- `vercel --prod --yes` — floatsme.xyz (production domain) auto-updates, no alias step
- Vercel CLI must be installed globally: `npm i -g vercel`
- Build cache restores between deployments — fast rebuilds

### Video background
- Set `playbackRate = 0.25` via ref in `useEffect` after mount
- `autoPlay muted loop playsInline` all required for cross-browser autoplay
- Wrap in `<motion.div style={{ y: gradientY }}>` for parallax

### Design system rules (do not break)
- Primary text: `#E1E0CC` — never pure white
- Card background: `#101010` or `#212121`
- Accent/primary: `#DEDBC8`
- No em dashes (—) anywhere in user-facing text
- No Vietnamese text outside of chat — all UI/code/docs in English

### Arc Privacy Sector (APS) — roadmap only
- APS testnet not publicly available yet (as of Jun 2026)
- When available: deploy FloatCore/FloatPool to pEVM with minimal changes
- Bridge: `shield()` USDC from public Arc → private pEVM, `unshield()` after repayment
- Key benefit: invoice amounts, buyer/seller identities, credit scores become private
- Post-quantum crypto: X-Wing KEM + AES-256-GCM

## ⚠️ CRITICAL: Always Use Arc MCP
- Before coding anything Arc-related → call `arc-docs` MCP first
- Contract address, ABI, SDK API — all must be verified via MCP

## ⚠️ Arc-Only Network
- App runs 100% on Arc Testnet (Chain ID: 5042002)
- wagmi config: only `[arcTestnet]`

## Code Rules
- Never commit private keys, mnemonics, or `.env` files
- Use `viem` for on-chain reads, `wagmi` hooks for React state
- All contract interactions must handle wallet errors gracefully
- English only in code, comments, variables, commits
- Chat with user in Vietnamese

## File Conventions
- Components: `PascalCase.tsx`
- Hooks: `use-kebab-case.ts`
- Contracts: `PascalCase.sol`

## Git
- Commit messages: `type(scope): message`
- Never force-push to `main`

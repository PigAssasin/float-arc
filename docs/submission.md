# Float — Submission Document
## The Stablecoin Commerce Stack Challenge (Ignyte x Circle x Arc)
## Track 2: SME Trade Finance & Working Capital

---

## Project Title
**Float**

## Tagline
*Float your invoices. SMEs get paid today, not in 90 days.*

---

## Description

Float is an on-chain invoice factoring protocol that eliminates the working capital gap for small and medium enterprises (SMEs).

In traditional trade finance, an SME invoices a buyer and then waits 30 to 90 days to be paid. That gap — often tens of thousands of dollars — forces SMEs to take on debt, delay hiring, and miss growth opportunities. Float solves this by letting sellers receive 75 to 88% of the invoice value immediately in USDC, while a decentralized pool of investors earns 12 to 25% yield from the spread.

The entire protocol runs on Arc Testnet with USDC as the settlement currency. Circle's User-Controlled Wallet SDK is integrated as a first-class connection option, so any SME owner can participate without needing MetaMask, a seed phrase, or any prior crypto experience — just a PIN.

---

## Track
**Track 2 — SME Trade Finance & Working Capital**

---

## Circle Account Email
coinlistx100@gmail.com

---

## Products Used

### Circle — User-Controlled Wallets (W3S SDK)
- SDK: `@circle-fin/w3s-pw-web-sdk`
- Wallet type: User-Controlled, PIN-secured EOA (no seed phrase)
- App ID: `f06cb713-a2a3-57d2-9662-13607ec5f12f`
- Integration:
  - `POST /v1/w3s/users` — idempotent user creation
  - `POST /v1/w3s/users/token` — session tokens (userToken + encryptionKey)
  - `POST /v1/w3s/user/wallets` — create wallet with PIN challenge
  - `GET /v1/w3s/wallets` — fetch wallet address
  - `sdk.execute(challengeId, callback)` — PIN UI embedded in app
- Use case: SME owners connect via PIN without needing a browser wallet extension. Their wallet address is used for all on-chain reads (invoices, credit score, pool stats).

### Circle — USDC
- All advances, collateral, stakes, repayments, and pool deposits are denominated in USDC
- Native USDC on Arc Testnet: `0x3600000000000000000000000000000000000000`
- No wrapping or bridging required — users interact directly with USDC

### Arc Testnet
- Chain ID: 5042002
- USDC as native gas token (no ETH needed for gas — critical for SME UX)
- All Float smart contracts deployed on Arc Testnet
- Full EVM compatibility — standard Hardhat/wagmi/viem tooling works out of the box

---

## Working MVP

**Live application:** https://floatsme.xyz
**GitHub repository:** https://github.com/PigAssasin/float-arc

### Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| FloatCore v4 | `0x336Be2095425ac463c6E121461B68401c3209c85` |
| FloatPool v4 (fLP) | `0x98bF7f0572f542fBD6365531D39C657779839375` |
| USDC (Arc native) | `0x3600000000000000000000000000000000000000` |

### MVP Features
- Seller dashboard: create invoices, view credit score and advance tier, cancel timed-out invoices
- Buyer dashboard: approve or reject invoices, lock collateral, pay invoices (full or partial), trigger defaults
- Investor dashboard: deposit USDC into pool, withdraw, view fLP balance and real-time share value
- Float Assistant: AI chatbot (DeepSeek V3) with 4 live on-chain tool calls
- Circle Wallet: connect via PIN, view all dashboard data without MetaMask

---

## How It Works

### Three roles, one protocol

**Seller (SME)**
Creates an invoice naming a buyer and the invoice amount. Based on their credit tier, they receive an immediate USDC advance (75-88% of face value). A stake (5-10%) is withheld from the advance as recourse collateral and returned when the buyer pays.

**Buyer**
Receives the invoice for approval. After approving, locks a collateral deposit (12-25% of invoice). At due date, pays 100% of the invoice face value. A 7-day grace period applies before default can be triggered.

**Investor**
Deposits USDC into the liquidity pool and receives fLP (Float LP) ERC20 tokens. As invoice fees accrue, the share value of fLP rises. Investors can transfer or redeem fLP at any time.

### Advance Rate Tiers (on-chain, not manual)

| Tier | Credit Score | Advance | Seller Stake | Buyer Collateral |
|------|-------------|---------|-------------|-----------------|
| New | 0-40 or no history | 75% | 10% | 25% |
| Fair | 41-70 | 80% | 8% | 20% |
| Good | 71-85 | 84% | 6% | 16% |
| Excellent | 86-100 | 88% | 5% | 12% |

Tier is determined by `sellerAdvanceBps()` on-chain. New sellers (no invoice history) always receive the conservative New tier (75%), regardless of their raw score — this prevents Sybil attacks where someone creates many small invoices to inflate their score.

### Default Protection (Three Layers)

When a buyer defaults, losses are covered in this order:
1. Buyer collateral (12-25% of invoice) covers first
2. Seller stake (5-10%) covers second
3. Protocol insurance reserve (bounded at 5% of TVL) covers remainder
4. LP principal is only touched if all three layers are exhausted

### Credit Score Formula
```
sellerScore = (sellerPaidCount / sellerTotalCount) * 100
```
Score improves with each on-time repayment. Score drops on default. Stored on-chain, fully transparent.

---

## Architecture

```
Float Frontend (Next.js 14 App Router + TypeScript)
=========================================================

Seller Dashboard  |  Buyer Dashboard  |  Investor Dashboard
     |                    |                    |
     +--------------------+--------------------+
                          |
                   useAppWallet()
            (wagmi v2 + Circle W3S SDK)
                          |
          +---------------+----------------+
          |                                |
    wagmi v2 connectors             Circle W3S SDK
    (MetaMask, OKX,                 PIN-secured EOA
     EIP-6963 wallets)              No extension needed
          |                                |
          +---------------+----------------+
                          |
                 Float Assistant
               (DeepSeek V3 AI, SSE)
            4 live on-chain tool calls:
            get_pool_stats | get_my_score
            get_my_invoices | get_invoice_detail
                          |
                          | RPC / Contract Calls
                          |
                          v
Arc Testnet (Chain ID: 5042002)
=========================================================

   FloatCore v4                      FloatPool v4 (ERC20 fLP)
   -----------                       -------------------------
   createInvoice()                   deposit()
   approveInvoice()                  withdraw()
   rejectInvoice()                   totalAssets()
   lockCollateral()                  shareValue()       (1e18 scale)
   payInvoice()                      availableLiquidity()
   payPartial()                      insuranceReserve()
   markDefault()                     shares(address)    (fLP balance)
   cancelApprovalTimeout()           ERC20 transfer/approve
   cancelCollateralTimeout()
   sellerScore(address)
   sellerAdvanceBps(address)         USDC (Arc native)
   invoiceCount()                    0x3600000000000000000000000000000000000000
   getInvoice(id)
```

### Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Arc Testnet (Chain ID 5042002), USDC native gas |
| Smart contracts | Solidity 0.8.20, Hardhat, OpenZeppelin |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Wallet - EOA | wagmi v2 + viem, EIP-6963 wallet detection |
| Wallet - Circle | @circle-fin/w3s-pw-web-sdk, PIN-secured EOA |
| AI assistant | DeepSeek V3, Server-Sent Events (SSE), Edge runtime |
| Hosting | Vercel (floatsme.xyz / float-arc.vercel.app) |
| Animations | Framer Motion |

---

## Smart Contract Security

- **ReentrancyGuard** on all external state-changing functions
- **Checks-Effects-Interactions** pattern throughout
- **Custom errors** (gas efficient: `error ZeroAmount()`, `error InvoiceTooLarge(...)`, etc.)
- **MAX_INVOICE_BPS = 2000** — single invoice advance capped at 20% of available liquidity to prevent pool drain
- **Inflation guard** — 1,000 dead shares minted on pool initialization (prevents ERC4626-style inflation attack)
- **Bounded insurance** — per-event insurance payout capped at 5% of pool TVL
- **Anti-Sybil hooks** — `verificationRequired` flag (OFF by default for testnet open access, pluggable to EAS attestations in production)
- **One-time core registration** — `setAuthorizedCore()` is one-way, preventing unauthorized pool access upgrades
- **APPROVAL_TIMEOUT = 72h** and **COLLATERAL_TIMEOUT = 48h** — stale invoices can be cancelled by seller, returning them to a clean state

---

## Circle Integration — Technical Detail

### Connection Flow
```
User clicks "Circle Wallet"
        |
POST /api/circle/init-user
    POST /v1/w3s/users   (idempotent — 409 = already exists, not an error)
    POST /v1/w3s/users/token  -> { userToken, encryptionKey }
        |
GET /api/circle/wallets
    GET /v1/w3s/wallets  (with X-User-Token header)
        |
    Wallet exists?
    YES -> return address, mark as connected
    NO  ->
        POST /api/circle/create-wallet
            POST /v1/w3s/user/wallets -> { challengeId }
        sdk.execute(challengeId, callback)  -> PIN challenge UI
        GET /v1/w3s/wallets -> fetch address after PIN setup
        |
Dashboard reads active using Circle address
```

### Why Circle Wallets for SMEs
The key insight: most SME owners are not crypto-native. Requiring MetaMask creates a hard drop-off point. Circle's W3S SDK provides:
- Self-custodied wallet (user controls keys via PIN)
- No browser extension installation
- No seed phrase to manage or lose
- Native mobile-friendly PIN challenge UI
- Address reusability — same wallet across sessions via sessionStorage userId

---

## Documentation

### For Sellers
1. Connect wallet (MetaMask or Circle Wallet)
2. Go to Seller Dashboard
3. Enter buyer's wallet address, invoice amount (USDC), and payment due date
4. Submit — the invoice is sent to the buyer for approval on-chain
5. Once buyer approves and locks collateral, you receive your advance automatically
6. Your credit score improves with each invoice paid on time

### For Buyers
1. Connect wallet (must be the exact address the seller named)
2. Go to Buyer Dashboard — pending invoices appear automatically
3. Review: invoice amount, your required collateral, due date
4. Approve and lock collateral (two transactions: approve USDC + lockCollateral)
5. Pay the invoice before the due date (full or partial payments accepted)
6. Your collateral is returned automatically on payment

### For Investors
1. Connect wallet
2. Go to Investor Dashboard
3. Enter USDC amount and deposit (two steps: approve USDC, then deposit)
4. Receive fLP tokens representing your pool share
5. Share value increases as invoice fees accrue — no manual claiming needed
6. Withdraw by redeeming fLP for USDC at current share value

### Float Assistant
- Click the sparkle button (bottom right of any page)
- Ask anything: advance rates, invoice status, pool stats, credit score
- The assistant reads live on-chain data via 4 tool calls — answers are always current

---

## Product Feedback

### Circle User-Controlled Wallets (W3S SDK)

**What worked well:**
- PIN-based flow is the right UX primitive for non-crypto SME users — no seed phrases is a major win
- `sdk.execute(challengeId, callback)` is clean and composable with async/await wrappers
- `POST /v1/w3s/users` idempotency (409 = already exists) is elegant for stateless re-auth flows
- Wallet addresses are deterministic per userId — makes testing and debugging straightforward
- The embedded PIN challenge UI handles all the hard UX work (modal, PIN pad, confirmation)

**Suggestions:**
- A wagmi custom connector for Circle wallets would allow full write support (not just reads) without building a separate signing flow. Currently, Circle users can view all dashboard data but cannot sign transactions — they need MetaMask for writes.
- WebAuthn/passkey as an alternative to PIN would improve mobile UX significantly
- A lightweight read-only SDK (no DOM mounting) would help server-side rendering contexts
- TypeScript type exports for the `sdk.execute` callback result could be more complete — the `result.type` values are underdocumented

### Arc Testnet

**What worked well:**
- USDC as native gas token is the standout feature — eliminates the "I need ETH for gas" friction for stablecoin apps entirely
- Full EVM compatibility meant zero tooling changes — Hardhat, wagmi, viem, ethers all worked out of the box
- Chain ID 5042002 slots cleanly into standard wagmi `defineChain` config

**Suggestions:**
- RPC reliability had occasional timeout spikes during development — a second public RPC endpoint would help
- The block explorer (arcscan.app) is functional but lacks event log search, making debugging contract interactions harder
- Chain ID 5042002 is not yet in common wallet preset lists — users must add the network manually (a MetaMask snap or Chainlist entry would reduce friction)
- An official Faucet UI for testnet USDC would speed up developer onboarding significantly

---

## Video Demo
[Link to be added — screen recording of: Circle Wallet connection, invoice lifecycle (create/approve/lock/pay), investor deposit/withdraw, AI assistant tool calls]

---

## Team
Solo project built for The Stablecoin Commerce Stack Challenge (Ignyte x Circle x Arc, Jun-Jul 2026).

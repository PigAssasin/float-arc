"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] ${className}`}>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[11px] font-mono text-gray-400">
      {children}
    </code>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-medium mb-6 text-[#E1E0CC]">{children}</h2>;
}

const anim = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

const FAQ = [
  {
    q: "What do I need to create an invoice?",
    a: "Connect any EVM wallet to Arc Testnet. On the Seller dashboard, enter the buyer's wallet address, the invoice amount in USDC, and the due date. Float previews your advance amount and the collateral required from the buyer. The invoice is submitted on-chain and waits for the buyer to approve.",
  },
  {
    q: "When does the seller receive the advance?",
    a: "The advance is not sent at invoice creation. It is sent after two buyer actions: first the buyer approves the invoice on-chain, then the buyer locks the required collateral. Both must happen before the advance is disbursed. This protects the pool from fraudulent invoices.",
  },
  {
    q: "What is buyer collateral and why is it required?",
    a: "Buyer collateral is a USDC deposit locked in FloatPool when the buyer confirms the invoice. It acts as security for the pool. If the buyer defaults, the collateral is slashed to partially offset the advance loss. Collateral is returned in full when the buyer pays the invoice. The amount is calculated as max(buyer tier rate, 100% minus advance rate).",
  },
  {
    q: "What happens if the buyer does not pay?",
    a: "After the due date plus a 7-day grace period, anyone can call markDefault() on FloatCore. The invoice is marked DEFAULTED, the buyer's collateral is slashed to the pool, and both credit scores drop. The buyer can still pay (avoiding default) up until the moment markDefault is called.",
  },
  {
    q: "How is the advance rate calculated?",
    a: "Each seller has an on-chain score from 0 to 100. New sellers start at 50 and receive an 85% advance rate. The score is the ratio of paid invoices to total invoices, with paid-count gates for higher tiers. Scores improve as the seller builds repayment history, unlocking 88% and 90% advance rates over time.",
  },
  {
    q: "Is there an early repayment discount?",
    a: "No. In v6a there is no early-repayment discount. The buyer repays the invoice face value, while the seller's cost is an explicit term-scaled fee that was calculated when the invoice was created.",
  },
  {
    q: "How do investors earn yield?",
    a: "When a buyer repays 100% of the invoice, the explicit invoice fee is split between protocol, insurance, and LPs. Investors receive 75% of the fee, increasing investorAssets relative to total shares. Investors capture accrued yield when they redeem their shares.",
  },
  {
    q: "Can investors withdraw at any time?",
    a: "Yes. Enter the number of shares to redeem and call withdraw(). The contract converts shares to USDC at the current share value. Withdrawals are limited to available liquidity — USDC deployed as advances or held as collateral cannot be withdrawn until invoices settle.",
  },
  {
    q: "Are the contracts audited?",
    a: "Float is a hackathon prototype on Arc Testnet. Contracts use OpenZeppelin libraries, ReentrancyGuard, and the checks-effects-interactions pattern, but have not undergone a formal security audit. Do not use with real funds.",
  },
  {
    q: "What happens to my credit score if I default?",
    a: "After markDefault() is called, your total invoice count increases while your paid count stays the same, dropping the score ratio. This reduces your advance rate on all future invoices and is permanently recorded on-chain.",
  },
  {
    q: "Does Float support multiple currencies?",
    a: "No. Float is USDC-native by design, running on Arc Testnet where USDC is also the gas token. All invoice amounts, advances, and repayments are denominated in USDC with 6 decimal places.",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-black text-[#E1E0CC]">

      {/* Nav */}
      <div className="sticky top-0 z-50 border-b border-white/5 bg-black/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[10px] tracking-widest uppercase text-[#E1E0CC]/50 hover:text-[#E1E0CC] transition-colors">Float</Link>
            <span className="w-px h-3 bg-white/10" />
            <span className="text-[10px] tracking-widest uppercase text-[#E1E0CC]/30">Docs</span>
          </div>
          <Link href="/app/seller" className="flex items-center gap-1.5 text-xs font-medium text-black bg-[#DEDBC8] hover:bg-[#DEDBC8]/90 rounded-full px-4 py-1.5 transition-colors">
            Launch App <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20 flex flex-col gap-24">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <SectionLabel>Invoice Factoring Protocol on Arc Testnet</SectionLabel>
          <h1 className="text-5xl sm:text-6xl font-medium tracking-tight mb-5">Float</h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-2xl mb-8">
            Float is an on-chain invoice factoring protocol. SMEs submit unpaid invoices and receive a USDC advance immediately. Buyers repay the full amount at maturity. Investors deposit USDC into the pool and earn yield from the spread between the advance rate and the full repayment.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Advance rate", value: "80 to 90%" },
              { label: "Settlement", value: "Sub-second" },
              { label: "Currency", value: "USDC" },
              { label: "Network", value: "Arc Testnet" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{s.label}</p>
                <p className="text-[#E1E0CC] text-sm font-medium">{s.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Protocol flow */}
        <motion.section {...anim}>
          <SectionLabel>Protocol flow</SectionLabel>
          <H2>How Float works</H2>
          <Card className="divide-y divide-white/[0.05] mb-6">
            {[
              {
                step: "01", who: "Seller",
                action: "Create invoice",
                detail: "The seller calls createInvoice(buyer, amount, dueDate) on FloatCore. The contract reads the seller's credit score, computes the advance rate and required buyer collateral, and stores the invoice on-chain. Status: PENDING_APPROVAL. No funds move yet.",
              },
              {
                step: "02", who: "Buyer",
                action: "Approve or reject",
                detail: "The buyer receives the invoice and reviews the terms. They call approveInvoice(id) to confirm the invoice is legitimate, or rejectInvoice(id) to cancel it. Approval requires no USDC — it is only a signature. Status: PENDING_COLLATERAL.",
              },
              {
                step: "03", who: "Buyer",
                action: "Lock collateral",
                detail: "The buyer approves FloatCore for the collateral amount, then calls lockCollateral(id). FloatCore pulls USDC from the buyer into FloatPool as escrow, then immediately instructs the pool to advance funds to the seller. Status: FUNDED. Both actions occur in one transaction.",
              },
              {
                step: "04", who: "Buyer",
                action: "Pay at due date",
                detail: "The buyer approves FloatCore for the full invoice amount and calls payInvoice(id). FloatCore transfers the full amount to FloatPool, then releases the locked collateral back to the buyer. Both credit scores update atomically. Status: PAID.",
              },
              {
                step: "05", who: "Investor",
                action: "Capture the spread",
                detail: "The buyer repays 100% of the invoice face value. The explicit invoice fee is split 10% to protocol, 15% to insurance, and 75% to LPs. The LP share increases investorAssets relative to total shares, so share value rises as invoices settle.",
              },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-6 p-6">
                <span className="text-[10px] font-mono text-gray-700 w-6 shrink-0 mt-0.5">{s.step}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-gray-500">{s.who}</span>
                    <span className="text-[#E1E0CC] text-sm font-medium">{s.action}</span>
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}
          </Card>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: "Seller receives", value: "80-90% advance", desc: "Based on credit score tier" },
              { label: "Buyer repays", value: "100% at maturity", desc: "7-day grace period after due date" },
              { label: "Investor earns", value: "75% of fees", desc: "Accumulated as share value growth" },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{s.label}</p>
                <p className="text-[#DEDBC8] text-lg font-bold mb-0.5">{s.value}</p>
                <p className="text-gray-600 text-xs">{s.desc}</p>
              </Card>
            ))}
          </div>
        </motion.section>

        {/* User guides */}
        <motion.section {...anim}>
          <SectionLabel>Step-by-step guides</SectionLabel>
          <H2>Using Float</H2>
          <div className="flex flex-col gap-6">

            {/* Seller */}
            <Card className="overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.05] flex items-center gap-3">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#DEDBC8]/10 text-[#DEDBC8] border border-[#DEDBC8]/20">Seller</span>
                <h3 className="text-[#E1E0CC] font-medium">Float an invoice</h3>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {[
                  { n: "1", t: "Connect wallet", d: "Use MetaMask or create a Circle Wallet. Make sure you are on Arc Testnet (Chain ID 5042002)." },
                  { n: "2", t: "Go to Seller dashboard", d: "Navigate to /app/seller. Your current credit score and available pool liquidity are shown at the top." },
                  { n: "3", t: "Fill in invoice details", d: "Enter the buyer's wallet address, the invoice amount in USDC, and the payment due date. Float previews your advance amount and the buyer's required collateral in real-time." },
                  { n: "4", t: "Submit", d: "Click Create Invoice. The transaction calls createInvoice() on FloatCore and stores the invoice on-chain. The invoice is now PENDING_APPROVAL — no funds move yet. The advance is sent only after the buyer approves and locks collateral." },
                  { n: "5", t: "Track your invoices", d: "Your invoices appear below the form with live status. PENDING_APPROVAL means waiting for buyer. FUNDED means the advance has been sent to your wallet. PAID means the invoice is settled." },
                ].map((item) => (
                  <div key={item.n} className="flex gap-4 px-6 py-4">
                    <span className="w-5 h-5 rounded-full bg-[#DEDBC8]/10 border border-[#DEDBC8]/20 text-[#DEDBC8] text-[10px] font-mono flex items-center justify-center shrink-0 mt-0.5">{item.n}</span>
                    <div>
                      <p className="text-[#E1E0CC] text-sm font-medium mb-0.5">{item.t}</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Buyer */}
            <Card className="overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.05] flex items-center gap-3">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">Buyer</span>
                <h3 className="text-[#E1E0CC] font-medium">Pay an invoice</h3>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {[
                  { n: "1", t: "Connect wallet", d: "Connect the wallet address that was specified by the seller as buyer. Float identifies invoices by on-chain buyer address." },
                  { n: "2", t: "Go to Buyer dashboard", d: "Navigate to /app/buyer. Invoices are grouped by action required: Pending Approval, Needs Collateral, Active, and History." },
                  { n: "3", t: "Approve or reject invoice", d: "Review the invoice terms: seller address, amount, advance sent to seller, collateral required from you, and due date. Call approveInvoice(id) to confirm or rejectInvoice(id) to cancel. No USDC needed yet." },
                  { n: "4", t: "Lock collateral", d: "After approving, Float asks you to lock USDC as collateral. Step 1: approve FloatCore for the collateral amount. Step 2: call lockCollateral(id). This triggers the advance to the seller in the same transaction." },
                  { n: "5", t: "Pay at due date", d: "When the invoice is due, Step 1: approve FloatCore for the full invoice amount. Step 2: call payInvoice(id). The full amount goes to the pool and your collateral is returned to your wallet in the same transaction." },
                  { n: "6", t: "Repay invoice", d: "Pay the full invoice face value at or before the due date. v6a has no early-repayment discount; the seller's cost is the explicit fee calculated at invoice creation." },
                ].map((item) => (
                  <div key={item.n} className="flex gap-4 px-6 py-4">
                    <span className="w-5 h-5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-mono flex items-center justify-center shrink-0 mt-0.5">{item.n}</span>
                    <div>
                      <p className="text-[#E1E0CC] text-sm font-medium mb-0.5">{item.t}</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Investor */}
            <Card className="overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.05] flex items-center gap-3">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Investor</span>
                <h3 className="text-[#E1E0CC] font-medium">Deposit and earn yield</h3>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {[
                  { n: "1", t: "Connect wallet", d: "Connect any EVM wallet holding USDC on Arc Testnet." },
                  { n: "2", t: "Go to Investor dashboard", d: "Navigate to /app/investor. The dashboard shows pool TVL, current share value, your position in USDC, and historical share value growth." },
                  { n: "3", t: "Approve USDC", d: "Enter the amount you want to deposit and click Approve. This authorizes FloatPool to pull your USDC." },
                  { n: "4", t: "Deposit", d: "Click Deposit. FloatPool mints shares proportional to your deposit at the current share value and transfers your USDC into the pool." },
                  { n: "5", t: "Earn passively", d: "As sellers create invoices and buyers repay, totalAssets grows. Your shares are worth more USDC over time with no action required." },
                  { n: "6", t: "Withdraw", d: "Enter share amount and click Withdraw. FloatPool burns your shares and returns USDC at the current share value, including all accrued yield." },
                ].map((item) => (
                  <div key={item.n} className="flex gap-4 px-6 py-4">
                    <span className="w-5 h-5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-mono flex items-center justify-center shrink-0 mt-0.5">{item.n}</span>
                    <div>
                      <p className="text-[#E1E0CC] text-sm font-medium mb-0.5">{item.t}</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </motion.section>

        {/* Credit Score */}
        <motion.section {...anim}>
          <SectionLabel>On-chain scoring</SectionLabel>
          <H2>Credit Score System</H2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-2xl mb-6">
            Every seller has a credit score stored on FloatCore. It is computed purely from on-chain data, is immutable, and determines the advance rate applied to each new invoice.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Card className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Scoring formula</p>
              <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-gray-400 mb-4">
                <p className="text-gray-600 mb-1">{"// new seller (no invoices yet)"}</p>
                <p className="mb-3">score = 50</p>
                <p className="text-gray-600 mb-1">{"// after at least one invoice"}</p>
                <p>score = paidCount * 100 / totalCount</p>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">
                Score updates after every payInvoice() and markDefault() call. The update is atomic within the same transaction, so the seller's next invoice reflects the new rate immediately.
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Advance tiers</p>
              <div className="flex flex-col gap-2 mb-4">
                {[
                  { tier: "New",       score: "0 to 40",   rate: "80%", color: "#ef4444", desc: "Starting tier for new sellers" },
                  { tier: "Fair",      score: "41 to 70",  rate: "85%", color: "#f97316", desc: "Building repayment history" },
                  { tier: "Good",      score: "71 to 85",  rate: "88%", color: "#DEDBC8", desc: "Consistent on-time payments" },
                  { tier: "Excellent", score: "86 to 100", rate: "90%", color: "#22c55e", desc: "Top-tier seller track record" },
                ].map((t) => (
                  <div key={t.tier} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <div>
                        <span className="text-xs font-medium" style={{ color: t.color }}>{t.tier}</span>
                        <span className="text-[10px] text-gray-600 font-mono ml-2">score {t.score}</span>
                        <p className="text-gray-600 text-[10px]">{t.desc}</p>
                      </div>
                    </div>
                    <span className="text-base font-bold" style={{ color: t.color }}>{t.rate}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Default and grace period</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: "Grace period", value: "7 days after due date", desc: "Buyer has 7 additional days before default can be triggered." },
                { label: "Who calls markDefault", value: "Anyone", desc: "Any address can trigger markDefault() after the grace period expires. There is no keeper requirement." },
                { label: "Consequence", value: "Score drops", desc: "totalCount increments without paidCount incrementing, permanently reducing the seller's ratio." },
              ].map((r) => (
                <div key={r.label}>
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{r.label}</p>
                  <p className="text-[#E1E0CC] text-sm font-medium mb-1">{r.value}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.section>

        {/* Architecture */}
        <motion.section {...anim}>
          <SectionLabel>Technical architecture</SectionLabel>
          <H2>System Design</H2>
          <div className="bg-black/60 rounded-2xl border border-white/[0.06] p-6 font-mono text-xs text-gray-500 mb-6 overflow-x-auto">
            <pre>{`
  Seller          FloatCore               FloatPool           Buyer / Investor
    |                  |                      |                      |
    |--createInvoice()->|                      |                      |
    |  (status: PENDING_APPROVAL)              |                      |
    |                  |                      |    <--approveInvoice()|
    |                  |  (status: PENDING_COLLATERAL)                |
    |                  |                      | <--lockCollateral()---|
    |                  |<--USDC collateral----|<--transferFrom(buyer)-|
    |                  |--recordCollateral()-->|                      |
    |<--USDC advance---|<--advanceFunds()------|                      |
    |  (status: FUNDED)                        |                      |
    |                  |                      |<----deposit(amt)------|
    |                  |                      |-----mint shares------>|
    |                  |                      |    <---payInvoice()---|
    |                  |<--USDC full amount---|<--transferFrom(buyer)-|
    |                  |--releaseCollateral()->|---USDC collateral-->buyer
    |                  |  (status: PAID)       |---shareValue up------>|
            `.trim()}</pre>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">FloatCore responsibilities</p>
              <ul className="flex flex-col gap-2">
                {[
                  "6-state invoice lifecycle (PENDING_APPROVAL to PAID/DEFAULTED/CANCELLED)",
                  "Dual credit scores: separate scores for sellers and buyers",
                  "Advance rate calculation from seller score tier (80-90%)",
                  "Buyer collateral requirement calculation per invoice",
                  "Explicit term-scaled fee calculation with no early-repayment discount",
                  "Permissionless markDefault() after grace period expires",
                  "72h approval timeout + 48h collateral timeout auto-cancel",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                    <Check className="w-3.5 h-3.5 text-[#DEDBC8] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">FloatPool responsibilities</p>
              <ul className="flex flex-col gap-2">
                {[
                  "USDC custody: investor deposits + buyer collateral held separately",
                  "Share issuance on deposit (proportional to investorAssets)",
                  "Share redemption: burns shares, returns USDC at current share value",
                  "Collateral escrow: recordCollateral, releaseCollateral, slashCollateral",
                  "investorAssets() excludes locked collateral from share value calculation",
                  "Access-controlled: only FloatCore can move funds (onlyCore modifier)",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                    <Check className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </motion.section>

        {/* Contracts */}
        <motion.section {...anim}>
          <SectionLabel>Arc Testnet</SectionLabel>
          <H2>Smart Contracts</H2>
          <Card className="divide-y divide-white/[0.05] mb-4">
            {[
              {
                name: "FloatPool",
                address: "0xCaC5c72a870fB989093e68F98027aa0639a4Bf77",
                desc: "Investor vault with collateral custody. Accepts USDC deposits, issues proportional shares, holds buyer collateral in escrow, disburses advances to sellers, and releases or slashes collateral on repayment or default. Share value rises as invoice spreads accumulate.",
                fns: ["deposit(uint256 amount)", "withdraw(uint256 shareAmount)", "recordCollateral(uint256 id, uint256 amount)", "releaseCollateral(uint256 id, address to)", "slashCollateral(uint256 id)", "shareValue() returns uint256", "investorAssets() returns uint256", "availableLiquidity() returns uint256"],
              },
              {
                name: "FloatCore",
                address: "0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637",
                desc: "Invoice lifecycle manager with dual credit scores. Handles 6-state invoice flow (PENDING_APPROVAL, PENDING_COLLATERAL, FUNDED, PAID, DEFAULTED, CANCELLED), buyer collateral locking, term-scaled fees, and atomic score updates for both seller and buyer.",
                fns: ["createInvoice(address buyer, uint256 amount, uint256 dueDate)", "approveInvoice(uint256 id)", "rejectInvoice(uint256 id)", "lockCollateral(uint256 id)", "payInvoice(uint256 id)", "markDefault(uint256 id)", "feeBpsForTerm(address buyer, uint256 termSeconds)", "sellerScore(address) returns uint256", "buyerScore(address) returns uint256"],
              },
            ].map((c) => (
              <div key={c.name} className="p-6">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="text-[#E1E0CC] font-medium">{c.name}</h3>
                  <a
                    href={`https://testnet.arcscan.app/address/${c.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-blue-400/50 hover:text-blue-400 transition-colors shrink-0"
                  >
                    {c.address.slice(0, 10)}...{c.address.slice(-6)} ↗
                  </a>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{c.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.fns.map((fn) => <Tag key={fn}>{fn}</Tag>)}
                </div>
              </div>
            ))}
          </Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Network", value: "Arc Testnet" },
              { label: "Chain ID", value: "5042002" },
              { label: "Gas token", value: "USDC" },
              { label: "Finality", value: "Sub-second" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{s.label}</p>
                <p className="text-[#E1E0CC] text-sm font-mono">{s.value}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Risk model */}
        <motion.section {...anim}>
          <SectionLabel>Risk and security</SectionLabel>
          <H2>Risk Model</H2>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Recourse model",
                body: "Sellers are liable for buyer defaults. A default reduces the seller's credit score, restricting future advance rates. The pool does not pursue collateral recovery; instead, the score penalty creates economic incentive for sellers to work with creditworthy buyers.",
              },
              {
                title: "Pool liquidity risk",
                body: "If all pool capital is deployed in active invoices, new invoice advances and investor withdrawals may be temporarily blocked. Liquidity is displayed live on the dashboard. The pool is replenished each time a buyer repays.",
              },
              {
                title: "Smart contract risk",
                body: "Float contracts use OpenZeppelin libraries, ReentrancyGuard, and checks-effects-interactions. All state changes emit events. The code is open source and deployed on testnet only. No formal audit has been conducted.",
              },
            ].map((r) => (
              <Card key={r.title} className="p-5">
                <p className="text-[#E1E0CC] text-sm font-medium mb-2">{r.title}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{r.body}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Security primitives used</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { name: "OpenZeppelin Ownable", desc: "Owner-only access control on admin functions such as setting the FloatCore address in FloatPool." },
                { name: "ReentrancyGuard", desc: "All fund-moving functions (advance, withdraw, payInvoice) are protected against re-entrancy attacks." },
                { name: "Checks-effects-interactions", desc: "State variables are updated before any external token transfers to prevent state manipulation." },
                { name: "Custom errors", desc: "Gas-efficient revert reasons replace string-based require statements throughout both contracts." },
              ].map((s) => (
                <div key={s.name} className="flex gap-3">
                  <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#E1E0CC] text-xs font-medium mb-0.5">{s.name}</p>
                    <p className="text-gray-600 text-xs leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.section>

        {/* Privacy roadmap */}
        <motion.section {...anim}>
          <SectionLabel>Future roadmap</SectionLabel>
          <H2>Privacy with Arc Privacy Sector</H2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-2xl mb-6">
            Float currently runs on Arc's public EVM where all invoice data is visible on-chain. For enterprise trade finance, confidentiality is critical: buyers do not want competitors inferring their supply chains, and sellers do not want their credit scores exposed. Arc Privacy Sector (APS) addresses this.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {[
              {
                title: "What APS enables",
                items: [
                  "Private invoice amounts invisible to external observers",
                  "Confidential buyer and seller identities on-chain",
                  "Private credit scores accessible only to the seller",
                  "Investor positions hidden from public state",
                ],
              },
              {
                title: "How it works",
                items: [
                  "APS runs a private EVM inside AWS Nitro hardware enclaves",
                  "Existing Solidity contracts deploy to pEVM with minimal changes",
                  "USDC moves between public Arc and private APS via shield/unshield bridge",
                  "Post-quantum hybrid cryptography (X-Wing KEM + AES-256-GCM)",
                ],
              },
            ].map((block) => (
              <Card key={block.title} className="p-5">
                <p className="text-[#E1E0CC] text-sm font-medium mb-3">{block.title}</p>
                <ul className="flex flex-col gap-2">
                  {block.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                      <Check className="w-3.5 h-3.5 text-[#DEDBC8] shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Migration path</p>
            <p className="text-gray-500 text-sm leading-relaxed">
              When APS testnet becomes publicly available, Float's contracts can be redeployed to the private pEVM with minimal modifications. The public-facing entry point would shield USDC into the private environment, execute the invoice lifecycle privately, and unshield repayments back to the public chain. The net effect: all invoice economics remain identical, but the amounts, parties, and scores become confidential.
            </p>
          </Card>
        </motion.section>

        {/* Glossary */}
        <motion.section {...anim}>
          <SectionLabel>Reference</SectionLabel>
          <H2>Glossary</H2>
          <Card className="divide-y divide-white/[0.05]">
            {[
              { term: "Invoice factoring", def: "The practice of selling an unpaid invoice to a third party at a discount in exchange for immediate cash. Float implements this on-chain with USDC." },
              { term: "Advance rate", def: "The percentage of the invoice face value advanced upfront. In Float v6a, this ranges from 80% to 90% depending on the seller's credit score tier and paid-count gates." },
              { term: "Recourse model", def: "A factoring arrangement where the seller remains liable if the buyer fails to pay. The opposite is non-recourse, where the factor absorbs the loss." },
              { term: "Share value", def: "totalAssets divided by totalShares in FloatPool. This number starts at 1.0 USDC per share and increases as repayments accumulate. It never decreases on repayment." },
              { term: "Credit score", def: "A 0 to 100 integer stored on-chain per seller, computed as paidCount * 100 / totalCount. Determines the advance tier applied to new invoices." },
              { term: "Grace period", def: "The 7-day window after an invoice's due date before markDefault() can be called. Allows for minor payment delays without immediately penalizing the seller." },
              { term: "Available liquidity", def: "The amount of USDC in FloatPool not currently deployed in active invoice advances. This caps the maximum invoice size a seller can submit." },
              { term: "Arc Testnet", def: "A public EVM-compatible blockchain by Circle. Chain ID 5042002. Uses USDC as the native gas token. Sub-second finality. Float runs exclusively on this network." },
            ].map((g) => (
              <div key={g.term} className="grid sm:grid-cols-4 gap-3 p-5">
                <p className="text-[#E1E0CC] text-xs font-medium sm:col-span-1">{g.term}</p>
                <p className="text-gray-500 text-xs leading-relaxed sm:col-span-3">{g.def}</p>
              </div>
            ))}
          </Card>
        </motion.section>

        {/* Testnet guide */}
        <motion.section {...anim}>
          <SectionLabel>Getting started</SectionLabel>
          <H2>Testing on Arc Testnet</H2>
          <div className="flex flex-col gap-3">
            <Card className="p-5">
              <p className="text-[#E1E0CC] text-sm font-medium mb-3">1. Add Arc Testnet to your wallet</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "Network Name", value: "Arc Testnet" },
                  { label: "Chain ID", value: "5042002" },
                  { label: "RPC URL", value: "https://rpc.testnet.arc.network" },
                  { label: "Currency", value: "USDC (6 decimals)" },
                  { label: "Block Explorer", value: "https://testnet.arcscan.app" },
                  { label: "Fallback RPC", value: "https://rpc.blockdaemon.testnet.arc.network" },
                ].map((r) => (
                  <div key={r.label} className="flex flex-col gap-0.5 bg-white/[0.03] rounded-lg px-3 py-2">
                    <span className="text-gray-600 text-[10px] uppercase tracking-widest">{r.label}</span>
                    <span className="text-[#E1E0CC] text-xs font-mono">{r.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-3">
                Arc uses USDC as its native gas token. Gas fees are tiny (sub-cent). No ETH needed.
              </p>
            </Card>

            <Card className="p-5">
              <p className="text-[#E1E0CC] text-sm font-medium mb-2">2. Get test USDC</p>
              <p className="text-gray-500 text-sm leading-relaxed mb-3">
                Arc Testnet USDC is minted by the Arc faucet. The contract address is{" "}
                <code className="text-xs font-mono text-[#DEDBC8] bg-white/[0.06] px-1.5 py-0.5 rounded">0x3600...0000</code>.
                Visit the Arc testnet faucet and request USDC to your wallet address.
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  "Go to the Arc testnet faucet (linked in the Arc developer portal)",
                  "Paste your wallet address and request USDC",
                  "Funds arrive within a few seconds (sub-second finality)",
                  "You need at least ~10 USDC to test as an investor or buyer",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-gray-400">
                    <span className="text-gray-600 font-mono shrink-0 mt-0.5">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <p className="text-[#E1E0CC] text-sm font-medium mb-2">3. Quick test flow</p>
              <div className="flex flex-col gap-2">
                {[
                  { role: "Investor", step: "Deposit USDC into the pool to fund the liquidity buffer" },
                  { role: "Seller", step: "Create an invoice with a buyer address and due date" },
                  { role: "Buyer", step: "Approve the invoice, then lock collateral to release the advance" },
                  { role: "Buyer", step: "Pay the full invoice amount at or before the due date" },
                  { role: "Investor", step: "Withdraw anytime — share value increases as invoices are repaid" },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-gray-500 border border-white/[0.07] shrink-0 mt-0.5 whitespace-nowrap">{row.role}</span>
                    <span className="text-gray-400 text-xs leading-relaxed">{row.step}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-3">
                No Circle Wallet required for testing with MetaMask. Just add Arc Testnet and connect.
              </p>
            </Card>
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section {...anim}>
          <SectionLabel>Common questions</SectionLabel>
          <H2>FAQ</H2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FAQ.map((item) => (
              <Card key={item.q} className="p-5">
                <p className="text-[#E1E0CC] text-sm font-medium mb-2">{item.q}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{item.a}</p>
              </Card>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <motion.div {...anim}>
          <Card className="p-10 text-center">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Get started</p>
            <h2 className="text-3xl font-medium mb-2">Float your first invoice.</h2>
            <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">Connect your wallet, submit an invoice, and receive USDC in seconds on Arc Testnet.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/app/seller" className="flex items-center justify-center gap-2 bg-[#DEDBC8] text-black font-medium text-sm px-6 py-3 rounded-full hover:bg-[#DEDBC8]/90 transition-colors">
                Seller Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/app/investor" className="flex items-center justify-center gap-2 bg-white/[0.05] text-[#E1E0CC] font-medium text-sm px-6 py-3 rounded-full hover:bg-white/10 border border-white/10 transition-colors">
                Investor Dashboard
              </Link>
              <Link href="/app/buyer" className="flex items-center justify-center gap-2 bg-white/[0.05] text-[#E1E0CC] font-medium text-sm px-6 py-3 rounded-full hover:bg-white/10 border border-white/10 transition-colors">
                Buyer Dashboard
              </Link>
            </div>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}

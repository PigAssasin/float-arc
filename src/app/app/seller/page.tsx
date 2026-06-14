"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useMyInvoices, OnChainInvoice } from "@/hooks/use-my-invoices";
import { ConnectWalletButton } from "@/components/shared/ConnectWalletButton";
import { CreditScoreBadge } from "@/components/dashboard/CreditScoreBadge";
import { InvoiceTable } from "@/components/dashboard/InvoiceTable";
import { CONTRACTS, FloatCoreABI, FloatPoolABI, USDC_DECIMALS } from "@/lib/contracts";
import { ArrowRight, Plus, TrendingUp, Clock, CheckCircle2, Wallet, Info, Loader2, AlertCircle, XCircle } from "lucide-react";
import { arcTestnet } from "@/lib/wagmi-config";

const TIER_COLORS: Record<string, string> = {
  New: "#ef4444",
  Fair: "#f97316",
  Good: "#DEDBC8",
  Excellent: "#22c55e",
};

// Tier is derived from the on-chain advance rate (bps), not the raw score: an
// unproven seller (no history) gets the conservative New tier even though score reads 50.
function rateToTier(rateBps: number): string {
  if (rateBps >= 8800) return "Excellent";
  if (rateBps >= 8400) return "Good";
  if (rateBps >= 8000) return "Fair";
  return "New";
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-2xl border border-white/[0.07] overflow-hidden ${className}`}
      style={{ backdropFilter: "blur(24px) saturate(160%)", background: "rgba(255,255,255,0.03)" }}
    >
      {children}
    </div>
  );
}

function TxError({ error }: { error: Error | null }) {
  if (!error) return null;
  const msg = error.message ?? "";
  let friendly = "Transaction failed. Please try again.";
  if (msg.includes("InvoiceTooLarge")) friendly = "Invoice too large for current pool liquidity. Reduce the amount.";
  else if (msg.includes("InsufficientPoolLiquidity")) friendly = "Pool is currently low on liquidity. Try a smaller invoice.";
  else if (msg.includes("InvalidDueDate")) friendly = "Due date must be in the future.";
  else if (msg.includes("ZeroAmount")) friendly = "Invoice amount cannot be zero.";
  else if (msg.includes("SelfInvoice")) friendly = "Buyer address cannot be the same as your address.";
  else if (msg.includes("User rejected")) friendly = "Transaction rejected in wallet.";
  return (
    <div className="flex items-center gap-2 text-red-400 text-xs rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {friendly}
    </div>
  );
}

// ── Stale invoice cancel card ─────────────────────────────────────────────────

const APPROVAL_TIMEOUT_S = 72 * 3600;   // 259200
const COLLATERAL_TIMEOUT_S = 120 * 3600; // 432000

function StaleInvoiceCard({ inv, type }: { inv: OnChainInvoice; type: "approval" | "collateral" }) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess: cancelled } = useWaitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  const amountFmt = (Number(inv.amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const hoursStale = Math.floor((Date.now() / 1000 - Number(inv.createdAt) - (type === "approval" ? APPROVAL_TIMEOUT_S : COLLATERAL_TIMEOUT_S)) / 3600);

  const handleCancel = () => {
    writeContract({
      address: CONTRACTS.FLOAT_CORE,
      abi: FloatCoreABI,
      functionName: type === "approval" ? "cancelApprovalTimeout" : "cancelCollateralTimeout",
      args: [inv.id],
      chainId: arcTestnet.id,
    });
  };

  if (cancelled) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 opacity-60">
        <XCircle className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-gray-500 text-xs">Invoice #{String(inv.id)} cancelled (timeout).</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[#E1E0CC] text-sm font-medium">
          #{String(inv.id)} · ${amountFmt} USDC
        </p>
        <p className="text-gray-400 text-xs mt-0.5">
          {type === "approval" ? "Buyer did not approve" : "Buyer did not lock collateral"} · {hoursStale}h past timeout
        </p>
        {error && (
          <p className="text-red-400 text-xs mt-1">{(error as Error).message?.slice(0, 80)}</p>
        )}
      </div>
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full border border-red-500/30 text-red-400 bg-red-500/[0.07] hover:bg-red-500/[0.14] disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
        Cancel Invoice
      </button>
    </div>
  );
}

export default function SellerPage() {
  const { isConnected, address } = useAccount();
  const { invoices } = useMyInvoices(address, "seller");

  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("30");
  const [customDate, setCustomDate] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  // ── Contract reads ──────────────────────────────────────────────────────────

  const { data: rawScore } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "sellerScore",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.FLOAT_CORE },
  });

  const { data: rawRate } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "sellerAdvanceBps",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.FLOAT_CORE },
  });

  const { data: rawInvoiceCount } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "invoiceCount",
    query: { enabled: !!CONTRACTS.FLOAT_CORE },
  });

  const { data: rawLiquidity } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "availableLiquidity",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawTotalAssets } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "totalAssets",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawMaxInvoiceBps } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "MAX_INVOICE_BPS",
    query: { enabled: !!CONTRACTS.FLOAT_CORE },
  });

  // ── Derived values ──────────────────────────────────────────────────────────

  const score = rawScore !== undefined ? Number(rawScore) : 50;
  const rateBps = rawRate !== undefined ? Number(rawRate) : 7500;
  const advanceRate = rateBps / 100; // e.g. 7500 → 75
  const fee = 100 - advanceRate;
  const tier = rateToTier(rateBps);
  const tierColor = TIER_COLORS[tier] ?? "#DEDBC8";

  const liquidity = rawLiquidity ? Number(rawLiquidity) / 1e6 : null;
  const totalAssets = rawTotalAssets ? Number(rawTotalAssets) / 1e6 : null;
  const utilPct = liquidity !== null && totalAssets !== null && totalAssets > 0
    ? Math.round((1 - liquidity / totalAssets) * 100)
    : null;

  // Stake rate mirrors sellerStakeBps() in FloatCore.sol (derived from tier/rate)
  const stakeRate = rateBps >= 8800 ? 5 : rateBps >= 8400 ? 6 : rateBps >= 8000 ? 8 : 10;
  const netAdvanceRate = advanceRate - stakeRate; // what seller actually receives upfront

  const advancePreview   = amount ? parseFloat(amount) * advanceRate    / 100 : null;
  const stakePreview     = amount ? parseFloat(amount) * stakeRate       / 100 : null;
  const netAdvPreview    = amount ? parseFloat(amount) * netAdvanceRate  / 100 : null;
  const feePreview       = amount ? parseFloat(amount) * fee             / 100 : null;

  // Max invoice = (size cap % of available liquidity) / advance rate, cap read on-chain
  const maxInvoiceFrac = rawMaxInvoiceBps !== undefined ? Number(rawMaxInvoiceBps) / 10_000 : 0.2;
  const maxInvoiceAmount = liquidity !== null && advanceRate > 0
    ? Math.floor((liquidity * maxInvoiceFrac) / (advanceRate / 100) * 100) / 100
    : null;

  const amountNum = amount ? parseFloat(amount) : 0;
  const invoiceTooLarge = maxInvoiceAmount !== null && amountNum > 0 && amountNum > maxInvoiceAmount;

  // ── Create invoice write ────────────────────────────────────────────────────

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  // Clear form after confirmed — in useEffect to avoid running in render body
  useEffect(() => {
    if (isConfirmed && buyer) {
      setBuyer("");
      setAmount("");
      setDays("30");
      setCustomDate("");
    }
  }, [isConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  const getDueTimestamp = (): bigint => {
    if (days === "custom" && customDate) {
      return BigInt(Math.floor(new Date(customDate).getTime() / 1000));
    }
    return BigInt(Math.floor(Date.now() / 1000) + parseInt(days) * 86400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    writeContract({
      address: CONTRACTS.FLOAT_CORE,
      abi: FloatCoreABI,
      functionName: "createInvoice",
      chainId: arcTestnet.id,
      args: [
        buyer as `0x${string}`,
        parseUnits(amount, USDC_DECIMALS),
        getDueTimestamp(),
      ],
    });
  };

  const isLoading = isPending || isConfirming;
  const canSubmit = !!buyer && !!amount && !isLoading && !!CONTRACTS.FLOAT_CORE && !invoiceTooLarge;

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-sm">Connect your wallet to access Seller dashboard</p>
        <ConnectWalletButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between"
      >
        <div>
          <p className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-1">Seller Dashboard</p>
          <h1 className="text-2xl sm:text-3xl font-medium" style={{ color: "#E1E0CC" }}>Float your invoices.</h1>
        </div>
        <span
          className="hidden sm:inline-flex text-[10px] font-mono px-3 py-1.5 rounded-full tracking-widest uppercase"
          style={{ color: tierColor, background: `${tierColor}18`, border: `1px solid ${tierColor}30` }}
        >
          {tier} · {advanceRate}% advance
        </span>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Available Now",
            value: liquidity !== null ? `$${liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—",
            sub: "pool liquidity",
            icon: <Wallet className="w-4 h-4" />,
            color: "#DEDBC8",
          },
          {
            label: "Total Invoices",
            value: rawInvoiceCount !== undefined ? String(rawInvoiceCount) : "—",
            sub: "on-chain",
            icon: <Clock className="w-4 h-4" />,
            color: "#FFA500",
          },
          {
            label: "Score",
            value: `${score}/100`,
            sub: tier,
            icon: <TrendingUp className="w-4 h-4" />,
            color: tierColor,
          },
          {
            label: "Advance Rate",
            value: `${advanceRate}%`,
            sub: "of invoice value",
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: "#22c55e",
          },
        ].map(({ label, value, sub, icon, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-[10px] uppercase tracking-widest">{label}</span>
                <span style={{ color }}>{icon}</span>
              </div>
              <p className="font-bold text-xl sm:text-2xl tabular-nums" style={{ color }}>{value}</p>
              <p className="text-gray-600 text-xs mt-1">{sub}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Main grid: form + credit score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">

        {/* Create Invoice Form */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-2 flex flex-col"
        >
          <GlassCard className="p-6 flex-1">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[#E1E0CC] font-medium">New Invoice</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInfo(!showInfo)}
                    className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    <Info className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <Plus className="w-4 h-4 text-gray-500" />
                </div>
              </div>

              <AnimatePresence>
                {showInfo && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-4 py-3 text-xs text-gray-400 leading-relaxed overflow-hidden"
                  >
                    Your tier is <span style={{ color: tierColor }} className="font-semibold">{tier}</span> ({advanceRate}% advance).
                    When the buyer approves and locks collateral you receive <span className="text-primary font-semibold">{netAdvanceRate}%</span> upfront.
                    A <span className="text-primary font-semibold">{stakeRate}%</span> stake is held and returned to you when the buyer pays.
                    The remaining <span className="text-primary font-semibold">{fee.toFixed(0)}%</span> is the float fee.
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-1">
                <label className="text-gray-500 text-[10px] uppercase tracking-widest">Buyer Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value)}
                  className="bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-gray-500 text-[10px] uppercase tracking-widest">Invoice Amount (USDC)</label>
                  <div className="flex items-center bg-black/40 rounded-xl border border-white/10 focus-within:border-primary/40 transition-colors overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAmount((v) => String(Math.max(0, (parseFloat(v) || 0) - 100)))}
                      className="px-3 py-3 text-gray-500 hover:text-[#E1E0CC] hover:bg-white/5 transition-colors text-base font-light select-none"
                    >−</button>
                    <input
                      type="number"
                      placeholder="10,000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 bg-transparent text-[#E1E0CC] px-2 py-3 text-sm outline-none placeholder:text-gray-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount((v) => String((parseFloat(v) || 0) + 100))}
                      className="px-3 py-3 text-gray-500 hover:text-[#E1E0CC] hover:bg-white/5 transition-colors text-base font-light select-none"
                    >+</button>
                  </div>
                  {/* Too large warning */}
                  {invoiceTooLarge && maxInvoiceAmount !== null && (
                    <p className="text-red-400 text-[11px] flex items-center gap-1.5 mt-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Max invoice: ${maxInvoiceAmount.toLocaleString()} USDC (pool cap)
                    </p>
                  )}
                  {/* Helpful hint when amount is empty */}
                  {!amount && maxInvoiceAmount !== null && (
                    <p className="text-gray-600 text-[11px] mt-1">
                      Max this invoice: ${maxInvoiceAmount.toLocaleString()} USDC
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-500 text-[10px] uppercase tracking-widest">Payment Due</label>
                  <div className="grid grid-cols-5 gap-1 p-1 bg-black/40 rounded-xl border border-white/10">
                    {["15", "30", "60", "90", "custom"].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setDays(d); if (d !== "custom") setCustomDate(""); }}
                        className="py-2 rounded-lg text-xs font-medium transition-all duration-200 capitalize"
                        style={{
                          background: days === d ? "rgba(222,219,200,0.15)" : "transparent",
                          color: days === d ? "#DEDBC8" : "rgba(156,163,175,0.7)",
                          border: days === d ? "1px solid rgba(222,219,200,0.2)" : "1px solid transparent",
                        }}
                      >
                        {d === "custom" ? "Custom" : `${d}d`}
                      </button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {days === "custom" && (
                      <motion.input
                        key="custom-date"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors [color-scheme:dark]"
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Advance preview */}
              <AnimatePresence>
                {advancePreview !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="rounded-xl border border-white/[0.07] overflow-hidden"
                    style={{ background: "rgba(222,219,200,0.04)" }}
                  >
                    <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                      <div className="p-4">
                        <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">You receive now</p>
                        <p className="text-[#DEDBC8] font-bold text-xl tabular-nums">
                          ${netAdvPreview!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-gray-600 text-xs mt-1">{netAdvanceRate}% net</p>
                      </div>
                      <div className="p-4">
                        <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">Stake (returned)</p>
                        <p className="text-yellow-400 font-bold text-xl tabular-nums">
                          ${stakePreview!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-gray-600 text-xs mt-1">{stakeRate}% · back on pay</p>
                      </div>
                      <div className="p-4">
                        <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">Float fee</p>
                        <p className="text-gray-400 font-bold text-xl tabular-nums">
                          ${feePreview!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-gray-600 text-xs mt-1">{fee.toFixed(0)}% · protocol spread</p>
                      </div>
                    </div>
                    <div className="px-4 pb-3">
                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden flex">
                        <div className="h-full bg-[#DEDBC8]" style={{ width: `${netAdvanceRate}%` }} />
                        <div className="h-full bg-yellow-400/70" style={{ width: `${stakeRate}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[#DEDBC8] text-[10px]">{netAdvanceRate}% net advance</span>
                        <span className="text-yellow-400/70 text-[10px]">{stakeRate}% stake</span>
                        <span className="text-gray-500 text-[10px]">{fee.toFixed(0)}% fee</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <TxError error={writeError as Error | null} />

              <button
                type="submit"
                disabled={!canSubmit}
                className="group flex items-center justify-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-6 pr-3 py-3 rounded-full transition-all duration-300 disabled:opacity-30 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isConfirming ? "Confirming on Arc..." : "Waiting for wallet..."}</span>
                  </>
                ) : (
                  <>
                    <span>Create Invoice</span>
                    <span className="bg-black rounded-full w-7 h-7 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                      <ArrowRight className="w-3.5 h-3.5 text-primary" />
                    </span>
                  </>
                )}
              </button>

              <AnimatePresence>
                {isConfirmed && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 justify-center text-[#22c55e] text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Invoice sent to buyer for approval
                    {txHash && (
                      <a
                        href={`https://testnet.arcscan.app/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline opacity-60 hover:opacity-100"
                      >
                        View tx
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </GlassCard>
        </motion.div>

        {/* Credit Score */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col"
        >
          <CreditScoreBadge score={score} tier={tier} advanceRate={advanceRate} className="flex-1" />
        </motion.div>
      </div>

      {/* Pool Health */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <GlassCard className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_#22c55e]" />
              <div>
                <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-0.5">Pool Liquidity</p>
                <p className="text-[#E1E0CC] font-medium text-sm">
                  {liquidity !== null
                    ? `$${liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC available`
                    : "Loading pool data..."}
                </p>
              </div>
            </div>
            {utilPct !== null && (
              <div className="flex items-center gap-3 min-w-0 sm:min-w-[200px]">
                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${utilPct}%`, background: utilPct > 80 ? "#ef4444" : "#22c55e" }}
                  />
                </div>
                <span className="text-xs font-mono shrink-0" style={{ color: utilPct > 80 ? "#ef4444" : "#22c55e" }}>
                  {utilPct}% util.
                </span>
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* Stale invoices — cancellable by timeout */}
      {(() => {
        const nowS = Date.now() / 1000;
        const staleApproval = invoices.filter(
          (inv) => inv.status === 0 && nowS > Number(inv.createdAt) + APPROVAL_TIMEOUT_S
        );
        const staleCollateral = invoices.filter(
          (inv) => inv.status === 1 && nowS > Number(inv.createdAt) + COLLATERAL_TIMEOUT_S
        );
        const stale = [...staleApproval.map((inv) => ({ inv, type: "approval" as const })), ...staleCollateral.map((inv) => ({ inv, type: "collateral" as const }))];
        if (stale.length === 0) return null;
        return (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <h2 className="text-red-400 text-[10px] uppercase tracking-widest font-semibold">Stale Invoices ({stale.length})</h2>
              <span className="text-gray-600 text-xs">· timed out, no action taken by buyer</span>
            </div>
            <div className="flex flex-col gap-2">
              {stale.map(({ inv, type }) => (
                <StaleInvoiceCard key={`${type}-${String(inv.id)}`} inv={inv} type={type} />
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* Invoice list */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[#E1E0CC] font-medium">My Invoices</h2>
          <span className="text-gray-500 text-xs">on-chain history</span>
        </div>
        <InvoiceTable invoices={invoices} role="seller" />
      </motion.div>
    </div>
  );
}

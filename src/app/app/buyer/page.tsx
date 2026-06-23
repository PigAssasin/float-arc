"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAppWallet } from "@/hooks/use-app-wallet";
import { formatUnits, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WrongChainBanner } from "@/components/shared/WrongChainBanner";
import { VerifyBadge } from "@/components/shared/VerifyBadge";
import { CONTRACTS, FloatCoreABI, ERC20ABI, USDC_DECIMALS, InvoiceStatus } from "@/lib/contracts";
import { arcTestnet } from "@/lib/wagmi-config";
import { useMyInvoices, OnChainInvoice } from "@/hooks/use-my-invoices";
import { CheckCircle2, AlertTriangle, Clock, DollarSign, ShieldCheck, Loader2, AlertCircle, XCircle, Lock, ChevronRight } from "lucide-react";

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

function getDaysUntil(ts: number): number {
  return Math.ceil((ts * 1000 - Date.now()) / 86_400_000);
}

function DueBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0)
    return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">Overdue {Math.abs(daysLeft)}d</span>;
  if (daysLeft <= 7)
    return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">{daysLeft}d left</span>;
  if (daysLeft <= 14)
    return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 border border-orange-400/20">{daysLeft}d left</span>;
  return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{daysLeft}d left</span>;
}

function TxError({ error }: { error: Error | null }) {
  if (!error) return null;
  const msg = (error.message ?? "") + JSON.stringify((error as unknown as Record<string, unknown>).cause ?? "");
  let friendly = "";
  if (msg.includes("NotBuyer") || msg.includes("not assigned"))
    friendly = "Wrong account — this invoice belongs to a different buyer address. Switch to the correct account in your wallet.";
  else if (msg.includes("WrongStatus"))
    friendly = "Invoice status changed. Please refresh the page.";
  else if (msg.includes("insufficient allowance") || msg.includes("ERC20: insufficient"))
    friendly = "Approve USDC spending first.";
  else if (msg.includes("User rejected") || msg.includes("user rejected"))
    friendly = "Transaction rejected in wallet.";
  else if (msg.includes("insufficient funds") || msg.includes("InsufficientFunds"))
    friendly = "Insufficient USDC for gas. You need a small amount of USDC to pay transaction fees on Arc Testnet.";
  else if (msg.includes("ChainMismatch") || msg.includes("chain"))
    friendly = "Network mismatch — click Switch Network at the top of the page.";
  else if (msg.includes("execution reverted"))
    friendly = "Transaction reverted on-chain. Check that you are connected as the correct buyer account.";
  else
    friendly = "Transaction failed — " + (error.message?.slice(0, 80) ?? "unknown error");
  return (
    <div className="flex items-start gap-2 text-red-400 text-xs rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{friendly}</span>
    </div>
  );
}

// ── Approval card (PENDING_APPROVAL) ────────────────────────────────────────

function ApprovalCard({ inv }: { inv: OnChainInvoice }) {
  const { writeContract: approveInvWrite, data: approveTxHash, isPending: approvePending, error: approveError, reset: resetApprove } = useWriteContract();
  const { writeContract: rejectInvWrite, data: rejectTxHash, isPending: rejectPending, error: rejectError, reset: resetReject } = useWriteContract();
  const { isSuccess: approved } = useWaitForTransactionReceipt({ hash: approveTxHash, confirmations: 1 });
  const { isSuccess: rejected } = useWaitForTransactionReceipt({ hash: rejectTxHash, confirmations: 1 });

  const daysLeft = getDaysUntil(Number(inv.dueDate));
  const amountFmt = Number(formatUnits(inv.amount, USDC_DECIMALS)).toLocaleString();
  const collateralFmt = Number(formatUnits(inv.collateral, USDC_DECIMALS)).toLocaleString();
  const advanceFmt = Number(formatUnits(inv.advance, USDC_DECIMALS)).toLocaleString();

  if (approved) {
    return (
      <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/[0.04] p-5 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#22c55e] shrink-0" />
        <div>
          <p className="text-[#22c55e] text-sm font-medium">Invoice #{String(inv.id)} approved</p>
          <p className="text-gray-500 text-xs">Now lock collateral to fund the advance.</p>
        </div>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="rounded-2xl border border-gray-700 bg-white/[0.02] p-5 flex items-center gap-3 opacity-60">
        <XCircle className="w-5 h-5 text-gray-500 shrink-0" />
        <p className="text-gray-500 text-sm">Invoice #{String(inv.id)} rejected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.03] p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-400/15 text-orange-400 border border-orange-400/20">
              Pending Your Approval
            </span>
            <span className="ml-auto text-[10px] font-mono text-gray-500">#{String(inv.id)}</span>
          </div>
          <p className="text-[#E1E0CC] font-medium text-lg tabular-nums mb-1">
            ${amountFmt} USDC invoice
          </p>
          <p className="text-gray-400 text-xs mb-1">
            From seller: <span className="font-mono">{inv.seller.slice(0, 6)}...{inv.seller.slice(-4)}</span>
          </p>
          <p className="text-gray-600 text-xs">
            Must approve as: <span className="font-mono text-gray-500">{inv.buyer.slice(0, 8)}...{inv.buyer.slice(-6)}</span>
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
            <span>Advance to seller: <span className="text-[#DEDBC8]">${advanceFmt}</span></span>
            <span>·</span>
            <span>Your collateral lock: <span className="text-orange-300">${collateralFmt}</span></span>
            <span>·</span>
            <DueBadge daysLeft={daysLeft} />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { resetReject(); rejectInvWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "rejectInvoice", args: [inv.id], chainId: arcTestnet.id }); }}
            disabled={approvePending || rejectPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border border-red-500/30 text-red-400 bg-red-500/[0.06] hover:bg-red-500/[0.12] disabled:opacity-50"
          >
            {rejectPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            Reject
          </button>
          <button
            onClick={() => { resetApprove(); approveInvWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "approveInvoice", args: [inv.id], chainId: arcTestnet.id }); }}
            disabled={approvePending || rejectPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border border-[#22c55e]/30 text-[#22c55e] bg-[#22c55e]/[0.06] hover:bg-[#22c55e]/[0.12] disabled:opacity-50"
          >
            {approvePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Approve
          </button>
        </div>
      </div>
      <TxError error={(approveError || rejectError) as Error | null} />
    </div>
  );
}

// ── Collateral card (PENDING_COLLATERAL) ─────────────────────────────────────

function CollateralCard({ inv, address }: { inv: OnChainInvoice; address: `0x${string}` }) {
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: ERC20ABI,
    functionName: "allowance",
    args: [address, CONTRACTS.FLOAT_CORE],
    query: { enabled: !!address },
  });

  const { writeContract: approveUSDC, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { writeContract: lockWrite, data: lockTxHash, isPending: lockPending, error: lockError } = useWriteContract();
  const { writeContract: financeWrite, data: financeTxHash, isPending: financePending, error: financeError } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash, confirmations: 1 });
  const { isSuccess: locked } = useWaitForTransactionReceipt({ hash: lockTxHash, confirmations: 1 });
  const { isSuccess: financed } = useWaitForTransactionReceipt({ hash: financeTxHash, confirmations: 1 });

  useEffect(() => {
    if (approveConfirmed) refetchAllowance();
  }, [approveConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  const collateralFmt = Number(formatUnits(inv.collateral, USDC_DECIMALS)).toLocaleString();
  const advanceFmt = Number(formatUnits(inv.advance, USDC_DECIMALS)).toLocaleString();
  const feeFmt = Number(formatUnits(inv.fee, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const buyerDiscount = (inv.fee * BigInt(7500)) / BigInt(10000);
  const buyerDiscountFmt = Number(formatUnits(buyerDiscount, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const approvalAmount = inv.advance > inv.collateral ? inv.advance : inv.collateral;
  const hasLockAllowance = allowance !== undefined && allowance >= inv.collateral;
  const hasFinanceAllowance = allowance !== undefined && allowance >= inv.advance;
  const canLock = hasLockAllowance || approveConfirmed;
  const canFinance = hasFinanceAllowance || approveConfirmed;

  if (locked || financed) {
    return (
      <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/[0.04] p-5 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#22c55e] shrink-0" />
        <div>
          <p className="text-[#22c55e] text-sm font-medium">
            {financed ? "Buyer-financed advance sent to seller" : "Collateral locked, advance sent to seller"}
          </p>
          <p className="text-gray-500 text-xs">${advanceFmt} USDC sent to seller. Invoice is now active.</p>
        </div>
        {(lockTxHash || financeTxHash) && (
          <a href={`https://testnet.arcscan.app/tx/${lockTxHash ?? financeTxHash}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-gray-500 underline hover:text-gray-300">View tx</a>
        )}
      </div>
    );
  }

  const dueDate = new Date(Number(inv.dueDate) * 1000).toLocaleDateString();

  return (
    <div
      className="relative rounded-2xl border border-yellow-400/20 overflow-hidden p-5 transition-all duration-300"
      style={{ backdropFilter: "blur(24px) saturate(160%)", background: "rgba(234,179,8,0.025)" }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/20">
          <Lock className="w-2.5 h-2.5" /> Needs Collateral
        </span>
        <span className="ml-auto text-[10px] font-mono text-gray-500">#{String(inv.id)}</span>
      </div>

      {/* Amount */}
      <p className="text-[#E1E0CC] font-bold text-2xl tabular-nums mb-1">${collateralFmt} USDC</p>
      <p className="text-gray-500 text-xs mb-4">
        Collateral is held while invoice is active and returned in full when you pay.
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Collateral</p>
          <p className="text-yellow-300 text-sm font-bold tabular-nums">${collateralFmt}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Seller Advance</p>
          <p className="text-gray-400 text-sm tabular-nums">${advanceFmt}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Due Date</p>
          <p className="text-gray-400 text-sm">{dueDate}</p>
        </div>
      </div>

      {/* Step flow */}
      <div className="flex items-center gap-2">
        {/* Step 1 */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${canLock ? "bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30" : "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30"}`}>
          {canLock ? "✓" : "1"}
        </div>
        {!canLock ? (
          <button
            onClick={() => approveUSDC({ address: CONTRACTS.USDC, abi: ERC20ABI, functionName: "approve", args: [CONTRACTS.FLOAT_CORE, approvalAmount], chainId: arcTestnet.id })}
            disabled={approvePending}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-yellow-400/30 text-yellow-300 bg-yellow-400/[0.08] hover:bg-yellow-400/[0.14] disabled:opacity-50 transition-all"
          >
            {approvePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Approve USDC
          </button>
        ) : (
          <span className="text-xs text-[#22c55e] font-medium">USDC approved</span>
        )}

        <ChevronRight className="w-4 h-4 text-gray-700 shrink-0" />

        {/* Step 2 */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${canLock ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30" : "bg-white/[0.04] text-gray-700 border border-white/[0.08]"}`}>
          2
        </div>
        <button
          onClick={() => lockWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "lockCollateral", args: [inv.id], chainId: arcTestnet.id })}
          disabled={!canLock || lockPending}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium border transition-all disabled:opacity-50"
          style={{
            background: canLock ? "rgba(234,179,8,0.14)" : "rgba(255,255,255,0.03)",
            borderColor: canLock ? "rgba(234,179,8,0.35)" : "rgba(255,255,255,0.06)",
            color: canLock ? "#fde047" : "#4b5563",
          }}
        >
          {lockPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
          Lock Collateral
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-[#DEDBC8]/10 bg-[#DEDBC8]/[0.035] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-[#DEDBC8] text-sm font-medium">Buyer finance option</p>
            <p className="text-gray-500 text-xs mt-1">
              Fund the ${advanceFmt} advance yourself, skip collateral, and keep ${buyerDiscountFmt} of the ${feeFmt} fee as your discount.
            </p>
          </div>
          <button
            onClick={() => financeWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "financeAsBuyer", args: [inv.id], chainId: arcTestnet.id })}
            disabled={!canFinance || financePending}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium border border-[#DEDBC8]/25 text-[#DEDBC8] bg-[#DEDBC8]/[0.08] hover:bg-[#DEDBC8]/[0.15] disabled:opacity-50 transition-all"
          >
            {financePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
            {canFinance ? "Finance as Buyer" : "Approve first"}
          </button>
        </div>
      </div>

      <TxError error={(approveError || lockError || financeError) as Error | null} />
    </div>
  );
}

// Funded card (FUNDED), buyer repays the full face value in v6a.

function FundedCard({ inv, address, onSettled }: { inv: OnChainInvoice; address: `0x${string}`; onSettled?: () => void }) {
  const { data: earlyRepay } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "earlyRepayAmount",
    args: [inv.id],
    query: { enabled: !!CONTRACTS.FLOAT_CORE },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: ERC20ABI,
    functionName: "allowance",
    args: [address, CONTRACTS.FLOAT_CORE],
    query: { enabled: !!address },
  });

  const [partialStr, setPartialStr] = useState("");

  const { writeContract: approveUSDC, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { writeContract: payWrite, data: payTxHash, isPending: payPending, error: payError } = useWriteContract();
  const { writeContract: partialWrite, data: partialTxHash, isPending: partialPending, error: partialError } = useWriteContract();
  const { writeContract: defaultWrite, data: defaultTxHash, isPending: defaultPending, error: defaultError } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash, confirmations: 1 });
  const { isSuccess: paid } = useWaitForTransactionReceipt({ hash: payTxHash, confirmations: 1 });
  const { isSuccess: partialPaid } = useWaitForTransactionReceipt({ hash: partialTxHash, confirmations: 1 });
  const { isSuccess: markedDefault } = useWaitForTransactionReceipt({ hash: defaultTxHash, confirmations: 1 });

  // wagmi v2 has no onSuccess on useWaitForTransactionReceipt — refetch allowance once approve confirms
  useEffect(() => {
    if (approveConfirmed) refetchAllowance();
  }, [approveConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (partialPaid || paid || markedDefault) onSettled?.();
  }, [partialPaid, paid, markedDefault]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountDue = earlyRepay ? earlyRepay[0] : inv.amount;
  const discount = earlyRepay ? earlyRepay[1] : BigInt(0);
  const amountDueFmt = Number(formatUnits(amountDue, USDC_DECIMALS)).toLocaleString();
  const discountFmt = Number(formatUnits(discount, USDC_DECIMALS)).toFixed(2);
  const collateralFmt = Number(formatUnits(inv.collateral, USDC_DECIMALS)).toLocaleString();
  const daysLeft = getDaysUntil(Number(inv.dueDate));
  const isUrgent = daysLeft <= 14;
  const pastGrace = daysLeft <= -7; // past dueDate + 7-day grace period
  const hasDiscount = discount > BigInt(0);
  const isBuyerFinanced = inv.financier === 1;

  // Installments: how much of the face value has already been paid
  const amountPaidSoFar = inv.amountPaid;
  const remaining = inv.amount - amountPaidSoFar;
  const paidPct = inv.amount > BigInt(0) ? Number((amountPaidSoFar * BigInt(10000)) / inv.amount) / 100 : 0;
  const hasPartial = amountPaidSoFar > BigInt(0);
  const amountPaidFmt = Number(formatUnits(amountPaidSoFar, USDC_DECIMALS)).toLocaleString();
  const remainingFmt = Number(formatUnits(remaining, USDC_DECIMALS)).toLocaleString();

  const partialAmount = partialStr && Number(partialStr) > 0 ? parseUnits(partialStr, USDC_DECIMALS) : BigInt(0);
  const partialValid = partialAmount > BigInt(0) && partialAmount <= remaining;
  const hasAllowance = (allowance !== undefined && allowance >= amountDue) || approveConfirmed;
  const hasPartialAllowance = allowance !== undefined && partialAmount > BigInt(0) && allowance >= partialAmount;

  if (paid) {
    return (
      <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/[0.04] p-5 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#22c55e] shrink-0" />
        <div>
          <p className="text-[#22c55e] text-sm font-medium">Invoice #{String(inv.id)} paid</p>
          <p className="text-gray-500 text-xs">
            {isBuyerFinanced ? "Buyer-financed invoice settled with your discount." : `Collateral $${collateralFmt} returned to your wallet.`}
          </p>
        </div>
        {payTxHash && (
          <a href={`https://testnet.arcscan.app/tx/${payTxHash}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-gray-500 underline hover:text-gray-300">View tx</a>
        )}
      </div>
    );
  }

  if (markedDefault) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <div>
          <p className="text-red-400 text-sm font-medium">Invoice #{String(inv.id)} marked as defaulted</p>
          <p className="text-gray-500 text-xs">
            {isBuyerFinanced ? "No LP capital was at risk in this buyer-financed invoice." : `Collateral $${collateralFmt} has been slashed to the pool.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden p-5 transition-all duration-300 ${pastGrace ? "border-red-500/20 bg-red-500/[0.03]" : isUrgent ? "border-orange-400/20 bg-orange-400/[0.03]" : "border-white/[0.07] bg-white/[0.03]"}`}
      style={{ backdropFilter: "blur(24px)" }}
    >
      {pastGrace && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
      )}
      {!pastGrace && isUrgent && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
      )}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {pastGrace
              ? <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Grace period ended</span>
              : <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">Active</span>
            }
            {isUrgent && !pastGrace && <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />}
            {hasDiscount && !pastGrace && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">
                {isBuyerFinanced ? `Buyer finance discount $${discountFmt}` : `Save $${discountFmt}`}
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono text-gray-500">#{String(inv.id)}</span>
          </div>
          <p className="text-[#E1E0CC] font-bold text-2xl tabular-nums mb-1">
            ${amountDueFmt} USDC
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
            <DueBadge daysLeft={daysLeft} />
            <span>Due {new Date(Number(inv.dueDate) * 1000).toLocaleDateString()}</span>
            <span>·</span>
            <span>
              {isBuyerFinanced ? "Buyer-financed" : <>Collateral locked: <span className="text-yellow-300">${collateralFmt}</span></>}
            </span>
          </div>
          {pastGrace && (
            <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {isBuyerFinanced
                ? "Grace period over. Pay now or this buyer-financed invoice can be marked as defaulted."
                : `Grace period over. Pay now or this invoice will be marked as defaulted and your $${collateralFmt} collateral will be slashed.`}
            </p>
          )}
          {!pastGrace && hasDiscount && (
            <p className="text-green-400 text-xs mt-2">
              {isBuyerFinanced
                ? `Buyer-financed mode reduces your remaining payment by $${discountFmt}.`
                : `Contract reports a $${discountFmt} repayment adjustment.`}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {!hasAllowance && (
            <button
              onClick={() => approveUSDC({ address: CONTRACTS.USDC, abi: ERC20ABI, functionName: "approve", args: [CONTRACTS.FLOAT_CORE, amountDue], chainId: arcTestnet.id })}
              disabled={approvePending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-orange-400/30 text-orange-300 bg-orange-400/[0.06] hover:bg-orange-400/[0.12] disabled:opacity-50 transition-all"
            >
              {approvePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Step 1: Approve USDC
            </button>
          )}
          <button
            onClick={() => payWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "payInvoice", args: [inv.id], chainId: arcTestnet.id })}
            disabled={!hasAllowance || payPending}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium border transition-all disabled:opacity-50"
            style={{
              background: pastGrace ? "rgba(239,68,68,0.15)" : isUrgent ? "rgba(251,146,60,0.15)" : "rgba(222,219,200,0.12)",
              borderColor: pastGrace ? "rgba(239,68,68,0.3)" : isUrgent ? "rgba(251,146,60,0.3)" : "rgba(222,219,200,0.2)",
              color: pastGrace ? "#f87171" : isUrgent ? "#fb923c" : "#DEDBC8",
            }}
          >
            {payPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {hasAllowance ? (hasPartial ? `Pay remaining $${amountDueFmt}` : `Pay $${amountDueFmt}`) : "Step 2: Pay"}
          </button>
          {pastGrace && (
            <button
              onClick={() => defaultWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "markDefault", args: [inv.id], chainId: arcTestnet.id })}
              disabled={defaultPending}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border border-red-500/20 text-red-400/60 bg-red-500/[0.04] hover:bg-red-500/[0.08] disabled:opacity-50 transition-all"
            >
              {defaultPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Mark as Defaulted
            </button>
          )}
        </div>
      </div>

      {/* Installments / partial repayment */}
      {!pastGrace && !isBuyerFinanced && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          {hasPartial && (
            <div className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-gray-500">Paid ${amountPaidFmt} of face value</span>
                <span className="text-[#DEDBC8]">{paidPct}% · ${remainingFmt} left</span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-[#DEDBC8] transition-all duration-500" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          )}
          <p className="text-gray-500 text-[11px] mb-2">Or pay in installments (no early-payment discount on partials):</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              value={partialStr}
              onChange={(e) => setPartialStr(e.target.value)}
              placeholder={`Amount (max $${remainingFmt})`}
              className="flex-1 bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-2 text-sm outline-none focus:border-primary/40 placeholder:text-gray-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {!hasPartialAllowance ? (
              <button
                onClick={() => approveUSDC({ address: CONTRACTS.USDC, abi: ERC20ABI, functionName: "approve", args: [CONTRACTS.FLOAT_CORE, partialAmount], chainId: arcTestnet.id })}
                disabled={!partialValid || approvePending}
                className="px-4 py-2 rounded-full text-sm font-medium border border-white/15 text-gray-300 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 transition-all whitespace-nowrap"
              >
                {approvePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
              </button>
            ) : (
              <button
                onClick={() => partialWrite({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "payPartial", args: [inv.id, partialAmount], chainId: arcTestnet.id })}
                disabled={!partialValid || partialPending}
                className="px-4 py-2 rounded-full text-sm font-medium border border-[#DEDBC8]/25 text-[#DEDBC8] bg-[#DEDBC8]/[0.08] hover:bg-[#DEDBC8]/[0.15] disabled:opacity-40 transition-all whitespace-nowrap"
              >
                {partialPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pay installment"}
              </button>
            )}
          </div>
          {partialPaid && <p className="text-[#22c55e] text-[11px] mt-2">Installment received. Refreshing balance…</p>}
        </div>
      )}

      <TxError error={(approveError || payError || partialError || defaultError) as Error | null} />
    </div>
  );
}

// ── Buyer tier helpers ────────────────────────────────────────────────────────

const BUYER_TIER_COLORS: Record<string, string> = {
  New: "#ef4444",
  Fair: "#f97316",
  Good: "#DEDBC8",
  Excellent: "#22c55e",
};

function buyerScoreToTier(score: number): string {
  if (score >= 86) return "Excellent";
  if (score >= 71) return "Good";
  if (score >= 41) return "Fair";
  return "New";
}

function buyerTierCollateral(tier: string): string {
  if (tier === "Excellent") return "~5% collateral";
  if (tier === "Good") return "~12% collateral";
  if (tier === "Fair") return "~20% collateral";
  return "~30% collateral";
}

// ── Buyer page ───────────────────────────────────────────────────────────────

export default function BuyerPage() {
  const { isConnected, address } = useAppWallet();
  const { invoices, isLoading, total, refetch } = useMyInvoices(address, "buyer");

  const { data: rawBuyerScore } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "buyerScore",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.FLOAT_CORE },
  });

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-sm">Connect your wallet to access Buyer dashboard</p>
        <ConnectButton />
      </div>
    );
  }

  const pendingApproval   = invoices.filter((inv) => inv.status === InvoiceStatus.PENDING_APPROVAL);
  const pendingCollateral = invoices.filter((inv) => inv.status === InvoiceStatus.PENDING_COLLATERAL);
  const funded            = invoices.filter((inv) => inv.status === InvoiceStatus.FUNDED);
  const history           = invoices.filter((inv) =>
    inv.status === InvoiceStatus.PAID ||
    inv.status === InvoiceStatus.DEFAULTED ||
    inv.status === InvoiceStatus.CANCELLED
  );

  const actionCount = pendingApproval.length + pendingCollateral.length + funded.length;

  const buyerScore = rawBuyerScore !== undefined ? Number(rawBuyerScore) : 50;
  const buyerTier = buyerScoreToTier(buyerScore);
  const buyerTierColor = BUYER_TIER_COLORS[buyerTier] ?? "#DEDBC8";

  return (
    <div className="flex flex-col gap-6">

      <WrongChainBanner />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between"
      >
        <div>
          <p className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-1">Buyer Dashboard</p>
          <h1 className="text-2xl sm:text-3xl font-medium" style={{ color: "#E1E0CC" }}>Your outstanding invoices.</h1>
        </div>
        <div className="flex items-center gap-2">
          <VerifyBadge />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-full text-gray-400 bg-white/[0.04] border border-white/[0.07]">
            <Clock className="w-3 h-3" />
            {total} total on-chain
          </span>
        </div>
      </motion.div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0, duration: 0.6 }}>
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-[10px] uppercase tracking-widest">Needs Action</span>
              <span style={{ color: actionCount > 0 ? "#FFA500" : "#22c55e" }}><DollarSign className="w-4 h-4" /></span>
            </div>
            <p className="font-bold text-lg tabular-nums" style={{ color: actionCount > 0 ? "#FFA500" : "#22c55e" }}>{actionCount}</p>
            <p className="text-gray-600 text-xs mt-1">pending invoices</p>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07, duration: 0.6 }}>
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-[10px] uppercase tracking-widest">Your Wallet</span>
              <span style={{ color: "#22c55e" }}><ShieldCheck className="w-4 h-4" /></span>
            </div>
            <p className="font-bold text-lg tabular-nums truncate" style={{ color: "#22c55e" }}>
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—"}
            </p>
            <p className="text-gray-600 text-xs mt-1">connected</p>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.6 }}>
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-[10px] uppercase tracking-widest">Buyer Score</span>
              <span style={{ color: buyerTierColor }}><CheckCircle2 className="w-4 h-4" /></span>
            </div>
            <p className="font-bold text-lg tabular-nums" style={{ color: buyerTierColor }}>
              {buyerScore}/100
            </p>
            <p className="text-gray-600 text-xs mt-1">{buyerTier} tier · {buyerTierCollateral(buyerTier)}</p>
          </GlassCard>
        </motion.div>
      </div>

      {isLoading ? (
        <GlassCard className="p-8 flex items-center justify-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          <span className="text-gray-500 text-sm">Loading invoices from chain...</span>
        </GlassCard>
      ) : invoices.length === 0 ? (
        <GlassCard className="p-10 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">No invoices assigned to your wallet.</p>
          <p className="text-gray-700 text-xs">Ask a seller to create an invoice with your address as buyer.</p>
        </GlassCard>
      ) : (
        <>
          {/* Pending Approval (highest priority) */}
          {pendingApproval.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <p className="text-orange-400 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Pending Your Approval ({pendingApproval.length})
              </p>
              <div className="flex flex-col gap-3">
                {pendingApproval.map((inv) => <ApprovalCard key={String(inv.id)} inv={inv} />)}
              </div>
            </motion.div>
          )}

          {/* Pending Collateral */}
          {pendingCollateral.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
              <p className="text-yellow-300 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                Needs Collateral ({pendingCollateral.length})
              </p>
              <div className="flex flex-col gap-3">
                {pendingCollateral.map((inv) => <CollateralCard key={String(inv.id)} inv={inv} address={address as `0x${string}`} />)}
              </div>
            </motion.div>
          )}

          {/* Active (FUNDED) */}
          {funded.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <p className="text-[#E1E0CC] text-[10px] uppercase tracking-widest font-semibold mb-3">
                Active Invoices ({funded.length})
              </p>
              <div className="flex flex-col gap-3">
                {funded.map((inv) => <FundedCard key={String(inv.id)} inv={inv} address={address as `0x${string}`} onSettled={refetch} />)}
              </div>
            </motion.div>
          )}

          {/* History */}
          {history.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
              <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold mb-3">History</p>
              <div className="flex flex-col gap-2">
                {history.map((inv) => {
                  const isPaid = inv.status === InvoiceStatus.PAID;
                  const isDefaulted = inv.status === InvoiceStatus.DEFAULTED;
                  const amountFmt = Number(formatUnits(inv.amount, USDC_DECIMALS)).toLocaleString();
                  const collateralFmt = Number(formatUnits(inv.collateral, USDC_DECIMALS)).toLocaleString();
                  const dueFmt = new Date(Number(inv.dueDate) * 1000).toLocaleDateString();
                  const color = isPaid ? "#22c55e" : isDefaulted ? "#f87171" : "#6b7280";
                  const borderColor = isPaid ? "rgba(34,197,94,0.12)" : isDefaulted ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)";
                  const bgColor = isPaid ? "rgba(34,197,94,0.03)" : isDefaulted ? "rgba(248,113,113,0.03)" : "rgba(255,255,255,0.02)";
                  return (
                    <div
                      key={String(inv.id)}
                      className="rounded-xl px-4 py-3 transition-all"
                      style={{ border: `1px solid ${borderColor}`, background: bgColor }}
                    >
                      <div className="flex items-center gap-3">
                        {isPaid
                          ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color }} />
                          : isDefaulted
                          ? <AlertCircle className="w-4 h-4 shrink-0" style={{ color }} />
                          : <XCircle className="w-4 h-4 shrink-0" style={{ color }} />}
                        <span className="text-gray-500 text-xs font-mono">#{String(inv.id)}</span>
                        <span className="font-medium text-sm tabular-nums" style={{ color }}>${amountFmt}</span>
                        <span
                          className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-widest"
                          style={{ color, borderColor, background: bgColor }}
                        >
                          {isPaid ? "Paid" : isDefaulted ? "Defaulted" : "Cancelled"}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-2 pl-7 text-[11px] text-gray-600">
                        <span>Due {dueFmt}</span>
                        {inv.collateral > BigInt(0) && (
                          <>
                            <span>·</span>
                            {isPaid && <span className="text-[#22c55e]/70">${collateralFmt} collateral returned</span>}
                            {isDefaulted && <span className="text-red-400/70">${collateralFmt} collateral slashed</span>}
                            {!isPaid && !isDefaulted && <span>${collateralFmt} collateral</span>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <GlassCard className="p-5 sm:p-6">
          <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-4">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x sm:divide-white/[0.05]">
            {[
              { num: "01", title: "Approve invoice", desc: "Seller creates an invoice. You verify it is legitimate and approve on-chain." },
              { num: "02", title: "Lock collateral", desc: "Lock a USDC deposit. Returned when you pay. Protects the pool from fraud." },
              { num: "03", title: "Pay invoice", desc: "Pay the full face value at or before due date. v6a has no early-payment discount." },
              { num: "04", title: "Score improves", desc: "On-time payments build your buyer credit score, reducing future collateral requirements." },
            ].map((item) => (
              <div key={item.num} className="sm:px-5 first:sm:pl-0 last:sm:pr-0 flex gap-3">
                <span className="text-[10px] font-mono text-gray-600 tracking-widest shrink-0 mt-0.5">{item.num}</span>
                <div>
                  <p className="text-[#E1E0CC] text-sm font-medium mb-0.5">{item.title}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

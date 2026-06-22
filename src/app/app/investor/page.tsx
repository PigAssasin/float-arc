"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAppWallet } from "@/hooks/use-app-wallet";
import { useCircleWalletContext } from "@/contexts/circle-wallet-context";
import { WrongChainBanner } from "@/components/shared/WrongChainBanner";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CONTRACTS, FloatPoolABI, ERC20ABI, USDC_DECIMALS } from "@/lib/contracts";
import { arcTestnet } from "@/lib/wagmi-config";
import { arcPublicClient, pollUntil } from "@/lib/arc-client";
import { ArrowRight, TrendingUp, Wallet, BarChart3, CheckCircle2, Activity, Loader2, AlertCircle } from "lucide-react";

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
  const [show, setShow] = useState(false);
  if (!error) return null;
  const msg = error.message ?? "";
  let friendly = "Transaction failed.";
  if (msg.includes("InsufficientShares")) friendly = "Not enough shares to withdraw.";
  else if (msg.includes("InsufficientLiquidity")) friendly = "Pool has insufficient liquidity. Try a smaller amount.";
  else if (msg.includes("insufficient allowance") || msg.includes("ERC20InsufficientAllowance")) friendly = "Please approve USDC first.";
  else if (msg.includes("User rejected") || msg.includes("user rejected")) friendly = "Transaction rejected in wallet.";
  else if (msg.includes("chain") || msg.includes("Chain") || msg.includes("network") || msg.includes("Network")) friendly = "Wrong network — switch to Arc Testnet (chain 5042002) in your wallet.";
  else if (msg.includes("not found") || msg.includes("contract")) friendly = "Contract not found — make sure you are on Arc Testnet.";
  return (
    <div className="flex flex-col gap-1.5 text-red-400 text-xs rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{friendly}</span>
        <button onClick={() => setShow(v => !v)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
          {show ? "hide" : "details"}
        </button>
      </div>
      {show && (
        <pre className="text-[10px] text-red-400/60 overflow-auto max-h-28 whitespace-pre-wrap break-all leading-relaxed">
          {msg.slice(0, 600)}
        </pre>
      )}
    </div>
  );
}

export default function InvestorPage() {
  const { isConnected, address, isCircle } = useAppWallet();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  // ── Contract reads ──────────────────────────────────────────────────────────

  const { data: rawTVL } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "totalAssets",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawAvailableLiquidity } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "availableLiquidity",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawMyShares } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "shares",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawTotalShares } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "totalShares",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawShareValue } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "shareValue",
    query: { enabled: !!CONTRACTS.FLOAT_POOL },
  });

  const { data: rawAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: ERC20ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.FLOAT_POOL] : undefined,
    query: { enabled: !!address && !!CONTRACTS.FLOAT_POOL },
  });

  // ── Derived values ──────────────────────────────────────────────────────────

  const tvl = rawTVL ? Number(formatUnits(rawTVL, USDC_DECIMALS)) : null;
  const availableLiquidity = rawAvailableLiquidity ? Number(formatUnits(rawAvailableLiquidity, USDC_DECIMALS)) : null;
  // committed = TVL locked as collateral for active invoices
  const utilPct = tvl !== null && availableLiquidity !== null && tvl > 0
    ? Math.round((1 - availableLiquidity / tvl) * 100)
    : null;
  const myShares = rawMyShares ? Number(formatUnits(rawMyShares, USDC_DECIMALS)) : 0;
  const totalShares = rawTotalShares ? Number(formatUnits(rawTotalShares, USDC_DECIMALS)) : 0;
  // shareValue is scaled 1e18 per share unit
  const shareValueRatio = rawShareValue ? Number(rawShareValue) / 1e18 : 1;
  const myPositionUsdc = myShares * shareValueRatio;
  const depositAmountNum = depositAmount ? parseFloat(depositAmount) : 0;
  // Use availableLiquidity (= investorAssets) not tvl — matches FloatPool.deposit() share calculation
  const estimatedShares = depositAmountNum > 0 && availableLiquidity && totalShares > 0
    ? (depositAmountNum * totalShares) / availableLiquidity
    : depositAmountNum;
  const withdrawAmountNum = withdrawAmount ? parseFloat(withdrawAmount) : 0;
  const estimatedUsdc = withdrawAmountNum * shareValueRatio;

  // Conservative: treat undefined allowance (RPC read still pending) as needing approval
  const needsApprove = depositAmountNum > 0 && (
    rawAllowance === undefined || rawAllowance < parseUnits(depositAmount || "0", USDC_DECIMALS)
  );

  // ── Deposit flow (approve → deposit) ────────────────────────────────────────

  const { writeContract: approveWrite, data: approveTxHash, isPending: approvePending, error: approveError, reset: resetApprove } = useWriteContract();
  const { writeContract: depositWrite, data: depositTxHash, isPending: depositPending, error: depositError, reset: resetDeposit } = useWriteContract();
  const { writeContract: withdrawWrite, data: withdrawTxHash, isPending: withdrawPending, error: withdrawError, reset: resetWithdraw } = useWriteContract();
  const { writeContract: transferWrite, data: transferTxHash, isPending: transferPending, error: transferError, reset: resetTransfer } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash, confirmations: 1 });
  const { isLoading: depositConfirming, isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash, confirmations: 1 });
  const { isLoading: withdrawConfirming, isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawTxHash, confirmations: 1 });
  const { isLoading: transferConfirming, isSuccess: transferConfirmed } = useWaitForTransactionReceipt({ hash: transferTxHash, confirmations: 1 });

  const transferAmtValid = !!transferTo && /^0x[a-fA-F0-9]{40}$/.test(transferTo)
    && transferAmount !== "" && parseFloat(transferAmount) > 0 && parseFloat(transferAmount) <= myShares;
  const handleTransfer = () => {
    resetTransfer();
    transferWrite({
      address: CONTRACTS.FLOAT_POOL,
      abi: FloatPoolABI,
      functionName: "transfer",
      args: [transferTo as `0x${string}`, parseUnits(transferAmount, USDC_DECIMALS)],
      chainId: arcTestnet.id,
    });
  };

  const handleApprove = () => {
    resetApprove();
    approveWrite({
      address: CONTRACTS.USDC,
      abi: ERC20ABI,
      functionName: "approve",
      args: [CONTRACTS.FLOAT_POOL, parseUnits(depositAmount, USDC_DECIMALS)],
      chainId: arcTestnet.id,
    });
  };

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    resetDeposit();
    depositWrite({
      address: CONTRACTS.FLOAT_POOL,
      abi: FloatPoolABI,
      functionName: "deposit",
      args: [parseUnits(depositAmount, USDC_DECIMALS)],
      chainId: arcTestnet.id,
    });
  };

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    resetWithdraw();
    withdrawWrite({
      address: CONTRACTS.FLOAT_POOL,
      abi: FloatPoolABI,
      functionName: "withdraw",
      args: [parseUnits(withdrawAmount, USDC_DECIMALS)],
      chainId: arcTestnet.id,
    });
  };

  // ── Circle wallet flow (PIN-signed contract execution on Arc) ───────────────
  const { executeContract } = useCircleWalletContext();
  const [circleBusy, setCircleBusy] = useState(false);
  const [circleStep, setCircleStep] = useState("");
  const [circleError, setCircleError] = useState<Error | null>(null);
  const [circleDepositDone, setCircleDepositDone] = useState(false);
  const [circleWithdrawDone, setCircleWithdrawDone] = useState(false);

  const handleCircleDeposit = async () => {
    if (!address) return;
    setCircleError(null); setCircleDepositDone(false); setCircleBusy(true);
    try {
      const amt = parseUnits(depositAmount, USDC_DECIMALS);
      setCircleStep("Approve USDC — enter your PIN");
      await executeContract({
        contractAddress: CONTRACTS.USDC,
        abiFunctionSignature: "approve(address,uint256)",
        abiParameters: [CONTRACTS.FLOAT_POOL, amt.toString()],
      });
      setCircleStep("Waiting for approval to confirm…");
      const approved = await pollUntil(async () => {
        const a = (await arcPublicClient.readContract({
          address: CONTRACTS.USDC, abi: ERC20ABI, functionName: "allowance",
          args: [address, CONTRACTS.FLOAT_POOL],
        })) as bigint;
        return a >= amt;
      });
      if (!approved) throw new Error("Approval is taking longer than expected. Please try Deposit again.");
      setCircleStep("Deposit — enter your PIN");
      await executeContract({
        contractAddress: CONTRACTS.FLOAT_POOL,
        abiFunctionSignature: "deposit(uint256)",
        abiParameters: [amt.toString()],
      });
      setCircleStep("Confirming deposit…");
      await new Promise((r) => setTimeout(r, 4000));
      setCircleDepositDone(true);
      setDepositAmount("");
    } catch (e) {
      setCircleError(e as Error);
    } finally {
      setCircleBusy(false); setCircleStep("");
    }
  };

  const handleCircleWithdraw = async () => {
    setCircleError(null); setCircleWithdrawDone(false); setCircleBusy(true);
    try {
      const amt = parseUnits(withdrawAmount, USDC_DECIMALS);
      setCircleStep("Withdraw — enter your PIN");
      await executeContract({
        contractAddress: CONTRACTS.FLOAT_POOL,
        abiFunctionSignature: "withdraw(uint256)",
        abiParameters: [amt.toString()],
      });
      setCircleStep("Confirming…");
      await new Promise((r) => setTimeout(r, 4000));
      setCircleWithdrawDone(true);
      setWithdrawAmount("");
    } catch (e) {
      setCircleError(e as Error);
    } finally {
      setCircleBusy(false); setCircleStep("");
    }
  };

  const depositLoading = approvePending || approveConfirming || depositPending || depositConfirming || circleBusy;
  const withdrawLoading = withdrawPending || withdrawConfirming || circleBusy;

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-sm">Connect your wallet to access Investor dashboard</p>
        <ConnectButton />
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
          <p className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-1">Investor Dashboard</p>
          <h1 className="text-2xl sm:text-3xl font-medium" style={{ color: "#E1E0CC" }}>Earn yield from invoice fees.</h1>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-full text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          Pool live
        </span>
      </motion.div>

      <WrongChainBanner />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pool TVL",    value: tvl !== null ? `$${tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—", sub: "USDC in pool",     icon: <BarChart3 className="w-4 h-4" />,  color: "#DEDBC8" },
          { label: "My Position", value: myShares > 0 ? `$${myPositionUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—",               sub: "current value",  icon: <Wallet className="w-4 h-4" />,     color: "#DEDBC8" },
          { label: "My fLP",      value: myShares > 0 ? myShares.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0",                             sub: "transferable LP token", icon: <TrendingUp className="w-4 h-4" />, color: "#22c55e" },
          { label: "Share Value", value: rawShareValue ? `$${shareValueRatio.toFixed(4)}` : "—",                                                            sub: "per share",      icon: <Activity className="w-4 h-4" />,   color: "#FFA500" },
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

      {/* My position + sparkline */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.6 }}>
        <GlassCard className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
            <div className="sm:col-span-2">
              <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-3">My Position</p>
              {myShares > 0 ? (
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Shares owned</p>
                    <p className="text-[#E1E0CC] font-bold text-2xl tabular-nums">
                      {myShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </p>
                  </div>
                  <div className="text-gray-600 text-xl mb-1">→</div>
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Current USDC value</p>
                    <p className="text-[#DEDBC8] font-bold text-2xl tabular-nums">
                      ${myPositionUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Deposit USDC to start earning yield from invoice fees.</p>
              )}

              {/* Pool utilization */}
              {utilPct !== null && (
                <div className="mt-5">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-gray-500 text-[10px] uppercase tracking-widest">Collateral committed</span>
                    <span className="text-[#22c55e] text-[10px] font-mono">{utilPct}%</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, utilPct)}%` }}
                      transition={{ delay: 0.5, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#22c55e]/60"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Current share value */}
            <div className="hidden sm:flex flex-col gap-2 justify-center">
              <p className="text-gray-500 text-[10px] uppercase tracking-widest">Current share value</p>
              <p className="text-[#22c55e] font-bold text-3xl tabular-nums">
                ${shareValueRatio.toFixed(4)}
              </p>
              <p className="text-[10px] text-gray-600">per fLP · rises as fees accrue</p>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Deposit / Withdraw */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.6 }}>
        <GlassCard className="p-6 flex flex-col gap-5">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
            {(["deposit", "withdraw"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-xs font-medium tracking-wide rounded-lg transition-all duration-200 capitalize"
                style={{
                  background: tab === t ? "rgba(222,219,200,0.12)" : "transparent",
                  color: tab === t ? "#DEDBC8" : "rgba(156,163,175,0.8)",
                  border: tab === t ? "1px solid rgba(222,219,200,0.12)" : "1px solid transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === "deposit" ? (
              <motion.div
                key="deposit"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-4"
              >
                <div>
                  <p className="text-[#E1E0CC] font-medium mb-1">Deposit USDC</p>
                  <p className="text-gray-500 text-xs">Add USDC to the pool and earn yield from invoice fees.</p>
                </div>
                <input
                  type="number"
                  placeholder="Amount in USDC"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-700"
                />
                {depositAmount && (
                  <div className="text-xs text-gray-500 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.05]">
                    <p>Estimated shares: <span className="text-[#DEDBC8] font-medium">{estimatedShares.toFixed(4)}</span></p>
                    <p className="mt-0.5">Current share value: <span className="text-[#22c55e] font-medium">${shareValueRatio.toFixed(4)} / share</span></p>
                  </div>
                )}

                <TxError error={(approveError || depositError || (isCircle ? circleError : null)) as Error | null} />

                {isCircle ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCircleDeposit}
                      disabled={!depositAmount || depositLoading}
                      className="group flex items-center justify-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-5 pr-3 py-3 rounded-full transition-all duration-300 disabled:opacity-30"
                    >
                      {circleBusy ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {circleStep || "Processing…"}</>
                      ) : (
                        <>
                          <span>Deposit into Pool</span>
                          <span className="bg-black rounded-full w-7 h-7 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <ArrowRight className="w-3.5 h-3.5 text-primary" />
                          </span>
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-gray-600 text-center">Circle Wallet signs with your PIN. You will be asked twice: approve, then deposit.</p>
                    <AnimatePresence>
                      {circleDepositDone && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[#22c55e] text-sm">
                          <CheckCircle2 className="w-4 h-4" /> Deposited · shares minted to your wallet
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <>
                    {/* Step 1: Approve (if needed) */}
                    {needsApprove && !approveConfirmed && (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={depositLoading}
                        className="flex items-center justify-center gap-2 text-sm font-medium px-5 py-3 rounded-full transition-all duration-300 disabled:opacity-50"
                        style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c" }}
                      >
                        {approvePending || approveConfirming
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Approving USDC…</>
                          : <>Step 1: Approve USDC</>}
                      </button>
                    )}

                    {/* Step 2: Deposit */}
                    <button
                      type="button"
                      onClick={handleDeposit}
                      disabled={!depositAmount || depositLoading || (needsApprove && !approveConfirmed)}
                      className="group flex items-center justify-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-5 pr-3 py-3 rounded-full transition-all duration-300 disabled:opacity-30"
                    >
                      {depositPending || depositConfirming ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />{depositConfirming ? "Confirming on Arc…" : "Waiting for wallet…"}</>
                      ) : (
                        <>
                          <span>{needsApprove && !approveConfirmed ? "Step 2: " : ""}Deposit into Pool</span>
                          <span className="bg-black rounded-full w-7 h-7 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <ArrowRight className="w-3.5 h-3.5 text-primary" />
                          </span>
                        </>
                      )}
                    </button>

                    <AnimatePresence>
                      {depositConfirmed && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[#22c55e] text-sm">
                          <CheckCircle2 className="w-4 h-4" /> Deposited · shares minted to your wallet
                          {depositTxHash && (
                            <a href={`https://testnet.arcscan.app/tx/${depositTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-60">View tx</a>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="withdraw"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-4"
              >
                <div>
                  <p className="text-[#E1E0CC] font-medium mb-1">Withdraw</p>
                  <p className="text-gray-500 text-xs">
                    Redeem your shares for USDC. You own <span className="text-[#DEDBC8]">{myShares.toFixed(4)}</span> shares.
                  </p>
                </div>
                <input
                  type="number"
                  placeholder="Shares to redeem"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  max={myShares}
                  className="bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-700"
                />
                {withdrawAmount && (
                  <div className="text-xs text-gray-500 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.05]">
                    You receive: <span className="text-[#DEDBC8] font-medium">${estimatedUsdc.toFixed(2)} USDC</span>
                  </div>
                )}

                <TxError error={withdrawError as Error | null} />

                {isCircle && <TxError error={circleError} />}

                <button
                  type="button"
                  onClick={isCircle ? handleCircleWithdraw : handleWithdraw}
                  disabled={!withdrawAmount || withdrawLoading}
                  className="flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] text-primary font-medium text-sm px-5 py-3 rounded-full transition-all duration-300 disabled:opacity-30 border border-white/10"
                >
                  {isCircle ? (
                    circleBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> {circleStep || "Processing…"}</> : "Redeem Shares"
                  ) : withdrawPending || withdrawConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{withdrawConfirming ? "Confirming…" : "Waiting…"}</>
                  ) : "Redeem Shares"}
                </button>

                <AnimatePresence>
                  {(isCircle ? circleWithdrawDone : withdrawConfirmed) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[#22c55e] text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Withdrawal successful
                      {!isCircle && withdrawTxHash && (
                        <a href={`https://testnet.arcscan.app/tx/${withdrawTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-60">View tx</a>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>

      {/* Transfer fLP position (tokenized) — wagmi only for now */}
      {myShares > 0 && !isCircle && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
          <GlassCard className="p-6 flex flex-col gap-4">
            <div>
              <p className="text-[#E1E0CC] font-medium mb-1">Transfer fLP</p>
              <p className="text-gray-500 text-xs">
                Your position is a transferable ERC-20 token. Move it to another wallet or a secondary market without withdrawing.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Recipient 0x..."
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="flex-1 bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-700 font-mono"
              />
              <input
                type="number"
                placeholder={`fLP amount (max ${myShares.toFixed(4)})`}
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="sm:w-56 bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={handleTransfer}
                disabled={!transferAmtValid || transferPending || transferConfirming}
                className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-full text-sm font-medium border border-white/15 text-primary bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-30 transition-all whitespace-nowrap"
              >
                {transferPending || transferConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {transferConfirming ? "Confirming…" : "Transfer"}
              </button>
            </div>
            <TxError error={transferError as Error | null} />
            <AnimatePresence>
              {transferConfirmed && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[#22c55e] text-sm">
                  <CheckCircle2 className="w-4 h-4" /> fLP transferred
                  {transferTxHash && (
                    <a href={`https://testnet.arcscan.app/tx/${transferTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-60">View tx</a>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>
      )}

      {/* Legacy Pool Migration */}
      <LegacyPoolBanner address={address} />

    </div>
  );
}

// ── Legacy pool withdrawal (funds stranded in pre-v4 pools) ──────────────────

// Every pool deployed before v4. Any LP who deposited into one of these can
// reclaim their USDC here without touching the dashboard's main pool reads.
const LEGACY_POOLS: { label: string; address: `0x${string}` }[] = [
  { label: "v3", address: "0x1b643E7C7B640fc17F64D652fb4B3490c60D9819" },
  { label: "v3.x", address: "0xBFd4Afda68023261621eC578f707Ec45464f95Cd" },
  { label: "v2", address: "0xFc8bd9986B22f4eCe0D29c4C15AEEB340fd40e20" },
];

const LEGACY_POOL_ABI = [
  { inputs: [{ internalType: "address", name: "", type: "address" }], name: "shares", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "shareValue", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "availableLiquidity", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint256", name: "shareAmount", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

function LegacyPoolBanner({ address }: { address: `0x${string}` | undefined }) {
  if (!address) return null;
  return (
    <>
      {LEGACY_POOLS.map((p) => (
        <LegacyPoolRow key={p.address} label={p.label} pool={p.address} address={address} />
      ))}
    </>
  );
}

function LegacyPoolRow({ label, pool, address }: { label: string; pool: `0x${string}`; address: `0x${string}` }) {
  const { data: legacyShares } = useReadContract({
    address: pool, abi: LEGACY_POOL_ABI, functionName: "shares",
    args: [address], query: { enabled: !!address },
  });
  const { data: legacyShareValue } = useReadContract({
    address: pool, abi: LEGACY_POOL_ABI, functionName: "shareValue", query: { enabled: !!address },
  });
  const { data: legacyLiquidity } = useReadContract({
    address: pool, abi: LEGACY_POOL_ABI, functionName: "availableLiquidity", query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  if (!legacyShares || legacyShares === BigInt(0)) return null;

  const sharesFmt = Number(formatUnits(legacyShares, USDC_DECIMALS));
  const ratio = legacyShareValue ? Number(legacyShareValue) / 1e18 : 1;
  const usdcEst = sharesFmt * ratio;
  const liquidity = legacyLiquidity !== undefined ? Number(formatUnits(legacyLiquidity, USDC_DECIMALS)) : null;
  // If the old pool's free liquidity can't cover the full position (funds tied up in
  // unresolved invoices there), withdraw what is currently liquid.
  const constrained = liquidity !== null && liquidity < usdcEst;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.03] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-yellow-300 text-xs font-semibold uppercase tracking-widest mb-1">Legacy Pool ({label})</p>
            <p className="text-[#E1E0CC] font-medium mb-1">
              You have <span className="text-yellow-300">{sharesFmt.toFixed(4)} fLP</span> stranded in the old pool
            </p>
            <p className="text-gray-500 text-xs">
              Estimated value: <span className="text-[#DEDBC8]">${usdcEst.toFixed(2)} USDC</span>
              <span className="ml-2 text-gray-600">Withdraw here, then re-deposit into the current pool.</span>
            </p>
            {constrained && (
              <p className="text-orange-300/80 text-[11px] mt-1">
                Only ${liquidity!.toFixed(2)} is liquid right now (rest tied up in unresolved invoices there). Withdraw again later for the remainder.
              </p>
            )}
          </div>
          <div className="shrink-0">
            {confirmed ? (
              <div className="flex items-center gap-2 text-[#22c55e] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Withdrawn
                {txHash && (
                  <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-60">View tx</a>
                )}
              </div>
            ) : (
              <button
                onClick={() => writeContract({ address: pool, abi: LEGACY_POOL_ABI, functionName: "withdraw", args: [legacyShares], chainId: arcTestnet.id })}
                disabled={isPending || confirming}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium border border-yellow-400/30 text-yellow-300 bg-yellow-400/[0.08] hover:bg-yellow-400/[0.14] disabled:opacity-50 transition-all"
              >
                {isPending || confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {confirming ? "Confirming..." : "Withdraw from old pool"}
              </button>
            )}
            {error && (
              <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {(error as Error).message?.includes("User rejected") ? "Rejected in wallet." : "Withdrawal failed."}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

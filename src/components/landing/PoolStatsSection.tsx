"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { WordsPullUp } from "@/components/shared/WordsPullUp";
import { CONTRACTS, FloatPoolABI, FloatCoreABI, USDC_DECIMALS } from "@/lib/contracts";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as any } },
};
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function PoolStatsSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const isGridInView = useInView(gridRef, { once: true, margin: "-80px" });
  const isActivityInView = useInView(activityRef, { once: true, margin: "-80px" });

  // ── on-chain reads ─────────────────────────────────────────────────────────
  const { data: totalAssets } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "totalAssets",
  });

  const { data: shareValue } = useReadContract({
    address: CONTRACTS.FLOAT_POOL,
    abi: FloatPoolABI,
    functionName: "shareValue",
  });

  const { data: invoiceCount } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "invoiceCount",
  });

  const count = invoiceCount ? Number(invoiceCount) : 0;

  const { data: allInvoices } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: CONTRACTS.FLOAT_CORE as `0x${string}`,
      abi: FloatCoreABI,
      functionName: "getInvoice" as const,
      args: [BigInt(i)] as [bigint],
    })),
    query: { enabled: count > 0 },
  });

  // ── derived stats ──────────────────────────────────────────────────────────
  const tvl = totalAssets ? Number(formatUnits(totalAssets, USDC_DECIMALS)) : null;

  // InvoiceStatus enum:
  // 0 PENDING_APPROVAL, 1 PENDING_COLLATERAL, 2 FUNDED, 3 PAID, 4 DEFAULTED, 5 CANCELLED
  let funded = 0, paid = 0, defaulted = 0, totalVolume = 0, totalAdvance = 0;
  allInvoices?.forEach((r) => {
    if (r.status !== "success" || !r.result) return;
    const inv = r.result as { amount: bigint; advance: bigint; status: number };
    totalVolume += Number(formatUnits(inv.amount, USDC_DECIMALS));
    totalAdvance += Number(formatUnits(inv.advance, USDC_DECIMALS));
    if (inv.status === 2) funded++;
    else if (inv.status === 3) paid++;
    else if (inv.status === 4) defaulted++;
  });

  const avgAdvanceRate = totalVolume > 0 ? ((totalAdvance / totalVolume) * 100).toFixed(1) : null;
  const resolvedCount = paid + defaulted;
  const defaultRate = resolvedCount > 0 ? ((defaulted / resolvedCount) * 100).toFixed(1) : "0.0";

  // shareValue is 1e18 scaled; yield = (shareValue - 1e18) / 1e18 * 100
  const yieldPct = shareValue
    ? (((Number(shareValue) - 1e18) / 1e18) * 100).toFixed(2)
    : null;

  const STATS = [
    { label: "Total Value Locked",  value: tvl !== null ? fmt(tvl) : "—",                    sub: "USDC in pool",          accent: "#DEDBC8" },
    { label: "Cumulative Yield",    value: yieldPct !== null ? `${yieldPct}%` : "—",          sub: "Share value growth",    accent: "#DEDBC8" },
    { label: "Active Invoices",     value: count > 0 ? String(funded) : "—",                  sub: "Being financed now",    accent: "#DEDBC8" },
    { label: "Total Invoices Paid", value: count > 0 ? String(paid) : "—",                    sub: "All time",              accent: "#22c55e" },
    { label: "Total Volume",        value: totalVolume > 0 ? fmt(totalVolume) : "—",           sub: "Invoices processed",    accent: "#DEDBC8" },
    { label: "Default Rate",        value: count > 0 ? `${defaultRate}%` : "—",               sub: "Historical",            accent: "#22c55e" },
    { label: "Avg Advance Rate",    value: avgAdvanceRate !== null ? `${avgAdvanceRate}%` : "—", sub: "Across all invoices", accent: "#DEDBC8" },
    { label: "Total Invoices",      value: count > 0 ? String(count) : "—",                   sub: "On-chain total",        accent: "#DEDBC8" },
  ];

  return (
    <section id="pool-stats" className="bg-black py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
            Pool Stats · Live on Arc Testnet
          </span>
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal leading-[0.95] tracking-tight">
            <WordsPullUp
              align="left"
              segments={[
                { text: "Transparent by" },
                { text: "design.", className: "font-serif italic" },
              ]}
            />
          </div>
        </div>

        {/* Stats grid */}
        <motion.div
          ref={gridRef}
          variants={gridVariants}
          initial="hidden"
          animate={isGridInView ? "visible" : "hidden"}
          className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 rounded-[2rem] overflow-hidden border border-white/5 mb-12"
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              variants={cardVariants}
              className="bg-[#101010] p-6 sm:p-8 flex flex-col gap-1"
            >
              <span className="text-gray-500 text-[10px] tracking-widest uppercase">{stat.label}</span>
              <span className="text-2xl sm:text-3xl font-bold tabular-nums mt-1" style={{ color: stat.accent }}>
                {stat.value}
              </span>
              <span className="text-gray-600 text-xs">{stat.sub}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Live activity */}
        <div className="bg-[#101010] rounded-[2rem] p-8 sm:p-10 md:p-14 border border-white/5 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">

            <div>
              <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
                On-chain
              </span>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-medium leading-[0.95] tracking-tight mb-5" style={{ color: "#E1E0CC" }}>
                Every transaction, on-chain.
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                All pool activity is recorded publicly on Arc Testnet. Invoice advances, buyer repayments, and investor deposits are fully traceable. No hidden fees, no opaque accounting.
              </p>
            </div>

            {/* Invoice summary from chain */}
            <motion.div
              ref={activityRef}
              variants={gridVariants}
              initial="hidden"
              animate={isActivityInView ? "visible" : "hidden"}
              className="flex flex-col gap-2"
            >
              {[
                { label: "Invoices funded (active)", value: String(funded), color: "#DEDBC8" },
                { label: "Invoices paid on-time",    value: String(paid),   color: "#22c55e" },
                { label: "Invoices defaulted",       value: String(defaulted), color: "#ef4444" },
                { label: "Total invoice volume",     value: totalVolume > 0 ? fmt(totalVolume) : "—", color: "#DEDBC8" },
                { label: "Pool total assets",        value: tvl !== null ? fmt(tvl) : "—", color: "#DEDBC8" },
                { label: "Share value",              value: shareValue ? `${(Number(shareValue) / 1e18).toFixed(6)}` : "—", color: "#22c55e" },
              ].map((row, i) => (
                <motion.div
                  key={i}
                  variants={cardVariants}
                  className="bg-black rounded-2xl p-4 border border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    <p className="text-[#E1E0CC] text-sm font-medium">{row.label}</p>
                  </div>
                  <span className="font-bold text-sm tabular-nums" style={{ color: row.color }}>{row.value}</span>
                </motion.div>
              ))}
              <p className="text-gray-600 text-xs text-center mt-2">
                Live data · <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400 transition-colors">ArcScan ↗</a>
              </p>
            </motion.div>

          </div>
        </div>

      </div>
    </section>
  );
}

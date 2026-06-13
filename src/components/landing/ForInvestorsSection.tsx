"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Check, DollarSign, BarChart3, Lock, RefreshCw } from "lucide-react";
import { WordsPullUp } from "@/components/shared/WordsPullUp";
import Link from "next/link";

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as any } },
};
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const MECHANICS = [
  {
    icon: <DollarSign className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Deposit USDC into the pool.",
    desc: "Your USDC is deployed as liquidity for invoice advances. You receive pool shares representing your proportional ownership.",
    items: ["Minimum deposit: 100 USDC", "Withdraw anytime (subject to utilization)", "No lock-up period"],
  },
  {
    icon: <BarChart3 className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Earn from the fee spread.",
    desc: "Every invoice advance charges a 1–5% origination fee. That fee goes directly to the pool, increasing share value over time.",
    items: ["Advance rate: 75–88% to seller", "You capture the 12–25% margin", "Yield increases with invoice volume"],
  },
  {
    icon: <RefreshCw className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Auto-compounding yield.",
    desc: "As invoices are repaid, the pool grows. Your share value increases continuously, with no manual reinvestment needed.",
    items: ["Yield accrues in real-time", "Current pool APY: ~8.4%", "Share value only goes up on repayment"],
  },
  {
    icon: <Lock className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Recourse protection.",
    desc: "Float uses a recourse model. If a buyer defaults, the seller is liable. Investors are protected by the seller's stake and credit score system.",
    items: ["Seller liable on buyer default", "Default rate: 0.8% (historical)", "Defaulted invoices flagged, seller penalized"],
  },
];

const YIELD_ROWS = [
  { deposit: "1,000",  annual: "84",    monthly: "7.00" },
  { deposit: "5,000",  annual: "420",   monthly: "35.00" },
  { deposit: "10,000", annual: "840",   monthly: "70.00" },
  { deposit: "50,000", annual: "4,200", monthly: "350.00" },
];

export function ForInvestorsSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const isGridInView = useInView(gridRef, { once: true, margin: "-80px" });
  const isTableInView = useInView(tableRef, { once: true, margin: "-80px" });

  return (
    <section id="for-investors" className="bg-black py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
            For Investors
          </span>
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal leading-[0.95] tracking-tight">
            <WordsPullUp
              align="left"
              segments={[
                { text: "Real yield from" },
                { text: "real invoices.", className: "font-serif italic" },
              ]}
            />
          </div>
        </div>

        {/* 4-mechanic cards */}
        <motion.div
          ref={gridRef}
          variants={gridVariants}
          initial="hidden"
          animate={isGridInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2 md:gap-1 mb-16"
        >
          {MECHANICS.map((m, i) => (
            <motion.div
              key={i}
              variants={cardVariants}
              className="bg-[#212121] rounded-2xl sm:rounded-3xl p-6 sm:p-7 border border-white/5 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-[#101010] border border-white/10 flex items-center justify-center">
                  {m.icon}
                </div>
                <span className="text-xs font-mono text-primary/50 tracking-widest">
                  0{i + 1}
                </span>
              </div>

              <div>
                <h3 style={{ color: "#E1E0CC" }} className="text-base sm:text-lg font-semibold tracking-tight mb-2">
                  {m.title}
                </h3>
                <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">{m.desc}</p>
              </div>

              <ul className="flex flex-col gap-1.5 mt-auto">
                {m.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-gray-500 list-none">
                    <Check className="w-3.5 h-3.5 text-[#DEDBC8] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Yield calculator + CTA */}
        <div className="bg-[#101010] rounded-[2rem] p-8 sm:p-10 md:p-14 border border-white/5 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">

            <div>
              <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
                Estimated Returns
              </span>
              <h3
                className="text-2xl sm:text-3xl md:text-4xl font-medium leading-[0.95] tracking-tight mb-5"
                style={{ color: "#E1E0CC" }}
              >
                8.4% APY on idle USDC.
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                Rates are variable and based on pool utilization and invoice volume. The numbers below use the current pool APY of 8.4% for illustration.
              </p>
              <p className="text-gray-600 text-xs mb-8">
                Past performance is not indicative of future results. This is demo data.
              </p>
              <Link href="/app/investor">
                <button className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-5 pr-2 py-2 rounded-full transition-all duration-300 cursor-pointer">
                  <span>Deposit into Pool</span>
                  <span className="bg-black rounded-full w-8 h-8 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ArrowRight className="w-3.5 h-3.5 text-primary" />
                  </span>
                </button>
              </Link>
            </div>

            {/* Yield table */}
            <motion.div
              ref={tableRef}
              initial="hidden"
              animate={isTableInView ? "visible" : "hidden"}
              variants={gridVariants}
              className="flex flex-col gap-2"
            >
              {/* Header */}
              <div className="grid grid-cols-3 px-5 pb-2">
                <span className="text-gray-600 text-[10px] tracking-widest uppercase">Deposit</span>
                <span className="text-gray-600 text-[10px] tracking-widest uppercase text-right">Annual yield</span>
                <span className="text-gray-600 text-[10px] tracking-widest uppercase text-right">Monthly</span>
              </div>

              {YIELD_ROWS.map((row) => (
                <motion.div
                  key={row.deposit}
                  variants={cardVariants}
                  className="bg-black rounded-2xl p-4 sm:p-5 border border-white/5 grid grid-cols-3 items-center"
                >
                  <span className="text-[#E1E0CC] font-medium text-sm tabular-nums">${row.deposit}</span>
                  <span className="text-[#DEDBC8] font-bold text-base tabular-nums text-right">+${row.annual}</span>
                  <span className="text-gray-400 text-sm tabular-nums text-right">+${row.monthly}/mo</span>
                </motion.div>
              ))}
              <p className="text-gray-600 text-xs text-center mt-2">All amounts in USDC · APY 8.4% (demo)</p>
            </motion.div>

          </div>
        </div>

      </div>
    </section>
  );
}

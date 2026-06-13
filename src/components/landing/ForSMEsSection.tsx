"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Check, Clock, Zap, TrendingUp, ShieldCheck } from "lucide-react";
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

const STEPS = [
  {
    num: "01",
    icon: <Zap className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Upload your invoice.",
    desc: "Enter the buyer address, invoice amount, and due date. Float calculates your advance rate instantly based on your on-chain credit score.",
    items: ["No paperwork or KYC", "Buyer address is verified on-chain", "Due date: 30 / 60 / 90 days"],
  },
  {
    num: "02",
    icon: <Clock className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Receive USDC upfront.",
    desc: "The advance is sent to your wallet in the same transaction. No waiting, no approval process, no bank transfer delays.",
    items: ["75–88% of invoice value upfront", "Funds arrive in seconds on Arc", "No interest charged to you"],
  },
  {
    num: "03",
    icon: <TrendingUp className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Buyer pays at due date.",
    desc: "When the invoice matures, the buyer pays 100% directly to the Float contract. The pool is replenished, and your credit score improves.",
    items: ["Buyer pays full invoice value", "7-day grace period after due date", "Your score improves with every paid invoice"],
  },
  {
    num: "04",
    icon: <ShieldCheck className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Build your credit score.",
    desc: "Every on-time payment improves your on-chain credit score, permanently recorded on Arc. Higher score means higher advance rates, forever.",
    items: ["Score is public and immutable", "Starts at 50 for new sellers", "Reaches 88% advance at score 86+"],
  },
];

const TIERS = [
  { label: "New",       score: "0–40",   rate: "75%", color: "#FF0000", desc: "New to Float" },
  { label: "Fair",      score: "41–70",  rate: "80%", color: "#FFA500", desc: "Building history" },
  { label: "Good",      score: "71–85",  rate: "84%", color: "#DEDBC8", desc: "Strong track record" },
  { label: "Excellent", score: "86–100", rate: "88%", color: "#008000", desc: "Top-tier seller" },
];

export function ForSMEsSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const tiersRef = useRef<HTMLDivElement>(null);
  const isGridInView = useInView(gridRef, { once: true, margin: "-80px" });
  const isTiersInView = useInView(tiersRef, { once: true, margin: "-80px" });

  return (
    <section id="for-smes" className="bg-black py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
            For SMEs
          </span>
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-normal leading-[0.95] tracking-tight whitespace-nowrap">
            <WordsPullUp
              align="left"
              segments={[
                { text: "Stop waiting" },
                { text: "90 days", className: "font-serif italic" },
                { text: "for your money." },
              ]}
            />
          </div>
        </div>

        {/* 4-step cards */}
        <motion.div
          ref={gridRef}
          variants={gridVariants}
          initial="hidden"
          animate={isGridInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2 md:gap-1 mb-16"
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.num}
              variants={cardVariants}
              className="bg-[#212121] rounded-2xl sm:rounded-3xl p-6 sm:p-7 border border-white/5 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-[#101010] border border-white/10 flex items-center justify-center">
                  {step.icon}
                </div>
                <span className="text-xs font-mono text-primary/50 tracking-widest">{step.num}</span>
              </div>

              <div>
                <h3 style={{ color: "#E1E0CC" }} className="text-base sm:text-lg font-semibold tracking-tight mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">{step.desc}</p>
              </div>

              <ul className="flex flex-col gap-1.5 mt-auto">
                {step.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-gray-500 list-none">
                    <Check className="w-3.5 h-3.5 text-[#DEDBC8] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Credit Score Tiers */}
        <div className="bg-[#101010] rounded-[2rem] p-8 sm:p-10 md:p-14 border border-white/5 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            <div>
              <span className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-4 block">
                Credit Score System
              </span>
              <h3
                className="text-2xl sm:text-3xl md:text-4xl font-medium leading-[0.95] tracking-tight mb-5"
                style={{ color: "#E1E0CC" }}
              >
                Pay on time. Unlock better rates.
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-8">
                Your credit score is calculated entirely on-chain, as the ratio of invoices paid on time vs total invoices created. It is immutable, transparent, and improves automatically with every successful payment.
              </p>
              <Link href="/app/seller">
                <button className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-5 pr-2 py-2 rounded-full transition-all duration-300 cursor-pointer">
                  <span>Start as Seller</span>
                  <span className="bg-black rounded-full w-8 h-8 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ArrowRight className="w-3.5 h-3.5 text-primary" />
                  </span>
                </button>
              </Link>
            </div>

            {/* Tier table */}
            <motion.div
              ref={tiersRef}
              initial="hidden"
              animate={isTiersInView ? "visible" : "hidden"}
              variants={gridVariants}
              className="flex flex-col gap-2"
            >
              {TIERS.map((tier) => (
                <motion.div
                  key={tier.label}
                  variants={cardVariants}
                  className="bg-black rounded-2xl p-4 sm:p-5 border border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: tier.color }}
                    />
                    <div>
                      <p className="text-[#E1E0CC] font-medium text-sm">{tier.label}</p>
                      <p className="text-gray-500 text-xs">Score {tier.score} · {tier.desc}</p>
                    </div>
                  </div>
                  <span
                    className="font-bold text-xl tabular-nums"
                    style={{ color: tier.color }}
                  >
                    {tier.rate}
                  </span>
                </motion.div>
              ))}
              <p className="text-gray-600 text-xs text-center mt-2">Advance rate as % of invoice value</p>
            </motion.div>

          </div>
        </div>

      </div>
    </section>
  );
}

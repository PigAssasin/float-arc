"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, ArrowRight, Zap, TrendingUp, Shield } from "lucide-react";
import { WordsPullUp } from "@/components/shared/WordsPullUp";

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};
const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as any } },
};

const CARDS = [
  {
    num: "01",
    icon: <Zap className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Instant Advance.",
    items: [
      "Upload invoice → receive USDC same day",
      "Advance rate 75–88% based on credit score",
      "No bank approval, no paperwork",
      "Recourse model: you stay in control",
    ],
  },
  {
    num: "02",
    icon: <TrendingUp className="w-5 h-5 text-[#DEDBC8]" />,
    title: "On-chain Credit Score.",
    items: [
      "Score built from your payment history",
      "Higher score = higher advance rate (88% max)",
      "Fully transparent, calculated on-chain",
      "Resets never. Your history is permanent.",
    ],
  },
  {
    num: "03",
    icon: <Shield className="w-5 h-5 text-[#DEDBC8]" />,
    title: "Investor Pool.",
    items: [
      "Deposit USDC, earn yield from invoice fees",
      "Real-time pool share value on dashboard",
      "Withdraw anytime (subject to liquidity)",
    ],
  },
];

export function FeaturesSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(gridRef, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="min-h-screen bg-black py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden flex flex-col justify-center">
      <div className="absolute inset-0 bg-noise opacity-[0.15] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto flex flex-col gap-3 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal leading-tight tracking-tight select-none mb-16">
          <WordsPullUp segments={[{ text: "Built for SMEs. Powered by USDC." }]} />
          <WordsPullUp segments={[{ text: "Transparent yield for investors.", className: "text-gray-500" }]} />
        </div>

        {/* 4-card grid */}
        <motion.div
          ref={gridRef}
          variants={gridVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:h-[480px] gap-3 sm:gap-2 md:gap-1 w-full"
        >
          {/* Card 1 — Visual/Brand card */}
          <motion.div
            variants={cardVariants}
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-end p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1200] via-[#212121] to-[#0d0d0d]" />
            <div className="absolute inset-0 noise-overlay opacity-[0.4] mix-blend-overlay pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
            <p style={{ color: "#E1E0CC" }} className="font-semibold text-lg sm:text-xl z-10 select-none tracking-tight text-left relative">
              Your invoice.<br />Your terms.<br />Your yield.
            </p>
          </motion.div>

          {/* Feature cards */}
          {CARDS.map((card) => (
            <motion.div
              key={card.num}
              variants={cardVariants}
              className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-between p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
            >
              {/* Top: icon + number */}
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#101010] border border-white/10 shadow-lg flex items-center justify-center">
                  {card.icon}
                </div>
                <span className="text-xs sm:text-sm font-mono text-primary/50 tracking-widest font-normal">
                  {card.num}
                </span>
              </div>

              {/* Center: title + checklist */}
              <div className="flex flex-col gap-4 my-4 flex-grow justify-center text-left">
                <h3 style={{ color: "#E1E0CC" }} className="text-base sm:text-lg font-semibold tracking-tight">
                  {card.title}
                </h3>
                <ul className="flex flex-col gap-2 p-0 m-0">
                  {card.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 list-none">
                      <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bottom: learn more */}
              <div className="flex items-center">
                <a
                  href="/app"
                  className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary font-medium tracking-wide transition-all duration-300 group-hover:gap-2.5"
                >
                  <span>Get started</span>
                  <ArrowRight className="w-3.5 h-3.5 transform -rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

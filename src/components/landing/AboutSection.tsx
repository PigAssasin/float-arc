"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WordsPullUp } from "@/components/shared/WordsPullUp";
import { ScrollRevealParagraph } from "@/components/shared/AnimatedLetter";

const BIO_TEXT =
  "Across the GCC, SMEs wait 60 to 90 days for invoice payments while suppliers and payroll cannot wait. Float changes that. Built on Arc, a USDC-native blockchain with sub-second finality, every advance, every repayment, and every yield distribution happens on-chain. No banks. No intermediaries. No waiting. Your credit score builds with every on-time payment, unlocking higher advance rates over time.";

export function AboutSection() {
  return (
    <section id="how-it-works" className="bg-black py-24 px-4 sm:px-6 lg:px-8">
      <div className="bg-[#101010] rounded-[2rem] p-8 sm:p-12 md:p-16 lg:p-20 text-center max-w-6xl mx-auto relative overflow-hidden shadow-2xl border border-white/5">

        <span className="text-primary text-[10px] sm:text-xs tracking-[0.2em] uppercase font-semibold mb-8 block select-none">
          Invoice Factoring Protocol
        </span>

        <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9] tracking-tight">
          <WordsPullUp
            segments={[
              { text: "SMEs get paid" },
              { text: "today,", className: "font-serif italic" },
              { text: "not in 90 days." },
            ]}
          />
        </div>

        <div className="mt-12 md:mt-16 select-none">
          <ScrollRevealParagraph text={BIO_TEXT} />
        </div>

        <div className="mt-10">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#E1E0CC]/70 hover:text-[#E1E0CC] border border-white/10 hover:border-white/20 rounded-full px-5 py-2.5 transition-all duration-300 hover:gap-3"
          >
            Read the docs
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>
    </section>
  );
}

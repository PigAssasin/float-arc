"use client";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";
import { useRef } from "react";

function Letter({ char, scrollYProgress, index, total }: {
  char: string;
  scrollYProgress: MotionValue<number>;
  index: number;
  total: number;
}) {
  const charProgress = index / total;
  const start = Math.max(0, charProgress - 0.1);
  const end = Math.min(1, charProgress + 0.05);
  const opacity = useTransform(scrollYProgress, [start, end <= start ? start + 0.0001 : end], [0.2, 1]);
  return <motion.span style={{ opacity }} className="inline">{char}</motion.span>;
}

export function ScrollRevealParagraph({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.2"] });
  const words = text.split(" ");
  let globalIndex = 0;
  const total = text.length;

  return (
    <p
      ref={ref}
      className={`text-[#DEDBC8] text-xs sm:text-sm md:text-base max-w-2xl mx-auto leading-relaxed text-center flex flex-wrap justify-center gap-x-[0.25em] gap-y-1.5 ${className}`}
    >
      {words.map((word, wi) => {
        const chars = word.split("");
        const startIdx = globalIndex;
        globalIndex += chars.length + 1;
        return (
          <span key={wi} className="inline-block whitespace-nowrap">
            {chars.map((char, ci) => (
              <Letter key={ci} char={char} scrollYProgress={scrollYProgress} index={startIdx + ci} total={total} />
            ))}
          </span>
        );
      })}
    </p>
  );
}

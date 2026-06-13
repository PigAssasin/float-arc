"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpProps {
  segments: Segment[];
  className?: string;
  align?: "left" | "center";
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const wordVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any } },
};

export function WordsPullUp({ segments, className = "", align = "center" }: WordsPullUpProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });

  const words: { word: string; className: string }[] = [];
  segments.forEach((seg) => {
    seg.text.split(" ").filter(Boolean).forEach((word) => {
      words.push({ word, className: seg.className ?? "" });
    });
  });

  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={`inline-flex flex-wrap ${align === "left" ? "justify-start" : "justify-center"} ${className}`}
    >
      {words.map((item, i) => (
        <span key={i} className="inline-block mr-[0.25em] last:mr-0 overflow-visible">
          <motion.span variants={wordVariants} className={`inline-block ${item.className}`}>
            {item.word}
          </motion.span>
        </span>
      ))}
    </motion.div>
  );
}

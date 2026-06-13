"use client";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { WordsPullUp } from "@/components/shared/WordsPullUp";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";

const NAV_ITEMS = ["How it works", "For SMEs", "For Investors", "Pool Stats"];

const descVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any, delay: 0.5 } },
};
const btnVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any, delay: 0.7 } },
};

const TYPEWRITER_LINES = [
  "Float your invoices. SMEs get paid today, not in 90 days.",
  "Upload your invoice, receive USDC upfront.",
  "Buyers pay at due date. Investors earn yield from the spread.",
];
const FULL_TEXT = TYPEWRITER_LINES.join("\n");

function useTypewriter(text: string, speed = 22) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
      else clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return displayed;
}

export function HeroSection() {
  const [hovered, setHovered] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const typed = useTypewriter(FULL_TEXT);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.25;
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Parallax: gradient drifts up as user scrolls away from hero
  const gradientY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  // Content fades + slides up on scroll
  const contentY = useTransform(scrollYProgress, [0, 0.6], ["0%", "12%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={sectionRef} className="h-screen w-full p-4 md:p-6 bg-black relative">
      <div className="relative w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden bg-[#0A0A0A]">

        {/* Video background */}
        <motion.div style={{ y: gradientY }} className="absolute inset-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/50" />

        {/* Noise overlay */}
        <div className="noise-overlay absolute inset-0 opacity-[0.7] mix-blend-overlay pointer-events-none" />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

        {/* Navbar Pill */}
        <nav className="absolute top-0 left-1/2 -translate-x-1/2 bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-3 md:px-8 z-50 shadow-xl border-b border-white/5">
          <ul className="flex items-center gap-3 sm:gap-6 md:gap-10 lg:gap-12 whitespace-nowrap">
            {NAV_ITEMS.map((item, idx) => (
              <li key={idx} className="list-none">
                <a
                  href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{
                    color: hovered === idx ? "#E1E0CC" : "rgba(225, 224, 204, 0.8)",
                    transition: "color 0.3s ease",
                  }}
                  onMouseEnter={() => setHovered(idx)}
                  onMouseLeave={() => setHovered(null)}
                  className="font-medium text-[10px] sm:text-xs md:text-sm tracking-widest uppercase select-none"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Hero Content — parallax on scroll */}
        <motion.div
          style={{ y: contentY, opacity: contentOpacity }}
          className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-12 z-20"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-end w-full">

            {/* Left 8 cols: Giant title */}
            <div className="col-span-12 md:col-span-8 select-none overflow-visible">
              <WordsPullUp
                align="left"
                segments={[{ text: "Float" }]}
                className="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] font-medium leading-[0.85] tracking-[-0.07em] text-left"
              />
            </div>

            {/* Right 4 cols: Description + CTA */}
            <div className="col-span-12 md:col-span-4 flex flex-col gap-6 items-start self-end pb-2">
              <motion.p
                variants={descVariants}
                initial="hidden"
                animate="visible"
                style={{ lineHeight: 1.6, color: "#E1E0CC" }}
                className="text-xs sm:text-sm md:text-base text-primary/70 font-light select-none whitespace-pre-line"
              >
                {typed}
                <span className="inline-block w-[2px] h-[1em] bg-[#E1E0CC]/60 ml-0.5 align-middle animate-pulse" />
              </motion.p>

              <motion.div variants={btnVariants} initial="hidden" animate="visible">
                <Link href="/app">
                  <button className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm sm:text-base pl-6 pr-2 py-2 rounded-full shadow-lg transition-all duration-300 cursor-pointer">
                    <span className="select-none">Join the app</span>
                    <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </span>
                  </button>
                </Link>
              </motion.div>
            </div>

          </div>
        </motion.div>

      </div>
    </section>
  );
}

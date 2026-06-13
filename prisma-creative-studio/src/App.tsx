/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useInView, useScroll, useTransform, MotionValue } from 'motion/react';
import { useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

/* ==========================================
   SHARED ANIMATION COMPONENTS
   ========================================== */

interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
}

export function WordsPullUp({ text, className = '', showAsterisk = false }: WordsPullUpProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-10% 0px -10% 0px" });
  
  const words = text.split(" ");
  
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
      }
    }
  };
  
  const wordVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1, 
      transition: { 
        duration: 0.8, 
        ease: [0.16, 1, 0.3, 1] 
      } 
    }
  };
  
  return (
    <motion.div
      ref={containerRef}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={`inline-flex flex-wrap justify-center ${className}`}
    >
      {words.map((word, index) => {
        const isLastWord = index === words.length - 1;
        return (
          <span 
            key={index} 
            className="inline-block relative mr-[0.25em] last:mr-0 overflow-visible"
          >
            <motion.span
              variants={wordVariants}
              style={{ color: '#E1E0CC' }}
              className="inline-block relative"
            >
              {word}
              {isLastWord && showAsterisk && (
                <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em] font-light">
                  *
                </span>
              )}
            </motion.span>
          </span>
        );
      })}
    </motion.div>
  );
}

/* ========================================== */

interface Segment {
  text: string;
  className: string;
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
}

export function WordsPullUpMultiStyle({ segments, className = '' }: WordsPullUpMultiStyleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-10% 0px -10% 0px" });
  
  const words = segments.flatMap((segment, sIdx) => {
    const parts = segment.text.split(" ");
    return parts.map((part, pIdx) => ({
      text: part,
      className: segment.className,
      needsSpace: pIdx < parts.length - 1 || sIdx < segments.length - 1
    }));
  }).filter(item => item.text !== "");

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
      }
    }
  };
  
  const wordVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1, 
      transition: { 
        duration: 0.8, 
        ease: [0.16, 1, 0.3, 1] 
      } 
    }
  };

  return (
    <motion.div
      ref={containerRef}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={`inline-flex flex-wrap justify-center ${className}`}
    >
      {words.map((item, index) => (
        <span 
          key={index} 
          className="inline-block"
          style={{ marginRight: item.needsSpace ? '0.25em' : '0' }}
        >
          <motion.span
            variants={wordVariants}
            className={`inline-block ${item.className}`}
          >
            {item.text}
          </motion.span>
        </span>
      ))}
    </motion.div>
  );
}

/* ========================================== */

interface AnimatedLetterProps {
  char: string;
  index: number;
  totalChars: number;
  scrollYProgress: MotionValue<number>;
  key?: any;
}

export function AnimatedLetter({ char, index, totalChars, scrollYProgress }: AnimatedLetterProps) {
  const charProgress = index / totalChars;
  const startRange = Math.max(0, charProgress - 0.1);
  const endRange = Math.min(1, charProgress + 0.05);
  const adjustedEndRange = endRange <= startRange ? startRange + 0.0001 : endRange;

  const opacity = useTransform(scrollYProgress, [startRange, adjustedEndRange], [0.2, 1]);

  return (
    <motion.span style={{ opacity }} className="inline">
      {char}
    </motion.span>
  );
}

/* ========================================== */

export function ScrollRevealParagraph({ text }: { text: string }) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.8', 'end 0.2']
  });

  const words = text.split(" ");
  let globalCharIndex = 0;
  const totalChars = text.length;

  return (
    <p 
      ref={containerRef} 
      className="text-[#DEDBC8] text-xs sm:text-sm md:text-base max-w-2xl mx-auto leading-relaxed text-center mt-12 px-4 flex flex-wrap justify-center gap-x-[0.25em] gap-y-1.5"
    >
      {words.map((word, wIdx) => {
        const wordChars = word.split("");
        const startGlobalIndex = globalCharIndex;
        globalCharIndex += wordChars.length + 1;

        return (
          <span key={wIdx} className="inline-block whitespace-nowrap">
            {wordChars.map((char, cIdx) => {
              const charIdx = startGlobalIndex + cIdx;
              return (
                <AnimatedLetter
                  key={cIdx}
                  char={char}
                  index={charIdx}
                  totalChars={totalChars}
                  scrollYProgress={scrollYProgress}
                />
              );
            })}
          </span>
        );
      })}
    </p>
  );
}

/* ==========================================
   SECTION 1: HERO
   ========================================== */

function HeroSection() {
  const [hoveredNavIndex, setHoveredNavIndex] = useState<number | null>(null);
  
  const navItems = ["Our story", "Collective", "Workshops", "Programs", "Inquiries"];

  const descVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.5
      }
    }
  };

  const btnVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.7
      }
    }
  };

  return (
    <section id="hero" className="h-screen w-full p-4 md:p-6 bg-black relative">
      <div className="relative w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden bg-[#0A0A0A]">
        
        {/* Background Video */}
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Noise overlay */}
        <div className="absolute inset-0 noise-overlay opacity-[0.7] mix-blend-overlay pointer-events-none" />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

        {/* Navbar Pill */}
        <nav className="absolute top-0 left-1/2 -translate-x-1/2 bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-3 md:px-8 z-50 shadow-xl border-b border-white/5">
          <ul className="flex items-center gap-3 sm:gap-6 md:gap-12 lg:gap-14 whitespace-nowrap">
            {navItems.map((item, idx) => (
              <li key={idx} className="list-none">
                <a
                  href="#"
                  style={{
                    color: hoveredNavIndex === idx ? '#E1E0CC' : 'rgba(225, 224, 204, 0.8)',
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={() => setHoveredNavIndex(idx)}
                  onMouseLeave={() => setHoveredNavIndex(null)}
                  className="font-medium text-[10px] sm:text-xs md:text-sm tracking-widest uppercase select-none"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Hero Content (bottom-aligned) */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-12 z-20 flex flex-col justify-end">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-end w-full">
            
            {/* Left 8 columns: Heading Prisma */}
            <div className="col-span-12 md:col-span-8 flex flex-col items-start md:items-start select-none overflow-visible">
              <WordsPullUp
                text="Prisma"
                showAsterisk={true}
                className="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw] font-medium leading-[0.85] tracking-[-0.07em] select-none text-left"
              />
            </div>

            {/* Right 4 columns: Text + Button */}
            <div className="col-span-12 md:col-span-4 flex flex-col gap-6 items-start self-end">
              <motion.p
                variants={descVariants}
                initial="hidden"
                animate="visible"
                style={{ lineHeight: 1.2, color: '#E1E0CC' }}
                className="text-xs sm:text-sm md:text-base text-primary/70 font-light select-none text-left"
              >
                Prisma is a worldwide network of visual artists, filmmakers and storytellers bound not by place, status or labels but by passion and hunger to unlock potential through our unique perspectives.
              </motion.p>

              <motion.button
                variants={btnVariants}
                initial="hidden"
                animate="visible"
                className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm sm:text-base pl-6 pr-2 py-2 rounded-full shadow-lg transition-all duration-300 cursor-pointer"
              >
                <span className="select-none select-none">Join the lab</span>
                <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </span>
              </motion.button>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}

/* ==========================================
   SECTION 2: ABOUT
   ========================================== */

function AboutSection() {
  const segments = [
    { text: "I am Marcus Chen, ", className: "font-normal text-[#E1E0CC]" },
    { text: "a self-taught director. ", className: "font-serif italic text-primary" },
    { text: "I have skills in color grading, visual effects, and narrative design.", className: "font-normal text-[#E1E0CC]" }
  ];

  const bioText = "Over the last seven years, I have worked with Parallax, a Berlin-based production house that crafts cinema, series, and Noir Studio in Paris. Together, we have created work that has earned international acclaim at several major festivals.";

  return (
    <section id="about" className="bg-black py-24 px-4 sm:px-6 lg:px-8">
      <div className="bg-[#101010] rounded-[2rem] p-8 sm:p-12 md:p-16 lg:p-20 text-center max-w-6xl mx-auto relative overflow-hidden shadow-2xl border border-white/5">
        
        {/* Visual arts tag */}
        <span className="text-primary text-[10px] sm:text-xs tracking-[0.2em] uppercase font-semibold mb-8 block select-none">
          Visual arts
        </span>
        
        {/* Staggered text header */}
        <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9] tracking-tight">
          <WordsPullUpMultiStyle segments={segments} />
        </div>

        {/* Scroll-aligned progress reveal paragraph */}
        <div className="mt-12 md:mt-16 select-none">
          <ScrollRevealParagraph text={bioText} />
        </div>

      </div>
    </section>
  );
}

/* ==========================================
   SECTION 3: FEATURES
   ========================================== */

function FeaturesSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const isGridInView = useInView(gridRef, { once: true, margin: "-100px" });

  const gridVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15,
      }
    }
  };

  const cardVariants = {
    hidden: {
      opacity: 0,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      }
    }
  };

  const line1Segments = [
    { text: "Studio-grade workflows for visionary creators.", className: "text-[#E1E0CC]" }
  ];

  const line2Segments = [
    { text: "Built for pure vision. Powered by art.", className: "text-gray-500" }
  ];

  const card2Checklist = [
    "Real-time visual timeline",
    "Dynamic thumbnail generator",
    "Cinematic shot sequencer",
    "Collaborative script comments"
  ];

  const card3Checklist = [
    "Automated narrative analysis",
    "Interactive creative notes",
    "Seamless NLE tool integration"
  ];

  const card4Checklist = [
    "Studio notification silencing",
    "Generated ambient soundscapes",
    "Automated calendar syncing"
  ];

  return (
    <section id="features" className="min-h-screen bg-black py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden flex flex-col justify-center">
      
      {/* Background Noise with subtle opacity */}
      <div className="absolute inset-0 bg-noise opacity-[0.15] pointer-events-none" />

      {/* Header section */}
      <div className="text-center max-w-3xl mx-auto flex flex-col gap-3 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal leading-tight tracking-tight select-none">
        <div>
          <WordsPullUpMultiStyle segments={line1Segments} />
        </div>
        <div>
          <WordsPullUpMultiStyle segments={line2Segments} />
        </div>
      </div>

      {/* Grid of 4 Cards */}
      <motion.div
        ref={gridRef}
        variants={gridVariants}
        initial="hidden"
        animate={isGridInView ? "visible" : "hidden"}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:h-[480px] gap-3 sm:gap-2 md:gap-1 max-w-7xl mx-auto mt-16 w-full"
      >
        
        {/* Card 1 - Video Card */}
        <motion.div
          variants={cardVariants}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-end p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
        >
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
          <p 
            style={{ color: '#E1E0CC' }} 
            className="font-semibold text-lg sm:text-xl z-10 select-none tracking-tight text-left"
          >
            Your creative canvas.
          </p>
        </motion.div>

        {/* Card 2 - Storyboard */}
        <motion.div
          variants={cardVariants}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-between p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
        >
          {/* Top: Icon & Number */}
          <div className="flex justify-between items-start w-full">
            <img
              src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171918_4a5edc79-d78f-4637-ac8b-53c43c220606.png&w=1280&q=85"
              alt="Storyboard Icon"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover border border-white/10 shadow-lg"
            />
            <span className="text-xs sm:text-sm font-mono text-primary/50 tracking-widest font-normal">
              01
            </span>
          </div>

          {/* Center: Title & Checklist */}
          <div className="flex flex-col gap-4 my-4 flex-grow justify-center text-left">
            <h3 style={{ color: '#E1E0CC' }} className="text-base sm:text-lg font-semibold tracking-tight">
              Project Storyboard.
            </h3>
            <ul className="flex flex-col gap-2 p-0 m-0">
              {card2Checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 list-none">
                  <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom: Learn More */}
          <div className="flex items-center">
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-xs sm:text-xs text-primary/80 hover:text-primary font-medium tracking-wide transition-all duration-300 group-hover:gap-2.5"
            >
              <span>Learn more</span>
              <ArrowRight className="w-3.5 h-3.5 transform -rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </motion.div>

        {/* Card 3 - Smart Critiques */}
        <motion.div
          variants={cardVariants}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-between p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
        >
          {/* Top: Icon & Number */}
          <div className="flex justify-between items-start w-full">
            <img
              src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171741_ed9845ab-f5b2-4018-8ce7-07cc01823522.png&w=1280&q=85"
              alt="Critique Icon"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover border border-white/10 shadow-lg"
            />
            <span className="text-xs sm:text-sm font-mono text-primary/50 tracking-widest font-normal">
              02
            </span>
          </div>

          {/* Center: Title & Checklist */}
          <div className="flex flex-col gap-4 my-4 flex-grow justify-center text-left">
            <h3 style={{ color: '#E1E0CC' }} className="text-base sm:text-lg font-semibold tracking-tight">
              Smart Critiques.
            </h3>
            <ul className="flex flex-col gap-2 p-0 m-0">
              {card3Checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 list-none">
                  <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom: Learn More */}
          <div className="flex items-center">
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-xs sm:text-xs text-primary/80 hover:text-primary font-medium tracking-wide transition-all duration-300 group-hover:gap-2.5"
            >
              <span>Learn more</span>
              <ArrowRight className="w-3.5 h-3.5 transform -rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </motion.div>

        {/* Card 4 - Immersion Capsule */}
        <motion.div
          variants={cardVariants}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-between p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
        >
          {/* Top: Icon & Number */}
          <div className="flex justify-between items-start w-full">
            <img
              src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png&w=1280&q=85"
              alt="Immersion Icon"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover border border-white/10 shadow-lg"
            />
            <span className="text-xs sm:text-sm font-mono text-primary/50 tracking-widest font-normal">
              03
            </span>
          </div>

          {/* Center: Title & Checklist */}
          <div className="flex flex-col gap-4 my-4 flex-grow justify-center text-left">
            <h3 style={{ color: '#E1E0CC' }} className="text-base sm:text-lg font-semibold tracking-tight">
              Immersion Capsule.
            </h3>
            <ul className="flex flex-col gap-2 p-0 m-0">
              {card4Checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 list-none">
                  <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom: Learn More */}
          <div className="flex items-center">
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-xs sm:text-xs text-primary/80 hover:text-primary font-medium tracking-wide transition-all duration-300 group-hover:gap-2.5"
            >
              <span>Learn more</span>
              <ArrowRight className="w-3.5 h-3.5 transform -rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </motion.div>

      </motion.div>

    </section>
  );
}

/* ==========================================
   MAIN APP CONTAINER
   ========================================== */

export default function App() {
  return (
    <div className="bg-black text-gray-400 min-h-screen selection:bg-[#DEDBC8] selection:text-black overflow-x-hidden antialiased">
      {/* SECTION 1: HERO */}
      <HeroSection />

      {/* SECTION 2: ABOUT */}
      <AboutSection />

      {/* SECTION 3: FEATURES */}
      <FeaturesSection />
    </div>
  );
}

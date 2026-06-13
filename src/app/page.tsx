import { HeroSection } from "@/components/landing/HeroSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { ForSMEsSection } from "@/components/landing/ForSMEsSection";
import { ForInvestorsSection } from "@/components/landing/ForInvestorsSection";
import { PoolStatsSection } from "@/components/landing/PoolStatsSection";
import { ScrollProgressBar, ScrollToTopButton } from "@/components/shared/ScrollToTopButton";

export default function HomePage() {
  return (
    <div className="bg-black min-h-screen selection:bg-[#DEDBC8] selection:text-black overflow-x-hidden antialiased">
      <ScrollProgressBar />
      <HeroSection />
      <AboutSection />
      <FeaturesSection />
      <ForSMEsSection />
      <ForInvestorsSection />
      <PoolStatsSection />
      <ScrollToTopButton />
    </div>
  );
}

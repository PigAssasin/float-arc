import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { FloatAssistant } from "@/components/shared/FloatAssistant";
import { WrongNetworkBanner } from "@/components/shared/WrongNetworkBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-black min-h-screen selection:bg-[#DEDBC8] selection:text-black antialiased overflow-x-hidden">
      <DashboardNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <WrongNetworkBanner />
        {children}
      </main>
      <FloatAssistant />
    </div>
  );
}

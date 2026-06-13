"use client";

import { useChainId, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/lib/wagmi-config";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function WrongNetworkBanner() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (chainId === arcTestnet.id) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.07] mb-4"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
        <p className="text-orange-300 text-sm">
          Wrong network — Float runs on <span className="font-semibold">Arc Testnet</span>
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isPending}
        className="flex items-center gap-1.5 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-orange-400/40 text-orange-300 bg-orange-400/10 hover:bg-orange-400/20 disabled:opacity-50 transition-all"
      >
        {isPending ? "Switching..." : "Switch Network"}
        {!isPending && <ArrowRight className="w-3 h-3" />}
      </button>
    </div>
  );
}

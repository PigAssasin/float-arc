"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { AlertCircle } from "lucide-react";
import { arcTestnet } from "@/lib/wagmi-config";
import { useAppWallet } from "@/hooks/use-app-wallet";

/**
 * Warns wagmi (injected-wallet) users when their wallet is on the wrong network
 * and offers a one-click switch to Arc Testnet. Circle wallet users are always
 * on Arc, so the banner never shows for them.
 */
export function WrongChainBanner() {
  const { isConnected, isCircle } = useAppWallet();
  const { chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  const isWrongChain = isConnected && !isCircle && !!chain && chain.id !== arcTestnet.id;
  if (!isWrongChain) return null;

  return (
    <div className="flex items-center justify-between gap-3 text-amber-400 text-xs rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Wrong network detected. Switch your wallet to Arc Testnet (chain 5042002) before transacting.
      </div>
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isPending}
        className="shrink-0 font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
      >
        {isPending ? "Switching..." : "Switch"}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppWallet } from "@/hooks/use-app-wallet";
import { ShieldCheck, Loader2, ShieldAlert } from "lucide-react";

// v5: lets a connected wallet become "verified" so its invoices use light, tier-based
// collateral instead of the full-collateral floor. Testnet = one click; production
// would gate this behind Circle Compliance / KYC.
export function VerifyBadge() {
  const { address, isConnected } = useAppWallet();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/verify?address=${address}`);
      const data = await res.json();
      if (!data.error) setVerified(!!data.verified);
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const verify = async () => {
    if (!address) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVerified(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isConnected || !address) return null;

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-full text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/20">
        <ShieldCheck className="w-3 h-3" /> Verified
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={verify}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-full text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
        {busy ? "Verifying..." : "Verify wallet"}
      </button>
      {error && <span className="text-[10px] text-red-400 max-w-[180px] text-right">{error}</span>}
    </div>
  );
}

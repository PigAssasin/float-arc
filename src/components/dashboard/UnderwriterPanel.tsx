"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface Verdict {
  buyerScore: number;
  sellerScore: number | null;
  recommendedAdvanceBps: number;
  recommendedTier: "New" | "Fair" | "Good" | "Excellent";
  confidence: "low" | "medium" | "high";
  verdict: "approve" | "caution" | "decline";
  strengths: string[];
  riskFactors: string[];
  rationale: string;
}

const VERDICT_STYLE: Record<string, { color: string; label: string; Icon: typeof CheckCircle2 }> = {
  approve: { color: "#22c55e", label: "Approve", Icon: CheckCircle2 },
  caution: { color: "#FFA500", label: "Proceed with caution", Icon: AlertTriangle },
  decline: { color: "#ef4444", label: "Decline", Icon: XCircle },
};

export function UnderwriterPanel({
  buyer,
  seller,
  amount,
  dueDateMs,
}: {
  buyer: string;
  seller?: string;
  amount: string;
  dueDateMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Verdict | null>(null);

  const buyerValid = /^0x[a-fA-F0-9]{40}$/.test(buyer);
  const canRun = buyerValid && !!amount && parseFloat(amount) > 0 && !loading;

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/agent/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer, seller, amount, dueDate: dueDateMs, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.verdict as Verdict);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-blue-400" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-[#E1E0CC]">AI Underwriting</p>
          <p className="text-[11px] text-gray-500">Assess this buyer before you factor the invoice</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4 flex flex-col gap-3"
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional: context about this buyer (industry, country, relationship, prior dealings)..."
              rows={2}
              className="w-full bg-black/40 text-[#E1E0CC] rounded-xl border border-white/10 px-3 py-2.5 text-xs focus:border-blue-400/50 outline-none transition-colors placeholder:text-gray-700 resize-none"
            />

            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className="flex items-center justify-center gap-2 bg-blue-500/90 hover:bg-blue-500 text-white font-medium text-sm py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Underwriting...</> : <><ShieldCheck className="w-4 h-4" /> Run AI assessment</>}
            </button>

            {!buyerValid && (
              <p className="text-[11px] text-gray-600">Enter a valid buyer address above to enable the assessment.</p>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <AnimatePresence>
              {result && <ResultCard v={result} />}
            </AnimatePresence>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              Advisory only. The on-chain advance rate still follows your verified repayment track record. This assessment helps you judge buyer risk under the recourse model (you are liable if the buyer defaults).
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultCard({ v }: { v: Verdict }) {
  const vs = VERDICT_STYLE[v.verdict] ?? VERDICT_STYLE.caution;
  const advancePct = v.recommendedAdvanceBps / 100;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-[#101010] p-4 flex flex-col gap-3"
    >
      {/* Verdict + score */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ color: vs.color, background: `${vs.color}18`, border: `1px solid ${vs.color}30` }}
        >
          <vs.Icon className="w-3.5 h-3.5" /> {vs.label}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          Confidence: <span className="text-[#E1E0CC]">{v.confidence}</span>
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">Buyer risk score</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: vs.color }}>{v.buyerScore}<span className="text-base text-gray-600">/100</span></p>
        </div>
        <div className="flex-1 text-right">
          <p className="text-[10px] uppercase tracking-widest text-gray-500">Suggested tier</p>
          <p className="text-sm font-medium text-[#DEDBC8]">{v.recommendedTier} · {advancePct}% advance</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">{v.rationale}</p>

      {v.strengths?.length > 0 && (
        <div className="flex flex-col gap-1">
          {v.strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" /> {s}
            </div>
          ))}
        </div>
      )}
      {v.riskFactors?.length > 0 && (
        <div className="flex flex-col gap-1">
          {v.riskFactors.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
              <AlertTriangle className="w-3.5 h-3.5 text-[#FFA500] shrink-0 mt-0.5" /> {r}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

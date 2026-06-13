"use client";

const TIER_COLOR: Record<string, string> = {
  Excellent: "#22c55e",
  Good:      "#DEDBC8",
  Fair:      "#f97316",
  New:       "#ef4444",
};

interface Props {
  score?: number;
  tier?: string;
  advanceRate?: number;
  className?: string;
}

export function CreditScoreBadge({ score = 50, tier = "New", advanceRate = 85, className = "" }: Props) {
  const color = TIER_COLOR[tier] ?? "#DEDBC8";

  return (
    <div className={`bg-[#101010] rounded-2xl p-6 border border-white/5 flex flex-col gap-5 justify-between ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-[10px] uppercase tracking-widest">Credit Score</p>
        <span
          className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-[#212121]"
          style={{ color }}
        >
          {tier}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-5xl font-bold" style={{ color }}>{score}</span>
        <span className="text-gray-500 text-sm mb-1">/ 100</span>
      </div>

      {/* Score bar */}
      <div className="bg-black rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>

      <p className="text-gray-400 text-sm">
        Advance rate:{" "}
        <span className="font-bold" style={{ color: "#DEDBC8" }}>{advanceRate}%</span>
      </p>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
        <div className="text-center">
          <p className="text-[#DEDBC8] font-bold text-lg">{score}</p>
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">Score</p>
        </div>
        <div className="text-center">
          <p className="text-[#DEDBC8] font-bold text-lg">{advanceRate}%</p>
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">Advance</p>
        </div>
      </div>
    </div>
  );
}

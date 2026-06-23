"use client";
import { useAppWallet } from "@/hooks/use-app-wallet";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp, DollarSign, ShieldCheck } from "lucide-react";

const ROLES = [
  {
    id: "seller",
    label: "Seller",
    tag: "SME",
    tagColor: "#DEDBC8",
    icon: <DollarSign className="w-7 h-7" />,
    headline: "Float your invoices.",
    desc: "Upload an invoice and receive USDC upfront, same day. No bank. No waiting.",
    stats: [
      { label: "Max advance", value: "90%" },
      { label: "Settlement", value: "<1s" },
      { label: "Fee cap", value: "8%" },
    ],
    href: "/app/seller",
    glow: "rgba(222,219,200,0.07)",
    glowHover: "rgba(222,219,200,0.13)",
    video: "/card-seller.mp4",
  },
  {
    id: "buyer",
    label: "Buyer",
    tag: "Payer",
    tagColor: "#FFA500",
    icon: <ShieldCheck className="w-7 h-7" />,
    headline: "Pay at maturity.",
    desc: "View all invoices assigned to you. Pay 100% at due date, no early pressure, no friction.",
    stats: [
      { label: "Payment", value: "100%" },
      { label: "Grace period", value: "7 days" },
      { label: "Collateral", value: "refunded on pay" },
    ],
    href: "/app/buyer",
    glow: "rgba(255,165,0,0.05)",
    glowHover: "rgba(255,165,0,0.1)",
    video: "/card-buyer.mp4",
  },
  {
    id: "investor",
    label: "Investor",
    tag: "LP",
    tagColor: "#22c55e",
    icon: <TrendingUp className="w-7 h-7" />,
    headline: "Earn yield on USDC.",
    desc: "Deposit into the pool. Earn from every invoice advance. Withdraw anytime.",
    stats: [
      { label: "LP fee share", value: "75%" },
      { label: "Settlement", value: "<1s" },
      { label: "Withdraw", value: "anytime" },
    ],
    href: "/app/investor",
    glow: "rgba(34,197,94,0.05)",
    glowHover: "rgba(34,197,94,0.1)",
    video: "/card-investor.mp4",
  },
];

export default function AppHomePage() {
  const { isConnected } = useAppWallet();

  return (
    <div className="relative min-h-[88vh] flex flex-col items-center justify-center py-12 overflow-hidden">

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full bg-[#DEDBC8]/[0.03] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[#22c55e]/[0.03] blur-[100px]" />
        <div className="absolute top-1/2 left-0 w-[300px] h-[300px] rounded-full bg-[#FFA500]/[0.02] blur-[80px]" />
      </div>

      {!isConnected ? (
        /* ─── Connect screen ─── */
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative text-center max-w-lg px-4"
        >
          {/* Glass card */}
          <div
            className="rounded-[2rem] border border-white/10 p-10 sm:p-14 flex flex-col items-center gap-6"
            style={{
              backdropFilter: "blur(32px) saturate(180%)",
              background: "rgba(255,255,255,0.04)",
              boxShadow: "0 0 80px rgba(222,219,200,0.05), inset 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(222,219,200,0.08)",
                border: "1px solid rgba(222,219,200,0.15)",
              }}
            >
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-3">
                Invoice Factoring · Arc Testnet
              </p>
              <h1 className="text-3xl sm:text-4xl font-medium leading-[0.95] tracking-tight mb-3" style={{ color: "#E1E0CC" }}>
                Float your invoices.
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                SMEs get paid today. Buyers pay at maturity. Investors earn yield. All on-chain, all in USDC.
              </p>
            </div>
            <ConnectButton />
          </div>
        </motion.div>

      ) : (
        /* ─── Role selector ─── */
        <div className="relative w-full max-w-6xl px-4">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-10"
          >
            <p className="text-primary text-[10px] tracking-[0.2em] uppercase font-semibold mb-3">
              Choose your role
            </p>
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight" style={{ color: "#E1E0CC" }}>
              How are you using Float?
            </h2>
          </motion.div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ROLES.map((role, i) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link href={role.href} className="group block h-full">
                  <div
                    className="relative h-full rounded-[1.75rem] p-7 flex flex-col gap-6 transition-all duration-500 cursor-pointer overflow-hidden"
                    style={{
                      backdropFilter: "blur(32px) saturate(180%)",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: `0 0 60px ${role.glow}`,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(255,255,255,0.14)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 80px ${role.glowHover}`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                      (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(255,255,255,0.08)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 60px ${role.glow}`;
                    }}
                  >
                    {/* Video background */}
                    <video
                      className="absolute inset-0 w-full h-full object-cover rounded-[1.75rem] pointer-events-none"
                      src={role.video}
                      autoPlay
                      muted
                      loop
                      playsInline
                      style={{ opacity: 0.45 }}
                    />
                    {/* Gradient overlay keeps text readable */}
                    <div
                      className="absolute inset-0 rounded-[1.75rem] pointer-events-none"
                      style={{ background: "linear-gradient(160deg, rgba(10,10,10,0.25) 0%, rgba(10,10,10,0.65) 100%)" }}
                    />

                    {/* Noise layer */}
                    <div className="noise-overlay absolute inset-0 opacity-[0.3] mix-blend-overlay pointer-events-none rounded-[1.75rem]" />

                    {/* Content (above video + overlays) */}
                    <div className="relative z-10 flex flex-col gap-6 h-full">

                    {/* Top row: icon + tag + arrow */}
                    <div className="flex items-start justify-between">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          background: `${role.glow.replace("0.07", "0.15")}`,
                          border: `1px solid ${role.tagColor}22`,
                          color: role.tagColor,
                        }}
                      >
                        {role.icon}
                      </div>
                      <ArrowUpRight
                        className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        style={{ color: role.tagColor }}
                      />
                    </div>

                    {/* Role label */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="text-[9px] font-mono tracking-[0.18em] uppercase px-2 py-0.5 rounded-full"
                          style={{
                            color: role.tagColor,
                            background: `${role.tagColor}18`,
                            border: `1px solid ${role.tagColor}30`,
                          }}
                        >
                          {role.tag}
                        </span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-medium tracking-tight mb-2" style={{ color: "#E1E0CC" }}>
                        {role.label}
                      </h3>
                      <p className="text-gray-400 text-sm leading-relaxed">{role.desc}</p>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-white/[0.06]">
                      {role.stats.map((s) => (
                        <div key={s.label} className="flex flex-col gap-0.5">
                          <span className="text-gray-600 text-[9px] uppercase tracking-widest">{s.label}</span>
                          <span className="font-bold text-sm tabular-nums" style={{ color: role.tagColor }}>
                            {s.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    </div>{/* end z-10 content wrapper */}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Bottom footnote */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center text-gray-600 text-xs mt-8"
          >
            Running on Arc Testnet · All transactions settled in USDC · No MetaMask required
          </motion.p>
        </div>
      )}
    </div>
  );
}

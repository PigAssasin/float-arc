"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useReadContracts } from "wagmi";
import { useAppWallet } from "@/hooks/use-app-wallet";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, ChevronDown } from "lucide-react";
import { CONTRACTS, FloatPoolABI, FloatCoreABI } from "@/lib/contracts";
import { useMyInvoices } from "@/hooks/use-my-invoices";
import { formatUnits } from "viem";
import type { ChatContext } from "@/app/api/chat/route";

const USDC_DECIMALS = 6;

function renderMarkdown(text: string) {
  // Split on **bold** markers and render inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#DEDBC8", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

const SUGGESTIONS = [
  "How does Float work?",
  "What is my advance rate?",
  "How do I create an invoice?",
  "How do investors earn yield?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

function fmt(n: bigint | undefined, decimals = USDC_DECIMALS, digits = 0): string {
  if (n === undefined) return "0";
  return parseFloat(formatUnits(n, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function FloatAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { address, isConnected } = useAppWallet();

  const role: ChatContext["role"] = pathname.includes("/seller")
    ? "seller"
    : pathname.includes("/buyer")
    ? "buyer"
    : pathname.includes("/investor")
    ? "investor"
    : undefined;

  // Pool stats
  const { data: poolData } = useReadContracts({
    contracts: [
      { address: CONTRACTS.FLOAT_POOL, abi: FloatPoolABI, functionName: "totalAssets" },
      { address: CONTRACTS.FLOAT_POOL, abi: FloatPoolABI, functionName: "availableLiquidity" },
      { address: CONTRACTS.FLOAT_POOL, abi: FloatPoolABI, functionName: "insuranceReserve" },
      {
        address: CONTRACTS.FLOAT_POOL,
        abi: FloatPoolABI,
        functionName: "shares",
        args: address ? [address] : undefined,
      } as const,
      {
        address: CONTRACTS.FLOAT_CORE,
        abi: FloatCoreABI,
        functionName: "sellerScore",
        args: address ? [address] : undefined,
      } as const,
      {
        address: CONTRACTS.FLOAT_CORE,
        abi: FloatCoreABI,
        functionName: "sellerAdvanceBps",
        args: address ? [address] : undefined,
      } as const,
    ],
    query: { enabled: isConnected && !!address },
  });

  const { invoices } = useMyInvoices(address, role === "buyer" ? "buyer" : "seller");

  const buildContext = useCallback((): ChatContext => {
    const totalAssets = poolData?.[0]?.status === "success" ? (poolData[0].result as bigint) : undefined;
    const avail = poolData?.[1]?.status === "success" ? (poolData[1].result as bigint) : undefined;
    const insurance = poolData?.[2]?.status === "success" ? (poolData[2].result as bigint) : undefined;
    const myShares = poolData?.[3]?.status === "success" ? (poolData[3].result as bigint) : undefined;
    // Only meaningful for sellers; skip for buyer/investor to avoid noise
    const score = role === "seller" && poolData?.[4]?.status === "success" ? Number(poolData[4].result as bigint) : undefined;
    // Use on-chain bps (sellerAdvanceBps) so displayed rates follow the deployed tier logic.
    const advanceBps = role === "seller" && poolData?.[5]?.status === "success" ? Number(poolData[5].result as bigint) : undefined;

    const advanceRate = advanceBps !== undefined ? advanceBps / 100 : undefined;
    // v6 stake by tier: 2/3/4/5
    const stakeRate =
      advanceBps !== undefined
        ? advanceBps >= 9000 ? 2 : advanceBps >= 8800 ? 3 : advanceBps >= 8500 ? 4 : 5
        : undefined;

    const STATUS_LABELS = ["Pending Approval", "Pending Collateral", "Funded", "Paid", "Defaulted", "Cancelled"];

    return {
      // Full address so the assistant's tools can read this user's on-chain data.
      walletAddress: address ?? undefined,
      role,
      creditScore: score,
      advanceRate,
      stakeRate,
      invoices: invoices.slice(0, 5).map((inv) => ({
        status: STATUS_LABELS[inv.status] ?? String(inv.status),
        amount: fmt(inv.amount),
        dueDate: new Date(Number(inv.dueDate) * 1000).toLocaleDateString(),
      })),
      poolTvl: totalAssets !== undefined ? fmt(totalAssets) : undefined,
      availableLiquidity: avail !== undefined ? fmt(avail) : undefined,
      insuranceReserve: insurance !== undefined ? fmt(insurance) : undefined,
      myShares: myShares !== undefined ? fmt(myShares) : undefined,
    };
  }, [poolData, invoices, address, role]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const newMessages: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      // Placeholder for assistant reply
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            context: buildContext(),
          }),
        });

        if (!res.ok || !res.body) throw new Error("API error");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: false });
        let leftover = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = leftover + decoder.decode(value, { stream: true });
          const lines = text.split(/\r?\n/);
          leftover = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const { token } = JSON.parse(data);
              if (token) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: updated[updated.length - 1].content + token,
                  };
                  return updated;
                });
              }
            } catch {
              // skip incomplete JSON
            }
          }
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          };
          return updated;
        });
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, buildContext]
  );

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all"
        style={{
          background: open ? "#101010" : "linear-gradient(135deg, #DEDBC8 0%, #b5b29c 100%)",
          border: "1px solid rgba(222,219,200,0.3)",
          boxShadow: "0 8px 32px rgba(222,219,200,0.15)",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Float Assistant"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <ChevronDown className="w-5 h-5" style={{ color: "#DEDBC8" }} />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Sparkles className="w-5 h-5 text-black" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-50 w-auto sm:w-[360px] rounded-2xl overflow-hidden flex flex-col"
            style={{
              height: "min(480px, 70vh)",
              background: "#0a0a0a",
              border: "1px solid rgba(222,219,200,0.12)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(222,219,200,0.05)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "rgba(222,219,200,0.08)", background: "#111" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,219,200,0.1)" }}>
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#DEDBC8" }} />
                </div>
                <div>
                  <p className="text-[#E1E0CC] text-sm font-medium leading-none">Float Assistant</p>
                  <p className="text-gray-600 text-[10px] mt-0.5">Powered by DeepSeek</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-600 hover:text-gray-400 transition-colors p-1 rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="text-center pt-2">
                    <p className="text-gray-500 text-xs">Ask me anything about Float</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-[11px] text-gray-400 hover:text-[#DEDBC8] px-3 py-2.5 rounded-xl transition-all hover:bg-white/[0.06]"
                        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] px-3 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={
                      msg.role === "user"
                        ? { background: "rgba(222,219,200,0.1)", color: "#E1E0CC", borderRadius: "12px 12px 4px 12px" }
                        : { background: "rgba(255,255,255,0.04)", color: "#c8c7b5", borderRadius: "12px 12px 12px 4px", border: "1px solid rgba(255,255,255,0.06)" }
                    }
                  >
                    {msg.content
                      ? renderMarkdown(msg.content)
                      : (
                      <span className="flex gap-1 items-center py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="px-3 py-3 border-t"
              style={{ borderColor: "rgba(222,219,200,0.08)", background: "#0d0d0d" }}
            >
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
                  placeholder="Ask Float anything..."
                  disabled={streaming}
                  className="flex-1 bg-transparent text-[#E1E0CC] text-sm placeholder-gray-600 outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || streaming}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: input.trim() ? "rgba(222,219,200,0.15)" : "transparent" }}
                >
                  <Send className="w-3.5 h-3.5" style={{ color: "#DEDBC8" }} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

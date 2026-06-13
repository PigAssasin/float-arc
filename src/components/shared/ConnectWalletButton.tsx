"use client";
import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, LogOut, ChevronDown, Shield, Wallet } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useCircleWallet } from "@/hooks/use-circle-wallet";

export function ConnectWalletButton() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { state: circleState, connect: circleConnect, disconnect: circleDisconnect } = useCircleWallet();
  const connectors = useConnectors();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const circleConnected = circleState.status === "connected";
  const circleAddress = circleConnected ? circleState.address : null;

  // Connected state — wagmi wallet
  if (wagmiConnected && wagmiAddress) {
    return (
      <button
        onClick={() => wagmiDisconnect()}
        className="flex items-center gap-2 bg-[#212121] hover:bg-[#2a2a2a] text-[#E1E0CC] rounded-full px-4 py-2 text-sm transition-colors border border-white/5"
      >
        <span className="w-2 h-2 rounded-full bg-[#008000]" />
        <span>{wagmiAddress.slice(0, 6)}...{wagmiAddress.slice(-4)}</span>
        <LogOut className="w-3 h-3 text-gray-500" />
      </button>
    );
  }

  // Connected state — Circle wallet
  if (circleConnected && circleAddress) {
    return (
      <button
        onClick={() => circleDisconnect()}
        className="flex items-center gap-2 bg-[#212121] hover:bg-[#2a2a2a] text-[#E1E0CC] rounded-full px-4 py-2 text-sm transition-colors border border-white/5"
      >
        <span className="w-2 h-2 rounded-full bg-blue-400" />
        <span className="text-xs text-blue-400 mr-1">Circle</span>
        <span>{circleAddress.slice(0, 6)}...{circleAddress.slice(-4)}</span>
        <LogOut className="w-3 h-3 text-gray-500" />
      </button>
    );
  }

  const isLoading = isPending || circleState.status === "loading" || circleState.status === "pin-setup";

  // EIP-6963 connectors — only those with a detected provider (wallet is installed)
  const detectedConnectors = connectors.filter(
    (c) => c.type === "injected" && c.id !== "injected"
  );
  // Generic injected fallback if no specific wallets detected but window.ethereum exists
  const genericInjected = connectors.find((c) => c.id === "injected");

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        disabled={isLoading}
        whileTap={{ scale: 0.97 }}
        className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm pl-5 pr-2 py-2 rounded-full shadow-lg transition-all duration-300 disabled:opacity-50 cursor-pointer"
      >
        <span className="select-none">
          {circleState.status === "loading" && "Connecting..."}
          {circleState.status === "pin-setup" && "Setting up PIN..."}
          {!isLoading && "Connect Wallet"}
        </span>
        <span className="bg-black rounded-full w-8 h-8 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ArrowRight className="w-3.5 h-3.5 text-primary" />}
        </span>
      </motion.button>

      <AnimatePresence>
        {open && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-60 rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl overflow-hidden z-50"
          >
            {/* Detected injected wallets via EIP-6963 */}
            {detectedConnectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => { connect({ connector }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <WalletIcon connector={connector} />
                <div>
                  <p className="text-sm font-medium text-[#E1E0CC]">{connector.name}</p>
                  <p className="text-xs text-gray-500">Detected</p>
                </div>
              </button>
            ))}

            {/* Generic fallback (window.ethereum, no EIP-6963) */}
            {detectedConnectors.length === 0 && genericInjected && (
              <button
                onClick={() => { connect({ connector: genericInjected }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#E1E0CC]">Browser Wallet</p>
                  <p className="text-xs text-gray-500">MetaMask / injected</p>
                </div>
              </button>
            )}

            {(detectedConnectors.length > 0 || genericInjected) && (
              <div className="h-px bg-white/5 mx-4" />
            )}

            {/* Circle Wallet */}
            <button
              onClick={() => { circleConnect(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#E1E0CC]">Circle Wallet</p>
                <p className="text-xs text-gray-500">No extension needed</p>
              </div>
            </button>

            {detectedConnectors.length === 0 && !genericInjected && (
              <div className="px-4 py-3 border-t border-white/5">
                <p className="text-xs text-gray-600">No browser wallet detected. Install MetaMask or OKX to get started.</p>
              </div>
            )}

            {circleState.status === "error" && (
              <div className="px-4 py-2 text-xs text-red-400 border-t border-white/5">
                {circleState.message}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Resolve wallet icon — use connector's icon URL if provided (EIP-6963), else fallback
function WalletIcon({ connector }: { connector: { name: string; icon?: string } }) {
  const [imgErr, setImgErr] = useState(false);

  if (connector.icon && !imgErr) {
    return (
      <img
        src={connector.icon}
        alt={connector.name}
        onError={() => setImgErr(true)}
        className="w-8 h-8 rounded-xl flex-shrink-0 object-contain bg-white/5 p-1"
      />
    );
  }

  // Text fallback
  const abbr = connector.name.slice(0, 3).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-300">
      {abbr}
    </div>
  );
}

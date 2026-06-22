"use client";

import { createContext, useContext } from "react";
import { useCircleWallet, CircleWalletState, CircleContractCall } from "@/hooks/use-circle-wallet";

interface CircleWalletContextValue {
  state: CircleWalletState;
  connect: (email: string) => Promise<void>;
  disconnect: () => void;
  executeContract: (call: CircleContractCall) => Promise<void>;
}

const CircleWalletContext = createContext<CircleWalletContextValue | null>(null);

export function CircleWalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useCircleWallet();
  return (
    <CircleWalletContext.Provider value={wallet}>
      {children}
    </CircleWalletContext.Provider>
  );
}

export function useCircleWalletContext(): CircleWalletContextValue {
  const ctx = useContext(CircleWalletContext);
  if (!ctx) throw new Error("useCircleWalletContext must be used inside CircleWalletProvider");
  return ctx;
}

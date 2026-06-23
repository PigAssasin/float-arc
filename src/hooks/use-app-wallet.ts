"use client";

import { useAccount } from "wagmi";
import { useCircleWalletContext } from "@/contexts/circle-wallet-context";

export interface AppWallet {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isCircle: boolean;
}

/**
 * Unified wallet hook for RainbowKit/wagmi and Circle Wallets.
 * Prefer a connected browser wallet when both are present; otherwise surface the
 * Circle wallet so dashboards and transaction branches stay in sync.
 */
export function useAppWallet(): AppWallet {
  const { address, isConnected } = useAccount();
  const { state: circleState } = useCircleWalletContext();
  const circleConnected = circleState.status === "connected";
  const circleAddress = circleConnected ? circleState.address : undefined;

  if (isConnected && address) {
    return { address, isConnected: true, isCircle: false };
  }

  return {
    address: circleAddress,
    isConnected: circleConnected && !!circleAddress,
    isCircle: circleConnected,
  };
}

"use client";

import { useAccount } from "wagmi";

export interface AppWallet {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isCircle: boolean;
}

/**
 * Unified wallet hook. The app now connects wallets via RainbowKit + wagmi only,
 * so this is a thin wrapper over useAccount. `isCircle` is retained (always false)
 * so existing Circle-aware branches stay type-safe and dormant.
 */
export function useAppWallet(): AppWallet {
  const { address, isConnected } = useAccount();
  return { address, isConnected: isConnected && !!address, isCircle: false };
}

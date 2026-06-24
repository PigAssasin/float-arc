"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit/components";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi-config";
import { createFloatRainbowTheme } from "@/lib/rainbow-theme";
import { CircleWalletProvider } from "@/contexts/circle-wallet-context";

// Provider order: WagmiProvider -> QueryClientProvider -> RainbowKitProvider -> children.
// RainbowKit theme matches the Prisma Dark palette (accent #DEDBC8 on near-black).
// CircleWalletProvider is kept mounted but dormant (no UI) so existing hooks that read
// its context keep compiling; the wallet UX is now RainbowKit-only.
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={createFloatRainbowTheme()}
        >
          <CircleWalletProvider>{children}</CircleWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

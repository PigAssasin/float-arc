"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi-config";
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
          theme={darkTheme({
            accentColor: "#DEDBC8",
            accentColorForeground: "#101010",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          <CircleWalletProvider>{children}</CircleWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi-config";
import { useState } from "react";
import { CircleWalletProvider } from "@/contexts/circle-wallet-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CircleWalletProvider>
          {children}
        </CircleWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

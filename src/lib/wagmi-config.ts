import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain, parseGwei } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    fallback: { http: ["https://rpc.blockdaemon.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  fees: {
    defaultPriorityFee: parseGwei("1"),
  },
  testnet: true,
});

const transports = {
  [arcTestnet.id]: http("https://rpc.testnet.arc.network", { retryCount: 3, retryDelay: 500 }),
};

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// With a WalletConnect projectId → full RainbowKit wallet set (incl. WalletConnect/mobile).
// Without one → fall back to injected() only (MetaMask, OKX, Rabby...) so localhost and
// CI never crash on a missing WalletConnect project. Arc Testnet is the only chain.
export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: "Float",
      projectId,
      chains: [arcTestnet],
      transports,
      ssr: true,
    })
  : createConfig({
      chains: [arcTestnet],
      connectors: [injected()],
      transports,
      ssr: true,
    });

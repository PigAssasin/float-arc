# Arc Network Reference

> Source of truth for all Arc Testnet addresses and config.
> Always verify via `arc-docs` MCP before using — do not guess.
> Full architecture graph: [arc-network-graph.md](./arc-network-graph.md)

---

## Chain Config

| | |
|---|---|
| **Chain ID** | `5042002` |
| **Network Name** | Arc Testnet |
| **Currency** | USDC |
| **Block time** | ~0.48 seconds |
| **Finality** | < 1 second, deterministic (no reorgs) |
| **Gas cost** | ~$0.01/tx |
| **EVM Compat** | Prague hard fork (Reth) |
| **Consensus** | Malachite BFT, permissioned validators |
| **Solidity pragma** | `^0.8.20` |

---

## wagmi / viem Chain Definition

```typescript
import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
    blockdaemon: {
      http: ["https://rpc.blockdaemon.testnet.arc.network"],
      webSocket: ["wss://rpc.blockdaemon.testnet.arc.network:443/websocket"],
    },
    drpc: {
      http: ["https://rpc.drpc.testnet.arc.network"],
      webSocket: ["wss://rpc.drpc.testnet.arc.network"],
    },
    quicknode: {
      http: ["https://rpc.quicknode.testnet.arc.network"],
      webSocket: ["wss://rpc.quicknode.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

// Only Arc Testnet — no other chains
export const SUPPORTED_CHAINS = [arcTestnet] as const;
```

---

## Token Addresses (Testnet)

| Token | Address | Decimals | Dùng cho |
|---|---|---|---|
| **USDC** | `0x3600000000000000000000000000000000000000` | 6 ERC-20 / 18 native | Gas, settlement, pool |
| **EURC** | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | Euro stablecoin, FX |
| **USYC** | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | 6 | Yield-bearing collateral |

> ⚠️ USDC dual interface: **luôn dùng 6 decimals** cho ERC-20. 18 decimals chỉ dùng nội bộ native gas.

---

## Infrastructure Contracts (Testnet)

### CCTP v2 — Cross-chain USDC

| Contract | Address |
|---|---|
| **TokenMessengerV2** | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| **MessageTransmitterV2** | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| **GatewayWallet** | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| **GatewayMinter** | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

### Utility Contracts

| Contract | Address |
|---|---|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| CREATE2 Factory | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

### USYC Infrastructure

| Contract | Address |
|---|---|
| Teller | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| Entitlements | `0xcc205224862c7641930c87679e98999d23c26113` |

### Oracle

| Contract | Address |
|---|---|
| Pyth | `0x2880aB155794e7179c9eE2e38200202908C17B43` |

---

## ERC-8004 AI Agent Registry

| | Address |
|---|---|
| Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Validation Registry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

---

## RPC Endpoints

| Provider | HTTP | WebSocket |
|---|---|---|
| **Primary** | `https://rpc.testnet.arc.network` | `wss://rpc.testnet.arc.network` |
| Blockdaemon | `https://rpc.blockdaemon.testnet.arc.network` | `wss://rpc.blockdaemon.testnet.arc.network:443/websocket` |
| dRPC | `https://rpc.drpc.testnet.arc.network` | `wss://rpc.drpc.testnet.arc.network` |
| QuickNode | `https://rpc.quicknode.testnet.arc.network` | `wss://rpc.quicknode.testnet.arc.network` |

---

## Oracle Providers

| Provider | Model | Notes |
|---|---|---|
| **Chainlink** | Push | Crypto + FX feeds |
| **Pyth** | Pull | Real-time, ultra-fast |
| **RedStone** | Push/Pull | Modular |
| **Stork** | Pull | Ultra-low latency |

> ⚠️ **Max staleness: 3600 seconds** — luôn check trước khi dùng price data.

---

## Circle SDK

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
```

| Module | Chức năng |
|---|---|
| Bridge | Cross-chain USDC transfer |
| Swap | Same-chain token swap |
| Send | P2P transfers |
| Unified Balance | Cross-chain balance view |

---

## Tooling Ecosystem

| Category | Options |
|---|---|
| Account Abstraction | Smart wallets, Paymasters, Session keys |
| Node Providers | Alchemy, QuickNode, Blockdaemon, dRPC |
| Data Indexers | The Graph, Envio, Goldsky, Thirdweb |
| Compliance | Elliptic, TRM Labs |
| Privacy (opt-in) | ArcaneVM |
| Post-quantum | SLH-DSA-SHA2-128s wallet signatures |

---

## Useful Links

| | |
|---|---|
| Arc Docs | https://docs.arc.network/ |
| Circle Docs | https://developers.circle.com/ |
| Circle Console | https://console.circle.com/signup |
| Arc Explorer | https://testnet.arcscan.app |
| USDC Faucet | https://faucet.circle.com |
| Arc Sample Apps | https://docs.arc.network/arc/references/sample-applications |

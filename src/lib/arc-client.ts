import { createPublicClient, http } from "viem";
import { arcTestnet } from "./wagmi-config";

// Standalone viem client for polling on-chain state outside of wagmi/React —
// used to wait for Circle-broadcast transactions to confirm before the next step.
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

// Poll a predicate until it returns true or the attempt budget is exhausted.
export async function pollUntil(
  check: () => Promise<boolean>,
  { attempts = 30, intervalMs = 2000 } = {}
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

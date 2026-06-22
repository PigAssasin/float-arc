// Server-side underwriting data gathering. Enumerates on-chain invoices and
// derives risk statistics for a buyer and seller, used by the AI Underwriter
// agent to produce a credit assessment. Read-only viem client (no wagmi).

import { createPublicClient, http, defineChain, formatUnits } from "viem";
import { CONTRACTS, FloatCoreABI, USDC_DECIMALS } from "@/lib/contracts";

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});

const client = createPublicClient({ chain: arc, transport: http() });

const STATUS = ["PendingApproval", "PendingCollateral", "Funded", "Paid", "Defaulted", "Cancelled"];
const ZERO = "0x0000000000000000000000000000000000000000";

type RawInvoice = {
  seller: `0x${string}`; buyer: `0x${string}`; amount: bigint; advance: bigint;
  collateral: bigint; stake: bigint; dueDate: bigint; createdAt: bigint;
  approvedAt: bigint; amountPaid: bigint; status: number;
};

export interface PartyStats {
  address: string;
  onChainScore: number;       // contract score (paid/total*100, or 50 if none)
  totalInvoices: number;
  paid: number;
  defaulted: number;
  active: number;             // funded or in-progress
  cancelled: number;
  totalVolumeUsdc: number;
  avgInvoiceUsdc: number;
  avgTermDays: number | null;
  hasHistory: boolean;
}

export interface UnderwritingData {
  buyer: PartyStats;
  seller: PartyStats | null;
  invoice: {
    amountUsdc: number;
    termDays: number | null;
    amountVsBuyerAvg: number | null;   // ratio to buyer's average invoice
  };
  pool: {
    availableLiquidityUsdc: number;
    pctOfAvailableLiquidity: number | null;
  };
}

const core = (functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: functionName as never, args: args as never });

function statsFor(address: string, invoices: RawInvoice[], role: "buyer" | "seller", onChainScore: number): PartyStats {
  const lower = address.toLowerCase();
  const mine = invoices.filter((inv) =>
    (role === "buyer" ? inv.buyer : inv.seller).toLowerCase() === lower
  );
  const num = (v: bigint) => Number(formatUnits(v, USDC_DECIMALS));
  let paid = 0, defaulted = 0, active = 0, cancelled = 0, volume = 0, termSum = 0, termCount = 0;
  for (const inv of mine) {
    const s = STATUS[inv.status];
    if (s === "Paid") paid++;
    else if (s === "Defaulted") defaulted++;
    else if (s === "Cancelled") cancelled++;
    else active++;
    volume += num(inv.amount);
    if (inv.dueDate > BigInt(0) && inv.createdAt > BigInt(0)) {
      termSum += Number(inv.dueDate - inv.createdAt) / 86400;
      termCount++;
    }
  }
  return {
    address,
    onChainScore,
    totalInvoices: mine.length,
    paid, defaulted, active, cancelled,
    totalVolumeUsdc: Math.round(volume * 100) / 100,
    avgInvoiceUsdc: mine.length ? Math.round((volume / mine.length) * 100) / 100 : 0,
    avgTermDays: termCount ? Math.round(termSum / termCount) : null,
    hasHistory: mine.length > 0,
  };
}

export async function gatherUnderwritingData(
  buyer: string,
  seller: string | undefined,
  amountUsdc: number,
  dueDateMs: number | undefined,
): Promise<UnderwritingData> {
  const count = Number((await core("invoiceCount")) as bigint);
  const ids = Array.from({ length: Math.min(count, 100) }, (_, i) => i);
  const raw = ids.length
    ? ((await Promise.all(ids.map((i) => core("getInvoice", [BigInt(i)])))) as RawInvoice[])
        .filter((inv) => inv.seller !== ZERO)
    : [];

  const [buyerScoreRaw, available] = (await Promise.all([
    core("buyerScore", [buyer]),
    core("availableLiquidity").catch(() => BigInt(0)),
  ])) as [bigint, bigint];

  const buyerStats = statsFor(buyer, raw, "buyer", Number(buyerScoreRaw));

  let sellerStats: PartyStats | null = null;
  if (seller && /^0x[a-fA-F0-9]{40}$/.test(seller)) {
    const sScore = Number((await core("sellerScore", [seller])) as bigint);
    sellerStats = statsFor(seller, raw, "seller", sScore);
  }

  const availableUsdc = Number(formatUnits(available, USDC_DECIMALS));
  const termDays = dueDateMs ? Math.round((dueDateMs - Date.now()) / 86_400_000) : null;

  return {
    buyer: buyerStats,
    seller: sellerStats,
    invoice: {
      amountUsdc,
      termDays,
      amountVsBuyerAvg: buyerStats.avgInvoiceUsdc > 0
        ? Math.round((amountUsdc / buyerStats.avgInvoiceUsdc) * 100) / 100
        : null,
    },
    pool: {
      availableLiquidityUsdc: Math.round(availableUsdc * 100) / 100,
      pctOfAvailableLiquidity: availableUsdc > 0
        ? Math.round((amountUsdc / availableUsdc) * 1000) / 10
        : null,
    },
  };
}

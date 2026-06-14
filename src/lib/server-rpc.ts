// Server-side read-only chain access for the AI assistant's tool calls.
// Defines a minimal viem public client (no wagmi/React deps) so it is safe to
// import inside the edge API route.

import { createPublicClient, http, defineChain, formatUnits } from "viem";
import { CONTRACTS, FloatCoreABI, FloatPoolABI, USDC_DECIMALS } from "@/lib/contracts";

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});

const client = createPublicClient({ chain: arc, transport: http() });

const fmt = (v: bigint) => formatUnits(v, USDC_DECIMALS);
const STATUS = ["Pending Approval", "Pending Collateral", "Funded", "Paid", "Defaulted", "Cancelled"];
const isAddr = (a?: string): a is `0x${string}` => !!a && /^0x[a-fA-F0-9]{40}$/.test(a);

type RawInvoice = {
  seller: `0x${string}`; buyer: `0x${string}`; amount: bigint; advance: bigint;
  collateral: bigint; stake: bigint; dueDate: bigint; createdAt: bigint;
  approvedAt: bigint; amountPaid: bigint; status: number;
};

const pool = (functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: CONTRACTS.FLOAT_POOL, abi: FloatPoolABI, functionName: functionName as never, args: args as never });
const core = (functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: functionName as never, args: args as never });

export async function getPoolStats() {
  const [totalAssets, available, insurance, shareValue] = (await Promise.all([
    pool("totalAssets"), pool("availableLiquidity"), pool("insuranceReserve"), pool("shareValue"),
  ])) as [bigint, bigint, bigint, bigint];
  return {
    totalPoolUsdc: fmt(totalAssets),
    availableLiquidityUsdc: fmt(available),
    insuranceReserveUsdc: fmt(insurance),
    shareValuePerToken: (Number(shareValue) / 1e18).toFixed(4),
    maxSingleInvoiceAdvanceUsdc: fmt((available * BigInt(2000)) / BigInt(10000)),
  };
}

export async function getMyScore(address?: string) {
  if (!isAddr(address)) return { error: "No wallet address available." };
  const [sScore, advBps, stkBps, bScore, fLP] = (await Promise.all([
    core("sellerScore", [address]), core("sellerAdvanceBps", [address]),
    core("sellerStakeBps", [address]), core("buyerScore", [address]),
    pool("balanceOf", [address]),
  ])) as [bigint, bigint, bigint, bigint, bigint];
  const adv = Number(advBps);
  const tier = adv >= 8800 ? "Excellent" : adv >= 8400 ? "Good" : adv >= 8000 ? "Fair" : "New";
  return {
    address,
    sellerScore: Number(sScore),
    sellerTier: tier, // derived from the advance rate — authoritative over the raw score
    advanceRatePct: adv / 100,
    stakePct: Number(stkBps) / 100,
    buyerScore: Number(bScore),
    fLPBalance: fmt(fLP),
  };
}

export async function getMyInvoices(address?: string, role?: "seller" | "buyer") {
  if (!isAddr(address)) return { error: "No wallet address available." };
  const count = Number((await core("invoiceCount")) as bigint);
  if (count === 0) return { count: 0, invoices: [] };
  const ids = Array.from({ length: Math.min(count, 80) }, (_, i) => i);
  const raw = (await Promise.all(ids.map((i) => core("getInvoice", [BigInt(i)])))) as RawInvoice[];
  const lower = address.toLowerCase();
  const invoices = raw
    .map((inv, i) => ({ inv, id: i }))
    .filter(({ inv }) => {
      if (role === "buyer") return inv.buyer.toLowerCase() === lower;
      if (role === "seller") return inv.seller.toLowerCase() === lower;
      return inv.seller.toLowerCase() === lower || inv.buyer.toLowerCase() === lower;
    })
    .map(({ inv, id }) => ({
      id,
      role: inv.seller.toLowerCase() === lower ? "seller" : "buyer",
      amountUsdc: fmt(inv.amount),
      advanceUsdc: fmt(inv.advance),
      amountPaidUsdc: fmt(inv.amountPaid),
      status: STATUS[inv.status] ?? String(inv.status),
      dueDate: new Date(Number(inv.dueDate) * 1000).toISOString().slice(0, 10),
    }));
  return { count: invoices.length, invoices };
}

export async function getInvoiceDetail(id: number) {
  const inv = (await core("getInvoice", [BigInt(id)])) as RawInvoice;
  if (inv.seller === "0x0000000000000000000000000000000000000000") return { error: `Invoice #${id} not found.` };
  let earlyRepay: { amountDueUsdc: string; discountUsdc: string } | null = null;
  try {
    const [amountDue, discount] = (await core("earlyRepayAmount", [BigInt(id)])) as [bigint, bigint];
    earlyRepay = { amountDueUsdc: fmt(amountDue), discountUsdc: fmt(discount) };
  } catch { /* not applicable unless FUNDED */ }
  return {
    id,
    seller: inv.seller,
    buyer: inv.buyer,
    amountUsdc: fmt(inv.amount),
    advanceUsdc: fmt(inv.advance),
    collateralUsdc: fmt(inv.collateral),
    stakeUsdc: fmt(inv.stake),
    amountPaidUsdc: fmt(inv.amountPaid),
    remainingUsdc: fmt(inv.amount - inv.amountPaid),
    status: STATUS[inv.status] ?? String(inv.status),
    dueDate: new Date(Number(inv.dueDate) * 1000).toISOString().slice(0, 10),
    earlyRepay,
  };
}

// ── Tool registry consumed by the chat route ────────────────────────────────

export const TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "get_pool_stats",
      description: "Get live Float pool stats: total USDC, available liquidity, insurance reserve, fLP share value, and the max single-invoice advance.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_score",
      description: "Get the connected user's on-chain seller score, advance rate, stake rate, buyer score, and fLP token balance.",
      parameters: {
        type: "object",
        properties: { address: { type: "string", description: "Wallet address (defaults to the connected wallet)." } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_invoices",
      description: "List the connected user's invoices with status, amounts and due dates.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Wallet address (defaults to the connected wallet)." },
          role: { type: "string", enum: ["seller", "buyer"], description: "Filter by role; omit for both." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_detail",
      description: "Get full detail for one invoice by id: parties, amounts, collateral, stake, amount paid, remaining, status, due date, and early-repay quote.",
      parameters: {
        type: "object",
        properties: { id: { type: "number", description: "Invoice id (integer)." } },
        required: ["id"],
      },
    },
  },
] as const;

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  defaultAddress?: string,
): Promise<unknown> {
  const addr = (args.address as string) || defaultAddress;
  try {
    switch (name) {
      case "get_pool_stats": return await getPoolStats();
      case "get_my_score": return await getMyScore(addr);
      case "get_my_invoices": return await getMyInvoices(addr, args.role as "seller" | "buyer" | undefined);
      case "get_invoice_detail": return await getInvoiceDetail(Number(args.id));
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: `Tool ${name} failed: ${(e as Error).message?.slice(0, 120)}` };
  }
}

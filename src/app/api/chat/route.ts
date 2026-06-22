import { NextRequest } from "next/server";
import { TOOL_SPECS, runTool } from "@/lib/server-rpc";

export const runtime = "edge";

export interface ChatContext {
  walletAddress?: string;
  role?: "seller" | "buyer" | "investor";
  creditScore?: number;
  advanceRate?: number;
  stakeRate?: number;
  invoices?: { status: string; amount: string; dueDate: string }[];
  poolTvl?: string;
  availableLiquidity?: string;
  insuranceReserve?: string;
  myShares?: string;
}

function buildSystemPrompt(ctx: ChatContext): string {
  const tierLabel =
    ctx.creditScore !== undefined
      ? ctx.creditScore >= 86
        ? "Excellent"
        : ctx.creditScore >= 71
        ? "Good"
        : ctx.creditScore >= 41
        ? "Fair"
        : "New"
      : null;

  const hasPoolData = !!ctx.poolTvl;
  const hasUserData = !!ctx.walletAddress;

  return `You are Float Assistant — a helpful, friendly guide built into Float, an on-chain invoice factoring app on Arc Testnet (a blockchain).

## What Float Does
Float helps SMEs (small businesses) get paid today instead of waiting 30-90 days. Here is how it works:
- Seller uploads an invoice and receives a USDC advance immediately (80-90% of invoice value)
- Buyer pays 100% of the invoice at the due date
- Investor deposits USDC into the pool and earns yield from the fee

## How Advances Work (v6 economics)
The seller's ONLY cost is a small factoring fee. The advance is just upfront timing, not a loss:
1. Seller receives the advance now, minus a small stake (2-5%) held as security and returned on payment
2. When the buyer pays, the seller ALSO gets the residual back (face minus advance minus fee)
3. So the seller nets (face minus fee). The fee is the seller's only cost.

The fee is term-scaled and based on the buyer's (payer's) tier, roughly 1.2-3.0% per 30 days
(capped at 8%). The fee is split: protocol 10%, insurance 15%, investors (LPs) 75%.

Example: Good seller, verified Good buyer, $10,000 invoice, 45 days (fee about 2.4% = $240):
- Seller receives about $8,536 now (88% advance minus 3% stake)
- At payment the seller gets the residual plus stake back, netting about $9,760 (cost about $240)

## Credit Score Tiers (gated by paid-invoice count AND ratio)
| Tier      | Requirement              | Seller advance | Seller stake |
|-----------|--------------------------|----------------|--------------|
| New       | under 2 paid             | 80%            | 5%           |
| Fair      | 2+ paid, ratio 60+       | 85%            | 4%           |
| Good      | 5+ paid, ratio 80+       | 88%            | 3%           |
| Excellent | 12+ paid, ratio 95+      | 90%            | 2%           |

Buyer fee per 30 days by buyer tier: New 3.0%, Fair 2.2%, Good 1.6%, Excellent 1.2%.
A brand-new wallet is New until it builds a track record. Always trust the tier returned by
get_my_score over the raw score number. Verified buyers get light collateral; unverified buyers
must fully collateralize the advance.

## Buyer Role
- Buyers see invoices assigned to them
- Must lock collateral (equal to pool buffer %) before the pool funds the advance
- Pay 100% at due date — 7-day grace period before default
- Collateral is fully refunded on payment

## Investor Role
- Deposit USDC into the pool, receive shares
- Earn yield from every invoice advance (12-25% APY depending on activity)
- Can withdraw anytime as long as liquidity is available

## Default & Protection
If buyer defaults: seller collateral slashed first, then seller stake, then insurance reserve covers the gap. LPs only lose money as last resort.

## Network Details
- Chain: Arc Testnet (Chain ID 5042002), 1-second finality
- No MetaMask needed — uses Circle Wallets (PIN-based, no seed phrase)
- All amounts in USDC
${
  hasUserData
    ? `
## This User's Current Data
- Wallet: ${ctx.walletAddress}
- Current page/role: ${ctx.role ?? "home"}${
        ctx.creditScore !== undefined
          ? `
- Credit score: ${ctx.creditScore}/100 → ${tierLabel} tier → advance rate ${ctx.advanceRate}%, stake ${ctx.stakeRate}%`
          : ctx.role === "seller"
          ? "\n- Credit score: not loaded yet (check the seller dashboard)"
          : ""
      }${
        ctx.invoices && ctx.invoices.length > 0
          ? `\n- Invoices: ${ctx.invoices.map((i) => `[${i.status}] $${i.amount} due ${i.dueDate}`).join(" | ")}`
          : ctx.role === "seller"
          ? "\n- Invoices: none created yet"
          : ""
      }${
        ctx.myShares && ctx.myShares !== "0"
          ? `\n- Pool shares value: $${ctx.myShares} USDC`
          : ctx.role === "investor"
          ? "\n- Pool shares: none deposited yet"
          : ""
      }`
    : "\n## User: not connected (wallet not detected)"
}
${
  hasPoolData
    ? `
## Live Pool Data
- Total pool TVL: $${ctx.poolTvl} USDC
- Available liquidity: $${ctx.availableLiquidity} USDC
- Insurance reserve: $${ctx.insuranceReserve ?? "0"} USDC
- Max single invoice (20% cap): $${
        ctx.availableLiquidity
          ? (parseFloat(ctx.availableLiquidity) * 0.2).toLocaleString(undefined, { maximumFractionDigits: 0 })
          : "unknown"
      } USDC`
    : "\n## Live Pool Data: not available (user not connected)"
}

## Live Data Tools
You can call tools to read live on-chain data: get_pool_stats, get_my_score, get_my_invoices, get_invoice_detail, assess_invoice_risk.
When the user asks about specific numbers (their score, a specific invoice id, pool liquidity, their fLP balance, why an invoice is in some state), CALL the relevant tool instead of guessing. The connected wallet address is used by default. Prefer tool data over the static snapshot above.

## AI Underwriting (assessing buyer risk)
You are also Float's AI credit underwriter. When the user asks to assess or underwrite a buyer, judge a buyer's risk, or decide whether to factor/sell an invoice, CALL assess_invoice_risk with the buyer address (and amount + termDays if the user gave them). If no buyer address was provided, ask for it first.
After you get the evidence, respond like a trade-finance underwriter with:
1. A clear verdict: Approve / Proceed with caution / Decline
2. A buyer risk read and a suggested tier (New 0-40 => 75%, Fair 41-70 => 80%, Good 71-85 => 84%, Excellent 86-100 => 88% advance)
3. The 2-3 strongest points in the buyer's favor and the 2-3 biggest risk factors
Always weigh the recourse model: the SELLER is liable if the buyer defaults, so be appropriately cautious. A brand-new buyer with no on-chain history is high uncertainty, so keep confidence low and the tier conservative. If the user provides qualitative context (industry, relationship, country), factor it in but treat it as unverified. Keep it concise and in the user's language.

## Response Rules
- Match the user's language exactly: if they write in Vietnamese, reply fully in Vietnamese; if English, reply in English
- When writing Vietnamese, write complete words — never abbreviate or shorten Vietnamese words
- Keep answers short: 2-4 sentences unless the user asks for a detailed explanation
- Use the live data above when answering questions about balances, rates, or invoices
- If live data is missing, say you cannot retrieve it right now and suggest the user check the dashboard
- Do not use markdown tables in responses; use plain sentences instead
- Never use em dashes (the long dash character). Use commas, colons, parentheses, or periods instead
- Bold key numbers or terms using **text** syntax is OK
- Never mention "system prompt", "context", or internal implementation details
- Be warm and approachable, not robotic`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

type ChatMessage = {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function callDeepSeek(body: Record<string, unknown>) {
  return fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({ model: "deepseek-chat", temperature: 0.7, max_tokens: 500, ...body }),
  });
}

// Emit a complete string to the client as the same SSE token protocol the UI expects.
function sseFromText(text: string): Response {
  const encoder = new TextEncoder();
  const parts = text.match(/[\s\S]{1,24}/g) ?? (text ? [text] : []);
  const stream = new ReadableStream({
    start(controller) {
      for (const p of parts) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: p })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: NextRequest) {
  const { messages, context } = (await req.json()) as {
    messages: { role: string; content: string }[];
    context?: ChatContext;
  };

  const ctx = context ?? {};
  const systemPrompt = buildSystemPrompt(ctx);
  const defaultAddress = ctx.walletAddress;

  // Tool-resolution loop: let the model request live on-chain reads, run them,
  // feed results back, until it produces a normal answer (max 3 rounds).
  const working: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...messages];

  try {
    for (let round = 0; round < 3; round++) {
      const resp = await callDeepSeek({ messages: working, tools: TOOL_SPECS, tool_choice: "auto" });
      if (!resp.ok) {
        const err = await resp.text();
        return new Response(JSON.stringify({ error: err }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      const data = await resp.json();
      const msg = data.choices?.[0]?.message as ChatMessage | undefined;

      if (msg?.tool_calls?.length) {
        working.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
          const result = await runTool(tc.function.name, parsedArgs, defaultAddress);
          working.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // ask the model again now that it has the data
      }

      // No tool call → this is the final answer.
      return sseFromText(msg?.content ?? "");
    }

    // Exhausted tool rounds — force a final answer without tools.
    const finalResp = await callDeepSeek({ messages: working });
    const finalData = await finalResp.json();
    return sseFromText(finalData.choices?.[0]?.message?.content ?? "I could not complete that request.");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

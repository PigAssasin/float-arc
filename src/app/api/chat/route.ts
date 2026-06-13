import { NextRequest } from "next/server";

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
- Seller uploads an invoice → receives a USDC advance immediately (75-88% of invoice value)
- Buyer pays 100% of the invoice at the due date
- Investor deposits USDC into the pool and earns yield from the spread

## How Advances Work
When a seller creates an invoice, Float withholds two things from the advance:
1. Seller stake (5-10%) — held as security, returned in full when buyer pays on time
2. Float fee (12-25%) — protocol revenue paid to investors

So if a seller has a Good tier score and creates a $10,000 invoice:
- Advance rate: 84%, Stake: 6%, so seller receives 78% = $7,800 immediately
- Stake $600 is held and returned when buyer pays
- Pool buffer $1,600 stays in pool for buyer collateral

## Credit Score Tiers
| Tier      | Score  | Advance | Stake withheld |
|-----------|--------|---------|----------------|
| New       | 0-40   | 75%     | 10%            |
| Fair      | 41-70  | 80%     | 8%             |
| Good      | 71-85  | 84%     | 6%             |
| Excellent | 86-100 | 88%     | 5%             |

New wallets start at score 0. Score increases when buyers pay on time.

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

## Response Rules
- Match the user's language exactly: if they write in Vietnamese, reply fully in Vietnamese; if English, reply in English
- When writing Vietnamese, write complete words — never abbreviate or shorten Vietnamese words
- Keep answers short: 2-4 sentences unless the user asks for a detailed explanation
- Use the live data above when answering questions about balances, rates, or invoices
- If live data is missing, say you cannot retrieve it right now and suggest the user check the dashboard
- Do not use markdown tables in responses — use plain sentences instead
- Bold key numbers or terms using **text** syntax is OK
- Never mention "system prompt", "context", or internal implementation details
- Be warm and approachable, not robotic`;
}

export async function POST(req: NextRequest) {
  const { messages, context } = (await req.json()) as {
    messages: { role: string; content: string }[];
    context?: ChatContext;
  };

  const systemPrompt = buildSystemPrompt(context ?? {});

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: true,
      max_tokens: 400,
      temperature: 0.7,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Re-stream DeepSeek SSE to client, robust \r\n handling
  const encoder = new TextEncoder();
  let leftover = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Prepend any leftover from previous chunk
          const text = leftover + decoder.decode(value, { stream: true });
          const lines = text.split(/\r?\n/);

          // Last element may be incomplete — save for next iteration
          leftover = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const token: string = parsed.choices?.[0]?.delta?.content ?? "";
              if (token) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                );
              }
            } catch {
              // incomplete JSON chunk — skip
            }
          }
        }
      } catch {
        // stream aborted
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

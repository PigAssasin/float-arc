import { NextRequest, NextResponse } from "next/server";
import { gatherUnderwritingData } from "@/lib/underwriting";

// Float Underwriter Agent — advisory (off-chain). Gathers on-chain risk evidence
// for a buyer/seller/invoice, then asks the model to produce a structured credit
// memo. It does NOT change on-chain rates; it informs the seller's decision.

interface AgentVerdict {
  buyerScore: number;
  sellerScore: number | null;
  recommendedAdvanceBps: number;
  recommendedTier: "New" | "Fair" | "Good" | "Excellent";
  confidence: "low" | "medium" | "high";
  verdict: "approve" | "caution" | "decline";
  strengths: string[];
  riskFactors: string[];
  rationale: string;
}

function buildPrompt(data: unknown, note?: string): string {
  return `You are Float's senior credit underwriter for an on-chain invoice factoring protocol on Arc Testnet. A seller wants to factor an invoice (receive a USDC advance now; the buyer pays at the due date). You assess the RISK that the buyer fails to pay, since the pool fronts the advance.

Use this evidence (all amounts in USDC). Reason like a trade-finance underwriter: weigh repayment history, defaults, concentration, invoice size vs the buyer's norm and vs pool liquidity, and term length. A brand-new buyer with no history is NOT automatically bad, but uncertainty is high, so confidence should be "low" and the tier conservative.

EVIDENCE:
${JSON.stringify(data, null, 2)}
${note ? `\nSeller-provided context about the buyer (qualitative, unverified): "${note}"` : ""}

Float's advance tiers map score to advance rate: New 0-40 => 7500 bps (75%), Fair 41-70 => 8000 bps (80%), Good 71-85 => 8400 bps (84%), Excellent 86-100 => 8800 bps (88%).

Respond with ONLY a JSON object (no markdown) of this exact shape:
{
  "buyerScore": <int 0-100>,
  "sellerScore": <int 0-100 or null if no seller given>,
  "recommendedAdvanceBps": <one of 7500|8000|8400|8800>,
  "recommendedTier": "New"|"Fair"|"Good"|"Excellent",
  "confidence": "low"|"medium"|"high",
  "verdict": "approve"|"caution"|"decline",
  "strengths": [<short strings>],
  "riskFactors": [<short strings>],
  "rationale": "<2-4 sentence plain-English explanation a non-expert understands>"
}
Keep strengths and riskFactors to at most 4 items each, concrete and specific to the evidence. Do not use em dashes anywhere in the text; use commas or periods instead.`;
}

export async function POST(req: NextRequest) {
  try {
    const { buyer, seller, amount, dueDate, note } = await req.json();
    if (!buyer || !/^0x[a-fA-F0-9]{40}$/.test(buyer)) {
      return NextResponse.json({ error: "Valid buyer address required" }, { status: 400 });
    }
    const amountNum = Number(amount) || 0;
    const data = await gatherUnderwritingData(buyer, seller, amountNum, dueDate ? Number(dueDate) : undefined);

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(data, note) }],
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Underwriter model error (${resp.status})` }, { status: 502 });
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let verdict: AgentVerdict;
    try {
      verdict = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Underwriter returned malformed output" }, { status: 502 });
    }

    return NextResponse.json({ verdict, evidence: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

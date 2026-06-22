import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

// Creates a contract-execution challenge for a user-controlled wallet. The client
// completes it with the user's PIN via the W3SSdk, then Circle broadcasts the tx
// to Arc Testnet. Used for createInvoice / deposit / approve / pay etc.
export async function POST(req: NextRequest) {
  const { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, amount } =
    await req.json();

  if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });
  if (!walletId) return NextResponse.json({ error: "walletId required" }, { status: 400 });
  if (!contractAddress) return NextResponse.json({ error: "contractAddress required" }, { status: 400 });
  if (!abiFunctionSignature) return NextResponse.json({ error: "abiFunctionSignature required" }, { status: 400 });

  const body: Record<string, unknown> = {
    idempotencyKey: randomUUID(),
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters: abiParameters ?? [],
    feeLevel: "MEDIUM",
  };
  if (amount) body.amount = amount;

  const res = await fetch(`${CIRCLE_API}/user/transactions/contractExecution`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "X-User-Token": userToken,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.message ?? `Contract execution failed (status ${res.status})` },
      { status: 500 }
    );
  }

  return NextResponse.json({ challengeId: data?.data?.challengeId });
}

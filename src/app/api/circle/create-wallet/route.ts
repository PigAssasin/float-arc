import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

// ARC-TESTNET (not the generic EVM-TESTNET): Circle natively supports contract
// execution on Arc Testnet only when the wallet is provisioned on this chain.
const BLOCKCHAIN = "ARC-TESTNET";

export async function POST(req: NextRequest) {
  const { userToken, idempotencyKey, hasPin } = await req.json();
  if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });

  // No PIN yet  -> /user/initialize sets the PIN AND provisions the first wallet.
  // PIN exists  -> /user/wallets adds an Arc wallet to an already-initialised user.
  const endpoint = hasPin ? `${CIRCLE_API}/user/wallets` : `${CIRCLE_API}/user/initialize`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "X-User-Token": userToken,
    },
    body: JSON.stringify({
      idempotencyKey: idempotencyKey ?? randomUUID(),
      blockchains: [BLOCKCHAIN],
      accountType: "EOA",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message }, { status: 500 });
  }

  return NextResponse.json(data.data);
}

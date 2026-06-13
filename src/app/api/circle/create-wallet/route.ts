import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

export async function POST(req: NextRequest) {
  const { userToken, idempotencyKey } = await req.json();
  if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });

  const res = await fetch(`${CIRCLE_API}/user/wallets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "X-User-Token": userToken,
    },
    body: JSON.stringify({
      idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
      blockchains: ["EVM"],
      accountType: "EOA",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message }, { status: 500 });
  }

  return NextResponse.json(data.data);
}

import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Create user if not exists (idempotent by userId)
  const createRes = await fetch(`${CIRCLE_API}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  const createData = await createRes.json();
  // 409 = user already exists, that's fine
  if (!createRes.ok && createData.code !== 409) {
    return NextResponse.json({ error: createData.message }, { status: 500 });
  }

  // Get user token + encryption key
  const tokenRes = await fetch(`${CIRCLE_API}/users/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json({ error: tokenData.message }, { status: 500 });
  }

  return NextResponse.json({
    userToken: tokenData.data.userToken,
    encryptionKey: tokenData.data.encryptionKey,
  });
}

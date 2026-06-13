import { NextRequest, NextResponse } from "next/server";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

export async function GET(req: NextRequest) {
  const userToken = req.headers.get("X-User-Token");
  if (!userToken) return NextResponse.json({ error: "X-User-Token header required" }, { status: 400 });

  const res = await fetch(`${CIRCLE_API}/wallets?pageSize=10`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "X-User-Token": userToken,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message }, { status: 500 });
  }

  return NextResponse.json(data.data);
}

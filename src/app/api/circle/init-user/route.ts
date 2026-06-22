import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;
const USER_SALT = process.env.CIRCLE_USER_SALT ?? "float-fallback-salt";

// Derive a stable Circle userId from an email. Same email always maps to the
// same wallet, on any device. The HMAC salt lives only on the server, so the
// userId cannot be reproduced from the (public) repo or the email alone.
function deriveUserId(email: string): string {
  const normalized = email.trim().toLowerCase();
  const digest = createHmac("sha256", USER_SALT).update(normalized).digest("hex");
  return `u_${digest.slice(0, 32)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json();
  // New flow: derive a deterministic userId from email so the wallet is
  // recoverable across devices. Falls back to a raw userId for compatibility.
  const email: string | undefined = body.email;
  let userId: string | undefined = body.userId;
  if (email) {
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    userId = deriveUserId(email);
  }
  if (!userId) return NextResponse.json({ error: "email or userId required" }, { status: 400 });

  // Create user if not exists (idempotent by userId)
  const createRes = await fetch(`${CIRCLE_API}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  // HTTP 409 = user already exists, which is expected on reconnect — not an error.
  // Circle's body code is an internal code (not 409) and the 409 body can be empty,
  // so gate on the HTTP status and parse the body defensively.
  if (!createRes.ok && createRes.status !== 409) {
    let message = `Failed to create user (status ${createRes.status})`;
    try {
      const createData = await createRes.json();
      if (createData?.message) message = createData.message;
    } catch {
      /* empty or non-JSON body */
    }
    return NextResponse.json({ error: message }, { status: 500 });
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

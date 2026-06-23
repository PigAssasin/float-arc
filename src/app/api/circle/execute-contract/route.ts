import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { CONTRACTS } from "@/lib/contracts";

const CIRCLE_API = "https://api.circle.com/v1/w3s";
const API_KEY = process.env.CIRCLE_API_KEY!;

const ALLOWED_FUNCTIONS: Record<string, Set<string>> = {
  [CONTRACTS.USDC.toLowerCase()]: new Set(["approve(address,uint256)"]),
  [CONTRACTS.FLOAT_POOL.toLowerCase()]: new Set(["deposit(uint256)", "withdraw(uint256)"]),
  [CONTRACTS.FLOAT_CORE.toLowerCase()]: new Set([
    "createInvoice(address,uint256,uint256)",
    "approveInvoice(uint256)",
    "rejectInvoice(uint256)",
    "lockCollateral(uint256)",
    "financeAsBuyer(uint256)",
    "payInvoice(uint256)",
    "payPartial(uint256,uint256)",
    "markDefault(uint256)",
  ]),
};

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

  const allowedForContract = ALLOWED_FUNCTIONS[String(contractAddress).toLowerCase()];
  if (!allowedForContract?.has(abiFunctionSignature)) {
    return NextResponse.json({ error: "contract call not allowed" }, { status: 403 });
  }

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

import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/wagmi-config";
import { CONTRACTS, FloatCoreABI } from "@/lib/contracts";

// Attestor endpoint for the v5 verification gate. On testnet this self-serve route
// instantly marks an address verified (no real KYC) so verified buyers unlock light,
// tier-based collateral. In PRODUCTION this is where Circle Compliance / KYC screening
// runs before granting verification, and a dedicated minimally-funded attestor key
// (not the owner key) should sign setVerified.

const RPC = "https://rpc.testnet.arc.network";

function getAccount() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

const isAddr = (a?: string): a is `0x${string}` => !!a && /^0x[a-fA-F0-9]{40}$/.test(a);

// GET ?address=0x... → current verified status
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? undefined;
  if (!isAddr(address)) return NextResponse.json({ error: "valid address required" }, { status: 400 });
  try {
    const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
    const verified = (await pub.readContract({
      address: CONTRACTS.FLOAT_CORE,
      abi: FloatCoreABI,
      functionName: "verified",
      args: [address],
    })) as boolean;
    return NextResponse.json({ verified });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { address } → mark verified (testnet self-serve)
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!isAddr(address)) return NextResponse.json({ error: "valid address required" }, { status: 400 });

    const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
    const already = (await pub.readContract({
      address: CONTRACTS.FLOAT_CORE, abi: FloatCoreABI, functionName: "verified", args: [address],
    })) as boolean;
    if (already) return NextResponse.json({ verified: true, txHash: null });

    const account = getAccount();
    const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(RPC) });
    const txHash = await wallet.writeContract({
      address: CONTRACTS.FLOAT_CORE,
      abi: FloatCoreABI,
      functionName: "setVerified",
      args: [address, true],
    });
    return NextResponse.json({ verified: true, txHash });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

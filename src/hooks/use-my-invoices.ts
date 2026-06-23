"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, FloatCoreABI } from "@/lib/contracts";

// Status values mirror FloatCore.sol InvoiceStatus enum order
// 0=PENDING_APPROVAL 1=PENDING_COLLATERAL 2=FUNDED 3=PAID 4=DEFAULTED 5=CANCELLED
export interface OnChainInvoice {
  id: bigint;
  seller: `0x${string}`;
  buyer: `0x${string}`;
  amount: bigint;
  advance: bigint;
  collateral: bigint;
  stake: bigint;
  fee: bigint;
  dueDate: bigint;
  createdAt: bigint;
  approvedAt: bigint;
  amountPaid: bigint;
  status: number;
  financier?: number;
}

export function useMyInvoices(address: `0x${string}` | undefined, role: "seller" | "buyer") {
  const { data: rawCount } = useReadContract({
    address: CONTRACTS.FLOAT_CORE,
    abi: FloatCoreABI,
    functionName: "invoiceCount",
    query: { enabled: !!CONTRACTS.FLOAT_CORE },
  });

  const count = rawCount ? Number(rawCount) : 0;

  const contracts = Array.from({ length: count }, (_, i) => ({
    address: CONTRACTS.FLOAT_CORE as `0x${string}`,
    abi: FloatCoreABI,
    functionName: "getInvoice" as const,
    args: [BigInt(i)] as [bigint],
  }));

  const { data: results, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: count > 0 && !!CONTRACTS.FLOAT_CORE },
  });

  const invoices: OnChainInvoice[] = [];

  results?.forEach((result, i) => {
    if (result.status !== "success" || !result.result) return;
    const inv = result.result as {
      seller: `0x${string}`;
      buyer: `0x${string}`;
      amount: bigint;
      advance: bigint;
      collateral: bigint;
      stake: bigint;
      fee: bigint;
      dueDate: bigint;
      createdAt: bigint;
      approvedAt: bigint;
      amountPaid: bigint;
      status: number;
      financier?: number;
    };
    const matchAddress = role === "seller" ? inv.seller : inv.buyer;
    if (!address || matchAddress.toLowerCase() !== address.toLowerCase()) return;
    invoices.push({ id: BigInt(i), ...inv });
  });

  return { invoices, isLoading, total: count, refetch };
}

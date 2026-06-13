"use client";
import { formatUnits } from "viem";
import { OnChainInvoice } from "@/hooks/use-my-invoices";
import { USDC_DECIMALS, InvoiceStatus } from "@/lib/contracts";
import { CheckCircle2, Clock, AlertTriangle, XCircle, Lock } from "lucide-react";

function StatusBadge({ status, daysLeft }: { status: number; daysLeft: number }) {
  switch (status) {
    case InvoiceStatus.PENDING_APPROVAL:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 border border-orange-400/20">
          <Clock className="w-2.5 h-2.5" /> Pending Approval
        </span>
      );
    case InvoiceStatus.PENDING_COLLATERAL:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
          <Lock className="w-2.5 h-2.5" /> Pending Collateral
        </span>
      );
    case InvoiceStatus.FUNDED:
      if (daysLeft <= 7)
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 border border-orange-400/20">
            <Clock className="w-2.5 h-2.5" /> Due soon
          </span>
        );
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
          <Clock className="w-2.5 h-2.5" /> Active
        </span>
      );
    case InvoiceStatus.PAID:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
          <CheckCircle2 className="w-2.5 h-2.5" /> Paid
        </span>
      );
    case InvoiceStatus.DEFAULTED:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertTriangle className="w-2.5 h-2.5" /> Defaulted
        </span>
      );
    case InvoiceStatus.CANCELLED:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 border border-gray-500/20">
          <XCircle className="w-2.5 h-2.5" /> Cancelled
        </span>
      );
    default:
      return null;
  }
}

interface Props {
  invoices: OnChainInvoice[];
  role?: "seller" | "buyer";
}

export function InvoiceTable({ invoices, role = "seller" }: Props) {
  if (invoices.length === 0) {
    return (
      <div className="bg-[#101010] rounded-2xl p-10 border border-white/5 text-center">
        <p className="text-gray-500 text-sm">No invoices yet.</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="bg-[#101010] rounded-2xl border border-white/5 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {["ID", role === "seller" ? "Buyer" : "Seller", "Amount", "Advance", "Due Date", "Status"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-primary/70 font-medium first:pl-6 last:pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => {
            const daysLeft = Math.ceil((Number(inv.dueDate) * 1000 - now) / 86_400_000);
            const counterparty = role === "seller" ? inv.buyer : inv.seller;
            const amountUSDC = Number(formatUnits(inv.amount, USDC_DECIMALS));
            const advanceUSDC = Number(formatUnits(inv.advance, USDC_DECIMALS));
            const advancePct = amountUSDC > 0 ? Math.round((advanceUSDC / amountUSDC) * 100) : 0;

            return (
              <tr
                key={String(inv.id)}
                className="border-b border-white/[0.04] hover:bg-[#0A0A0A] transition-colors"
                style={{ background: i % 2 === 1 ? "#0A0A0A" : undefined }}
              >
                <td className="px-4 py-4 pl-6 text-gray-500 text-xs font-mono">#{String(inv.id)}</td>
                <td className="px-4 py-4 text-[#E1E0CC] text-xs font-mono">
                  {counterparty.slice(0, 6)}...{counterparty.slice(-4)}
                </td>
                <td className="px-4 py-4 text-[#DEDBC8] font-bold text-sm">
                  ${amountUSDC.toLocaleString()}
                </td>
                <td className="px-4 py-4 text-gray-400 text-sm">
                  ${advanceUSDC.toLocaleString()}
                  <span className="text-gray-600 text-xs ml-1">({advancePct}%)</span>
                </td>
                <td className="px-4 py-4 text-gray-400 text-sm">
                  {new Date(Number(inv.dueDate) * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 pr-6">
                  <StatusBadge status={inv.status} daysLeft={daysLeft} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type InvoiceStatus = "funded" | "due_soon" | "defaulted" | "paid" | "pending";

export interface Invoice {
  id: number;
  buyer: string;
  amount: number;
  advanceAmount: number;
  advanceRate: number;
  dueDate: string;
  createdAt: string;
  status: InvoiceStatus;
}

export const MOCK_SELLER_INVOICES: Invoice[] = [
  { id: 0, buyer: "0xA1B2...C3D4", amount: 10000, advanceAmount: 9000, advanceRate: 90, dueDate: "2026-08-01", createdAt: "2026-06-01", status: "funded" },
  { id: 1, buyer: "0xE5F6...G7H8", amount: 5000,  advanceAmount: 4500, advanceRate: 90, dueDate: "2026-07-15", createdAt: "2026-06-05", status: "due_soon" },
  { id: 2, buyer: "0xI9J0...K1L2", amount: 2500,  advanceAmount: 2125, advanceRate: 85, dueDate: "2026-06-20", createdAt: "2026-05-01", status: "paid" },
  { id: 3, buyer: "0xM3N4...O5P6", amount: 8000,  advanceAmount: 6800, advanceRate: 85, dueDate: "2026-06-01", createdAt: "2026-04-15", status: "defaulted" },
];

export const MOCK_BUYER_INVOICES: Invoice[] = [
  { id: 4, buyer: "0xYou", amount: 3000,  advanceAmount: 2700, advanceRate: 90, dueDate: "2026-07-20", createdAt: "2026-06-10", status: "funded" },
  { id: 5, buyer: "0xYou", amount: 12000, advanceAmount: 10200, advanceRate: 85, dueDate: "2026-07-05", createdAt: "2026-06-01", status: "due_soon" },
  { id: 6, buyer: "0xYou", amount: 4500,  advanceAmount: 4275, advanceRate: 95, dueDate: "2026-05-15", createdAt: "2026-04-01", status: "paid" },
];

export const MOCK_POOL = {
  tvl: 487250,
  myDeposit: 25000,
  myShares: 24850,
  shareValue: 25320,
  apy: 8.4,
  activeInvoices: 12,
  totalPaid: 148,
};

export const MOCK_CREDIT = {
  score: 78,
  tier: "Good",
  advanceRate: 90,
  totalCreated: 24,
  totalPaid: 21,
  totalDefaulted: 0,
};

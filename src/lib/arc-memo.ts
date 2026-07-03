import {
  decodeFunctionData,
  encodeFunctionData,
  hexToString,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { CONTRACTS, FloatCoreABI } from "./contracts";

export const ARC_MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as const;

export const ARC_MEMO_ABI = [
  {
    type: "function",
    name: "memo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "data", type: "bytes" },
      { name: "memoId", type: "bytes32" },
      { name: "memoData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "BeforeMemo",
    anonymous: false,
    inputs: [{ name: "memoIndex", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "Memo",
    anonymous: false,
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "callDataHash", type: "bytes32", indexed: false },
      { name: "memoId", type: "bytes32", indexed: true },
      { name: "memo", type: "bytes", indexed: false },
      { name: "memoIndex", type: "uint256", indexed: false },
    ],
  },
] as const;

export const FLOAT_MEMO_ACTIONS = ["pay", "buyer_finance", "lock_collateral"] as const;
export const FLOAT_MEMO_MODES = ["pool", "buyer"] as const;

export type FloatMemoAction = (typeof FLOAT_MEMO_ACTIONS)[number];
export type FloatMemoMode = (typeof FLOAT_MEMO_MODES)[number];

interface FloatMemoFields {
  invoiceId: bigint | number;
  action: FloatMemoAction;
  mode: FloatMemoMode;
}

interface MemoCall {
  address: typeof ARC_MEMO_ADDRESS;
  data: Hex;
}

function normalizeInvoiceId(invoiceId: bigint | number): bigint {
  if (
    (typeof invoiceId === "number" && !Number.isSafeInteger(invoiceId)) ||
    invoiceId < 0
  ) {
    throw new Error("Invoice ID must be a non-negative integer");
  }

  return BigInt(invoiceId);
}

export function buildFloatMemoId(
  invoiceId: bigint | number,
  action: FloatMemoAction,
): Hex {
  const normalizedId = normalizeInvoiceId(invoiceId);
  return keccak256(stringToHex(`float:v1:invoice:${normalizedId}:${action}`));
}

export function buildFloatMemoData({ invoiceId, action, mode }: FloatMemoFields): Hex {
  const normalizedId = normalizeInvoiceId(invoiceId);
  return stringToHex(
    `app=float;v=1;invoice=${normalizedId};action=${action};mode=${mode}`,
  );
}

export function encodeMemoCall({
  target,
  data,
  memoId,
  memoData,
}: {
  target: Address;
  data: Hex;
  memoId: Hex;
  memoData: Hex;
}): MemoCall {
  return {
    address: ARC_MEMO_ADDRESS,
    data: encodeFunctionData({
      abi: ARC_MEMO_ABI,
      functionName: "memo",
      args: [target, data, memoId, memoData],
    }),
  };
}

export function decodeFloatMemoData(memoData: Hex): {
  invoiceId: bigint;
  action: FloatMemoAction;
  mode: FloatMemoMode;
} {
  const match = /^app=float;v=1;invoice=(\d+);action=([^;]+);mode=([^;]+)$/.exec(
    hexToString(memoData),
  );

  if (
    !match ||
    !FLOAT_MEMO_ACTIONS.includes(match[2] as FloatMemoAction) ||
    !FLOAT_MEMO_MODES.includes(match[3] as FloatMemoMode)
  ) {
    throw new Error("Invalid Float memo data");
  }

  return {
    invoiceId: BigInt(match[1]),
    action: match[2] as FloatMemoAction,
    mode: match[3] as FloatMemoMode,
  };
}

const ALLOWED_FLOAT_MEMO_FUNCTIONS = new Set([
  "lockCollateral",
  "financeAsBuyer",
  "payInvoice",
]);

export function isAllowedFloatMemoCall(
  target: Address,
  data: Hex,
  memoId: Hex,
  memoData: Hex,
): boolean {
  if (target.toLowerCase() !== CONTRACTS.FLOAT_CORE.toLowerCase()) return false;

  try {
    const decoded = decodeFunctionData({ abi: FloatCoreABI, data });
    if (!ALLOWED_FLOAT_MEMO_FUNCTIONS.has(decoded.functionName)) return false;

    const [invoiceId] = decoded.args as readonly [bigint];
    const action: FloatMemoAction =
      decoded.functionName === "lockCollateral"
        ? "lock_collateral"
        : decoded.functionName === "financeAsBuyer"
          ? "buyer_finance"
          : "pay";
    const decodedMemo = decodeFloatMemoData(memoData);
    const modeMatches =
      (action === "lock_collateral" && decodedMemo.mode === "pool") ||
      (action === "buyer_finance" && decodedMemo.mode === "buyer") ||
      action === "pay";

    return (
      decodedMemo.invoiceId === invoiceId &&
      decodedMemo.action === action &&
      modeMatches &&
      memoId === buildFloatMemoId(invoiceId, action)
    );
  } catch {
    return false;
  }
}

import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, hexToString, keccak256, stringToHex } from "viem";
import { FloatCoreABI } from "./contracts";
import {
  ARC_MEMO_ADDRESS,
  ARC_MEMO_ABI,
  buildFloatMemoData,
  buildFloatMemoId,
  decodeFloatMemoData,
  encodeMemoCall,
  isAllowedFloatMemoCall,
} from "./arc-memo";

const FLOAT_CORE = "0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637" as const;

describe("Float Arc memos", () => {
  it("builds a stable memo ID from the canonical invoice action", () => {
    expect(buildFloatMemoId(BigInt(42), "pay")).toBe(
      keccak256(stringToHex("float:v1:invoice:42:pay")),
    );
  });

  it("uses a different memo ID for each action", () => {
    expect(buildFloatMemoId(BigInt(42), "pay")).not.toBe(
      buildFloatMemoId(BigInt(42), "lock_collateral"),
    );
  });

  it("encodes stable, readable memo data as UTF-8 bytes", () => {
    const memoData = buildFloatMemoData({
      invoiceId: BigInt(42),
      action: "buyer_finance",
      mode: "buyer",
    });

    expect(hexToString(memoData)).toBe(
      "app=float;v=1;invoice=42;action=buyer_finance;mode=buyer",
    );
  });

  it("wraps and preserves the inner FloatCore calldata", () => {
    const innerData = encodeFunctionData({
      abi: FloatCoreABI,
      functionName: "payInvoice",
      args: [BigInt(42)],
    });
    const memoId = buildFloatMemoId(BigInt(42), "pay");
    const memoData = buildFloatMemoData({ invoiceId: BigInt(42), action: "pay", mode: "pool" });
    const wrapped = encodeMemoCall({ target: FLOAT_CORE, data: innerData, memoId, memoData });
    const decoded = decodeFunctionData({ abi: ARC_MEMO_ABI, data: wrapped.data });

    expect(wrapped.address).toBe(ARC_MEMO_ADDRESS);
    expect(decoded.functionName).toBe("memo");
    expect(decoded.args).toEqual([FLOAT_CORE, innerData, memoId, memoData]);
  });

  it("decodes memo data for reconciliation", () => {
    const memoData = buildFloatMemoData({
      invoiceId: BigInt(987),
      action: "lock_collateral",
      mode: "pool",
    });

    expect(decodeFloatMemoData(memoData)).toEqual({
      invoiceId: BigInt(987),
      action: "lock_collateral",
      mode: "pool",
    });
  });

  it("rejects negative invoice IDs", () => {
    expect(() => buildFloatMemoId(BigInt(-1), "pay")).toThrow("Invoice ID must be a non-negative integer");
  });

  it("rejects malformed memo data", () => {
    expect(() => decodeFloatMemoData(stringToHex("invoice=42"))).toThrow("Invalid Float memo data");
  });

  it("allows only approved FloatCore functions inside Circle memo calls", () => {
    const payData = encodeFunctionData({
      abi: FloatCoreABI,
      functionName: "payInvoice",
      args: [BigInt(42)],
    });
    const approveData = encodeFunctionData({
      abi: FloatCoreABI,
      functionName: "approveInvoice",
      args: [BigInt(42)],
    });

    const memoId = buildFloatMemoId(BigInt(42), "pay");
    const memoData = buildFloatMemoData({ invoiceId: BigInt(42), action: "pay", mode: "pool" });

    expect(isAllowedFloatMemoCall(FLOAT_CORE, payData, memoId, memoData)).toBe(true);
    expect(isAllowedFloatMemoCall(FLOAT_CORE, approveData, memoId, memoData)).toBe(false);
    expect(
      isAllowedFloatMemoCall("0x0000000000000000000000000000000000000001", payData, memoId, memoData),
    ).toBe(false);
    expect(isAllowedFloatMemoCall(FLOAT_CORE, "0x1234", memoId, memoData)).toBe(false);
    expect(
      isAllowedFloatMemoCall(
        FLOAT_CORE,
        payData,
        buildFloatMemoId(BigInt(43), "pay"),
        memoData,
      ),
    ).toBe(false);
  });
});

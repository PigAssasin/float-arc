import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  stringToHex,
} from "viem";

const ARC_RPC = "https://rpc.testnet.arc.network";
const MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
const FLOAT_CORE = "0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637";
const USDC = "0x3600000000000000000000000000000000000000";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
};

const memoAbi = [
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
];

const floatCoreAbi = [
  {
    type: "function",
    name: "invoiceCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getInvoice",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "seller", type: "address" },
          { name: "buyer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "advance", type: "uint256" },
          { name: "collateral", type: "uint256" },
          { name: "stake", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "dueDate", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "approvedAt", type: "uint256" },
          { name: "amountPaid", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "financier", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "lockCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "financeAsBuyer",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "payInvoice",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
const testAddress = process.env.FLOAT_TEST_ADDRESS;

function buildMemoCall(invoiceId, functionName, action, mode) {
  const innerData = encodeFunctionData({
    abi: floatCoreAbi,
    functionName,
    args: [invoiceId],
  });
  const memoId = keccak256(stringToHex(`float:v1:invoice:${invoiceId}:${action}`));
  const memoData = stringToHex(
    `app=float;v=1;invoice=${invoiceId};action=${action};mode=${mode}`,
  );

  const wrappedData = encodeFunctionData({
    abi: memoAbi,
    functionName: "memo",
    args: [FLOAT_CORE, innerData, memoId, memoData],
  });

  return { innerData, wrappedData };
}

async function simulate(invoiceId, invoice, functionName, action, mode) {
  const { innerData, wrappedData } = buildMemoCall(invoiceId, functionName, action, mode);
  const [balance, allowance] = await Promise.all([
    client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [invoice.buyer],
    }),
    client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [invoice.buyer, FLOAT_CORE],
    }),
  ]);
  let directResult = "success";

  try {
    await client.call({ account: invoice.buyer, to: FLOAT_CORE, data: innerData });
  } catch {
    directResult = "reverted";
  }

  try {
    await client.call({ account: invoice.buyer, to: MEMO, data: wrappedData });
    return {
      invoiceId: invoiceId.toString(),
      functionName,
      directResult,
      memoResult: "success",
      invoiceAmount: invoice.amount.toString(),
      amountPaid: invoice.amountPaid.toString(),
      buyerBalance: balance.toString(),
      floatCoreAllowance: allowance.toString(),
    };
  } catch (error) {
    return {
      invoiceId: invoiceId.toString(),
      functionName,
      directResult,
      memoResult: "reverted",
      invoiceAmount: invoice.amount.toString(),
      amountPaid: invoice.amountPaid.toString(),
      buyerBalance: balance.toString(),
      floatCoreAllowance: allowance.toString(),
      reason: error.shortMessage ?? error.message,
    };
  }
}

const memoCode = await client.getBytecode({ address: MEMO });
if (!memoCode || memoCode === "0x") throw new Error("Arc Memo predeploy has no bytecode");

const invoiceCount = await client.readContract({
  address: FLOAT_CORE,
  abi: floatCoreAbi,
  functionName: "invoiceCount",
});

const start = invoiceCount > 50n ? invoiceCount - 50n : 0n;
const simulations = [];
const walletInvoices = [];
let actionableInvoices = 0;

for (let id = start; id < invoiceCount; id += 1n) {
  const invoice = await client.readContract({
    address: FLOAT_CORE,
    abi: floatCoreAbi,
    functionName: "getInvoice",
    args: [id],
  });

  if (testAddress && invoice.buyer.toLowerCase() === testAddress.toLowerCase()) {
    walletInvoices.push({
      invoiceId: id.toString(),
      status: invoice.status,
      financier: invoice.financier,
      amount: invoice.amount.toString(),
      amountPaid: invoice.amountPaid.toString(),
      collateral: invoice.collateral.toString(),
      advance: invoice.advance.toString(),
    });
  }

  if (invoice.status === 1) {
    actionableInvoices += 1;
    simulations.push(await simulate(id, invoice, "lockCollateral", "lock_collateral", "pool"));
    simulations.push(await simulate(id, invoice, "financeAsBuyer", "buyer_finance", "buyer"));
  }

  if (invoice.status === 2) {
    actionableInvoices += 1;
    simulations.push(
      await simulate(id, invoice, "payInvoice", "pay", invoice.financier === 1 ? "buyer" : "pool"),
    );
  }
}

// This confirms the Memo predeploy and CallFrom path execute successfully even
// when no live Float invoice currently has enough allowance for a state change.
const probeAccount = "0x0000000000000000000000000000000000000001";
const probeInnerData = encodeFunctionData({
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [probeAccount],
});
const probeData = encodeFunctionData({
  abi: memoAbi,
  functionName: "memo",
  args: [USDC, probeInnerData, keccak256(stringToHex("float:smoke:probe")), stringToHex("app=float;probe=1")],
});
await client.call({ account: probeAccount, to: MEMO, data: probeData });

console.log(JSON.stringify({
  chainId: await client.getChainId(),
  memoBytecodeBytes: (memoCode.length - 2) / 2,
  invoiceCount: invoiceCount.toString(),
  scannedInvoices: (invoiceCount - start).toString(),
  actionableInvoices,
  testAddress,
  testAddressBalance: testAddress
    ? (await client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [testAddress] })).toString()
    : undefined,
  walletInvoices,
  callFromProbe: "success",
  simulations,
}, null, 2));

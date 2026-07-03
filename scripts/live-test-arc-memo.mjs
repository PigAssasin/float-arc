import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  parseEther,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ARC_RPC = "https://rpc.testnet.arc.network";
const MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
const FLOAT_CORE = "0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637";
const USDC = "0x3600000000000000000000000000000000000000";
const EXPLORER = "https://testnet.arcscan.app/tx";

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
    name: "createInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dueTimestamp", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveInvoice",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
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
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const privateKey = process.env.FLOAT_TEST_PRIVATE_KEY;
if (!privateKey) throw new Error("FLOAT_TEST_PRIVATE_KEY is required");

const buyer = privateKeyToAccount(privateKey);
const seller = privateKeyToAccount(generatePrivateKey());
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });
const buyerClient = createWalletClient({ account: buyer, chain: arcTestnet, transport: http(ARC_RPC) });
const sellerClient = createWalletClient({ account: seller, chain: arcTestnet, transport: http(ARC_RPC) });

async function wait(hash, label) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: ${EXPLORER}/${hash}`);
  return receipt;
}

function buildMemo(invoiceId, functionName, action, mode) {
  const innerData = encodeFunctionData({
    abi: floatCoreAbi,
    functionName,
    args: [invoiceId],
  });
  const memoId = keccak256(stringToHex(`float:v1:invoice:${invoiceId}:${action}`));
  const memoData = stringToHex(
    `app=float;v=1;invoice=${invoiceId};action=${action};mode=${mode}`,
  );
  return { innerData, memoId, memoData };
}

async function sendMemo(invoiceId, functionName, action, mode) {
  const { innerData, memoId, memoData } = buildMemo(invoiceId, functionName, action, mode);
  await publicClient.simulateContract({
    account: buyer,
    address: MEMO,
    abi: memoAbi,
    functionName: "memo",
    args: [FLOAT_CORE, innerData, memoId, memoData],
  });
  const hash = await buyerClient.writeContract({
    address: MEMO,
    abi: memoAbi,
    functionName: "memo",
    args: [FLOAT_CORE, innerData, memoId, memoData],
  });
  const receipt = await wait(hash, `${functionName} via Memo`);
  const events = parseEventLogs({ abi: memoAbi, logs: receipt.logs, strict: false });
  const memoEvent = events.find((event) => event.eventName === "Memo");
  if (!memoEvent) throw new Error(`Memo event missing for ${functionName}`);
  if (memoEvent.args.sender.toLowerCase() !== buyer.address.toLowerCase()) {
    throw new Error(`Memo sender mismatch for ${functionName}`);
  }
  if (memoEvent.args.target.toLowerCase() !== FLOAT_CORE.toLowerCase()) {
    throw new Error(`Memo target mismatch for ${functionName}`);
  }
  if (memoEvent.args.memoId !== memoId || memoEvent.args.memo !== memoData) {
    throw new Error(`Memo metadata mismatch for ${functionName}`);
  }
  return hash;
}

async function createInvoice(amount) {
  const invoiceId = await publicClient.readContract({
    address: FLOAT_CORE,
    abi: floatCoreAbi,
    functionName: "invoiceCount",
  });
  const block = await publicClient.getBlock();
  const hash = await sellerClient.writeContract({
    address: FLOAT_CORE,
    abi: floatCoreAbi,
    functionName: "createInvoice",
    args: [buyer.address, amount, block.timestamp + 30n * 24n * 60n * 60n],
  });
  await wait(hash, `createInvoice #${invoiceId}`);
  return invoiceId;
}

async function approveInvoice(invoiceId) {
  const hash = await buyerClient.writeContract({
    address: FLOAT_CORE,
    abi: floatCoreAbi,
    functionName: "approveInvoice",
    args: [invoiceId],
  });
  await wait(hash, `approveInvoice #${invoiceId}`);
}

async function assertPaid(invoiceId, expectedFinancier) {
  const invoice = await publicClient.readContract({
    address: FLOAT_CORE,
    abi: floatCoreAbi,
    functionName: "getInvoice",
    args: [invoiceId],
  });
  if (invoice.status !== 3 || invoice.financier !== expectedFinancier) {
    throw new Error(`Unexpected final state for invoice #${invoiceId}`);
  }
}

const [nativeBalance, usdcBalance] = await Promise.all([
  publicClient.getBalance({ address: buyer.address }),
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] }),
]);
if (nativeBalance < parseEther("0.1")) throw new Error("Buyer needs at least 0.1 native testnet USDC for gas");
if (usdcBalance < 5_000_000n) throw new Error("Buyer needs at least 5 test USDC");

console.log(`Buyer: ${buyer.address}`);
console.log(`Temporary seller: ${seller.address}`);

const fundSellerHash = await buyerClient.sendTransaction({
  to: seller.address,
  value: parseEther("0.05"),
});
await wait(fundSellerHash, "fund temporary seller gas");

const approveHash = await buyerClient.writeContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "approve",
  args: [FLOAT_CORE, 5_000_000n],
});
await wait(approveHash, "approve 5 USDC for FloatCore");

const poolInvoiceId = await createInvoice(1_000_000n);
await approveInvoice(poolInvoiceId);
await sendMemo(poolInvoiceId, "lockCollateral", "lock_collateral", "pool");
await sendMemo(poolInvoiceId, "payInvoice", "pay", "pool");
await assertPaid(poolInvoiceId, 0);

const buyerInvoiceId = await createInvoice(1_000_000n);
await approveInvoice(buyerInvoiceId);
await sendMemo(buyerInvoiceId, "financeAsBuyer", "buyer_finance", "buyer");
await sendMemo(buyerInvoiceId, "payInvoice", "pay", "buyer");
await assertPaid(buyerInvoiceId, 1);

console.log(JSON.stringify({
  result: "success",
  buyer: buyer.address,
  poolInvoiceId: poolInvoiceId.toString(),
  buyerFinancedInvoiceId: buyerInvoiceId.toString(),
  memoTransactionsVerified: 4,
}, null, 2));

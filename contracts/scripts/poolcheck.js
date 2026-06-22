const { ethers } = require("ethers");
(async () => {
  const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const pool = "0x98bF7f0572f542fBD6365531D39C657779839375";
  const abi = [
    "function totalAssets() view returns (uint256)",
    "function availableLiquidity() view returns (uint256)",
    "function investorAssets() view returns (uint256)",
    "function insuranceReserve() view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function shareValue() view returns (uint256)"
  ];
  const c = new ethers.Contract(pool, abi, provider);
  const [ta, al, ia, ins, ts, sv] = await Promise.all([
    c.totalAssets(), c.availableLiquidity(), c.investorAssets(),
    c.insuranceReserve(), c.totalSupply(), c.shareValue()
  ]);
  const f = (v) => (Number(v) / 1e6).toFixed(4);
  console.log("Pool v4:", pool);
  console.log("  totalAssets       :", f(ta), "USDC");
  console.log("  availableLiquidity:", f(al), "USDC");
  console.log("  investorAssets    :", f(ia), "USDC");
  console.log("  insuranceReserve  :", f(ins), "USDC");
  console.log("  totalSupply (fLP) :", f(ts));
  console.log("  shareValue        :", (Number(sv) / 1e18).toFixed(6));
  console.log("  maxSingleInvoice  :", (Number(al) / 1e6 * 0.2).toFixed(4), "USDC (20% cap)");
})();

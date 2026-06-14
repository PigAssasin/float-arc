const { ethers } = require("hardhat");
const USDC = "0x3600000000000000000000000000000000000000";
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
// Candidate legacy pools across past deploys
const POOLS = {
  "v2  0xFc8b": "0xFc8bd9986B22f4eCe0D29c4C15AEEB340fd40e20",
  "v3  0x1b64": "0x1b643E7C7B640fc17F64D652fb4B3490c60D9819",
  "v3x 0xBFd4": "0xBFd4Afda68023261621eC578f707Ec45464f95Cd",
};
const POOLABI = [
  "function totalSupply() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function investorAssets() view returns (uint256)",
  "function totalLockedCollateral() view returns (uint256)",
  "function sellerStakeTotal() view returns (uint256)",
  "function insuranceReserve() view returns (uint256)",
  "function shares(address) view returns (uint256)",
  "function shareValue() view returns (uint256)",
];
const f = (v) => { try { return ethers.formatUnits(v, 6); } catch { return String(v); } };
async function tryCall(c, fn, args=[]) { try { return await c[fn](...args); } catch { return null; } }
async function main() {
  const [signer] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC, ERC20, signer);
  console.log("Signer:", signer.address, "\n");
  for (const [label, addr] of Object.entries(POOLS)) {
    const bal = await usdc.balanceOf(addr);
    console.log("==== Pool", label, addr, "====");
    console.log("  USDC held:        ", f(bal));
    const p = new ethers.Contract(addr, POOLABI, signer);
    const ts = await tryCall(p, "totalSupply");
    const tsh = await tryCall(p, "totalShares");
    const ia = await tryCall(p, "investorAssets");
    const col = await tryCall(p, "totalLockedCollateral");
    const stk = await tryCall(p, "sellerStakeTotal");
    const ins = await tryCall(p, "insuranceReserve");
    const mysh = await tryCall(p, "shares", [signer.address]);
    const sv = await tryCall(p, "shareValue");
    if (ts !== null)  console.log("  totalSupply:      ", f(ts));
    if (tsh !== null) console.log("  totalShares:      ", f(tsh));
    if (ia !== null)  console.log("  investorAssets:   ", f(ia));
    if (col !== null) console.log("  lockedCollateral: ", f(col));
    if (stk !== null) console.log("  sellerStakeTotal: ", f(stk));
    if (ins !== null) console.log("  insuranceReserve: ", f(ins));
    if (sv !== null)  console.log("  shareValue(1e18): ", sv.toString());
    if (mysh !== null && mysh > 0n) console.log("  >> SIGNER shares: ", f(mysh), " (withdrawable if liquidity allows)");
    console.log("");
  }
}
main().catch(e => { console.error("ERR:", e.message); process.exitCode = 1; });

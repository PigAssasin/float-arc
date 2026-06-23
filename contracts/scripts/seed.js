const { ethers } = require("hardhat");
const USDC = "0x3600000000000000000000000000000000000000";
const POOL = "0xCaC5c72a870fB989093e68F98027aa0639a4Bf77";
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];
const POOLABI = [
  "function deposit(uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
async function main() {
  const [d] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC, ERC20, d);
  const pool = new ethers.Contract(POOL, POOLABI, d);
  const bal = await usdc.balanceOf(d.address);
  console.log("Deployer ERC20 USDC balance:", ethers.formatUnits(bal, 6));
  const supply = await pool.totalSupply();
  console.log("Pool fLP totalSupply:", ethers.formatUnits(supply, 6));
  if (supply > 0n) { console.log("Pool already seeded."); return; }
  // Seed 2000 USDC (or half balance if smaller)
  let seed = ethers.parseUnits("2000", 6);
  if (bal < seed) seed = bal / 2n;
  if (seed < ethers.parseUnits("1", 6)) { console.log("Insufficient USDC to seed."); return; }
  console.log("Seeding:", ethers.formatUnits(seed, 6), "USDC");
  const apTx = await usdc.approve(POOL, seed); await apTx.wait(1);
  console.log("approved");
  const dpTx = await pool.deposit(seed); await dpTx.wait(1);
  console.log("deposited. fLP minted:", ethers.formatUnits(await pool.balanceOf(d.address), 6));
  console.log("pool totalSupply:", ethers.formatUnits(await pool.totalSupply(), 6));
}
main().catch(e => { console.error("ERR:", e.message); process.exitCode = 1; });

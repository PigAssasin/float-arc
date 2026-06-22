const { ethers } = require("hardhat");
const POOL = "0xb3a8EfC83aF7Bf598da7038D12341CC31B48e312";
const CORE = "0xF13958B95E6D1E80362E2a5A9F41390bB88ece14";
const POOLABI = ["function availableLiquidity() view returns (uint256)", "function totalSupply() view returns (uint256)"];
const COREABI = [
  "function strictCollateralEnabled() view returns (bool)",
  "function owner() view returns (address)",
  "function invoiceCount() view returns (uint256)",
  "function isTrustedBuyer(address) view returns (bool)",
];
async function main() {
  const [d] = await ethers.getSigners();
  const pool = new ethers.Contract(POOL, POOLABI, d);
  const core = new ethers.Contract(CORE, COREABI, d);
  console.log("availableLiquidity:", ethers.formatUnits(await pool.availableLiquidity(), 6), "USDC");
  console.log("pool fLP supply:", ethers.formatUnits(await pool.totalSupply(), 6));
  console.log("strictCollateralEnabled:", await core.strictCollateralEnabled());
  console.log("core owner:", await core.owner());
  console.log("invoiceCount:", (await core.invoiceCount()).toString());
}
main().catch(e => { console.error("ERR:", e.message); process.exitCode = 1; });

// Deploy FloatPool → FloatCore → link → verify addresses
// Usage: npx hardhat run scripts/deploy.js --network arc_testnet

const { ethers, network } = require("hardhat");

const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  console.log("Network:", network.name);

  const usdcAddress =
    network.name === "arc_testnet" ? USDC_ARC_TESTNET : null;

  if (network.name === "arc_testnet" && !usdcAddress) {
    throw new Error("USDC address not set for arc_testnet");
  }

  // 1. Deploy FloatPool
  console.log("\n[1/3] Deploying FloatPool...");
  const FloatPool = await ethers.getContractFactory("FloatPool");
  const pool = await FloatPool.deploy(usdcAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("FloatPool deployed:", poolAddress);

  // 2. Deploy FloatCore
  console.log("\n[2/3] Deploying FloatCore...");
  const FloatCore = await ethers.getContractFactory("FloatCore");
  const core = await FloatCore.deploy(usdcAddress, poolAddress);
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log("FloatCore deployed:", coreAddress);

  // 3. Link: authorise FloatCore to call FloatPool.advanceFunds
  console.log("\n[3/3] Linking: setAuthorizedCore...");
  const tx = await pool.setAuthorizedCore(coreAddress);
  await tx.wait(1);
  console.log("FloatPool.authorizedCore =", coreAddress);

  // Summary
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("NEXT_PUBLIC_FLOAT_POOL_ADDRESS=" + poolAddress);
  console.log("NEXT_PUBLIC_FLOAT_CORE_ADDRESS=" + coreAddress);
  console.log("\nAdd these to your .env.local and Vercel environment variables.");
  console.log("Verify on: https://testnet.arcscan.app/address/" + poolAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

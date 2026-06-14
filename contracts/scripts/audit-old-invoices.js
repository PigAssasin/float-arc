const { ethers } = require("hardhat");
const OLD_CORE = "0xc8934c61A580290fC63a374CEF4B4e03366930C9"; // v3 core (linked to 0x1b643 pool)
const ABI = [
  "function invoiceCount() view returns (uint256)",
  "function getInvoice(uint256) view returns (tuple(address seller,address buyer,uint256 amount,uint256 advance,uint256 collateral,uint256 stake,uint256 dueDate,uint256 createdAt,uint8 status))",
];
const STATUS = ["PENDING_APPROVAL","PENDING_COLLATERAL","FUNDED","PAID","DEFAULTED","CANCELLED"];
const f = (v) => ethers.formatUnits(v, 6);
async function main() {
  const [s] = await ethers.getSigners();
  const c = new ethers.Contract(OLD_CORE, ABI, s);
  const n = Number(await c.invoiceCount());
  console.log("Old core", OLD_CORE, "- invoiceCount:", n, "\n");
  const now = Math.floor(Date.now()/1000);
  let lockedCol = 0n, lockedStk = 0n;
  for (let i=0;i<n;i++){
    const inv = await c.getInvoice(i);
    const st = STATUS[Number(inv.status)] ?? inv.status;
    if (Number(inv.status) === 2) { // FUNDED = funds locked
      lockedCol += inv.collateral; lockedStk += inv.stake;
      const grace = Number(inv.dueDate) + 7*24*3600;
      const canDefault = now > grace;
      console.log(`#${i} FUNDED  amount=${f(inv.amount)}  collateral=${f(inv.collateral)} (buyer) stake=${f(inv.stake)} (seller)`);
      console.log(`     buyer=${inv.buyer}`);
      console.log(`     seller=${inv.seller}`);
      console.log(`     action: buyer can payInvoice(${i}) to reclaim collateral; or markDefault(${i}) ${canDefault?"NOW (past grace)":"after "+new Date(grace*1000).toISOString().slice(0,10)}`);
    } else {
      console.log(`#${i} ${st}`);
    }
  }
  console.log("\nTotal locked in FUNDED invoices: collateral", f(lockedCol), "+ stake", f(lockedStk));
}
main().catch(e=>{console.error("ERR:",e.message);process.exitCode=1;});

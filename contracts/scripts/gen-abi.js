// Regenerate src/lib/contracts.ts ABIs + addresses from compiled artifacts.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const poolArt = require(path.join(root, "contracts/artifacts/src/FloatPool.sol/FloatPool.json"));
const coreArt = require(path.join(root, "contracts/artifacts/src/FloatCore.sol/FloatCore.json"));

const POOL = "0x866Af692C71D9e1d191be551981c546870413484";
const CORE = "0xadAf850c7EA6Bb6c14bD91A41B6B2168A91142bD";

const file = path.join(root, "src/lib/contracts.ts");
let src = fs.readFileSync(file, "utf8");

// Addresses
src = src.replace(/(FLOAT_POOL:\s*\(process\.env\.NEXT_PUBLIC_FLOAT_POOL_ADDRESS\s*\?\?\s*")0x[0-9a-fA-F]+(")/, `$1${POOL}$2`);
src = src.replace(/(FLOAT_CORE:\s*\(process\.env\.NEXT_PUBLIC_FLOAT_CORE_ADDRESS\s*\?\?\s*")0x[0-9a-fA-F]+(")/, `$1${CORE}$2`);

// ABIs (single-line array literals)
src = src.replace(/export const FloatPoolABI = \[[\s\S]*?\] as const;/, `export const FloatPoolABI = ${JSON.stringify(poolArt.abi)} as const;`);
src = src.replace(/export const FloatCoreABI = \[[\s\S]*?\] as const;/, `export const FloatCoreABI = ${JSON.stringify(coreArt.abi)} as const;`);

fs.writeFileSync(file, src);
console.log("contracts.ts updated. POOL", POOL, "CORE", CORE);
console.log("FloatCore fns:", coreArt.abi.filter(x => x.type === "function").map(x => x.name).join(", "));

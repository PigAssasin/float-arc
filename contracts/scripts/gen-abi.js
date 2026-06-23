// Regenerate src/lib/contracts.ts ABIs + addresses from compiled artifacts.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const poolArt = require(path.join(root, "contracts/artifacts/src/FloatPool.sol/FloatPool.json"));
const coreArt = require(path.join(root, "contracts/artifacts/src/FloatCore.sol/FloatCore.json"));

const POOL = "0xCaC5c72a870fB989093e68F98027aa0639a4Bf77";
const CORE = "0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637";

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

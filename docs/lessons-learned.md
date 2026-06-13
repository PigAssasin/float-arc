# Lessons Learned from AgentLoan

Kinh nghiệm đúc kết từ quá trình build AgentLoan trên Arc Testnet.
Đọc trước khi bắt đầu code để tránh lặp lại các sai lầm cũ.

---

## Arc & Circle Integration

### 1. Luôn verify qua arc-docs MCP trước khi code
**Rule:** Bất cứ khi nào code dùng Arc contract address, ABI, SDK API, oracle, gas, bridge → gọi `arc-docs` MCP trước. Không được đoán hoặc dùng kiến thức cũ.

**Why:** Thông tin Arc thay đổi liên tục. Dùng địa chỉ cũ → sai contract, wrong ABI, broken integration.

**Apply:**
- Contract address → MCP trước
- Arc SDK/App Kit → MCP trước  
- Gas, fee, oracle trên Arc → MCP trước
- Nếu MCP trả về khác với memory → **tin MCP**

### 2. App chỉ chạy trên Arc — không fallback sang chain khác
**Rule:** wagmi config chỉ khai báo `arcTestnet`. Không có mainnet, sepolia, polygon.

**Apply:**
```typescript
// ĐÚNG
const config = createConfig({ chains: [arcTestnet] })

// SAI — không bao giờ làm thế này
const config = createConfig({ chains: [arcTestnet, mainnet, polygon] })
```
- RainbowKit: `chains={[arcTestnet]}`
- Nếu user sai chain → hiện "Switch to Arc Network", không cho phép tiếp tục

### 3. USDC có dual interface — luôn dùng 6 decimals cho ERC-20
```
USDC native (gas): 18 decimals
USDC ERC-20:        6 decimals  ← luôn dùng cái này
```

---

## TypeScript & Build

### 4. TypeScript 6 breaking changes (nếu deploy VPS)
**Rule:** Không dùng `moduleResolution: "node"` hay `ignoreDeprecations`.

```json
// tsconfig đúng cho TS6
{
  "module": "nodenext",
  "moduleResolution": "nodenext"
}
```

### 5. dotenv phải dùng absolute path trong PM2
**Rule:** PM2 không guaranteed CWD là project root → relative path fail silently.

```typescript
// SAI
dotenv.config({ path: ".env.local" })

// ĐÚNG
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })
```

---

## VPS Deployment

### 6. VPS 1GB RAM không đủ cho npm install
**Rule:** Tạo swap file trước khi `npm install`.

```bash
dd if=/dev/zero of=/swapfile2 bs=1M count=2048
chmod 600 /swapfile2
mkswap /swapfile2
swapon /swapfile2
```

### 7. Shell scripts bị CRLF trên Windows
**Rule:** Git Windows tự convert LF → CRLF. PM2 execute `.sh` bị lỗi.

**Fix:** Thêm `.gitattributes`:
```
*.sh text eol=lf
```

PM2 config phải có `interpreter: "bash"`:
```javascript
{ script: "run-bot.sh", interpreter: "bash", cwd: "/root/project" }
```

### 8. node_modules bị hỏng sau OOM kill
**Rule:** Không cố fix package-by-package. Thêm swap → chạy lại `npm install` hoàn chỉnh.

```bash
npm install --legacy-peer-deps --ignore-scripts
```

---

## Design System

### 9. Design System: RawBlock Brutalist
**Rule:** Bám sát 100% RawBlock style. Không tự ý thêm style ngoài system.

| | |
|---|---|
| Background | `#ffffff` — KHÔNG dùng dark |
| Text | `#000000` |
| Borders | `4px solid #000000` — NO shadows, NO radius |
| Font heading | Archivo Black |
| Font body | Work Sans (UPPERCASE labels) |
| Font numbers | Space Mono |
| Buttons | white → invert black on hover |
| Border radius | `0` — sharp edges only |
| Status | success `#008000`, warning `#FFA500`, error `#FF0000` |

**KHÔNG dùng:** gradients, blur, frosted glass, Three.js, Canvas animations, border-radius.

### 10. Code chỉ dùng tiếng Anh
**Rule:** 100% English trong code, comments, variables, commit messages. Chỉ chat với user bằng tiếng Việt.

---

## Smart Contract

### 11. Oracle staleness check bắt buộc
**Rule:** Max staleness = 3600 giây. Luôn check trước khi dùng price data.

### 12. Checks-Effects-Interactions pattern
**Rule:** Luôn theo thứ tự: validate inputs → update state → external calls. Không bao giờ ngược lại.

### 13. Custom error thay vì require string
```solidity
// SAI — tốn gas
require(amount > 0, "Amount must be positive");

// ĐÚNG — tiết kiệm gas
error InvalidAmount();
if (amount == 0) revert InvalidAmount();
```

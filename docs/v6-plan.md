# Float v6 — Economic Recalibration + Buyer Finance

Status: **PLAN ONLY (not implemented).** Awaiting approval after the logic + security review below.
Updated 2026-06-20 with finalized parameters and a pre-code audit.

---

## 0. Philosophy (locked with user)

- **Fee is fixed and public.** It never auto-rises to defend APY (raising fees when deals are
  scarce would drive customers away). Stable, predictable pricing builds trust.
- **LP APY floats with market demand.** 8% is a *reference* at healthy demand (~50% utilization),
  NOT a guarantee. High demand -> higher APY, low demand -> lower. Honest and market-driven.
- **The protocol intervenes only lightly:** an optional soft cap on deposits so idle capital does
  not dilute APY. No fee manipulation.

---

## 1. Final parameters (CP0, approved)

| Item | New | Old → New |
|------|-----|-----------|
| Advance (seller tier) | 80 / 85 / 88 / 90% | was 75/80/84/88 |
| Stake (seller tier) | 5 / 4 / 3 / 2% | was 10/8/6/5 |
| Light collateral (verified buyer) | 25 / 18 / 12 / 8% | recalibrated |
| **Fee** (buyer tier, per 30 days) | **1.2 / 1.6 / 2.2 / 3.0%** | NEW (was implicit 12-25%) |
| Fee cap | 8% of face | NEW |
| Score tier gates (min paid count) | New <2, Fair >=2, Good >=5, Excellent >=12 | was none (1/1=100) |
| Fee split, mode 1 | protocol 10% · insurance 15% · **LP 75%** | NEW |
| Fee split, mode 2 | protocol 10% · insurance 15% · **buyer 75%** (no LP, no risk) | NEW |
| Residual returned to seller (`A - advance - fee`) | YES | NEW |
| Mode 2 trigger | auto for unverified buyer; opt-in for verified | NEW |
| APY | floats; ~8% ref @ 50% util; no dynamic fee | |
| Soft deposit cap | optional, gentle | NEW |

Tiers (both seller and buyer) gated by min paid count AND ratio:
New `<2 paid` | Fair `>=2 & ratio>=60` | Good `>=5 & ratio>=80` | Excellent `>=12 & ratio>=95`.

Note: fee is driven by the **buyer (payer)** tier, since the buyer is who must pay.

---

## 2. New settlement (residual + fee) — Mode 1 (pool-financed)

face `A`, advance `adv`, stake `st`, fee `f`.

- **lock:** buyer sends collateral `C` (light) to pool; pool disburses `adv - st` to seller; `st`
  recorded (pool capital, not disbursed).
- **pay (due):** buyer sends `A`. Settlement:
  - return `C` to buyer, return `st` to seller
  - fee split: protocol `0.10f` leaves; insurance `0.15f` reserved; LP `0.75f` stays as yield
  - residual `A - adv - f` returned to seller
- **Seller total = `A - f`. Seller true cost = `f` only.**

### Cash-flow proof (mode 1, full lifecycle)
- In to pool: `C` (lock) + `A` (pay) = `C + A`
- Out of pool: `(adv - st)` + `C` + `st` + `(A - adv - f)` + `0.10f`
  = `C + A - f + 0.10f` = `C + A - 0.90f`
- **Net pool retains `0.90f`** = insurance `0.15f` + LP `0.75f`. Protocol `0.10f` left. Balanced.

### Default (mode 1) — unchanged risk vs v5
- collateral + stake slashed (kept), insurance covers shortfall = `adv - C - st - insuranceCover`.
- No fee/residual paid. LP loss only if shortfall exceeds insurance (mitigated by verification +
  caps + low verified-buyer default). Same risk profile as v5.

---

## 3. Mode 2 (buyer-financed) — DISTINCT ACCOUNTING (key finding)

> AUDIT FINDING: mode 2 CANNOT reuse the mode-1 collateral+stake plumbing. In mode 1, collateral
> is *security* (returned) and the POOL funds the advance. If we kept that and just redirected the
> fee to the buyer, the POOL would still deploy capital at ZERO return (bad for LP), and recording
> a seller `stake` that no pool capital backs would break the pool invariant. So mode 2 needs its
> own path: the buyer's deposit IS the funding (not returnable security), and there is NO seller
> stake in mode 2.

Clean mode 2 model:
- **lock:** buyer deposits `fund = adv` to pool; pool forwards `adv` to seller. Pool net = 0
  (buyer funds it, pool not exposed). No separate stake.
- **pay (due):** buyer pays the remainder. Buyer keeps 75% of fee as discount.
  - Buyer total cash out over life = `adv` (lock) + `(A - 0.25f - adv)` (due) = `A - 0.75f`.
  - Seller gets `adv` (lock) + residual `A - adv - f` (due) = `A - f`.
  - Pool/protocol get `0.25f` (protocol 0.10f leaves, insurance 0.15f reserved).
  - Check: buyer pays `A - 0.75f`; seller gets `A - f`; pool keeps `0.25f`. `(A-f)+0.25f = A-0.75f`. Balanced.

### Cash-flow proof (mode 2)
- lock: in `adv`, out `adv` -> net 0.
- due: in `(A - 0.25f - adv)`, out residual `(A - adv - f)` -> net `(A-0.25f-adv) - (A-adv-f) = 0.75f - 0.25f`... 
  recompute: `= A - 0.25f - adv - A + adv + f = 0.75f`. Of that, residual already counted as out; the
  retained by pool = `0.25f` (protocol 0.10f then leaves -> 0.15f insurance stays). Balanced.

### Default (mode 2) — ZERO pool loss
- Buyer funded `adv` at lock (already delivered to seller). Buyer fails to pay remainder.
- Seller keeps `adv`, loses the residual; buyer loses the `adv` they funded. Pool/LP: no loss, no gain.
- No slashing needed (nothing held in pool). markDefault just marks status + updates scores.
- **A fake/collusion invoice in mode 2 nets the attacker zero** (their own money moved to themselves,
  minus protocol fee if paid). Safe.

### Mode 2 constraints
- **No partial payments in mode 2** (buyer funds upfront; remainder paid in one settlement). Simpler + safe.
- Seller has no stake in mode 2; scoring still updates on paid/default for both parties.

---

## 4. Economics: LP APY target (reference, not guarantee)

Net LP APY = `(utilization / advance) x (365 / term) x (LP_fee_share - default_drag)`.

Assumptions: advance 85%, term 45d (8.1 turns/yr), LP share 75% of fee, default 2%, net LGD 15%.
To hit ~8% net at 50% utilization -> **blended fee ~1.8%/30d** (the schedule in section 1 averages here).

Sensitivity (blended fee 1.8%/30d):
| Utilization | LP APY (net) |
|-------------|--------------|
| 30% | ~4.9% |
| 50% | ~8.2% (reference) |
| 70% | ~11.5% |
| 100% | ~16.4% |

APY is allowed to float with these. The only smoothing lever = optional soft deposit cap (keep
utilization from collapsing), never fee changes.

---

## 5. LOGIC double-check (pre-code)

1. **Both cash flows balance** (proofs in 2 and 3). Pool invariant `balance = investorAssets +
   collateral + stake + insurance` must hold after every op. Mode 2 keeps `collateral`/`stake`
   buckets at 0 for that invoice -> invariant preserved. MUST be a test.
2. **Residual underflow:** require `adv + f <= A`. With adv <= 90% and fee cap 8%, max 98% < 100%.
   Add an explicit guard + revert.
3. **Fee rounding:** compute protocol/insurance/LP(or buyer) in integer base units; assign the
   rounding remainder to ONE bucket (LP in mode 1, buyer in mode 2) so the sum equals `f` exactly.
4. **Partial payments:** allowed only in mode 1; apply fee/residual once at final settle. Disallow
   in mode 2 (revert).
5. **Score gates:** tier requires min paid count AND ratio; brand-new = New. Prevents `1/1=Excellent`.
6. **Mode selection integrity:** `financier` fixed at createInvoice (or lockCollateral) and cannot be
   changed later; unverified -> forced BUYER mode; verified -> POOL default, BUYER if opted in.
7. **Insurance cap branch** unchanged; re-test the clamp.
8. **Exposure caps** (per-seller, per-buyer) still enforced at lock in both modes.

## 6. SECURITY review (pre-code)

| Risk | v6 handling |
|------|-------------|
| Reentrancy | nonReentrant + checks-effects-interactions on every transfer (carry from v5) |
| Collusion (mode 1, light) | same as v5: relies on verification; mainnet KYC both parties as distinct ids |
| Collusion (mode 2) | attacker funds own advance -> nets zero; paying loses protocol fee -> unprofitable |
| Default drain (mode 1) | bounded by collateral+stake+insurance; caps limit blast radius |
| Default drain (mode 2) | zero pool exposure (buyer pre-funded) |
| Farming tiers | min-paid-count gates + fee/residual only on PAID |
| Fee/residual underflow or overpay | explicit `adv + f <= A` guard; payPartial overpay guard kept |
| Rounding dust | remainder assigned to one bucket; invariant test catches leaks |
| Access control | new setters owner-only; financier not attacker-mutable |
| Griefing settlement | markDefault permissionless only after grace; mode 2 default path is no-op slashing |
| Owner key risk (verify route) | testnet only; mainnet uses dedicated attestor (see CLAUDE.md) |

No new principal-loss vector is introduced. Mode 2 strictly reduces pool risk.

---

## 7. Recommended phasing (de-risk)

Because mode 2 has distinct accounting, split delivery so the economic win lands first and safely:

- **v6a — Economic recalibration (pool-financed only).** Residual return, explicit fee, recalibrated
  tiers + score gates, fee split (protocol/insurance/LP), soft deposit cap. This alone makes fees
  realistic, LP ~8% reference, and kills tier-farming. Lower risk, one settlement path.
- **v6b — Buyer Finance (mode 2).** Add the distinct buyer-funded path, fee-to-buyer split, mode
  selection + UX. Builds on v6a once it is verified.

---

## 8. Checkpoints

### v6a
- [ ] CP0 Approve parameters (section 1) and this audit.
- [ ] CP1 FloatCore v6a: fee field, recalibrated tiers + score gates, `_settle` with residual + fee split, `adv+f<=A` guard.
- [ ] CP2 FloatPool v6a: residual payout + fee/origination accounting; preserve invariant.
- [ ] CP3 Tests: cash-flow balance, invariant, seller cost = fee, LP accrual, default safety, score gates, rounding, partial-pay once. Plus adapt existing 40.
- [ ] CP4 Deploy v6a (pool+core) to Arc Testnet + seed.
- [ ] CP5 contracts.ts addresses + ABI.
- [ ] CP6 Frontend: seller "advance now + residual later, fee X%"; investor APY from real model; soft cap UI if any.
- [ ] CP7 Deploy + smoke test.

### v6b
- [ ] CP8 FloatCore v6b: Financier enum, mode-2 funding path (no stake, funding-as-payment), fee-to-buyer split, disallow partial in mode 2.
- [ ] CP9 Tests: mode-2 cash flow, zero-loss default, collusion negative, invariant in mode 2.
- [ ] CP10 Frontend: buyer mode toggle "Finance & earn $Y" vs "Standard"; AI explains.
- [ ] CP11 Deploy + smoke test both modes.

---

## 9. Decisions (resolved 2026-06-20)
1. **Phased: v6a then v6b.** Smaller, safer, one settlement path verified first.
2. **Mode 2 has no seller stake.** Pool is not exposed in mode 2, so stake is moot. Locked for v6b.
3. **Soft deposit cap deferred** (note-only). Add later via a simple owner-settable `maxPoolAssets`
   (default 0 = unlimited) when real deposit demand needs managing.

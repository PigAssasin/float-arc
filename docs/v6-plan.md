# Float economic recalibration and buyer-financed mode

Status: complete on Arc Testnet and production frontend.

This file records the economics and implementation checklist for the current live contracts.

## Principles

- Fees are fixed and public.
- LP APY floats with demand. It is a reference, not a promise.
- Sellers should understand their cost before creating an invoice.
- Buyers should have a cheaper path when they can fund the advance themselves.
- Pool capital should only take risk when it is paid for that risk.

## Parameters

| Item | Current value |
|------|---------------|
| Seller advance | 80%, 85%, 88%, 90% |
| Seller stake | 5%, 4%, 3%, 2% |
| Verified buyer collateral | 25%, 18%, 12%, 8% |
| Buyer fee per 30 days | 3.0%, 2.2%, 1.6%, 1.2% |
| Fee cap | 8% of face value |
| Pool-financed fee split | 10% protocol, 15% insurance, 75% LP |
| Buyer-financed fee split | 10% protocol, 15% insurance, 75% buyer discount |
| Seller residual | `face - advance - fee` |

Seller and buyer tiers require both paid invoice count and repayment ratio:

- New: fewer than 2 paid invoices
- Fair: at least 2 paid invoices and 60% paid ratio
- Good: at least 5 paid invoices and 80% paid ratio
- Excellent: at least 12 paid invoices and 95% paid ratio

The fee uses the buyer's tier because the buyer is the payer.

## Mode 1: pool-financed invoices

Pool-financed mode is the standard factoring path.

Inputs:

- `A`: invoice face value
- `adv`: seller advance
- `st`: seller stake
- `f`: invoice fee
- `C`: buyer collateral

Lifecycle:

1. Buyer approves the invoice.
2. Buyer locks collateral `C`.
3. FloatPool sends `adv - st` to the seller.
4. Buyer pays the invoice.
5. Collateral returns to the buyer.
6. Seller stake returns to the seller.
7. Seller receives residual `A - adv - f`.
8. Fee is split between protocol, insurance, and LPs.

Seller total after settlement is `A - f`. The seller's true cost is the fee.

If the buyer defaults, collateral and stake are kept by the pool first. Insurance covers part of any remaining shortfall. LPs only take loss after those protections are exhausted.

## Mode 2: buyer-financed invoices

Buyer-financed mode is separate accounting. It does not reuse collateral or seller stake.

Lifecycle:

1. Buyer approves the invoice.
2. Buyer funds the advance directly.
3. The advance is forwarded to the seller.
4. Pool capital is not exposed.
5. Buyer pays the remaining settlement amount later.
6. Buyer keeps 75% of the fee as a discount.

Buyer total cash out:

`advance + (face - advance - buyer discount)`

Seller total received:

`advance + residual = face - fee`

Pool and protocol receive the remaining 25% of the fee, split as 10% protocol and 15% insurance.

If the buyer defaults in this mode, LPs lose nothing because the buyer already funded the advance.

## Required constraints

- `advance + fee <= face`
- Partial payments are allowed only in pool-financed mode.
- The funding mode is fixed once the invoice is funded.
- Rounding must assign all fee dust to one bucket so accounting stays exact.
- Exposure caps still apply.
- Verification gates remain optional on testnet and can be enabled for stricter environments.

## Security notes

| Risk | Handling |
|------|----------|
| Reentrancy | `nonReentrant` plus checks-effects-interactions |
| Fake invoices in pool-financed mode | Verification hooks, collateral, seller stake, and exposure caps |
| Fake invoices in buyer-financed mode | The buyer funds the advance, so the pool is not drained |
| Tier farming | Paid-count gates plus repayment ratio |
| Fee underflow | Explicit `advance + fee <= face` guard |
| Partial payment edge cases | Partial payments disabled in buyer-financed mode |
| Owner key risk | Testnet only. Mainnet should use a dedicated attestor key |

## Delivery checklist

Phase A: economic recalibration

- [x] Add explicit fee field.
- [x] Recalibrate advance, stake, collateral, and fee schedule.
- [x] Return residual to seller at settlement.
- [x] Split fees across protocol, insurance, and LPs.
- [x] Add tier gates based on paid count and ratio.
- [x] Preserve accounting invariant.
- [x] Deploy and seed contracts on Arc Testnet.
- [x] Update ABI, frontend addresses, and UI copy.
- [x] Deploy frontend and smoke test.

Phase B: buyer-financed mode

- [x] Add funding mode enum.
- [x] Add buyer-funded advance path.
- [x] Split fee so buyer keeps 75% as discount.
- [x] Disable partial payments in buyer-financed mode.
- [x] Add tests for cash flow and zero LP loss on default.
- [x] Add buyer dashboard option.
- [x] Deploy contracts, update frontend, and smoke test production.

## Live addresses

| Contract | Address |
|----------|---------|
| FloatPool | `0xCaC5c72a870fB989093e68F98027aa0639a4Bf77` |
| FloatCore | `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637` |
| USDC | `0x3600000000000000000000000000000000000000` |

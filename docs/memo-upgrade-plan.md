# Float memo upgrade plan

## Implementation status

- [x] Checkpoint 1: memo schema documented in `docs/memo-spec.md`
- [x] Checkpoint 2: shared ABI and encoding utilities added
- [x] Checkpoint 3: utility tests written test-first and passing
- [x] Checkpoint 4: browser wallet `payInvoice` wrapped with Arc Memo
- [x] Checkpoint 5: browser wallet `financeAsBuyer` wrapped with Arc Memo
- [x] Checkpoint 6: browser wallet `lockCollateral` wrapped with Arc Memo
- [x] Checkpoint 7: Circle EOA challenge path and guarded route added
- [x] Checkpoint 8: contract-wallet capability gate and direct-call fallback added
- [x] Checkpoint 9: Memo ABI and memo-data decoder added for reconciliation
- [x] Checkpoint 10: README and in-app developer docs updated
- [x] Arc Testnet EOA smoke test: invoice #5 covered pool collateral and repayment; invoice #6 covered buyer financing and repayment; all four Memo events were verified
- [ ] Circle EOA smoke test: still requires an interactive Circle PIN challenge

## Goal

Add Arc transaction memos to the most important money-moving flows in Float so we can:

- reconcile onchain transactions with invoice activity more easily
- improve support and ops visibility
- prepare for activity history, reporting, and accounting exports
- avoid changing core protocol behavior in phase 1

This plan assumes we keep `FloatCore` and `FloatPool` unchanged at first and integrate memos at the transaction layer.

## Why this is feasible

- Arc provides a predeployed `Memo` contract, so phase 1 does not require redeploying `FloatCore` or `FloatPool`
- Float already runs on Arc Testnet and is USDC-native
- Circle wallet creation is currently provisioned as `EOA`, which matches Arc memo requirements
- Browser wallets used through wagmi and RainbowKit are also a good fit for memo-wrapped calls

## Non-goals for phase 1

- No core contract redesign
- No new protocol storage for memos
- No support for smart contract wallets or account abstraction memo paths
- No memo rollout for every action in the app

## Phase scope

### Phase 1 target actions

Roll out memos only for these buyer actions:

1. `payInvoice(uint256 id)`
2. `financeAsBuyer(uint256 id)`
3. `lockCollateral(uint256 id)`

These are the best first targets because each one:

- corresponds to a concrete invoice
- moves or commits economically meaningful value
- is important for support and reconciliation

### Defer until later

- `createInvoice(...)`
- `approveInvoice(...)`
- `rejectInvoice(...)`
- `payPartial(...)`
- `markDefault(...)`
- investor `deposit()` and `withdraw()`

## Current code touchpoints

### Wallet and transaction entry points

- `src/app/app/buyer/page.tsx`
- `src/hooks/use-circle-wallet.ts`
- `src/app/api/circle/execute-contract/route.ts`
- `src/hooks/use-app-wallet.ts`

### Project context

- `README.md`
- `src/app/docs/page.tsx`

### New memo utility layer

Planned new file:

- `src/lib/arc-memo.ts`

### Planned spec / docs

Planned new file:

- `docs/memo-spec.md`

## Memo design

### Memo contract

Use Arc's predeployed `Memo` contract on Arc Testnet:

- `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`

### Memo ID format

Use a deterministic, versioned format:

- raw string: `float:v1:invoice:{id}:{action}`
- onchain `memoId`: `keccak256(raw string)`

Examples:

- `float:v1:invoice:42:pay`
- `float:v1:invoice:42:buyer_finance`
- `float:v1:invoice:42:lock_collateral`

### Memo data format

Use a short UTF-8 string that is easy to inspect and stable across clients:

- `app=float;v=1;invoice={id};action={action};mode={mode}`

Examples:

- `app=float;v=1;invoice=42;action=pay;mode=pool`
- `app=float;v=1;invoice=42;action=buyer_finance;mode=buyer`
- `app=float;v=1;invoice=42;action=lock_collateral;mode=pool`

### Actions and modes

Allowed actions:

- `pay`
- `buyer_finance`
- `lock_collateral`

Allowed modes:

- `pool`
- `buyer`

## Delivery strategy

Follow a staged rollout so we can verify each layer independently.

## Step-by-step execution plan

### Step 1: Write the memo spec

Create `docs/memo-spec.md` with:

- target actions
- `memoId` convention
- `memoData` convention
- wallet support rules
- fallback rules

#### Checkpoint 1

- spec exists in repo
- action names are finalized
- memo schema is stable enough to code against

### Step 2: Add shared memo utilities

Create `src/lib/arc-memo.ts`.

Functions to add:

- `buildFloatMemoId(invoiceId, action)`
- `buildFloatMemoData({ invoiceId, action, mode })`
- `encodeMemoCall({ target, data, memoId, memoData })`
- `isArcMemoSupported(...)` if capability detection is centralized here

Also include:

- `Memo` contract address
- minimal `Memo` ABI
- helper for `memo()` calldata construction

#### Checkpoint 2

- utility file compiles
- no buyer page logic is changed yet
- all encoding logic lives in one place

### Step 3: Add tests before wiring UI

Add tests for the utility layer first.

Suggested cases:

- same invoice and action produce stable `memoId`
- different actions produce different `memoId`
- `memoData` strings are encoded consistently
- wrapped calldata targets the Arc `Memo` contract
- nested `FloatCore` calldata is preserved

#### Checkpoint 3

- tests fail before implementation
- tests pass after implementation
- no UI changes merged before encoding is verified

### Step 4: Integrate browser wallet path for `payInvoice`

In `src/app/app/buyer/page.tsx`:

- locate direct `payInvoice(id)` writes
- replace direct `FloatCore.payInvoice(...)` call with a wrapped call through `Memo.memo(...)`

Flow should become:

1. user approves USDC as before
2. app encodes inner `payInvoice(id)` calldata
3. app derives `memoId` and `memoData`
4. app submits `Memo.memo(FloatCore, innerData, memoId, memoData)`

Do not change:

- user-facing economics
- success/error UX outside what is needed for the new call path

#### Checkpoint 4

- browser wallet `payInvoice` works end to end
- invoice lifecycle still finishes correctly
- receipt contains both protocol events and `Memo` event

### Step 5: Extend browser wallet path to `financeAsBuyer`

In `src/app/app/buyer/page.tsx`:

- wrap `financeAsBuyer(id)` the same way

#### Checkpoint 5

- buyer-financed invoice flow still works
- memo event can be matched back to the invoice
- no change to amount calculations or business logic

### Step 6: Extend browser wallet path to `lockCollateral`

In `src/app/app/buyer/page.tsx`:

- wrap `lockCollateral(id)` with the memo layer

#### Checkpoint 6

- collateral flow still advances funds to seller correctly
- memo event emitted for the collateral-locking action

### Step 7: Add Circle wallet support

Update Circle execution path:

- `src/hooks/use-circle-wallet.ts`
- `src/app/api/circle/execute-contract/route.ts`

Required changes:

- allow the Arc `Memo` contract in the route allowlist
- allow function signature `memo(address,bytes,bytes32,bytes)`
- build wrapped memo calls in the client before sending challenge request

Important note:

Circle EOA support should be smoke-tested carefully because nested bytes arguments and wallet challenge flows are the highest-risk integration point in this upgrade.

#### Checkpoint 7

- Circle wallet can execute memo-wrapped `payInvoice`
- Circle wallet can execute memo-wrapped `financeAsBuyer`
- Circle wallet can execute memo-wrapped `lockCollateral`

### Step 8: Add capability gate and fallback behavior

Add a clear rule for when memo is enabled.

Enable memo only when:

- wallet is direct EOA-compatible
- route is one of the three supported buyer actions

Fallback behavior:

- if wallet type is unsupported, use the existing direct call path
- if memo-specific integration is temporarily disabled, protocol still works

Suggested place:

- `src/hooks/use-app-wallet.ts`
- or a small capability helper in `src/lib/arc-memo.ts`

#### Checkpoint 8

- unsupported wallet types do not enter broken memo flow
- direct-call fallback remains usable

### Step 9: Add event parsing and reconciliation hooks

Phase 1 does not require a full backend indexer, but it should at least expose memo decoding utilities so we can:

- inspect `memoId`
- inspect `memoData`
- match memo events to invoice ids

Suggested additions:

- decode helper in `src/lib/arc-memo.ts`
- client-side or dev-only receipt inspection during initial rollout

#### Checkpoint 9

- one successful memo tx can be traced back to invoice id and action using emitted events

### Step 10: Update product and developer docs

Update:

- `README.md`
- `src/app/docs/page.tsx`

Document:

- what actions now support Arc memos
- why they were added
- that this is EOA-only
- that memo is for reconciliation and support, not for core protocol state

#### Checkpoint 10

- docs match shipped behavior
- future contributors know not to bypass the memo wrapper for supported actions

## Testing and verification

## Automated tests

### Utility-level tests

- stable `memoId`
- stable `memoData`
- correct wrapper calldata
- invalid action handling

### Integration-level tests if practical

- successful browser-wallet path for `payInvoice`
- successful browser-wallet path for `financeAsBuyer`
- successful browser-wallet path for `lockCollateral`

## Manual verification checklist

For each of the three target actions:

1. action succeeds
2. invoice state transitions correctly
3. `msg.sender` behavior remains correct for the inner call
4. `Memo` event is present in receipt
5. `memoId` resolves back to invoice id and action
6. no unexpected UI regression in loading/error state

For Circle wallet:

1. PIN challenge still works
2. tx still broadcasts to Arc
3. nested memo calldata is accepted
4. no route allowlist regression

## Risks and mitigations

### Risk 1: Circle nested bytes call compatibility

Mitigation:

- ship browser wallet path first
- gate Circle rollout behind successful manual smoke tests

### Risk 2: Overcomplicating buyer UI

Mitigation:

- keep memo logic in utilities
- do not duplicate encoding logic inside components

### Risk 3: Treating memo as source of truth

Mitigation:

- keep invoice truth in `FloatCore`
- use memo only for reconciliation and observability

### Risk 4: Future Safe / SCA incompatibility

Mitigation:

- keep explicit EOA-only rule in docs and capability gate
- retain non-memo fallback path

## Recommended rollout order

### Rollout A

- spec
- utility
- tests
- browser wallet `payInvoice`

### Rollout B

- browser wallet `financeAsBuyer`
- browser wallet `lockCollateral`

### Rollout C

- Circle wallet support

### Rollout D

- event decoding helpers
- docs
- optional admin/support visibility

## Exit criteria

The memo upgrade is ready when:

- all 3 target buyer actions support memo in browser-wallet flow
- Circle EOA flow is either working for those 3 actions or intentionally gated off
- memo schema is documented
- relevant tests pass
- manual verification confirms memo events map back to the correct invoice actions

## Immediate next action

Start with:

1. `docs/memo-spec.md`
2. `src/lib/arc-memo.ts`
3. utility tests

Do not start by editing buyer UI first. The encoding contract must be stable before the transaction paths are changed.

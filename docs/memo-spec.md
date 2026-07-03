# Float Arc transaction memo specification

## Scope

Float attaches Arc transaction memos to these buyer actions:

| Float action | Memo action | Mode |
| --- | --- | --- |
| `lockCollateral(uint256)` | `lock_collateral` | `pool` |
| `financeAsBuyer(uint256)` | `buyer_finance` | `buyer` |
| `payInvoice(uint256)` | `pay` | `pool` or `buyer` |

The target remains `FloatCore`. The Arc Memo contract forwards the call through
the `CallFrom` precompile, which preserves the signing EOA as `msg.sender`.

## Contracts

- Arc Testnet Memo: `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`
- FloatCore: `0xEE8b610cDd050ab5BbCb57Ccf9E3FbE900E6c637`

## Memo ID

The canonical input is:

```text
float:v1:invoice:{invoiceId}:{action}
```

The onchain `memoId` is `keccak256` of the UTF-8 encoded canonical input.
The same invoice and action always produce the same ID. Different actions for
the same invoice produce different IDs.

## Memo data

The memo bytes contain this UTF-8 string:

```text
app=float;v=1;invoice={invoiceId};action={action};mode={mode}
```

Fields and values are lowercase and remain in this order. Invoice IDs are
unsigned base-10 integers without padding.

## Wallet support

Memo calls are enabled only for EOAs that submit `Memo.memo(...)` directly.
This includes browser wallets and Circle user-controlled wallets provisioned
with `accountType: "EOA"`.

Smart contract accounts, Safe wallets, ERC-4337 accounts, and Circle modular
wallets are not supported by Arc transaction memos.

## Failure and fallback rules

- A reverted inner FloatCore call reverts the entire memo transaction.
- FloatCore events remain the source of truth for invoice state.
- Memo events are reconciliation metadata, not protocol state.
- Unsupported wallet types must use the existing direct FloatCore call path.
- A memo failure must be shown as a transaction error. The app must not retry a
  money-moving action automatically because the first transaction may have
  reached the network.

## Reconciliation

Index the Arc Memo contract's `Memo` event by `memoId`, `sender`, and `target`.
Verify `callDataHash` against `keccak256` of the original FloatCore calldata.
Decode the memo bytes using the exact schema above to recover the invoice ID,
action, and financing mode.

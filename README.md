# @pushcashco/capacitor

Push Cash Capacitor SDK for Apple Pay

## Install

To use npm

```bash
npm install @pushcashco/capacitor
````

To use yarn

```bash
yarn add @pushcashco/capacitor
```

Sync native files

```bash
npx cap sync
```

## API

<docgen-index>

* [`canMakePayments()`](#canmakepayments)
* [`presentSheet(...)`](#presentsheet)
* [`completeSheet(...)`](#completesheet)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### canMakePayments()

```typescript
canMakePayments() => Promise<{ available: boolean; }>
```

Reports whether the device supports Apple Pay payments.

**Returns:** <code>Promise&lt;{ available: boolean; }&gt;</code>

--------------------


### presentSheet(...)

```typescript
presentSheet(options: PresentSheetOptions) => Promise<SerializedPayment>
```

Presents the Apple Pay sheet and resolves with the serialized payment as
soon as the user authorizes. The sheet stays up until completeSheet is
called with the real authorization outcome.

Rejects with SHEET_DISMISSED if the user closes the sheet, and with
PRESENTATION_FAILED when iOS refuses to present — most commonly a
merchant identifier missing from the app's Apple Pay entitlement.

| Param         | Type                                                                |
| ------------- | ------------------------------------------------------------------- |
| **`options`** | <code><a href="#presentsheetoptions">PresentSheetOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#serializedpayment">SerializedPayment</a>&gt;</code>

--------------------


### completeSheet(...)

```typescript
completeSheet(options: { status: SheetStatus; }) => Promise<void>
```

Resolves the held Apple Pay sheet with the authorization outcome, letting
it animate out truthfully.

| Param         | Type                                                             |
| ------------- | ---------------------------------------------------------------- |
| **`options`** | <code>{ status: <a href="#sheetstatus">SheetStatus</a>; }</code> |

--------------------


### Interfaces


#### SerializedPayment

The authorized payment, serialized for the flow layer. paymentData is still
encrypted to the merchant's payment-processing certificate.

| Prop                        | Type                | Description                                                      |
| --------------------------- | ------------------- | ---------------------------------------------------------------- |
| **`paymentData`**           | <code>string</code> | Base64 of PKPaymentToken.paymentData.                            |
| **`displayName`**           | <code>string</code> | e.g. "Visa 1234" — carries the physical card's last 4.           |
| **`network`**               | <code>string</code> | e.g. "Visa".                                                     |
| **`type`**                  | <code>string</code> | debit \| credit \| prepaid \| store \| unknown                   |
| **`transactionIdentifier`** | <code>string</code> | Apple's transaction identifier — the token-mint idempotency key. |


#### PresentSheetOptions

| Prop                       | Type                  | Description                                                                                   |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| **`merchantIdentifier`**   | <code>string</code>   | The operator's Apple merchant identifier. Must be present in the app's Apple Pay entitlement. |
| **`amount`**               | <code>number</code>   | Amount in cents.                                                                              |
| **`currency`**             | <code>string</code>   | ISO 4217 currency code, e.g. "USD".                                                           |
| **`countryCode`**          | <code>string</code>   | ISO 3166 country code, e.g. "US". Served by the Push config endpoint.                         |
| **`totalLabel`**           | <code>string</code>   | The label shown on the sheet's total line. Served by the Push config endpoint.                |
| **`supportedNetworks`**    | <code>string[]</code> | Card networks the sheet accepts. Served by the Push config endpoint.                          |
| **`merchantCapabilities`** | <code>string[]</code> | Merchant capabilities, e.g. "supports3DS". Served by the Push config endpoint.                |


### Type Aliases


#### SheetStatus

The authorization outcome reached by the operator's backend, driving the
sheet's final animation.

<code>'approved' | 'declined'</code>

</docgen-api>

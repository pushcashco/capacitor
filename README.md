# @pushcash/capacitor

Apple Pay deposits for Push Cash operators, as a Capacitor plugin. The SDK
presents the Apple Pay sheet, exchanges the payment for a Push token, and
holds the sheet open until your backend's real authorization outcome drives
the final animation.

## Requirements

- Capacitor 7 or later, iOS 15 or later. The iOS library is consumed via
  Swift Package Manager (a podspec is included for CocoaPods-based apps).
- An Apple merchant identifier from your own Apple Developer account, with a
  payment-processing certificate registered with Push during onboarding.
- The merchant identifier in your app's Apple Pay entitlement (Xcode →
  Signing & Capabilities → Apple Pay).

## Install

```bash
npm install @pushcash/capacitor
npx cap sync
```

## Usage

Your backend creates an Apple Pay session for the user with
`POST /user/{user_id}/url` (`{"type": "apple_pay"}`) and hands the returned
URL to your app. The SDK derives everything else — environment, session, and
sheet configuration — from that URL.

```typescript
import { PushApplePay } from '@pushcash/capacitor';

const applePay = new PushApplePay({
  url: sessionUrlFromYourBackend,
  merchantIdentifier: 'merchant.com.yourcompany.yourapp',
});

if (await applePay.canMakePayments()) {
  const result = await applePay.display({
    amount: 1500, // cents
    currency: 'USD',
    onAuthorize: async (token) => {
      // Spend the Push token on your backend (POST /authorize with
      // direction "cash_in") and report the outcome. The Apple Pay sheet
      // stays up until you return, then animates the truth.
      const outcome = await yourBackend.authorizeDeposit(token);
      return outcome.approved ? 'approved' : 'declined';
    },
  });
  // result: { status: 'approved' | 'declined', token: 'token_...' }
}
```

`display()` runs the whole flow: fetches the sheet configuration for your
merchant identifier, presents the sheet, vaults the authorized payment,
mints the Push token, and completes the sheet with the outcome your
`onAuthorize` returns. Deposits only — the direction is always `cash_in`.

### Errors

Failures reject with a `PushApplePayError` carrying a `code`:

| Code                                          | Meaning                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NOT_ENABLED`                                 | The merchant identifier has no payment-processing certificate registered with Push.                             |
| `CANNOT_MAKE_PAYMENTS`                        | The device cannot make Apple Pay payments.                                                                      |
| `PRESENTATION_FAILED`                         | iOS refused to present — most commonly the merchant identifier is missing from the app's Apple Pay entitlement. |
| `SHEET_DISMISSED`                             | The user closed the sheet without authorizing.                                                                  |
| `TOKENIZATION_FAILED`, `TOKEN_MINT_FAILED`    | The payment could not be vaulted or exchanged for a Push token; the sheet is dismissed as declined.             |
| `AUTHORIZE_FAILED`                            | `onAuthorize` threw or returned something other than `approved`/`declined`.                                     |
| `INVALID_URL`, `CONFIG_FAILED`, `UNAVAILABLE` | The session URL is malformed, the configuration fetch failed, or the platform is not iOS.                       |

### Sandbox

Session URLs minted against the Push sandbox route the SDK to the sandbox
automatically. Deposits of exactly $22.00 decline; every other amount
approves.

### Example app

[`example-app/`](./example-app) is a runnable reference integration,
including simulator notes (simulator payments carry placeholder data and
cannot be vaulted for real).

## Native bridge reference

The API below is the plugin's internal native bridge. Most integrations
should use `PushApplePay` above and never call it directly.

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

# Push Cash Capacitor SDK — Build Plan

The npm package `@pushcashco/capacitor`: a Capacitor plugin wrapping a framework-free Swift core, letting operators present the Apple Pay sheet inside their Capacitor iOS app and receive a Push token their backend spends on `POST /authorize`.

Source-of-truth design: the "Tech spec: Apple Pay Mobile SDK" Google Doc (mirrored at `docs/specs/apple-pay-mobile-sdk.md` in `pushcashco/root`). Operator-facing docs draft: https://pushcash-apple-pay-mobile-sdk-guide.mintlify.site. Primary integrating operator: Midas (Capacitor).

## Why this shape

- An in-app Apple Pay sheet requires native PassKit code (Apple Pay JS is dead inside WKWebView), presented under the **operator's own merchant identifier**, which must be in the operator's app entitlement (Apple scopes merchant IDs to the developer account — no sharing).
- The unit of reuse is a framework-free Swift core with a thin per-framework adapter (Stripe precedent: `stripe-ios` under `@stripe/stripe-react-native` and community Capacitor plugins). This repo ships the Capacitor adapter; React Native later would add an adapter, not a rewrite.
- Push never sees decrypted card data: the SDK sends the encrypted PKPaymentToken straight to Basis Theory (Push's vault), and only vault _references_ to Push. This keeps operators and Push out of SAD-handling PCI scope.

## Repo layout

```
├── package.json                 @pushcashco/capacitor
├── Package.swift                SPM manifest — two targets (core, plugin)
├── PushcashcoCapacitor.podspec  kept in sync for CocoaPods installs
├── src/
│   ├── definitions.ts           plugin interface + public types
│   ├── apple-pay.ts             PushApplePay class — the flow owner
│   ├── errors.ts                typed error taxonomy
│   ├── index.ts
│   └── web.ts                   web stub — every method rejects UNAVAILABLE
├── ios/Sources/
│   ├── PushApplePayCore/        Swift core — PassKit only, zero networking
│   └── PushApplePayPlugin/      CAPPlugin bridge — marshaling only
├── ios/Tests/PushApplePayCoreTests/
├── example-app/                 minimal Capacitor app for device validation
└── .github/workflows/           ci.yml, publish.yml
```

Scaffold from the official template (`npm init @capacitor/plugin`), then split the iOS side into the two SPM targets.

## Layer 1 — Swift core (`PushApplePayCore`)

Responsibility: present the PassKit sheet, serialize the result, complete the sheet truthfully. Nothing else.

```swift
public func canMakePayments() -> Bool

public struct SheetRequest {
    let merchantIdentifier: String        // operator-passed; must match entitlement
    let amount: Int                       // cents
    let currency: String                  // "USD"
    let supportedNetworks: [String]       // config-served
    let merchantCapabilities: [String]    // config-served
    let countryCode: String               // config-served
    let totalLabel: String                // config-served
}

public struct SerializedPayment {
    let paymentData: String               // base64 PKPaymentToken.paymentData — still encrypted
    let displayName: String?              // "Visa 1234"
    let network: String?
    let type: String                      // debit | credit | prepaid | unknown
    let transactionIdentifier: String
}

public func presentSheet(_ request: SheetRequest) async throws -> SerializedPayment
public func completeSheet(status: SheetStatus)    // .approved | .declined — resolves the held PKPayment completion
```

Key behaviors:

- `presentSheet` holds the PassKit authorization completion open until `completeSheet` is called, so the sheet's success/failure animation reflects the real authorization outcome.
- The #1 operator setup failure is a merchant identifier missing from the app entitlement — iOS rejects at presentation. Surface this as a distinct, legible error, not a generic failure.
- Dismissal by the user is a distinct error from presentation failure.

## Layer 2 — Capacitor bridge (`PushApplePayPlugin`)

A `CAPPlugin` exposing exactly `canMakePayments` / `presentSheet` / `completeSheet` to JS, converting dictionaries ↔ core types. No logic; no networking; the only file that imports Capacitor. Web implementation (`web.ts`) rejects everything with `UNAVAILABLE`.

## Layer 3 — TypeScript flow owner (`PushApplePay`)

The public API. Mirrors the Push web SDK contract:

```ts
const applePay = new PushApplePay({ url, merchantIdentifier });
// url: from the operator backend's POST /user/{id}/url with {"type": "apple_pay"} (Push API, bearer-authed, backend-side)
// merchantIdentifier: the operator's Apple merchant ID — must match their entitlement

await applePay.canMakePayments(): Promise<boolean>

await applePay.display({
  amount,          // cents
  currency,        // "USD"
  onAuthorize,     // (tokenId: string) => Promise<'approved' | 'declined'> — operator backend runs POST /authorize
  onComplete,      // (result) => void
});
// NOTE: no `direction` parameter — the SDK pins "cash_in" internally (spec Decision 3).
```

`display()` algorithm:

1. Parse the session nonce from `url`.
2. `GET {api}/applepay/config?nonce=...&merchant_identifier=...` → sheet config + BT routing. 403 → `NOT_ENABLED`.
3. `presentSheet` with operator-passed + config-served fields merged.
4. `POST {bt-api}/apple-pay` with the encrypted payment data, authenticated with `bt_application_key`, targeting `bt_merchant_registration_id` → BT vaults DPAN/cryptogram/ECI, returns the `apple_pay` resource (id, fingerprint, card enrichment).
5. `POST {api}/applepay/token` with the nonce + BT references (contract below) → `token_id`.
6. `status = await onAuthorize(token_id)` — runs while the sheet is up.
7. `completeSheet(status)`; call `onComplete`.

Typed errors (`errors.ts`): `NOT_ENABLED`, `CANNOT_MAKE_PAYMENTS`, `ENTITLEMENT_MISMATCH`, `SHEET_DISMISSED`, `SHEET_FAILED`, `TOKENIZATION_FAILED`, `TOKEN_MINT_FAILED`, `AUTHORIZE_REJECTED`, `UNAVAILABLE` (web). Every stage failure must call `completeSheet(.declined)` if the sheet is still open — never leave it spinning.

## Frozen backend contracts

These are shipped backend code in `pushcashco/root` (PRs #6517, #6518, #6520, #6521). Do not redefine from this side.

### Config — `GET {api}/applepay/config?nonce=...&merchant_identifier=...`

`merchant_identifier` present → 200 (flat JSON):

```json
{
  "merchant_capabilities": ["supports3DS"],
  "supported_networks": ["visa", "masterCard"],
  "country_code": "US",
  "total_label": "Operator Name",
  "given_name": "Jane",
  "family_name": "Doe",
  "email_address": "...",
  "phone_number": "...",
  "address_lines": ["..."],
  "locality": "...",
  "administrative_area": "...",
  "postal_code": "...",
  "billing_country_code": "US",
  "bt_application_key": "key_test_us_pub_...",
  "bt_merchant_registration_id": "<uuid>"
}
```

Unregistered merchant identifier → **403**, plaintext body `Apple Pay mobile is not enabled for this merchant identifier`. Expired/invalid nonce → 403.

### Token mint — `POST {api}/applepay/token`

```json
{
  "nonce": "<from widget url>",
  "bin": "<apple_pay.card.bin from the BT response>",
  "bt_token_id": "<apple_pay.id>",
  "bt_fingerprint": "<apple_pay.fingerprint>",
  "display_name": "Visa 1234",
  "network": "Visa",
  "type": "debit",
  "amount": 1000,
  "currency": "USD",
  "direction": "cash_in"
}
```

→ 200 `{"token_id": "token_..."}`. Rules the SDK relies on:

- `bt_token_id` and `bt_fingerprint` are required together; `low_value_token` (the web SDK's field) is mutually exclusive with them.
- The mint is NOT idempotent: a lost response surfaces as TOKEN_MINT_FAILED and the user taps again (fresh Apple payment). Do not add client-side mint retries without reintroducing server-side idempotency.
- `display_name` must end with the card's last 4 digits (400/500 otherwise).
- The BIN must resolve to a known BIN range (500 otherwise) — if sandbox device testing hits "Failed to resolve bin range", the backend's BIN coverage of Apple sandbox DPANs is the suspect, not the SDK.
- `amount > 0`, `currency == "USD"`, `direction == "cash_in"` are enforced.

### Basis Theory — `POST {bt-api}/apple-pay` (host by environment: `api.basistheory.com` for production nonces, `api.test.basistheory.com` otherwise — test keys only work against the test API)

Header `BT-API-KEY: <bt_application_key>`; body carries `apple_payment_data` (the PKPaymentToken payment data) and the `merchant_registration_id`. **VERIFY at implementation**: (a) the exact body field placement of `merchant_registration_id` per current BT docs (https://developers.basistheory.com/docs/api/apple-pay/api), and (b) that the public-key response includes `fingerprint` and `card` (bin/last4) — the API reference documents them, but the implementation guide's example shows a reduced body. The whole mint contract depends on (b); confirm on the first real device call and escalate to BT support if reduced.

## Testing & CI

- **TS unit** (Vitest): full `display()` orchestration against mocked plugin + mocked fetch — happy path, every typed error.
- **Swift unit**: SheetRequest mapping, SerializedPayment encoding, completion-holding semantics.
- **Example app** (`example-app/`): the device-validation vehicle. Push-owned test merchant ID in its entitlement, Push sandbox backend, Apple sandbox tester account, physical device. Sandbox decline trigger: amount **$22.00** (2200 cents). It needs a stub operator backend (small script/server in `example-app/server/`) that calls Push's `POST /user/{id}/url` and `POST /authorize` with a sandbox API key — keys via env, never committed.
- **CI** (`ci.yml`): tsc + eslint + vitest; `swift build` + `swift test`; `pod lib lint`; example app compile. **Publish** (`publish.yml`): on tag → npm publish with provenance.

## Sequencing

1. **Scaffold**: template, two SPM targets, CI green on empty shells.
2. **Swift core + bridge**: device-testable with hardcoded config — no backend dependency.
3. **TS flow layer**: against mocks first; contracts above are already deployed to sandbox.
4. **Example app end-to-end** on a physical device against sandbox — this is the backend M1 exit criterion's vehicle.
5. **Contract freeze + Midas review** of `display()` before `0.1.0`; then npm publish and Midas integrates.

## Backend dependencies (tracked in `pushcashco/root`, not here)

- PRs #6517/#6518/#6520/#6521 merged + migration applied — the config and mint endpoints.
- BT client methods + merchant-registration admin op (backend PR5/PR6) merged.
- A **sandbox merchant certificate registered for Push's own test merchant ID** (admin op) — end-to-end device testing is blocked until this exists.
- Sandbox BT public application key is already live in the backend config path.

## Open decisions (defaults in place until overridden)

1. **License**: MIT (default — Stripe/Capacitor norm). Confirm with Push before first publish.
2. **Capacitor peer range / min iOS**: confirm Midas's Capacitor major; default target Capacitor 7+ (SPM-capable), iOS 15+.
3. **Repo visibility**: internal now; flip public at `0.1.0`.
4. **Example app stub backend**: in-repo stub server (default) vs pointing at an existing Push demo client.

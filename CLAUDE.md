# CLAUDE.md

## What this repo is

The Push Cash Capacitor SDK for Apple Pay: the npm package `@pushcashco/capacitor`. A Capacitor plugin (TypeScript flow layer + thin `CAPPlugin` bridge) wrapping a framework-free Swift core that presents the Apple Pay sheet via PassKit. Operators embed it in their Capacitor iOS apps to accept Apple Pay deposits through Push Cash.

## Hard rules

- The Swift core (`ios/Sources/PushApplePayCore`) does PassKit presentation and PKPaymentToken serialization ONLY. No networking, no Capacitor imports. All flow logic and every HTTP call lives in the TypeScript layer.
- The Capacitor bridge (`ios/Sources/PushApplePayPlugin`) is serialization-only: it marshals between JS and the core. If logic is appearing in the bridge, it belongs in TypeScript or the core.
- The Push API contracts (config response, token-mint request) are frozen by shipped backend code. Do not rename fields to taste; a mismatch fails silently on devices.
- The token mint is NOT idempotent: a lost response surfaces as TOKEN_MINT_FAILED and the user taps again (a fresh Apple payment). Do not add client-side mint retries without server-side idempotency existing first.
- SPM-first: `Package.swift` is the canonical iOS manifest; the podspec is kept in sync but secondary.
- `display()` takes no `direction` parameter — the SDK pins `cash_in` internally in the mint request. Do not add it back.
- No credentials, no internal URLs beyond the public API hosts, no operator names in code or fixtures.

## Developer workflow

- TypeScript: `npm run build` (tsc + docgen + rollup), `npm test`, `npm run eslint`, `npm run prettier -- --check` — all must pass before committing.
- Swift: build/test via `xcodebuild -scheme PushcashcoCapacitor -destination 'platform=iOS Simulator,name=<device>'` (PassKit needs an iOS destination; plain `swift build` targets macOS and fails).
- `test/local-e2e.spec.ts` is a maintainer-only integration suite, skipped unless `PUSH_LOCAL_E2E=1`; it needs a local Push API.
- `example-app/` is the runnable reference integration (see its README).

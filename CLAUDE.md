# CLAUDE.md

## What this repo is

The Push Cash Capacitor SDK for Apple Pay: the npm package `@pushcashco/capacitor`. A Capacitor plugin (TypeScript flow layer + thin `CAPPlugin` bridge) wrapping a framework-free Swift core that presents the Apple Pay sheet via PassKit. Operators embed it in their Capacitor iOS apps to accept Apple Pay deposits through Push Cash.

**Read `PLAN.md` before doing anything** — it holds the architecture, the frozen backend API contracts, the build sequence, and the open decisions. The backend this SDK talks to lives in `pushcashco/root`; its contracts are already deployed and must not be redefined from this side.

## Hard rules

- The Swift core (`ios/Sources/PushApplePayCore`) does PassKit presentation and PKPaymentToken serialization ONLY. No networking, no Capacitor imports. All flow logic and every HTTP call lives in the TypeScript layer.
- The Capacitor bridge (`ios/Sources/PushApplePayPlugin`) is serialization-only: it marshals between JS and the core. If logic is appearing in the bridge, it belongs in TypeScript or the core.
- The backend contracts in `PLAN.md` (config response, token-mint request) are frozen by shipped backend code. Do not rename fields to taste; a mismatch here fails silently on devices.
- SPM-first: `Package.swift` is the canonical iOS manifest; the podspec is kept in sync but secondary.
- `display()` takes no `direction` parameter — the SDK pins `cash_in` internally in the mint request. Do not add it back.
- This repo will be open source. No credentials, no internal URLs beyond the public API hosts, no operator names in code or fixtures.

## Developer workflow

- TypeScript: `npm run build` (tsc), `npm test`, `npm run lint` — all must pass before committing.
- Swift: `swift build` and `swift test` from the repo root.
- Device testing runs through `example-app/` against the Push sandbox; it requires a physical device, an Apple sandbox tester account, and a registered sandbox merchant certificate (see PLAN.md "Backend dependencies").

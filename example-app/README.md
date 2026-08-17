# Example app

A minimal Capacitor iOS app exercising the SDK against a local Push backend.
The web layer plays both roles: the operator backend (user + widget-URL +
authorize calls with a dev API key) and the app UI that drives `display()`.

## Setup

1. Backend (in the `root` repo): `make run-postgres run-redis`, `make
   migrate-up`, `make setup-client-fixtures`, `make setup-bin-fixtures`, insert
   an `applepay_payment_processing_certs` row for your merchant identifier, and
   `go run ./cmd`.
2. `cp src/js/dev-config.example.js src/js/dev-config.js` and fill in the
   API key (`DEV_DEMO_API_KEY` from the backend's `.env.local`).
3. `npm install && npm run build && npx cap sync ios`
4. After every `cap sync`: the CLI regenerates `ios/App/CapApp-SPM/Package.swift`
   pinned to iOS 14, but the SDK requires 15 — re-apply:
   `sed -i '' 's/platforms: \[.iOS(.v14)\]/platforms: [.iOS(.v15)]/' ios/App/CapApp-SPM/Package.swift`
5. Open `ios/App/App.xcodeproj` in Xcode and run on a simulator, or build with
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination
   'platform=iOS Simulator,name=iPhone 15' build`.

## Simulator

Simulator payments are placeholders end to end (empty `paymentData`,
"Simulated Instrument" display name, `unknown` card type, constant transaction
identifier), so `interceptBasisTheory: true` in the dev config swaps in a
realistic payment after the real sheet authorizes and stubs the Basis Theory
call with fixture vault references. The sheet, the bridge, the mint, the
authorize round trip, and the completion animations are all real. On a physical
device with a registered payment-processing certificate, turn the flag off.

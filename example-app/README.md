# Example app

A minimal Capacitor iOS app exercising the SDK against the Push sandbox.
The web layer plays both roles: the operator backend (user + widget-URL +
authorize calls with a sandbox API key) and the app UI that drives
`display()`. In a real integration the operator-backend half runs on your
servers — an API key never belongs in an app.

## Setup

1. You need a Push sandbox operator API key, and an Apple merchant identifier
   with a payment-processing certificate registered with Push (part of
   Apple Pay onboarding).
2. `cp src/js/dev-config.example.js src/js/dev-config.js` and fill in the
   API key and your merchant identifier.
3. Add the merchant identifier to the app's Apple Pay entitlement
   (`ios/App/App/App.entitlements`).
4. `npm install && npm run build && npx cap sync ios`
5. After every `cap sync`: the CLI regenerates `ios/App/CapApp-SPM/Package.swift`
   pinned to iOS 14, but the SDK requires 15 — re-apply:
   `sed -i '' 's/platforms: \[.iOS(.v14)\]/platforms: [.iOS(.v15)]/' ios/App/CapApp-SPM/Package.swift`
6. Open `ios/App/App.xcodeproj` in Xcode and run, or build with
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination
   'platform=iOS Simulator,name=iPhone 15' build`.

Sandbox deposits of exactly $22.00 decline; other amounts approve.

Simulator payments carry placeholder data that cannot be vaulted for real —
run on a physical device, or see the `interceptBasisTheory` option in
`dev-config.example.js`.

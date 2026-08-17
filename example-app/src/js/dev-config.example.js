// Copy to dev-config.js (gitignored) and fill in. dev-config.js is baked into
// the built app: local development values only, never real credentials.
export default {
  // API host the in-app operator stub talks to. The SDK itself routes from
  // the widget URL's nonce, independent of this value. Push developers can
  // point this at a local backend instead.
  apiBase: 'https://sandbox.pushcash.com',
  // Sandbox operator API key.
  apiKey: '',
  // Your Apple merchant identifier: registered with Push during Apple Pay
  // onboarding AND present in the app's Apple Pay entitlement.
  merchantIdentifier: '',
  // Simulator payments carry placeholder data that Basis Theory cannot
  // decrypt; this substitutes a realistic payment and stubs the Basis Theory
  // call. Set true on a simulator, false on a physical device.
  interceptBasisTheory: false,
  // Card BIN the stubbed Basis Theory response reports. Must be one the
  // target environment's BIN table resolves.
  fixtureBin: '41111111',
  // Present the sheet automatically on launch with this amount in cents
  // (null disables).
  autoPayAmount: null,
};

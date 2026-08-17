// Copy to dev-config.js (gitignored) and fill in. dev-config.js is baked into
// the built app: local development values only, never real credentials.
export default {
  // Operator API host the in-app operator stub talks to. The SDK routes itself
  // from the widget URL's nonce, independent of this value.
  apiBase: 'http://localhost:8080',
  // Operator API key (DEV_DEMO_API_KEY from the backend's .env.local).
  apiKey: '',
  // Must be registered in applepay_payment_processing_certs AND present in the
  // app's Apple Pay entitlement.
  merchantIdentifier: 'merchant.com.pushcash.example',
  // The simulator produces empty paymentData that Basis Theory cannot decrypt;
  // this stubs the BT call the way the SDK test suite does. Turn off on a
  // physical device.
  interceptBasisTheory: true,
  // Present the sheet automatically on launch with this amount in cents
  // (null disables).
  autoPayAmount: null,
};

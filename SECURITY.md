# Security

If you believe you have found a security vulnerability in this SDK or in the
Push Cash platform, please report it privately to **security@pushcash.com**.
Do not open a public issue for security reports.

Please include enough detail to reproduce the issue. We will acknowledge your
report and keep you informed of the fix's progress.

## Scope notes

- This SDK never handles card numbers: Apple Pay payment data is encrypted by
  the device to the merchant's payment-processing certificate and decrypted
  only by the vault provider. The SDK forwards the encrypted payload and
  handles opaque token references.
- The Basis Theory application key served to the SDK is a public key by
  design; it can only create Apple Pay tokens.

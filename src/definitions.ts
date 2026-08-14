/**
 * The authorization outcome reached by the operator's backend, driving the
 * sheet's final animation.
 */
export type SheetStatus = 'approved' | 'declined';

export interface PresentSheetOptions {
  /**
   * The operator's Apple merchant identifier. Must be present in the app's
   * Apple Pay entitlement.
   */
  merchantIdentifier: string;
  /** Amount in cents. */
  amount: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** ISO 3166 country code, e.g. "US". Served by the Push config endpoint. */
  countryCode: string;
  /** The label shown on the sheet's total line. Served by the Push config endpoint. */
  totalLabel: string;
  /** Card networks the sheet accepts. Served by the Push config endpoint. */
  supportedNetworks: string[];
  /** Merchant capabilities, e.g. "supports3DS". Served by the Push config endpoint. */
  merchantCapabilities: string[];
}

/**
 * The authorized payment, serialized for the flow layer. paymentData is still
 * encrypted to the merchant's payment-processing certificate.
 */
export interface SerializedPayment {
  /** Base64 of PKPaymentToken.paymentData. */
  paymentData: string;
  /** e.g. "Visa 1234" — carries the physical card's last 4. */
  displayName?: string;
  /** e.g. "Visa". */
  network?: string;
  /** debit | credit | prepaid | store | unknown */
  type: string;
  /** Apple's transaction identifier — the token-mint idempotency key. */
  transactionIdentifier: string;
}

export interface PushApplePayPlugin {
  /**
   * Reports whether the device supports Apple Pay payments.
   */
  canMakePayments(): Promise<{ available: boolean }>;

  /**
   * Presents the Apple Pay sheet and resolves with the serialized payment as
   * soon as the user authorizes. The sheet stays up until completeSheet is
   * called with the real authorization outcome.
   *
   * Rejects with SHEET_DISMISSED if the user closes the sheet, and with
   * PRESENTATION_FAILED when iOS refuses to present — most commonly a
   * merchant identifier missing from the app's Apple Pay entitlement.
   */
  presentSheet(options: PresentSheetOptions): Promise<SerializedPayment>;

  /**
   * Resolves the held Apple Pay sheet with the authorization outcome, letting
   * it animate out truthfully.
   */
  completeSheet(options: { status: SheetStatus }): Promise<void>;
}

export type PushApplePayErrorCode =
  /** The merchant identifier has no registered Apple Pay certificate with Push. */
  | 'NOT_ENABLED'
  /** The Push config endpoint failed for a reason other than NOT_ENABLED. */
  | 'CONFIG_FAILED'
  /** The device cannot make Apple Pay payments. */
  | 'CANNOT_MAKE_PAYMENTS'
  /**
   * iOS refused to present the sheet. The most common cause is a merchant
   * identifier that is not in the app's Apple Pay entitlement.
   */
  | 'PRESENTATION_FAILED'
  /** An Apple Pay sheet is already presented. */
  | 'SHEET_ALREADY_PRESENTED'
  /** The user dismissed the sheet without authorizing. */
  | 'SHEET_DISMISSED'
  /** Basis Theory rejected the tokenization call. */
  | 'TOKENIZATION_FAILED'
  /** The Push token mint failed. */
  | 'TOKEN_MINT_FAILED'
  /** onAuthorize threw or returned something other than approved/declined. */
  | 'AUTHORIZE_FAILED'
  /** The widget URL could not be parsed. */
  | 'INVALID_URL'
  /** Apple Pay requires iOS; there is no web implementation. */
  | 'UNAVAILABLE';

export class PushApplePayError extends Error {
  readonly code: PushApplePayErrorCode;

  constructor(code: PushApplePayErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PushApplePayError';
    this.code = code;
  }
}

const NATIVE_CODES: PushApplePayErrorCode[] = [
  'CANNOT_MAKE_PAYMENTS',
  'PRESENTATION_FAILED',
  'SHEET_ALREADY_PRESENTED',
  'SHEET_DISMISSED',
  'UNAVAILABLE',
];

/**
 * Wraps a native plugin rejection into a PushApplePayError, keeping recognized
 * codes and folding everything else into PRESENTATION_FAILED.
 */
export function fromNativeError(error: unknown): PushApplePayError {
  if (error instanceof PushApplePayError) {
    return error;
  }
  const native = error as { code?: string; message?: string };
  const code = NATIVE_CODES.find((known) => known === native?.code) ?? 'PRESENTATION_FAILED';
  return new PushApplePayError(code, native?.message ?? 'The Apple Pay sheet could not be presented.', {
    cause: error,
  });
}

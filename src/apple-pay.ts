import type { PushApplePayPlugin, SerializedPayment, SheetStatus } from './definitions';
import { PushApplePayError, fromNativeError } from './errors';
import { PushApplePayNative } from './plugin';

export interface PushApplePayOptions {
  /**
   * The widget URL from the operator backend's POST /user/{id}/url with
   * {"type": "apple_pay"}. Carries the session nonce.
   */
  url: string;
  /**
   * The operator's Apple merchant identifier. Must be in the app's Apple Pay
   * entitlement.
   */
  merchantIdentifier: string;
}

export interface DisplayOptions {
  /** Amount in cents. */
  amount: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /**
   * Runs while the sheet is up: the operator's backend spends the Push token
   * on POST /authorize and reports the outcome, which drives the sheet's
   * final animation.
   */
  onAuthorize: (token: string) => Promise<SheetStatus>;
  onComplete?: (result: DisplayResult) => void;
}

export interface DisplayResult {
  status: SheetStatus;
  /** The Push token the deposit was authorized with. */
  token: string;
}

interface ApplePayConfig {
  merchant_capabilities: string[];
  supported_networks: string[];
  country_code: string;
  total_label: string;
  bt_application_key: string;
  bt_merchant_registration_id: string;
}

interface BTApplePayToken {
  id: string;
  fingerprint?: string;
  card?: { bin?: string };
}

const BT_APPLE_PAY_URL = 'https://api.basistheory.com/apple-pay';

/**
 * The Push Cash Apple Pay flow: fetches the sheet configuration, presents the
 * sheet, vaults the payment with Basis Theory, mints the Push token, and
 * completes the sheet with the operator's real authorization outcome.
 */
export class PushApplePay {
  private readonly nonce: string;
  private readonly apiBaseUrl: string;
  private readonly merchantIdentifier: string;
  private readonly plugin: PushApplePayPlugin;

  constructor(options: PushApplePayOptions, plugin: PushApplePayPlugin = PushApplePayNative) {
    let nonce: string | null;
    try {
      nonce = new URL(options.url).searchParams.get('nonce');
    } catch (error) {
      throw new PushApplePayError('INVALID_URL', `Could not parse the widget URL: ${options.url}`, { cause: error });
    }
    if (!nonce) {
      throw new PushApplePayError('INVALID_URL', 'The widget URL carries no nonce.');
    }
    this.nonce = nonce;
    this.apiBaseUrl = PushApplePay.baseUrlForNonce(nonce);
    this.merchantIdentifier = options.merchantIdentifier;
    this.plugin = plugin;
  }

  /** The nonce's environment suffix picks the Push API host. */
  private static baseUrlForNonce(nonce: string): string {
    if (nonce.endsWith('_production')) {
      return 'https://api.pushcash.com';
    }
    if (nonce.endsWith('_sandbox')) {
      return 'https://sandbox.pushcash.com';
    }
    return 'http://localhost:8080';
  }

  async canMakePayments(): Promise<boolean> {
    try {
      return (await this.plugin.canMakePayments()).available;
    } catch (error) {
      throw fromNativeError(error);
    }
  }

  async display(options: DisplayOptions): Promise<DisplayResult> {
    const config = await this.fetchConfig();

    let payment: SerializedPayment;
    try {
      payment = await this.plugin.presentSheet({
        merchantIdentifier: this.merchantIdentifier,
        amount: options.amount,
        currency: options.currency,
        countryCode: config.country_code,
        totalLabel: config.total_label,
        supportedNetworks: config.supported_networks,
        merchantCapabilities: config.merchant_capabilities,
      });
    } catch (error) {
      throw fromNativeError(error);
    }

    // The sheet is up and holding its completion from here on: every failure
    // must resolve it as declined before surfacing.
    let token: string;
    try {
      const applePay = await this.tokenize(payment, config);
      token = await this.mintToken(payment, applePay, options);
    } catch (error) {
      await this.completeSheetQuietly('declined');
      throw error;
    }

    let status: SheetStatus;
    try {
      status = await options.onAuthorize(token);
    } catch (error) {
      await this.completeSheetQuietly('declined');
      throw new PushApplePayError('AUTHORIZE_FAILED', 'onAuthorize threw.', { cause: error });
    }
    if (status !== 'approved' && status !== 'declined') {
      await this.completeSheetQuietly('declined');
      throw new PushApplePayError(
        'AUTHORIZE_FAILED',
        `onAuthorize must return "approved" or "declined", got: ${status}`,
      );
    }

    await this.plugin.completeSheet({ status });

    const result: DisplayResult = { status, token };
    options.onComplete?.(result);
    return result;
  }

  private async fetchConfig(): Promise<ApplePayConfig> {
    const url =
      `${this.apiBaseUrl}/applepay/config` +
      `?nonce=${encodeURIComponent(this.nonce)}` +
      `&merchant_identifier=${encodeURIComponent(this.merchantIdentifier)}`;
    const response = await fetch(url);
    if (response.status === 403) {
      const body = await response.text();
      if (body.toLowerCase().includes('not enabled')) {
        throw new PushApplePayError('NOT_ENABLED', body.trim());
      }
      throw new PushApplePayError('CONFIG_FAILED', body.trim() || 'The Apple Pay session is not valid.');
    }
    if (!response.ok) {
      throw new PushApplePayError('CONFIG_FAILED', `The Apple Pay configuration request failed (${response.status}).`);
    }
    return (await response.json()) as ApplePayConfig;
  }

  private async tokenize(payment: SerializedPayment, config: ApplePayConfig): Promise<BTApplePayToken> {
    const response = await fetch(BT_APPLE_PAY_URL, {
      method: 'POST',
      headers: {
        'BT-API-KEY': config.bt_application_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_registration_id: config.bt_merchant_registration_id,
        apple_payment_data: {
          paymentData: decodeBase64Json(payment.paymentData),
          transactionIdentifier: payment.transactionIdentifier,
        },
      }),
    });
    if (!response.ok) {
      throw new PushApplePayError('TOKENIZATION_FAILED', `Basis Theory rejected the payment (${response.status}).`);
    }
    const body = (await response.json()) as { apple_pay?: BTApplePayToken };
    const applePay = body.apple_pay;
    if (!applePay?.id || !applePay.fingerprint || !applePay.card?.bin) {
      throw new PushApplePayError(
        'TOKENIZATION_FAILED',
        'The Basis Theory response is missing id, fingerprint, or card.bin.',
      );
    }
    return applePay;
  }

  private async mintToken(
    payment: SerializedPayment,
    applePay: BTApplePayToken,
    options: DisplayOptions,
  ): Promise<string> {
    const response = await fetch(`${this.apiBaseUrl}/applepay/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: this.nonce,
        bin: applePay.card?.bin,
        bt_token_id: applePay.id,
        bt_fingerprint: applePay.fingerprint,
        transaction_identifier: payment.transactionIdentifier,
        display_name: payment.displayName,
        network: payment.network,
        type: payment.type,
        amount: options.amount,
        currency: options.currency,
        direction: 'cash_in',
      }),
    });
    if (!response.ok) {
      throw new PushApplePayError('TOKEN_MINT_FAILED', `The Push token mint failed (${response.status}).`);
    }
    const body = (await response.json()) as { token_id?: string };
    if (!body.token_id) {
      throw new PushApplePayError('TOKEN_MINT_FAILED', 'The Push token mint response carries no token_id.');
    }
    return body.token_id;
  }

  private async completeSheetQuietly(status: SheetStatus): Promise<void> {
    try {
      await this.plugin.completeSheet({ status });
    } catch {
      // The sheet may already be gone; the original error is what matters.
    }
  }
}

function decodeBase64Json(base64: string): unknown {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

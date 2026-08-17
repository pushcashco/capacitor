import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PushApplePay, PushApplePayError } from '../src';
import type { PresentSheetOptions, PushApplePayPlugin, SerializedPayment, SheetStatus } from '../src';

const WIDGET_URL = 'https://cdn.pushcash.com/widget/?client=Example&nonce=abc123_sandbox&mode=entry&type=apple_pay';
const MERCHANT_ID = 'merchant.com.example.app';

const CONFIG = {
  merchant_capabilities: ['supports3DS'],
  supported_networks: ['visa', 'masterCard'],
  country_code: 'US',
  total_label: 'Example Operator',
  bt_application_key: 'key_test_us_pub_abc',
  bt_merchant_registration_id: 'mr-123',
};

// {"data":"encrypted"} — stands in for the encrypted PKPaymentToken payment data.
const PAYMENT_DATA_B64 = btoa('{"data":"encrypted"}');

const PAYMENT: SerializedPayment = {
  paymentData: PAYMENT_DATA_B64,
  displayName: 'Visa 1234',
  network: 'Visa',
  type: 'debit',
  transactionIdentifier: 'txn-1',
};

const BT_RESPONSE = {
  apple_pay: { id: 'bt-token-1', fingerprint: 'fp-A', card: { bin: '411111' } },
};

class FakePlugin implements PushApplePayPlugin {
  available = true;
  presentedWith: PresentSheetOptions | null = null;
  completedWith: SheetStatus | null = null;
  presentResult: Promise<SerializedPayment> = Promise.resolve(PAYMENT);

  async canMakePayments(): Promise<{ available: boolean }> {
    return { available: this.available };
  }

  async presentSheet(options: PresentSheetOptions): Promise<SerializedPayment> {
    this.presentedWith = options;
    return this.presentResult;
  }

  async completeSheet(options: { status: SheetStatus }): Promise<void> {
    this.completedWith = options.status;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PushApplePay', () => {
  let plugin: FakePlugin;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    plugin = new FakePlugin();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  function sdk(): PushApplePay {
    return new PushApplePay({ url: WIDGET_URL, merchantIdentifier: MERCHANT_ID }, plugin);
  }

  function stubHappyBackend(): void {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applepay/config')) {
        return jsonResponse(CONFIG);
      }
      if (url.includes('basistheory.com/apple-pay')) {
        return jsonResponse(BT_RESPONSE);
      }
      if (url.includes('/applepay/token')) {
        return jsonResponse({ token_id: 'token_1' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it('rejects a widget URL without a nonce', () => {
    expect(
      () => new PushApplePay({ url: 'https://cdn.pushcash.com/widget/', merchantIdentifier: MERCHANT_ID }, plugin),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_URL' }));
  });

  it('runs the full flow and completes the sheet with the authorization outcome', async () => {
    stubHappyBackend();
    const onAuthorize = vi.fn().mockResolvedValue('approved' as const);
    const onComplete = vi.fn();

    const result = await sdk().display({ amount: 1000, currency: 'USD', onAuthorize, onComplete });

    expect(result).toEqual({ status: 'approved', token: 'token_1' });
    expect(onComplete).toHaveBeenCalledWith({ status: 'approved', token: 'token_1' });
    expect(onAuthorize).toHaveBeenCalledWith('token_1');
    expect(plugin.completedWith).toBe('approved');

    // The nonce's environment suffix picks the sandbox API host.
    const configUrl = String(fetchMock.mock.calls[0][0]);
    expect(configUrl).toBe(
      'https://sandbox.pushcash.com/applepay/config?nonce=abc123_sandbox&merchant_identifier=merchant.com.example.app',
    );

    // The sheet merges operator-passed and config-served fields.
    expect(plugin.presentedWith).toEqual({
      merchantIdentifier: MERCHANT_ID,
      amount: 1000,
      currency: 'USD',
      countryCode: 'US',
      totalLabel: 'Example Operator',
      supportedNetworks: ['visa', 'masterCard'],
      merchantCapabilities: ['supports3DS'],
    });

    // Basis Theory gets the application key, the registration id, and the
    // decoded payment data.
    const [btUrl, btInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(btUrl).toBe('https://api.basistheory.com/apple-pay');
    expect((btInit.headers as Record<string, string>)['BT-API-KEY']).toBe('key_test_us_pub_abc');
    expect(JSON.parse(String(btInit.body))).toEqual({
      merchant_registration_id: 'mr-123',
      apple_payment_data: {
        paymentData: { data: 'encrypted' },
        transactionIdentifier: 'txn-1',
      },
    });

    // The mint request carries the frozen backend contract.
    const [mintUrl, mintInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(mintUrl).toBe('https://sandbox.pushcash.com/applepay/token');
    expect(JSON.parse(String(mintInit.body))).toEqual({
      nonce: 'abc123_sandbox',
      bin: '411111',
      bt_token_id: 'bt-token-1',
      bt_fingerprint: 'fp-A',
      transaction_identifier: 'txn-1',
      display_name: 'Visa 1234',
      network: 'Visa',
      type: 'debit',
      amount: 1000,
      currency: 'USD',
      direction: 'cash_in',
    });
  });

  it('declines the sheet when onAuthorize reports declined, without an error', async () => {
    stubHappyBackend();
    const result = await sdk().display({
      amount: 1000,
      currency: 'USD',
      onAuthorize: async () => 'declined',
    });
    expect(result.status).toBe('declined');
    expect(plugin.completedWith).toBe('declined');
  });

  it('maps the config 403 to NOT_ENABLED without presenting the sheet', async () => {
    fetchMock.mockResolvedValue(
      new Response('Apple Pay mobile is not enabled for this merchant identifier', { status: 403 }),
    );

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'NOT_ENABLED' });
    expect(plugin.presentedWith).toBeNull();
  });

  it('propagates a dismissed sheet without completing it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONFIG));
    plugin.presentResult = Promise.reject({ code: 'SHEET_DISMISSED', message: 'dismissed' });

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'SHEET_DISMISSED' });
    expect(plugin.completedWith).toBeNull();
  });

  it('declines the sheet when Basis Theory rejects the payment', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applepay/config')) {
        return jsonResponse(CONFIG);
      }
      return new Response('nope', { status: 400 });
    });

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'TOKENIZATION_FAILED' });
    expect(plugin.completedWith).toBe('declined');
  });

  it('declines the sheet when the payment carries no decodable paymentData', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONFIG));
    plugin.presentResult = Promise.resolve({ ...PAYMENT, paymentData: '' });

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'TOKENIZATION_FAILED' });
    expect(plugin.completedWith).toBe('declined');
    // Basis Theory is never called with an undecodable payment.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('basistheory'))).toHaveLength(0);
  });

  it('declines the sheet when the Basis Theory response is missing the vault references', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applepay/config')) {
        return jsonResponse(CONFIG);
      }
      return jsonResponse({ apple_pay: { id: 'bt-token-1', type: 'dpan' } });
    });

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'TOKENIZATION_FAILED' });
    expect(plugin.completedWith).toBe('declined');
  });

  it('declines the sheet when the token mint fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applepay/config')) {
        return jsonResponse(CONFIG);
      }
      if (url.includes('basistheory.com')) {
        return jsonResponse(BT_RESPONSE);
      }
      return new Response('boom', { status: 500 });
    });

    await expect(
      sdk().display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' }),
    ).rejects.toMatchObject({ code: 'TOKEN_MINT_FAILED' });
    expect(plugin.completedWith).toBe('declined');
  });

  it('declines the sheet when onAuthorize throws', async () => {
    stubHappyBackend();

    await expect(
      sdk().display({
        amount: 1000,
        currency: 'USD',
        onAuthorize: async () => {
          throw new Error('backend down');
        },
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZE_FAILED' });
    expect(plugin.completedWith).toBe('declined');
  });

  it('declines the sheet when onAuthorize returns an unexpected status', async () => {
    stubHappyBackend();

    await expect(
      sdk().display({
        amount: 1000,
        currency: 'USD',
        onAuthorize: async () => 'maybe' as SheetStatus,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZE_FAILED' });
    expect(plugin.completedWith).toBe('declined');
  });

  it('resolves the production API host from the nonce suffix', () => {
    const prod = new PushApplePay(
      { url: 'https://cdn.pushcash.com/widget/?nonce=abc_production', merchantIdentifier: MERCHANT_ID },
      plugin,
    );
    expect(prod).toBeInstanceOf(PushApplePay);
  });

  it('reports device capability from the plugin', async () => {
    plugin.available = false;
    await expect(sdk().canMakePayments()).resolves.toBe(false);
  });

  it('errors are typed PushApplePayError instances', async () => {
    fetchMock.mockResolvedValue(
      new Response('Apple Pay mobile is not enabled for this merchant identifier', { status: 403 }),
    );
    const error = await sdk()
      .display({ amount: 1000, currency: 'USD', onAuthorize: async () => 'approved' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(PushApplePayError);
  });
});

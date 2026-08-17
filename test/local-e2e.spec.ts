import { beforeEach, describe, expect, it } from 'vitest';

import { PushApplePay } from '../src';
import type { PresentSheetOptions, PushApplePayPlugin, SerializedPayment, SheetStatus } from '../src';

/**
 * End-to-end test against a real local Push API, faking only the two pieces
 * that need Apple hardware: the PassKit sheet (FakePlugin) and Basis Theory's
 * decryption (fetch intercept). Requires a local Push API on localhost:8080
 * with an operator API key, a payment-processing certificate registered for
 * the merchant identifier below, and a BIN table covering the fixture BIN —
 * see the internal "Apple Pay mobile SDK: local testing" runbook.
 *
 * Run:
 *   PUSH_LOCAL_E2E=1 PUSH_API_KEY=<operator API key> npx vitest run test/local-e2e.spec.ts
 */

const API_BASE = 'http://localhost:8080';
const API_KEY = process.env.PUSH_API_KEY ?? '';
const MERCHANT_ID = 'merchant.com.pushcash.example';
// A BIN the local backend's BIN table resolves.
const FIXTURE_BIN = '55555555';
// The sandbox decision declines Apple Pay deposits of exactly $22.00.
const DECLINE_AMOUNT = 2200;

const realFetch = globalThis.fetch;

class FakePlugin implements PushApplePayPlugin {
  presentedWith: PresentSheetOptions | null = null;
  completedWith: SheetStatus | null = null;
  nextTransactionIdentifier = '';

  async canMakePayments(): Promise<{ available: boolean }> {
    return { available: true };
  }

  async presentSheet(options: PresentSheetOptions): Promise<SerializedPayment> {
    this.presentedWith = options;
    return {
      paymentData: btoa('{"data":"encrypted"}'),
      displayName: 'Visa 1234',
      network: 'Visa',
      type: 'debit',
      transactionIdentifier: this.nextTransactionIdentifier,
    };
  }

  async completeSheet(options: { status: SheetStatus }): Promise<void> {
    this.completedWith = options.status;
  }
}

async function operator(path: string, body?: unknown): Promise<any> {
  const response = await realFetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function createUser(runId: string): Promise<string> {
  const user = await operator('/user', {
    name: { first: 'Ada', last: 'Lovelace' },
    email: `ada+${runId}@example.com`,
    phone_number: '+14155550100',
    identity_verified: true,
    date_of_birth: '1990-01-15',
    government_id: { type: 'ssn', last4: '1234' },
    address: {
      address_line_1: '1 Main St',
      locality: 'Trenton',
      administrative_area: 'NJ',
      postal_code: '08601',
      country: 'US',
    },
  });
  return user.id;
}

async function createSdk(userId: string, plugin: FakePlugin, merchantIdentifier = MERCHANT_ID): Promise<PushApplePay> {
  const { url } = await operator(`/user/${userId}/url`, { type: 'apple_pay', direction: 'cash_in' });
  return new PushApplePay({ url, merchantIdentifier }, plugin);
}

function onAuthorizeVia(amount: number, sink?: { credentialId?: string }): (token: string) => Promise<SheetStatus> {
  return async (token) => {
    const response = await realFetch(`${API_BASE}/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, currency: 'USD', direction: 'cash_in', token }),
    });
    // A declined intent comes back as a 401 with a JSON body carrying
    // status "declined"; anything without a status is a real failure.
    const text = await response.text();
    let body: { status?: string; credential?: { id?: string } } | undefined;
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      // fall through to the throw below
    }
    if (body?.status !== 'approved' && body?.status !== 'declined') {
      throw new Error(`/authorize failed (${response.status}): ${text}`);
    }
    if (sink && body.credential?.id) {
      sink.credentialId = body.credential.id;
    }
    return body.status;
  };
}

describe.runIf(process.env.PUSH_LOCAL_E2E === '1')('local end-to-end', () => {
  const runId = Date.now().toString(36);
  let plugin: FakePlugin;
  let fingerprint: string;
  let transactionCounter = 0;

  beforeEach(() => {
    plugin = new FakePlugin();
    plugin.nextTransactionIdentifier = `txn-${runId}-${++transactionCounter}`;
    fingerprint = `fp-${runId}`;

    // Everything real except Basis Theory.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('basistheory.com/apple-pay')) {
        return new Response(
          JSON.stringify({
            apple_pay: {
              id: `bt-${runId}-${transactionCounter}`,
              fingerprint,
              card: { bin: FIXTURE_BIN },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    }) as typeof fetch;
  });

  it('runs the full flow against the real backend', async () => {
    const userId = await createUser(runId);
    const sdk = await createSdk(userId, plugin);

    const firstAuth: { credentialId?: string } = {};
    const result = await sdk.display({ amount: 1500, currency: 'USD', onAuthorize: onAuthorizeVia(1500, firstAuth) });

    expect(result.status).toBe('approved');
    expect(result.token).toMatch(/^token_/);
    expect(plugin.completedWith).toBe('approved');

    // The sheet options came from the real config endpoint.
    expect(plugin.presentedWith).toMatchObject({
      merchantIdentifier: MERCHANT_ID,
      totalLabel: 'Sportsbook',
      supportedNetworks: ['visa', 'masterCard'],
      merchantCapabilities: ['supports3DS'],
      countryCode: 'US',
    });

    // The approved deposit created a credential from the vault references.
    expect(firstAuth.credentialId).toMatch(/^cred_/);

    // A second deposit from the same device (same fingerprint, new
    // transaction) reuses the credential instead of creating another.
    plugin.nextTransactionIdentifier = `txn-${runId}-${++transactionCounter}`;
    const secondAuth: { credentialId?: string } = {};
    const secondSdk = await createSdk(userId, plugin);
    const second = await secondSdk.display({
      amount: 1700,
      currency: 'USD',
      onAuthorize: onAuthorizeVia(1700, secondAuth),
    });
    expect(second.status).toBe('approved');
    expect(second.token).not.toBe(result.token);
    expect(secondAuth.credentialId).toBe(firstAuth.credentialId);
  });

  it('completes the sheet as declined when the operator authorize declines', async () => {
    const userId = await createUser(`${runId}-decline`);
    const sdk = await createSdk(userId, plugin);

    const result = await sdk.display({
      amount: DECLINE_AMOUNT,
      currency: 'USD',
      onAuthorize: onAuthorizeVia(DECLINE_AMOUNT),
    });

    expect(result.status).toBe('declined');
    expect(plugin.completedWith).toBe('declined');
  });

  it('rejects with NOT_ENABLED for an unregistered merchant identifier', async () => {
    const userId = await createUser(`${runId}-unregistered`);
    const sdk = await createSdk(userId, plugin, 'merchant.com.pushcash.unregistered');

    await expect(
      sdk.display({ amount: 1500, currency: 'USD', onAuthorize: onAuthorizeVia(1500) }),
    ).rejects.toMatchObject({ code: 'NOT_ENABLED' });
    expect(plugin.presentedWith).toBeNull();
  });
});

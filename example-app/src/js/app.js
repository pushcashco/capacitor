import { PushApplePay, PushApplePayNative } from '@pushcash/capacitor';

import config from './dev-config.js';

const logEl = document.getElementById('log');
function log(line) {
  console.log(`[example] ${line}`);
  logEl.textContent += `\n${line}`;
}

// The in-app operator stub: what the operator's backend does in production.
async function operator(path, body) {
  const response = await fetch(`${config.apiBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} failed (${response.status}): ${text}`);
  }
  return { status: response.status, json };
}

async function createUser() {
  const runId = Date.now().toString(36);
  const { status, json } = await operator('/user', {
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
  if (status !== 200 || !json.id) {
    throw new Error(`user create failed (${status})`);
  }
  return json.id;
}

// Simulator payments are placeholders end to end: empty paymentData (which
// the SDK rejects before ever calling Basis Theory), displayName "Simulated
// Instrument" (no trailing last-4 for the mint to derive from), card type
// "unknown", and a constant transactionIdentifier (which would collide with
// mint idempotency). This wrapper presents the real sheet but substitutes a
// realistic payment so the flow can proceed.
const plugin = config.interceptBasisTheory
  ? {
      canMakePayments: () => PushApplePayNative.canMakePayments(),
      presentSheet: async (options) => {
        const payment = await PushApplePayNative.presentSheet(options);
        if (!payment.paymentData) {
          log('simulator shim: substituting placeholder payment fields');
          payment.paymentData = btoa('{"simulator":true}');
          payment.displayName = 'Visa 1234';
          payment.network = 'Visa';
          payment.type = 'debit';
          payment.transactionIdentifier = `sim-txn-${Date.now().toString(36)}`;
        }
        return payment;
      },
      completeSheet: (options) => PushApplePayNative.completeSheet(options),
    }
  : PushApplePayNative;

// Simulator payments carry empty paymentData, so the Basis Theory call is
// stubbed with fixture vault references the local backend accepts.
if (config.interceptBasisTheory) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (String(input).includes('basistheory.com/apple-pay')) {
      log('BT intercept: returning fixture vault references');
      return new Response(
        JSON.stringify({
          apple_pay: {
            id: `bt-sim-${Date.now().toString(36)}`,
            fingerprint: 'fp-simulator',
            card: { bin: config.fixtureBin },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  };
}

async function pay(amount) {
  log(`— pay ${amount}¢ —`);
  const userId = await createUser();
  log(`user ${userId}`);

  const { status, json } = await operator(`/user/${userId}/url`, { type: 'apple_pay', direction: 'cash_in' });
  if (status !== 200) {
    throw new Error(`widget url failed (${status})`);
  }
  log(`widget url ok (nonce ${new URL(json.url).searchParams.get('nonce')})`);

  const sdk = new PushApplePay({ url: json.url, merchantIdentifier: config.merchantIdentifier }, plugin);

  const available = await sdk.canMakePayments();
  log(`canMakePayments: ${available}`);

  const result = await sdk.display({
    amount,
    currency: 'USD',
    onAuthorize: async (token) => {
      log(`minted ${token}; authorizing…`);
      const auth = await operator('/authorize', { amount, currency: 'USD', direction: 'cash_in', token });
      log(`authorize: HTTP ${auth.status} ${auth.json.status} ${auth.json.credential?.id ?? ''}`);
      return auth.json.status === 'approved' ? 'approved' : 'declined';
    },
    onComplete: (r) => log(`onComplete: ${r.status} ${r.token}`),
  });
  log(`display resolved: ${result.status}`);
  return result;
}

function payHandler(amount) {
  return () =>
    pay(amount).catch((error) => {
      log(`ERROR ${error.code ?? ''}: ${error.message}`);
    });
}

document.getElementById('pay').addEventListener('click', () => {
  payHandler(Number(document.getElementById('amount').value))();
});
document.getElementById('payDecline').addEventListener('click', payHandler(2200));

logEl.textContent = `ready (api ${config.apiBase}, merchant ${config.merchantIdentifier})`;

if (config.autoPayAmount) {
  log(`auto-pay in 2s: ${config.autoPayAmount}¢`);
  setTimeout(payHandler(config.autoPayAmount), 2000);
}

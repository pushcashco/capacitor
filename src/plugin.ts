import { registerPlugin } from '@capacitor/core';

import type { PushApplePayPlugin } from './definitions';

/**
 * The registered native plugin. Most integrations should use the PushApplePay
 * class instead, which owns the full payment flow.
 */
export const PushApplePayNative = registerPlugin<PushApplePayPlugin>('PushApplePay', {
  web: () => import('./web').then((m) => new m.PushApplePayWeb()),
});

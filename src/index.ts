import { registerPlugin } from '@capacitor/core';

import type { PushApplePayPlugin } from './definitions';

const PushApplePay = registerPlugin<PushApplePayPlugin>('PushApplePay', {
  web: () => import('./web').then((m) => new m.PushApplePayWeb()),
});

export * from './definitions';
export { PushApplePay };

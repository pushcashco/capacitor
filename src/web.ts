import { WebPlugin } from '@capacitor/core';

import type { PresentSheetOptions, PushApplePayPlugin, SerializedPayment, SheetStatus } from './definitions';

/**
 * Apple Pay requires native PassKit code; there is no web implementation.
 * Every method rejects with UNAVAILABLE.
 */
export class PushApplePayWeb extends WebPlugin implements PushApplePayPlugin {
  async canMakePayments(): Promise<{ available: boolean }> {
    throw this.unavailable('Apple Pay requires iOS.');
  }

  async presentSheet(_options: PresentSheetOptions): Promise<SerializedPayment> {
    throw this.unavailable('Apple Pay requires iOS.');
  }

  async completeSheet(_options: { status: SheetStatus }): Promise<void> {
    throw this.unavailable('Apple Pay requires iOS.');
  }
}

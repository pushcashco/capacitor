import { WebPlugin } from '@capacitor/core';

import type { PushApplePayPlugin } from './definitions';

export class PushApplePayWeb extends WebPlugin implements PushApplePayPlugin {
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }
}

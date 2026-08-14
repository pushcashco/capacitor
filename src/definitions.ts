export interface PushApplePayPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
}

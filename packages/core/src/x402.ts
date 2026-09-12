/** Minimal x402 (HTTP 402 Payment Required) types, following the Coinbase x402 v1 shape. */
export interface PaymentRequirements {
  scheme: 'exact';
  network: string;             // e.g. 'hsk-testnet'
  maxAmountRequired: string;   // in token base units (USDT 6 decimals)
  resource: string;
  description: string;
  mimeType: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  asset: `0x${string}`;
  extra?: Record<string, unknown>;
}
export interface PaymentRequiredBody {
  x402Version: 1;
  error: string;
  accepts: PaymentRequirements[];
}
/** What the buyer sends back in the X-PAYMENT header (base64 JSON). */
export interface PaymentPayload {
  x402Version: 1;
  scheme: 'exact';
  network: string;
  payload: { txHash: `0x${string}`; payer: `0x${string}` };
}
export const encodePayment = (p: PaymentPayload) => Buffer.from(JSON.stringify(p)).toString('base64');
export const decodePayment = (s: string): PaymentPayload => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

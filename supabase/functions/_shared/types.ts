// Shared contract between enqueue-print (producer) and the Pi printer client (consumer).
// A copy lives at src/types/print.ts for the web app; keep these in sync.

export type PrintFormat = 'list' | 'ticket' | 'daily' | 'custom';

export interface PrintLine {
  text: string;
  qty: string | null;
  checkbox: boolean;
}

export interface PrintPayload {
  format: PrintFormat;
  title: string;
  subtitle: string | null;
  lines: PrintLine[];
  qr: string | null;
  barcode: string | null;
  footer: string | null;
  cut: boolean;
}

export function line(
  text: string,
  opts: { qty?: string | null; checkbox?: boolean } = {},
): PrintLine {
  return { text, qty: opts.qty ?? null, checkbox: opts.checkbox ?? false };
}

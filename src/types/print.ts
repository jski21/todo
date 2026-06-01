// Mirror of supabase/functions/_shared/types.ts. Keep these in sync.
// This is the on-the-wire shape stored in print_jobs.payload (jsonb).

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

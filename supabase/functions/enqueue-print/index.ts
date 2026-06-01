// enqueue-print — build a render-agnostic payload and queue a print job.
// The Pi printer client polls/streams print_jobs and renders the payload;
// it never decides what to print.
//
//   Request shapes:
//     { "type": "shopping_list", "list_id": "uuid" }
//     { "type": "daily" }
//     { "type": "occurrence",    "occurrence_id": "uuid" }
//
//   Response: { "job_id": "uuid" }

// @ts-expect-error Deno-only import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { clientForRequest } from '../_shared/supabase.ts';
import { line, type PrintPayload } from '../_shared/types.ts';

// @ts-expect-error Deno global
const APP_URL = Deno.env.get('APP_URL') ?? '';

type ReqBody =
  | { type: 'shopping_list'; list_id: string }
  | { type: 'daily' }
  | { type: 'occurrence'; occurrence_id: string };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabase = clientForRequest(req);
  if (!supabase) return json({ error: 'unauthorized' }, 401);

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!body.type) return json({ error: 'type required' }, 400);

  let payload: PrintPayload;
  switch (body.type) {
    case 'shopping_list':
      payload = await buildShoppingList(supabase, body.list_id);
      break;
    case 'daily':
      payload = await buildDaily(supabase);
      break;
    case 'occurrence':
      payload = await buildOccurrence(supabase, body.occurrence_id);
      break;
    default:
      return json({ error: 'unknown type' }, 400);
  }

  const { data: job, error } = await supabase
    .from('print_jobs')
    .insert({ type: body.type, payload, status: 'queued' })
    .select('id')
    .single();
  if (error) return json({ error: error.message }, 400);
  return json({ job_id: job.id });
});

// ---- builders ------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildShoppingList(supabase: any, listId: string): Promise<PrintPayload> {
  const { data: list, error: lErr } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('id', listId)
    .maybeSingle();
  if (lErr || !list) throw new Error('list not found');

  const { data: items, error: iErr } = await supabase
    .from('shopping_list_items')
    .select('id, name, quantity, unit, product_id, sort_order, created_at')
    .eq('list_id', listId)
    .eq('checked', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  // Group by default_aisle when product_id is present and has one.
  const productIds = Array.from(
    new Set((items ?? []).map((it: { product_id: string | null }) => it.product_id).filter(Boolean)),
  ) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aisleByProduct: Map<string, string | null> = new Map();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, default_aisle')
      .in('id', productIds);
    aisleByProduct = new Map(
      (products ?? []).map((p: { id: string; default_aisle: string | null }) => [
        p.id,
        p.default_aisle,
      ]),
    );
  }

  const groups = new Map<string, typeof items>();
  for (const it of items ?? []) {
    const aisle = (it.product_id && aisleByProduct.get(it.product_id)) || '';
    if (!groups.has(aisle)) groups.set(aisle, []);
    groups.get(aisle)!.push(it);
  }
  // Sort: empty aisle last.
  const sortedAisles = [...groups.keys()].sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return a.localeCompare(b);
  });

  const lines = [];
  for (const aisle of sortedAisles) {
    if (aisle && sortedAisles.length > 1) {
      lines.push(line(aisle.toUpperCase(), { checkbox: false }));
    }
    for (const it of groups.get(aisle) ?? []) {
      const qty = Number(it.quantity);
      const qtyStr = it.unit ? `${qty} ${it.unit}` : qty === 1 ? null : String(qty);
      lines.push(line(it.name, { qty: qtyStr, checkbox: true }));
    }
  }

  return {
    format: 'list',
    title: list.name,
    subtitle: formatDate(new Date()),
    lines,
    qr: null,
    barcode: null,
    footer: lines.length === 0 ? 'No items' : null,
    cut: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDaily(supabase: any): Promise<PrintPayload> {
  // Resolve user timezone for today's date boundary.
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .maybeSingle();
  const tz = (profile?.timezone as string | undefined) ?? 'UTC';
  const todayKey = todayInZone(tz);

  const { data: occs, error } = await supabase
    .from('task_occurrences')
    .select('id, occurrence_date, scheduled_at, status, override_title, override_time, task:tasks(title, due_time)')
    .eq('occurrence_date', todayKey)
    .neq('status', 'skipped')
    .order('scheduled_at', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  const lines = (occs ?? []).map((o: {
    override_title: string | null;
    override_time: string | null;
    status: string;
    task: { title: string; due_time: string | null } | null;
  }) => {
    const title = o.override_title ?? o.task?.title ?? '(untitled)';
    const time = o.override_time ?? o.task?.due_time ?? null;
    const text = time ? `${formatTime12(time)}  ${title}` : title;
    return line(text, { checkbox: o.status !== 'done' });
  });

  return {
    format: 'daily',
    title: 'Today',
    subtitle: formatDate(new Date()),
    lines,
    qr: null,
    barcode: null,
    footer: lines.length === 0 ? 'Nothing scheduled' : null,
    cut: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildOccurrence(supabase: any, occurrenceId: string): Promise<PrintPayload> {
  const { data: occ, error } = await supabase
    .from('task_occurrences')
    .select('id, task_id, occurrence_date, override_title, override_time, task:tasks(title, notes, due_time)')
    .eq('id', occurrenceId)
    .maybeSingle();
  if (error || !occ) throw new Error('occurrence not found');

  // Mint a ticket so the printed QR can complete the task on scan.
  const { data: tokenRow, error: tErr } = await supabase.rpc('gen_ticket_token');
  if (tErr) throw new Error(tErr.message);
  const token = String(tokenRow);

  const { data: ticket, error: insErr } = await supabase
    .from('tickets')
    .insert({
      token,
      task_id: occ.task_id,
      occurrence_id: occ.id,
      kind: 'occurrence',
      printed_at: new Date().toISOString(),
    })
    .select('token')
    .single();
  if (insErr) throw new Error(insErr.message);

  const title = occ.override_title ?? occ.task?.title ?? '(untitled)';
  const time = occ.override_time ?? occ.task?.due_time ?? null;
  const subtitle = time
    ? `${formatDateShort(occ.occurrence_date)}  ${formatTime12(time)}`
    : formatDateShort(occ.occurrence_date);

  const lines = [];
  if (occ.task?.notes) lines.push(line(occ.task.notes));

  return {
    format: 'ticket',
    title,
    subtitle,
    lines,
    qr: APP_URL ? `${APP_URL.replace(/\/+$/, '')}/t/${ticket.token}` : ticket.token,
    barcode: null,
    footer: 'Scan to complete',
    cut: true,
  };
}

// ---- date helpers (Deno; no luxon to keep the function small) -----

function todayInZone(zone: string): string {
  const d = new Date();
  // Intl trick: render in the zone, parse back the YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime12(t: string): string {
  const [h, m] = t.split(':');
  const hour = Number(h);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${(m ?? '00').padStart(2, '0')}${ampm}`;
}

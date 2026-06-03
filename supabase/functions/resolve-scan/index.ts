// resolve-scan — turns a scanned string into a DB change.
//
//   Request:  { "code": string, "list_id"?: uuid | null }
//   Response: { action, message, item?, task?, barcode? }
//
// Routes in order:
//   1. Ticket token (URL like .../t/<token> or bare token) → complete the
//      linked task_occurrence; idempotent on repeat.
//   2. UPC-A/EAN-13/EAN-8 barcode → resolve product (cached, else Open Food
//      Facts), then add or increment a shopping_list_items row.
//   3. Otherwise → "unknown".
//
// Uses the caller's JWT for every DB op; RLS scopes by auth.uid().

// @ts-expect-error Deno-only import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { classifyAndValidate, extractTicketToken } from '../_shared/barcode.ts';
import { clientForRequest } from '../_shared/supabase.ts';

type Action =
  | 'completed_task'
  | 'added_item'
  | 'incremented_item'
  | 'needs_name'
  | 'unknown';

interface ScanResponse {
  action: Action;
  message: string;
  item?: unknown;
  task?: unknown;
  barcode?: string | null;
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  image_url?: string;
}
interface OffResponse {
  status: number; // 1 = found, 0 = not found
  product?: OffProduct;
}

async function lookupOpenFoodFacts(barcode: string): Promise<OffProduct | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'todo-app/1.0 (resolve-scan)' },
      },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as OffResponse;
    if (body.status !== 1 || !body.product) return null;
    const name = body.product.product_name?.trim();
    if (!name) return null;
    return body.product;
  } catch {
    return null;
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabase = clientForRequest(req);
  if (!supabase) return json({ error: 'unauthorized' }, 401);

  let body: { code?: string; list_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  const code = (body.code ?? '').trim();
  if (!code) return json({ error: 'code required' }, 400);

  // -- 1. Ticket -------------------------------------------------------
  const token = extractTicketToken(code);
  if (token) {
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (tErr) return json({ error: tErr.message }, 400);
    if (ticket) {
      let task_occurrence: unknown = null;
      if (ticket.occurrence_id) {
        // Idempotent: only set status=done + completed_at if not already done.
        const { data: occ } = await supabase
          .from('task_occurrences')
          .select('*')
          .eq('id', ticket.occurrence_id)
          .maybeSingle();
        if (occ && occ.status !== 'done') {
          const { data: updated, error: uErr } = await supabase
            .from('task_occurrences')
            .update({ status: 'done', completed_at: new Date().toISOString() })
            .eq('id', ticket.occurrence_id)
            .select()
            .single();
          if (uErr) return json({ error: uErr.message }, 400);
          task_occurrence = updated;
        } else {
          task_occurrence = occ;
        }
      }
      if (!ticket.completed_at) {
        await supabase
          .from('tickets')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', ticket.id);
      }
      const resp: ScanResponse = {
        action: 'completed_task',
        message: 'Task completed.',
        task: task_occurrence,
      };
      return json(resp);
    }
    // Token-shaped but no matching ticket → fall through to barcode/unknown.
  }

  // -- 2. Product barcode ---------------------------------------------
  const bc = classifyAndValidate(code);
  if (bc) {
    // Resolve the destination list: explicit list_id or profiles.default_shopping_list_id.
    let listId: string | null = body.list_id ?? null;
    if (!listId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('default_shopping_list_id')
        .maybeSingle();
      listId = (profile?.default_shopping_list_id as string | null) ?? null;
    }
    if (!listId) {
      return json({
        action: 'unknown',
        message: 'No shopping list selected (set a default in Settings).',
        barcode: bc.digits,
      } satisfies ScanResponse);
    }

    // Catalog lookup.
    const { data: existingProduct } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', bc.digits)
      .maybeSingle();

    let product = existingProduct;
    if (!product) {
      const off = await lookupOpenFoodFacts(bc.digits);
      if (!off) {
        return json({
          action: 'needs_name',
          message: 'Barcode not recognized. Add a name.',
          barcode: bc.digits,
        } satisfies ScanResponse);
      }
      const name = (off.product_name ?? '').trim();
      const { data: inserted, error: pErr } = await supabase
        .from('products')
        .insert({
          name,
          brand: off.brands?.split(',')[0]?.trim() ?? null,
          image_url: off.image_url ?? null,
          barcode: bc.digits,
        })
        .select()
        .single();
      // 23505 = unique conflict (someone else cached it concurrently or the same
      // name already exists in catalog).
      if (pErr && pErr.code === '23505') {
        const { data: re } = await supabase
          .from('products')
          .select('*')
          .or(`barcode.eq.${bc.digits},name.ilike.${escapeLike(name)}`)
          .limit(1)
          .maybeSingle();
        product = re ?? null;
      } else if (pErr) {
        return json({ error: pErr.message }, 400);
      } else {
        product = inserted;
      }
    }
    if (!product) return json({ error: 'failed to resolve product' }, 500);

    // Bump quantity if an unchecked matching item is already on the list.
    const { data: dupes } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId)
      .eq('checked', false)
      .or(`product_id.eq.${product.id},name.ilike.${escapeLike(product.name)}`);
    const dupe = (dupes ?? [])[0];
    if (dupe) {
      const { data: updated, error: uErr } = await supabase
        .from('shopping_list_items')
        .update({ quantity: Number(dupe.quantity) + 1 })
        .eq('id', dupe.id)
        .select()
        .single();
      if (uErr) return json({ error: uErr.message }, 400);
      return json({
        action: 'incremented_item',
        message: `Bumped "${product.name}" to ${updated.quantity}.`,
        item: updated,
        barcode: bc.digits,
      } satisfies ScanResponse);
    }

    const { data: item, error: iErr } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        product_id: product.id,
        name: product.name,
        quantity: 1,
        added_via: 'scan',
      })
      .select()
      .single();
    if (iErr) return json({ error: iErr.message }, 400);
    return json({
      action: 'added_item',
      message: `Added "${product.name}".`,
      item,
      barcode: bc.digits,
    } satisfies ScanResponse);
  }

  // -- 3. Unknown ------------------------------------------------------
  return json({
    action: 'unknown',
    message: 'Not a known ticket or product barcode.',
  } satisfies ScanResponse);
});

// Make corsHeaders considered "used" for module-side-effect purity; the
// import order matters even if not directly referenced here.
void corsHeaders;

-- Shopping lists (v1.1). Additive only — no changes to existing tables.
-- Same RLS pattern as the rest of the app: user_id default auth.uid(),
-- all CRUD scoped to user_id = auth.uid().

-- products: personal catalog; learns from manual adds so staples re-add fast.
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  brand         text,
  barcode       text,          -- nullable; forward-compat for v2 scanning (unused now)
  image_url     text,          -- nullable; forward-compat (unused now)
  default_aisle text,          -- nullable; forward-compat for v2 aisle-sorting (unused now)
  created_at    timestamptz not null default now()
);
create unique index if not exists products_user_name_idx on products (user_id, lower(name));
create unique index if not exists products_user_barcode_idx
  on products (user_id, barcode) where barcode is not null;

alter table products enable row level security;
create policy "products_select_own" on products for select using (user_id = auth.uid());
create policy "products_insert_own" on products for insert with check (user_id = auth.uid());
create policy "products_update_own" on products for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "products_delete_own" on products for delete using (user_id = auth.uid());

-- shopping_lists
create table if not exists shopping_lists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists shopping_lists_user_idx on shopping_lists (user_id);

alter table shopping_lists enable row level security;
create policy "shopping_lists_select_own" on shopping_lists for select using (user_id = auth.uid());
create policy "shopping_lists_insert_own" on shopping_lists for insert with check (user_id = auth.uid());
create policy "shopping_lists_update_own" on shopping_lists for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shopping_lists_delete_own" on shopping_lists for delete using (user_id = auth.uid());

-- shopping_list_items
create table if not exists shopping_list_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id     uuid not null references shopping_lists(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,  -- null for free-text items
  name        text not null,                                    -- denormalized for stable display
  quantity    numeric not null default 1,
  unit        text,
  checked     boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists shopping_list_items_list_idx on shopping_list_items (list_id);
create index if not exists shopping_list_items_user_idx on shopping_list_items (user_id);

alter table shopping_list_items enable row level security;
create policy "shopping_list_items_select_own" on shopping_list_items for select using (user_id = auth.uid());
create policy "shopping_list_items_insert_own" on shopping_list_items for insert with check (user_id = auth.uid());
create policy "shopping_list_items_update_own" on shopping_list_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shopping_list_items_delete_own" on shopping_list_items for delete using (user_id = auth.uid());

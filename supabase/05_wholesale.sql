-- DF Elements shop: Phase 2, wholesale
-- Run this whole file once in the Supabase SQL Editor (after files 01 to 04).

-- ============ TABLES ============

create table public.wholesale_clients (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  business_type text not null default '',
  vat_number text not null default '',
  street text not null default '',
  suburb text not null default '',
  city text not null default '',
  postal_code text not null default '',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined','suspended')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Trade prices live in their own table so only approved clients and staff can see them
create table public.wholesale_prices (
  product_id bigint primary key references public.products(id) on delete cascade,
  price numeric(10,2) not null check (price > 0)
);
insert into public.wholesale_prices (product_id, price)
  select id, wholesale_price from public.products where wholesale_price is not null and wholesale_price > 0;
alter table public.products drop column wholesale_price;

create table public.branding_requests (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.wholesale_clients(id) on delete cascade,
  product_type text not null check (product_type in ('coaster','stand','board')),
  quantity int not null check (quantity > 0),
  notes text not null default '',
  logo_path text,
  status text not null default 'new' check (status in ('new','quoted','accepted','declined')),
  quote_notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.orders add column wholesale_client_id uuid references public.wholesale_clients(id) on delete set null;
alter table public.order_items add column from_stock_qty int not null default 0;
alter table public.order_items add constraint from_stock_within_qty check (from_stock_qty >= 0 and from_stock_qty <= qty);
alter table public.settings add column wholesale_free_delivery_from numeric(10,2) not null default 1500;

create sequence public.wholesale_order_no start 1001;
create index on public.orders (wholesale_client_id);
create index on public.branding_requests (client_id);

-- ============ HELPERS ============

create or replace function public.is_wholesale_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wholesale_clients where id = auth.uid() and status = 'approved');
$$;
grant execute on function public.is_wholesale_approved() to anon, authenticated;

-- Stamp the approval date
create or replace function public.wholesale_stamp_approved()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then new.approved_at := now(); end if;
  return new;
end $$;
create trigger wholesale_stamp_approved before update on public.wholesale_clients
  for each row execute function public.wholesale_stamp_approved();

-- ============ PLACE A WHOLESALE ORDER ============
-- Only approved clients. Prices come from the trade price list. Stock is not held back.
-- The system suggests "from stock" as whatever is on the shelf now; you can change it on the order.
create or replace function public.place_wholesale_order(p_order jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.wholesale_clients;
  item jsonb;
  v_order_id bigint;
  v_order_no text;
  v_sub numeric := 0;
  v_fee numeric := 0;
  v_del public.delivery_options;
  v_p public.products;
  v_price numeric;
  v_qty int;
  v_s public.settings;
begin
  select * into c from public.wholesale_clients where id = auth.uid();
  if not found or c.status <> 'approved' then raise exception 'Your wholesale account is not approved yet'; end if;
  if jsonb_array_length(coalesce(p_order->'items','[]'::jsonb)) = 0 then raise exception 'Your order is empty'; end if;
  if coalesce(trim(c.street),'') = '' or coalesce(trim(c.city),'') = '' then
    raise exception 'Please ask us to add your delivery address to your account first';
  end if;
  select * into v_del from public.delivery_options where id = (p_order->>'delivery_option_id')::bigint and is_active;
  if not found then raise exception 'Please choose a delivery option'; end if;
  select * into v_s from public.settings where id = 1;

  v_order_no := 'WS' || nextval('public.wholesale_order_no');
  insert into public.orders (order_no, channel, wholesale_client_id, first_name, last_name, email, phone,
      street, suburb, city, postal_code, delivery_option_id, delivery_name, notes)
  values (v_order_no, 'wholesale', c.id, coalesce(nullif(c.contact_name,''), c.business_name), '', c.email, c.phone,
      c.street, c.suburb, c.city, c.postal_code, v_del.id, v_del.name, left(coalesce(p_order->>'notes',''), 1000))
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_order->'items') loop
    v_qty := coalesce((item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 5000 then raise exception 'Invalid quantity'; end if;
    select * into v_p from public.products where id = (item->>'product_id')::bigint and is_active and not is_custom;
    if not found then raise exception 'A design in your order is no longer available'; end if;
    select price into v_price from public.wholesale_prices where product_id = v_p.id;
    if v_price is null then raise exception '% does not have a trade price yet', v_p.name; end if;
    insert into public.order_items (order_id, product_id, name, sku, unit_price, qty, from_stock_qty)
    values (v_order_id, v_p.id, v_p.name || case when v_p.variant <> '' then ' · ' || v_p.variant else '' end,
            coalesce(v_p.sku,''), v_price, v_qty, least(greatest(v_p.stock, 0), v_qty));
    v_sub := v_sub + v_price * v_qty;
  end loop;

  v_fee := case when v_sub >= v_s.wholesale_free_delivery_from then 0 else v_del.rate end;
  update public.orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + v_fee,
    delivery_name = v_del.name || case when v_fee = 0 and v_del.rate > 0 then ' (free on orders of R' || trim(to_char(v_s.wholesale_free_delivery_from, 'FM999999')) || ' or more)' else '' end
  where id = v_order_id;

  return jsonb_build_object('order_no', v_order_no, 'order_id', v_order_id, 'subtotal', v_sub, 'delivery_fee', v_fee, 'total', v_sub + v_fee,
    'bank', jsonb_build_object('bank_name', v_s.bank_name, 'account_name', v_s.account_name,
                               'account_number', v_s.account_number, 'branch_code', v_s.branch_code));
end $$;
revoke all on function public.place_wholesale_order(jsonb) from public;
grant execute on function public.place_wholesale_order(jsonb) to authenticated;

-- ============ STOCK: take "from stock" pieces off when the order is packed ============
create or replace function public.wholesale_stock_on_pack()
returns trigger language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if new.channel = 'wholesale' and new.status = 'printed_packed' and old.status in ('awaiting_payment','paid') then
    for it in select product_id, from_stock_qty from public.order_items where order_id = new.id and from_stock_qty > 0 and product_id is not null loop
      update public.products set stock = greatest(0, stock - it.from_stock_qty) where id = it.product_id;
    end loop;
  end if;
  return new;
end $$;
create trigger wholesale_stock_on_pack after update of status on public.orders
  for each row execute function public.wholesale_stock_on_pack();

-- The stock / print split can only change before the order is packed
create or replace function public.lock_split_after_pack()
returns trigger language plpgsql as $$
declare v_status text;
begin
  if new.from_stock_qty is distinct from old.from_stock_qty then
    select status into v_status from public.orders where id = new.order_id;
    if v_status not in ('awaiting_payment','paid') then
      raise exception 'The stock and print split cannot change once the order is packed';
    end if;
  end if;
  return new;
end $$;
create trigger lock_split_after_pack before update on public.order_items
  for each row execute function public.lock_split_after_pack();

-- Cancel: retail puts its stock back as before; wholesale puts back only what was taken when packed
create or replace function public.cancel_order(p_order_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare it record; gi record; v_status text; v_channel text;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select status, channel into v_status, v_channel from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status = 'cancelled' then return; end if;
  if v_channel = 'wholesale' then
    if v_status in ('printed_packed','shipped','delivered') then
      for it in select product_id, from_stock_qty from public.order_items where order_id = p_order_id and from_stock_qty > 0 and product_id is not null loop
        update public.products set stock = stock + it.from_stock_qty where id = it.product_id;
      end loop;
    end if;
  else
    for it in select * from public.order_items where order_id = p_order_id loop
      if it.gift_set_id is not null then
        for gi in select product_id, qty from public.gift_set_items where gift_set_id = it.gift_set_id loop
          update public.products set stock = stock + gi.qty * it.qty where id = gi.product_id;
        end loop;
      elsif it.product_id is not null and not it.is_custom then
        update public.products set stock = stock + it.qty where id = it.product_id;
      end if;
    end loop;
  end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

-- ============ SECURITY RULES ============
alter table public.wholesale_clients enable row level security;
alter table public.wholesale_prices enable row level security;
alter table public.branding_requests enable row level security;

create policy "ws clients own read" on public.wholesale_clients for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "ws clients apply" on public.wholesale_clients for insert to authenticated
  with check (id = auth.uid() and status = 'pending' and approved_at is null and admin_notes = '');
create policy "ws clients staff update" on public.wholesale_clients for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "ws clients staff delete" on public.wholesale_clients for delete to authenticated using (public.is_staff());

create policy "ws prices read" on public.wholesale_prices for select to authenticated using (public.is_staff() or public.is_wholesale_approved());
create policy "ws prices staff" on public.wholesale_prices for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "branding own read" on public.branding_requests for select to authenticated using (client_id = auth.uid() or public.is_staff());
create policy "branding request" on public.branding_requests for insert to authenticated
  with check (client_id = auth.uid() and public.is_wholesale_approved() and status = 'new' and quote_notes = '');
create policy "branding staff update" on public.branding_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "orders wholesale own read" on public.orders for select to authenticated using (wholesale_client_id = auth.uid());
drop policy "order items read" on public.order_items;
create policy "order items read" on public.order_items for select to authenticated
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or o.wholesale_client_id = auth.uid())));
create policy "order items staff update" on public.order_items for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Logos for branding requests: a client uploads into their own folder, only they and staff can open them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wholesale-logos', 'wholesale-logos', false, 10485760, array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf'])
on conflict (id) do nothing;
create policy "ws logos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'wholesale-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ws logos read" on storage.objects for select to authenticated
  using (bucket_id = 'wholesale-logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

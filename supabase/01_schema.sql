-- DF Elements shop: database setup, part 1 of 3 (tables, security rules, functions)
-- Run this whole file once in the Supabase SQL Editor of the new DF Elements project.

-- ============ TABLES ============

create table public.themes (
  id bigint generated always as identity primary key,
  name text not null unique,
  subtitle text,
  description text,
  sort_order int not null default 0
);

create table public.products (
  id bigint generated always as identity primary key,
  sku text unique,
  name text not null,
  variant text not null default '',
  type text not null check (type in ('coaster','stand','board')),
  theme_id bigint references public.themes(id) on delete set null,
  short_description text not null default '',
  care text not null default '',
  material text not null default '',
  size text not null default '',
  price numeric(10,2),
  special_price numeric(10,2),
  special_ends timestamptz,
  wholesale_price numeric(10,2),
  stock int not null default 0,
  is_new boolean not null default false,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  needs_review boolean not null default false,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint special_below_price check (special_price is null or price is null or special_price < price)
);

create table public.gift_sets (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.gift_set_items (
  gift_set_id bigint not null references public.gift_sets(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  qty int not null default 1 check (qty > 0),
  primary key (gift_set_id, product_id)
);

create table public.delivery_options (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  rate numeric(10,2) not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  street text not null default '',
  suburb text not null default '',
  city text not null default '',
  postal_code text not null default '',
  created_at timestamptz not null default now()
);

create sequence public.retail_order_no start 1001;

create table public.orders (
  id bigint generated always as identity primary key,
  order_no text not null unique,
  channel text not null default 'retail' check (channel in ('retail','wholesale')),
  customer_id uuid references public.customers(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  street text not null,
  suburb text not null default '',
  city text not null,
  postal_code text not null default '',
  delivery_option_id bigint references public.delivery_options(id),
  delivery_name text not null default '',
  delivery_fee numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','paid','printed_packed','shipped','delivered','cancelled')),
  payment_method text not null default 'eft',
  paid_at timestamptz,
  tracking_number text,
  notes text not null default '',
  proof_approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  gift_set_id bigint references public.gift_sets(id) on delete set null,
  name text not null,
  sku text not null default '',
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0),
  is_custom boolean not null default false,
  custom_note text not null default '',
  custom_photo_path text
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'DF Elements',
  bank_name text not null default '',
  account_name text not null default 'DF Elements',
  account_number text not null default '',
  branch_code text not null default '',
  address text not null default '',
  email text not null default '',
  phone text not null default '',
  vat_number text not null default '',
  specials_end timestamptz
);
insert into public.settings (id) values (1);

create table public.staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text not null unique,
  role text not null default 'admin' check (role in ('admin','staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index on public.products (theme_id);
create index on public.orders (status);
create index on public.orders (customer_id);
create index on public.order_items (order_id);

-- ============ HELPER FUNCTIONS ============

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_users where id = auth.uid() and is_active);
$$;

-- Username login for staff: returns the email only for an active staff username
create or replace function public.get_email_for_username(p_username text)
returns text language sql stable security definer set search_path = public, auth as $$
  select u.email::text from public.staff_users s join auth.users u on u.id = s.id
  where lower(s.username) = lower(trim(p_username)) and s.is_active limit 1;
$$;

-- Price a product is sold at right now (special price while it is running)
create or replace function public.current_price(p public.products)
returns numeric language sql stable as $$
  select case when p.special_price is not null and (p.special_ends is null or p.special_ends > now())
              then p.special_price else p.price end;
$$;

-- Stamp paid_at when an order is marked paid
create or replace function public.orders_stamp_paid()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end $$;
create trigger orders_stamp_paid before update on public.orders
  for each row execute function public.orders_stamp_paid();

-- ============ PLACE ORDER (the only way orders are created) ============
-- Works out every price from the database, checks and reduces stock, and returns
-- the order number, totals and EFT details for the confirmation screen.
create or replace function public.place_order(p_order jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb := p_order->'customer';
  item jsonb;
  v_order_id bigint;
  v_order_no text;
  v_sub numeric := 0;
  v_fee numeric := 0;
  v_del public.delivery_options;
  v_p public.products;
  v_set public.gift_sets;
  v_qty int;
  v_unit numeric;
  v_cust uuid := null;
  v_s public.settings;
  gi record;
begin
  if coalesce(trim(c->>'first_name'),'') = '' or coalesce(trim(c->>'last_name'),'') = ''
     or coalesce(trim(c->>'email'),'') = '' or coalesce(trim(c->>'phone'),'') = ''
     or coalesce(trim(c->>'street'),'') = '' or coalesce(trim(c->>'city'),'') = '' then
    raise exception 'Please fill in all your details';
  end if;
  if jsonb_array_length(coalesce(p_order->'items','[]'::jsonb)) = 0 then
    raise exception 'Your cart is empty';
  end if;

  select * into v_del from public.delivery_options
   where id = (p_order->>'delivery_option_id')::bigint and is_active;
  if not found then raise exception 'Please choose a delivery option'; end if;
  v_fee := v_del.rate;

  if auth.uid() is not null and exists (select 1 from public.customers where id = auth.uid()) then
    v_cust := auth.uid();
  end if;

  v_order_no := 'DF' || nextval('public.retail_order_no');
  insert into public.orders (order_no, channel, customer_id, first_name, last_name, email, phone,
      street, suburb, city, postal_code, delivery_option_id, delivery_name, delivery_fee, notes)
  values (v_order_no, 'retail', v_cust, trim(c->>'first_name'), trim(c->>'last_name'), trim(c->>'email'),
      trim(c->>'phone'), trim(c->>'street'), coalesce(trim(c->>'suburb'),''), trim(c->>'city'),
      coalesce(trim(c->>'postal_code'),''), v_del.id, v_del.name, v_fee, left(coalesce(p_order->>'notes',''), 1000))
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_order->'items') loop
    v_qty := coalesce((item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 500 then raise exception 'Invalid quantity'; end if;

    if item ? 'gift_set_id' and item->>'gift_set_id' is not null then
      select * into v_set from public.gift_sets where id = (item->>'gift_set_id')::bigint and is_active;
      if not found then raise exception 'A gift set in your cart is no longer available'; end if;
      for gi in select g.qty as n, p.* from public.gift_set_items g join public.products p on p.id = g.product_id
                where g.gift_set_id = v_set.id for update of p loop
        if not gi.is_active or gi.stock < gi.n * v_qty then
          raise exception 'Sorry, % is sold out, so the % is not available right now', gi.name, v_set.name;
        end if;
        update public.products set stock = stock - gi.n * v_qty where id = gi.id;
      end loop;
      insert into public.order_items (order_id, gift_set_id, name, sku, unit_price, qty)
      values (v_order_id, v_set.id, v_set.name, 'SET' || v_set.id, v_set.price, v_qty);
      v_sub := v_sub + v_set.price * v_qty;
    else
      select * into v_p from public.products where id = (item->>'product_id')::bigint and is_active for update;
      if not found then raise exception 'A product in your cart is no longer available'; end if;
      v_unit := public.current_price(v_p);
      if v_unit is null then raise exception '% does not have a price yet', v_p.name; end if;
      if not v_p.is_custom then
        if v_p.stock < v_qty then
          raise exception 'Only % left of %', v_p.stock, v_p.name || case when v_p.variant <> '' then ' (' || v_p.variant || ')' else '' end;
        end if;
        update public.products set stock = stock - v_qty where id = v_p.id;
      end if;
      insert into public.order_items (order_id, product_id, name, sku, unit_price, qty, is_custom, custom_note, custom_photo_path)
      values (v_order_id, v_p.id, v_p.name || case when v_p.variant <> '' then ' · ' || v_p.variant else '' end,
              coalesce(v_p.sku,''), v_unit, v_qty, v_p.is_custom,
              case when v_p.is_custom then left(coalesce(item->>'custom_note',''), 60) else '' end,
              case when v_p.is_custom and coalesce(item->>'custom_photo_path','') like 'orders/%' then item->>'custom_photo_path' end);
      v_sub := v_sub + v_unit * v_qty;
    end if;
  end loop;

  update public.orders set subtotal = v_sub, total = v_sub + v_fee where id = v_order_id;
  select * into v_s from public.settings where id = 1;

  return jsonb_build_object(
    'order_no', v_order_no, 'subtotal', v_sub, 'delivery_fee', v_fee, 'total', v_sub + v_fee,
    'first_name', trim(c->>'first_name'), 'email', trim(c->>'email'),
    'has_custom', exists (select 1 from public.order_items where order_id = v_order_id and is_custom),
    'bank', jsonb_build_object('bank_name', v_s.bank_name, 'account_name', v_s.account_name,
                               'account_number', v_s.account_number, 'branch_code', v_s.branch_code));
end $$;

-- Cancel an order and put its stock back (staff only)
create or replace function public.cancel_order(p_order_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare it record; gi record; v_status text;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status = 'cancelled' then return; end if;
  for it in select * from public.order_items where order_id = p_order_id loop
    if it.gift_set_id is not null then
      for gi in select product_id, qty from public.gift_set_items where gift_set_id = it.gift_set_id loop
        update public.products set stock = stock + gi.qty * it.qty where id = gi.product_id;
      end loop;
    elsif it.product_id is not null and not it.is_custom then
      update public.products set stock = stock + it.qty where id = it.product_id;
    end if;
  end loop;
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;
revoke all on function public.cancel_order(bigint) from public;
grant execute on function public.cancel_order(bigint) to authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- ============ SECURITY RULES (RLS) ============

alter table public.themes enable row level security;
alter table public.products enable row level security;
alter table public.gift_sets enable row level security;
alter table public.gift_set_items enable row level security;
alter table public.delivery_options enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.settings enable row level security;
alter table public.staff_users enable row level security;

-- Shop catalogue: everyone can read what is active, staff manage everything
create policy "themes read" on public.themes for select using (true);
create policy "themes staff" on public.themes for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "products read active" on public.products for select using (is_active or public.is_staff());
create policy "products staff" on public.products for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "sets read active" on public.gift_sets for select using (is_active or public.is_staff());
create policy "sets staff" on public.gift_sets for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "set items read" on public.gift_set_items for select using (true);
create policy "set items staff" on public.gift_set_items for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "delivery read" on public.delivery_options for select using (is_active or public.is_staff());
create policy "delivery staff" on public.delivery_options for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Settings: readable (bank details are shown to customers for EFT), only staff can change
create policy "settings read" on public.settings for select using (true);
create policy "settings staff" on public.settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Customers: each customer sees and edits only their own row; staff see all
create policy "customer own read" on public.customers for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "customer own insert" on public.customers for insert to authenticated with check (id = auth.uid());
create policy "customer own update" on public.customers for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Orders: customers read their own; staff read and update all. Orders are only created by place_order.
create policy "orders own read" on public.orders for select to authenticated using (customer_id = auth.uid() or public.is_staff());
create policy "orders staff update" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "order items read" on public.order_items for select to authenticated
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

-- Staff table: staff can see the staff list; changes are made in the SQL editor for now
create policy "staff read" on public.staff_users for select to authenticated using (public.is_staff() or id = auth.uid());

-- ============ FILE STORAGE ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('custom-uploads', 'custom-uploads', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do nothing;

-- Product images: anyone can view, only staff can upload or change
create policy "product images staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());
create policy "product images staff update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
create policy "product images staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());

-- Customer photos for custom orders: anyone can upload into orders/, only staff can open them
create policy "custom uploads insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'custom-uploads' and (storage.foldername(name))[1] = 'orders');
create policy "custom uploads staff read" on storage.objects for select to authenticated
  using (bucket_id = 'custom-uploads' and public.is_staff());

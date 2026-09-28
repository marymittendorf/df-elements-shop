-- DF Elements: product types, made to order items and the new price list
-- Run once in the Supabase SQL Editor, after 06_qa_reports_expenses.sql.

-- ============ PRODUCT TYPES ============
create table public.product_types (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  blurb text not null default '',
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true
);
alter table public.product_types enable row level security;
create policy "types read" on public.product_types for select using (is_active or public.is_staff());
create policy "types staff" on public.product_types for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.product_types (key, label, blurb, image_url, sort_order) values
('coaster', 'Coasters', 'Square MDF coasters, UV printed edge to edge. Buy singles or save with a gift set.', '/products/c_d01.webp', 1),
('stand', 'Phone stands', 'Two piece MDF phone stands that hold your phone upright on a desk or bedside table.', '/products/s_born.webp', 2),
('board', 'Decor boards', 'Printed MDF boards for walls, shelves and gifting, from A4 to A3.', null, 3),
('home', 'Home and kitchen', 'Wooden doors, lanterns, napkin holders and more for around the house.', null, 4),
('gifts', 'Gifts and keepsakes', 'Key rings, magnets, bookmarks, puzzles and other small gifts.', null, 5);

-- products and branding requests now use the types table instead of a fixed list
alter table public.products drop constraint if exists products_type_check;
alter table public.products add constraint products_type_fk foreign key (type) references public.product_types(key) on update cascade;
alter table public.branding_requests drop constraint if exists branding_requests_product_type_check;
alter table public.branding_requests add constraint branding_requests_type_fk foreign key (product_type) references public.product_types(key) on update cascade;

-- ============ MADE TO ORDER ============
-- Made to order items are never sold out and their stock is not counted.
alter table public.products add column made_to_order boolean not null default false;

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
        if not gi.is_active or (not gi.made_to_order and gi.stock < gi.n * v_qty) then
          raise exception 'Sorry, % is sold out, so the % is not available right now', gi.name, v_set.name;
        end if;
        update public.products set stock = stock - gi.n * v_qty where id = gi.id and not made_to_order;
      end loop;
      insert into public.order_items (order_id, gift_set_id, name, sku, unit_price, qty)
      values (v_order_id, v_set.id, v_set.name, 'SET' || v_set.id, v_set.price, v_qty);
      v_sub := v_sub + v_set.price * v_qty;
    else
      select * into v_p from public.products where id = (item->>'product_id')::bigint and is_active for update;
      if not found then raise exception 'A product in your cart is no longer available'; end if;
      v_unit := public.current_price(v_p);
      if v_unit is null then raise exception '% does not have a price yet', v_p.name; end if;
      if not v_p.is_custom and not v_p.made_to_order then
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
          update public.products set stock = stock + gi.qty * it.qty where id = gi.product_id and not made_to_order;
        end loop;
      elsif it.product_id is not null and not it.is_custom then
        update public.products set stock = stock + it.qty where id = it.product_id and not made_to_order;
      end if;
    end loop;
  end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

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
            coalesce(v_p.sku,''), v_price, v_qty, case when v_p.made_to_order then 0 else least(greatest(v_p.stock, 0), v_qty) end);
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

-- ============ NEW PRICE LIST ============
-- Coasters R12 (trade R7), phone stands R25 (trade R14,50). Custom items cost the same. Specials are cleared.
update public.products set price = 12, special_price = null, special_ends = null where type = 'coaster';
update public.products set price = 25, special_price = null, special_ends = null, cost_price = 4.10 where type = 'stand';
insert into public.wholesale_prices (product_id, price)
select id, case when type = 'coaster' then 7 else 14.5 end from public.products where type in ('coaster','stand') and not is_custom
on conflict (product_id) do update set price = excluded.price;

-- New products (made to order, marked "check the name" so you can review them)
insert into public.products (sku, name, variant, type, price, made_to_order, is_new, needs_review, material, care, sort_order) values
('BRD001', 'Decor board', 'A4', 'board', 38, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 501),
('BRD002', 'Decor board', 'A3', 'board', 56, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 502),
('BRD003', 'Decor board', '300 x 300', 'board', 50, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 503),
('BRD004', 'Blessings board', '', 'board', 120, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 504),
('BRD005', 'Hanging board', '', 'board', 75, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 505),
('BRD006', 'Father''s Day board', '', 'board', 50, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 506),
('HOM001', 'Little wooden door', '', 'home', 110, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 501),
('HOM002', 'Hooked branch', '', 'home', 110, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 502),
('HOM003', 'Curtain tiebacks', '', 'home', 65, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 503),
('HOM004', 'Napkin holder', '', 'home', 65, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 504),
('HOM005', 'Lantern', 'For a tea candle', 'home', 85, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 505),
('HOM006', 'Lantern', 'With a light bulb', 'home', 250, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 506),
('HOM007', 'Wooden box', 'Small', 'home', 50, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 507),
('GFT001', 'Key ring', '', 'gifts', 15, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 501),
('GFT002', 'Bunting flag', '', 'gifts', 25, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 502),
('GFT003', 'Magnet', '', 'gifts', 40, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 503),
('GFT004', 'Ruler', '', 'gifts', 18, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 504),
('GFT005', 'Door hanger', '', 'gifts', 25, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 505),
('GFT006', 'Bookmark', '', 'gifts', 10, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 506),
('GFT007', 'Buttons', 'Pack of 6', 'gifts', 10, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 507),
('GFT008', 'Puzzle', '', 'gifts', 30, true, true, true, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 508);

insert into public.wholesale_prices (product_id, price)
select p.id, t.price from (values
('BRD001', 21.5),
('BRD002', 36),
('BRD003', 29),
('BRD004', 78),
('BRD005', 42),
('HOM001', 66),
('HOM002', 72),
('HOM003', 36),
('HOM004', 42),
('GFT001', 8.5),
('GFT002', 14.5),
('GFT003', 24),
('GFT004', 11),
('GFT005', 14.5),
('GFT006', 8.5),
('GFT007', 4)
) as t(sku, price) join public.products p on p.sku = t.sku
on conflict (product_id) do update set price = excluded.price;

-- ============ PHONE STANDS FROM THE NEW DESIGN SHEET ============
-- Names now match the artwork
update public.products set name = 'Send Me Golfing', needs_review = true where sku = 'STD030';
update public.products set name = 'This Is How We Roll', variant = 'Tee', needs_review = true where sku = 'STD032';

-- New designs: made to order until you have stock, marked "check the name"
insert into public.products (sku, name, variant, type, theme_id, price, cost_price, made_to_order, is_new, needs_review, image_url, material, care, sort_order,
  short_description) values
('STDN01', 'Hello Summer', '', 'stand', null, 25, 4.10, true, true, true, '/products/s_summer.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 400, 'Bright summer lollies on the stand, with The beach is calling on the base.'),
('STDN02', 'Do More of What Makes You Happy', '', 'stand', null, 25, 4.10, true, true, true, '/products/s_happy.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 401, 'Colourful flowers and a happy reminder.'),
('STDN03', 'Today''s Reminders', '', 'stand', null, 25, 4.10, true, true, true, '/products/s_reminders.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 402, 'A cheeky list of reminders for the day. You got this!'),
('STDN04', 'Seek Magic Every Day', '', 'stand', null, 25, 4.10, true, true, true, '/products/s_magic.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 403, 'A glowing tree of life in rainbow colours.'),
('STDN05', 'God Is Good All the Time', '', 'stand', null, 25, 4.10, true, true, true, '/products/s_god.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 404, 'A heart and cross, with Trust. Faith. Believe. on the base.'),
('STDN06', 'This Is How We Roll', 'Putting green', 'stand', (select id from public.themes where name = 'Golf'), 25, 4.10, true, true, true, '/products/s_roll2.webp', 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', 405, 'For the golfer who rolls in style.');

insert into public.wholesale_prices (product_id, price)
select id, 14.5 from public.products where sku like 'STDN%'
on conflict (product_id) do update set price = excluded.price;

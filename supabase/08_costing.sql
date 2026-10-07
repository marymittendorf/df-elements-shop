-- DF Elements: costing per item
-- Run once in the Supabase SQL Editor, after 07_product_types_prices.sql.

-- Your running costs (one row). Figures marked estimate can be changed on the Costing page.
create table public.costing_settings (
  id int primary key default 1 check (id = 1),
  board_price numeric(10,2) not null default 281.75,
  sheets_per_board int not null default 4 check (sheets_per_board > 0),
  sheet_w_mm numeric(8,1) not null default 920,
  sheet_h_mm numeric(8,1) not null default 680,
  gap_mm numeric(5,1) not null default 0,
  ink_price_litre numeric(10,2) not null default 1000,
  ink_ml_m2 numeric(8,1) not null default 60,
  ink_waste_pct numeric(5,1) not null default 15,
  laser_watts int not null default 2000,
  power_rate numeric(6,2) not null default 4.00,
  tube_price numeric(10,2) not null default 15000,
  tube_hours int not null default 8000 check (tube_hours > 0),
  courier_box numeric(10,2) not null default 328,
  courier_small numeric(10,2) not null default 110,
  updated_at timestamptz not null default now()
);
insert into public.costing_settings (id) values (1);

-- One costing card per kind of item
create table public.cost_items (
  id bigint generated always as identity primary key,
  name text not null,
  width_mm numeric(8,1),
  height_mm numeric(8,1),
  pieces_override int check (pieces_override is null or pieces_override > 0),
  print_cm2_override numeric(8,1) check (print_cm2_override is null or print_cm2_override >= 0),
  cut_minutes numeric(6,1) not null default 15 check (cut_minutes >= 0),
  packaging_each numeric(10,2) not null default 0,
  extras_each numeric(10,2) not null default 0,
  notes text not null default '',
  sort_order int not null default 0
);

alter table public.products add column cost_item_id bigint references public.cost_items(id) on delete set null;

alter table public.costing_settings enable row level security;
alter table public.cost_items enable row level security;
create policy "costing settings staff" on public.costing_settings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "cost items staff" on public.cost_items for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.cost_items (name, width_mm, height_mm, pieces_override, print_cm2_override, notes, sort_order) values
('Coaster', 100, 100, null, null, '', 1),
('Phone stand', null, null, 23, 251, 'Stand and base together. 23 per sheet.', 2),
('A4 board', 210, 297, null, null, '', 3),
('A3 board', 297, 420, null, null, '', 4),
('Board 300 x 300', 300, 300, null, null, '', 5),
('Hanging board 210 x 250', 210, 250, null, null, '', 6),
('Hanging board 280 x 180', 280, 180, null, null, '', 7),
('Door hanger', 229.9, 83.1, 26, null, 'Shaped, so 26 per sheet.', 8);

-- Link the products we already know
update public.products set cost_item_id = (select id from public.cost_items where name = 'Coaster') where type = 'coaster';
update public.products set cost_item_id = (select id from public.cost_items where name = 'Phone stand') where type = 'stand';
update public.products set cost_item_id = (select id from public.cost_items where name = 'A4 board') where sku = 'BRD001';
update public.products set cost_item_id = (select id from public.cost_items where name = 'A3 board') where sku = 'BRD002';
update public.products set cost_item_id = (select id from public.cost_items where name = 'Board 300 x 300') where sku = 'BRD003';
update public.products set cost_item_id = (select id from public.cost_items where name = 'Hanging board 210 x 250') where sku = 'BRD005';
update public.products set cost_item_id = (select id from public.cost_items where name = 'Door hanger') where sku = 'GFT005';

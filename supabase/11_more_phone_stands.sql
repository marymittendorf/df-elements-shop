-- DF Elements: five more phone stand designs
-- Run once in the Supabase SQL Editor, after 10_door_hanger_photo_fix.sql.

insert into public.products (sku, name, variant, type, theme_id, price, cost_price, made_to_order, is_new, needs_review, image_url, material, care, sort_order, short_description, cost_item_id)
select v.sku, v.name, '', 'stand', (select id from public.themes where name = v.theme), 25, null, true, true, true, v.img,
       'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', v.sort, v.descr,
       (select id from public.cost_items where name = 'Phone stand')
from (values
  ('STDN07', 'Ek''s Nie Hardkoppig Nie', 'Plaas Humor', '/products/s_d1.webp', 406, 'Ek''s nie hardkoppig nie... jy''s net verkeerd. A grinning donkey in glasses.'),
  ('STDN08', 'Toe Raak Ek Moeg', 'Plaas Humor', '/products/s_d2.webp', 407, 'Ek het gedink.... toe raak ek moeg. A donkey taking it easy in the veld.'),
  ('STDN09', 'Lief Lag Leef', 'Karoo Hart', '/products/s_d3.webp', 408, 'Lief, lag, leef, with a windmill and birds on a warm orange background.'),
  ('STDN10', 'Plaas Lewe', 'Karoo Hart', '/products/s_d4.webp', 409, 'Plaas lewe: vars, vrolik en vol liefde. A windmill at sunset.'),
  ('STDN11', 'God se Wil', null, '/products/s_d5.webp', 410, 'God se wil, niks meer, niks minder. A golden sunset over the hills.')
) as v(sku, name, theme, img, sort, descr)
where not exists (select 1 from public.products p where p.sku = v.sku);

insert into public.wholesale_prices (product_id, price)
select id, 14.5 from public.products where sku in ('STDN07','STDN08','STDN09','STDN10','STDN11')
on conflict (product_id) do update set price = excluded.price;

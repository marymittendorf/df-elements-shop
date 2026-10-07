-- DF Elements: door hanger designs with photos
-- Run once in the Supabase SQL Editor, after 08_costing.sql.

-- The existing door hanger becomes the first design
update public.products
   set variant = 'Live Love Laugh', image_url = '/products/dh_1.webp', needs_review = true,
       short_description = 'Live Love Laugh in white on a golden floral background.'
 where sku = 'GFT005';

insert into public.products (sku, name, variant, type, price, made_to_order, is_new, needs_review, image_url, material, care, sort_order, short_description, cost_item_id)
select v.sku, 'Door hanger', v.variant, 'gifts', 25, true, true, true, v.img, 'MDF, UV printed.', 'Wipe clean with a soft damp cloth. Keep out of water.', v.sort, v.descr,
       (select id from public.cost_items where name = 'Door hanger')
from (values
  ('GFT009', 'God se Plan', '/products/dh_2.webp', 505, 'God se plan vir jou lewe is altyd groter en mooier as wat jy kan dink of droom. With pink proteas.'),
  ('GFT010', 'Blom soos Kosmos', '/products/dh_3.webp', 506, 'Blom soos kosmos, want ''n glimlag, vriendelikheid, omgee en liefde kos mos niks.')
) as v(sku, variant, img, sort, descr)
where not exists (select 1 from public.products p where p.sku = v.sku);

insert into public.wholesale_prices (product_id, price)
select id, 14.5 from public.products where sku in ('GFT009', 'GFT010')
on conflict (product_id) do update set price = excluded.price;

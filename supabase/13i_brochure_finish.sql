-- Brochure designs: link existing door hangers and add trade prices (run last)

-- Existing door hangers that are the same artwork as a brochure design
update public.products set design_id = (select id from public.designs where code = 'MOOI AFR_001'), format_key = 'door' where sku = 'GFT010';
update public.products set design_id = (select id from public.designs where code = 'PRET ENG_002'), format_key = 'door' where sku = 'GFT005';
update public.products set design_id = (select id from public.designs where code = 'PROTEA_010'), format_key = 'door' where sku = 'GFT009';

-- Trade prices for every new product
insert into public.wholesale_prices (product_id, price)
select p.id, f.trade_price from public.products p join public.formats f on f.key = p.format_key
where p.design_id is not null and f.trade_price is not null
  and not exists (select 1 from public.wholesale_prices w where w.product_id = p.id);

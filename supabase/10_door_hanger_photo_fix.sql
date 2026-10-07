-- The door hanger photos were uploaded to the public folder, not public/products
update public.products set image_url = '/dh_1.webp' where sku = 'GFT005';
update public.products set image_url = '/dh_2.webp' where sku = 'GFT009';
update public.products set image_url = '/dh_3.webp' where sku = 'GFT010';

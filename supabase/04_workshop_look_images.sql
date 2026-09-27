-- DF Elements shop: update for the Workshop Craft look
-- The product photos now have see-through backgrounds and end in .webp instead of .jpg.
-- Run this once in the Supabase SQL Editor after uploading the new files to GitHub.
-- Photos you uploaded yourself in the admin are not touched.

update public.products
set image_url = replace(image_url, '.jpg', '.webp')
where image_url like '/products/%.jpg';

select count(*) as photos_updated from public.products where image_url like '/products/%.webp';

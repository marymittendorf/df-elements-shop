-- DF Elements: Faith and Blessings, and Inspiration themes
-- Run once in the Supabase SQL Editor.

-- Your "Religion" theme becomes Faith and Blessings
update public.themes
   set name = 'Faith and Blessings', subtitle = 'Geloof en seën',
       description = 'Uplifting words of faith, hope and love, in Afrikaans and English.'
 where name = 'Religion';

-- In case the Religion theme was not there, add it
insert into public.themes (name, subtitle, description, sort_order)
select 'Faith and Blessings', 'Geloof en seën', 'Uplifting words of faith, hope and love, in Afrikaans and English.', 20
where not exists (select 1 from public.themes where name = 'Faith and Blessings');

insert into public.themes (name, subtitle, description, sort_order)
select 'Inspiration', 'Happy thoughts', 'Bright reminders to live, love and do more of what makes you happy.', 21
where not exists (select 1 from public.themes where name = 'Inspiration');

-- Faith and Blessings
update public.products set theme_id = (select id from public.themes where name = 'Faith and Blessings')
 where sku in ('STDN05', 'STDN11', 'GFT009', 'BRD004');

-- Inspiration
update public.products set theme_id = (select id from public.themes where name = 'Inspiration')
 where sku in ('STDN02', 'STDN03', 'STDN04', 'GFT005', 'GFT010');

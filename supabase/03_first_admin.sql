-- DF Elements shop: database setup, part 3 of 3 (your admin login)
-- Step 1: In Supabase go to Authentication, then Users, then Add user, then Create new user.
--         Enter your email and a password, and tick Auto Confirm User.
-- Step 2: Replace YOUR EMAIL HERE below with that same email, then run this file.
--         You will sign in to the admin with the username mary (change it below if you prefer).

insert into public.staff_users (id, full_name, username, role)
select id, 'Mary Ann Mittendorf', 'mary', 'admin'
from auth.users where email = 'YOUR EMAIL HERE';

-- Check it worked: this should show one row
select username, role, is_active from public.staff_users;

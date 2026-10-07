-- Safety check: stops straight away if this is not the DF Elements database
do $$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.expense_categories') is null
     or to_regclass('public.designs') is null then
    raise exception 'STOP: This is not the DF Elements database. Switch to the DF Elements project at the top of Supabase and run this again.';
  end if;
end $$;

-- DF Elements: supplier list that remembers whether each supplier charges VAT
-- Run once in the Supabase SQL Editor, after 14_donkey_and_farm_boards.sql.

create table public.suppliers (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  charges_vat boolean not null default true,
  created_at timestamptz not null default now()
);

-- One supplier per name, ignoring capital letters ("Davidson Board" and "davidson board" are the same)
create unique index suppliers_name_lower on public.suppliers (lower(trim(name)));

alter table public.suppliers enable row level security;
create policy "suppliers staff" on public.suppliers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Start the list from the suppliers already used on expenses and recurring expenses.
-- A supplier charges VAT if any of their past expenses had VAT on it.
with used as (
  select trim(supplier) as name, vat_amount from public.expenses
  union all
  select trim(supplier), vat_amount from public.recurring_expenses
)
insert into public.suppliers (name, charges_vat)
select distinct on (lower(name)) name,
       (select bool_or(u2.vat_amount > 0) from used u2 where lower(u2.name) = lower(used.name))
from used
where name <> ''
order by lower(name), name
on conflict do nothing;

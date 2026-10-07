-- Safety check: stops straight away if this is not the DF Elements database
do $$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.expense_categories') is null
     or to_regclass('public.designs') is null then
    raise exception 'STOP: This is not the DF Elements database. Switch to the DF Elements project at the top of Supabase and run this again.';
  end if;
end $$;

-- DF Elements: bank and petty cash balances
-- Run once in the Supabase SQL Editor, after 15_suppliers.sql.
-- Run it before you record anything new, because TymeBank starts at R1 225,36 from the moment this runs.

-- ============ ACCOUNTS ============
-- Each account starts with a balance at a moment in time. Only money recorded after that moment changes it.
create table public.money_accounts (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'bank' check (kind in ('bank','cash')),
  opening_balance numeric(12,2) not null default 0,
  opening_at timestamptz not null default now(),
  receives_sales boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index money_accounts_name_lower on public.money_accounts (lower(trim(name)));
-- Only one account receives the money from paid shop orders
create unique index money_accounts_one_sales on public.money_accounts (receives_sales) where receives_sales;

insert into public.money_accounts (name, kind, opening_balance, receives_sales, sort_order) values
('TymeBank', 'bank', 1225.36, true, 1),
('Petty cash', 'cash', 0, false, 2);

-- ============ MONEY MOVED BY HAND ============
-- transfer: from one account to another (for example topping up petty cash)
-- money_in / money_out: money that is not a shop order or an expense (for example you put money in, or take some out)
-- adjustment: a correction after checking against the bank statement or counting the cash
create table public.account_movements (
  id bigint generated always as identity primary key,
  moved_on date not null default current_date,
  kind text not null check (kind in ('transfer','money_in','money_out','adjustment')),
  from_account_id bigint references public.money_accounts(id) on delete cascade,
  to_account_id bigint references public.money_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (from_account_id is not null or to_account_id is not null),
  check (kind <> 'transfer' or (from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id))
);
create index on public.account_movements (from_account_id);
create index on public.account_movements (to_account_id);

-- ============ WHICH ACCOUNT PAID EACH EXPENSE ============
alter table public.expenses add column account_id bigint references public.money_accounts(id) on delete set null;
create index on public.expenses (account_id);

-- Cash comes out of petty cash, everything else out of the bank.
-- Used when no account is chosen (for example monthly expenses added automatically),
-- and when "Paid by" is changed on an expense without choosing a new account.
create or replace function public.expenses_pick_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is null
     or (tg_op = 'UPDATE' and new.paid_by is distinct from old.paid_by and new.account_id is not distinct from old.account_id) then
    select id into new.account_id from public.money_accounts
     where is_active and kind = case when new.paid_by = 'cash' then 'cash' else 'bank' end
     order by receives_sales desc, sort_order, id limit 1;
  end if;
  return new;
end $$;
create trigger expenses_pick_account before insert or update on public.expenses
  for each row execute function public.expenses_pick_account();

-- Fill in the account on expenses already recorded. They were paid before the starting balances,
-- so they do not change the balances.
update public.expenses set account_id = null where account_id is null;

-- ============ SECURITY ============
alter table public.money_accounts enable row level security;
alter table public.account_movements enable row level security;
create policy "money accounts staff" on public.money_accounts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "account movements staff" on public.account_movements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

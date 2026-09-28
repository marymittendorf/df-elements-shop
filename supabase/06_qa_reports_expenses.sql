-- DF Elements: Q&A page, VAT, cost prices, expenses and reports
-- Run once in the Supabase SQL Editor, after 05_wholesale.sql.

-- ============ Q&A ============
create table public.faqs (
  id bigint generated always as identity primary key,
  question text not null,
  answer text not null default '',
  group_name text not null default 'Ordering',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.faqs enable row level security;
create policy "faqs read" on public.faqs for select using (is_active or public.is_staff());
create policy "faqs staff" on public.faqs for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.faqs (group_name, sort_order, question, answer) values
('Ordering', 1, 'How do I pay?', 'We accept EFT only. After you order you will see our bank details and your order number. Please use your order number as the payment reference so we can match your payment quickly.'),
('Ordering', 2, 'How long do I have to pay?', 'Please pay within 3 working days. We start printing once your payment shows in our account.'),
('Ordering', 3, 'Can I change or cancel my order?', 'Yes, as long as we have not started printing. Contact us with your order number and we will help.'),
('Delivery', 1, 'How long does delivery take?', 'Please allow up to 2 weeks from the day your payment reflects in our account. That includes printing, packing and courier delivery.'),
('Delivery', 2, 'Which delivery options do you offer?', 'You can choose door to door courier, express courier or collection from a PUDO locker. The prices are shown at checkout.'),
('Custom photos', 1, 'What kind of photo works best?', 'A clear, well lit photo taken on a phone is perfect. Try to avoid screenshots and very dark or blurry pictures.'),
('Custom photos', 2, 'Will I see my design before it is printed?', 'Yes. For custom orders we send you a proof to approve before we print.'),
('Wholesale', 1, 'Do you sell to shops and businesses?', 'Yes. Apply for a wholesale account on our Wholesale page. Once approved you can see trade prices and order directly.'),
('Wholesale', 2, 'Can you print our own logo?', 'Yes. Approved wholesale clients can send a branding request with their logo from the wholesale portal and we will send a quote.'),
('Care', 1, 'How do I look after my coasters and boards?', 'Wipe with a soft damp cloth and dry straight away. Do not soak them in water or put them in the dishwasher.');

-- ============ VAT ============
alter table public.settings
  add column vat_registered boolean not null default false,
  add column vat_rate numeric(5,2) not null default 15 check (vat_rate >= 0 and vat_rate < 100);

-- VAT is saved on each order when it is placed. Prices include VAT.
alter table public.orders
  add column vat_rate numeric(5,2) not null default 0,
  add column vat_amount numeric(10,2) generated always as (round(total * vat_rate / (100 + vat_rate), 2)) stored;

create or replace function public.orders_stamp_vat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select case when vat_registered then vat_rate else 0 end into new.vat_rate from public.settings where id = 1;
  new.vat_rate := coalesce(new.vat_rate, 0);
  return new;
end $$;
create trigger orders_stamp_vat before insert on public.orders
  for each row execute function public.orders_stamp_vat();

-- ============ COST PRICE ============
alter table public.products add column cost_price numeric(10,2) check (cost_price is null or cost_price >= 0);
alter table public.order_items add column unit_cost numeric(10,2);

-- Copy the cost price onto each order line when it is created, so profit stays correct if costs change later
create or replace function public.order_items_stamp_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit_cost is null and new.product_id is not null then
    select cost_price into new.unit_cost from public.products where id = new.product_id;
  elsif new.unit_cost is null and new.gift_set_id is not null then
    select sum(g.qty * p.cost_price) into new.unit_cost
      from public.gift_set_items g join public.products p on p.id = g.product_id
     where g.gift_set_id = new.gift_set_id
    having count(*) = count(p.cost_price);
  end if;
  return new;
end $$;
create trigger order_items_stamp_cost before insert on public.order_items
  for each row execute function public.order_items_stamp_cost();

-- ============ EXPENSES ============
create table public.expense_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  monthly_budget numeric(10,2) check (monthly_budget is null or monthly_budget >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true
);
insert into public.expense_categories (name, sort_order) values
('MDF blanks', 1), ('Ink and printer', 2), ('Packaging', 3), ('Courier', 4), ('Website and software', 5),
('Marketing', 6), ('Bank charges', 7), ('Rent and utilities', 8), ('Equipment', 9), ('Other', 10);

create table public.recurring_expenses (
  id bigint generated always as identity primary key,
  supplier text not null,
  category_id bigint not null references public.expense_categories(id),
  description text not null default '',
  amount numeric(10,2) not null check (amount > 0),
  vat_amount numeric(10,2) not null default 0 check (vat_amount >= 0),
  paid_by text not null default 'eft' check (paid_by in ('eft','card','cash','debit_order')),
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  generated_through date,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id bigint generated always as identity primary key,
  expense_date date not null default current_date,
  supplier text not null,
  category_id bigint not null references public.expense_categories(id),
  description text not null default '',
  amount numeric(10,2) not null check (amount > 0),
  vat_amount numeric(10,2) not null default 0 check (vat_amount >= 0),
  paid_by text not null default 'eft' check (paid_by in ('eft','card','cash','debit_order')),
  receipt_path text,
  recurring_id bigint references public.recurring_expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  check (vat_amount <= amount)
);
create index on public.expenses (expense_date);
create index on public.expenses (category_id);

alter table public.expense_categories enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expenses enable row level security;
create policy "expense categories staff" on public.expense_categories for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "recurring expenses staff" on public.recurring_expenses for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "expenses staff" on public.expenses for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Adds every recurring expense that has come due and was not added yet. Called when Expenses opens.
create or replace function public.generate_recurring_expenses()
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_expenses;
  m date;
  d date;
  n int := 0;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  for r in select * from public.recurring_expenses where is_active for update loop
    m := date_trunc('month', greatest(r.start_date, coalesce(r.generated_through + 1, r.start_date)))::date;
    loop
      d := m + (least(r.day_of_month, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1);
      exit when d > current_date or (r.end_date is not null and d > r.end_date);
      if d >= r.start_date and (r.generated_through is null or d > r.generated_through) then
        insert into public.expenses (expense_date, supplier, category_id, description, amount, vat_amount, paid_by, recurring_id)
        values (d, r.supplier, r.category_id, r.description, r.amount, r.vat_amount, r.paid_by, r.id);
        update public.recurring_expenses set generated_through = d where id = r.id;
        r.generated_through := d;
        n := n + 1;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.generate_recurring_expenses() from public, anon;
grant execute on function public.generate_recurring_expenses() to authenticated;

-- ============ RECEIPTS STORAGE ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
create policy "receipts staff read" on storage.objects for select to authenticated using (bucket_id = 'expense-receipts' and public.is_staff());
create policy "receipts staff insert" on storage.objects for insert to authenticated with check (bucket_id = 'expense-receipts' and public.is_staff());
create policy "receipts staff delete" on storage.objects for delete to authenticated using (bucket_id = 'expense-receipts' and public.is_staff());

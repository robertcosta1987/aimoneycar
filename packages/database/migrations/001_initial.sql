-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Dealerships ─────────────────────────────────────────────────────────────
create table if not exists dealerships (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  cnpj        text,
  phone       text,
  whatsapp    text,
  email       text,
  address     text,
  city        text,
  state       text,
  logo_url    text,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key references auth.users(id) on delete cascade,
  dealership_id   uuid references dealerships(id) on delete set null,
  name            text not null,
  email           text not null unique,
  phone           text,
  role            text not null default 'owner' check (role in ('owner', 'manager', 'salesperson', 'staff')),
  avatar_url      text,
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Vehicles ────────────────────────────────────────────────────────────────
create table if not exists vehicles (
  id              uuid primary key default uuid_generate_v4(),
  dealership_id   uuid not null references dealerships(id) on delete cascade,
  plate           text,
  chassis         text,
  renavam         text,
  brand           text not null,
  model           text not null,
  version         text,
  year_fab        int not null,
  year_model      int not null,
  color           text,
  mileage         int not null default 0,
  fuel            text,
  transmission    text,
  purchase_price  numeric(12,2) not null default 0,
  sale_price      numeric(12,2),
  fipe_price      numeric(12,2),
  min_price       numeric(12,2),
  status          text not null default 'available' check (status in ('available', 'reserved', 'sold', 'consigned')),
  purchase_date   date not null default current_date,
  sale_date       date,
  days_in_stock   int not null generated always as (
    case
      when sale_date is not null then (sale_date - purchase_date)
      else (current_date - purchase_date)
    end
  ) stored,
  supplier_name   text,
  customer_id     text,
  photos          text[] not null default '{}',
  notes           text,
  source          text,
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dealership_id, external_id)
);

-- ─── Expenses ────────────────────────────────────────────────────────────────
create table if not exists expenses (
  id              uuid primary key default uuid_generate_v4(),
  dealership_id   uuid not null references dealerships(id) on delete cascade,
  vehicle_id      uuid references vehicles(id) on delete set null,
  category        text not null,
  description     text,
  amount          numeric(12,2) not null,
  date            date not null default current_date,
  vendor_name     text,
  payment_method  text,
  receipt_url     text,
  created_by      uuid references users(id) on delete set null,
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Sales ───────────────────────────────────────────────────────────────────
create table if not exists sales (
  id                uuid primary key default uuid_generate_v4(),
  dealership_id     uuid not null references dealerships(id) on delete cascade,
  vehicle_id        uuid not null references vehicles(id),
  customer_name     text not null,
  customer_phone    text,
  customer_email    text,
  customer_cpf      text,
  sale_price        numeric(12,2) not null,
  purchase_price    numeric(12,2) not null,
  total_expenses    numeric(12,2) not null default 0,
  profit            numeric(12,2) generated always as (sale_price - purchase_price - total_expenses) stored,
  profit_percent    numeric(8,4) generated always as (
    case when purchase_price > 0
      then ((sale_price - purchase_price - total_expenses) / purchase_price) * 100
      else 0
    end
  ) stored,
  payment_method    text not null,
  down_payment      numeric(12,2),
  financing_bank    text,
  sale_date         date not null default current_date,
  salesperson_id    uuid references users(id) on delete set null,
  salesperson_name  text,
  notes             text,
  created_at        timestamptz not null default now()
);

-- ─── AI Alerts ───────────────────────────────────────────────────────────────
create table if not exists ai_alerts (
  id              uuid primary key default uuid_generate_v4(),
  dealership_id   uuid not null references dealerships(id) on delete cascade,
  vehicle_id      uuid references vehicles(id) on delete set null,
  type            text not null check (type in ('critical', 'warning', 'info', 'success')),
  title           text not null,
  message         text not null,
  action          text,
  action_data     jsonb,
  is_read         boolean not null default false,
  is_dismissed    boolean not null default false,
  sent_whatsapp   boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ─── AI Conversations ─────────────────────────────────────────────────────────
create table if not exists ai_conversations (
  id              uuid primary key default uuid_generate_v4(),
  dealership_id   uuid not null references dealerships(id) on delete cascade,
  user_id         uuid references users(id) on delete set null,
  messages        jsonb not null default '[]',
  context         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Imports ─────────────────────────────────────────────────────────────────
create table if not exists imports (
  id                uuid primary key default uuid_generate_v4(),
  dealership_id     uuid not null references dealerships(id) on delete cascade,
  filename          text,
  file_type         text,
  file_size         bigint,
  status            text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'error')),
  records_imported  int not null default 0,
  errors            jsonb not null default '[]',
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

-- ─── Dashboard Stats Function ─────────────────────────────────────────────────
create or replace function get_dashboard_stats(d_id uuid)
returns json
language sql
stable
as $$
  select json_build_object(
    'total_vehicles',     count(*) filter (where status != 'sold'),
    'available_vehicles', count(*) filter (where status = 'available'),
    'critical_vehicles',  count(*) filter (where status = 'available' and days_in_stock > 60),
    'avg_days_in_stock',  coalesce(round(avg(days_in_stock) filter (where status = 'available')), 0),
    'total_expenses',     coalesce((select sum(amount) from expenses where dealership_id = d_id), 0),
    'monthly_sales',      (select count(*) from sales where dealership_id = d_id and sale_date >= date_trunc('month', current_date)),
    'monthly_revenue',    coalesce((select sum(sale_price) from sales where dealership_id = d_id and sale_date >= date_trunc('month', current_date)), 0),
    'monthly_profit',     coalesce((select sum(profit) from sales where dealership_id = d_id and sale_date >= date_trunc('month', current_date)), 0)
  )
  from vehicles
  where dealership_id = d_id;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table dealerships enable row level security;
alter table users enable row level security;
alter table vehicles enable row level security;
alter table expenses enable row level security;
alter table sales enable row level security;
alter table ai_alerts enable row level security;
alter table ai_conversations enable row level security;
alter table imports enable row level security;

-- Helper function: get current user's dealership_id
create or replace function my_dealership_id()
returns uuid language sql stable
as $$ select dealership_id from users where id = auth.uid(); $$;

-- Dealerships: user can only see their own
create policy "dealership_select" on dealerships for select
  using (id = my_dealership_id());
create policy "dealership_update" on dealerships for update
  using (id = my_dealership_id());

-- Users: see own dealership members
create policy "users_select" on users for select
  using (dealership_id = my_dealership_id() or id = auth.uid());
create policy "users_insert" on users for insert
  with check (id = auth.uid());
create policy "users_update" on users for update
  using (id = auth.uid());

-- Vehicles
create policy "vehicles_all" on vehicles for all
  using (dealership_id = my_dealership_id());

-- Expenses
create policy "expenses_all" on expenses for all
  using (dealership_id = my_dealership_id());

-- Sales
create policy "sales_all" on sales for all
  using (dealership_id = my_dealership_id());

-- AI Alerts
create policy "alerts_all" on ai_alerts for all
  using (dealership_id = my_dealership_id());

-- AI Conversations
create policy "conversations_all" on ai_conversations for all
  using (dealership_id = my_dealership_id());

-- Imports
create policy "imports_all" on imports for all
  using (dealership_id = my_dealership_id());

-- ─── Storage Bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict do nothing;

create policy "uploads_insert" on storage.objects for insert
  with check (bucket_id = 'uploads' and auth.role() = 'authenticated');
create policy "uploads_select" on storage.objects for select
  using (bucket_id = 'uploads' and auth.role() = 'authenticated');

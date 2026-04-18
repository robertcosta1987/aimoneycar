-- AI response cache
-- Stores Claude API results keyed by (dealership_id, cache_key) with a TTL.
-- Used to avoid redundant AI calls for slowly-changing data.

create table if not exists ai_cache (
  id            uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  cache_key     text not null,
  result        jsonb not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint ai_cache_unique unique (dealership_id, cache_key)
);

create index if not exists ai_cache_lookup
  on ai_cache (dealership_id, cache_key, expires_at);

-- RLS: dealership isolation
alter table ai_cache enable row level security;

create policy "dealership members can read own cache"
  on ai_cache for select
  using (
    dealership_id in (
      select dealership_id from users where id = auth.uid()
    )
  );

-- Service role bypasses RLS for writes (used server-side only)

-- work app tables: exact mirrors of public.records and public.push_subscriptions.
-- Idempotent. Reuses the existing public.records_touch() trigger function.

create table if not exists public.work_records (
  user_id uuid not null default auth.uid(),
  coll text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint work_records_pkey primary key (user_id, coll, id)
);

create index if not exists work_records_user_updated_idx
  on public.work_records (user_id, updated_at);

drop trigger if exists work_records_touch on public.work_records;
create trigger work_records_touch
  before insert or update on public.work_records
  for each row execute function public.records_touch();

alter table public.work_records enable row level security;

drop policy if exists "own rows select" on public.work_records;
create policy "own rows select" on public.work_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own rows insert" on public.work_records;
create policy "own rows insert" on public.work_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "own rows update" on public.work_records;
create policy "own rows update" on public.work_records
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows delete" on public.work_records;
create policy "own rows delete" on public.work_records
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.work_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  constraint work_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists work_push_subscriptions_user
  on public.work_push_subscriptions (user_id);

alter table public.work_push_subscriptions enable row level security;

drop policy if exists "own subs select" on public.work_push_subscriptions;
create policy "own subs select" on public.work_push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "own subs insert" on public.work_push_subscriptions;
create policy "own subs insert" on public.work_push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "own subs update" on public.work_push_subscriptions;
create policy "own subs update" on public.work_push_subscriptions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own subs delete" on public.work_push_subscriptions;
create policy "own subs delete" on public.work_push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

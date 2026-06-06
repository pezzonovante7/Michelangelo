-- Michelangelo v2 — Supabase Schema
-- Run this in Supabase SQL Editor after creating your project.

-- Sessions (one per training day)
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  session_date  date not null,
  day_key       text not null,          -- strength_a | strength_b | strength_c | boxing_a | boxing_b | boxing_c | rest
  status        text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  mcgill_pre    boolean default false,
  mcgill_post   boolean default false,
  warmup_done   boolean default false,
  cooldown_done boolean default false,
  mobility_done boolean default false,
  session_rpe   smallint check (session_rpe between 1 and 10),
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, session_date, day_key)
);

-- Strength set logs
create table if not exists strength_sets (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references sessions(id) on delete cascade not null,
  exercise_name  text not null,
  set_number     smallint not null,
  weight_kg      numeric(6,2),
  reps           smallint,
  completed      boolean default false,
  created_at     timestamptz default now(),
  unique (session_id, exercise_name, set_number)
);

-- Boxing phase logs
create table if not exists boxing_phases (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid references sessions(id) on delete cascade not null,
  phase_key        text not null,
  phase_order      smallint not null,
  target_seconds   integer not null default 0,
  elapsed_seconds  integer default 0,
  rpe              smallint check (rpe between 1 and 10),
  notes            text,
  completed        boolean default false,
  created_at       timestamptz default now(),
  unique (session_id, phase_key)
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sessions_updated_at
  before update on sessions
  for each row execute function update_updated_at();

-- Row Level Security
alter table sessions enable row level security;
alter table strength_sets enable row level security;
alter table boxing_phases enable row level security;

create policy "Users manage own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own strength sets"
  on strength_sets for all
  using (
    session_id in (select id from sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from sessions where user_id = auth.uid())
  );

create policy "Users manage own boxing phases"
  on boxing_phases for all
  using (
    session_id in (select id from sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from sessions where user_id = auth.uid())
  );

-- Helpful indexes
create index if not exists idx_sessions_user_date on sessions (user_id, session_date desc);
create index if not exists idx_strength_sets_session on strength_sets (session_id);
create index if not exists idx_boxing_phases_session on boxing_phases (session_id);
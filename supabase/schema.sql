-- Huddle MVP schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'simulator',          -- simulator | claw | sendblue
  provider_group_id text not null,                      -- group_id from the messaging provider
  title text,
  activity_level text not null default 'normal',        -- quiet | normal | active | paused
  debate_mode text not null default 'full',             -- off | highlights | full
  last_agent_post_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_group_id)
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  address text not null,                                -- phone number or sim handle
  display_name text,
  created_at timestamptz not null default now(),
  unique (trip_id, address)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,
  sender_type text not null,                            -- human | agent
  persona text,                                         -- set for agent messages, e.g. "huddle", "budget", agent id
  content text not null,
  provider_message_id text unique,                      -- dedupes provider replays
  created_at timestamptz not null default now()
);

create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  category text not null,                               -- dates | budget | lodging | transport | food | activities | dislikes | other
  value text not null,
  visibility text not null default 'group',             -- private | group
  source_message_id uuid references messages(id) on delete set null,
  confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  topic text not null,                                  -- e.g. "where to stay"
  status text not null default 'open',                  -- open | debating | proposed | decided
  options jsonb not null default '[]'::jsonb,           -- [{label, details, est_cost_per_person}]
  chosen text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null,                                   -- child (huddle and budget are implicit)
  role text not null,                                   -- stays | flights | food | activities | ...
  persona_name text not null,
  emoji text not null default '🤖',
  task text not null,
  champions text,                                       -- the option this agent argues for in a debate
  decision_id uuid references decisions(id) on delete set null,
  status text not null default 'active',                -- active | left
  created_at timestamptz not null default now()
);

create table if not exists speak_candidates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  speaker text not null,                                -- huddle | budget | <agent id>
  trigger text not null,                                -- direct_tag | conflict | decision_ready | stuck | debate | intro | signoff | time_sensitive
  urgency int not null default 1,                       -- 1 low, 2 medium, 3 high
  content text not null,
  seq int not null default 0,                           -- ordering within a batch (debates)
  status text not null default 'pending',               -- pending | posted | dropped
  reason text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create index if not exists messages_trip_created on messages (trip_id, created_at);
create index if not exists candidates_trip_status on speak_candidates (trip_id, status);

-- Realtime for the dashboard and simulator.
-- Skips tables already in the publication so this whole file stays safe to re-run.
do $$
declare t text;
begin
  foreach t in array array['trips','participants','messages','preferences','decisions','agents','speak_candidates']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- MVP NOTE: RLS is left off so the dashboard can read with the anon key.
-- Before real users, enable RLS and gate dashboard access with signed trip links.

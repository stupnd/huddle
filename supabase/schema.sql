-- Huddle MVP schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'simulator',          -- simulator | claw | sendblue
  provider_group_id text not null,                      -- group_id from the messaging provider
  title text,
  status text not null default 'active',                -- active | archived: a group chat moves on to a new trip via "huddle new trip"
  activity_level text not null default 'normal',        -- quiet | normal | active | paused
  debate_mode text not null default 'full',             -- off | highlights | full
  last_agent_post_at timestamptz,
  settings jsonb not null default '{}'::jsonb,           -- {"penny": false} turns budget off; monitor findings live under settings.monitor
  created_at timestamptz not null default now()
);
-- Existing databases: add the columns without touching anything else. Safe to re-run.
alter table trips add column if not exists settings jsonb not null default '{}'::jsonb;
alter table trips add column if not exists status text not null default 'active';

-- Only one active trip per group chat at a time. A group chat can't be told apart by its
-- provider_group_id alone once it has planned more than one trip (iMessage reuses the same
-- thread for the same participant set), so trips.status lets it move on: the old trip is
-- archived and a new active one takes over the same provider_group_id. Safe to re-run.
alter table trips drop constraint if exists trips_provider_provider_group_id_key;
drop index if exists trips_provider_provider_group_id_key;
create unique index if not exists trips_active_group_idx on trips (provider, provider_group_id) where status = 'active';

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

-- Dedupes inbound DMs to Huddle (as opposed to group messages, which dedupe via
-- messages.provider_message_id). A DM has no trip to attach a messages row to until one is
-- found or created, so it needs its own claim table. Also the actual fix for two worker
-- processes connected to the same Claw account at once (e.g. a local run overlapping a Railway
-- deploy): the unique constraint means only one process's insert wins per messageId, so only
-- one of them ever proceeds to act on a given DM.
create table if not exists dm_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text unique not null,
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

create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_label text not null,                              -- "Saturday, Sep 19"
  day_index int not null default 0,                     -- 0 = first day, for ordering
  start_time text,                                      -- "1:00pm", free text so "morning" also works
  title text not null,                                  -- "Land at LAX"
  place text,                                           -- "Los Angeles International Airport"
  notes text,                                           -- one line of why or how
  maps_url text,
  wiki_url text,
  image_url text,
  category text,                                        -- stays | food | activities | transport | nightlife
  est_cost_per_person numeric,                          -- what this stop costs each person, 0 if free
  lat double precision,                                 -- from Google Places at plan time; the map uses these
  lng double precision,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists itinerary_trip on itinerary_items (trip_id, day_index, sort);
alter table itinerary_items add column if not exists lat double precision;
alter table itinerary_items add column if not exists lng double precision;
alter table itinerary_items enable row level security;

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text,
  name text,
  source text,                                          -- landing | referral | other
  created_at timestamptz not null default now()
);
alter table waitlist enable row level security;

-- Sign-in codes texted from Huddle's own line. Only the hash is stored; codes expire in 10 minutes.
create table if not exists login_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_phone on login_codes (phone, created_at desc);
alter table login_codes enable row level security;

-- Long-running work the worker does so Vercel functions never run the planner (60 s limit).
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null,                                   -- plan | replan
  status text not null default 'queued',                -- queued | running | done | failed
  announce boolean not null default false,              -- post a summary to the chat when done
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists jobs_pending on jobs (status, created_at);
alter table jobs enable row level security;

alter table itinerary_items add column if not exists duration_min int;                -- how long the stop takes
alter table itinerary_items add column if not exists travel_from_prev_min int;        -- driving minutes from the previous stop that day

create index if not exists messages_trip_created on messages (trip_id, created_at);
create index if not exists candidates_trip_status on speak_candidates (trip_id, status);

-- Row Level Security.
-- The browser never reads Supabase directly. The dashboard and the simulator go through
-- server routes that use the service role key, which bypasses RLS. No policies are needed:
-- with RLS on and no policy, the anon key reads nothing, which is exactly what we want.
alter table trips            enable row level security;
alter table participants     enable row level security;
alter table messages         enable row level security;
alter table preferences      enable row level security;
alter table decisions        enable row level security;
alter table agents           enable row level security;
alter table speak_candidates enable row level security;
alter table dm_events        enable row level security;

-- Dashboard additions (2026-09-18). Safe to re-run.
-- Votes on decision options, one per person per thread.
create table if not exists decision_votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  decision_id uuid not null references decisions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  option_label text not null,                           -- matches decisions.options[].label
  created_at timestamptz not null default now(),
  unique (decision_id, participant_id)
);
alter table decision_votes enable row level security;

-- Stop state on the itinerary so a removed stop stays visible with its reason instead of vanishing on replan.
alter table itinerary_items add column if not exists status text not null default 'proposed';  -- locked | proposed | contested | dropped. 'proposed' means untouched: the dashboard derives the state
alter table itinerary_items add column if not exists dropped_reason text;
alter table itinerary_items add column if not exists dropped_by text;                            -- huddle | <agent id> | <participant id>
alter table itinerary_items add column if not exists dropped_at timestamptz;

create extension if not exists pgcrypto;

create table seasons (
  id smallint primary key,
  title text,
  year_start smallint,
  year_end smallint
);

create table weeks (
  id uuid primary key default gen_random_uuid(),
  season_id smallint not null references seasons(id),
  week_number smallint,
  name text not null,
  region text,
  episode_start smallint,
  episode_end smallint,
  unique(season_id, week_number)
);

create table contestants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  season_id smallint not null references seasons(id),
  week_id uuid references weeks(id),
  hosting_order smallint,
  age smallint,
  city text,
  region text,
  occupation text,
  relationship_status text,
  gender text,
  diet text,
  score numeric(5,2),
  placement smallint,
  winner boolean,
  notes text
);

create type course_type as enum ('starter','main','dessert','alternative','other');
create table dishes (
  id uuid primary key default gen_random_uuid(),
  contestant_id uuid not null references contestants(id) on delete cascade,
  course course_type not null,
  name text not null,
  description text,
  tags text[] not null default '{}'
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('legacy','wayback','fandom','kan','manual')),
  url text not null,
  title text,
  retrieved_at timestamptz default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(kind, url)
);

create table field_evidence (
  id uuid primary key default gen_random_uuid(),
  contestant_id uuid references contestants(id) on delete cascade,
  dish_id uuid references dishes(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  field_name text not null,
  raw_value text,
  confidence numeric(3,2) check (confidence between 0 and 1),
  check ((contestant_id is not null)::int + (dish_id is not null)::int = 1)
);

create index contestants_season_idx on contestants(season_id);
create index contestants_score_idx on contestants(score desc nulls last);
create index contestants_winner_idx on contestants(winner) where winner = true;
create index dishes_course_idx on dishes(course);
create index dishes_name_search_idx on dishes using gin (to_tsvector('simple', name || ' ' || coalesce(description,'')));

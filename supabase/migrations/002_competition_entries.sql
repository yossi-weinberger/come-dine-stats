-- Seasons 3–4 were competed by couples rather than individuals.
-- Keep the existing contestants table name for backward compatibility while
-- explicitly modelling the competition entry and its member names.

alter table contestants
  add column if not exists entry_type text not null default 'individual'
    check (entry_type in ('individual', 'couple')),
  add column if not exists member_names text[] not null default '{}',
  add column if not exists competition_status text not null default 'active'
    check (competition_status in ('active', 'withdrawn', 'guest'));

comment on column contestants.entry_type is 'Whether this scoring entry represents one individual or a couple.';
comment on column contestants.member_names is 'Human participants represented by this competition entry.';
comment on column contestants.competition_status is 'Competition status for this entry, including withdrawals.';

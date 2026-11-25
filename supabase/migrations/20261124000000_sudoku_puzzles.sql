-- Sudoku puzzles shown on /sudoku.
--
-- Anyone can read them. Nobody writes through the public API: the site's
-- server route (app/api/sudoku/puzzles) uses the secret key, after checking
-- the puzzle has exactly one solution and isn't already here.
--
-- Encoding:
--   givens    81 digits, row by row, 0 = empty; null for a killer with none
--   cages     killer only: [{ "sum": 11, "cells": [5, 6] }, ...], cells 0–80 row by row
--   solution  81 digits 1–9
--   canonical the same for puzzles that are rotations/reflections of each other
--             (and, for classic, digit relabellings): engine/canonical.js
--   position  the puzzle's number within its kind and difficulty, from 1

create table if not exists public.sudoku_puzzles (
  id          text primary key default gen_random_uuid()::text,
  kind        text not null check (kind in ('killer', 'classic')),
  difficulty  text not null check (difficulty in ('easy', 'medium', 'hard', 'extreme', 'mind_bending')),
  position    integer not null check (position > 0),
  name        text not null default '' check (char_length(name) <= 40),
  givens      text check (givens ~ '^[0-9]{81}$'),
  cages       jsonb check (cages is null or jsonb_typeof(cages) = 'array'),
  solution    text not null check (solution ~ '^[1-9]{81}$'),
  canonical   text not null unique,
  source      text not null default 'community' check (source in ('bundled', 'community')),
  submitter   text,                       -- salted hash of the publisher's IP (rate limiting); never exposed
  created_at  timestamptz not null default now(),
  unique (kind, difficulty, position),
  check (
    (kind = 'killer' and cages is not null)
    or (kind = 'classic' and cages is null and givens is not null)
  )
);

create index if not exists sudoku_puzzles_submitter_created_idx
  on public.sudoku_puzzles (submitter, created_at);

-- Number each new puzzle after the last one of its kind and difficulty. The
-- advisory lock stops two publishes at once from taking the same number.
create or replace function public.sudoku_puzzles_assign_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    perform pg_advisory_xact_lock(hashtext('sudoku_puzzles:' || new.kind || ':' || new.difficulty));
    select coalesce(max(p.position), 0) + 1 into new.position
      from public.sudoku_puzzles p
     where p.kind = new.kind and p.difficulty = new.difficulty;
  end if;
  return new;
end;
$$;

drop trigger if exists sudoku_puzzles_assign_position on public.sudoku_puzzles;
create trigger sudoku_puzzles_assign_position
  before insert on public.sudoku_puzzles
  for each row execute function public.sudoku_puzzles_assign_position();

-- Access: read-only for the public, and not the submitter column.
alter table public.sudoku_puzzles enable row level security;

drop policy if exists "Sudoku puzzles are public" on public.sudoku_puzzles;
create policy "Sudoku puzzles are public"
  on public.sudoku_puzzles for select
  to anon, authenticated
  using (true);

revoke all on public.sudoku_puzzles from anon, authenticated;
grant select (id, kind, difficulty, position, name, givens, cages, solution, source, created_at)
  on public.sudoku_puzzles to anon, authenticated;
grant all on public.sudoku_puzzles to service_role;

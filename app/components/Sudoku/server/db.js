// Server-only access to the sudoku_puzzles table. Never import this from a
// client component: it reads the secret key.
//
// Environment (.env.local, and the host's settings in production):
//   SUPABASE_URL              https://<project>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  publishable (or legacy anon) key, for reading
//   SUPABASE_SECRET_KEY       secret (or legacy service_role) key, for publishing

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PUZZLES, fromRow } from '../puzzles.js';

export const TABLE = 'sudoku_puzzles';
export const PUZZLES_TAG = 'sudoku-puzzles';
const COLUMNS = 'id, kind, difficulty, position, name, givens, cages, solution';

// Publishing limit per visitor (by IP address).
export const RATE_LIMIT = { count: 10, windowMinutes: 60 };

const env = () => ({
  url: process.env.SUPABASE_URL,
  readKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  writeKey: process.env.SUPABASE_SECRET_KEY,
});

export const canRead = () => { const e = env(); return !!(e.url && e.readKey); };
export const canWrite = () => { const e = env(); return !!(e.url && e.writeKey); };

const client = (key, fetchOptions) => createClient(env().url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Next caches fetch() by default; say how each client's requests may be cached.
  global: { fetch: (url, init) => fetch(url, { ...init, ...fetchOptions }) },
});

/**
 * Every published puzzle, cached until a new one is published (or 10 minutes).
 * Falls back to the bundled puzzles if the database isn't set up or can't be reached.
 */
export async function listPuzzles() {
  if (!canRead()) return PUZZLES;
  const db = client(env().readKey, { next: { revalidate: 600, tags: [PUZZLES_TAG] } });
  const { data, error } = await db.from(TABLE).select(COLUMNS).order('position');
  if (error || !data?.length) {
    if (error) console.error('sudoku: reading puzzles failed, using the bundled set:', error.message);
    return PUZZLES;
  }
  return data.map(fromRow);
}

const writer = () => client(env().writeKey, { cache: 'no-store' });

/** A salted hash of the visitor's IP, so the table never holds the IP itself. */
export const submitterOf = ip =>
  createHash('sha256').update(`sudoku:${env().writeKey}:${ip}`).digest('hex').slice(0, 32);

/** The published puzzle with this canonical key, if any. */
export async function findByCanonical(canonical) {
  const { data, error } = await writer().from(TABLE).select(COLUMNS).eq('canonical', canonical).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/** How many puzzles this submitter has published within the rate-limit window. */
export async function recentCount(submitter) {
  const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString();
  const { count, error } = await writer()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('submitter', submitter)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Inserts a checked puzzle (see submission.js). The database numbers it.
 * @returns {{ puzzle: object } | { duplicate: true }}
 */
export async function insertPuzzle(row, submitter) {
  const { data, error } = await writer()
    .from(TABLE)
    .insert({ ...row, submitter, source: 'community' })
    .select(COLUMNS)
    .single();
  if (error?.code === '23505') return { duplicate: true }; // unique violation: published meanwhile
  if (error) throw error;
  return { puzzle: fromRow(data) };
}

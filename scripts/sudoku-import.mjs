// Fills the sudoku_puzzles table: first the puzzles bundled with the site
// (keeping their ids, so players' saved progress still matches), then killer
// puzzles from https://github.com/UvA-KR16/KilerSudoku.
//
//   node scripts/sudoku-import.mjs [--per 50] [--dry-run]
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.
//
// Repo puzzles are grouped by their largest cage (data/<size>/<n>.killer):
// bigger cages give fewer clues, so they're harder. The generator doesn't
// promise a single solution, so where there are several, starting digits from
// the answer key are added (where two solutions differ) until there's one.
// Every puzzle then goes through the same check as publishing from the site,
// so nothing the server would refuse ends up in the table. Puzzles already in
// the table (same canonical key) are skipped, so a rerun adds new ones.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { KILLER_PUZZLES } from '../app/components/Sudoku/data/puzzles.js';
import { PUZZLES } from '../app/components/Sudoku/puzzles.js';
import { parseKiller, parseAns } from '../app/components/Sudoku/engine/parse.js';
import { countSolutions } from '../app/components/Sudoku/engine/solver.js';
import { canonicalKey } from '../app/components/Sudoku/engine/canonical.js';
import { checkSubmission, SERVER_NODES } from '../app/components/Sudoku/server/submission.js';

const SIZES = { easy: [2], medium: [3], hard: [4, 5], extreme: [6, 7], mind_bending: [8, 9] };
const FILES_PER_SIZE = 1500;
const MAX_ADDED = 12; // give up on a puzzle needing more starting digits than this

const args = process.argv.slice(2);
const per = Number(args[args.indexOf('--per') + 1]) || 50;
const dryRun = args.includes('--dry-run');

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => /^\s*SUPABASE_/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

/** Inserts one row (the database numbers it). @returns 'added' | 'duplicate' */
async function insert(row) {
  if (dryRun) return 'added';
  const { error } = await db.from('sudoku_puzzles').insert(row);
  if (error?.code === '23505') return 'duplicate';
  if (error) throw new Error(error.message);
  return 'added';
}

// ── 1. Bundled puzzles ──
let added = 0;
for (const p of PUZZLES) {
  const result = await insert({
    id: p.id, kind: p.kind, difficulty: p.difficulty, name: p.name,
    givens: p.givens, cages: p.cages, solution: p.solution,
    canonical: canonicalKey(p), source: 'bundled',
  });
  if (result === 'added') added++;
}
console.log(`bundled: ${added} added, ${PUZZLES.length - added} already there`);

// ── 2. Repo puzzles ──
const bundledFiles = new Set(KILLER_PUZZLES.map(p => p.source));
const raw = path => fetch(`https://raw.githubusercontent.com/UvA-KR16/KilerSudoku/master/${path}`)
  .then(r => { if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.text(); });

/**
 * Adds answer-key digits until the puzzle has one solution.
 * @returns {{ givens: string|null } | null}  givens null = unique as it is; null = gave up
 */
function makeUnique(cages, solution) {
  const givens = Array(81).fill('0');
  for (let n = 0; n <= MAX_ADDED; n++) {
    const r = countSolutions({ givens: n ? givens.join('') : null, cages }, 2, SERVER_NODES);
    if (r.aborted || r.count === 0) return null;
    if (r.count === 1) return { givens: n ? givens.join('') : null };
    const i = [...Array(81).keys()].find(k => r.solutions[0][k] !== r.solutions[1][k]);
    givens[i] = solution[i];
  }
  return null;
}

for (const [difficulty, sizes] of Object.entries(SIZES)) {
  const stats = { added: 0, duplicate: 0, skipped: 0 };
  // Split the quota across sizes: 50 over [4, 5] → 25 each.
  for (const [k, size] of sizes.entries()) {
    const quota = Math.floor(per / sizes.length) + (k < per % sizes.length ? 1 : 0);
    let got = 0;
    for (let n = 0; n < FILES_PER_SIZE && got < quota; n++) {
      const file = `data/${size}/${n}`;
      if (bundledFiles.has(file)) continue;
      const { cages } = parseKiller(await raw(`${file}.killer`));
      const solution = parseAns(await raw(`${file}.ans`));
      const t = Date.now();
      const made = makeUnique(cages, solution);
      const check = made && checkSubmission({ kind: 'killer', difficulty, givens: made.givens, cages });
      if (!check?.ok || check.row.solution !== solution) {
        stats.skipped++;
        console.log(`  ${file}: skipped (${check?.error ?? 'couldn’t make it unique in time'}, ${Date.now() - t}ms)`);
        continue;
      }
      const result = await insert({ ...check.row, source: 'bundled' });
      stats[result]++;
      if (result === 'added') got++;
    }
  }
  console.log(`${difficulty}: ${stats.added} added, ${stats.duplicate} already there, ${stats.skipped} skipped`);
}
if (dryRun) console.log('(dry run: nothing was written)');

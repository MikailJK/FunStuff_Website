// Fills the sudoku_puzzles table from https://github.com/UvA-KR16/KilerSudoku:
//   bundled  the puzzles bundled with the site (keeping their ids, so players'
//            saved progress still matches)
//   killer   killer puzzles from the repo's data folder
//   classic  classic puzzles made from the repo's completed grids (Sudokus.txt)
//
//   node scripts/sudoku-import.mjs [--only bundled|killer|classic] [--per 50] [--seed 1] [--dry-run]
//
// Without --only it does all three, in that order. Reads SUPABASE_URL and
// SUPABASE_SECRET_KEY from .env.local.
//
// Killer puzzles are grouped by their largest cage (data/<size>/<n>.killer):
// bigger cages give fewer clues, so they're harder. The generator doesn't
// promise a single solution, so where there are several, starting digits from
// the answer key are added (where two solutions differ) until there's one.
// Every puzzle then goes through the same check as publishing from the site,
// so nothing the server would refuse ends up in the table. Puzzles already in
// the table (same canonical key) are skipped, so a rerun adds new ones.
//
// Classic puzzles: the repo has no classic puzzles, only completed grids. Each
// puzzle takes a fresh grid, renames its digits at random, and removes digits
// in random order while the puzzle keeps a single solution (and, for easy and
// medium, stays solvable with singles). It's then graded by the hardest
// technique needed (engine/grade.js) and kept if its grade is one still wanted:
//   easy          hidden singles only, 36 starting digits
//   medium        needs naked singles
//   hard          needs locked candidates or pairs
//   extreme       needs triples, X-wing, swordfish or XY-wing
//   mind_bending  none of those finish it
// Within a difficulty, puzzles are numbered from most starting digits to fewest.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { KILLER_PUZZLES } from '../app/components/Sudoku/data/puzzles.js';
import { PUZZLES } from '../app/components/Sudoku/puzzles.js';
import { parseKiller, parseAns } from '../app/components/Sudoku/engine/parse.js';
import { countSolutions } from '../app/components/Sudoku/engine/solver.js';
import { canonicalKey } from '../app/components/Sudoku/engine/canonical.js';
import { checkSubmission, SERVER_NODES } from '../app/components/Sudoku/server/submission.js';
import { grade } from '../app/components/Sudoku/engine/grade.js';

const SIZES = { easy: [2], medium: [3], hard: [4, 5], extreme: [6, 7], mind_bending: [8, 9] };
const FILES_PER_SIZE = 1500;
const MAX_ADDED = 12; // give up on a puzzle needing more starting digits than this

const args = process.argv.slice(2);
const per = Number(args[args.indexOf('--per') + 1]) || 50;
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const seed = Number(args[args.indexOf('--seed') + 1]) || 1;
const runs = part => !only || only === part;

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
for (const p of runs('bundled') ? PUZZLES : []) {
  const result = await insert({
    id: p.id, kind: p.kind, difficulty: p.difficulty, name: p.name,
    givens: p.givens, cages: p.cages, solution: p.solution,
    canonical: canonicalKey(p), source: 'bundled',
  });
  if (result === 'added') added++;
}
if (runs('bundled')) console.log(`bundled: ${added} added, ${PUZZLES.length - added} already there`);

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

for (const [difficulty, sizes] of runs('killer') ? Object.entries(SIZES) : []) {
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
// ── 3. Classic puzzles ──
const EASY_CLUES = 36;
const GRADE_OF = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'extreme', 5: 'mind_bending' };

let state = seed >>> 0;
const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const unique = givens => countSolutions({ givens }, 2).count === 1;

/**
 * Removes digits from a solved grid while `keep(givens)` holds (always: one
 * solution), stopping at `floor` digits.
 */
function strip(solution, keep, floor = 17) {
  const g = solution.split('');
  let left = 81;
  for (const i of shuffle([...Array(81).keys()])) {
    if (left <= floor) break;
    const d = g[i];
    g[i] = '0';
    const s = g.join('');
    if (unique(s) && keep(s)) left--;
    else g[i] = d;
  }
  return g.join('');
}

// Candidate puzzle for a difficulty, or null if this grid didn't give one.
const MAKERS = {
  easy: sol => strip(sol, s => grade(s, 1).solved, EASY_CLUES),
  medium: sol => { const s = strip(sol, s => grade(s, 2).solved); return grade(s).level === 2 ? s : null; },
  minimal: sol => strip(sol, () => true),
};

if (runs('classic')) {
  const text = await raw('Sudokus.txt');
  const grids = shuffle(text.split(/\r?\n/).filter(l => /^[1-9]{81}$/.test(l)));
  let next = 0;
  const relabelled = () => {
    const names = shuffle(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    return grids[next++].replace(/[1-9]/g, d => names[Number(d) - 1]);
  };

  const found = { easy: [], medium: [], hard: [], extreme: [], mind_bending: [] };
  const full = d => found[d].length >= per;
  let tried = 0;
  while (Object.keys(found).some(d => !full(d)) && next < grids.length) {
    const solution = relabelled();
    tried++;
    let givens = null, difficulty = null;
    if (!full('easy')) { givens = MAKERS.easy(solution); difficulty = 'easy'; }
    else if (!full('medium') && tried % 2) { givens = MAKERS.medium(solution); difficulty = givens && 'medium'; }
    else { givens = MAKERS.minimal(solution); difficulty = GRADE_OF[grade(givens).level]; }
    if (!givens || !difficulty || full(difficulty)) continue;
    found[difficulty].push({ givens, solution });
    if (tried % 100 === 0) console.log(`  classic: ${tried} grids tried`, Object.fromEntries(Object.entries(found).map(([d, l]) => [d, l.length])));
  }

  for (const [difficulty, list] of Object.entries(found)) {
    const stats = { added: 0, duplicate: 0, skipped: 0 };
    const clues = p => p.givens.replace(/0/g, '').length;
    for (const p of list.sort((a, b) => clues(b) - clues(a))) {
      const check = checkSubmission({ kind: 'classic', difficulty, givens: p.givens });
      if (!check.ok || check.row.solution !== p.solution) { stats.skipped++; continue; }
      stats[await insert({ ...check.row, source: 'bundled' })]++;
    }
    const range = list.length ? `${clues(list[list.length - 1])}–${clues(list[0])} starting digits` : '';
    console.log(`classic ${difficulty}: ${stats.added} added, ${stats.duplicate} already there, ${stats.skipped} skipped ${range}`);
  }
  console.log(`classic: used ${tried} of ${grids.length} grids`);
}

if (dryRun) console.log('(dry run: nothing was written)');

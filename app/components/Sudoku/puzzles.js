import { KILLER_PUZZLES, CLASSIC_PUZZLES } from './data/puzzles.js';
import { parseKiller, parseAns } from './engine/parse.js';

// Must match the check constraint on sudoku_puzzles.difficulty
// (supabase/migrations).
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'extreme', label: 'Extreme' },
  { id: 'mind_bending', label: 'Mind bending' },
];

export const KINDS = [
  { id: 'killer', label: 'Killer' },
  { id: 'classic', label: 'Classic' },
];

export const isKind = k => KINDS.some(x => x.id === k);
export const isDifficulty = d => DIFFICULTIES.some(x => x.id === d);

// Normalised puzzle:
//   { id, kind, difficulty, position, name, solution, givens|null, cages|null }
// `position` is the puzzle's number within its kind and difficulty (1, 2, …).
const normalise = {
  killer: (p, position) => ({
    id: p.id, kind: 'killer', difficulty: p.difficulty, position, name: '',
    solution: parseAns(p.ans),
    givens: p.givens ?? null,
    cages: parseKiller(p.killer).cages,
  }),
  classic: (p, position) => ({
    id: p.id, kind: 'classic', difficulty: p.difficulty, position, name: '',
    solution: p.solution, givens: p.givens, cages: null,
  }),
};

const numbered = (list, kind) => {
  const seen = {};
  return list.map(p => normalise[kind](p, (seen[p.difficulty] = (seen[p.difficulty] ?? 0) + 1)));
};

/** The puzzles that ship with the site (and seed the database). */
export const PUZZLES = [
  ...numbered(KILLER_PUZZLES, 'killer'),
  ...numbered(CLASSIC_PUZZLES, 'classic'),
];

/** A sudoku_puzzles row → normalised puzzle. */
export const fromRow = r => ({
  id: r.id, kind: r.kind, difficulty: r.difficulty, position: r.position, name: r.name ?? '',
  solution: r.solution, givens: r.givens ?? null, cages: r.cages ?? null,
});

// Puzzles made in the editor and saved in this browser appear under their own tab.
export const CUSTOM = { id: 'custom', label: 'Custom' };

/** Custom record (storage.js) → normalised puzzle, numbered by its place in the tab. */
export const fromCustom = r => ({
  id: r.id, kind: r.kind, difficulty: CUSTOM.id, position: null, name: r.name,
  solution: r.solution, givens: r.givens ?? null, cages: r.cages ?? null,
});

const byPosition = (a, b) => a.position - b.position;

/** The puzzles under one kind and difficulty tab, in order. */
export const puzzlesFor = (puzzles, kind, difficulty, custom = []) =>
  difficulty === CUSTOM.id
    ? custom.filter(p => p.kind === kind)
    : puzzles.filter(p => p.kind === kind && p.difficulty === difficulty).sort(byPosition);

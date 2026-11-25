// Grades a classic sudoku by the hardest technique a person needs to solve it,
// trying easier techniques first and only moving up when they're stuck.
//
//   1  hidden singles   a digit has one place left in a row, column or box
//   2  naked singles    a cell has one digit left
//   3  locked candidates (pointing / claiming), naked and hidden pairs
//   4  naked and hidden triples, X-wing, swordfish, XY-wing
//   5  none of these finish it (needs harder chains, or trial and error)

import { rowOf, colOf, boxOf, PEERS } from './board.js';

export const LEVELS = {
  1: 'hidden singles',
  2: 'naked singles',
  3: 'locked candidates and pairs',
  4: 'triples, X-wing, swordfish, XY-wing',
  5: 'beyond standard techniques',
};

const ALL = 0b1111111110; // digits 1–9 as bits 1–9
const ROWS = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
const COLS = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c));
const BOXES = Array.from({ length: 9 }, (_, b) =>
  Array.from({ length: 9 }, (_, k) => (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (b % 3) * 3 + (k % 3)));
const UNITS = [...ROWS, ...COLS, ...BOXES];

const bitCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const digitsOf = m => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };

function* combinations(list, k, start = 0, picked = []) {
  if (picked.length === k) { yield picked; return; }
  for (let i = start; i <= list.length - (k - picked.length); i++) yield* combinations(list, k, i + 1, [...picked, list[i]]);
}

class Grid {
  constructor(givens) {
    this.value = new Array(81).fill(0);
    this.cand = new Array(81).fill(ALL);
    this.ok = true;
    for (let i = 0; i < 81; i++) if (givens[i] !== '0') this.place(i, Number(givens[i]));
  }

  place(i, d) {
    if (this.value[i]) return;
    if (!(this.cand[i] & (1 << d))) { this.ok = false; return; }
    this.value[i] = d;
    this.cand[i] = 0;
    for (const p of PEERS[i]) this.cand[p] &= ~(1 << d);
  }

  /** Removes digits (mask) from cells; true if anything changed. */
  eliminate(cells, mask) {
    let changed = false;
    for (const i of cells) {
      if (!this.value[i] && this.cand[i] & mask) { this.cand[i] &= ~mask; changed = true; }
    }
    return changed;
  }

  get solved() { return this.value.every(v => v); }
}

// ── Techniques: each makes one round of progress and returns true, or false if stuck ──

function hiddenSingles(g) {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      let spot = -1, n = 0;
      for (const i of unit) {
        if (g.value[i] === d) { n = -1; break; }
        if (g.cand[i] & bit) { spot = i; n++; }
      }
      if (n === 1) { g.place(spot, d); return true; }
    }
  }
  return false;
}

function nakedSingles(g) {
  for (let i = 0; i < 81; i++) {
    if (!g.value[i] && bitCount(g.cand[i]) === 1) { g.place(i, digitsOf(g.cand[i])[0]); return true; }
  }
  return false;
}

// A digit confined to one line within a box (or one box within a line) can be
// removed from the rest of that line (or box).
function lockedCandidates(g) {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << d;
    for (const box of BOXES) {
      const spots = box.filter(i => g.cand[i] & bit);
      if (spots.length < 2) continue;
      for (const [lineOf, lines] of [[rowOf, ROWS], [colOf, COLS]]) {
        const l = lineOf(spots[0]);
        if (spots.every(i => lineOf(i) === l) && g.eliminate(lines[l].filter(i => !box.includes(i)), bit)) return true;
      }
    }
    for (const line of [...ROWS, ...COLS]) {
      const spots = line.filter(i => g.cand[i] & bit);
      if (spots.length < 2) continue;
      const b = boxOf(spots[0]);
      if (spots.every(i => boxOf(i) === b) && g.eliminate(BOXES[b].filter(i => !line.includes(i)), bit)) return true;
    }
  }
  return false;
}

// n cells in a unit holding only n digits between them: those digits go from the rest of the unit.
function nakedSubset(g, n) {
  for (const unit of UNITS) {
    const open = unit.filter(i => !g.value[i] && bitCount(g.cand[i]) <= n);
    for (const cells of combinations(open, n)) {
      const mask = cells.reduce((m, i) => m | g.cand[i], 0);
      if (bitCount(mask) === n && g.eliminate(unit.filter(i => !cells.includes(i)), mask)) return true;
    }
  }
  return false;
}

// n digits that fit only in the same n cells of a unit: those cells lose every other digit.
function hiddenSubset(g, n) {
  for (const unit of UNITS) {
    const placed = unit.reduce((m, i) => m | (g.value[i] ? 1 << g.value[i] : 0), 0);
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !(placed & (1 << d)));
    for (const ds of combinations(digits, n)) {
      const mask = ds.reduce((m, d) => m | (1 << d), 0);
      const cells = unit.filter(i => g.cand[i] & mask);
      if (cells.length !== n) continue;
      if (!ds.every(d => cells.some(i => g.cand[i] & (1 << d)))) continue;
      let changed = false;
      for (const i of cells) if (g.cand[i] & ~mask) { g.cand[i] &= mask; changed = true; }
      if (changed) return true;
    }
  }
  return false;
}

// X-wing (n = 2) and swordfish (n = 3): a digit's spots in n rows fall in the
// same n columns, so it leaves those columns elsewhere (and the same with rows
// and columns swapped).
function fish(g, n) {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << d;
    for (const [base, cover, coverOf] of [[ROWS, COLS, colOf], [COLS, ROWS, rowOf]]) {
      const lines = base
        .map(line => line.filter(i => g.cand[i] & bit))
        .map((spots, k) => ({ k, spots }))
        .filter(x => x.spots.length >= 2 && x.spots.length <= n);
      for (const set of combinations(lines, n)) {
        const covers = new Set(set.flatMap(x => x.spots.map(coverOf)));
        if (covers.size !== n) continue;
        const inSet = new Set(set.flatMap(x => x.spots));
        const others = [...covers].flatMap(c => cover[c].filter(i => !inSet.has(i)));
        if (g.eliminate(others, bit)) return true;
      }
    }
  }
  return false;
}

// XY-wing: a pivot {x,y} sees pincers {x,z} and {y,z}; any cell seeing both pincers loses z.
function xyWing(g) {
  const pairs = [];
  for (let i = 0; i < 81; i++) if (!g.value[i] && bitCount(g.cand[i]) === 2) pairs.push(i);
  const sees = (a, b) => PEERS[a].includes(b);
  for (const pivot of pairs) {
    const pm = g.cand[pivot];
    const wings = pairs.filter(w => w !== pivot && sees(pivot, w) && bitCount(g.cand[w] & pm) === 1);
    for (const [a, b] of combinations(wings, 2)) {
      const za = g.cand[a] & ~pm, zb = g.cand[b] & ~pm;
      if (za !== zb || (g.cand[a] & pm) === (g.cand[b] & pm)) continue;
      const targets = PEERS[a].filter(i => i !== b && i !== pivot && sees(b, i));
      if (g.eliminate(targets, za)) return true;
    }
  }
  return false;
}

const TECHNIQUES = [
  [1, hiddenSingles],
  [2, nakedSingles],
  [3, lockedCandidates],
  [3, g => nakedSubset(g, 2)],
  [3, g => hiddenSubset(g, 2)],
  [4, g => nakedSubset(g, 3)],
  [4, g => hiddenSubset(g, 3)],
  [4, g => fish(g, 2)],
  [4, g => fish(g, 3)],
  [4, xyWing],
];

/**
 * @param {string} givens  81 digits, 0 = empty
 * @param {number} maxLevel  stop at techniques above this (to test "solvable with at most…")
 * @returns {{ level: 1|2|3|4|5, solved: boolean, values: string }}
 *   level 5 = not solved by the techniques allowed; values = the grid as far as it got
 */
export function grade(givens, maxLevel = 4) {
  const g = new Grid(givens);
  let level = 1;
  while (g.ok && !g.solved) {
    const step = TECHNIQUES.find(([lv, t]) => lv <= maxLevel && t(g));
    if (!step) break;
    level = Math.max(level, step[0]);
  }
  const values = g.value.join('');
  return g.ok && g.solved ? { level, solved: true, values } : { level: 5, solved: false, values };
}

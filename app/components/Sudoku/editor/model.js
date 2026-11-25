// Pure model for the puzzle editor. A draft is what the user is building:
//
// draft = {
//   kind:   'killer' | 'classic'
//   givens: string    81 chars, '0' = blank
//   cages:  { sum: number|null, cells: number[] }[]   (ignored for classic)
//   name:   string
// }
//
// Every function returns a new draft and never mutates its input.

import { rowOf, colOf, boxOf, cageIndex } from '../engine/board.js';

export const MAX_CAGE = 9;
export const GRID_TOTAL = 405; // 9 × (1 + … + 9)

export const emptyDraft = (kind = 'killer') => ({ kind, givens: '0'.repeat(81), cages: [], name: '' });

export const minCageSum = n => (n * (n + 1)) / 2;
export const maxCageSum = n => (n * (19 - n)) / 2;

export const isAdjacent = (a, b) =>
  (rowOf(a) === rowOf(b) && Math.abs(colOf(a) - colOf(b)) === 1) ||
  (colOf(a) === colOf(b) && Math.abs(rowOf(a) - rowOf(b)) === 1);

export function isContiguous(cells) {
  if (!cells.length) return false;
  const left = new Set(cells.slice(1));
  const stack = [cells[0]];
  while (stack.length) {
    const a = stack.pop();
    for (const b of [...left]) if (isAdjacent(a, b)) { left.delete(b); stack.push(b); }
  }
  return left.size === 0;
}

export function setGiven(draft, i, d) {
  const givens = draft.givens.slice(0, i) + String(d) + draft.givens.slice(i + 1);
  return givens === draft.givens ? draft : { ...draft, givens };
}

/** Can cell i be added to a cage being drawn (`cells`, possibly empty)? */
export function canExtend(draft, cells, i) {
  if (cells.includes(i) || cells.length >= MAX_CAGE) return false;
  if (cageIndex(draft.cages)[i] >= 0) return false;
  return cells.length === 0 || cells.some(c => isAdjacent(c, i));
}

export function addCage(draft, cells, sum = null) {
  return { ...draft, cages: [...draft.cages, { sum, cells: [...cells].sort((a, b) => a - b) }] };
}

export function removeCage(draft, k) {
  return { ...draft, cages: draft.cages.filter((_, j) => j !== k) };
}

export function setCageSum(draft, k, sum) {
  const cages = draft.cages.slice();
  cages[k] = { ...cages[k], sum: sum == null || Number.isNaN(sum) ? null : sum };
  return { ...draft, cages };
}

/**
 * Where the editor shows a cage's total: the cell nearest the cage's centre,
 * preferring cells without a starting digit. Printed puzzles put totals in
 * the top-left corner, so labelling the middle keeps a traced photo's own
 * numbers visible. (The player still shows totals top-left.)
 */
export function labelCell(cells, givens = '') {
  const free = cells.filter(i => !givens[i] || givens[i] === '0');
  const pool = free.length ? free : cells;
  const cr = cells.reduce((t, i) => t + rowOf(i), 0) / cells.length;
  const cc = cells.reduce((t, i) => t + colOf(i), 0) / cells.length;
  let best = pool[0], bestD = Infinity;
  for (const i of [...pool].sort((a, b) => a - b)) {
    const d = (rowOf(i) - cr) ** 2 + (colOf(i) - cc) ** 2;
    if (d < bestD - 1e-9) { best = i; bestD = d; }
  }
  return best;
}

const UNITS = [
  ...Array.from({ length: 9 }, (_, r) => ({ name: `row ${r + 1}`, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) })),
  ...Array.from({ length: 9 }, (_, c) => ({ name: `column ${c + 1}`, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) })),
  ...Array.from({ length: 9 }, (_, b) => ({ name: `box ${b + 1}`, cells: Array.from({ length: 81 }, (_, i) => i).filter(i => boxOf(i) === b) })),
];

function duplicates(givens, cells) {
  const at = {};
  for (const i of cells) {
    const d = givens[i];
    if (d !== '0') (at[d] ??= []).push(i);
  }
  return Object.entries(at).filter(([, list]) => list.length > 1);
}

/**
 * Everything that stops the draft from being a valid puzzle.
 * @returns {{ issues: { level: 'error'|'warning', message: string, cells: number[], code: string }[], ready: boolean }}
 *   ready: no errors, so it is worth running the solver.
 */
export function validate(draft) {
  const issues = [];
  const err = (message, cells = [], code = 'other') => issues.push({ level: 'error', message, cells, code });
  const { givens } = draft;

  for (const u of UNITS) {
    for (const [d, cells] of duplicates(givens, u.cells)) err(`Two ${d}s in ${u.name}.`, cells, 'duplicate');
  }

  if (draft.kind === 'classic') {
    const count = givens.replace(/0/g, '').length;
    if (count < 17) err(`A classic puzzle needs at least 17 starting digits to have a single solution (has ${count}).`, [], 'count');
    return { issues, ready: !issues.some(x => x.level === 'error') };
  }

  const cageOf = cageIndex(draft.cages);
  const uncaged = [...Array(81).keys()].filter(i => cageOf[i] < 0);
  if (uncaged.length) err(`${uncaged.length} cell${uncaged.length === 1 ? ' isn’t' : 's aren’t'} in a cage yet.`, uncaged, 'uncaged');

  let total = 0;
  let allSums = true;
  draft.cages.forEach(cage => {
    const n = cage.cells.length;
    if (n > MAX_CAGE) err(`A cage has ${n} cells; the most is 9.`, cage.cells, 'size');
    else if (!isContiguous(cage.cells)) err('A cage’s cells aren’t all connected.', cage.cells, 'disconnected');
    for (const [d, cells] of duplicates(givens, cage.cells)) err(`Two ${d}s in one cage.`, cells, 'duplicate');

    if (cage.sum == null) { allSums = false; err('A cage needs a total.', cage.cells, 'nosum'); return; }
    total += cage.sum;
    if (n <= MAX_CAGE && (cage.sum < minCageSum(n) || cage.sum > maxCageSum(n))) {
      err(`A ${n}-cell cage must total between ${minCageSum(n)} and ${maxCageSum(n)} (has ${cage.sum}).`, cage.cells, 'range');
    }
    const placed = cage.cells.filter(i => givens[i] !== '0');
    const placedSum = placed.reduce((t, i) => t + Number(givens[i]), 0);
    if (placedSum > cage.sum || (placed.length === n && placedSum !== cage.sum)) {
      err(`The starting digits in a cage don’t fit its total of ${cage.sum}.`, cage.cells, 'fit');
    }
  });

  if (!uncaged.length && allSums && total !== GRID_TOTAL) {
    err(`Cage totals add up to ${total}; a full grid always adds up to ${GRID_TOTAL}.`, [], 'total');
  }

  return { issues, ready: !issues.some(x => x.level === 'error') };
}

/** The parts of a draft the solver needs. */
export function solverInput(draft) {
  return {
    givens: /[1-9]/.test(draft.givens) ? draft.givens : null,
    cages: draft.kind === 'killer' ? draft.cages.map(c => ({ sum: c.sum, cells: c.cells })) : null,
  };
}

/** A saved custom puzzle (see storage.js). */
export function toRecord(draft, solution, { id, now }) {
  const input = solverInput(draft);
  return {
    id,
    kind: draft.kind,
    name: draft.name.trim(),
    givens: input.givens,
    cages: input.cages,
    solution,
    updated: now,
  };
}

export function fromRecord(record) {
  return {
    kind: record.kind,
    givens: record.givens ?? '0'.repeat(81),
    cages: (record.cages ?? []).map(c => ({ sum: c.sum, cells: [...c.cells] })),
    name: record.name ?? '',
  };
}

/** Validates a draft read back from storage; returns null if it's unusable. */
export function sanitizeDraft(raw) {
  if (!raw || (raw.kind !== 'killer' && raw.kind !== 'classic')) return null;
  if (typeof raw.givens !== 'string' || !/^[0-9]{81}$/.test(raw.givens)) return null;
  if (!Array.isArray(raw.cages)) return null;
  const seen = new Set();
  const cages = [];
  for (const c of raw.cages) {
    if (!c || !Array.isArray(c.cells) || !c.cells.length) return null;
    if (c.sum != null && !Number.isInteger(c.sum)) return null;
    for (const i of c.cells) {
      if (!Number.isInteger(i) || i < 0 || i > 80 || seen.has(i)) return null;
      seen.add(i);
    }
    cages.push({ sum: c.sum ?? null, cells: [...c.cells] });
  }
  return { kind: raw.kind, givens: raw.givens, cages, name: typeof raw.name === 'string' ? raw.name : '' };
}

export const isEmptyDraft = d => !/[1-9]/.test(d.givens) && d.cages.length === 0 && !d.name.trim();

// A key that's the same for two puzzles if one is just the other turned,
// flipped, or (classic only) with its digits renamed. The database keeps it
// unique, so the same puzzle can't be published twice.
//
// Killer digits can't be renamed: the cage totals pin down which digits are which.

import { rowOf, colOf } from './board.js';

// The 8 rotations and reflections of the grid, as [row, col] → [row, col].
const SYMMETRIES = [
  (r, c) => [r, c],
  (r, c) => [c, 8 - r],
  (r, c) => [8 - r, 8 - c],
  (r, c) => [8 - c, r],
  (r, c) => [r, 8 - c],
  (r, c) => [8 - r, c],
  (r, c) => [c, r],
  (r, c) => [8 - c, 8 - r],
];

const MAPS = SYMMETRIES.map(f =>
  Array.from({ length: 81 }, (_, i) => {
    const [r, c] = f(rowOf(i), colOf(i));
    return r * 9 + c;
  }),
);

// Renames digits in order of first appearance: the first digit seen becomes 1, …
function relabel(givens) {
  const names = {};
  let next = 1;
  return givens.map(d => (d === '0' ? '0' : (names[d] ??= String(next++))));
}

/**
 * @param {{ kind: 'killer'|'classic', givens?: string|null, cages?: {sum:number, cells:number[]}[]|null }} puzzle
 * @returns {string} e.g. "killer|000…0|3:0.1,10:2.3.11,…"
 */
export function canonicalKey({ kind, givens, cages }) {
  const g0 = givens ?? '0'.repeat(81);
  let best = null;
  for (const map of MAPS) {
    let g = Array(81);
    for (let i = 0; i < 81; i++) g[map[i]] = g0[i];
    if (kind === 'classic') g = relabel(g);
    const cageText = kind === 'killer'
      ? (cages ?? [])
        .map(c => ({ sum: c.sum, cells: c.cells.map(i => map[i]).sort((a, b) => a - b) }))
        .sort((a, b) => a.cells[0] - b.cells[0])
        .map(c => `${c.sum}:${c.cells.join('.')}`)
        .join(',')
      : '';
    const key = `${kind}|${g.join('')}|${cageText}`;
    if (best === null || key < best) best = key;
  }
  return best;
}

// Backtracking solver for classic and killer sudoku. Used to check that a
// puzzle has exactly one solution (the bundled answer key) before shipping it.

const ALL = 0x3fe; // bits 1..9

const boxIndex = i => (((i / 27) | 0) * 3) + (((i % 9) / 3) | 0);

function digitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

function popcount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
}

/**
 * Counts solutions up to `limit`.
 * @param {{ givens?: string, cages?: {sum:number, cells:number[]}[] }} puzzle
 *   givens: 81 chars, '0' or '.' for blanks.
 * @param {number} limit  stop after this many solutions
 * @param {number} maxNodes  give up (aborted: true) after this many search steps
 * @returns {{ count: number, solution: string|null, solutions: string[], aborted: boolean }}
 */
export function countSolutions({ givens = null, cages = null }, limit = 2, maxNodes = Infinity) {
  const grid = new Int8Array(81);
  const rowM = new Int16Array(9), colM = new Int16Array(9), boxM = new Int16Array(9);
  const cageOf = new Int16Array(81).fill(-1);
  const cSum = [], cSize = [], cFilled = [], cTotal = [], cMask = [];

  (cages ?? []).forEach((cage, k) => {
    for (const i of cage.cells) cageOf[i] = k;
    cSum[k] = cage.sum; cSize[k] = cage.cells.length;
    cFilled[k] = 0; cTotal[k] = 0; cMask[k] = 0;
  });

  const place = (i, d, sign) => {
    const bit = 1 << d, r = (i / 9) | 0, c = i % 9, b = boxIndex(i);
    rowM[r] ^= bit; colM[c] ^= bit; boxM[b] ^= bit;
    grid[i] = sign > 0 ? d : 0;
    const k = cageOf[i];
    if (k >= 0) { cMask[k] ^= bit; cFilled[k] += sign; cTotal[k] += sign * d; }
  };

  // Can digit d still go into cage k without making its sum unreachable?
  const feasible = (k, d) => {
    const rem = cSum[k] - cTotal[k] - d;
    const left = cSize[k] - cFilled[k] - 1;
    if (left === 0) return rem === 0;
    const avail = digitsOf(ALL & ~cMask[k] & ~(1 << d));
    if (avail.length < left) return false;
    let min = 0, max = 0;
    for (let j = 0; j < left; j++) { min += avail[j]; max += avail[avail.length - 1 - j]; }
    return rem >= min && rem <= max;
  };

  const candidates = i => {
    let m = ALL & ~(rowM[(i / 9) | 0] | colM[i % 9] | boxM[boxIndex(i)]);
    const k = cageOf[i];
    if (k >= 0) {
      m &= ~cMask[k];
      let ok = 0;
      for (const d of digitsOf(m)) if (feasible(k, d)) ok |= 1 << d;
      m = ok;
    }
    return m;
  };

  if (givens) {
    for (let i = 0; i < 81; i++) {
      const d = Number(givens[i]) || 0;
      if (!d) continue;
      if (!(candidates(i) & (1 << d))) return { count: 0, solution: null, solutions: [], aborted: false };
      place(i, d, 1);
    }
  }

  let count = 0;
  let nodes = 0;
  let aborted = false;
  const solutions = [];

  const search = () => {
    if (++nodes > maxNodes) { aborted = true; return true; }
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const m = candidates(i);
      const n = popcount(m);
      if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) {
      count++;
      solutions.push(Array.from(grid).join(''));
      return count >= limit;
    }
    for (const d of digitsOf(bestMask)) {
      place(best, d, 1);
      const done = search();
      place(best, d, -1);
      if (done) return true;
    }
    return false;
  };

  search();
  return { count, solution: solutions[0] ?? null, solutions, aborted };
}

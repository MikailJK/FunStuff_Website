// Pure board state for the sudoku player. Every function returns a new board
// and never mutates its input, so the UI can keep it in React state as-is.
//
// board = {
//   values: number[81]   0 = empty
//   givens: boolean[81]  true for fixed clues (classic puzzles only)
//   marks:  number[81]   pencil-mark bitmask, bit d set = digit d marked
// }

export const rowOf = i => (i / 9) | 0;
export const colOf = i => i % 9;
export const boxOf = i => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

// Cells sharing a row, column or box with each cell.
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) out.push(j);
  }
  return out;
});

/** Maps each cell to its cage index, or -1. */
export function cageIndex(cages) {
  const cageOf = new Array(81).fill(-1);
  (cages ?? []).forEach((cage, k) => cage.cells.forEach(i => { cageOf[i] = k; }));
  return cageOf;
}

export function createBoard(puzzle) {
  const values = new Array(81).fill(0);
  const givens = new Array(81).fill(false);
  if (puzzle.givens) {
    for (let i = 0; i < 81; i++) {
      const d = Number(puzzle.givens[i]) || 0;
      if (d) { values[i] = d; givens[i] = true; }
    }
  }
  return { values, givens, marks: new Array(81).fill(0) };
}

/**
 * Places an answer, replacing whatever was there, and clears that digit's
 * pencil marks from every peer (row, column, box, plus `extraPeers` such as
 * the rest of a killer cage).
 *
 * With `keepMarks`, no pencil marks are touched: the cell's own marks stay
 * underneath the answer (hidden) and reappear if it is erased. Used for
 * answers already known to be wrong.
 */
export function placeAnswer(board, i, d, extraPeers = [], { keepMarks = false } = {}) {
  if (board.givens[i]) return board;
  const values = board.values.slice();
  values[i] = d;
  if (keepMarks) return { ...board, values };
  const marks = board.marks.slice();
  marks[i] = 0;
  const clear = ~(1 << d);
  for (const j of PEERS[i]) marks[j] &= clear;
  for (const j of extraPeers) if (j !== i) marks[j] &= clear;
  return { ...board, values, marks };
}

/** Adds the pencil mark if absent, removes it if present. Ignored on filled cells. */
export function toggleMark(board, i, d) {
  if (board.values[i]) return board;
  const marks = board.marks.slice();
  marks[i] ^= 1 << d;
  return { ...board, marks };
}

/**
 * Clears the answer if there is one (revealing any marks kept underneath),
 * otherwise the pencil marks. Givens are kept.
 */
export function eraseCell(board, i) {
  if (board.givens[i]) return board;
  if (board.values[i]) {
    const values = board.values.slice();
    values[i] = 0;
    return { ...board, values };
  }
  if (!board.marks[i]) return board;
  const marks = board.marks.slice();
  marks[i] = 0;
  return { ...board, marks };
}

export const hasMark = (board, i, d) => (board.marks[i] & (1 << d)) !== 0;

export const isWrong = (board, i, solution) =>
  board.values[i] !== 0 && board.values[i] !== Number(solution[i]);

export const isSolved = (board, solution) =>
  board.values.every((v, i) => v === Number(solution[i]));

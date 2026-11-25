// Compact, validated save format for one puzzle's progress.
//
// entry = {
//   fp: string      fingerprint of the puzzle, so a save is ignored if the
//                   bundled puzzle under that id ever changes
//   v:  string      81 digits, '0' = empty (givens included)
//   m:  string      81 comma-separated base-36 pencil-mark bitmasks
//   x:  number      mistakes
//   s:  boolean     solved at least once
// }

import { createBoard } from './board.js';

/** Short stable hash of everything that defines the puzzle. */
export function fingerprint(puzzle) {
  const text = `${puzzle.solution}|${puzzle.givens ?? ''}|${JSON.stringify(puzzle.cages ?? [])}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function encodeEntry(puzzle, board, { mistakes = 0, solved = false } = {}) {
  return {
    fp: fingerprint(puzzle),
    v: board.values.join(''),
    m: board.marks.map(m => m.toString(36)).join(','),
    x: mistakes,
    s: !!solved,
  };
}

/** True if the user has entered anything (answers or marks) beyond the givens. */
export function hasProgress(board) {
  return board.values.some((v, i) => v && !board.givens[i]) || board.marks.some(Boolean);
}

/**
 * Rebuilds { board, mistakes, solved } from a saved entry, or returns null if
 * the entry is missing, malformed, or saved against a different puzzle.
 * Givens always come from the puzzle, never from the save.
 */
export function decodeEntry(puzzle, entry) {
  if (!entry || typeof entry !== 'object' || entry.fp !== fingerprint(puzzle)) return null;
  if (typeof entry.v !== 'string' || !/^[0-9]{81}$/.test(entry.v)) return null;
  const marks = typeof entry.m === 'string' ? entry.m.split(',').map(t => parseInt(t, 36)) : [];
  if (marks.length !== 81 || marks.some(m => !Number.isInteger(m) || m < 0 || m > 0x3fe)) return null;

  const board = createBoard(puzzle);
  for (let i = 0; i < 81; i++) {
    if (board.givens[i]) continue;
    board.values[i] = Number(entry.v[i]);
    board.marks[i] = marks[i] & 0x3fe; // may sit under a wrong answer
  }
  const mistakes = Number.isInteger(entry.x) && entry.x >= 0 ? entry.x : 0;
  return { board, mistakes, solved: entry.s === true };
}

/**
 * For the puzzle picker. A solved puzzle that has been restarted and partly
 * filled again is both solved and in progress.
 */
export function entryStatus(puzzle, entry) {
  const d = decodeEntry(puzzle, entry);
  if (!d) return { solved: false, inProgress: false };
  const full = d.board.values.every(Boolean);
  return { solved: d.solved, inProgress: hasProgress(d.board) && !(d.solved && full) };
}

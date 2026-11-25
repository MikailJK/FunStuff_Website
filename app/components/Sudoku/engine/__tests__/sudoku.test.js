import { describe, it, expect } from 'vitest';
import { parseKiller, parseAns } from '../parse.js';
import { countSolutions } from '../solver.js';
import { createBoard, placeAnswer, toggleMark, eraseCell, hasMark, isWrong, isSolved, PEERS, cageIndex } from '../board.js';
import { encodeEntry, decodeEntry, hasProgress, entryStatus } from '../serialize.js';
import { PUZZLES, DIFFICULTIES, KINDS, puzzlesFor } from '../../puzzles.js';

describe('parse', () => {
  it('reads cages with and without per-cell values', () => {
    const { cages, values } = parseKiller('11=(0, 5),6+(0, 4),5\n3=(7, 6)\n');
    expect(cages).toEqual([{ sum: 11, cells: [5, 4] }, { sum: 3, cells: [69] }]);
    expect(values[5]).toBe(6);
    expect(values[69]).toBe(null);
  });

  it('flattens an .ans grid', () => {
    const ans = parseAns('[1, 2, 3, 4, 5, 6, 7, 8, 9]\n'.repeat(9));
    expect(ans).toHaveLength(81);
    expect(ans.slice(0, 9)).toBe('123456789');
  });
});

describe('bundled puzzles', () => {
  it('has puzzles for every kind and difficulty up to extreme, numbered from 1', () => {
    for (const k of KINDS) {
      for (const d of DIFFICULTIES.filter(x => x.id !== 'mind_bending')) {
        const list = puzzlesFor(PUZZLES, k.id, d.id);
        expect(list.map(p => p.position)).toEqual(list.map((_, i) => i + 1));
        expect(list.length).toBeGreaterThan(0);
      }
    }
  });

  for (const p of PUZZLES) {
    it(`${p.id} is well formed and has exactly one solution`, () => {
      if (p.cages) {
        const covered = p.cages.flatMap(c => c.cells).sort((a, b) => a - b);
        expect(covered).toEqual([...Array(81).keys()]);
        for (const c of p.cages) {
          expect(c.cells.reduce((t, i) => t + Number(p.solution[i]), 0)).toBe(c.sum);
        }
      }
      if (p.givens) {
        for (let i = 0; i < 81; i++) if (p.givens[i] !== '0') expect(p.givens[i]).toBe(p.solution[i]);
      }
      const r = countSolutions({ givens: p.givens, cages: p.cages }, 2);
      expect(r.count).toBe(1);
      expect(r.solution).toBe(p.solution);
    });
  }
});

describe('serialize', () => {
  const classic = PUZZLES.find(p => p.kind === 'classic');
  const killer = PUZZLES.find(p => p.kind === 'killer');
  const firstBlank = classic.givens.indexOf('0');

  it('round-trips answers, marks, mistakes and solved', () => {
    let b = createBoard(classic);
    b = placeAnswer(b, firstBlank, 4);
    b = toggleMark(b, classic.givens.indexOf('0', firstBlank + 1), 7);
    const d = decodeEntry(classic, JSON.parse(JSON.stringify(encodeEntry(classic, b, { mistakes: 3, solved: true }))));
    expect(d.board).toEqual(b);
    expect(d.mistakes).toBe(3);
    expect(d.solved).toBe(true);
  });

  it('rejects saves from a different or changed puzzle, and junk', () => {
    const e = encodeEntry(killer, createBoard(killer));
    expect(decodeEntry(classic, e)).toBe(null);
    expect(decodeEntry(killer, { ...e, fp: 'x' })).toBe(null);
    expect(decodeEntry(killer, { ...e, v: 'abc' })).toBe(null);
    expect(decodeEntry(killer, { ...e, m: '1,2' })).toBe(null);
    expect(decodeEntry(killer, null)).toBe(null);
  });

  it('never lets a save overwrite givens', () => {
    const givenAt = classic.givens.search(/[1-9]/);
    const e = encodeEntry(classic, createBoard(classic));
    const v = e.v.slice(0, givenAt) + '0' + e.v.slice(givenAt + 1);
    expect(decodeEntry(classic, { ...e, v }).board.values[givenAt]).toBe(Number(classic.givens[givenAt]));
  });

  it('reports status for the picker', () => {
    const empty = createBoard(killer);
    expect(hasProgress(empty)).toBe(false);
    expect(entryStatus(killer, undefined)).toEqual({ solved: false, inProgress: false });
    expect(entryStatus(killer, encodeEntry(killer, toggleMark(empty, 0, 1)))).toEqual({ solved: false, inProgress: true });
    expect(entryStatus(killer, encodeEntry(killer, empty, { solved: true }))).toEqual({ solved: true, inProgress: false });
    let full = empty;
    for (let i = 0; i < 81; i++) full = placeAnswer(full, i, Number(killer.solution[i]));
    expect(entryStatus(killer, encodeEntry(killer, full, { solved: true }))).toEqual({ solved: true, inProgress: false });
  });
});

describe('board', () => {
  const puzzle = { givens: '5' + '0'.repeat(80) };

  it('locks givens', () => {
    const b = createBoard(puzzle);
    expect(placeAnswer(b, 0, 3)).toBe(b);
    expect(eraseCell(b, 0)).toBe(b);
  });

  it('answers replace the previous answer and clear the cell\'s marks', () => {
    let b = createBoard({});
    b = toggleMark(b, 10, 4);
    b = placeAnswer(b, 10, 2);
    b = placeAnswer(b, 10, 7);
    expect(b.values[10]).toBe(7);
    expect(b.marks[10]).toBe(0);
  });

  it('pencil marks toggle and are ignored on filled cells', () => {
    let b = createBoard({});
    b = toggleMark(b, 3, 4);
    b = toggleMark(b, 3, 6);
    expect(hasMark(b, 3, 4) && hasMark(b, 3, 6)).toBe(true);
    b = toggleMark(b, 3, 4);
    expect(hasMark(b, 3, 4)).toBe(false);
    b = placeAnswer(b, 3, 1);
    expect(toggleMark(b, 3, 2)).toBe(b);
  });

  it('placing an answer removes that mark from peers (and extra peers) only', () => {
    let b = createBoard({});
    const far = 80; // not a peer of cell 0
    for (const i of [1, 9, 10, far]) b = toggleMark(b, i, 5);
    b = toggleMark(b, 1, 6);
    b = placeAnswer(b, 0, 5);
    expect(hasMark(b, 1, 5) || hasMark(b, 9, 5) || hasMark(b, 10, 5)).toBe(false);
    expect(hasMark(b, 1, 6)).toBe(true);
    expect(hasMark(b, far, 5)).toBe(true);
    b = placeAnswer(toggleMark(b, 40, 7), 0, 7, [0, 40]);
    expect(hasMark(b, 40, 7)).toBe(false);
  });

  it('keepMarks leaves all marks in place, and erasing reveals the cell\'s own', () => {
    let b = createBoard({});
    b = toggleMark(toggleMark(b, 0, 5), 0, 6);
    b = toggleMark(b, 1, 5);
    b = placeAnswer(b, 0, 5, [], { keepMarks: true });
    expect(b.values[0]).toBe(5);
    expect(hasMark(b, 1, 5)).toBe(true);
    b = eraseCell(b, 0);
    expect(b.values[0]).toBe(0);
    expect(hasMark(b, 0, 5) && hasMark(b, 0, 6)).toBe(true);
  });

  it('marks under a wrong answer survive a save round-trip', () => {
    const p = PUZZLES.find(q => q.kind === 'killer');
    let b = toggleMark(createBoard(p), 0, 3);
    b = placeAnswer(b, 0, (Number(p.solution[0]) % 9) + 1, [], { keepMarks: true });
    expect(decodeEntry(p, encodeEntry(p, b)).board).toEqual(b);
  });

  it('erase clears the answer first, then marks', () => {
    let b = toggleMark(createBoard({}), 4, 3);
    b = eraseCell(b, 4);
    expect(b.marks[4]).toBe(0);
    b = eraseCell(placeAnswer(b, 4, 9), 4);
    expect(b.values[4]).toBe(0);
  });

  it('checks against the solution', () => {
    const p = PUZZLES[0];
    let b = createBoard(p);
    const wrong = (Number(p.solution[0]) % 9) + 1;
    b = placeAnswer(b, 0, wrong);
    expect(isWrong(b, 0, p.solution)).toBe(true);
    for (let i = 0; i < 81; i++) b = placeAnswer(b, i, Number(p.solution[i]));
    expect(isSolved(b, p.solution)).toBe(true);
  });

  it('peer and cage tables are consistent', () => {
    expect(PEERS.every(p => p.length === 20)).toBe(true);
    const cageOf = cageIndex([{ sum: 3, cells: [0, 1] }]);
    expect(cageOf[1]).toBe(0);
    expect(cageOf[2]).toBe(-1);
  });
});

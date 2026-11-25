import { describe, it, expect } from 'vitest';
import {
  emptyDraft, setGiven, canExtend, addCage, removeCage, setCageSum, validate, solverInput,
  toRecord, fromRecord, sanitizeDraft, isContiguous, minCageSum, maxCageSum, isEmptyDraft, labelCell,
} from '../model.js';
import { countSolutions } from '../../engine/solver.js';
import { PUZZLES } from '../../puzzles.js';

const codes = d => validate(d).issues.map(x => x.code);

// A draft rebuilt from a bundled puzzle, as if drawn by hand.
const draftOf = p => {
  let d = emptyDraft(p.kind);
  if (p.givens) d = { ...d, givens: p.givens };
  for (const c of p.cages ?? []) d = addCage(d, c.cells, c.sum);
  return d;
};

describe('editing', () => {
  it('sets and clears givens without touching the input', () => {
    const d0 = emptyDraft('classic');
    const d1 = setGiven(d0, 10, 7);
    expect(d1.givens[10]).toBe('7');
    expect(d0.givens[10]).toBe('0');
    expect(setGiven(d1, 10, 0).givens).toBe(d0.givens);
    expect(setGiven(d1, 10, 7)).toBe(d1);
  });

  it('only extends cages through free, adjacent cells, up to 9', () => {
    const d = addCage(emptyDraft(), [0, 1]);
    expect(canExtend(d, [], 0)).toBe(false); // already caged
    expect(canExtend(d, [], 2)).toBe(true);
    expect(canExtend(d, [2], 12)).toBe(false); // diagonal
    expect(canExtend(d, [2], 11)).toBe(true);
    expect(canExtend(d, [2], 2)).toBe(false);
    expect(canExtend(d, [9, 10, 11, 12, 13, 14, 15, 16, 17], 18)).toBe(false);
  });

  it('adds, re-totals and removes cages', () => {
    let d = addCage(emptyDraft(), [1, 0]);
    expect(d.cages[0]).toEqual({ sum: null, cells: [0, 1] });
    d = setCageSum(d, 0, 12);
    expect(d.cages[0].sum).toBe(12);
    d = setCageSum(d, 0, Number.NaN);
    expect(d.cages[0].sum).toBe(null);
    expect(removeCage(d, 0).cages).toEqual([]);
  });

  it('puts the editor label for a cage total in the cage’s middle cell', () => {
    expect(labelCell([0, 1, 2])).toBe(1);           // a row of three: the middle one
    expect(labelCell([0, 9, 18])).toBe(9);          // a column of three
    expect(labelCell([0, 1, 9, 10])).toBe(0);       // a 2×2 square: ties go to the first
    expect(labelCell([5])).toBe(5);
    // L shape: nearest the centre of mass, not the top-left corner.
    expect(labelCell([0, 9, 18, 19, 20])).toBe(9);
    // Avoids a cell holding a starting digit when it can.
    expect(labelCell([0, 1, 2], '0' + '7'.padEnd(80, '0'))).toBe(0);
    expect(labelCell([1], '0' + '7'.padEnd(80, '0'))).toBe(1);
  });

  it('knows contiguity and cage sum bounds', () => {
    expect(isContiguous([0, 1, 10])).toBe(true);
    expect(isContiguous([0, 10])).toBe(false);
    expect([minCageSum(1), maxCageSum(1), minCageSum(2), maxCageSum(2), minCageSum(9), maxCageSum(9)]).toEqual([1, 9, 3, 17, 45, 45]);
  });
});

describe('validate', () => {
  it('accepts every bundled puzzle, and the solver agrees with its answer', () => {
    for (const p of PUZZLES) {
      const d = draftOf(p);
      expect(validate(d).issues).toEqual([]);
      const r = countSolutions(solverInput(d), 2);
      expect(r.count).toBe(1);
      expect(r.solution).toBe(p.solution);
    }
  });

  it('flags duplicate givens by unit', () => {
    const d = setGiven(setGiven(emptyDraft('classic'), 0, 5), 8, 5);
    const dup = validate(d).issues.find(x => x.code === 'duplicate');
    expect(dup.message).toBe('Two 5s in row 1.');
    expect(dup.cells).toEqual([0, 8]);
  });

  it('needs 17 classic clues', () => {
    expect(codes(emptyDraft('classic'))).toContain('count');
  });

  it('reports uncaged cells, missing totals, bad ranges and the 405 rule', () => {
    let d = addCage(emptyDraft(), [0, 1]);
    expect(codes(d)).toEqual(expect.arrayContaining(['uncaged', 'nosum']));
    d = setCageSum(d, 0, 18);
    expect(codes(d)).toContain('range');

    const p = PUZZLES.find(q => q.kind === 'killer' && !q.givens);
    const good = draftOf(p);
    const k = good.cages.findIndex(c => c.cells.length >= 2 && c.sum < maxCageSum(c.cells.length));
    expect(codes(setCageSum(good, k, good.cages[k].sum + 1))).toEqual(['total']);
  });

  it('checks givens against their cage', () => {
    let d = addCage(emptyDraft(), [0, 1], 5);
    d = setGiven(setGiven(d, 0, 4), 1, 4);
    expect(codes(d)).toContain('duplicate');
    d = setGiven(setGiven(addCage(emptyDraft(), [0, 1], 5), 0, 3), 1, 4);
    expect(codes(d)).toContain('fit');
  });

  it('catches broken cages from imports', () => {
    const d = { ...emptyDraft(), cages: [{ sum: 10, cells: [0, 2] }, { sum: 45, cells: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] }] };
    expect(codes(d)).toEqual(expect.arrayContaining(['disconnected', 'size']));
  });
});

describe('records and drafts', () => {
  it('round-trips through a saved record', () => {
    const p = PUZZLES.find(q => q.kind === 'killer' && q.givens);
    const d = { ...draftOf(p), name: '  Mine  ' };
    const r = toRecord(d, p.solution, { id: 'custom-x', now: 1 });
    expect(r).toMatchObject({ id: 'custom-x', kind: 'killer', name: 'Mine', givens: p.givens, solution: p.solution, updated: 1 });
    expect(fromRecord(r)).toEqual({ ...d, name: 'Mine' });
  });

  it('classic records drop cages; givens-free killers store null givens', () => {
    const classic = { ...addCage(emptyDraft('classic'), [0]), givens: '1'.padEnd(81, '0') };
    expect(toRecord(classic, '1'.repeat(81), { id: 'a', now: 0 }).cages).toBe(null);
    expect(toRecord(emptyDraft('killer'), '1'.repeat(81), { id: 'b', now: 0 }).givens).toBe(null);
  });

  it('sanitises stored drafts', () => {
    const d = addCage(setGiven(emptyDraft(), 3, 9), [0, 1], 7);
    expect(sanitizeDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(sanitizeDraft(null)).toBe(null);
    expect(sanitizeDraft({ ...d, kind: 'x' })).toBe(null);
    expect(sanitizeDraft({ ...d, givens: '12' })).toBe(null);
    expect(sanitizeDraft({ ...d, cages: [{ sum: 3, cells: [0] }, { sum: 4, cells: [0] }] })).toBe(null);
    expect(isEmptyDraft(emptyDraft())).toBe(true);
    expect(isEmptyDraft(d)).toBe(false);
  });
});

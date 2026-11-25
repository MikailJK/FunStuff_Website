import { describe, it, expect } from 'vitest';
import { checkSubmission } from '../submission.js';
import { canonicalKey } from '../../engine/canonical.js';
import { rowOf, colOf } from '../../engine/board.js';
import { PUZZLES } from '../../puzzles.js';

const killer = PUZZLES.find(p => p.kind === 'killer' && p.givens);
const classic = PUZZLES.find(p => p.kind === 'classic');
const body = (p, extra = {}) => ({ kind: p.kind, difficulty: 'hard', givens: p.givens, cages: p.cages, name: 'Mine', ...extra });

// Moves every cell of a puzzle with a [row, col] → [row, col] map.
const transform = (p, f) => {
  const at = i => { const [r, c] = f(rowOf(i), colOf(i)); return r * 9 + c; };
  const move = s => { if (!s) return s; const out = Array(81); for (let i = 0; i < 81; i++) out[at(i)] = s[i]; return out.join(''); };
  return { ...p, givens: move(p.givens), cages: p.cages && p.cages.map(c => ({ sum: c.sum, cells: c.cells.map(at) })) };
};
const rotate = p => transform(p, (r, c) => [c, 8 - r]);
const mirror = p => transform(p, (r, c) => [r, 8 - c]);

describe('canonicalKey', () => {
  it('is the same for rotations and reflections', () => {
    for (const p of [killer, classic]) {
      const k = canonicalKey(p);
      expect(canonicalKey(rotate(p))).toBe(k);
      expect(canonicalKey(rotate(rotate(p)))).toBe(k);
      expect(canonicalKey(mirror(p))).toBe(k);
      expect(canonicalKey(mirror(rotate(p)))).toBe(k);
    }
  });

  it('ignores cage order and cell order within a cage', () => {
    const shuffled = { ...killer, cages: [...killer.cages].reverse().map(c => ({ sum: c.sum, cells: [...c.cells].reverse() })) };
    expect(canonicalKey(shuffled)).toBe(canonicalKey(killer));
  });

  it('treats renamed digits as the same classic puzzle, but not the same killer', () => {
    const swap = s => s.replace(/[1-9]/g, d => String(10 - Number(d))); // 1↔9, 2↔8, …
    expect(canonicalKey({ ...classic, givens: swap(classic.givens) })).toBe(canonicalKey(classic));
    expect(canonicalKey({ ...killer, givens: swap(killer.givens) })).not.toBe(canonicalKey(killer));
  });

  it('tells different puzzles apart', () => {
    const keys = new Set(PUZZLES.map(canonicalKey));
    expect(keys.size).toBe(PUZZLES.length);
  });
});

describe('checkSubmission', () => {
  it('accepts a puzzle with one solution, using the solution it finds itself', () => {
    const r = checkSubmission(body(killer, { solution: '1'.repeat(81) }));
    expect(r.ok).toBe(true);
    expect(r.row).toMatchObject({ kind: 'killer', difficulty: 'hard', name: 'Mine', givens: killer.givens, solution: killer.solution });
    expect(r.row.canonical).toBe(canonicalKey(killer));
    expect(r.row).not.toHaveProperty('position');

    const c = checkSubmission(body(classic));
    expect(c.ok).toBe(true);
    expect(c.row.cages).toBe(null);
  });

  it('rejects more than one solution, no solution, and unfinished puzzles', () => {
    // Take clues away until it stops being unique.
    let givens = classic.givens, many;
    do {
      givens = givens.replace(/[1-9]/, '0');
      many = checkSubmission(body({ ...classic, givens }));
    } while (many.ok);
    expect(many).toMatchObject({ status: 422, error: 'This puzzle has more than one solution.' });

    const g = classic.givens.split('');
    const empty = g.findIndex(d => d === '0');
    g[empty] = classic.solution[empty] === '9' ? '8' : '9'; // a wrong digit
    expect(checkSubmission(body({ ...classic, givens: g.join('') }))).toMatchObject({ ok: false, status: 422 });

    expect(checkSubmission(body({ ...killer, cages: killer.cages.slice(1) }))).toMatchObject({ ok: false, status: 422 });
  });

  it('rejects junk and an unknown difficulty', () => {
    expect(checkSubmission(null)).toMatchObject({ ok: false, status: 400 });
    expect(checkSubmission(body(killer, { difficulty: 'expert' }))).toMatchObject({ ok: false, status: 400 });
    expect(checkSubmission(body(killer, { givens: '12' }))).toMatchObject({ ok: false, status: 400 });
    expect(checkSubmission(body(killer, { cages: [{ sum: 3, cells: [0] }, { sum: 4, cells: [0] }] }))).toMatchObject({ ok: false, status: 400 });
  });

  it('gives up on puzzles too hard to verify', () => {
    const hard = PUZZLES.find(p => p.id === 'killer-hard-2');
    expect(checkSubmission(body(hard), { maxNodes: 100 })).toMatchObject({ ok: false, status: 422 });
  });

  it('cleans up the name', () => {
    expect(checkSubmission(body(killer, { name: `  a\u0000b${'x'.repeat(60)}  ` })).row.name).toBe(`ab${'x'.repeat(38)}`);
    expect(checkSubmission(body(killer, { name: 42 })).row.name).toBe('');
  });
});

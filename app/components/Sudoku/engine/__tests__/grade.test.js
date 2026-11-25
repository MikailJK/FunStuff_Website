import { describe, it, expect } from 'vitest';
import { grade } from '../grade.js';
import { PUZZLES } from '../../puzzles.js';

const classics = PUZZLES.filter(p => p.kind === 'classic');

describe('grade', () => {
  it('fills a nearly full grid with hidden singles', () => {
    const p = classics[0];
    const g = p.solution.slice(0, 40) + '0' + p.solution.slice(41);
    expect(grade(g)).toEqual({ level: 1, solved: true, values: p.solution });
  });

  it('only ever writes correct digits', () => {
    for (const p of classics) {
      const { values } = grade(p.givens);
      for (let i = 0; i < 81; i++) if (values[i] !== '0') expect(values[i]).toBe(p.solution[i]);
    }
  });

  it('reaches the solution whenever it says it solved the puzzle', () => {
    for (const p of classics) {
      const r = grade(p.givens);
      if (r.solved) expect(r.values).toBe(p.solution);
      else expect(r.level).toBe(5);
    }
  });

  it('needs higher techniques for harder puzzles, and stops when they are not allowed', () => {
    const levels = classics.map(p => grade(p.givens).level);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(4);
    const p = classics[levels.findIndex(l => l === 4)];
    expect(grade(p.givens, 3)).toMatchObject({ level: 5, solved: false });
  });

  it('notices a contradiction', () => {
    const p = classics[0];
    const i = [...p.givens].findIndex(d => d === '0');
    const bad = p.givens.slice(0, i) + (p.solution[i] === '9' ? '8' : '9') + p.givens.slice(i + 1);
    expect(grade(bad).solved).toBe(false);
  });
});

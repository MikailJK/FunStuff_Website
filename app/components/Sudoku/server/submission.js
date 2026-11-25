// Checks a puzzle someone wants to publish. Pure (no database), so the server
// route and the tests share it. Nothing from the browser is trusted: the
// puzzle is re-validated and re-solved here, and the solution stored is the
// one found here.

import { sanitizeDraft, validate, solverInput } from '../editor/model.js';
import { countSolutions } from '../engine/solver.js';
import { canonicalKey } from '../engine/canonical.js';
import { isDifficulty } from '../puzzles.js';

// About a million steps a second; the bundled puzzles all need under 150k.
// Past this the server gives up rather than tie up a request.
export const SERVER_NODES = 4_000_000;
export const MAX_NAME = 40;

const fail = (status, error) => ({ ok: false, status, error });

/**
 * @param {unknown} body  { kind, difficulty, givens, cages, name }
 * @returns {{ ok: true, row: object } | { ok: false, status: number, error: string }}
 *   row: the columns to insert (the database assigns position).
 */
export function checkSubmission(body, { maxNodes = SERVER_NODES } = {}) {
  if (!body || typeof body !== 'object') return fail(400, 'Expected a puzzle.');
  if (!isDifficulty(body.difficulty)) return fail(400, 'Pick a difficulty.');
  if (Array.isArray(body.cages) && body.cages.length > 81) return fail(400, 'That isn’t a valid puzzle.');

  const draft = sanitizeDraft({
    kind: body.kind,
    givens: body.givens ?? '0'.repeat(81),
    cages: body.kind === 'killer' ? body.cages : [],
    name: '',
  });
  if (!draft) return fail(400, 'That isn’t a valid puzzle.');

  const { issues, ready } = validate(draft);
  if (!ready) return fail(422, issues.find(x => x.level === 'error')?.message ?? 'The puzzle isn’t finished.');

  const input = solverInput(draft);
  const result = countSolutions(input, 2, maxNodes);
  if (result.aborted) return fail(422, 'This puzzle is too hard for the server to verify, so it can’t be published.');
  if (result.count === 0) return fail(422, 'This puzzle has no solution.');
  if (result.count > 1) return fail(422, 'This puzzle has more than one solution.');

  const name = typeof body.name === 'string'
    ? body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME)
    : '';

  return {
    ok: true,
    row: {
      kind: draft.kind,
      difficulty: body.difficulty,
      name,
      givens: input.givens,
      cages: input.cages,
      solution: result.solutions[0],
      canonical: canonicalKey({ kind: draft.kind, ...input }),
    },
  };
}

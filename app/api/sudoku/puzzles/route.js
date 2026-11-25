// POST /api/sudoku/puzzles — publish a puzzle for everyone.
// Body: { kind, difficulty, givens, cages, name }
//
// 201 { puzzle }               published
// 409 { error, puzzle }        already published (puzzle = the existing one)
// 400/422 { error }            not a valid puzzle / not exactly one solution
// 429 { error }                publishing too often
// 503 { error }                database not configured

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { checkSubmission } from '../../../components/Sudoku/server/submission.js';
import {
  canWrite, findByCanonical, recentCount, insertPuzzle, submitterOf, RATE_LIMIT, PUZZLES_TAG,
} from '../../../components/Sudoku/server/db.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // the solver can take a few seconds on a hard puzzle

const MAX_BODY = 20_000;
const reply = (status, body) => NextResponse.json(body, { status });

const clientIp = req =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';

export async function POST(req) {
  if (!canWrite()) return reply(503, { error: 'Publishing isn’t set up on this site yet.' });

  const text = await req.text();
  if (text.length > MAX_BODY) return reply(413, { error: 'That puzzle is too large.' });
  let body;
  try { body = JSON.parse(text); } catch { return reply(400, { error: 'Expected a puzzle.' }); }

  try {
    const submitter = submitterOf(clientIp(req));
    if (await recentCount(submitter) >= RATE_LIMIT.count) {
      return reply(429, { error: `You can publish up to ${RATE_LIMIT.count} puzzles an hour. Try again later.` });
    }

    const check = checkSubmission(body);
    if (!check.ok) return reply(check.status, { error: check.error });

    const existing = await findByCanonical(check.row.canonical);
    if (existing) return reply(409, { error: 'This puzzle has already been published.', puzzle: existing });

    const result = await insertPuzzle(check.row, submitter);
    if (result.duplicate) {
      return reply(409, { error: 'This puzzle has already been published.', puzzle: await findByCanonical(check.row.canonical) });
    }

    revalidateTag(PUZZLES_TAG);
    return reply(201, { puzzle: result.puzzle });
  } catch (err) {
    console.error('sudoku: publishing failed:', err?.message ?? err);
    return reply(500, { error: 'Couldn’t publish right now. Please try again.' });
  }
}

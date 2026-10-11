import { CARDS, CARDS_BY_ID } from '../data/cards.js';
import { rngFor, shuffleInPlace } from './rng.js';

// A real deck: every copy is drawn once before the discard pile is reshuffled.

export function buildDeck(seed, salt = 0) {
  const ids = CARDS.flatMap(c => Array(c.copies).fill(c.id));
  return { drawPile: shuffleInPlace(ids, rngFor(seed, 'deck', salt)), discard: [], reshuffles: salt };
}

export function reshuffle(deck, seed) {
  const salt = (deck.reshuffles ?? 0) + 1;
  const ids = [...deck.drawPile, ...deck.discard];
  return { drawPile: shuffleInPlace(ids, rngFor(seed, 'deck', salt)), discard: [], reshuffles: salt };
}

// Returns { deck, cardId }. `forcedId` (dev) pulls a specific card instead.
export function drawFrom(deck, seed, forcedId = null) {
  let d = deck.drawPile.length ? deck : reshuffle(deck, seed);
  if (forcedId && CARDS_BY_ID[forcedId]) {
    const i = d.drawPile.indexOf(forcedId);
    const drawPile = d.drawPile.slice();
    if (i >= 0) drawPile.splice(i, 1);
    return { deck: { ...d, drawPile }, cardId: forcedId };
  }
  const [cardId, ...rest] = d.drawPile;
  return { deck: { ...d, drawPile: rest }, cardId };
}

export const discardTo = (deck, cardId) => ({ ...deck, discard: [...deck.discard, cardId] });

import { TILE_CELLS as N, CELL_COUNT, VOID_CONFIG, CLAIM_MINUTES } from '../config.js';
import { codeOf, PAINTABLE } from '../data/terrains.js';
import { CARDS_BY_ID, DEV_CARD } from '../data/cards.js';
import { STAMP_REGISTRY } from '../data/stamps.js';
import { keyOf, parseKey, SIDES, neighborOf } from './coords.js';
import { rngFor, shuffleInPlace, hash01 } from './rng.js';
import { buildDeck, drawFrom, discardTo, reshuffle } from './deck.js';
import { toString, isFullyVoid } from './terrain.js';
import { frontierBase, seamLock, incomingPorts, drawnNeighbors, adjacentTerrains } from './seams.js';
import { derivePorts, rasterizePath, PATH_KINDS } from './features.js';
import { evaluateRules, requiredPortsFor } from './rules.js';
import { tickVoid, hasVoid } from './void.js';

// The game is a pure state machine: state changes only through
// applyAction(state, action). Actions carry everything that varies between
// runs (author, timestamp), and every random choice comes from the seed, so
// replaying the action log reproduces the map exactly. An online version can
// run this same function on the server to validate and order turns.
//
// Action: { id, type, author, ts, payload }

export const STATE_VERSION = 2;

// ─── Starting tile ────────────────────────────────────────────────────────────

function startingCells(seed) {
  const rng = rngFor(seed, 'start');
  const pattern = ['island', 'coast', 'lake'][Math.floor(rng() * 3)];
  const angle = rng() * Math.PI * 2;
  const out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5;
      const wobble = (hash01(seed, x >> 2, y >> 2) - 0.5) * 0.08 + (hash01(seed, x, y, 1) - 0.5) * 0.03;
      let land;
      if (pattern === 'island') land = Math.hypot(u, v) + wobble < 0.3;
      else if (pattern === 'lake') land = Math.hypot(u, v) + wobble > 0.2;
      else land = u * Math.cos(angle) + v * Math.sin(angle) + wobble > 0;
      out.push(codeOf(land ? 'land' : 'water'));
    }
  }
  return out.join('');
}

export function createTile(fields) {
  return { cells: '', walls: [], paths: [], ports: [], stamps: [], labels: [], generation: 1, author: null, updatedAt: 0, rev: 0, ...fields };
}

export function createInitialState(seed, { author = null, ts = 0 } = {}) {
  return {
    version: STATE_VERSION,
    seed,
    turn: 0,
    tiles: { [keyOf(0, 0)]: createTile({ cells: startingCells(seed), author, updatedAt: ts }) },
    deck: buildDeck(seed),
    active: null,
    voidClock: VOID_CONFIG.tickEvery,
    players: {},
    history: [],
  };
}

// ─── Targets ──────────────────────────────────────────────────────────────────

const sortKeys = keys => keys.sort((a, b) => {
  const pa = parseKey(a), pb = parseKey(b);
  return pa.y - pb.y || pa.x - pb.x;
});

function slotsFor(tiles, where) {
  const keys = Object.keys(tiles);
  switch (where) {
    case 'frontier': {
      const set = new Set();
      for (const key of keys) {
        const { x, y } = parseKey(key);
        for (const side of SIDES) {
          const n = neighborOf(x, y, side);
          const k = keyOf(n.x, n.y);
          if (!tiles[k]) set.add(k);
        }
      }
      return [...set];
    }
    case 'drawn':
      return keys;
    case 'nearVoid':
      return keys.filter(k => {
        if (hasVoid(tiles[k])) return true;
        const { x, y } = parseKey(k);
        return Object.values(drawnNeighbors(tiles, x, y)).some(hasVoid);
      });
    case 'hasSettlement':
      return keys.filter(k => tiles[k].stamps.some(s => STAMP_REGISTRY[s.type]?.tier && STAMP_REGISTRY[s.type]?.upgradesTo));
    default:
      return [];
  }
}

// Open road/river ends sitting on the edge of drawn tile (x, y), waiting to be continued.
export function openPorts(tiles, x, y) {
  const tile = tiles[keyOf(x, y)];
  return tile ? requiredPortsFor(incomingPorts(tiles, x, y), tile) : [];
}

export function computeOffers(state, card) {
  if (!card.target) return [];
  let keys = slotsFor(state.tiles, card.target.where);
  if (!keys.length && card.target.fallback) keys = slotsFor(state.tiles, card.target.fallback);
  const rng = rngFor(state.seed, 'offers', state.turn);
  const count = card.target.offers ?? 3;
  const shuffled = shuffleInPlace(sortKeys(keys), rng);
  const offers = shuffled.slice(0, count);

  // Cards that draw rivers or roads always offer a tile with a matching open
  // end, when one exists, so loose ends get picked up.
  const kinds = Object.keys(card.charges ?? {}).filter(k => PATH_KINDS[k]?.needsContinuation);
  const hasOpen = key => {
    if (!state.tiles[key]) return false;
    const { x, y } = parseKey(key);
    return openPorts(state.tiles, x, y).some(p => kinds.includes(p.kind));
  };
  if (kinds.length && !offers.some(hasOpen)) {
    const open = shuffled.find(hasOpen);
    if (open) offers[Math.min(offers.length, count) - 1] = open;
  }
  return offers.map(parseKey);
}

// ─── Editing context ──────────────────────────────────────────────────────────

const ALL_STAMPS = Object.fromEntries(Object.keys(STAMP_REGISTRY).map(id => [id, Infinity]));

// Everything the editor and the validator need to know about editing (x, y)
// with `card`. Pure — derived from state alone.
export function buildEditContext(state, x, y, card) {
  const { tiles } = state;
  const existing = tiles[keyOf(x, y)] ?? null;
  const base = existing ?? createTile({ cells: toString(frontierBase(tiles, x, y)) });
  const incoming = incomingPorts(tiles, x, y);
  const requiredPorts = requiredPortsFor(incoming, base);

  const charges = { ...(card.charges ?? {}) };
  for (const p of requiredPorts) charges[p.kind] = (charges[p.kind] ?? 0) + 1;

  // Cards that paint also get every terrain touching the tile's borders, so
  // boundaries can wander across the seam instead of meeting it flat.
  const cardPalette = (card.palette ?? []).filter(t => PAINTABLE.includes(t));
  const borrowedIds = cardPalette.length
    ? adjacentTerrains(tiles, x, y).filter(t => PAINTABLE.includes(t) && !cardPalette.includes(t))
    : [];
  const paletteIds = [...cardPalette, ...borrowedIds];

  return {
    x, y, card,
    isFrontier: !existing,
    base,
    locked: seamLock(tiles, x, y),
    neighborSides: Object.keys(drawnNeighbors(tiles, x, y)),
    incoming,
    requiredPorts,
    palette: new Set(paletteIds.map(codeOf)),
    paletteIds,
    borrowedIds,
    ink: card.ink ?? Infinity,
    charges,
    stamps: card.stamps === 'all' ? ALL_STAMPS : { ...(card.stamps ?? {}) },
  };
}

export function activeCard(state, dev = false) {
  if (dev) return DEV_CARD;
  return state.active ? CARDS_BY_ID[state.active.cardId] : null;
}

// ─── Submission ───────────────────────────────────────────────────────────────

export function validateSubmission(state, { x, y, tile, dev }) {
  if (!state.active) return { ok: false, errors: ['No card in play.'] };
  if (!state.active.offers.some(o => o.x === x && o.y === y)) return { ok: false, errors: ['That tile was not offered.'] };
  if (typeof tile?.cells !== 'string' || tile.cells.length !== CELL_COUNT) return { ok: false, errors: ['Malformed tile.'] };
  const ctx = buildEditContext(state, x, y, activeCard(state, dev));
  const { results, allOk } = evaluateRules(ctx, tile);
  return { ok: allOk, errors: results.filter(r => !r.ok).map(r => r.message ?? r.label), ctx };
}

function finalizeTile(ctx, draft, { author, ts }) {
  const walls = new Set();
  for (const p of draft.paths) if (p.kind === 'wall') rasterizePath(p.pts).forEach(i => walls.add(i));
  const prev = ctx.base;
  return createTile({
    cells: draft.cells,
    walls: [...walls].sort((a, b) => a - b),
    paths: draft.paths,
    ports: derivePorts(draft.paths),
    stamps: draft.stamps,
    labels: draft.labels,
    generation: ctx.isFrontier ? 1 : prev.generation + (ctx.card.kind === 'revise' ? 1 : 0),
    author,
    updatedAt: ts,
    rev: (prev.rev ?? 0) + 1,
  });
}

// ─── Turn bookkeeping ─────────────────────────────────────────────────────────

function endTurn(state, cardId) {
  let tiles = state.tiles;
  let voidClock = state.voidClock - 1;
  if (voidClock <= 0) {
    tiles = tickVoid(tiles, state.seed, state.turn);
    voidClock = VOID_CONFIG.tickEvery;
  }
  return {
    ...state,
    tiles,
    voidClock,
    turn: state.turn + 1,
    active: null,
    deck: discardTo(state.deck, cardId),
    history: [...state.history.slice(-9), cardId],
  };
}

export class ActionError extends Error {}

export function applyAction(state, action) {
  const { type, payload = {}, author = null, ts = 0 } = action;
  switch (type) {
    case 'NEW_MAP':
      return createInitialState(payload.seed, { author, ts });

    case 'DRAW': {
      if (state.active) throw new ActionError('A card is already in play.');
      const { deck, cardId } = drawFrom(state.deck, state.seed, payload.cardId);
      const card = CARDS_BY_ID[cardId];
      if (card.kind === 'shuffle') {
        const shuffled = reshuffle(deck, state.seed);
        return {
          ...state,
          deck: discardTo(shuffled, cardId),
          turn: state.turn + 1,
          history: [...state.history.slice(-9), cardId],
        };
      }
      const next = { ...state, deck };
      return { ...next, active: { cardId, drawnBy: author, drawnAt: ts, offers: computeOffers(next, card), claim: null } };
    }

    case 'CLAIM': {
      const { active } = state;
      if (!active) throw new ActionError('No card in play.');
      if (!active.offers.some(o => o.x === payload.x && o.y === payload.y)) throw new ActionError('That tile was not offered.');
      if (active.claim && active.claim.by !== author && active.claim.expiresAt > ts) throw new ActionError('Tile is claimed.');
      return { ...state, active: { ...active, claim: { x: payload.x, y: payload.y, by: author, expiresAt: ts + CLAIM_MINUTES * 60000 } } };
    }

    case 'RELEASE':
      if (!state.active) return state;
      return { ...state, active: { ...state.active, claim: null } };

    case 'SUBMIT': {
      const res = validateSubmission(state, payload);
      if (!res.ok) throw new ActionError(res.errors[0] ?? 'Invalid tile.');
      const tile = finalizeTile(res.ctx, payload.tile, { author, ts });
      const key = keyOf(payload.x, payload.y);
      const tiles = { ...state.tiles };
      if (isFullyVoid(tile.cells)) delete tiles[key]; else tiles[key] = tile;
      return endTurn({ ...state, tiles }, state.active.cardId);
    }

    case 'DISCARD':
      if (!state.active) throw new ActionError('No card in play.');
      return endTurn(state, state.active.cardId);

    case 'VOID_TICK':
      return { ...state, tiles: tickVoid(state.tiles, state.seed, state.turn + 1000 + (payload.n ?? 0)) };

    case 'SET_NAME':
      return { ...state, players: { ...state.players, [author]: { ...(state.players[author] ?? {}), name: payload.name } } };

    default:
      throw new ActionError(`Unknown action ${type}`);
  }
}

export function replay(log) {
  return log.reduce((s, a) => applyAction(s, a), null);
}

import { describe, it, expect } from 'vitest';
import { TILE_CELLS as N, CELL_COUNT } from '../../config.js';
import { CARDS, CARDS_BY_ID } from '../../data/cards.js';
import { applyAction, replay, buildEditContext, createTile, createInitialState, computeOffers, openPorts } from '../state.js';
import { derivePorts } from '../features.js';
import { buildDeck, drawFrom } from '../deck.js';
import { seamsMatch } from '../seams.js';
import { tickVoid } from '../void.js';
import { evaluateRules } from '../rules.js';
import { idx } from '../terrain.js';
import { keyOf } from '../coords.js';

let clock = 1_000_000;
const act = (type, payload = {}) => ({ id: String(clock), type, author: 'p1', ts: clock++, payload });

// Fills every blank cell with the card's first palette terrain.
function paintedDraft(ctx, code = [...ctx.palette][0]) {
  return {
    cells: ctx.base.cells.replace(/\./g, code),
    paths: [...ctx.base.paths], stamps: [...ctx.base.stamps], labels: [...ctx.base.labels],
  };
}

// Plays a frontier card on the first offer, discarding anything else.
function playTurn(state, log, cardId) {
  const draw = act('DRAW', cardId ? { cardId } : {});
  log.push(draw);
  state = applyAction(state, draw);
  if (!state.active) return state;   // shuffle card
  const card = CARDS_BY_ID[state.active.cardId];
  const offer = state.active.offers[0];
  const ctx = offer && buildEditContext(state, offer.x, offer.y, card);
  if (card.kind !== 'frontier' || !offer || !evaluateRules(ctx, paintedDraft(ctx)).allOk) {
    const a = act('DISCARD');
    log.push(a);
    return applyAction(state, a);
  }
  const claim = act('CLAIM', offer);
  log.push(claim);
  state = applyAction(state, claim);
  const submit = act('SUBMIT', { x: offer.x, y: offer.y, tile: paintedDraft(ctx) });
  log.push(submit);
  return applyAction(state, submit);
}

describe('determinism', () => {
  it('replaying the action log reproduces the same state', () => {
    const log = [act('NEW_MAP', { seed: 1234 })];
    let state = applyAction(null, log[0]);
    for (let i = 0; i < 30; i++) state = playTurn(state, log);
    expect(Object.keys(state.tiles).length).toBeGreaterThan(3);
    expect(replay(log)).toEqual(state);
  });
});

describe('seams', () => {
  it('new tiles always match their neighbors along shared edges', () => {
    const log = [act('NEW_MAP', { seed: 99 })];
    let state = applyAction(null, log[0]);
    for (let i = 0; i < 12; i++) state = playTurn(state, log, 'mixed');
    for (const [key, tile] of Object.entries(state.tiles)) {
      const [x, y] = key.split(',').map(Number);
      expect(seamsMatch(state.tiles, x, y, tile.cells)).toBe(true);
    }
  });

  it('rejects submissions that change locked seam cells', () => {
    let state = applyAction(null, act('NEW_MAP', { seed: 7 }));
    state = applyAction(state, act('DRAW', { cardId: 'mixed' }));
    const offer = state.active.offers[0];
    const ctx = buildEditContext(state, offer.x, offer.y, CARDS_BY_ID.mixed);
    const draft = paintedDraft(ctx);
    const lockedIdx = ctx.locked.findIndex(v => v === 1);
    const cells = draft.cells.split('');
    cells[lockedIdx] = cells[lockedIdx] === 'm' ? 'f' : 'm';
    expect(() => applyAction(state, act('SUBMIT', { ...offer, tile: { ...draft, cells: cells.join('') } }))).toThrow();
  });
});

describe('deck', () => {
  it('draws every copy once before reshuffling', () => {
    let deck = buildDeck(5);
    const total = CARDS.reduce((s, c) => s + c.copies, 0);
    const seen = {};
    for (let i = 0; i < total; i++) {
      const r = drawFrom(deck, 5);
      deck = r.deck;
      seen[r.cardId] = (seen[r.cardId] ?? 0) + 1;
    }
    for (const c of CARDS) expect(seen[c.id]).toBe(c.copies);
    expect(deck.drawPile.length).toBe(0);
  });
});

describe('void', () => {
  const cellsWhere = fn => Array.from({ length: CELL_COUNT }, (_, i) => fn(i % N, (i / N) | 0)).join('');

  it('is stopped by walls', () => {
    const wallCol = 20;
    const walls = Array.from({ length: N }, (_, y) => idx(wallCol, y));
    let tiles = { '0,0': createTile({ cells: cellsWhere(x => (x < 4 ? 'v' : 'l')), walls }) };
    for (let t = 0; t < 200; t++) tiles = tickVoid(tiles, 3, t);
    const cells = tiles['0,0'].cells;
    for (let y = 0; y < N; y++) {
      expect(cells[idx(wallCol - 1, y)]).toBe('v');
      for (let x = wallCol; x < N; x++) expect(cells[idx(x, y)]).toBe('l');
    }
  });

  it('removes fully voided tiles and keeps seams matched', () => {
    let tiles = {
      '0,0': createTile({ cells: cellsWhere(x => (x < 30 ? 'v' : 'l')) }),
      '1,0': createTile({ cells: 'l'.repeat(CELL_COUNT) }),
    };
    for (let t = 0; t < 12; t++) {
      tiles = tickVoid(tiles, 11, t);
      if (tiles['0,0'] && tiles['1,0']) expect(seamsMatch(tiles, 1, 0, tiles['1,0'].cells)).toBe(true);
    }
    for (let t = 12; t < 400 && tiles['0,0']; t++) tiles = tickVoid(tiles, 11, t);
    expect(tiles['0,0']).toBeUndefined();
  });
});

describe('rules', () => {
  const state0 = () => {
    const s = createInitialState(1);
    // Replace the start tile with plain land that sends a river off its east edge.
    s.tiles[keyOf(0, 0)] = createTile({
      cells: 'l'.repeat(CELL_COUNT),
      paths: [{ kind: 'river', pts: [[16, 16], [N, 16]] }],
      ports: [{ side: 'right', t: 16, kind: 'river' }],
    });
    return s;
  };

  it('requires blank cells to be painted', () => {
    const s = state0();
    const ctx = buildEditContext(s, 0, 1, CARDS_BY_ID.coastline);
    const draft = { cells: ctx.base.cells, paths: [], stamps: [], labels: [] };
    const res = evaluateRules(ctx, draft);
    expect(res.results.find(r => r.id === 'fullyPainted').ok).toBe(false);
    expect(evaluateRules(ctx, paintedDraft(ctx)).allOk).toBe(true);
  });

  it('asks the next tile to continue an incoming river', () => {
    const s = state0();
    const ctx = buildEditContext(s, 1, 0, CARDS_BY_ID.coastline);
    expect(ctx.requiredPorts).toEqual([{ side: 'left', t: 16, kind: 'river' }]);
    expect(ctx.charges.river).toBe(1);

    const draft = paintedDraft(ctx, 'l');
    expect(evaluateRules(ctx, draft).results.find(r => r.id === 'continuePorts').ok).toBe(false);

    // Continue it into a lake: water at the river mouth.
    const cells = draft.cells.split('');
    for (let y = 14; y < 19; y++) for (let x = 20; x < 26; x++) cells[idx(x, y)] = 'w';
    const withRiver = { ...draft, cells: cells.join(''), paths: [{ kind: 'river', pts: [[0, 16], [21, 16]] }] };
    const res = evaluateRules(ctx, withRiver);
    expect(res.allOk).toBe(true);

    // A river stranded on dry land fails.
    const stranded = { ...draft, paths: [{ kind: 'river', pts: [[0, 16], [10, 16]] }] };
    expect(evaluateRules(ctx, stranded).results.find(r => r.id === 'riverAnchored').ok).toBe(false);
  });

  it('enforces terrain quotas, ink budgets and climate adjacency', () => {
    const s = state0();
    const quota = buildEditContext(s, 0, 1, CARDS_BY_ID.dunes);
    expect(evaluateRules(quota, paintedDraft(quota)).allOk).toBe(true);   // all desert

    const revise = buildEditContext(s, 0, 0, CARDS_BY_ID.erosion);
    const tooMuch = { ...paintedDraft(revise), cells: 'l'.repeat(32) + 'w'.repeat(CELL_COUNT - 64) + 'l'.repeat(32) };
    expect(evaluateRules(revise, tooMuch).results.find(r => r.id === 'withinInk').ok).toBe(false);

    const mixed = buildEditContext(s, 0, 1, CARDS_BY_ID.mixed);
    const cells = paintedDraft(mixed).cells.split('');
    cells[idx(10, 10)] = 'd';
    cells[idx(11, 10)] = 's';
    const adj = evaluateRules(mixed, { ...paintedDraft(mixed), cells: cells.join('') });
    expect(adj.results.find(r => r.id === 'noForbiddenAdjacency').ok).toBe(false);
  });

  it('checks stamp placement and charges', () => {
    const s = state0();
    const ctx = buildEditContext(s, 0, 0, CARDS_BY_ID.coastal_trade);
    const base = paintedDraft(ctx);
    const inland = { ...base, stamps: [{ type: 'port', x: 0.5, y: 0.2 }] };
    expect(evaluateRules(ctx, inland).allOk).toBe(false);
    const village = { ...base, stamps: [{ type: 'hamlet', x: 0.5, y: 0.2 }, { type: 'hamlet', x: 0.3, y: 0.2 }] };
    expect(evaluateRules(ctx, village).results.find(r => r.id === 'withinCharges').ok).toBe(false);
  });
});

describe('roads and rivers between drawn tiles', () => {
  // Two drawn land tiles side by side, plus a ring of filler tiles.
  const twoTiles = () => {
    const s = createInitialState(2);
    for (let x = -2; x <= 3; x++) for (let y = -2; y <= 2; y++) s.tiles[keyOf(x, y)] = createTile({ cells: 'l'.repeat(CELL_COUNT) });
    return s;
  };

  it('lets a road run off an edge into a drawn tile, which must then continue it', () => {
    const s = twoTiles();
    const ctx = buildEditContext(s, 0, 0, CARDS_BY_ID.old_roads);
    const road = { kind: 'road', pts: [[10, 16], [N, 16]] };
    const draft = { ...paintedDraft(ctx, 'l'), paths: [road] };
    expect(evaluateRules(ctx, draft).allOk).toBe(true);

    s.tiles[keyOf(0, 0)] = { ...s.tiles[keyOf(0, 0)], paths: [road], ports: derivePorts([road]) };
    expect(openPorts(s.tiles, 1, 0)).toEqual([{ side: 'left', t: 16, kind: 'road' }]);

    // Any card played on the tile across now has to carry the road on.
    const next = buildEditContext(s, 1, 0, CARDS_BY_ID.settled_plains);
    expect(next.charges.road).toBe(1);
    const untouched = paintedDraft(next, 'l');
    expect(evaluateRules(next, untouched).results.find(r => r.id === 'continuePorts').ok).toBe(false);
    const continued = { ...untouched, paths: [{ kind: 'road', pts: [[0, 16], [12, 20]] }], stamps: [{ type: 'hamlet', x: 0.4, y: 0.6 }] };
    expect(evaluateRules(next, continued).allOk).toBe(true);
  });

  it('keeps roads from leaving a tile over water', () => {
    const s = twoTiles();
    const cells = 'l'.repeat(CELL_COUNT).split('');
    for (let y = 0; y < N; y++) cells[idx(N - 1, y)] = 'w';
    s.tiles[keyOf(0, 0)] = createTile({ cells: cells.join('') });
    const ctx = buildEditContext(s, 0, 0, CARDS_BY_ID.old_roads);
    const draft = { ...paintedDraft(ctx, 'l'), paths: [{ kind: 'road', pts: [[10, 16], [N, 16]] }] };
    expect(evaluateRules(ctx, draft).results.find(r => r.id === 'roadsLeaveOnLand').ok).toBe(false);
  });

  it('offers road cards a tile with an open road end', () => {
    const s = twoTiles();
    const road = { kind: 'road', pts: [[10, 16], [N, 16]] };
    s.tiles[keyOf(0, 0)] = { ...s.tiles[keyOf(0, 0)], paths: [road], ports: derivePorts([road]) };
    for (let turn = 0; turn < 10; turn++) {
      const offers = computeOffers({ ...s, turn }, CARDS_BY_ID.old_roads);
      expect(offers).toContainEqual({ x: 1, y: 0 });
    }
  });
});

describe('neighbor terrains', () => {
  it('adds terrains touching the borders to painting cards only', () => {
    const s = createInitialState(3);
    s.tiles[keyOf(0, 0)] = createTile({ cells: 'f'.repeat(CELL_COUNT / 2) + 'm'.repeat(CELL_COUNT / 2) });
    const ctx = buildEditContext(s, 1, 0, CARDS_BY_ID.coastline);
    expect(ctx.paletteIds).toEqual(['water', 'land', 'forest', 'mountain']);
    expect(ctx.borrowedIds).toEqual(['forest', 'mountain']);

    // Painting forest next to the forest neighbor is now allowed.
    const draft = paintedDraft(ctx, 'f');
    expect(evaluateRules(ctx, draft).results.find(r => r.id === 'paletteOnly').ok).toBe(true);

    expect(buildEditContext(s, 1, 0, CARDS_BY_ID.settled_plains).paletteIds).toEqual([]);
  });
});

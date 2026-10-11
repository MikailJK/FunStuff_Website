import { TILE_CELLS as N, VOID_CONFIG } from '../config.js';
import { VOID } from '../data/terrains.js';
import { keyOf, parseKey } from './coords.js';
import { idx, isFullyVoid } from './terrain.js';
import { hash01 } from './rng.js';

// The void works on the global cell grid so it crosses tile borders, and it
// keeps the seam invariant: when a border cell is swallowed, its twin across
// the border goes with it. Wall cells stop it; a border cell can't fall while
// either it or its twin is walled.

function globalLookup(tiles) {
  return (gx, gy) => {
    const tx = Math.floor(gx / N), ty = Math.floor(gy / N);
    const key = keyOf(tx, ty);
    if (!tiles[key]) return null;
    return { key, i: idx(gx - tx * N, gy - ty * N), cx: gx - tx * N, cy: gy - ty * N };
  };
}

// Twin of a border cell across the tile edge (the neighbor's facing cell).
function twinOf(gx, gy, cx, cy, lookup) {
  const out = [];
  if (cx === 0)     out.push(lookup(gx - 1, gy));
  if (cx === N - 1) out.push(lookup(gx + 1, gy));
  if (cy === 0)     out.push(lookup(gx, gy - 1));
  if (cy === N - 1) out.push(lookup(gx, gy + 1));
  return out.filter(Boolean);
}

const wallSet = tile => new Set(tile.walls ?? []);

// Every cell (in global coordinates) that is next to the void and could fall.
function frontierCells(tiles, cellsOf, walls, lookup) {
  const out = new Map();
  for (const key of Object.keys(tiles)) {
    const cells = cellsOf(key);
    if (!cells.includes(VOID)) continue;
    const { x: tx, y: ty } = parseKey(key);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== VOID) continue;
      const gx = tx * N + (i % N), gy = ty * N + ((i / N) | 0);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const hit = lookup(gx + dx, gy + dy);
        if (!hit || cellsOf(hit.key)[hit.i] === VOID || walls[hit.key].has(hit.i)) continue;
        out.set(`${gx + dx},${gy + dy}`, { gx: gx + dx, gy: gy + dy, ...hit });
      }
    }
  }
  return [...out.values()];
}

// Returns the new tiles object. Tiles swallowed whole are removed, freeing
// their slot for a new frontier panel.
export function tickVoid(tiles, seed, turn, config = VOID_CONFIG) {
  const lookup = globalLookup(tiles);
  const walls = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, wallSet(t)]));
  const edited = {};
  const cellsOf = key => edited[key] ?? tiles[key].cells;
  const touched = new Set();

  for (let pass = 0; pass < config.passes; pass++) {
    const fall = [];
    for (const c of frontierCells(tiles, cellsOf, walls, lookup)) {
      if (hash01(seed, c.gx, c.gy, turn * 16 + pass) >= config.chance) continue;
      const twins = twinOf(c.gx, c.gy, c.cx, c.cy, lookup);
      if (twins.some(t => walls[t.key].has(t.i))) continue;
      fall.push(c, ...twins);
    }
    for (const { key, i } of fall) {
      const arr = (edited[key] ??= tiles[key].cells.split(''));
      arr[i] = VOID;
      touched.add(key);
    }
  }

  if (!touched.size) return tiles;
  const next = { ...tiles };
  for (const key of touched) {
    const cells = edited[key].join('');
    if (isFullyVoid(cells)) delete next[key];
    else next[key] = { ...tiles[key], cells, rev: (tiles[key].rev ?? 0) + 1 };
  }
  return next;
}

// Tiles the next tick could reach (for the map's warning overlay).
export function threatenedTiles(tiles) {
  const lookup = globalLookup(tiles);
  const walls = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, wallSet(t)]));
  const keys = new Set();
  for (const c of frontierCells(tiles, k => tiles[k].cells, walls, lookup)) keys.add(c.key);
  return keys;
}

export function hasVoid(tile) {
  return tile.cells.includes(VOID);
}

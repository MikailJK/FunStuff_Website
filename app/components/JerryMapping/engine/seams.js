import { TILE_CELLS as N, CELL_COUNT, SEAM_DEPTH } from '../config.js';
import { keyOf, neighborOf, OPPOSITE, SIDES } from './coords.js';
import { idx, blankCells, toArray } from './terrain.js';
import { terrainOfCode } from '../data/terrains.js';

// Seams keep neighboring tiles continuous. Invariant: a tile's outermost cell
// row/column on a shared side always equals the neighbor's facing row/column.
// New tiles get that border (SEAM_DEPTH cells deep) copied in and locked, so
// edges match by construction instead of being validated after the fact.

// Cell index on `side` at position `along` (0..N-1) and depth `d` from the edge.
export function seamIndex(side, along, d) {
  switch (side) {
    case 'left':   return idx(d, along);
    case 'right':  return idx(N - 1 - d, along);
    case 'top':    return idx(along, d);
    case 'bottom': return idx(along, N - 1 - d);
  }
}

export function drawnNeighbors(tiles, x, y) {
  const out = {};
  for (const side of SIDES) {
    const n = neighborOf(x, y, side);
    const tile = tiles[keyOf(n.x, n.y)];
    if (tile) out[side] = tile;
  }
  return out;
}

// Locked mask for editing tile (x, y): seam cells on every side with a neighbor.
export function seamLock(tiles, x, y) {
  const locked = new Uint8Array(CELL_COUNT);
  for (const side of Object.keys(drawnNeighbors(tiles, x, y))) {
    for (let a = 0; a < N; a++) {
      for (let d = 0; d < SEAM_DEPTH; d++) locked[seamIndex(side, a, d)] = 1;
    }
  }
  return locked;
}

// Starting cells for a new tile: blank, with each neighbor's facing edge
// extruded SEAM_DEPTH cells in. Top is applied last, so it wins the corners.
export function frontierBase(tiles, x, y) {
  const arr = toArray(blankCells());
  const neighbors = drawnNeighbors(tiles, x, y);
  for (const side of ['left', 'right', 'bottom', 'top']) {
    const tile = neighbors[side];
    if (!tile) continue;
    const facing = OPPOSITE[side];
    for (let a = 0; a < N; a++) {
      const v = tile.cells[seamIndex(facing, a, 0)];
      for (let d = 0; d < SEAM_DEPTH; d++) arr[seamIndex(side, a, d)] = v;
    }
  }
  return arr;
}

// Terrains on the neighbors' edges facing (x, y), in order of first appearance.
export function adjacentTerrains(tiles, x, y) {
  const found = new Set();
  for (const [side, tile] of Object.entries(drawnNeighbors(tiles, x, y))) {
    const facing = OPPOSITE[side];
    for (let a = 0; a < N; a++) found.add(terrainOfCode(tile.cells[seamIndex(facing, a, 0)]));
  }
  return [...found];
}

// True when every shared border of (x, y) matches its neighbors.
export function seamsMatch(tiles, x, y, cells) {
  const neighbors = drawnNeighbors(tiles, x, y);
  for (const [side, tile] of Object.entries(neighbors)) {
    const facing = OPPOSITE[side];
    for (let a = 0; a < N; a++) {
      if (cells[seamIndex(side, a, 0)] !== tile.cells[seamIndex(facing, a, 0)]) return false;
    }
  }
  return true;
}

// Ports that neighbors expose on the edges of (x, y), mirrored onto our sides.
export function incomingPorts(tiles, x, y) {
  const out = [];
  for (const [side, tile] of Object.entries(drawnNeighbors(tiles, x, y))) {
    for (const p of tile.ports ?? []) {
      if (p.side === OPPOSITE[side]) out.push({ side, t: p.t, kind: p.kind });
    }
  }
  return out;
}

// Reads cells around a tile for rendering: cx, cy may range from -1 to N, and
// out-of-tile reads come from the neighbor there (or clamp to our own edge).
export function apronReader(tiles, x, y, cells) {
  const around = {};
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) around[`${dx},${dy}`] = tiles?.[keyOf(x + dx, y + dy)]?.cells ?? null;
    }
  }
  return (cx, cy) => {
    const dx = cx < 0 ? -1 : cx >= N ? 1 : 0;
    const dy = cy < 0 ? -1 : cy >= N ? 1 : 0;
    if (dx || dy) {
      const other = around[`${dx},${dy}`];
      if (other) return other[idx(cx - dx * N, cy - dy * N)];
    }
    return cells[idx(Math.max(0, Math.min(N - 1, cx)), Math.max(0, Math.min(N - 1, cy)))];
  };
}

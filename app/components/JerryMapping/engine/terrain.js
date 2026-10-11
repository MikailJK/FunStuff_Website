import { TILE_CELLS as N, CELL_COUNT } from '../config.js';
import { BLANK, VOID, codeOf, terrainOfCode } from '../data/terrains.js';

// Cell grids are strings of CELL_COUNT terrain codes when stored, and arrays of
// single-character strings while being edited. Index = y * N + x.

export const idx = (x, y) => y * N + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export const blankCells = () => BLANK.repeat(CELL_COUNT);
export const filledCells = terrainId => codeOf(terrainId).repeat(CELL_COUNT);

export const toArray  = cells => cells.split('');
export const toString = arr => arr.join('');

export function cellAt(cells, x, y) {
  return terrainOfCode(cells[idx(Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, y)))]);
}

// Terrain at a normalized (0-1) point of the tile.
export function terrainAtNorm(cells, nx, ny) {
  return cellAt(cells, Math.floor(nx * N), Math.floor(ny * N));
}

export function countChanged(base, arr, locked) {
  let n = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!locked?.[i] && arr[i] !== base[i]) n++;
  }
  return n;
}

export function countCode(cells, code) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === code) n++;
  return n;
}

export const isFullyVoid = cells => countCode(cells, VOID) === CELL_COUNT;
export const blankIndices = arr => {
  const out = [];
  for (let i = 0; i < arr.length; i++) if (arr[i] === BLANK) out.push(i);
  return out;
};

// Cells whose centers lie within `r` cells of (cx, cy) — cell-unit coordinates.
export function cellsInCircle(cx, cy, r) {
  const out = [];
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) out.push(idx(x, y));
    }
  }
  return out;
}

// Applies `code` to the given indices, skipping locked cells and stopping when
// the ink budget runs out. Re-painting an already changed cell is free, and
// restoring a cell to its base value refunds its ink.
// Returns the number of cells actually changed.
export function applyCells(arr, indices, code, { base, locked, inkLeft = Infinity }) {
  let left = inkLeft, changed = 0;
  for (const i of indices) {
    if (locked?.[i] || arr[i] === code) continue;
    const wasChanged = arr[i] !== base[i];
    const willChange = code !== base[i];
    const cost = (willChange ? 1 : 0) - (wasChanged ? 1 : 0);
    if (cost > left) continue;
    left -= cost;
    arr[i] = code;
    changed++;
  }
  return changed;
}

// 4-connected region of identical, unlocked cells starting at (x, y).
export function floodRegion(arr, x, y, locked) {
  if (!inBounds(x, y)) return [];
  const start = idx(x, y);
  if (locked?.[start]) return [];
  const target = arr[start];
  const seen = new Uint8Array(CELL_COUNT);
  const stack = [start], out = [];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const cx = i % N, cy = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (seen[j] || locked?.[j] || arr[j] !== target) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return out;
}

export function neighbors4(i) {
  const x = i % N, y = (i / N) | 0, out = [];
  if (x > 0) out.push(i - 1);
  if (x < N - 1) out.push(i + 1);
  if (y > 0) out.push(i - N);
  if (y < N - 1) out.push(i + N);
  return out;
}

// Roughen: boundary cells inside the circle randomly take a neighbor's terrain.
export function roughenIndices(arr, indices, { allowedCodes, rng }) {
  const updates = [];
  for (const i of indices) {
    const others = neighbors4(i).map(j => arr[j]).filter(c => c !== arr[i] && allowedCodes.has(c));
    if (others.length && rng() < 0.4) updates.push([i, others[Math.floor(rng() * others.length)]]);
  }
  return updates;
}

// Smooth: cells inside the circle take the majority terrain of their 3×3 block.
export function smoothIndices(arr, indices, { allowedCodes }) {
  const updates = [];
  for (const i of indices) {
    const x = i % N, y = (i / N) | 0;
    const counts = {};
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inBounds(x + dx, y + dy)) continue;
        const c = arr[idx(x + dx, y + dy)];
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best !== arr[i] && n >= 5 && allowedCodes.has(best)) updates.push([i, best]);
  }
  return updates;
}

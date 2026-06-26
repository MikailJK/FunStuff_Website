import { GRID_WIDTH, GRID_HEIGHT } from './config.js';

export function getNeighbors(idx) {
  const x = idx % GRID_WIDTH;
  const y = Math.floor(idx / GRID_WIDTH);
  const result = [];
  if (x > 0)              result.push(idx - 1);
  if (x < GRID_WIDTH - 1) result.push(idx + 1);
  if (y > 0)              result.push(idx - GRID_WIDTH);
  if (y < GRID_HEIGHT - 1) result.push(idx + GRID_WIDTH);
  return result;
}

export function xyToIdx(x, y) {
  return y * GRID_WIDTH + x;
}

// Returns a Set of indices where cell.type is in `types`
export function cellsOfTypes(grid, types) {
  const valid = new Set();
  grid.forEach((cell, idx) => {
    if (types.includes(cell.type)) valid.add(idx);
  });
  return valid;
}

// Returns a Set of indices where cell.type is in `filterTypes`
// AND at least one neighbor's type is in `adjacentTypes`
export function cellsAdjacentToTypes(grid, filterTypes, adjacentTypes) {
  const valid = new Set();
  grid.forEach((cell, idx) => {
    if (!filterTypes.includes(cell.type)) return;
    const hasAdj = getNeighbors(idx).some(n => adjacentTypes.includes(grid[n]?.type));
    if (hasAdj) valid.add(idx);
  });
  return valid;
}

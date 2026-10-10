import { useReducer, useCallback } from 'react';
import { GRID_COLS, GRID_ROWS } from './config.js';

function emptyTile() {
  return { lines: [], regions: [], markers: [], edgeSegments: null };
}

function createStartingTile() {
  const type = Math.random() < 0.5 ? 'land' : 'water';
  const seg = [{ from: 0, to: 1, type }];
  return {
    lines: [],
    regions: [{ seed: { x: 0.5, y: 0.5 }, type }],
    markers: [],
    edgeSegments: { top: [...seg], bottom: [...seg], left: [...seg], right: [...seg] },
  };
}

function createInitialGrid() {
  const grid = Array.from({ length: GRID_COLS * GRID_ROWS }, emptyTile);
  const startCol = Math.floor((GRID_COLS - 1) / 2);
  const startRow = Math.floor((GRID_ROWS - 1) / 2);
  grid[startRow * GRID_COLS + startCol] = createStartingTile();
  return grid;
}

function reducer(state, action) {
  switch (action.type) {
    case 'UPDATE_TILE': {
      const next = [...state];
      next[action.index] = action.tile;
      return next;
    }
    case 'RESET':
      return createInitialGrid();
    default:
      return state;
  }
}

export function useGrid() {
  const [grid, dispatch] = useReducer(reducer, null, createInitialGrid);

  const updateTile = useCallback((col, row, tile) => {
    dispatch({ type: 'UPDATE_TILE', index: row * GRID_COLS + col, tile });
  }, []);

  const resetGrid = useCallback(() => dispatch({ type: 'RESET' }), []);

  // Returns edge segments from each neighbor's shared edge.
  // constraints.left = what the left neighbor exposes on its RIGHT edge, etc.
  const getConstraints = useCallback((col, row) => {
    const segs = (c, r, edge) => {
      if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return null;
      return grid[r * GRID_COLS + c]?.edgeSegments?.[edge] ?? null;
    };
    return {
      left:   segs(col - 1, row,     'right'),
      right:  segs(col + 1, row,     'left'),
      top:    segs(col,     row - 1, 'bottom'),
      bottom: segs(col,     row + 1, 'top'),
    };
  }, [grid]);

  // Edge-pair markers (roads, ley lines, bridges) that end on a neighbor's
  // shared edge, mirrored onto this tile's edges so new roads can snap to them.
  // Returns { top, bottom, left, right }, each [{ t, type }].
  const getRoadConnections = useCallback((col, row) => {
    const pts = { top: [], bottom: [], left: [], right: [] };
    const collect = (c, r, theirEdge, ourEdge) => {
      if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return;
      for (const m of grid[r * GRID_COLS + c]?.markers ?? []) {
        for (const end of [m.from, m.to]) {
          if (end?.edge === theirEdge) pts[ourEdge].push({ t: end.t, type: m.type });
        }
      }
    };
    collect(col - 1, row,     'right',  'left');
    collect(col + 1, row,     'left',   'right');
    collect(col,     row - 1, 'bottom', 'top');
    collect(col,     row + 1, 'top',    'bottom');
    return pts;
  }, [grid]);

  // target 'empty':     blank tiles adjacent to drawn ones (terrain cards)
  // target 'populated': already-drawn tiles (civilization and void cards)
  const getCandidateTiles = useCallback((count = 3, target = 'empty') => {
    const populatedSet = new Set();
    grid.forEach((tile, idx) => {
      if (tile.regions.length > 0) populatedSet.add(idx);
    });

    let candidateSet;
    if (target === 'populated') {
      candidateSet = populatedSet;
    } else {
      candidateSet = new Set();
      for (const idx of populatedSet) {
        const col = idx % GRID_COLS;
        const row = Math.floor(idx / GRID_COLS);
        for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const c = col + dc, r = row + dr;
          if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) {
            const nIdx = r * GRID_COLS + c;
            if (!populatedSet.has(nIdx)) candidateSet.add(nIdx);
          }
        }
      }
    }

    const candidates = [...candidateSet].map(idx => ({
      col: idx % GRID_COLS,
      row: Math.floor(idx / GRID_COLS),
    }));

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates.slice(0, count);
  }, [grid]);

  return { grid, updateTile, resetGrid, getConstraints, getRoadConnections, getCandidateTiles };
}

import { TILES } from './config.js';
import { cellsOfTypes, cellsAdjacentToTypes } from './gridUtils.js';

// Each tool: { id, name, getValidCells(grid) → Set<number>, apply(cell, idx, grid) → tileType }
// Adding a new tool means adding an entry here — no other file needs to change.

export const TOOLS = {
  land_brush: {
    id: 'land_brush',
    name: 'Land Brush',
    getValidCells: (grid) => cellsOfTypes(grid, [TILES.EMPTY]),
    apply: () => TILES.LAND,
  },

  water_body: {
    id: 'water_body',
    name: 'Water Body',
    getValidCells: (grid) => cellsOfTypes(grid, [TILES.EMPTY]),
    apply: () => TILES.WATER,
  },

  coastline_painter: {
    id: 'coastline_painter',
    name: 'Coastline Painter',
    // Only paints cells adjacent to existing water or coast
    getValidCells: (grid) =>
      cellsAdjacentToTypes(grid, [TILES.EMPTY, TILES.LAND], [TILES.WATER, TILES.COAST]),
    apply: () => TILES.COAST,
  },

  mountain_brush: {
    id: 'mountain_brush',
    name: 'Mountain Brush',
    // Raises land (or forest) into mountains
    getValidCells: (grid) => cellsOfTypes(grid, [TILES.LAND, TILES.FOREST]),
    apply: () => TILES.MOUNTAIN,
  },

  mountain_peak: {
    id: 'mountain_peak',
    name: 'Mountain Peak',
    // Caps existing mountain cells with snowy peaks
    getValidCells: (grid) => cellsOfTypes(grid, [TILES.MOUNTAIN]),
    apply: () => TILES.MOUNTAIN_PEAK,
  },

  river_tracer: {
    id: 'river_tracer',
    name: 'River Tracer',
    // Rivers must originate from or connect to existing water/river cells
    getValidCells: (grid) =>
      cellsAdjacentToTypes(
        grid,
        [TILES.LAND, TILES.EMPTY, TILES.COAST, TILES.FOREST],
        [TILES.WATER, TILES.RIVER]
      ),
    apply: () => TILES.RIVER,
  },

  forest_spreader: {
    id: 'forest_spreader',
    name: 'Forest Spreader',
    getValidCells: (grid) => cellsOfTypes(grid, [TILES.LAND]),
    apply: () => TILES.FOREST,
  },

  void_tool: {
    id: 'void_tool',
    name: 'The Void',
    getValidCells: (grid) =>
      cellsOfTypes(grid, [
        TILES.WATER, TILES.COAST, TILES.LAND,
        TILES.MOUNTAIN, TILES.MOUNTAIN_PEAK, TILES.FOREST, TILES.RIVER,
      ]),
    apply: () => TILES.EMPTY,
  },
};

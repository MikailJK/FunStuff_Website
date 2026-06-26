export const GRID_COLS = 8;
export const GRID_ROWS = 8;
export const TILE_DISPLAY_SIZE = 60;                         // px per tile on the map
export const TILE_EDITOR_SIZE  = 400;                        // px in the zoomed editor
export const MAP_CANVAS_SIZE   = GRID_COLS * TILE_DISPLAY_SIZE; // 480

export const REGION_TYPES = ['water', 'land', 'forest', 'mountain'];

// Colors chosen so that r+g+b > BORDER_THRESHOLD for all regions (see tileUtils)
export const REGION_CONFIG = {
  empty:    { name: 'Empty',    color: '#505060' },
  water:    { name: 'Water',    color: '#1a7cc0' },
  land:     { name: 'Land',     color: '#4a8835' },
  forest:   { name: 'Forest',   color: '#0a4004' },
  mountain: { name: 'Mountain', color: '#8a9090' },
};

// Stroke line color — must be dark (r+g+b << BORDER_THRESHOLD) so flood fill treats it as a wall
export const STROKE_COLOR     = '#040408';
export const STROKE_WIDTH_PX  = 4;           // px in editor

// ─── Tile geometry ────────────────────────────────────────────────────────────
// Every tile is a TILE_CELLS × TILE_CELLS grid of terrain cells. All game logic
// works in cell units; rendering converts to pixels.
export const TILE_CELLS = 32;
export const CELL_COUNT = TILE_CELLS * TILE_CELLS;

// Depth (in cells) of the locked border copied from a drawn neighbor.
export const SEAM_DEPTH = 2;

// ─── Rendering ────────────────────────────────────────────────────────────────
export const MAP_TILE_PX     = 96;    // tile size on the map at zoom 1
export const EDITOR_MAX_PX   = 480;   // largest editor tile size
export const EXPORT_TILE_PX  = 160;   // per-tile resolution of PNG export

// ─── Void ─────────────────────────────────────────────────────────────────────
// The void spreads every `tickEvery` turns. Each tick runs `passes` rounds of
// growth; a bordering cell is consumed with probability `chance` per round.
export const VOID_CONFIG = {
  tickEvery: 4,
  passes:    2,
  chance:    0.5,
  seedRadius: 4,
};

// ─── Pacing ───────────────────────────────────────────────────────────────────
// How many turns one player may start per time window. Single-player is
// unlimited; the collaborative policy is what an online version would enforce
// server-side (it can be simulated locally from Dev Tools).
export const PACING_POLICIES = {
  unlimited:     { turnsPerWindow: Infinity, windowHours: 24 },
  collaborative: { turnsPerWindow: 3,        windowHours: 24 },
  devSimulated:  { turnsPerWindow: 3,        windowHours: 0.05 },  // 3 turns / 3 min
};

// How long a claimed tile stays reserved for the player who drew the card.
export const CLAIM_MINUTES = 30;

// Shows the "Dev Tools" toggle in the page header. When on, the editor offers
// every terrain and tool without limits, and the side panel can pick specific
// cards, force void ticks and simulate pacing. Set to false before going public.
export const SHOW_DEV_TOGGLE = true;

export const STORAGE_KEY = 'jerrymapping:v2';
export const SAVE_FORMAT = 'jerrymap';
export const SAVE_VERSION = 2;

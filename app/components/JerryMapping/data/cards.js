// The deck. Each card is pure data and is shuffled into the draw pile `copies`
// times. A card says WHERE it can be played, WHICH tools it grants and HOW MUCH
// of them, and WHAT the finished tile must satisfy.
//
//   kind      frontier | revise | waterway | road | settle | void | wall | name | shuffle
//   target    where: frontier (empty slot touching the map) | drawn | nearVoid |
//                    hasSettlement — `fallback` is used when no tile qualifies;
//             offers: how many candidate tiles are dealt
//   palette   terrains the paint tools may use (brush, fill, erase, roughen,
//             smooth, eyedropper are all granted when the palette is non-empty)
//   ink       max cells changed — null means unlimited
//   charges   limited-use tools: river, road, wall, ley, label, upgrade, voidSeed
//   stamps    { stampId: count }
//   requires  rules the tile must pass (see engine/rules.js). The engine adds
//             the always-on rules — seams, palette, ink, port continuation,
//             climate adjacency — on top of these.

const FRONTIER = { where: 'frontier', offers: 3 };
const DRAWN    = { where: 'drawn', offers: 3 };

export const CARDS = [
  // ── Frontier — add a new panel at the edge of the map ─────────────────────
  {
    id: 'coastline', kind: 'frontier', name: 'Coastline', copies: 5, accent: '#4a7cc8',
    flavor: 'Where water meets earth.',
    target: FRONTIER, palette: ['water', 'land'],
    requires: ['fullyPainted'],
  },
  {
    id: 'jagged_shore', kind: 'frontier', name: 'Jagged Shore', copies: 3, accent: '#4a7cc8',
    flavor: 'The sea does not yield gently.',
    target: FRONTIER, palette: ['water', 'land', 'mountain'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'water', minCells: 120 }],
  },
  {
    id: 'rolling_hills', kind: 'frontier', name: 'Rolling Hills', copies: 4, accent: '#6f9a45',
    flavor: 'Land that goes on and on.',
    target: FRONTIER, palette: ['land', 'forest'],
    requires: ['fullyPainted'],
  },
  {
    id: 'deep_canopy', kind: 'frontier', name: 'Deep Canopy', copies: 2, accent: '#3f7a35',
    flavor: 'Sunlight does not reach here.',
    target: FRONTIER, palette: ['forest', 'land', 'marsh'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'forest', minCells: 350 }],
  },
  {
    id: 'highland', kind: 'frontier', name: 'Highland', copies: 3, accent: '#8a9090',
    flavor: 'The land buckles and rises.',
    target: FRONTIER, palette: ['land', 'mountain', 'snow'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'mountain', minCells: 120 }],
  },
  {
    id: 'headwaters', kind: 'frontier', name: 'Headwaters', copies: 2, accent: '#5a8fc0',
    flavor: 'Snowmelt gathers and begins its long journey.',
    target: FRONTIER, palette: ['land', 'mountain', 'forest', 'water'],
    charges: { river: 2 },
    requires: ['fullyPainted', { rule: 'minPaths', kind: 'river', n: 1 }],
  },
  {
    id: 'wetlands', kind: 'frontier', name: 'Wetlands', copies: 2, accent: '#3a8a60',
    flavor: 'Neither land nor water claims this place.',
    target: FRONTIER, palette: ['water', 'marsh', 'forest'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'marsh', minCells: 150 }],
  },
  {
    id: 'dunes', kind: 'frontier', name: 'Dune Sea', copies: 2, accent: '#c9a45a',
    flavor: 'Wind writes and rewrites the land.',
    target: FRONTIER, palette: ['desert', 'land'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'desert', minCells: 250 }],
  },
  {
    id: 'tundra', kind: 'frontier', name: 'Tundra', copies: 2, accent: '#a9c4d6',
    flavor: 'Cold, quiet, and very old.',
    target: FRONTIER, palette: ['snow', 'water', 'mountain', 'land'],
    requires: ['fullyPainted', { rule: 'includeTerrain', type: 'snow', minCells: 200 }],
  },
  {
    id: 'open_sea', kind: 'frontier', name: 'Open Sea', copies: 3, accent: '#1a7cc0',
    flavor: 'Vast and unknowable.',
    target: FRONTIER, palette: ['water'], ink: null,
    requires: ['fullyPainted'],
  },
  {
    id: 'mixed', kind: 'frontier', name: 'Mixed Terrain', copies: 2, accent: '#9a9a9a',
    flavor: 'The land has many faces here.',
    target: FRONTIER, palette: ['water', 'land', 'forest', 'mountain', 'desert', 'snow', 'marsh'],
    requires: ['fullyPainted'],
  },

  // ── Revise — rework a drawn panel into its next generation ────────────────
  {
    id: 'next_generation', kind: 'revise', name: 'Next Generation', copies: 3, accent: '#b08ad0',
    flavor: 'Look again. The land has changed since you last saw it.',
    target: DRAWN, palette: ['water', 'land', 'forest', 'mountain', 'desert', 'snow', 'marsh'],
    ink: 220,
    requires: [{ rule: 'madeChange', minCells: 40 }],
  },
  {
    id: 'erosion', kind: 'revise', name: 'Erosion', copies: 2, accent: '#7aa0b0',
    flavor: 'Patient water wins every argument.',
    target: DRAWN, palette: ['water', 'marsh', 'land'], ink: 160,
    requires: [{ rule: 'madeChange', minCells: 25 }],
  },
  {
    id: 'reforestation', kind: 'revise', name: 'Reforestation', copies: 2, accent: '#4c8a3a',
    flavor: 'Seeds carried on the wind take root.',
    target: DRAWN, palette: ['forest', 'land'], ink: 200,
    requires: [{ rule: 'madeChange', minCells: 30 }],
  },
  {
    id: 'growth', kind: 'revise', name: 'Growth', copies: 3, accent: '#d0a040',
    flavor: 'Hamlets become villages; villages dream of being towns.',
    target: { where: 'hasSettlement', fallback: 'drawn', offers: 3 },
    charges: { upgrade: 2 }, stamps: { hamlet: 1 },
    requires: [{ rule: 'madeChange', minCells: 0, orStamp: true }],
  },

  // ── Linear features ───────────────────────────────────────────────────────
  {
    id: 'waterways', kind: 'waterway', name: 'Waterways', copies: 3, accent: '#3c8ad0',
    flavor: 'Every river remembers the mountain it came from.',
    target: DRAWN, charges: { river: 2 },
    requires: [{ rule: 'minPaths', kind: 'river', n: 1 }],
  },
  {
    id: 'old_roads', kind: 'road', name: 'Old Roads', copies: 3, accent: '#a08858',
    flavor: 'Old paths wind between forgotten stones.',
    target: DRAWN, charges: { road: 3 }, stamps: { waystone: 1 },
    requires: [{ rule: 'minPaths', kind: 'road', n: 1 }],
  },
  {
    id: 'trade_route', kind: 'road', name: 'Trade Route', copies: 2, accent: '#c09040',
    flavor: 'Where merchants walk, towns follow.',
    target: DRAWN, charges: { road: 2 }, stamps: { hamlet: 1, town: 1 },
    requires: [{ rule: 'minPaths', kind: 'road', n: 1 }],
  },

  // ── Settlements and landmarks ─────────────────────────────────────────────
  {
    id: 'settled_plains', kind: 'settle', name: 'Settled Plains', copies: 3, accent: '#c8a44a',
    flavor: 'A peaceful stretch of cultivated land.',
    target: DRAWN, stamps: { hamlet: 2, village: 1, farm: 2, windmill: 1 },
    requires: [{ rule: 'minStamps', n: 1 }],
  },
  {
    id: 'frontier_folk', kind: 'settle', name: 'Frontier Folk', copies: 2, accent: '#9a7a60',
    flavor: 'Hardy folk scratch out a living here.',
    target: DRAWN, stamps: { mine: 1, outpost: 1, hamlet: 1, ruins: 1 },
    requires: [{ rule: 'minStamps', n: 1 }],
  },
  {
    id: 'coastal_trade', kind: 'settle', name: 'Coastal Trade', copies: 2, accent: '#4a9cc8',
    flavor: 'Ships come and go with the tide.',
    target: DRAWN, stamps: { port: 1, lighthouse: 1, hamlet: 1, sunken_ruin: 1 },
    requires: [{ rule: 'minStamps', n: 1 }],
  },
  {
    id: 'desert_caravans', kind: 'settle', name: 'Desert Caravans', copies: 1, accent: '#d0a860',
    flavor: 'Water is worth more than gold out here.',
    target: DRAWN, stamps: { oasis: 1, outpost: 1, waystone: 1 }, charges: { road: 1 },
    requires: [{ rule: 'minStamps', n: 1 }],
  },
  {
    id: 'hinterlands', kind: 'settle', name: 'The Hinterlands', copies: 1, accent: '#7a5a9a',
    flavor: 'Here be things best left undisturbed.',
    target: DRAWN, stamps: { dragon_lair: 1, ancient_grove: 1, volcano: 1, castle: 1 }, charges: { ley: 1 },
    requires: [{ rule: 'minStamps', n: 1 }],
  },

  // ── The void and the walls that hold it back ──────────────────────────────
  {
    id: 'the_void', kind: 'void', name: 'The Void', copies: 2, accent: '#d8d2c0',
    flavor: 'All returns to nothing. Make space for what comes next.',
    target: DRAWN, charges: { voidSeed: 1 },
    requires: [{ rule: 'voidPlanted' }],
  },
  {
    id: 'retaining_wall', kind: 'wall', name: 'Retaining Wall', copies: 3, accent: '#6a6a72',
    flavor: 'The Ukranians build, and build, and build.',
    target: { where: 'nearVoid', fallback: 'drawn', offers: 3 },
    charges: { wall: 3 }, stamps: { watchtower: 1 },
    requires: [{ rule: 'minPaths', kind: 'wall', n: 1 }],
  },

  // ── Naming and housekeeping ───────────────────────────────────────────────
  {
    id: 'name_it', kind: 'name', name: 'Name It', copies: 2, accent: '#e0d0a0',
    flavor: 'A place is not real until someone names it.',
    target: DRAWN, charges: { label: 1 },
    requires: [{ rule: 'minLabels', n: 1 }],
  },
  {
    id: 'shuffle', kind: 'shuffle', name: 'Shuffle', copies: 1, accent: '#808898',
    flavor: 'The discard pile returns to the deck.',
    target: null,
  },
];

export const CARDS_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

export const KIND_LABELS = {
  frontier: 'Frontier',
  revise:   'Revise',
  waterway: 'Waterway',
  road:     'Road',
  settle:   'Settle',
  void:     'Void',
  wall:     'Wall',
  name:     'Name',
  shuffle:  'Shuffle',
};

// Dev mode: every terrain, tool and stamp, no limits.
export const DEV_CARD = {
  id: '__dev__', kind: 'revise', name: 'Dev Tools', accent: '#f0b040',
  flavor: 'Everything, without limits.',
  palette: ['water', 'land', 'forest', 'mountain', 'desert', 'snow', 'marsh'],
  ink: null,
  charges: { river: Infinity, road: Infinity, wall: Infinity, ley: Infinity, label: Infinity, upgrade: Infinity, voidSeed: Infinity },
  stamps: 'all',
  requires: [],
};

// Cards constrain what the player may do when editing a tile. Three kinds:
//   Terrain card:      allowedTypes non-empty, no allowedMarkers. Player picks a
//                      blank tile adjacent to the map and paints terrain on it.
//   Civilization card: allowedMarkers non-empty, allowedTypes empty. Player picks
//                      an ALREADY-DRAWN tile and may only place stamps on it —
//                      terrain drawing and settlement placement are decoupled.
//   Void card:         both empty. Player picks a drawn tile and clears it.
// lineRange: [min, max] — the line budget is rolled from this range, then raised
// if neighbor constraints require more (see getMinRequiredLines).

export const CARD_DECK = [
  {
    id: 'coastline_1', name: 'Coastline',
    flavorText: 'Where water meets earth.',
    allowedTypes: ['water', 'land'],
    lineRange: [2, 5],
    weight: 5, accent: '#4a7cc8',
  },
  {
    id: 'coastline_2', name: 'Jagged Shore',
    flavorText: 'The sea does not yield gently.',
    allowedTypes: ['water', 'land'],
    lineRange: [2, 5],
    weight: 3, accent: '#4a7cc8',
  },
  {
    id: 'inland_1', name: 'Rolling Hills',
    flavorText: 'Land that goes on and on.',
    allowedTypes: ['land'],
    lineRange: [1, 4],
    weight: 4, accent: '#4a8835',
  },
  {
    id: 'inland_2', name: 'Open Plains',
    flavorText: 'Nothing above but sky.',
    allowedTypes: ['land'],
    lineRange: [1, 4],
    weight: 3, accent: '#4a8835',
  },
  {
    id: 'forest_1', name: 'Forest Edge',
    flavorText: 'Where trees begin to crowd the path.',
    allowedTypes: ['land', 'forest'],
    lineRange: [1, 3],
    weight: 4, accent: '#408538',
  },
  {
    id: 'forest_2', name: 'Deep Canopy',
    flavorText: 'Sunlight does not reach here.',
    allowedTypes: ['forest'],
    lineRange: [1, 3],
    weight: 2, accent: '#408538',
  },
  {
    id: 'mountain_1', name: 'Highland',
    flavorText: 'The land buckles and rises.',
    allowedTypes: ['land', 'mountain'],
    lineRange: [2, 5],
    weight: 3, accent: '#8a9090',
  },
  {
    id: 'mountain_2', name: 'Summit',
    flavorText: 'A spine of stone across the horizon.',
    allowedTypes: ['mountain'],
    lineRange: [2, 5],
    weight: 2, accent: '#8a9090',
  },
  {
    id: 'wetland_1', name: 'Wetlands',
    flavorText: 'Neither land nor water claims this place.',
    allowedTypes: ['water', 'forest'],
    lineRange: [1, 3],
    weight: 2, accent: '#3a8a60',
  },
  {
    id: 'open_sea', name: 'Open Sea',
    flavorText: 'Vast and unknowable.',
    allowedTypes: ['water'],
    lineRange: [0, 1],
    weight: 3, accent: '#1a7cc0',
  },
  {
    id: 'mixed', name: 'Mixed Terrain',
    flavorText: 'The land has many faces here.',
    allowedTypes: ['water', 'land', 'forest', 'mountain'],
    lineRange: [3, 7],
    weight: 2, accent: '#888',
  },
  {
    id: 'void_card', name: 'The Void',
    flavorText: 'All returns to nothing. Make space for what comes next.',
    allowedTypes: [],
    lineRange: [0, 0],
    weight: 1, accent: '#37474f',
  },

  // ── Civilization cards — stamps only, played on already-drawn tiles ─────────

  {
    id: 'settled_plains', name: 'Settled Plains',
    flavorText: 'A peaceful stretch of cultivated land.',
    allowedTypes: [],
    allowedMarkers: ['village', 'farm', 'road', 'town'],
    lineRange: [0, 0],
    weight: 3, accent: '#c8a44a',
  },
  {
    id: 'ancient_roads', name: 'Ancient Roads',
    flavorText: 'Old paths wind between forgotten stones.',
    allowedTypes: [],
    allowedMarkers: ['road', 'ruins', 'waystone', 'bridge'],
    lineRange: [0, 0],
    weight: 2, accent: '#a08858',
  },
  {
    id: 'frontier', name: 'The Frontier',
    flavorText: 'Hardy folk scratch out a living here.',
    allowedTypes: [],
    allowedMarkers: ['mine', 'village', 'ruins'],
    lineRange: [0, 0],
    weight: 2, accent: '#9a7a60',
  },
  {
    id: 'coastal_trade', name: 'Coastal Trade',
    flavorText: 'Ships come and go with the tide.',
    allowedTypes: [],
    allowedMarkers: ['port', 'village', 'road', 'sunken_ruin'],
    lineRange: [0, 0],
    weight: 2, accent: '#4a9cc8',
  },
  {
    id: 'hinterlands', name: 'The Hinterlands',
    flavorText: 'Here be things best left undisturbed.',
    allowedTypes: [],
    allowedMarkers: ['dragon_lair', 'ancient_grove', 'volcano', 'ley_line'],
    lineRange: [0, 0],
    weight: 1, accent: '#7a5a9a',
  },
];

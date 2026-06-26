// Cards constrain the region palette available when editing a tile.
// allowedTypes: which region types the player may use for fills this turn.
// Empty allowedTypes = void card (clears the tile).

export const CARD_DECK = [
  {
    id: 'coastline_1', name: 'Coastline',
    flavorText: 'Where water meets earth.',
    allowedTypes: ['water', 'land'],
    weight: 5, accent: '#4a7cc8',
  },
  {
    id: 'coastline_2', name: 'Jagged Shore',
    flavorText: 'The sea does not yield gently.',
    allowedTypes: ['water', 'land'],
    weight: 3, accent: '#4a7cc8',
  },
  {
    id: 'inland_1', name: 'Rolling Hills',
    flavorText: 'Land that goes on and on.',
    allowedTypes: ['land'],
    weight: 4, accent: '#4a8835',
  },
  {
    id: 'inland_2', name: 'Open Plains',
    flavorText: 'Nothing above but sky.',
    allowedTypes: ['land'],
    weight: 3, accent: '#4a8835',
  },
  {
    id: 'forest_1', name: 'Forest Edge',
    flavorText: 'Where trees begin to crowd the path.',
    allowedTypes: ['land', 'forest'],
    weight: 4, accent: '#408538',
  },
  {
    id: 'forest_2', name: 'Deep Canopy',
    flavorText: 'Sunlight does not reach here.',
    allowedTypes: ['forest'],
    weight: 2, accent: '#408538',
  },
  {
    id: 'mountain_1', name: 'Highland',
    flavorText: 'The land buckles and rises.',
    allowedTypes: ['land', 'mountain'],
    weight: 3, accent: '#8a9090',
  },
  {
    id: 'mountain_2', name: 'Summit',
    flavorText: 'A spine of stone across the horizon.',
    allowedTypes: ['mountain'],
    weight: 2, accent: '#8a9090',
  },
  {
    id: 'wetland_1', name: 'Wetlands',
    flavorText: 'Neither land nor water claims this place.',
    allowedTypes: ['water', 'forest'],
    weight: 2, accent: '#3a8a60',
  },
  {
    id: 'open_sea', name: 'Open Sea',
    flavorText: 'Vast and unknowable.',
    allowedTypes: ['water'],
    weight: 3, accent: '#1a7cc0',
  },
  {
    id: 'mixed', name: 'Mixed Terrain',
    flavorText: 'The land has many faces here.',
    allowedTypes: ['water', 'land', 'forest', 'mountain'],
    weight: 2, accent: '#888',
  },
  {
    id: 'void_card', name: 'The Void',
    flavorText: 'All returns to nothing. Make space for what comes next.',
    allowedTypes: [],
    weight: 1, accent: '#37474f',
  },
];

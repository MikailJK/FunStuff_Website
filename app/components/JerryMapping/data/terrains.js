// Terrain types. Each tile stores its cells as a string with one `code`
// character per cell, so the codes must be unique single characters.
//   z      smoothing order — higher layers nest inside lower ones when rendered
//   glyph  decoration drawn on top of the fill (see render/glyphs.js)
export const TERRAINS = {
  blank:    { code: '.', name: 'Blank',    color: '#3a3f4b', z: 0, glyph: null },
  water:    { code: 'w', name: 'Water',    color: '#3c7cb4', z: 1, glyph: 'waves' },
  marsh:    { code: 'h', name: 'Marsh',    color: '#5e8062', z: 2, glyph: 'reeds' },
  land:     { code: 'l', name: 'Grassland',color: '#93b866', z: 3, glyph: null },
  desert:   { code: 'd', name: 'Desert',   color: '#dcbd78', z: 4, glyph: 'dunes' },
  forest:   { code: 'f', name: 'Forest',   color: '#4c7a3a', z: 5, glyph: 'trees' },
  snow:     { code: 's', name: 'Snow',     color: '#e9eef2', z: 6, glyph: 'flakes' },
  mountain: { code: 'm', name: 'Mountain', color: '#998d7c', z: 7, glyph: 'peaks' },
  void:     { code: 'v', name: 'Void',     color: '#f3eee0', z: 8, glyph: null },
};

export const TERRAIN_IDS = Object.keys(TERRAINS);

// Terrains a player can paint (blank is "unpainted", void only comes from cards).
export const PAINTABLE = ['water', 'marsh', 'land', 'desert', 'forest', 'snow', 'mountain'];

const BY_CODE = Object.fromEntries(TERRAIN_IDS.map(id => [TERRAINS[id].code, id]));
export const terrainOfCode = code => BY_CODE[code] ?? 'blank';
export const codeOf = id => TERRAINS[id]?.code ?? '.';

export const BLANK = TERRAINS.blank.code;
export const VOID  = TERRAINS.void.code;
export const WATER = TERRAINS.water.code;

// Pairs that may not touch — keeps the map climatically coherent.
export const FORBIDDEN_ADJACENCY = [
  ['desert', 'snow'],
  ['desert', 'marsh'],
];

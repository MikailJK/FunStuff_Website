import { PAINT_TOOLS } from './paint.js';
import { FEATURE_TOOLS } from './features.js';

// Tool registry. TileEditor routes pointer events to the active tool:
//   down(api, pt) / move(api, pt, dragging) / up(api, pt) / cancel()
//   preview(g, api, pt) draws a hover overlay through the editor's graphics helpers
// pt is in tile cell units (0..TILE_CELLS, may fall slightly outside the tile).
// Adding a tool means adding an entry here and granting it from a card.

export const TOOLS = Object.fromEntries([...PAINT_TOOLS, ...FEATURE_TOOLS].map(t => [t.id, t]));

// Which tools an edit context grants.
export function availableTools(ctx) {
  const ids = [];
  if (ctx.paletteIds.length) ids.push(...PAINT_TOOLS.map(t => t.id));
  for (const kind of ['river', 'road', 'wall', 'ley']) if (ctx.charges[kind]) ids.push(kind);
  if (Object.keys(ctx.stamps).length) ids.push('stamp');
  if (ctx.charges.upgrade) ids.push('upgrade');
  if (ctx.charges.label) ids.push('label');
  if (ctx.charges.voidSeed) ids.push('voidSeed');
  return ids;
}

export const SHORTCUTS = { b: 'brush', f: 'fill', e: 'erase', r: 'roughen', s: 'smooth', i: 'pick' };

import { codeOf, terrainOfCode, TERRAINS } from '../data/terrains.js';
import {
  cellsInCircle, applyCells, floodRegion, roughenIndices, smoothIndices, idx, inBounds,
} from '../engine/terrain.js';
import { cloneDraft } from '../hooks/useTileDraft.js';

// Paint tools edit the cell grid. They never touch locked seam cells and stop
// when the card's ink runs out. Each tool gets an `api`:
//   draft()        current draft          ctx        edit context
//   begin()        start an undo step     set(d)     replace the draft
//   opts           { terrain, brush }     inkLeft()  remaining ink
//   notify(text)   show a message         setOpts()  change tool options

export const BRUSH_SIZES = { S: 0.8, M: 1.6, L: 2.8, XL: 4.5 };

function strokeIndices(from, to, r) {
  const set = new Set();
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.4));
  for (let s = 0; s <= steps; s++) {
    const x = from.x + ((to.x - from.x) * s) / steps, y = from.y + ((to.y - from.y) * s) / steps;
    for (const i of cellsInCircle(x, y, r)) set.add(i);
  }
  return [...set];
}

function makeStrokeTool({ id, label, icon, hint, applyStroke }) {
  let last = null;
  const run = (api, pt) => {
    const d = cloneDraft(api.draft());
    const indices = strokeIndices(last ?? pt, pt, BRUSH_SIZES[api.opts.brush]);
    const before = api.inkLeft();
    applyStroke(api, d, indices);
    api.set(d);
    if (before > 0 && api.inkLeft(d) <= 0) api.notify('Out of ink — erase to free some up.');
    last = pt;
  };
  return {
    id, label, icon, hint, group: 'paint', cursor: 'none',
    down(api, pt) { api.begin(); last = null; run(api, pt); },
    move(api, pt, dragging) { if (dragging) run(api, pt); },
    up() { last = null; },
    preview(g, api, pt) { g.brush(pt, BRUSH_SIZES[api.opts.brush]); },
  };
}

export const brush = makeStrokeTool({
  id: 'brush', label: 'Brush', icon: '🖌', hint: 'Drag to paint the selected terrain.',
  applyStroke(api, d, indices) {
    applyCells(d.cells, indices, codeOf(api.opts.terrain), { base: api.ctx.base.cells, locked: api.ctx.locked, inkLeft: api.inkLeft(d) });
  },
});

export const erase = makeStrokeTool({
  id: 'erase', label: 'Erase', icon: '⌫', hint: 'Drag to restore cells to how they were — refunds ink.',
  applyStroke(api, d, indices) {
    const { base, locked } = api.ctx;
    for (const i of indices) if (!locked[i]) d.cells[i] = base.cells[i];
  },
});

function applyUpdates(api, d, updates) {
  for (const [i, code] of updates) {
    applyCells(d.cells, [i], code, { base: api.ctx.base.cells, locked: api.ctx.locked, inkLeft: api.inkLeft(d) });
  }
}

export const roughen = makeStrokeTool({
  id: 'roughen', label: 'Roughen', icon: '≋', hint: 'Drag along a boundary to make it jagged.',
  applyStroke(api, d, indices) {
    applyUpdates(api, d, roughenIndices(d.cells, indices, { allowedCodes: api.ctx.palette, rng: Math.random }));
  },
});

export const smooth = makeStrokeTool({
  id: 'smooth', label: 'Smooth', icon: '∿', hint: 'Drag along a boundary to soften it.',
  applyStroke(api, d, indices) {
    applyUpdates(api, d, smoothIndices(d.cells, indices, { allowedCodes: api.ctx.palette }));
  },
});

export const fill = {
  id: 'fill', label: 'Fill', icon: '◧', group: 'paint', cursor: 'cell',
  hint: 'Click an area to fill everything connected to it.',
  down(api, pt) {
    const cx = Math.floor(pt.x), cy = Math.floor(pt.y);
    if (!inBounds(cx, cy)) return;
    const d = cloneDraft(api.draft());
    const code = codeOf(api.opts.terrain);
    if (api.ctx.locked[idx(cx, cy)]) return api.notify('That seam is locked — it continues the neighboring tile.');
    const region = floodRegion(d.cells, cx, cy, api.ctx.locked);
    const base = api.ctx.base.cells;
    const cost = region.reduce((s, i) => s + (code !== base[i] ? 1 : 0) - (d.cells[i] !== base[i] ? 1 : 0), 0);
    if (cost > api.inkLeft(d)) return api.notify(`Not enough ink to fill that area (needs ${cost}).`);
    api.begin();
    applyCells(d.cells, region, code, { base, locked: api.ctx.locked });
    api.set(d);
  },
  preview(g, api, pt) { g.cellHighlight(pt); },
};

export const pick = {
  id: 'pick', label: 'Pick', icon: '⊙', group: 'paint', cursor: 'crosshair',
  hint: 'Click to pick up a terrain from the tile.',
  down(api, pt) {
    const cx = Math.floor(pt.x), cy = Math.floor(pt.y);
    if (!inBounds(cx, cy)) return;
    const t = terrainOfCode(api.draft().cells[idx(cx, cy)]);
    if (api.ctx.paletteIds.includes(t)) api.setOpts({ terrain: t, tool: 'brush' });
    else api.notify(`${TERRAINS[t].name} isn't on this card.`);
  },
  preview(g, api, pt) { g.cellHighlight(pt); },
};

export const PAINT_TOOLS = [brush, fill, erase, roughen, smooth, pick];

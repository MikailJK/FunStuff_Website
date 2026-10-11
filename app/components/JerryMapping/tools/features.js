import { TILE_CELLS as N, VOID_CONFIG } from '../config.js';
import { VOID } from '../data/terrains.js';
import { STAMP_REGISTRY, stampError } from '../data/stamps.js';
import { cellsInCircle, terrainAtNorm } from '../engine/terrain.js';
import { PATH_KINDS, snapEndpoint, simplify, pathLength } from '../engine/features.js';
import { cloneDraft } from '../hooks/useTileDraft.js';

// Feature tools spend limited charges: path strokes, stamps, upgrades, labels
// and void seeds. `api.remaining` reports what the card still allows.

const clamp01 = v => Math.max(0.04, Math.min(0.96, v));
const terrainReader = d => (nx, ny) => terrainAtNorm(d.cells, nx, ny);

// ─── Path pens ────────────────────────────────────────────────────────────────

function makePathTool(kind, icon, hint) {
  let stroke = null;
  return {
    id: kind, label: PATH_KINDS[kind].name, icon, group: 'feature', cursor: 'crosshair', hint,
    charge: ctx => ctx.charges[kind] ?? 0,
    down(api, pt) {
      if (api.remaining.paths[kind] <= 0) return api.notify(`No ${PATH_KINDS[kind].name.toLowerCase()} strokes left on this card.`);
      const start = snapEndpoint([pt.x, pt.y], { kind, incoming: api.ctx.incoming, paths: api.draft().paths });
      stroke = { pts: [start.pt], snapStart: start.snap };
    },
    move(api, pt, dragging) {
      if (!dragging || !stroke) return;
      const last = stroke.pts[stroke.pts.length - 1];
      const p = [Math.max(0, Math.min(N, pt.x)), Math.max(0, Math.min(N, pt.y))];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.3) stroke.pts.push(p);
    },
    up(api, pt) {
      if (!stroke) return;
      const raw = [...stroke.pts, [pt.x, pt.y]];
      const end = snapEndpoint(raw[raw.length - 1], { kind, incoming: api.ctx.incoming, paths: api.draft().paths });
      const pts = simplify([...raw.slice(0, -1), end.pt], 0.3);
      stroke = null;
      if (pathLength(pts) < 1.5) return api.notify('Drag further to draw a stroke.');
      api.begin();
      const d = cloneDraft(api.draft());
      d.paths.push({ kind, pts: pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) });
      api.set(d);
    },
    cancel() { stroke = null; },
    preview(g, api, pt) {
      if (stroke) g.path(kind, [...stroke.pts, [pt.x, pt.y]]);
      else g.snapHint(snapEndpoint([pt.x, pt.y], { kind, incoming: api.ctx.incoming, paths: api.draft().paths }));
    },
  };
}

export const river = makePathTool('river', '〰', 'Drag to draw a river. Start at an arrow to continue one; end at water, or run it off an edge for the tile across to continue.');
export const road  = makePathTool('road',  '┅', 'Drag to draw a road. Ends snap to arrows, other roads, and tile edges — a road off an edge must be continued by the tile across.');
export const wall  = makePathTool('wall',  '▬', 'Drag to build a retaining wall — the void cannot cross it.');
export const ley   = makePathTool('ley',   '✧', 'Drag to trace a ley line.');

// ─── Point tools ──────────────────────────────────────────────────────────────

export const stamp = {
  id: 'stamp', label: 'Stamp', icon: '⌂', group: 'feature', cursor: 'copy',
  hint: 'Click to place the selected landmark.',
  down(api, pt) {
    const type = api.opts.stamp;
    if (!type) return api.notify('Pick a landmark first.');
    if ((api.remaining.stamps[type] ?? 0) <= 0) return api.notify(`No ${STAMP_REGISTRY[type].name} stamps left.`);
    const d = api.draft();
    const x = clamp01(pt.x / N), y = clamp01(pt.y / N);
    const err = stampError(type, x, y, { stamps: d.stamps, paths: d.paths, terrainAt: terrainReader(d) });
    if (err) return api.notify(err);
    api.begin();
    const next = cloneDraft(d);
    next.stamps.push({ type, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    api.set(next);
  },
  preview(g, api, pt) {
    const type = api.opts.stamp;
    if (!type) return;
    const d = api.draft();
    const x = clamp01(pt.x / N), y = clamp01(pt.y / N);
    const err = stampError(type, x, y, { stamps: d.stamps, paths: d.paths, terrainAt: terrainReader(d) });
    g.stampGhost(type, x, y, !!err);
  },
};

function nearestUpgradable(stamps, x, y) {
  let best = -1, bestD = 0.08;
  stamps.forEach((s, i) => {
    const d = Math.hypot(s.x - x, s.y - y);
    if (STAMP_REGISTRY[s.type]?.upgradesTo && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

export const upgrade = {
  id: 'upgrade', label: 'Upgrade', icon: '⇪', group: 'feature', cursor: 'pointer',
  hint: 'Click a settlement to grow it: hamlet → village → town → city.',
  charge: ctx => ctx.charges.upgrade ?? 0,
  down(api, pt) {
    if (api.remaining.upgrade <= 0) return api.notify('No upgrades left on this card.');
    const d = api.draft();
    const i = nearestUpgradable(d.stamps, pt.x / N, pt.y / N);
    if (i < 0) return api.notify('Click on a hamlet, village or town.');
    const s = d.stamps[i];
    const nextType = STAMP_REGISTRY[s.type].upgradesTo;
    const others = d.stamps.filter((_, j) => j !== i);
    const err = stampError(nextType, s.x, s.y, { stamps: others, paths: d.paths, terrainAt: terrainReader(d) });
    if (err) return api.notify(err);
    api.begin();
    const next = cloneDraft(d);
    next.stamps[i] = { ...s, type: nextType };
    api.set(next);
  },
  preview(g, api, pt) {
    const d = api.draft();
    const i = nearestUpgradable(d.stamps, pt.x / N, pt.y / N);
    if (i >= 0) g.ring(d.stamps[i].x * N, d.stamps[i].y * N, 1.6);
  },
};

export const label = {
  id: 'label', label: 'Label', icon: 'Aa', group: 'feature', cursor: 'text',
  hint: 'Type a name, then click to place it.',
  charge: ctx => ctx.charges.label ?? 0,
  down(api, pt) {
    const text = api.opts.labelText.trim();
    if (!text) return api.notify('Type a name first.');
    if (api.remaining.labels <= 0) return api.notify('No labels left on this card.');
    api.begin();
    const next = cloneDraft(api.draft());
    next.labels.push({ text: text.slice(0, 32), x: clamp01(pt.x / N), y: clamp01(pt.y / N), angle: api.opts.labelAngle, scale: api.opts.labelScale });
    api.set(next);
  },
  preview(g, api, pt) {
    const text = api.opts.labelText.trim();
    if (text) g.labelGhost({ text, x: clamp01(pt.x / N), y: clamp01(pt.y / N), angle: api.opts.labelAngle, scale: api.opts.labelScale });
  },
};

export const voidSeed = {
  id: 'voidSeed', label: 'Void', icon: '○', group: 'feature', cursor: 'crosshair',
  hint: 'Click to open a void. It will spread every few turns unless walled in.',
  charge: ctx => ctx.charges.voidSeed ?? 0,
  down(api, pt) {
    if (api.remaining.voidSeed <= 0) return api.notify('The void has already been planted.');
    api.begin();
    const next = cloneDraft(api.draft());
    for (const i of cellsInCircle(pt.x, pt.y, VOID_CONFIG.seedRadius)) if (!api.ctx.locked[i]) next.cells[i] = VOID;
    next.seeds += 1;
    api.set(next);
  },
  preview(g, api, pt) { g.brush(pt, VOID_CONFIG.seedRadius); },
};

export const FEATURE_TOOLS = [river, road, wall, ley, stamp, upgrade, label, voidSeed];

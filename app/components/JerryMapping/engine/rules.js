import { TILE_CELLS as N, CELL_COUNT, VOID_CONFIG } from '../config.js';
import { TERRAINS, VOID, WATER, FORBIDDEN_ADJACENCY, codeOf } from '../data/terrains.js';
import { STAMP_REGISTRY, stampError } from '../data/stamps.js';
import { neighbors4, terrainAtNorm, blankIndices, countCode } from './terrain.js';
import {
  PATH_KINDS, portOfPoint, portPoint, endpointAtPort, samplePath, distToPath, cellOfPoint,
} from './features.js';

// Rules registry. Every rule is a pure function of (draft, ctx, diff, cfg), so
// the same checks drive the live checklist in the editor and can validate a
// submission on a server.
//
//   label(cfg, ctx, diff)  checklist text
//   visible                'always' | 'failing' (only listed while broken)
//   check(...)             → { ok, message?, cells?: number[] }

const SIDE_NAMES = { top: 'north', bottom: 'south', left: 'west', right: 'east' };
const VOID_CELLS_PER_SEED = Math.ceil(Math.PI * (VOID_CONFIG.seedRadius + 0.5) ** 2);

const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ─── Diff a draft against its base tile ───────────────────────────────────────

export function diffDraft(ctx, draft) {
  const { base, locked } = ctx;
  const structural = [];
  let changedCells = 0, voidCells = 0, lockedChanged = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (draft.cells[i] === base.cells[i]) continue;
    if (locked[i]) { lockedChanged.push(i); continue; }
    if (draft.cells[i] === VOID) voidCells++; else changedCells++;
  }

  const basePaths = base.paths ?? [];
  if (!sameJSON(draft.paths.slice(0, basePaths.length), basePaths)) structural.push('Existing paths were altered.');
  const newPaths = draft.paths.slice(basePaths.length);

  const baseStamps = base.stamps ?? [];
  let upgrades = 0;
  for (let i = 0; i < baseStamps.length; i++) {
    const a = baseStamps[i], b = draft.stamps[i];
    if (!b) { structural.push('Existing stamps were removed.'); break; }
    if (sameJSON(a, b)) continue;
    const isUpgrade = a.x === b.x && a.y === b.y && STAMP_REGISTRY[a.type]?.upgradesTo === b.type;
    if (isUpgrade) upgrades++; else structural.push('Existing stamps were altered.');
  }
  const newStamps = draft.stamps.slice(baseStamps.length);

  const baseLabels = base.labels ?? [];
  if (!sameJSON(draft.labels.slice(0, baseLabels.length), baseLabels)) structural.push('Existing labels were altered.');
  const newLabels = draft.labels.slice(baseLabels.length);

  return { changedCells, voidCells, lockedChanged, newPaths, newStamps, upgrades, newLabels, structural };
}

export const countBy = (items, key) =>
  items.reduce((acc, it) => ({ ...acc, [it[key]]: (acc[it[key]] ?? 0) + 1 }), {});

// ─── Registry ─────────────────────────────────────────────────────────────────

export const RULES = {

  // ── Always-on (added by the engine) ────────────────────────────────────────

  structure: {
    visible: 'failing',
    label: () => 'Earlier work stays intact',
    check: (d, ctx, diff) => diff.structural.length
      ? { ok: false, message: diff.structural[0] }
      : { ok: true },
  },

  seamsIntact: {
    visible: 'failing',
    label: () => 'Edges match neighboring tiles',
    check: (d, ctx, diff) => diff.lockedChanged.length
      ? { ok: false, message: 'Locked seam cells were changed.', cells: diff.lockedChanged }
      : { ok: true },
  },

  paletteOnly: {
    visible: 'failing',
    label: () => 'Only the card\'s terrains are used',
    check: (d, ctx) => {
      const bad = [];
      for (let i = 0; i < CELL_COUNT; i++) {
        const c = d.cells[i];
        if (c === ctx.base.cells[i] || ctx.locked[i]) continue;
        const allowed = ctx.palette.has(c) || (c === VOID && ctx.charges.voidSeed) || c === ctx.base.cells[i];
        if (!allowed) bad.push(i);
      }
      return bad.length ? { ok: false, message: 'Some cells use terrain this card does not allow.', cells: bad } : { ok: true };
    },
  },

  withinInk: {
    visible: 'failing',
    label: () => 'Within the ink budget',
    check: (d, ctx, diff) => diff.changedCells <= ctx.ink
      ? { ok: true }
      : { ok: false, message: `${diff.changedCells} cells changed; the card allows ${ctx.ink}.` },
  },

  withinCharges: {
    visible: 'failing',
    label: () => 'Within the card\'s tool charges',
    check: (d, ctx, diff) => {
      const paths = countBy(diff.newPaths, 'kind');
      for (const [kind, n] of Object.entries(paths)) {
        if (n > (ctx.charges[kind] ?? 0)) return { ok: false, message: `Too many ${PATH_KINDS[kind]?.name ?? kind} strokes.` };
      }
      const stamps = countBy(diff.newStamps, 'type');
      for (const [type, n] of Object.entries(stamps)) {
        if (n > (ctx.stamps[type] ?? 0)) return { ok: false, message: `Too many ${STAMP_REGISTRY[type]?.name ?? type} stamps.` };
      }
      if (diff.upgrades > (ctx.charges.upgrade ?? 0)) return { ok: false, message: 'Too many upgrades.' };
      if (diff.newLabels.length > (ctx.charges.label ?? 0)) return { ok: false, message: 'Too many labels.' };
      if (diff.voidCells > (ctx.charges.voidSeed ?? 0) * VOID_CELLS_PER_SEED) return { ok: false, message: 'Too much void.' };
      return { ok: true };
    },
  },

  stampsOnValidGround: {
    visible: 'failing',
    label: () => 'Every landmark sits on suitable ground',
    check: (d) => {
      const terrainAt = (nx, ny) => terrainAtNorm(d.cells, nx, ny);
      for (const s of d.stamps) {
        if (terrainAt(s.x, s.y) === 'void') continue;   // swallowed by the void
        const others = d.stamps.filter(o => o !== s);
        const err = stampError(s.type, s.x, s.y, { stamps: others, paths: d.paths, terrainAt });
        if (err) return { ok: false, message: err, cells: [cellOfPoint([s.x * N, s.y * N])] };
      }
      return { ok: true };
    },
  },

  continuePorts: {
    visible: 'always',
    label: (cfg, ctx) => {
      const sides = [...new Set(ctx.requiredPorts.map(p => `${PATH_KINDS[p.kind].name.toLowerCase()} from the ${SIDE_NAMES[p.side]}`))];
      return `Continue the ${sides.join(', ')}`;
    },
    check: (d, ctx) => {
      // Ports the void swallows while editing no longer need continuing.
      const missing = ctx.requiredPorts.filter(p =>
        d.cells[cellOfPoint(portPoint(p.side, p.t))] !== VOID && !d.paths.some(path => endpointAtPort(path, p)));
      return missing.length
        ? { ok: false, message: `${plural(missing.length, 'connection')} still open — start a stroke on the arrow.`,
            cells: missing.map(p => cellOfPoint(portPoint(p.side, p.t))) }
        : { ok: true };
    },
  },

  // Roads and rivers may run off any edge — into an empty slot or a drawn
  // tile — and the tile across must then continue them. A road can't leave
  // over water, though: nothing on the other side could pick it up.
  roadsLeaveOnLand: {
    visible: 'failing',
    label: () => 'Roads leave the tile on land',
    check: (d, ctx, diff) => {
      for (const road of diff.newPaths.filter(p => p.kind === 'road')) {
        for (const end of [road.pts[0], road.pts[road.pts.length - 1]]) {
          const port = portOfPoint(end);
          if (!port) continue;
          const continues = ctx.incoming.some(p => p.side === port.side && p.kind === 'road' && Math.abs(p.t - port.t) < 0.8);
          const c = d.cells[cellOfPoint(end)];
          if (!continues && (c === WATER || c === VOID)) {
            return { ok: false, message: `That road leaves the ${SIDE_NAMES[port.side]} edge over water — the next tile couldn't continue it.`,
                     cells: [cellOfPoint(end)] };
          }
        }
      }
      return { ok: true };
    },
  },

  noForbiddenAdjacency: {
    visible: 'always',
    label: () => `Climates make sense (${FORBIDDEN_ADJACENCY.map(([a, b]) => `${TERRAINS[a].name.toLowerCase()} ≠ ${TERRAINS[b].name.toLowerCase()}`).join(', ')})`,
    check: (d, ctx) => {
      const pairs = new Set(FORBIDDEN_ADJACENCY.flatMap(([a, b]) => [codeOf(a) + codeOf(b), codeOf(b) + codeOf(a)]));
      const bad = new Set();
      for (let i = 0; i < CELL_COUNT; i++) {
        for (const j of neighbors4(i)) {
          if (j < i || (ctx.locked[i] && ctx.locked[j])) continue;
          if (pairs.has(d.cells[i] + d.cells[j])) { bad.add(i); bad.add(j); }
        }
      }
      return bad.size
        ? { ok: false, message: 'Separate these terrains with something in between.', cells: [...bad] }
        : { ok: true };
    },
  },

  riverAnchored: {
    visible: 'always',
    label: () => 'Rivers start at high ground, lakes or other rivers, and reach water or an edge',
    check: (d, ctx, diff) => {
      const anchors = new Set(['water', 'mountain', 'snow', 'marsh']);
      const bad = [];
      for (const river of diff.newPaths.filter(p => p.kind === 'river')) {
        for (const end of [river.pts[0], river.pts[river.pts.length - 1]]) {
          if (portOfPoint(end)) continue;
          const [x, y] = end;
          const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
            anchors.has(terrainAtNorm(d.cells, (x + dx) / N, (y + dy) / N)));
          const junction = d.paths.some(p => p !== river && p.kind === 'river' && distToPath(end, p.pts) < 0.6);
          if (!near && !junction) bad.push(cellOfPoint(end));
        }
      }
      return bad.length
        ? { ok: false, message: 'A river end is stranded on dry land.', cells: bad }
        : { ok: true };
    },
  },

  roadOnLand: {
    visible: 'always',
    label: () => 'Roads stay on land (short bridges allowed)',
    check: (d, ctx, diff) => {
      for (const road of diff.newPaths.filter(p => p.kind === 'road')) {
        let run = 0;
        for (const pt of samplePath(road.pts, 0.5)) {
          const c = d.cells[cellOfPoint(pt)];
          run = c === WATER || c === VOID ? run + 1 : 0;
          if (run > 8) return { ok: false, message: 'A road crosses too much water — bridges span at most 4 cells.', cells: [cellOfPoint(pt)] };
        }
      }
      return { ok: true };
    },
  },

  // ── Card requirements ──────────────────────────────────────────────────────

  fullyPainted: {
    visible: 'always',
    label: () => 'Paint every blank cell',
    check: (d) => {
      const blanks = blankIndices(d.cells);
      return blanks.length
        ? { ok: false, message: `${plural(blanks.length, 'blank cell')} left.`, cells: blanks }
        : { ok: true };
    },
  },

  includeTerrain: {
    visible: 'always',
    label: (cfg) => `At least ${cfg.minCells} cells of ${TERRAINS[cfg.type].name}`,
    check: (d, ctx, diff, cfg) => {
      const n = countCode(d.cells, codeOf(cfg.type));
      return n >= cfg.minCells ? { ok: true, message: `${n} cells` } : { ok: false, message: `${n} / ${cfg.minCells} cells.` };
    },
  },

  minPaths: {
    visible: 'always',
    label: (cfg) => cfg.n === 1
      ? `Draw a ${PATH_KINDS[cfg.kind].name.toLowerCase()}`
      : `Draw ${cfg.n} ${PATH_KINDS[cfg.kind].name.toLowerCase()}s`,
    check: (d, ctx, diff, cfg) => {
      const n = diff.newPaths.filter(p => p.kind === cfg.kind).length;
      return n >= cfg.n ? { ok: true } : { ok: false, message: `${n} / ${cfg.n} drawn.` };
    },
  },

  minStamps: {
    visible: 'always',
    label: (cfg) => cfg.n === 1 ? 'Place a landmark' : `Place ${cfg.n} landmarks`,
    check: (d, ctx, diff, cfg) => diff.newStamps.length >= cfg.n
      ? { ok: true } : { ok: false, message: `${diff.newStamps.length} / ${cfg.n} placed.` },
  },

  minLabels: {
    visible: 'always',
    label: () => 'Name a place on this tile',
    check: (d, ctx, diff, cfg) => diff.newLabels.length >= cfg.n ? { ok: true } : { ok: false },
  },

  madeChange: {
    visible: 'always',
    label: (cfg) => cfg.orStamp
      ? 'Upgrade a settlement or found a new one'
      : `Rework at least ${cfg.minCells} cells`,
    check: (d, ctx, diff, cfg) => {
      const cellsOk = diff.changedCells >= Math.max(1, cfg.minCells);
      const stampOk = cfg.orStamp && (diff.upgrades > 0 || diff.newStamps.length > 0);
      if (cellsOk || stampOk) return { ok: true };
      return { ok: false, message: cfg.orStamp ? undefined : `${diff.changedCells} / ${cfg.minCells} cells.` };
    },
  },

  voidPlanted: {
    visible: 'always',
    label: () => 'Plant the void',
    check: (d, ctx, diff) => diff.voidCells > 0 ? { ok: true } : { ok: false },
  },
};

// ─── Assemble and evaluate ────────────────────────────────────────────────────

const normalizeSpec = spec => (typeof spec === 'string' ? { rule: spec } : spec);

export function rulesFor(ctx) {
  const specs = [
    { rule: 'structure' }, { rule: 'seamsIntact' }, { rule: 'paletteOnly' },
    { rule: 'withinInk' }, { rule: 'withinCharges' }, { rule: 'stampsOnValidGround' },
    { rule: 'roadsLeaveOnLand' },
  ];
  if (ctx.requiredPorts.length) specs.push({ rule: 'continuePorts' });
  specs.push(...(ctx.card.requires ?? []).map(normalizeSpec));
  if (ctx.palette.size) specs.push({ rule: 'noForbiddenAdjacency' });
  if (ctx.charges.river) specs.push({ rule: 'riverAnchored' });
  if (ctx.charges.road) specs.push({ rule: 'roadOnLand' });
  return specs;
}

export function evaluateRules(ctx, draft) {
  const diff = diffDraft(ctx, draft);
  const results = rulesFor(ctx).map(cfg => {
    const rule = RULES[cfg.rule];
    const res = rule.check(draft, ctx, diff, cfg);
    return { id: cfg.rule, label: rule.label(cfg, ctx, diff), visible: rule.visible, ...res };
  });
  return { results, diff, allOk: results.every(r => r.ok) };
}

// Ports a tile must continue: incoming river/road ports not swallowed by the
// void and not already continued by the base tile. Applies to new and drawn
// tiles alike — a road drawn into a finished tile leaves it an open end.
export function requiredPortsFor(incoming, base) {
  return incoming.filter(p =>
    PATH_KINDS[p.kind]?.needsContinuation &&
    base.cells[cellOfPoint(portPoint(p.side, p.t))] !== VOID &&
    !(base.paths ?? []).some(path => endpointAtPort(path, p)));
}


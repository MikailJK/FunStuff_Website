import { TILE_CELLS as N } from '../config.js';
import { distToPath } from '../engine/features.js';
import { TERRAINS } from './terrains.js';

// Stamp registry — every placeable point feature is defined here as data + pure
// functions. Adding a stamp means adding one entry and referencing its id from a
// card's tools.stamp. Stamps are stored as { type, x, y } in normalized (0-1)
// tile coordinates.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function nearPathKind(paths, kind, x, y, cells) {
  return paths.some(p => p.kind === kind && distToPath([x * N, y * N], p.pts) <= cells);
}

function nearTerrain(terrainAt, x, y, type, radius) {
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    for (const rr of [radius / 2, radius]) {
      const sx = Math.max(0, Math.min(0.999, x + Math.cos(ang) * rr));
      const sy = Math.max(0, Math.min(0.999, y + Math.sin(ang) * rr));
      if (terrainAt(sx, sy) === type) return true;
    }
  }
  return false;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
// Icons are stroked twice (dark underlay, light overlay) so they read on any terrain.

const INK_DARK  = 'rgba(12, 10, 16, 0.9)';
const INK_LIGHT = '#f0ead8';

export function twoTone(ctx, u, draw, { dash = null, light = INK_LIGHT, fill = null } = {}) {
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash.map(d => d * u));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.beginPath(); draw(ctx); ctx.fill();
  }
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth   = Math.max(1.5, 4 * u);
  ctx.beginPath(); draw(ctx); ctx.stroke();
  ctx.strokeStyle = light;
  ctx.lineWidth   = Math.max(0.75, 1.8 * u);
  ctx.beginPath(); draw(ctx); ctx.stroke();
  ctx.restore();
}

function houses(c, cx, cy, u, spots, s) {
  for (const [dx, dy] of spots) c.rect(cx + dx * u - s * u, cy + dy * u - s * u, 2 * s * u, 2 * s * u);
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Each entry:
//   name              display name
//   terrainTypes      terrain the stamp must sit on (null = anything but water/void)
//   tier / upgradesTo settlement ladder used by revise cards
//   placementValidator({ x, y, stamps, paths, terrainAt }) => error string | null
//   render(ctx, stamp, size)

export const STAMP_REGISTRY = {

  // ── Settlements (hamlet → village → town → city) ──────────────────────────

  hamlet: {
    name: 'Hamlet', terrainTypes: ['land', 'forest', 'desert', 'snow', 'marsh'],
    tier: 1, upgradesTo: 'village',
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => houses(c, cx, cy, u, [[-6, 3], [6, -3]], 4));
    },
  },

  village: {
    name: 'Village', terrainTypes: ['land', 'forest', 'desert', 'snow'],
    tier: 2, upgradesTo: 'town',
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => houses(c, cx, cy, u, [[-13, 8], [13, 8], [0, -11]], 5));
    },
  },

  town: {
    name: 'Town', terrainTypes: ['land', 'desert'],
    tier: 3, upgradesTo: 'city',
    placementValidator({ x, y, paths }) {
      return nearPathKind(paths, 'road', x, y, 6) ? null : 'Towns must be near a road.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 20 * u;
      twoTone(ctx, u, c => {
        c.rect(cx - r, cy - r, r * 2, r * 2);
        houses(c, cx, cy, u, [[-9, -9], [9, -9], [-9, 9], [9, 9]], 3.5);
      });
    },
  },

  city: {
    name: 'City', terrainTypes: ['land', 'desert'],
    tier: 4,
    placementValidator({ x, y, paths, terrainAt }) {
      if (!nearPathKind(paths, 'road', x, y, 6)) return 'Cities must be near a road.';
      const roads = paths.filter(p => p.kind === 'road' && distToPath([x * N, y * N], p.pts) <= 8).length;
      if (roads < 2 && !nearTerrain(terrainAt, x, y, 'water', 0.18)) {
        return 'Cities need two nearby roads, or a road and water.';
      }
      return null;
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 26 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx + r, cy);
        c.arc(cx, cy, r, 0, Math.PI * 2);
        houses(c, cx, cy, u, [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0]], 4);
      }, { fill: 'rgba(240, 234, 216, 0.25)' });
    },
  },

  // ── Works ─────────────────────────────────────────────────────────────────

  farm: {
    name: 'Farm', terrainTypes: ['land'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, w = 24 * u, h = 17 * u;
      twoTone(ctx, u, c => {
        c.rect(cx - w, cy - h, w * 2, h * 2);
        for (let i = 1; i <= 3; i++) {
          const yy = cy - h + (i * h * 2) / 4;
          c.moveTo(cx - w, yy);
          c.lineTo(cx + w, yy);
        }
      });
    },
  },

  windmill: {
    name: 'Windmill', terrainTypes: ['land'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 14 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r);
        c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r);
        c.moveTo(cx - 4 * u, cy + r * 1.3); c.lineTo(cx, cy); c.lineTo(cx + 4 * u, cy + r * 1.3);
      });
    },
  },

  port: {
    name: 'Harbor', terrainTypes: ['land', 'marsh', 'desert'],
    placementValidator({ x, y, terrainAt }) {
      return nearTerrain(terrainAt, x, y, 'water', 0.15) ? null : 'Harbors must be next to water.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.moveTo(cx + 5 * u, cy - 12 * u);
        c.arc(cx, cy - 12 * u, 5 * u, 0, Math.PI * 2);
        c.moveTo(cx, cy - 7 * u);
        c.lineTo(cx, cy + 14 * u);
        c.moveTo(cx - 12 * u, cy + 4 * u);
        c.arc(cx, cy + 4 * u, 12 * u, Math.PI, 0, true);
      });
    },
  },

  lighthouse: {
    name: 'Lighthouse', terrainTypes: ['land', 'mountain', 'snow', 'desert'],
    placementValidator({ x, y, terrainAt }) {
      return nearTerrain(terrainAt, x, y, 'water', 0.1) ? null : 'Lighthouses stand on the shore.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.moveTo(cx - 6 * u, cy + 14 * u); c.lineTo(cx - 3 * u, cy - 10 * u);
        c.lineTo(cx + 3 * u, cy - 10 * u); c.lineTo(cx + 6 * u, cy + 14 * u); c.closePath();
        for (const a of [-0.5, 0, 0.5]) {
          c.moveTo(cx + Math.sin(a) * 9 * u, cy - 13 * u - Math.cos(a) * 3 * u);
          c.lineTo(cx + Math.sin(a) * 18 * u, cy - 13 * u - Math.cos(a) * 9 * u);
        }
      }, { light: '#f6e27a' });
    },
  },

  mine: {
    name: 'Mine', terrainTypes: ['mountain', 'snow'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 15 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r);
        c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r);
      });
    },
  },

  castle: {
    name: 'Castle', terrainTypes: ['land', 'mountain', 'snow'],
    placementValidator({ x, y, stamps }) {
      const close = stamps.some(s => s.type === 'castle' && Math.hypot(s.x - x, s.y - y) < 0.3);
      return close ? 'Castles need room — keep them apart.' : null;
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, w = 16 * u, h = 13 * u, t = 5 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - w, cy + h);
        c.lineTo(cx - w, cy - h);
        for (let i = 0; i < 4; i++) {
          const x0 = cx - w + (i * 2 * w) / 4;
          c.lineTo(x0, cy - h - t); c.lineTo(x0 + w / 4, cy - h - t); c.lineTo(x0 + w / 4, cy - h);
          c.lineTo(x0 + w / 2, cy - h);
        }
        c.lineTo(cx + w, cy + h);
        c.closePath();
      });
    },
  },

  outpost: {
    name: 'Outpost', terrainTypes: ['snow', 'mountain', 'desert'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 12 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - r, cy + r); c.lineTo(cx, cy - r); c.lineTo(cx + r, cy + r); c.closePath();
        c.moveTo(cx, cy - r); c.lineTo(cx, cy - r - 9 * u); c.lineTo(cx + 8 * u, cy - r - 6 * u); c.lineTo(cx, cy - r - 3 * u);
      });
    },
  },

  oasis: {
    name: 'Oasis', terrainTypes: ['desert'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.ellipse(cx, cy + 6 * u, 14 * u, 6 * u, 0, 0, Math.PI * 2);
        c.moveTo(cx, cy + 4 * u); c.quadraticCurveTo(cx + 2 * u, cy - 6 * u, cx - 2 * u, cy - 14 * u);
        for (const a of [-2.4, -1.6, -0.8]) {
          c.moveTo(cx - 2 * u, cy - 14 * u);
          c.lineTo(cx - 2 * u + Math.cos(a) * 10 * u, cy - 14 * u + Math.sin(a) * 6 * u + 6 * u);
        }
      }, { light: '#bfe3a0' });
    },
  },

  ruins: {
    name: 'Ruins', terrainTypes: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        for (let i = 0; i < 5; i++) {
          const a  = hash2(m.x + i * 0.37, m.y + i * 0.61) * Math.PI * 2;
          const rr = (8 + hash2(m.y + i * 0.53, m.x + i * 0.29) * 12) * u;
          const s  = (4 + hash2(m.x + i * 0.11, m.y + i * 0.83) * 4) * u;
          c.rect(cx + Math.cos(a) * rr - s / 2, cy + Math.sin(a) * rr - s / 2, s, s);
        }
      });
    },
  },

  waystone: {
    name: 'Waystone', terrainTypes: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 12 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx + r, cy);
        c.arc(cx, cy, r, 0, Math.PI * 2);
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          c.moveTo(cx + dx * r, cy + dy * r);
          c.lineTo(cx + dx * (r + 6 * u), cy + dy * (r + 6 * u));
        }
      });
    },
  },

  watchtower: {
    name: 'Watchtower', terrainTypes: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.rect(cx - 5 * u, cy - 10 * u, 10 * u, 22 * u);
        c.moveTo(cx - 9 * u, cy - 10 * u); c.lineTo(cx + 9 * u, cy - 10 * u);
        c.lineTo(cx, cy - 19 * u); c.closePath();
      }, { light: '#d8d0c0' });
    },
  },

  // ── Fantasy / fun ──────────────────────────────────────────────────────────

  volcano: {
    name: 'Volcano', terrainTypes: ['mountain'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 16 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - r, cy + r * 0.8);
        c.lineTo(cx, cy - r);
        c.lineTo(cx + r, cy + r * 0.8);
        c.closePath();
        for (const [dx, dy] of [[-0.5, -1.4], [0, -1.6], [0.5, -1.4]]) {
          c.moveTo(cx + dx * 6 * u, cy - r);
          c.lineTo(cx + dx * 12 * u, cy + dy * r);
        }
      }, { light: '#f0b060' });
    },
  },

  ancient_grove: {
    name: 'Ancient Grove', terrainTypes: ['forest'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.moveTo(cx + 7 * u, cy);
        c.arc(cx, cy, 7 * u, 0, Math.PI * 2);
        c.moveTo(cx + 14 * u, cy);
        c.arc(cx, cy, 14 * u, 0, Math.PI * 2);
        c.moveTo(cx + 20 * u, cy);
        c.arc(cx, cy, 20 * u, 0, Math.PI * 2);
      }, { light: '#a8e0a0' });
    },
  },

  dragon_lair: {
    name: 'Dragon Lair', terrainTypes: ['mountain', 'snow'],
    placementValidator({ x, y }) {
      return Math.hypot(x - 0.5, y - 0.5) > 0.25 ? null : 'Dragon lairs hide away from the tile center.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 15 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx, cy - r); c.lineTo(cx + r, cy);
        c.lineTo(cx, cy + r); c.lineTo(cx - r, cy);
        c.closePath();
        c.moveTo(cx - r * 0.5, cy - r * 0.5); c.lineTo(cx + r * 0.5, cy + r * 0.5);
        c.moveTo(cx + r * 0.5, cy - r * 0.5); c.lineTo(cx - r * 0.5, cy + r * 0.5);
      }, { light: '#e08080' });
    },
  },

  sunken_ruin: {
    name: 'Sunken Ruins', terrainTypes: ['water'],
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 14 * u;
      twoTone(ctx, u, c => c.rect(cx - r, cy - r, r * 2, r * 2), { dash: [7, 6] });
    },
  },
};

export const SETTLEMENT_IDS = Object.keys(STAMP_REGISTRY).filter(id => STAMP_REGISTRY[id].tier);

// Shared placement check — used by the editor while placing and by the engine
// when validating a submission.
export function stampError(type, x, y, { stamps, paths, terrainAt }) {
  const stamp = STAMP_REGISTRY[type];
  if (!stamp) return 'Unknown stamp.';
  const under = terrainAt(x, y);
  if (under === 'void') return 'Nothing can be built in the void.';
  if (stamp.terrainTypes ? !stamp.terrainTypes.includes(under) : under === 'water') {
    const allowed = stamp.terrainTypes?.map(t => TERRAINS[t].name.toLowerCase()) ?? ['solid ground'];
    return `${stamp.name} must sit on ${allowed.join(' or ')}.`;
  }
  return stamp.placementValidator?.({ x, y, stamps, paths, terrainAt }) ?? null;
}

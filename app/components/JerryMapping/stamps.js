// Stamp registry — every placeable marker is defined here as data + pure functions.
// TileEditor and tileUtils only consume this registry; adding a new stamp means
// adding one entry (render + optional placementValidator) and referencing its id
// from a card's allowedMarkers.
//
// Marker data shapes (stored on tiles, normalized 0-1 coordinates):
//   point stamps:     { type, x, y }
//   edge-pair stamps: { type, from: {edge, t}, to: {edge, t} }

// ─── Geometry helpers ─────────────────────────────────────────────────────────

export function edgePointNorm(edge, t) {
  switch (edge) {
    case 'top':    return { x: t, y: 0 };
    case 'bottom': return { x: t, y: 1 };
    case 'left':   return { x: 0, y: t };
    case 'right':  return { x: 1, y: t };
    default:       return { x: 0, y: 0 };
  }
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function orient(a, b, c) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d);
  const o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function lineChord(line) {
  return [edgePointNorm(line.from.edge, line.from.t), edgePointNorm(line.to.edge, line.to.t)];
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
// Icons are stroked twice (dark underlay, light overlay) so they read on any terrain.

const INK_DARK  = 'rgba(12, 10, 16, 0.9)';
const INK_LIGHT = '#f0ead8';

function twoTone(ctx, u, draw, { dash = null, light = INK_LIGHT } = {}) {
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash.map(d => d * u));
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth   = Math.max(1.5, 4 * u);
  ctx.beginPath(); draw(ctx); ctx.stroke();
  ctx.strokeStyle = light;
  ctx.lineWidth   = Math.max(0.75, 1.8 * u);
  ctx.beginPath(); draw(ctx); ctx.stroke();
  ctx.restore();
}

// Curved path between two edge points, bowing gently toward the tile center
// so it always stays inside the tile.
function edgePairPath(ctx, marker, size) {
  const p1  = edgePointNorm(marker.from.edge, marker.from.t);
  const p2  = edgePointNorm(marker.to.edge,   marker.to.t);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const ctrl = {
    x: mid.x + (0.5 - mid.x) * 0.35,
    y: mid.y + (0.5 - mid.y) * 0.35,
  };
  ctx.moveTo(p1.x * size, p1.y * size);
  ctx.quadraticCurveTo(ctrl.x * size, ctrl.y * size, p2.x * size, p2.y * size);
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Each entry:
//   name              display name
//   terrainTypes      region types the anchor point must sit on (null = any)
//   placementMode     'point' (single click) | 'edge-pair' (drag edge to edge)
//   placementValidator({ x, y, from, to, markers, lines, sampleType }) => error string | null
//   render(ctx, marker, size)

export const STAMP_REGISTRY = {

  // ── Human settlements ──────────────────────────────────────────────────────

  village: {
    name: 'Village',
    terrainTypes: ['land'],
    placementMode: 'point',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        for (const [dx, dy] of [[-13, 8], [13, 8], [0, -11]]) {
          c.rect(cx + dx * u - 5 * u, cy + dy * u - 5 * u, 10 * u, 10 * u);
        }
      });
    },
  },

  town: {
    name: 'Town',
    terrainTypes: ['land'],
    placementMode: 'point',
    placementValidator({ x, y, markers }) {
      const nearRoad = markers.some(mk =>
        mk.type === 'road' &&
        distToSegment({ x, y }, ...lineChord(mk)) < 0.3
      );
      return nearRoad ? null : 'Towns must be placed near a road.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 20 * u;
      twoTone(ctx, u, c => {
        c.rect(cx - r, cy - r, r * 2, r * 2);
        for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
          c.rect(cx + dx * u - 3.5 * u, cy + dy * u - 3.5 * u, 7 * u, 7 * u);
        }
      });
    },
  },

  road: {
    name: 'Road',
    terrainTypes: ['land', 'forest'],
    placementMode: 'edge-pair',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400;
      twoTone(ctx, u, c => edgePairPath(c, m, size), { dash: [10, 8], light: '#c9a86a' });
    },
  },

  farm: {
    name: 'Farm',
    terrainTypes: ['land'],
    placementMode: 'point',
    placementValidator: null,
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

  port: {
    name: 'Harbor',
    terrainTypes: ['land'],
    placementMode: 'point',
    placementValidator({ x, y, sampleType }) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        for (const rr of [0.08, 0.15]) {
          const sx = Math.max(0, Math.min(1, x + Math.cos(ang) * rr));
          const sy = Math.max(0, Math.min(1, y + Math.sin(ang) * rr));
          if (sampleType(sx, sy) === 'water') return null;
        }
      }
      return 'Harbors must be placed near water.';
    },
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.arc(cx, cy - 12 * u, 5 * u, 0, Math.PI * 2);
        c.moveTo(cx, cy - 7 * u);
        c.lineTo(cx, cy + 14 * u);
        c.moveTo(cx - 12 * u, cy + 4 * u);
        c.arc(cx, cy + 4 * u, 12 * u, Math.PI, 0, true);
      });
    },
  },

  mine: {
    name: 'Mine',
    terrainTypes: ['mountain'],
    placementMode: 'point',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 15 * u;
      twoTone(ctx, u, c => {
        c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r);
        c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r);
      });
    },
  },

  bridge: {
    name: 'Bridge',
    terrainTypes: null,
    placementMode: 'edge-pair',
    placementValidator({ from, to, lines }) {
      const a = edgePointNorm(from.edge, from.t);
      const b = edgePointNorm(to.edge, to.t);
      const crosses = lines.some(l => segmentsIntersect(a, b, ...lineChord(l)));
      return crosses ? null : 'Bridges must cross a boundary line.';
    },
    render(ctx, m, size) {
      const u  = size / 400;
      const p1 = edgePointNorm(m.from.edge, m.from.t);
      const p2 = edgePointNorm(m.to.edge,   m.to.t);
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const nx = (-(p2.y - p1.y) / len) * (5 / 400);
      const ny = ((p2.x - p1.x) / len)  * (5 / 400);
      twoTone(ctx, u, c => {
        c.moveTo((p1.x + nx) * size, (p1.y + ny) * size);
        c.lineTo((p2.x + nx) * size, (p2.y + ny) * size);
        c.moveTo((p1.x - nx) * size, (p1.y - ny) * size);
        c.lineTo((p2.x - nx) * size, (p2.y - ny) * size);
      });
    },
  },

  ruins: {
    name: 'Ruins',
    terrainTypes: null,
    placementMode: 'point',
    placementValidator: null,
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

  // ── Fantasy / fun ──────────────────────────────────────────────────────────

  ley_line: {
    name: 'Ley Line',
    terrainTypes: null,
    placementMode: 'edge-pair',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400;
      ctx.save();
      ctx.shadowColor = 'rgba(140, 220, 255, 0.9)';
      ctx.shadowBlur  = 8 * u;
      ctx.strokeStyle = 'rgba(170, 230, 255, 0.95)';
      ctx.lineWidth   = Math.max(1, 2 * u);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      edgePairPath(ctx, m, size);
      ctx.stroke();
      ctx.restore();
    },
  },

  volcano: {
    name: 'Volcano',
    terrainTypes: ['mountain'],
    placementMode: 'point',
    placementValidator: null,
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
    name: 'Ancient Grove',
    terrainTypes: ['forest'],
    placementMode: 'point',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size;
      twoTone(ctx, u, c => {
        c.arc(cx, cy, 7 * u, 0, Math.PI * 2);
        c.moveTo(cx + 14 * u, cy);
        c.arc(cx, cy, 14 * u, 0, Math.PI * 2);
        c.moveTo(cx + 20 * u, cy);
        c.arc(cx, cy, 20 * u, 0, Math.PI * 2);
      }, { light: '#a8e0a0' });
    },
  },

  dragon_lair: {
    name: 'Dragon Lair',
    terrainTypes: ['mountain'],
    placementMode: 'point',
    placementValidator({ x, y }) {
      return Math.hypot(x - 0.5, y - 0.5) > 0.25
        ? null
        : 'Dragon lairs must be placed away from the tile center.';
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
    name: 'Sunken Ruins',
    terrainTypes: ['water'],
    placementMode: 'point',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 14 * u;
      twoTone(ctx, u, c => c.rect(cx - r, cy - r, r * 2, r * 2), { dash: [7, 6] });
    },
  },

  waystone: {
    name: 'Waystone',
    terrainTypes: null,
    placementMode: 'point',
    placementValidator: null,
    render(ctx, m, size) {
      const u = size / 400, cx = m.x * size, cy = m.y * size, r = 12 * u;
      twoTone(ctx, u, c => {
        c.arc(cx, cy, r, 0, Math.PI * 2);
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          c.moveTo(cx + dx * r, cy + dy * r);
          c.lineTo(cx + dx * (r + 6 * u), cy + dy * (r + 6 * u));
        }
      });
    },
  },
};

export function getStamp(id) {
  return STAMP_REGISTRY[id] ?? null;
}

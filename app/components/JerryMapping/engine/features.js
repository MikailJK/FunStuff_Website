import { TILE_CELLS as N } from '../config.js';
import { idx, inBounds } from './terrain.js';

// Linear features (rivers, roads, walls, ley lines) are polylines stored in
// tile-local cell units: points range over [0, N]. An endpoint lying exactly on
// the tile edge becomes a *port* — the neighbor across that edge sees it and is
// asked to continue the feature, which keeps networks connected map-wide.

export const PATH_KINDS = {
  river: { name: 'River',     needsContinuation: true  },
  road:  { name: 'Road',      needsContinuation: true  },
  wall:  { name: 'Wall',      needsContinuation: false },
  ley:   { name: 'Ley Line',  needsContinuation: false },
};

export const PORT_TOLERANCE = 0.75;   // cells — how close counts as "at the port"
const EDGE_SNAP     = 1.0;            // cells from the edge that snap onto it
const PORT_SNAP     = 1.6;
const JUNCTION_SNAP = 1.0;

export function portOfPoint([x, y]) {
  if (x <= 0) return { side: 'left',   t: y };
  if (x >= N) return { side: 'right',  t: y };
  if (y <= 0) return { side: 'top',    t: x };
  if (y >= N) return { side: 'bottom', t: x };
  return null;
}

export function portPoint(side, t) {
  switch (side) {
    case 'left':   return [0, t];
    case 'right':  return [N, t];
    case 'top':    return [t, 0];
    case 'bottom': return [t, N];
  }
}

export function derivePorts(paths) {
  const ports = [];
  for (const path of paths) {
    for (const end of [path.pts[0], path.pts[path.pts.length - 1]]) {
      const p = portOfPoint(end);
      if (p && !ports.some(q => q.side === p.side && q.kind === path.kind && Math.abs(q.t - p.t) < 0.01)) {
        ports.push({ ...p, kind: path.kind });
      }
    }
  }
  return ports;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Snaps a stroke endpoint: matching incoming port → existing path of the same
// kind (junction) → tile edge → unchanged. Edge snaps stay half a cell away
// from corners so every port has an unambiguous side.
export function snapEndpoint(pt, { kind, incoming = [], paths = [] }) {
  let best = null, bestD = PORT_SNAP;
  for (const p of incoming) {
    if (p.kind !== kind) continue;
    const pp = portPoint(p.side, p.t);
    const d = dist(pt, pp);
    if (d < bestD) { bestD = d; best = pp; }
  }
  if (best) return { pt: best, snap: 'port' };

  bestD = JUNCTION_SNAP;
  for (const path of paths) {
    if (path.kind !== kind) continue;
    for (const q of samplePath(path.pts, 0.5)) {
      const d = dist(pt, q);
      if (d < bestD) { bestD = d; best = q; }
    }
  }
  if (best) return { pt: best, snap: 'junction' };

  const [x, y] = pt;
  const clampT = t => Math.max(0.5, Math.min(N - 0.5, t));
  const edges = [[x, 'left'], [N - x, 'right'], [y, 'top'], [N - y, 'bottom']].sort((a, b) => a[0] - b[0]);
  if (edges[0][0] <= EDGE_SNAP) {
    const side = edges[0][1];
    const t = clampT(side === 'left' || side === 'right' ? y : x);
    return { pt: portPoint(side, t), snap: 'edge' };
  }
  return { pt: [Math.max(0, Math.min(N, x)), Math.max(0, Math.min(N, y))], snap: null };
}

// Ramer–Douglas–Peucker simplification.
export function simplify(pts, eps = 0.35) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], a, b);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD <= eps) return [a, b];
  return [...simplify(pts.slice(0, maxI + 1), eps).slice(0, -1), ...simplify(pts.slice(maxI), eps)];
}

export function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distToPath(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
  return pts.length === 1 ? dist(p, pts[0]) : best;
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1]);
  return len;
}

// Evenly spaced points along a polyline (always includes both ends).
export function samplePath(pts, step = 0.5) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let s = 1; s <= n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  return out;
}

export function cellOfPoint([x, y]) {
  const cx = Math.min(N - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(N - 1, Math.max(0, Math.floor(y)));
  return idx(cx, cy);
}

// Cell indices within `radius` of a polyline — used to turn walls into cells.
export function rasterizePath(pts, radius = 0.75) {
  const out = new Set();
  for (const [x, y] of samplePath(pts, 0.25)) {
    for (let cy = Math.floor(y - radius); cy <= Math.ceil(y + radius); cy++) {
      for (let cx = Math.floor(x - radius); cx <= Math.ceil(x + radius); cx++) {
        if (inBounds(cx, cy) && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius + 0.35) out.add(idx(cx, cy));
      }
    }
  }
  return [...out];
}

export function endpointAtPort(path, port) {
  const pp = portPoint(port.side, port.t);
  return path.kind === port.kind &&
    [path.pts[0], path.pts[path.pts.length - 1]].some(e => dist(e, pp) <= PORT_TOLERANCE);
}

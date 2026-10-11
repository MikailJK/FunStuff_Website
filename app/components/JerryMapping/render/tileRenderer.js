import { TILE_CELLS as N } from '../config.js';
import { TERRAINS, VOID } from '../data/terrains.js';
import { STAMP_REGISTRY } from '../data/stamps.js';
import { apronReader } from '../engine/seams.js';
import { samplePath } from '../engine/features.js';
import { hash01 } from '../engine/rng.js';
import { drawGlyphs } from './glyphs.js';

// Turns tile data into pixels. Rendering is a pure function of the data (plus
// the neighboring tiles, read through a 1-cell apron so smoothing flows across
// seams), so every client draws identical maps.

const TERRAIN_BY_CODE = Object.fromEntries(Object.values(TERRAINS).map(t => [t.code, t]));
const Z_OF = Object.fromEntries(Object.values(TERRAINS).map(t => [t.code, t.z]));
const RGB_BY_Z = [];
for (const t of Object.values(TERRAINS)) {
  const m = /^#(..)(..)(..)$/.exec(t.color);
  RGB_BY_Z[t.z] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
const Z_WATER = TERRAINS.water.z, Z_VOID = TERRAINS.void.z, Z_BLANK = TERRAINS.blank.z;

const smooth = t => t * t * (3 - 2 * t);

// Value noise in global cell units — makes boundaries wobble like ink.
function valueNoise(gu, gv) {
  const i = Math.floor(gu), j = Math.floor(gv);
  const fu = smooth(gu - i), fv = smooth(gv - j);
  const a = hash01(13, i, j), b = hash01(13, i + 1, j);
  const c = hash01(13, i, j + 1), d = hash01(13, i + 1, j + 1);
  return (a + (b - a) * fu) + ((c + (d - c) * fu) - (a + (b - a) * fu)) * fv;
}

// ─── Terrain level map ────────────────────────────────────────────────────────
// For every pixel, find the highest terrain layer whose smoothed coverage
// passes a noisy 0.5 threshold. Layers nest by z, so there are no gaps where
// three terrains meet.

export function computeLevels(read, size, tx, ty) {
  const levels = new Uint8Array(size * size);
  const scale = N / size;
  const quad = [0, 0, 0, 0], wts = [0, 0, 0, 0], used = [false, false, false, false];
  for (let py = 0; py < size; py++) {
    const v = (py + 0.5) * scale - 0.5;
    const j0 = Math.floor(v), sv = smooth(v - j0);
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) * scale - 0.5;
      const i0 = Math.floor(u), su = smooth(u - i0);
      quad[0] = Z_OF[read(i0, j0)]; quad[1] = Z_OF[read(i0 + 1, j0)];
      quad[2] = Z_OF[read(i0, j0 + 1)]; quad[3] = Z_OF[read(i0 + 1, j0 + 1)];
      if (quad[0] === quad[1] && quad[1] === quad[2] && quad[2] === quad[3]) {
        levels[py * size + px] = quad[0];
        continue;
      }
      wts[0] = (1 - su) * (1 - sv); wts[1] = su * (1 - sv); wts[2] = (1 - su) * sv; wts[3] = su * sv;
      const gu = tx * N + u + 0.5, gv = ty * N + v + 0.5;
      const threshold = 0.5 + (valueNoise(gu * 1.3, gv * 1.3) - 0.5) * 0.28 + (valueNoise(gu * 3.1, gv * 3.1) - 0.5) * 0.14;
      // Highest z first: accumulate coverage until it passes the threshold.
      let best = 0, acc = 0, remaining = 4;
      used[0] = used[1] = used[2] = used[3] = false;
      while (remaining) {
        let k = -1;
        for (let q = 0; q < 4; q++) if (!used[q] && (k < 0 || quad[q] > quad[k])) k = q;
        const z = quad[k];
        for (let q = 0; q < 4; q++) if (!used[q] && quad[q] === z) { used[q] = true; acc += wts[q]; remaining--; }
        best = z;
        if (acc >= threshold) break;
      }
      levels[py * size + px] = best;
    }
  }
  return levels;
}

// Paper grain, precomputed once — sampled by pixel position.
const GRAIN = new Float32Array(64 * 64).map((_, i) => (hash01(3, i & 63, i >> 6) - 0.5) * 10);

const EDGE_COAST = 1, EDGE_VOID = 2, EDGE_SOFT = 3;

export function paintLevels(ctx, levels, size, { onlyVoid = false } = {}) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const ink = Math.max(1, Math.round(size / 300));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const p = py * size + px;
      const z = levels[p];
      if (onlyVoid && z !== Z_VOID) continue;
      const rgb = RGB_BY_Z[z];
      let r = rgb[0], g = rgb[1], b = rgb[2];
      // Outline transitions: dark ink on the land side of coasts, soft grey at
      // the void, a gentle darkening where a higher layer meets a lower one.
      let edge = 0;
      for (let k = 1; k <= ink && !edge; k++) {
        for (let n = 0; n < 4 && !edge; n++) {
          const q = n === 0 ? (px + k < size ? p + k : -1)
                  : n === 1 ? (py + k < size ? p + k * size : -1)
                  : n === 2 ? (px - k >= 0 ? p - k : -1)
                  :           (py - k >= 0 ? p - k * size : -1);
          if (q < 0) continue;
          const o = levels[q];
          if (o === z) continue;
          if (z === Z_VOID || o === Z_VOID) edge = EDGE_VOID;
          else if (o === Z_WATER && z !== Z_BLANK) edge = EDGE_COAST;
          else if (z > o && z !== Z_WATER) edge = EDGE_SOFT;
        }
      }
      if (edge === EDGE_COAST) { r = 32; g = 44; b = 52; }
      else if (edge === EDGE_VOID && z === Z_VOID) { r = 168; g = 160; b = 142; }
      else if (edge === EDGE_SOFT) { r *= 0.8; g *= 0.8; b *= 0.8; }
      const grain = GRAIN[((py & 63) << 6) | (px & 63)];
      const i = p * 4;
      d[i] = r + grain; d[i + 1] = g + grain; d[i + 2] = b + grain; d[i + 3] = 255;
    }
  }
  return img;
}

// ─── Linear features ──────────────────────────────────────────────────────────

function tracePath(ctx, pts, k) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0] * k, pts[1][1] * k);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx * k, my * k);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0] * k, last[1] * k);
}

function strokePath(ctx, pts, k, { color, width, dash = null, cap = 'round' }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  tracePath(ctx, pts, k);
  ctx.stroke();
  ctx.restore();
}

function drawBridges(ctx, road, cells, k) {
  const samples = samplePath(road.pts, 0.25);
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const a = run[0], b = run[run.length - 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (-(b[1] - a[1]) / len) * 0.38, ny = ((b[0] - a[0]) / len) * 0.38;
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 0.7 * k;
      ctx.beginPath();
      ctx.moveTo(a[0] * k, a[1] * k); ctx.lineTo(b[0] * k, b[1] * k);
      ctx.stroke();
      ctx.strokeStyle = '#2a1e12';
      ctx.lineWidth = Math.max(1, 0.12 * k);
      ctx.beginPath();
      for (const s of [1, -1]) {
        ctx.moveTo((a[0] + nx * s) * k, (a[1] + ny * s) * k);
        ctx.lineTo((b[0] + nx * s) * k, (b[1] + ny * s) * k);
      }
      ctx.stroke();
      ctx.restore();
    }
    run = [];
  };
  for (const pt of samples) {
    const cx = Math.min(N - 1, Math.floor(pt[0])), cy = Math.min(N - 1, Math.floor(pt[1]));
    if (cells[cy * N + cx] === TERRAINS.water.code) run.push(pt); else flush();
  }
  flush();
}

export function drawPaths(ctx, paths, size, cells) {
  const k = size / N;
  const order = ['river', 'road', 'wall', 'ley'];
  for (const kind of order) {
    for (const p of paths) {
      if (p.kind !== kind || p.pts.length < 2) continue;
      if (kind === 'river') {
        strokePath(ctx, p.pts, k, { color: '#1f3e5c', width: Math.max(1.6, 0.62 * k) });
        strokePath(ctx, p.pts, k, { color: '#4a8cc4', width: Math.max(0.9, 0.38 * k) });
      } else if (kind === 'road') {
        strokePath(ctx, p.pts, k, { color: 'rgba(20, 16, 12, 0.85)', width: Math.max(1.4, 0.42 * k) });
        strokePath(ctx, p.pts, k, { color: '#d8be86', width: Math.max(0.7, 0.2 * k), dash: [0.9 * k, 0.6 * k], cap: 'butt' });
        drawBridges(ctx, p, cells, k);
      } else if (kind === 'wall') {
        strokePath(ctx, p.pts, k, { color: '#26262c', width: Math.max(2, 0.75 * k), cap: 'square' });
        strokePath(ctx, p.pts, k, { color: '#a4a0a8', width: Math.max(1, 0.36 * k), cap: 'square' });
        strokePath(ctx, p.pts, k, { color: '#26262c', width: Math.max(2, 0.75 * k), dash: [0.25 * k, 0.9 * k], cap: 'butt' });
      } else if (kind === 'ley') {
        ctx.save();
        ctx.shadowColor = 'rgba(140, 220, 255, 0.9)';
        ctx.shadowBlur = 0.5 * k;
        strokePath(ctx, p.pts, k, { color: 'rgba(170, 230, 255, 0.95)', width: Math.max(1, 0.16 * k) });
        ctx.restore();
      }
    }
  }
}

export function drawStamps(ctx, stamps, size) {
  const boost = size < 220 ? Math.min(2.2, 220 / size) * 0.75 : 1;
  for (const s of stamps) {
    const def = STAMP_REGISTRY[s.type];
    if (!def) continue;
    ctx.save();
    ctx.translate(s.x * size, s.y * size);
    ctx.scale(boost, boost);
    def.render(ctx, { ...s, x: 0, y: 0 }, size);
    ctx.restore();
  }
}

export function labelFont(size, label) {
  const px = Math.max(8, (size / N) * 1.7 * (label.scale ?? 1));
  return { px, font: `italic 600 ${px}px Georgia, 'Times New Roman', serif` };
}

export function drawLabels(ctx, labels, size) {
  for (const l of labels) {
    const { px, font } = labelFont(size, l);
    ctx.save();
    ctx.translate(l.x * size, l.y * size);
    ctx.rotate(((l.angle ?? 0) * Math.PI) / 180);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(250, 244, 226, 0.85)';
    ctx.lineWidth = px * 0.28;
    ctx.strokeText(l.text, 0, 0);
    ctx.fillStyle = '#2a2018';
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Draws `tile` into ctx at (0, 0), `size` px square. `tiles`, `x`, `y` locate
// the tile on the map so seams and glyphs line up with its neighbors.
export function renderTile(ctx, tile, size, { tiles = null, x = 0, y = 0, features = true } = {}) {
  const read = apronReader(tiles, x, y, tile.cells);
  const levels = computeLevels(read, size, x, y);
  ctx.putImageData(paintLevels(ctx, levels, size), 0, 0);
  drawGlyphs(ctx, {
    cells: tile.cells, size, N, tx: x, ty: y, terrainByCode: TERRAIN_BY_CODE,
    levelAt: (px, py) => levels[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))],
  });
  if (features) {
    drawPaths(ctx, tile.paths ?? [], size, tile.cells);
    drawStamps(ctx, tile.stamps ?? [], size);
    drawLabels(ctx, tile.labels ?? [], size);
  }
  // The void swallows everything drawn beneath it.
  if (tile.cells.includes(VOID)) {
    const layer = makeCanvas(size);
    const lctx = layer.getContext('2d');
    lctx.putImageData(paintLevels(lctx, levels, size, { onlyVoid: true }), 0, 0);
    ctx.drawImage(layer, 0, 0);
  }
  return levels;
}

export function renderTileBitmap(tile, size, opts) {
  const canvas = makeCanvas(size);
  renderTile(canvas.getContext('2d'), tile, size, opts);
  return canvas;
}

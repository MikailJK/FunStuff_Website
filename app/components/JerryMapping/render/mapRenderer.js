import { keyOf, parseKey } from '../engine/coords.js';
import { renderTileBitmap } from './tileRenderer.js';

// Draws the whole map for a camera. Tile bitmaps are cached and re-rendered
// only when the tile or one of its neighbors changes (tracked by `rev`).

const RESOLUTIONS = [48, 96, 160, 256, 400];

export function createTileCache() {
  return new Map();
}

function signature(tiles, x, y, res) {
  let sig = `${res}`;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) sig += `|${tiles[keyOf(x + dx, y + dy)]?.rev ?? '-'}`;
  }
  return sig;
}

export function tileBitmap(cache, tiles, key, targetPx) {
  const res = RESOLUTIONS.find(r => r >= targetPx) ?? RESOLUTIONS[RESOLUTIONS.length - 1];
  const { x, y } = parseKey(key);
  const sig = signature(tiles, x, y, res);
  const hit = cache.get(key);
  if (hit?.sig === sig) return hit.canvas;
  const canvas = renderTileBitmap(tiles[key], res, { tiles, x, y });
  cache.set(key, { sig, canvas });
  return canvas;
}

export function drawMap(g, { tiles, camera, width, height, tilePx, dpr = 1, cache, offers = [], claim = null, threatened = new Set(), hover = null, showGrid = true }) {
  const size = tilePx * camera.zoom;
  const toScreen = (tx, ty) => [width / 2 + (tx - camera.x) * size, height / 2 + (ty - camera.y) * size];

  g.save();
  g.fillStyle = '#0b1120';
  g.fillRect(0, 0, width, height);

  // Faint grid of potential panels.
  const x0 = Math.floor(camera.x - width / 2 / size) - 1, x1 = Math.ceil(camera.x + width / 2 / size) + 1;
  const y0 = Math.floor(camera.y - height / 2 / size) - 1, y1 = Math.ceil(camera.y + height / 2 / size) + 1;
  if (showGrid && size > 14) {
    g.fillStyle = 'rgba(148, 163, 184, 0.18)';
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const [sx, sy] = toScreen(tx, ty);
        g.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }
  }

  g.imageSmoothingEnabled = true;
  for (const key of Object.keys(tiles)) {
    const { x, y } = parseKey(key);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const [sx, sy] = toScreen(x, y);
    g.drawImage(tileBitmap(cache, tiles, key, size * dpr), sx, sy, size + 0.5, size + 0.5);
  }

  // Void threat: tiles the next void tick may reach.
  for (const key of threatened) {
    const { x, y } = parseKey(key);
    const [sx, sy] = toScreen(x, y);
    g.strokeStyle = 'rgba(244, 114, 114, 0.75)';
    g.lineWidth = 2;
    g.setLineDash([2, 4]);
    g.strokeRect(sx + 2, sy + 2, size - 4, size - 4);
    g.setLineDash([]);
  }

  // Offered tiles.
  for (const o of offers) {
    const [sx, sy] = toScreen(o.x, o.y);
    const empty = !tiles[keyOf(o.x, o.y)];
    const claimed = claim && claim.x === o.x && claim.y === o.y;
    g.fillStyle = empty ? 'rgba(252, 211, 77, 0.12)' : 'rgba(252, 211, 77, 0.08)';
    g.fillRect(sx + 1, sy + 1, size - 2, size - 2);
    g.strokeStyle = claimed ? '#ffffff' : 'rgba(252, 211, 77, 0.95)';
    g.lineWidth = 2;
    g.setLineDash(claimed ? [] : [6, 4]);
    g.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
    g.setLineDash([]);
    if (empty && size > 24) {
      g.strokeStyle = 'rgba(252, 211, 77, 0.8)';
      g.lineWidth = 2;
      const c = size * 0.12;
      g.beginPath();
      g.moveTo(sx + size / 2 - c, sy + size / 2); g.lineTo(sx + size / 2 + c, sy + size / 2);
      g.moveTo(sx + size / 2, sy + size / 2 - c); g.lineTo(sx + size / 2, sy + size / 2 + c);
      g.stroke();
    }
  }

  if (hover) {
    const [sx, sy] = toScreen(hover.x, hover.y);
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.lineWidth = 1;
    g.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
  }
  g.restore();
}

export function mapBounds(tiles) {
  const keys = Object.keys(tiles);
  if (!keys.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const pts = keys.map(parseKey);
  return {
    minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
  };
}

// Full-map PNG export.
export function exportMapCanvas(tiles, tilePx) {
  const b = mapBounds(tiles);
  const pad = Math.round(tilePx * 0.25);
  const canvas = document.createElement('canvas');
  canvas.width = (b.maxX - b.minX + 1) * tilePx + pad * 2;
  canvas.height = (b.maxY - b.minY + 1) * tilePx + pad * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e9e1cc';
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const key of Object.keys(tiles)) {
    const { x, y } = parseKey(key);
    g.drawImage(renderTileBitmap(tiles[key], tilePx, { tiles, x, y }), pad + (x - b.minX) * tilePx, pad + (y - b.minY) * tilePx);
  }
  return canvas;
}

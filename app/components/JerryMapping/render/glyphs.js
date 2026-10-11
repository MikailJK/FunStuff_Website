import { hash01 } from '../engine/rng.js';

// Hand-drawn decorations scattered over terrain. Placement is hashed from
// global cell coordinates, so a forest looks the same on every client and lines
// up across tile seams. Each glyph draws centered at (x, y) with cell size `c`.

export const GLYPHS = {
  trees: {
    density: 0.42,
    draw(ctx, x, y, c, r) {
      const s = c * (0.38 + r * 0.14);
      ctx.fillStyle = '#2f5a24';
      ctx.strokeStyle = 'rgba(20, 35, 15, 0.8)';
      ctx.lineWidth = Math.max(0.6, c * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.2);
      ctx.lineTo(x + s * 0.8, y + s * 0.5);
      ctx.lineTo(x - s * 0.8, y + s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.5);
      ctx.lineTo(x, y + s * 0.9);
      ctx.stroke();
    },
  },
  peaks: {
    density: 0.2,
    draw(ctx, x, y, c, r) {
      const w = c * (0.9 + r * 0.5), h = c * (0.8 + r * 0.4);
      ctx.fillStyle = 'rgba(70, 62, 52, 0.45)';
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + w, y + h * 0.4);
      ctx.lineTo(x, y + h * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 34, 28, 0.85)';
      ctx.lineWidth = Math.max(0.7, c * 0.1);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - w, y + h * 0.4);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + w, y + h * 0.4);
      ctx.stroke();
    },
  },
  waves: {
    density: 0.05,
    draw(ctx, x, y, c) {
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.45)';
      ctx.lineWidth = Math.max(0.6, c * 0.09);
      ctx.beginPath();
      ctx.moveTo(x - c * 0.7, y);
      ctx.quadraticCurveTo(x - c * 0.35, y - c * 0.3, x, y);
      ctx.quadraticCurveTo(x + c * 0.35, y + c * 0.3, x + c * 0.7, y);
      ctx.stroke();
    },
  },
  dunes: {
    density: 0.1,
    draw(ctx, x, y, c) {
      ctx.strokeStyle = 'rgba(150, 110, 50, 0.55)';
      ctx.lineWidth = Math.max(0.6, c * 0.09);
      ctx.beginPath();
      ctx.arc(x, y + c * 0.4, c * 0.6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    },
  },
  reeds: {
    density: 0.22,
    draw(ctx, x, y, c) {
      ctx.strokeStyle = 'rgba(40, 60, 40, 0.7)';
      ctx.lineWidth = Math.max(0.5, c * 0.07);
      ctx.beginPath();
      for (const dx of [-0.25, 0, 0.25]) {
        ctx.moveTo(x + dx * c, y + c * 0.3);
        ctx.lineTo(x + dx * c * 1.4, y - c * 0.35);
      }
      ctx.stroke();
    },
  },
  flakes: {
    density: 0.06,
    draw(ctx, x, y, c) {
      ctx.strokeStyle = 'rgba(140, 160, 180, 0.6)';
      ctx.lineWidth = Math.max(0.5, c * 0.07);
      const s = c * 0.25;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      ctx.stroke();
    },
  },
};

// Calls draw for every glyph position whose cell passes the density hash.
// `levelAt(px, py)` returns the rendered z at a pixel so glyphs only appear
// where their terrain actually shows after smoothing.
export function drawGlyphs(ctx, { cells, size, N, tx, ty, terrainByCode, levelAt }) {
  const c = size / N;
  if (c < 2.2) return;
  ctx.save();
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const t = terrainByCode[cells[cy * N + cx]];
      const glyph = t?.glyph && GLYPHS[t.glyph];
      if (!glyph) continue;
      const gx = tx * N + cx, gy = ty * N + cy;
      if (hash01(7, gx, gy, 1) >= glyph.density) continue;
      const x = (cx + 0.2 + hash01(7, gx, gy, 2) * 0.6) * c;
      const y = (cy + 0.2 + hash01(7, gx, gy, 3) * 0.6) * c;
      if (levelAt(Math.floor(x), Math.floor(y)) !== t.z) continue;
      glyph.draw(ctx, x, y, c, hash01(7, gx, gy, 4));
    }
  }
  ctx.restore();
}

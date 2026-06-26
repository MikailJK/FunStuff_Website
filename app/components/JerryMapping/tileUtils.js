import {
  REGION_CONFIG, STROKE_COLOR, STROKE_WIDTH_PX, TILE_EDITOR_SIZE,
} from './config.js';

// ─── Color helpers ────────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0];
}

export function pixelToRegion(r, g, b) {
  let closest = 'empty', minDist = Infinity;
  for (const [type, cfg] of Object.entries(REGION_CONFIG)) {
    const [cr, cg, cb] = hexToRgb(cfg.color);
    const d = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
    if (d < minDist) { minDist = d; closest = type; }
  }
  return closest;
}

// ─── Edge coordinate helper ───────────────────────────────────────────────────

export function edgePointToXY(edge, t, size) {
  switch (edge) {
    case 'top':    return { x: t * size, y: 0 };
    case 'bottom': return { x: t * size, y: size };
    case 'left':   return { x: 0,        y: t * size };
    case 'right':  return { x: size,     y: t * size };
    default:       return { x: 0, y: 0 };
  }
}

// ─── Tile rendering ───────────────────────────────────────────────────────────

function drawLines(ctx, lines, size) {
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth   = Math.max(2, (STROKE_WIDTH_PX * size) / TILE_EDITOR_SIZE);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  lines.forEach(line => {
    const p1 = edgePointToXY(line.from.edge, line.from.t, size);
    const p2 = edgePointToXY(line.to.edge,   line.to.t,   size);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
}

// Assigns each pixel to a region using half-plane tests.
// Each line divides the tile into two half-planes (via cross product sign).
// A pixel belongs to the first seed whose half-plane signature matches its own.
// Returns Uint16Array where value = 1-based region index (0 = unassigned).
function computeRegionMap(size, lines, regions) {
  const segs = lines.map(l => ({
    p1: edgePointToXY(l.from.edge, l.from.t, size),
    p2: edgePointToXY(l.to.edge,   l.to.t,   size),
  }));

  // Precompute each seed's sign for every line
  const seedSigns = regions.map(({ seed }) => {
    const cx = seed.x * size, cy = seed.y * size;
    return segs.map(({ p1, p2 }) =>
      (p2.x - p1.x) * (cy - p1.y) - (p2.y - p1.y) * (cx - p1.x) >= 0 ? 1 : -1
    );
  });

  const regionMap = new Uint16Array(size * size);

  for (let py = 0; py < size; py++) {
    const cy = py + 0.5;
    for (let px = 0; px < size; px++) {
      const cx = px + 0.5;
      outer: for (let s = 0; s < regions.length; s++) {
        for (let l = 0; l < segs.length; l++) {
          const { p1, p2 } = segs[l];
          const sign = (p2.x - p1.x) * (cy - p1.y) - (p2.y - p1.y) * (cx - p1.x) >= 0 ? 1 : -1;
          if (sign !== seedSigns[s][l]) continue outer;
        }
        regionMap[py * size + px] = s + 1;
        break;
      }
    }
  }

  return regionMap;
}

// Renders tile regions geometrically (no canvas pixel reads).
// Lines are a separate visual layer drawn on top only when showLines = true.
// tile = { lines: [{from:{edge,t}, to:{edge,t}}], regions: [{seed:{x,y}, type}] }
export function renderTileToCanvas(ctx, tile, size, { showLines = true } = {}) {
  const { lines = [], regions = [] } = tile;
  const [er, eg, eb] = hexToRgb(REGION_CONFIG.empty.color);

  const imageData = ctx.createImageData(size, size);
  const { data }  = imageData;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = er; data[i+1] = eg; data[i+2] = eb; data[i+3] = 255;
  }

  if (regions.length > 0) {
    const regionMap = computeRegionMap(size, lines, regions);
    for (let i = 0; i < regionMap.length; i++) {
      const rIdx = regionMap[i];
      if (!rIdx) continue;
      const [r, g, b] = hexToRgb(
        REGION_CONFIG[regions[rIdx - 1].type]?.color ?? REGION_CONFIG.empty.color
      );
      const pi = i * 4;
      data[pi] = r; data[pi+1] = g; data[pi+2] = b;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  if (showLines) drawLines(ctx, lines, size);
}

// ─── Edge segments ────────────────────────────────────────────────────────────
// Returns { top, bottom, left, right }, each [{from, to, type}].
// Segment boundaries are exact (from line endpoints). Type is sampled from canvas.

export function computeEdgeSegments(canvas, lines) {
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  const pad  = 3;

  const samplePx = (px, py) => {
    const { data } = ctx.getImageData(
      Math.max(0, Math.min(size - 1, Math.round(px))),
      Math.max(0, Math.min(size - 1, Math.round(py))),
      1, 1
    );
    return pixelToRegion(data[0], data[1], data[2]);
  };

  const edgeTs = { top: [], bottom: [], left: [], right: [] };
  for (const line of lines) {
    edgeTs[line.from.edge].push(line.from.t);
    edgeTs[line.to.edge].push(line.to.t);
  }

  const segmentsForEdge = (edge, ts) => {
    const sorted = [0, ...[...new Set(ts)].sort((a, b) => a - b), 1];
    return sorted.slice(0, -1).map((from, i) => {
      const to  = sorted[i + 1];
      const mid = (from + to) / 2;
      let px, py;
      switch (edge) {
        case 'top':    px = mid * size; py = pad;             break;
        case 'bottom': px = mid * size; py = size - pad - 1;  break;
        case 'left':   px = pad;        py = mid * size;      break;
        case 'right':  px = size-pad-1; py = mid * size;      break;
      }
      return { from, to, type: samplePx(px, py) };
    });
  };

  return {
    top:    segmentsForEdge('top',    edgeTs.top),
    bottom: segmentsForEdge('bottom', edgeTs.bottom),
    left:   segmentsForEdge('left',   edgeTs.left),
    right:  segmentsForEdge('right',  edgeTs.right),
  };
}

// ─── Constraint validation ────────────────────────────────────────────────────
// Samples pixels 3px inset from each edge at each constraint segment's midpoint.
// Returns an array of { edge, seg, actualType } for any mismatch.

export function validateConstraints(canvas, constraints) {
  if (!constraints) return [];
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  const pad  = 3;

  const samplePx = (px, py) => {
    const { data } = ctx.getImageData(
      Math.max(0, Math.min(size - 1, Math.round(px))),
      Math.max(0, Math.min(size - 1, Math.round(py))),
      1, 1
    );
    return pixelToRegion(data[0], data[1], data[2]);
  };

  const edgeSampler = {
    left:   t => ({ px: pad,          py: t * size }),
    right:  t => ({ px: size - pad - 1, py: t * size }),
    top:    t => ({ px: t * size,     py: pad }),
    bottom: t => ({ px: t * size,     py: size - pad - 1 }),
  };

  const violations = [];
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const profile = constraints[edge];
    if (!profile) continue;
    for (const seg of profile) {
      if (!seg.type || seg.type === 'empty') continue;
      const mid = (seg.from + seg.to) / 2;
      const { px, py } = edgeSampler[edge](mid);
      const actualType = samplePx(px, py);
      if (actualType !== seg.type) {
        violations.push({ edge, seg, actualType });
      }
    }
  }
  return violations;
}

// ─── Constraint strip overlay ─────────────────────────────────────────────────
// Draws colored bands along each edge showing what neighboring tiles expect.
// Expects profile arrays of run objects { type, from, to } (fractions in [0,1]).

export function drawConstraintStrips(ctx, constraints, size) {
  if (!constraints) return;
  const W = 7;

  ctx.save();
  ctx.globalAlpha = 0.6;

  const drawStrip = (profile, orientation) => {
    if (!profile) return;
    profile.forEach(({ type, from, to }) => {
      const cfg = REGION_CONFIG[type];
      if (!cfg || type === 'empty') return;
      ctx.fillStyle = cfg.color;
      const a   = from * size;
      const len = (to - from) * size;
      switch (orientation) {
        case 'left':   ctx.fillRect(0,      a, W,   len); break;
        case 'right':  ctx.fillRect(size-W, a, W,   len); break;
        case 'top':    ctx.fillRect(a,      0, len, W  ); break;
        case 'bottom': ctx.fillRect(a, size-W, len, W  ); break;
      }
    });
  };

  drawStrip(constraints.left,   'left');
  drawStrip(constraints.right,  'right');
  drawStrip(constraints.top,    'top');
  drawStrip(constraints.bottom, 'bottom');

  ctx.globalAlpha = 1;
  const drawTransitions = (profile, toX, toY) => {
    if (!profile) return;
    for (let i = 0; i < profile.length - 1; i++) {
      const t = profile[i].to;
      ctx.beginPath();
      ctx.arc(toX(t, size, W), toY(t, size, W), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  drawTransitions(constraints.left,   (t, s, w) => w/2,     (t, s)    => t * s);
  drawTransitions(constraints.right,  (t, s, w) => s - w/2, (t, s)    => t * s);
  drawTransitions(constraints.top,    (t, s)    => t * s,   (_, s, w) => w/2);
  drawTransitions(constraints.bottom, (t, s)    => t * s,   (_, s, w) => s - w/2);

  ctx.restore();
}

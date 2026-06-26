"use client"
import { useRef, useEffect, useCallback, useState } from 'react';
import {
  TILE_EDITOR_SIZE, REGION_CONFIG, STROKE_WIDTH_PX,
} from './config.js';
import {
  renderTileToCanvas, computeEdgeSegments, drawConstraintStrips, validateConstraints,
} from './tileUtils.js';

const SIZE = TILE_EDITOR_SIZE;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function coordsFromEvent(e, canvas) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(1, ((e.clientX - rect.left) * scaleX) / SIZE)),
    y: Math.max(0, Math.min(1, ((e.clientY - rect.top)  * scaleY) / SIZE)),
  };
}

const SNAP_DIVISIONS = 32;
const CONSTRAINT_SNAP_RADIUS = 100 / SIZE;   // 15px in canvas space
function quantize(v) { return Math.round(v * SNAP_DIVISIONS) / SNAP_DIVISIONS; }

// Returns { edge, pt } for the nearest edge point.
// If the cursor is within CONSTRAINT_SNAP_RADIUS of a constraint transition dot,
// snaps to that dot; otherwise quantizes to the nearest 1/256th on the nearest edge.
function snapToEdge(x, y, constraints) {
  // Check constraint transition points first
  if (constraints) {
    const edgeDefs = [
      { edge: 'top',    profile: constraints.top,    toPoint: t => ({ x: t, y: 0 }) },
      { edge: 'bottom', profile: constraints.bottom, toPoint: t => ({ x: t, y: 1 }) },
      { edge: 'left',   profile: constraints.left,   toPoint: t => ({ x: 0, y: t }) },
      { edge: 'right',  profile: constraints.right,  toPoint: t => ({ x: 1, y: t }) },
    ];
    let best = null, bestDist = CONSTRAINT_SNAP_RADIUS;
    for (const { edge, profile, toPoint } of edgeDefs) {
      if (!profile) continue;
      for (let i = 0; i < profile.length - 1; i++) {
        const pt = toPoint(profile[i].to);
        const d  = Math.hypot(x - pt.x, y - pt.y);
        if (d < bestDist) { bestDist = d; best = { edge, t: profile[i].to, pt }; }
      }
    }
    if (best) return best;
  }

  // Fall back: quantize to 1/256th on nearest edge
  const qx = quantize(x);
  const qy = quantize(y);
  const candidates = [
    { edge: 'top',    t: qx, pt: { x: qx, y: 0  }, dist: y       },
    { edge: 'bottom', t: qx, pt: { x: qx, y: 1  }, dist: 1 - y   },
    { edge: 'left',   t: qy, pt: { x: 0,  y: qy }, dist: x       },
    { edge: 'right',  t: qy, pt: { x: 1,  y: qy }, dist: 1 - x   },
  ];
  return candidates.reduce((a, b) => (a.dist < b.dist ? a : b));
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function drawDot(ctx, pt, color, radius = 5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pt.x * SIZE, pt.y * SIZE, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPreviewLine(ctx, start, end, valid) {
  ctx.save();
  ctx.strokeStyle = valid ? 'rgba(120, 255, 140, 0.85)' : 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth   = STROKE_WIDTH_PX;
  ctx.lineCap     = 'round';
  ctx.setLineDash(valid ? [] : [8, 6]);
  ctx.beginPath();
  ctx.moveTo(start.x * SIZE, start.y * SIZE);
  ctx.lineTo(end.x   * SIZE, end.y   * SIZE);
  ctx.stroke();
  ctx.restore();

  // endpoint dots
  drawDot(ctx, start, '#ffffff', 5);
  drawDot(ctx, end,   valid ? 'rgba(120,255,140,1)' : 'rgba(255,255,255,0.4)', 5);
}

function drawHoverSnap(ctx, pt) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(pt.x * SIZE, pt.y * SIZE, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ─── Violation overlay ────────────────────────────────────────────────────────

function drawViolationHighlights(ctx, violations, size) {
  if (!violations?.length) return;
  const W = 8;
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#ef4444';
  for (const { edge, seg } of violations) {
    const a   = seg.from * size;
    const len = (seg.to - seg.from) * size;
    switch (edge) {
      case 'left':   ctx.fillRect(0,        a, W,   len); break;
      case 'right':  ctx.fillRect(size - W, a, W,   len); break;
      case 'top':    ctx.fillRect(a,        0, len, W  ); break;
      case 'bottom': ctx.fillRect(a, size-W, len, W  ); break;
    }
  }
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TileEditor({ tile, constraints, allowedTypes, onSave, onCancel }) {
  const canvasRef      = useRef(null);
  const offscreenRef   = useRef(null);   // last committed render
  const dragStart      = useRef(null);   // { pt: {x,y}, edge: string } | null
  const lastHover      = useRef(null);   // last snapped hover point (for redraw)
  const violationsRef  = useRef([]);     // for synchronous access in draw calls

  const [mode,       setMode]       = useState('line');
  const [fillType,   setFillType]   = useState(allowedTypes?.[0] ?? 'land');
  const [lines,      setLines]      = useState(() => tile.lines    ?? []);
  const [regions,    setRegions]    = useState(() => tile.regions  ?? []);
  const [dragging,   setDragging]   = useState(false);
  const [violations, setViolations] = useState([]);

  function clearViolations() {
    violationsRef.current = [];
    setViolations([]);
  }

  // Re-render committed state to offscreen whenever strokes/regions/constraints change.
  // Also clears any stale violations so the error message disappears on edit.
  useEffect(() => {
    let oc = offscreenRef.current;
    if (!oc || oc.width !== SIZE) {
      oc = document.createElement('canvas');
      oc.width = oc.height = SIZE;
      offscreenRef.current = oc;
    }
    renderTileToCanvas(oc.getContext('2d'), { lines, regions }, SIZE);
    if (violationsRef.current.length > 0) {
      violationsRef.current = [];
      setViolations([]);
    }
    blitToMain();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, regions, constraints]);

  // Copy offscreen (committed state + constraints + any violation highlights) to visible canvas.
  function blitToMain(overlay) {
    const canvas = canvasRef.current;
    const oc     = offscreenRef.current;
    if (!canvas || !oc) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(oc, 0, 0);
    drawConstraintStrips(ctx, constraints, SIZE);
    drawViolationHighlights(ctx, violationsRef.current, SIZE);
    if (overlay) overlay(ctx);
  }

  // ── Line tool handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e) => {
    if (mode !== 'line') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw     = coordsFromEvent(e, canvas);
    const snapped = snapToEdge(raw.x, raw.y, constraints);
    dragStart.current = snapped;
    setDragging(true);
  }, [mode]);

  const handleMouseMove = useCallback((e) => {
    if (mode !== 'line') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw     = coordsFromEvent(e, canvas);
    const snapped = snapToEdge(raw.x, raw.y, constraints);

    if (dragStart.current) {
      // Active drag: show preview line
      const valid = snapped.edge !== dragStart.current.edge;
      blitToMain(ctx => drawPreviewLine(ctx, dragStart.current.pt, snapped.pt, valid));
    } else {
      // Hover: show snap indicator on nearest edge
      lastHover.current = snapped.pt;
      blitToMain(ctx => drawHoverSnap(ctx, snapped.pt));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleMouseUp = useCallback((e) => {
    if (mode !== 'line' || !dragStart.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw      = coordsFromEvent(e, canvas);
    const snapped  = snapToEdge(raw.x, raw.y, constraints);
    const isValid  = snapped.edge !== dragStart.current.edge;

    if (isValid) {
      const line = {
        from: { edge: dragStart.current.edge, t: dragStart.current.t },
        to:   { edge: snapped.edge,           t: snapped.t },
      };
      setLines(prev => [...prev, line]);
    }

    dragStart.current = null;
    setDragging(false);
    // Clear preview; hover indicator will redraw on next mousemove
    blitToMain();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleMouseLeave = useCallback(() => {
    if (dragStart.current) {
      dragStart.current = null;
      setDragging(false);
    }
    lastHover.current = null;
    blitToMain();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fill tool handler ──────────────────────────────────────────────────────

  const handleClick = useCallback((e) => {
    if (mode !== 'fill') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = coordsFromEvent(e, canvas);
    setRegions(prev => {
      const idx = prev.findIndex(
        r => Math.abs(r.seed.x - pt.x) < 0.04 && Math.abs(r.seed.y - pt.y) < 0.04
      );
      const entry = { seed: pt, type: fillType };
      const next  = [...prev];
      if (idx >= 0) next[idx] = entry; else next.push(entry);
      return next;
    });
  }, [mode, fillType]);

  // ── Undo / clear ───────────────────────────────────────────────────────────

  const undoLast  = useCallback(() => {
    if (mode === 'line') setLines(p => p.slice(0, -1));
    else                  setRegions(p => p.slice(0, -1));
    clearViolations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const clearTile = useCallback(() => {
    setLines([]);
    setRegions([]);
    clearViolations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderTileToCanvas(canvas.getContext('2d'), { lines, regions }, SIZE);
    const vs = validateConstraints(canvas, constraints);
    if (vs.length > 0) {
      violationsRef.current = vs;
      setViolations(vs);
      blitToMain();
      return;
    }
    onSave({ lines, regions, edgeSegments: computeEdgeSegments(canvas, lines) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, regions, constraints, onSave]);

  // ── JSX ────────────────────────────────────────────────────────────────────

  const isVoid = allowedTypes?.length === 0;

  return (
    <div className="flex flex-col items-center gap-4">

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
          display: 'block',
          cursor: mode === 'fill' ? 'cell' : 'crosshair',
          border: '1px solid #334155',
          borderRadius: 4,
          userSelect: 'none',
        }}
      />

      {/* Controls */}
      {!isVoid && (
        <div className="flex flex-wrap gap-3 items-center justify-center">

          {/* Mode toggle */}
          <div className="flex rounded overflow-hidden border border-slate-600 text-xs">
            {[['line', '╱ Line'], ['fill', '▣ Fill']].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-slate-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Region picker — only shown in fill mode */}
          {mode === 'fill' && (
            <div className="flex gap-1.5">
              {allowedTypes.map(type => (
                <button key={type} onClick={() => setFillType(type)}
                  title={REGION_CONFIG[type].name}
                  className={`w-6 h-6 rounded border-2 transition-all ${
                    fillType === type ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: REGION_CONFIG[type].color }}
                />
              ))}
            </div>
          )}

          {/* Undo / Clear */}
          <div className="flex gap-2">
            <button onClick={undoLast}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            >
              Undo
            </button>
            <button onClick={clearTile}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-600"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Contextual hint */}
      <p className="text-xs text-slate-500 text-center max-w-sm">
        {mode === 'line' && !dragging && 'Drag from one edge to a different edge to draw a boundary line.'}
        {mode === 'line' && dragging  && 'Release on a different edge to place the line.'}
        {mode === 'fill'              && 'Click inside a region to fill it. Pick a type above.'}
      </p>

      {/* Constraint violation error */}
      {violations.length > 0 && (
        <div className="text-xs text-red-400 text-center max-w-sm bg-red-950/40 border border-red-800/60 rounded px-3 py-2">
          <span className="font-semibold">Edge mismatch — </span>
          {violations.map(({ edge, seg }, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <span className="capitalize">{edge}</span>
              {' edge requires '}
              <span className="font-medium">{REGION_CONFIG[seg.type]?.name ?? seg.type}</span>
            </span>
          ))}
        </div>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-3 mt-1">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm rounded border border-slate-600 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
        >
          Cancel
        </button>
        <button onClick={handleSave}
          className="px-5 py-2 text-sm rounded bg-slate-200 text-slate-900 font-semibold hover:bg-white"
        >
          {isVoid ? 'Clear Tile' : 'Save Tile'}
        </button>
      </div>
    </div>
  );
}

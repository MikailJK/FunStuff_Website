"use client"
import { useRef, useEffect, useState } from 'react';
import {
  TILE_EDITOR_SIZE, REGION_CONFIG, STROKE_WIDTH_PX,
} from './config.js';
import {
  renderTileToCanvas, computeEdgeSegments, drawConstraintStrips, validateConstraints,
  drawMarkers, pixelToRegion, hexToRgb,
} from './tileUtils.js';
import { STAMP_REGISTRY, edgePointNorm } from './stamps.js';

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

const SNAP_DIVISIONS  = 32;
const DOT_SNAP_RADIUS = 20 / SIZE;   // distance along the edge, normalized
function quantize(v) { return Math.round(v * SNAP_DIVISIONS) / SNAP_DIVISIONS; }

// Snap resolution: first pick the edge nearest the cursor, then snap to dots
// that live on THAT edge — constraint transition points, endpoints of lines
// already drawn on this tile, and (for stamps) road connection points from
// neighboring tiles — falling back to the quantized grid when no dot is close.
// Returns { edge, t, pt, kind: 'constraint'|'endpoint'|'connection'|'grid' }.
function snapToEdge(x, y, constraints, existingLines = [], connections = null) {
  const edge = [['top', y], ['bottom', 1 - y], ['left', x], ['right', 1 - x]]
    .reduce((a, b) => (a[1] < b[1] ? a : b))[0];
  const along = (edge === 'top' || edge === 'bottom') ? x : y;
  const ptFor = t =>
    edge === 'top'    ? { x: t, y: 0 } :
    edge === 'bottom' ? { x: t, y: 1 } :
    edge === 'left'   ? { x: 0, y: t } : { x: 1, y: t };

  const dots = [];
  const profile = constraints?.[edge];
  if (profile) {
    for (let i = 0; i < profile.length - 1; i++) {
      dots.push({ t: profile[i].to, kind: 'constraint' });
    }
  }
  for (const line of existingLines) {
    for (const end of [line.from, line.to]) {
      if (end.edge === edge) dots.push({ t: end.t, kind: 'endpoint' });
    }
  }
  for (const conn of connections?.[edge] ?? []) {
    dots.push({ t: conn.t, kind: 'connection' });
  }

  let best = null, bestDist = DOT_SNAP_RADIUS;
  for (const dot of dots) {
    const d = Math.abs(dot.t - along);
    // Constraint dots win ties against endpoints sitting on the same spot
    if (d < bestDist || (d === bestDist && dot.kind === 'constraint')) {
      bestDist = d;
      best = dot;
    }
  }
  if (best) return { edge, t: best.t, pt: ptFor(best.t), kind: best.kind };

  const q = quantize(along);
  return { edge, t: q, pt: ptFor(q), kind: 'grid' };
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

const SNAP_COLORS = {
  constraint: 'rgba(255, 255, 255, 0.9)',
  endpoint:   'rgba(255, 200, 60, 0.95)',
  connection: 'rgba(201, 168, 106, 0.95)',
  grid:       'rgba(255, 255, 255, 0.4)',
};

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

  drawDot(ctx, start, '#ffffff', 5);
  drawDot(ctx, end,   valid ? 'rgba(120,255,140,1)' : 'rgba(255,255,255,0.4)', 5);
}

function drawHoverSnap(ctx, pt, kind) {
  ctx.save();
  ctx.strokeStyle = SNAP_COLORS[kind] ?? SNAP_COLORS.grid;
  ctx.lineWidth   = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(pt.x * SIZE, pt.y * SIZE, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Small amber dots marking endpoints of lines already drawn on this tile,
// so the player can see what the snapping will grab.
function drawOwnEndpoints(ctx, lines) {
  for (const line of lines) {
    for (const end of [line.from, line.to]) {
      drawDot(ctx, edgePointNorm(end.edge, end.t), 'rgba(255, 200, 60, 0.85)', 3);
    }
  }
}

// Tan squares marking where roads (and other edge-pair stamps) from
// neighboring tiles arrive at this tile's edges.
function drawConnectionDots(ctx, connections) {
  if (!connections) return;
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    for (const conn of connections[edge] ?? []) {
      const pt = edgePointNorm(edge, conn.t);
      const px = pt.x * SIZE, py = pt.y * SIZE;
      ctx.save();
      ctx.fillStyle   = '#c9a86a';
      ctx.strokeStyle = 'rgba(12, 10, 16, 0.9)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.rect(px - 4, py - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawInvalidMark(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(x * SIZE, y * SIZE, 18, 0, Math.PI * 2);
  ctx.moveTo(x * SIZE - 13, y * SIZE + 13);
  ctx.lineTo(x * SIZE + 13, y * SIZE - 13);
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

// variant: 'terrain' — full editor on a blank tile (terrain cards, dev mode)
//          'stamps'  — stamps only, terrain is read-only (civilization cards)
//          'void'    — confirm-to-clear (void card)
export function TileEditor({
  tile, variant = 'terrain', constraints = null, connections = null,
  allowedTypes, allowedMarkers = [], maxLines = Infinity, onSave, onCancel,
}) {
  const canvasRef      = useRef(null);
  const offscreenRef   = useRef(null);   // committed terrain + boundary lines
  const sampleRef      = useRef(null);   // terrain only — pixel sampling for stamps
  const dragStart      = useRef(null);   // { pt: {x,y}, edge, t } | null
  const violationsRef  = useRef([]);     // for synchronous access in draw calls

  const [mode,       setMode]       = useState(variant === 'stamps' ? 'stamp' : 'line');
  const [fillType,   setFillType]   = useState(allowedTypes?.[0] ?? 'land');
  const [stampType,  setStampType]  = useState(allowedMarkers?.[0] ?? null);
  const [lines,      setLines]      = useState(() => tile.lines   ?? []);
  const [regions,    setRegions]    = useState(() => tile.regions ?? []);
  const [markers,    setMarkers]    = useState(() => tile.markers ?? []);
  const [dragging,   setDragging]   = useState(false);
  const [dragValid,  setDragValid]  = useState(false);
  const [violations, setViolations] = useState([]);
  const [fillError,  setFillError]  = useState(false);
  const [notice,     setNotice]     = useState(null);

  const isVoid      = variant === 'void';
  const stampOnly   = variant === 'stamps';
  const hasStamps   = allowedMarkers.length > 0;
  const stamp       = stampType ? STAMP_REGISTRY[stampType] : null;
  const atLineLimit = lines.length >= maxLines;

  function clearViolations() {
    violationsRef.current = [];
    setViolations([]);
  }

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  // Keep the selected stamp valid when the available set changes (dev toggle).
  useEffect(() => {
    if (stampType && !allowedMarkers.includes(stampType)) {
      setStampType(allowedMarkers[0] ?? null);
      if (mode === 'stamp' && !stampOnly) setMode('line');
    } else if (!stampType && allowedMarkers.length > 0) {
      setStampType(allowedMarkers[0]);
    }
  }, [allowedMarkers, stampType, mode, stampOnly]);

  // Re-render committed state to the offscreen canvases whenever it changes.
  useEffect(() => {
    for (const ref of [offscreenRef, sampleRef]) {
      if (!ref.current || ref.current.width !== SIZE) {
        const oc = document.createElement('canvas');
        oc.width = oc.height = SIZE;
        ref.current = oc;
      }
    }
    renderTileToCanvas(offscreenRef.current.getContext('2d'), { lines, regions }, SIZE);
    renderTileToCanvas(sampleRef.current.getContext('2d'), { lines, regions }, SIZE, { showLines: false });
    if (violationsRef.current.length > 0) {
      violationsRef.current = [];
      setViolations([]);
    }
    setFillError(false);
    blitToMain();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, regions, markers, constraints]);

  // Copy committed state + markers + constraint overlays to the visible canvas.
  function blitToMain(overlay) {
    const canvas = canvasRef.current;
    const oc     = offscreenRef.current;
    if (!canvas || !oc) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(oc, 0, 0);
    drawMarkers(ctx, markers, SIZE);
    drawConstraintStrips(ctx, constraints, SIZE);
    drawConnectionDots(ctx, connections);
    drawOwnEndpoints(ctx, lines);
    drawViolationHighlights(ctx, violationsRef.current, SIZE);
    if (overlay) overlay(ctx);
  }

  // Region type under a normalized point, sampled from the terrain-only canvas.
  function sampleType(nx, ny) {
    const oc = sampleRef.current;
    if (!oc) return 'empty';
    const px = Math.max(0, Math.min(SIZE - 1, Math.round(nx * SIZE)));
    const py = Math.max(0, Math.min(SIZE - 1, Math.round(ny * SIZE)));
    const { data } = oc.getContext('2d').getImageData(px, py, 1, 1);
    return pixelToRegion(data[0], data[1], data[2]);
  }

  // ── Stamp validation ───────────────────────────────────────────────────────

  function terrainNames(types) {
    return types.map(t => REGION_CONFIG[t]?.name ?? t).join(' or ');
  }

  function validatePointStamp(x, y) {
    if (!stamp) return 'No stamp selected.';
    if (stamp.terrainTypes && !stamp.terrainTypes.includes(sampleType(x, y))) {
      return `${stamp.name} requires ${terrainNames(stamp.terrainTypes)}.`;
    }
    return stamp.placementValidator?.({ x, y, markers, lines, sampleType }) ?? null;
  }

  function validateEdgePairStamp(from, to) {
    if (!stamp) return 'No stamp selected.';
    const p1 = edgePointNorm(from.edge, from.t);
    const p2 = edgePointNorm(to.edge, to.t);
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.15) {
      return 'Drag further along the edge before releasing.';
    }
    if (stamp.terrainTypes) {
      // Sample along the full curved path (it bows toward the tile center) so
      // a road cannot pass over water anywhere along its length.
      const mid  = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const ctrl = { x: mid.x + (0.5 - mid.x) * 0.35, y: mid.y + (0.5 - mid.y) * 0.35 };
      for (let i = 1; i <= 11; i++) {
        const s = i / 12;
        const bx = (1 - s) * (1 - s) * p1.x + 2 * (1 - s) * s * ctrl.x + s * s * p2.x;
        const by = (1 - s) * (1 - s) * p1.y + 2 * (1 - s) * s * ctrl.y + s * s * p2.y;
        if (!stamp.terrainTypes.includes(sampleType(bx, by))) {
          return `${stamp.name} must stay on ${terrainNames(stamp.terrainTypes)} along its whole path.`;
        }
      }
    }
    return stamp.placementValidator?.({ from, to, markers, lines, sampleType }) ?? null;
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  function handleMouseDown(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw = coordsFromEvent(e, canvas);

    if (mode === 'line') {
      if (atLineLimit) {
        setNotice({ text: 'Line limit reached — undo a line or paint instead.', tone: 'warn' });
        return;
      }
      dragStart.current = snapToEdge(raw.x, raw.y, constraints, lines, connections);
      setDragging(true);
      setDragValid(false);
    } else if (mode === 'stamp' && stamp?.placementMode === 'edge-pair') {
      dragStart.current = snapToEdge(raw.x, raw.y, constraints, lines, connections);
      setDragging(true);
    }
  }

  function handleMouseMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw = coordsFromEvent(e, canvas);

    if (mode === 'line') {
      const snapped = snapToEdge(raw.x, raw.y, constraints, lines, connections);
      if (dragStart.current) {
        const valid = snapped.edge !== dragStart.current.edge;
        if (valid !== dragValid) setDragValid(valid);
        blitToMain(ctx => drawPreviewLine(ctx, dragStart.current.pt, snapped.pt, valid));
      } else if (!atLineLimit) {
        blitToMain(ctx => drawHoverSnap(ctx, snapped.pt, snapped.kind));
      }
    } else if (mode === 'stamp' && stamp) {
      if (stamp.placementMode === 'edge-pair') {
        if (dragStart.current) {
          const snapped = snapToEdge(raw.x, raw.y, constraints, lines, connections);
          const ghost = {
            type: stampType,
            from: { edge: dragStart.current.edge, t: dragStart.current.t },
            to:   { edge: snapped.edge, t: snapped.t },
          };
          blitToMain(ctx => {
            ctx.save();
            ctx.globalAlpha = 0.55;
            stamp.render(ctx, ghost, SIZE);
            ctx.restore();
          });
        } else {
          const snapped = snapToEdge(raw.x, raw.y, constraints, lines, connections);
          blitToMain(ctx => drawHoverSnap(ctx, snapped.pt, snapped.kind));
        }
      } else {
        const x = Math.max(0.06, Math.min(0.94, raw.x));
        const y = Math.max(0.06, Math.min(0.94, raw.y));
        const error = validatePointStamp(x, y);
        blitToMain(ctx => {
          ctx.save();
          ctx.globalAlpha = 0.55;
          stamp.render(ctx, { type: stampType, x, y }, SIZE);
          ctx.restore();
          if (error) drawInvalidMark(ctx, x, y);
        });
      }
    }
  }

  function handleMouseUp(e) {
    const canvas = canvasRef.current;
    if (!canvas || !dragStart.current) return;
    const raw     = coordsFromEvent(e, canvas);
    const snapped = snapToEdge(raw.x, raw.y, constraints, lines, connections);
    const start   = dragStart.current;
    dragStart.current = null;
    setDragging(false);

    if (mode === 'line') {
      if (snapped.edge !== start.edge && !atLineLimit) {
        setLines(prev => [...prev, {
          from: { edge: start.edge,   t: start.t },
          to:   { edge: snapped.edge, t: snapped.t },
        }]);
      }
    } else if (mode === 'stamp' && stamp?.placementMode === 'edge-pair') {
      const from = { edge: start.edge,   t: start.t };
      const to   = { edge: snapped.edge, t: snapped.t };
      const error = validateEdgePairStamp(from, to);
      if (error) {
        setNotice({ text: error, tone: 'warn' });
      } else {
        setMarkers(prev => [...prev, { type: stampType, from, to }]);
      }
    }
    blitToMain();
  }

  function handleMouseLeave() {
    if (dragStart.current) {
      dragStart.current = null;
      setDragging(false);
    }
    blitToMain();
  }

  function handleClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = coordsFromEvent(e, canvas);

    if (mode === 'fill') {
      setRegions(prev => {
        const idx = prev.findIndex(
          r => Math.abs(r.seed.x - pt.x) < 0.04 && Math.abs(r.seed.y - pt.y) < 0.04
        );
        const entry = { seed: pt, type: fillType };
        const next  = [...prev];
        if (idx >= 0) next[idx] = entry; else next.push(entry);
        return next;
      });
    } else if (mode === 'stamp' && stamp?.placementMode === 'point') {
      const x = Math.max(0.06, Math.min(0.94, pt.x));
      const y = Math.max(0.06, Math.min(0.94, pt.y));
      const error = validatePointStamp(x, y);
      if (error) {
        setNotice({ text: error, tone: 'warn' });
      } else {
        setMarkers(prev => [...prev, { type: stampType, x, y }]);
      }
    }
  }

  // ── Undo / clear ───────────────────────────────────────────────────────────

  function undoLast() {
    if (mode === 'line')       setLines(p => p.slice(0, -1));
    else if (mode === 'fill')  setRegions(p => p.slice(0, -1));
    else                       setMarkers(p => p.slice(0, -1));
    clearViolations();
  }

  // In stamp-only mode the terrain is read-only — Clear only removes stamps.
  function clearTile() {
    if (!stampOnly) {
      setLines([]);
      setRegions([]);
    }
    setMarkers([]);
    clearViolations();
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  // Terrain cards must paint the entire tile — no empty areas may remain.
  // The sample canvas holds exact region colors (no lines, no markers).
  function tileFullyPainted() {
    const oc = sampleRef.current;
    if (!oc) return true;
    const [er, eg, eb] = hexToRgb(REGION_CONFIG.empty.color);
    const { data } = oc.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] === er && data[i + 1] === eg && data[i + 2] === eb) return false;
    }
    return true;
  }

  function handleSave() {
    if (stampOnly) {
      // Terrain untouched — keep the tile's existing edge segments.
      onSave({ lines, regions, markers, edgeSegments: tile.edgeSegments });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!isVoid && !tileFullyPainted()) {
      setFillError(true);
      return;
    }
    // Render without markers — edge segments and validation sample raw terrain
    renderTileToCanvas(canvas.getContext('2d'), { lines, regions }, SIZE);
    const vs = validateConstraints(canvas, constraints);
    if (vs.length > 0) {
      violationsRef.current = vs;
      setViolations(vs);
      blitToMain();
      return;
    }
    onSave({ lines, regions, markers, edgeSegments: computeEdgeSegments(canvas, lines) });
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  const hint = (() => {
    if (mode === 'line') {
      if (dragging)     return dragValid ? 'Release to place the line.' : 'Lines must end on a different edge.';
      if (atLineLimit)  return 'Line limit reached — undo a line or switch tools.';
      return 'Drag from one edge to another. Dots mark neighbor transitions (white) and your own line ends (amber).';
    }
    if (mode === 'fill') {
      return `Click inside a region to paint it ${REGION_CONFIG[fillType]?.name ?? fillType}.`;
    }
    if (stamp?.placementMode === 'edge-pair') {
      return `Drag from one edge to another to place a ${stamp.name}. Tan squares mark roads arriving from neighbor tiles.`;
    }
    return stamp ? `Click the map to place a ${stamp.name}.` : 'Select a stamp in the toolbar.';
  })();

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
          cursor: mode === 'fill' ? 'cell' : mode === 'stamp' ? 'copy' : 'crosshair',
          border: '1px solid #334155',
          borderRadius: 4,
          userSelect: 'none',
        }}
      />

      {/* Toolbar — line tool, paint colors, stamps, and utilities in one row */}
      {!isVoid && (
        <div className="flex flex-wrap gap-3 items-center justify-center max-w-lg">

          {/* Line tool + paint colors — hidden when terrain is read-only */}
          {!stampOnly && (
            <>
              <button onClick={() => { setMode('line'); setNotice(null); }}
                title="Draw boundary lines between edges"
                className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                  mode === 'line'
                    ? 'bg-slate-500 text-white border-slate-400'
                    : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'
                }`}
              >
                ╱ Line
              </button>

              <div className="flex gap-1.5 items-center">
                {allowedTypes.map(type => (
                  <button key={type}
                    onClick={() => { setMode('fill'); setFillType(type); setNotice(null); }}
                    title={`Paint ${REGION_CONFIG[type].name}`}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      mode === 'fill' && fillType === type
                        ? 'border-white scale-110'
                        : 'border-slate-600 hover:border-slate-400'
                    }`}
                    style={{ backgroundColor: REGION_CONFIG[type].color }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Stamps — clicking one selects the stamp tool */}
          {hasStamps && (
            <>
              {!stampOnly && <div className="w-px h-5 bg-slate-700" />}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {allowedMarkers.map(id => (
                  <button key={id}
                    onClick={() => { setMode('stamp'); setStampType(id); setNotice(null); }}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      mode === 'stamp' && stampType === id
                        ? 'bg-slate-500 text-white border-slate-400'
                        : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    {STAMP_REGISTRY[id]?.name ?? id}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="w-px h-5 bg-slate-700" />

          {/* Line budget */}
          {!stampOnly && Number.isFinite(maxLines) && (
            <span className={`px-2 py-1 text-xs rounded font-medium ${
              atLineLimit
                ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>
              Lines {lines.length} / {maxLines}
            </span>
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
      <p className="text-xs text-slate-500 text-center max-w-sm">{hint}</p>

      {/* Placement notice */}
      {notice && (
        <div className="text-xs text-amber-400 text-center max-w-sm bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2">
          {notice.text}
        </div>
      )}

      {/* Incomplete fill error */}
      {fillError && (
        <div className="text-xs text-red-400 text-center max-w-sm bg-red-950/40 border border-red-800/60 rounded px-3 py-2">
          <span className="font-semibold">Unpainted area — </span>
          the whole tile must be filled before saving. Paint every region.
        </div>
      )}

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

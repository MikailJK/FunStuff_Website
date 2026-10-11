"use client"
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { TILE_CELLS as N, EDITOR_MAX_PX } from '../config.js';
import { TERRAINS } from '../data/terrains.js';
import { STAMP_REGISTRY } from '../data/stamps.js';
import { KIND_LABELS } from '../data/cards.js';
import { buildEditContext } from '../engine/state.js';
import { evaluateRules, countBy } from '../engine/rules.js';
import { countChanged } from '../engine/terrain.js';
import { coordLabel, keyOf } from '../engine/coords.js';
import { portPoint, portOfPoint, endpointAtPort, PATH_KINDS } from '../engine/features.js';
import { renderTile, renderTileBitmap, drawPaths, drawStamps, drawLabels } from '../render/tileRenderer.js';
import { TOOLS, availableTools, SHORTCUTS } from '../tools/index.js';
import { BRUSH_SIZES } from '../tools/paint.js';
import { useTileDraft } from '../hooks/useTileDraft.js';
import { RuleChecklist } from './RuleChecklist.jsx';

const RING = 0.2;                         // neighbor context shown around the tile, in tiles
const PORT_COLORS = { river: '#6ab0f0', road: '#e0c080', wall: '#b0b0b8', ley: '#a0e8ff' };

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ─── Static layers ────────────────────────────────────────────────────────────

function renderNeighborLayer(state, x, y, tilePx) {
  const off = RING * tilePx, W = Math.round(tilePx * (1 + 2 * RING));
  const canvas = makeCanvas(W);
  const g = canvas.getContext('2d');
  g.fillStyle = '#0b1120';
  g.fillRect(0, 0, W, W);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const tile = state.tiles[keyOf(x + dx, y + dy)];
      const px = off + dx * tilePx, py = off + dy * tilePx;
      if (tile) {
        g.drawImage(renderTileBitmap(tile, tilePx, { tiles: state.tiles, x: x + dx, y: y + dy }), px, py);
      } else {
        g.save();
        g.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        g.setLineDash([4, 6]);
        g.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
        g.restore();
      }
    }
  }
  // Fade the context so the tile being edited stands out.
  g.fillStyle = 'rgba(8, 12, 24, 0.5)';
  g.fillRect(0, 0, W, W);
  return canvas;
}

function renderLockedLayer(locked, tilePx) {
  const canvas = makeCanvas(tilePx);
  const g = canvas.getContext('2d');
  const pattern = makeCanvas(8);
  const pg = pattern.getContext('2d');
  pg.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  pg.lineWidth = 1;
  pg.beginPath(); pg.moveTo(0, 8); pg.lineTo(8, 0); pg.stroke();
  g.fillStyle = g.createPattern(pattern, 'repeat');
  const c = tilePx / N;
  for (let i = 0; i < locked.length; i++) {
    if (locked[i]) g.fillRect((i % N) * c, Math.floor(i / N) * c, Math.ceil(c), Math.ceil(c));
  }
  return canvas;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TileEditor({ state, x, y, card, playedCard, isDev, onSubmit, onCancel }) {
  const ctx = useMemo(() => buildEditContext(state, x, y, card), [state, x, y, card]);
  const { draft, draftRef, set, begin, undo, redo, reset, canUndo, canRedo } = useTileDraft(ctx.base);
  const tools = useMemo(() => availableTools(ctx), [ctx]);

  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const draftLayer   = useRef(null);
  const hoverRef     = useRef(null);
  const draggingRef  = useRef(false);
  const rafRef       = useRef(0);

  const [tilePx, setTilePx] = useState(400);
  const [opts, setOptsState] = useState(() => ({
    tool: tools[0] ?? null,
    terrain: ctx.paletteIds[0] ?? 'land',
    brush: 'M',
    stamp: Object.keys(ctx.stamps)[0] ?? null,
    labelText: '', labelAngle: 0, labelScale: 1,
  }));
  const optsRef = useRef(opts);
  const setOpts = useCallback(patch => {
    setOptsState(o => (optsRef.current = { ...o, ...patch }));
  }, []);
  const [notice, setNotice] = useState(null);
  const [focusedRule, setFocusedRule] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [strokeEnd, setStrokeEnd] = useState(0);

  // ── Derived ────────────────────────────────────────────────────────────────

  const evaluation = useMemo(() => evaluateRules(ctx, draft), [ctx, draft]);
  const { diff } = evaluation;
  const remaining = useMemo(() => {
    const paths = countBy(diff.newPaths, 'kind');
    const stamps = countBy(diff.newStamps, 'type');
    return {
      paths: Object.fromEntries(['river', 'road', 'wall', 'ley'].map(k => [k, (ctx.charges[k] ?? 0) - (paths[k] ?? 0)])),
      stamps: Object.fromEntries(Object.entries(ctx.stamps).map(([t, n]) => [t, n - (stamps[t] ?? 0)])),
      upgrade: (ctx.charges.upgrade ?? 0) - diff.upgrades,
      labels: (ctx.charges.label ?? 0) - diff.newLabels.length,
      voidSeed: (ctx.charges.voidSeed ?? 0) - draft.seeds,
    };
  }, [ctx, diff, draft.seeds]);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  const highlightCells = useMemo(() => {
    const r = evaluation.results.find(res => res.id === focusedRule);
    return r && !r.ok ? r.cells ?? [] : [];
  }, [evaluation, focusedRule]);

  // ── Sizing ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setTilePx(Math.max(220, Math.min(EDITOR_MAX_PX, Math.floor(w / (1 + 2 * RING)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const neighborLayer = useMemo(
    () => (typeof document === 'undefined' ? null : renderNeighborLayer(state, x, y, tilePx)),
    [state, x, y, tilePx],
  );
  const lockedLayer = useMemo(
    () => (typeof document === 'undefined' ? null : renderLockedLayer(ctx.locked, tilePx)),
    [ctx.locked, tilePx],
  );

  // ── Tool API ───────────────────────────────────────────────────────────────

  const buildApi = useCallback(() => ({
    ctx,
    draft: () => draftRef.current,
    set,
    begin,
    opts: optsRef.current,
    setOpts,
    remaining: remainingRef.current,
    inkLeft: (d = draftRef.current) => ctx.ink - countChanged(ctx.base.cells, d.cells, ctx.locked),
    notify: text => setNotice(text),
  }), [ctx, draftRef, set, begin, setOpts]);

  // ── Drawing ────────────────────────────────────────────────────────────────

  const off = Math.round(RING * tilePx);
  const W = Math.round(tilePx * (1 + 2 * RING));
  const k = tilePx / N;   // px per cell

  const graphics = useCallback(g => ({
    brush(pt, r) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(off + pt.x * k, off + pt.y * k, r * k, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(off + pt.x * k, off + pt.y * k, r * k + 1.5, 0, Math.PI * 2); g.stroke();
      g.restore();
    },
    cellHighlight(pt) {
      const cx = Math.floor(pt.x), cy = Math.floor(pt.y);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.5;
      g.strokeRect(off + cx * k, off + cy * k, k, k);
      g.restore();
    },
    path(kind, pts) {
      g.save();
      g.translate(off, off);
      g.globalAlpha = 0.75;
      drawPaths(g, [{ kind, pts }], tilePx, draftRef.current.cells);
      g.restore();
    },
    snapHint({ pt, snap }) {
      const colors = { port: '#fcd34d', junction: '#86efac', edge: '#ffffff' };
      g.save();
      g.fillStyle = colors[snap] ?? 'rgba(255,255,255,0.5)';
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.beginPath(); g.arc(off + pt[0] * k, off + pt[1] * k, snap ? 5 : 3, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    },
    stampGhost(type, sx, sy, invalid) {
      g.save();
      g.translate(off, off);
      g.globalAlpha = 0.6;
      drawStamps(g, [{ type, x: sx, y: sy }], tilePx);
      g.restore();
      if (invalid) {
        const px = off + sx * tilePx, py = off + sy * tilePx;
        g.save();
        g.strokeStyle = 'rgba(255, 80, 80, 0.95)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(px, py, 18, 0, Math.PI * 2);
        g.moveTo(px - 13, py + 13); g.lineTo(px + 13, py - 13);
        g.stroke();
        g.restore();
      }
    },
    ring(cx, cy, r) {
      g.save();
      g.strokeStyle = '#fcd34d';
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.beginPath(); g.arc(off + cx * k, off + cy * k, r * k, 0, Math.PI * 2); g.stroke();
      g.restore();
    },
    labelGhost(l) {
      g.save();
      g.translate(off, off);
      g.globalAlpha = 0.6;
      drawLabels(g, [l], tilePx);
      g.restore();
    },
  }), [off, k, tilePx, draftRef]);

  const drawPorts = useCallback((g, d) => {
    const arrow = (side, t, color, done) => {
      const [px, py] = portPoint(side, t);
      const sx = off + px * k, sy = off + py * k;
      const dir = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[side];
      const s = Math.max(6, k * 0.9);
      g.save();
      g.translate(sx, sy);
      g.rotate(Math.atan2(dir[1], dir[0]));
      g.fillStyle = done ? '#34d399' : color;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(s * 1.4, 0); g.lineTo(-s * 0.2, -s * 0.8); g.lineTo(-s * 0.2, s * 0.8); g.closePath();
      g.fill(); g.stroke();
      g.restore();
    };
    for (const p of ctx.incoming) {
      const required = ctx.requiredPorts.some(q => q.side === p.side && q.kind === p.kind && q.t === p.t);
      const done = d.paths.some(path => endpointAtPort(path, p));
      if (required || done) arrow(p.side, p.t, PORT_COLORS[p.kind], done);
    }
    // Ends this draft leaves on an edge — whoever works on the tile across
    // (empty or already drawn) will have to continue them.
    for (const path of d.paths) {
      if (!PATH_KINDS[path.kind]?.needsContinuation) continue;
      for (const end of [path.pts[0], path.pts[path.pts.length - 1]]) {
        const port = portOfPoint(end);
        if (!port) continue;
        if (ctx.incoming.some(p => p.side === port.side && p.kind === path.kind && Math.abs(p.t - port.t) < 0.8)) continue;
        g.save();
        g.strokeStyle = PORT_COLORS[path.kind];
        g.lineWidth = 2;
        g.beginPath(); g.arc(off + end[0] * k, off + end[1] * k, Math.max(5, k * 0.6), 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    }
  }, [ctx, off, k]);

  const compose = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !draftLayer.current) return;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, W);
    if (neighborLayer) g.drawImage(neighborLayer, 0, 0);
    g.drawImage(draftLayer.current, off, off, tilePx, tilePx);
    if (lockedLayer) g.drawImage(lockedLayer, off, off);
    g.strokeStyle = 'rgba(226, 232, 240, 0.7)';
    g.lineWidth = 1;
    g.strokeRect(off - 0.5, off - 0.5, tilePx + 1, tilePx + 1);

    if (highlightCells.length) {
      g.save();
      g.fillStyle = 'rgba(239, 68, 68, 0.45)';
      g.strokeStyle = 'rgba(254, 202, 202, 0.9)';
      for (const i of highlightCells) {
        const cx = i % N, cy = Math.floor(i / N);
        g.fillRect(off + cx * k, off + cy * k, Math.ceil(k), Math.ceil(k));
      }
      g.restore();
    }
    drawPorts(g, draftRef.current);
    const tool = TOOLS[optsRef.current.tool];
    if (hoverRef.current && tool?.preview) {
      tool.preview(graphics(g), buildApi(), hoverRef.current);
    }
  }, [W, off, k, tilePx, neighborLayer, lockedLayer, highlightCells, drawPorts, graphics, draftRef, buildApi]);

  const scheduleCompose = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(compose);
  }, [compose]);

  // Re-render the draft tile whenever it changes — at half resolution while a
  // stroke is in progress so painting stays responsive, full quality on release.
  useEffect(() => {
    const res = draggingRef.current ? Math.round(tilePx / 2) : tilePx;
    if (!draftLayer.current || draftLayer.current.width !== res) draftLayer.current = makeCanvas(res);
    const tile = { cells: draft.cells.join(''), paths: draft.paths, stamps: draft.stamps, labels: draft.labels };
    renderTile(draftLayer.current.getContext('2d'), tile, res, { tiles: state.tiles, x, y });
    scheduleCompose();
  }, [draft, tilePx, state.tiles, x, y, scheduleCompose, strokeEnd]);

  useEffect(() => { scheduleCompose(); }, [scheduleCompose, opts]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(id);
  }, [notice]);

  const toCell = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = W / rect.width;
    return {
      x: (((e.clientX - rect.left) * scale) - off) / k,
      y: (((e.clientY - rect.top) * scale) - off) / k,
    };
  };

  const handlePointerDown = e => {
    const tool = TOOLS[optsRef.current.tool];
    if (!tool) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    const pt = toCell(e);
    hoverRef.current = pt;
    setSubmitError(null);
    tool.down?.(buildApi(), pt);
    scheduleCompose();
  };
  const handlePointerMove = e => {
    const pt = toCell(e);
    hoverRef.current = pt;
    TOOLS[optsRef.current.tool]?.move?.(buildApi(), pt, draggingRef.current);
    scheduleCompose();
  };
  const handlePointerUp = e => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    TOOLS[optsRef.current.tool]?.up?.(buildApi(), toCell(e));
    setStrokeEnd(n => n + 1);
    scheduleCompose();
  };
  const handlePointerLeave = () => {
    if (draggingRef.current) return;
    hoverRef.current = null;
    scheduleCompose();
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    if (!evaluation.allOk) return;
    const d = draftRef.current;
    const res = onSubmit({ cells: d.cells.join(''), paths: d.paths, stamps: d.stamps, labels: d.labels });
    if (res && !res.ok) setSubmitError(res.error);
  }, [evaluation.allOk, draftRef, onSubmit]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === 'enter') { handleSubmit(); return; }
      if (key === 'escape') { TOOLS[optsRef.current.tool]?.cancel?.(); scheduleCompose(); return; }
      if (SHORTCUTS[key] && tools.includes(SHORTCUTS[key])) { setOpts({ tool: SHORTCUTS[key] }); return; }
      const sizes = Object.keys(BRUSH_SIZES);
      if (key === '[' || key === ']') {
        const i = sizes.indexOf(optsRef.current.brush) + (key === ']' ? 1 : -1);
        setOpts({ brush: sizes[Math.max(0, Math.min(sizes.length - 1, i))] });
        return;
      }
      const n = Number(key);
      if (n >= 1 && n <= ctx.paletteIds.length) {
        setOpts({ terrain: ctx.paletteIds[n - 1], tool: ['brush', 'fill'].includes(optsRef.current.tool) ? optsRef.current.tool : 'brush' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, handleSubmit, tools, ctx.paletteIds, setOpts, scheduleCompose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const tool = TOOLS[opts.tool];
  const inkUsed = diff.changedCells;
  const inkFinite = Number.isFinite(ctx.ink);
  const paintTools = tools.filter(id => TOOLS[id].group === 'paint');
  const featureTools = tools.filter(id => TOOLS[id].group === 'feature');
  const strokeTool = ['brush', 'erase', 'roughen', 'smooth'].includes(opts.tool);
  const chargeOf = id => {
    if (['river', 'road', 'wall', 'ley'].includes(id)) return remaining.paths[id];
    if (id === 'upgrade') return remaining.upgrade;
    if (id === 'label') return remaining.labels;
    if (id === 'voidSeed') return remaining.voidSeed;
    if (id === 'stamp') return Object.values(remaining.stamps).reduce((a, b) => a + b, 0);
    return null;
  };

  const btn = active => `flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors ${
    active ? 'bg-slate-200 text-slate-900 border-white' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
  }`;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Canvas */}
      <div ref={containerRef} className="w-full lg:flex-1 min-w-0">
        <canvas
          ref={canvasRef}
          width={W}
          height={W}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="block mx-auto rounded-md border border-slate-700 select-none"
          style={{ width: '100%', maxWidth: W, touchAction: 'none', cursor: tool?.cursor === 'none' ? 'none' : tool?.cursor ?? 'default' }}
        />
        <p className="mt-2 text-xs text-slate-500 text-center">{tool?.hint}</p>
        {ctx.locked.some(Boolean) && (
          <p className="mt-1 text-[11px] text-slate-600 text-center">
            Hatched cells continue the neighboring tiles and are locked.
          </p>
        )}
      </div>

      {/* Side panel */}
      <aside className="w-full lg:w-80 flex-shrink-0 space-y-4">
        <div className="rounded-lg border-2 overflow-hidden" style={{ borderColor: playedCard.accent }}>
          <div className="px-3 py-1.5 flex justify-between items-center text-slate-900" style={{ backgroundColor: playedCard.accent }}>
            <span className="text-xs font-bold uppercase tracking-widest">{playedCard.name}</span>
            <span className="text-[10px] font-semibold uppercase opacity-70">{KIND_LABELS[playedCard.kind]}</span>
          </div>
          <div className="px-3 py-2 bg-slate-800/80 text-xs text-slate-400 flex justify-between">
            <span>Tile {coordLabel(x, y)}</span>
            <span>{ctx.isFrontier ? 'New panel' : `Generation ${ctx.base.generation}`}</span>
          </div>
          {isDev && <div className="px-3 py-1 bg-amber-950/60 text-[11px] text-amber-300">Dev tools: all terrains and tools, no limits</div>}
        </div>

        {paintTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Terrain</p>
            <div className="flex flex-wrap gap-1.5">
              {ctx.paletteIds.map((t, i) => {
                const borrowed = ctx.borrowedIds.includes(t);
                return (
                <button key={t} type="button"
                  title={`${TERRAINS[t].name} (${i + 1})${borrowed ? ' — from a neighboring tile, so boundaries can blend across the seam' : ''}`}
                  onClick={() => setOpts({ terrain: t, tool: ['brush', 'fill'].includes(opts.tool) ? opts.tool : 'brush' })}
                  className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded border text-xs transition-colors ${borrowed ? 'border-dashed' : ''} ${
                    opts.terrain === t ? 'border-white text-slate-100 bg-slate-700' : 'border-slate-600 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded-sm border border-black/40" style={{ backgroundColor: TERRAINS[t].color }} />
                  {TERRAINS[t].name}
                </button>
                );
              })}
            </div>
            {ctx.borrowedIds.length > 0 && (
              <p className="text-[11px] text-slate-500">Dashed terrains come from neighboring tiles, so you can blend across the seam.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {paintTools.map(id => (
                <button key={id} type="button" onClick={() => setOpts({ tool: id })} className={btn(opts.tool === id)}
                  title={`${TOOLS[id].label} (${Object.keys(SHORTCUTS).find(s => SHORTCUTS[s] === id)?.toUpperCase()})`}>
                  <span>{TOOLS[id].icon}</span>{TOOLS[id].label}
                </button>
              ))}
            </div>
            {strokeTool && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                Size
                {Object.keys(BRUSH_SIZES).map(s => (
                  <button key={s} type="button" onClick={() => setOpts({ brush: s })}
                    className={`w-8 py-0.5 rounded border ${opts.brush === s ? 'border-white text-slate-100' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {inkFinite && (
              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>Ink</span><span>{inkUsed} / {ctx.ink} cells</span>
                </div>
                <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                  <div className={`h-full ${inkUsed >= ctx.ink ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${Math.min(100, (inkUsed / ctx.ink) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {featureTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Features</p>
            <div className="flex flex-wrap gap-1.5">
              {featureTools.filter(id => id !== 'stamp').map(id => {
                const left = chargeOf(id);
                return (
                  <button key={id} type="button" onClick={() => setOpts({ tool: id })} className={btn(opts.tool === id)}>
                    <span>{TOOLS[id].icon}</span>{TOOLS[id].label}
                    <span className={`ml-0.5 text-[10px] px-1 rounded ${left > 0 ? 'bg-slate-900/60' : 'bg-red-900/60 text-red-200'}`}>
                      {Number.isFinite(left) ? left : '∞'}
                    </span>
                  </button>
                );
              })}
            </div>
            {featureTools.includes('stamp') && (
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(ctx.stamps).map(type => {
                  const left = remaining.stamps[type];
                  const active = opts.tool === 'stamp' && opts.stamp === type;
                  return (
                    <button key={type} type="button" onClick={() => setOpts({ tool: 'stamp', stamp: type })}
                      disabled={left <= 0} className={`${btn(active)} disabled:opacity-40`}>
                      {STAMP_REGISTRY[type].name}
                      <span className="text-[10px] px-1 rounded bg-slate-900/60">{Number.isFinite(left) ? left : '∞'}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {opts.tool === 'label' && (
              <div className="space-y-1.5">
                <input value={opts.labelText} onChange={e => setOpts({ labelText: e.target.value })} maxLength={32}
                  placeholder="Name this place…"
                  className="w-full px-2 py-1.5 text-sm rounded bg-slate-900 border border-slate-600 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-400" />
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  Angle
                  <input type="range" min={-60} max={60} value={opts.labelAngle} onChange={e => setOpts({ labelAngle: Number(e.target.value) })} className="flex-1" />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  Size
                  <input type="range" min={0.6} max={2} step={0.1} value={opts.labelScale} onChange={e => setOpts({ labelScale: Number(e.target.value) })} className="flex-1" />
                </label>
              </div>
            )}
          </div>
        )}

        {!tools.length && <p className="text-xs text-slate-500">This card has no tools for this tile.</p>}

        <RuleChecklist results={evaluation.results} focused={focusedRule} onFocus={setFocusedRule} />

        {notice && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2">{notice}</div>
        )}
        {submitError && (
          <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded px-3 py-2">{submitError}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={undo} disabled={!canUndo} className="px-2.5 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-40">Undo</button>
          <button type="button" onClick={redo} disabled={!canRedo} className="px-2.5 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-40">Redo</button>
          <button type="button" onClick={reset} className="px-2.5 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 text-slate-400 hover:text-red-300 hover:border-red-700">Start over</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 text-sm rounded border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">
            Back to map
          </button>
          <button type="button" onClick={handleSubmit} disabled={!evaluation.allOk}
            title={evaluation.allOk ? 'Enter' : 'Finish the requirements first'}
            className="flex-1 px-4 py-2 text-sm rounded font-semibold bg-emerald-400 text-slate-900 hover:bg-emerald-300 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed">
            Submit tile
          </button>
        </div>
      </aside>
    </div>
  );
}

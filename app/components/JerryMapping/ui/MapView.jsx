"use client"
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { MAP_TILE_PX } from '../config.js';
import { keyOf, coordLabel } from '../engine/coords.js';
import { threatenedTiles } from '../engine/void.js';
import { openPorts } from '../engine/state.js';
import { PATH_KINDS } from '../engine/features.js';
import { STAMP_REGISTRY } from '../data/stamps.js';
import { drawMap, createTileCache, mapBounds } from '../render/mapRenderer.js';
import { usePanZoom } from '../hooks/usePanZoom.js';

export function MapView({ state, offers, claim, onTileClick, playerNames, focusKey }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const cacheRef = useRef(createTileCache());
  const [size, setSize] = useState({ w: 600, h: 480, measured: false });
  const [hover, setHover] = useState(null);
  const { camera, handlers, toWorld, centerOn, zoomBy } = usePanZoom(MAP_TILE_PX, onTileClick);
  const threatened = useMemo(() => threatenedTiles(state.tiles), [state.tiles]);

  // Responsive canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      setSize({ w, h: Math.max(320, Math.min(640, Math.round(w * 0.75))), measured: true });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const b = mapBounds(state.tiles);
    const cols = b.maxX - b.minX + 3, rows = b.maxY - b.minY + 3;
    const zoom = Math.min(size.w / (cols * MAP_TILE_PX), size.h / (rows * MAP_TILE_PX), 2);
    centerOn((b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, zoom);
  }, [state.tiles, size, centerOn]);

  // Fit once on first layout and whenever a new map starts.
  const seedRef = useRef(null);
  useEffect(() => {
    if (seedRef.current === state.seed || !size.measured) return;
    seedRef.current = state.seed;
    fit();
  }, [state.seed, size.measured, fit]);

  // Bring offered tiles into view when a card is drawn.
  useEffect(() => {
    if (!focusKey || !offers.length) return;
    const xs = offers.map(o => o.x), ys = offers.map(o => o.y);
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs) + 3, Math.max(...ys) - Math.min(...ys) + 3);
    const zoom = Math.min(size.w / (span * MAP_TILE_PX), size.h / (span * MAP_TILE_PX), 1.6);
    centerOn(cx, cy, Math.max(zoom, 0.5));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = e => { e.preventDefault(); handlers.onWheel(e); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handlers]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(g, {
      tiles: state.tiles, camera, width: size.w, height: size.h, tilePx: MAP_TILE_PX, dpr,
      cache: cacheRef.current, offers, claim, threatened, hover,
    });
  }, [state.tiles, camera, size, offers, claim, threatened, hover]);

  const onMove = e => {
    handlers.onPointerMove(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    const hx = Math.floor(w.x), hy = Math.floor(w.y);
    if (!hover || hover.x !== hx || hover.y !== hy) setHover({ x: hx, y: hy });
  };

  const hoverTile = hover ? state.tiles[keyOf(hover.x, hover.y)] : null;
  const hoverInfo = hover && (() => {
    const isOffer = offers.some(o => o.x === hover.x && o.y === hover.y);
    if (!hoverTile) return `${coordLabel(hover.x, hover.y)}${isOffer ? ' · open for a new panel' : ''}`;
    const author = playerNames[hoverTile.author] ?? (hoverTile.author ? 'another cartographer' : 'the map itself');
    const places = hoverTile.labels.map(l => l.text);
    const landmarks = hoverTile.stamps.map(s => STAMP_REGISTRY[s.type]?.name).filter(Boolean);
    return [
      coordLabel(hover.x, hover.y),
      `gen ${hoverTile.generation}`,
      `drawn by ${author}`,
      places.length ? `“${places.join('”, “')}”` : null,
      landmarks.length ? landmarks.slice(0, 4).join(', ') + (landmarks.length > 4 ? '…' : '') : null,
      ...[...new Set(openPorts(state.tiles, hover.x, hover.y).map(p => p.kind))]
        .map(kind => `a ${PATH_KINDS[kind].name.toLowerCase()} waits to be continued`),
      threatened.has(keyOf(hover.x, hover.y)) ? 'the void is near' : null,
    ].filter(Boolean).join(' · ');
  })();

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlers.onPointerDown}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block rounded-md border border-slate-700 select-none"
        style={{ width: '100%', height: size.h, touchAction: 'none', cursor: offers.length ? 'pointer' : 'grab' }}
      />
      <div className="absolute top-2 right-2 flex gap-1">
        {[['+', () => zoomBy(1.25)], ['−', () => zoomBy(0.8)], ['⤢', fit]].map(([label, fn]) => (
          <button key={label} type="button" onClick={fn} title={label === '⤢' ? 'Fit map' : label === '+' ? 'Zoom in' : 'Zoom out'}
            className="w-7 h-7 rounded bg-slate-900/80 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 text-sm">
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500 min-h-[1rem] truncate">{hoverInfo ?? 'Drag to pan · scroll or pinch to zoom'}</p>
    </div>
  );
}

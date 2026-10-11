import { useRef, useCallback, useState, useMemo } from 'react';

// Camera for the map: { x, y } is the world point (in tiles) at the canvas
// center; zoom scales the base tile size. Handles drag-to-pan, wheel zoom
// toward the cursor, and two-finger pinch. A pointer that moves less than a
// few pixels counts as a click.

const MIN_ZOOM = 0.25, MAX_ZOOM = 4;
const CLICK_SLOP = 5;
const clampZoom = z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

export function usePanZoom(tilePx, onClick) {
  const [camera, setCamera] = useState({ x: 0.5, y: 0.5, zoom: 1 });
  const camRef = useRef(camera);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const update = useCallback(next => {
    camRef.current = next;
    setCamera(next);
  }, []);

  const toWorld = useCallback((sx, sy, w, h, cam = camRef.current) => {
    const size = tilePx * cam.zoom;
    return { x: cam.x + (sx - w / 2) / size, y: cam.y + (sy - h / 2) / size };
  }, [tilePx]);

  const local = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const zoomAt = useCallback((sx, sy, w, h, factor) => {
    const cam = camRef.current;
    const before = toWorld(sx, sy, w, h, cam);
    const zoom = clampZoom(cam.zoom * factor);
    const size = tilePx * zoom;
    update({ zoom, x: before.x - (sx - w / 2) / size, y: before.y - (sy - h / 2) / size });
  }, [tilePx, toWorld, update]);

  const onPointerDown = useCallback(e => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { type: 'pan', start: p, cam: camRef.current, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.sx - b.sx, a.sy - b.sy), zoom: camRef.current.zoom, moved: true };
    }
  }, []);

  const onPointerMove = useCallback(e => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pan') {
      const dx = p.sx - g.start.sx, dy = p.sy - g.start.sy;
      if (!g.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      g.moved = true;
      const size = tilePx * g.cam.zoom;
      update({ ...g.cam, x: g.cam.x - dx / size, y: g.cam.y - dy / size });
    } else if (g.type === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const target = clampZoom(g.zoom * (d / g.dist));
      zoomAt((a.sx + b.sx) / 2, (a.sy + b.sy) / 2, p.w, p.h, target / camRef.current.zoom);
    }
  }, [tilePx, update, zoomAt]);

  const onPointerUp = useCallback(e => {
    const p = local(e);
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g?.type === 'pan' && !g.moved && pointers.current.size === 0) {
      const w = toWorld(p.sx, p.sy, p.w, p.h);
      onClick?.(Math.floor(w.x), Math.floor(w.y));
    }
    if (pointers.current.size === 0) gesture.current = null;
  }, [onClick, toWorld]);

  const onWheel = useCallback(e => {
    const p = local(e);
    zoomAt(p.sx, p.sy, p.w, p.h, Math.exp(-e.deltaY * 0.0015));
  }, [zoomAt]);

  const centerOn = useCallback((x, y, zoom = camRef.current.zoom) => update({ x, y, zoom: clampZoom(zoom) }), [update]);

  const zoomBy = useCallback(f => update({ ...camRef.current, zoom: clampZoom(camRef.current.zoom * f) }), [update]);
  const handlers = useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel }),
    [onPointerDown, onPointerMove, onPointerUp, onWheel],
  );

  return { camera, toWorld, centerOn, zoomBy, handlers };
}

import { useState, useRef, useEffect, useCallback } from 'react';
import s from '../ui/sudoku.module.css';
import e from './editor.module.css';

const OUT = 1080;     // size of the cropped background image, px
const MARGIN = 0.08;  // space around the template inside the viewport, as a fraction

const cx = (...names) => names.filter(Boolean).join(' ');

// View transform: an image point p appears at  T + R(rot) · scale · p  in the viewport.
const zoomAbout = (v, k, qx, qy) => ({ ...v, tx: qx + k * (v.tx - qx), ty: qy + k * (v.ty - qy), scale: v.scale * k });
const rotateAbout = (v, deg, cx0, cy0) => {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = v.tx - cx0, dy = v.ty - cy0;
  return { ...v, tx: cx0 + cos * dx - sin * dy, ty: cy0 + sin * dx + cos * dy, rot: v.rot + deg };
};

function fitView(w, h, V) {
  const T = V * (1 - 2 * MARGIN);
  const scale = T / Math.max(w, h);
  return { tx: (V - w * scale) / 2, ty: (V - h * scale) / 2, scale, rot: 0, base: scale };
}

/** Renders the template square of the current view to a JPEG data URL. */
function crop(imgEl, view, V) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, OUT, OUT);
  const m = MARGIN * V, k = OUT / (V - 2 * m);
  ctx.setTransform(k, 0, 0, k, -m * k, -m * k);
  ctx.translate(view.tx, view.ty);
  ctx.rotate((view.rot * Math.PI) / 180);
  ctx.scale(view.scale, view.scale);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imgEl, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function Template() {
  const lines = [];
  for (let k = 1; k < 9; k++) {
    const p = `${(k / 9) * 100}%`;
    const thick = k % 3 === 0;
    lines.push(<line key={`v${k}`} x1={p} x2={p} y1="0" y2="100%" className={thick ? e.tplThick : e.tplThin} />);
    lines.push(<line key={`h${k}`} y1={p} y2={p} x1="0" x2="100%" className={thick ? e.tplThick : e.tplThin} />);
  }
  return (
    <div className={e.template} style={{ inset: `${MARGIN * 100}%` }}>
      <svg width="100%" height="100%" aria-hidden="true">{lines}</svg>
    </div>
  );
}

/**
 * Upload a photo of a puzzle and line it up with the 9×9 template. Calls
 * onDone(photoDataUrl) with the cropped square, which the editor shows
 * beneath its grid to trace over.
 */
export function PhotoAlign({ onDone, onClose }) {
  const [image, setImage] = useState(null);   // { url, el }
  const [view, setView] = useState(null);
  const [V, setV] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const viewport = useRef(null);
  const pointers = useRef(new Map());
  const lastV = useRef(0);
  const aligning = !!image;

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  useEffect(() => {
    const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const loadFile = useCallback(file => {
    if (!file || !file.type.startsWith('image/')) { setError('That file isn’t an image.'); return; }
    setError(null);
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImage({ url, el }); setView(null); };
    el.onerror = () => { URL.revokeObjectURL(url); setError('Couldn’t open that image. Try a PNG or JPEG.'); };
    el.src = url;
  }, []);

  // Paste an image from the clipboard while choosing.
  useEffect(() => {
    if (aligning) return undefined;
    const onPaste = ev => {
      const file = [...(ev.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (file) loadFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [aligning, loadFile]);

  // Track the viewport size; keep the image in place relative to it on resize.
  useEffect(() => {
    if (!aligning || !viewport.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const size = entry.contentRect.width;
      const prev = lastV.current;
      lastV.current = size;
      if (prev && size !== prev) {
        const k = size / prev;
        setView(v => v && { ...v, tx: v.tx * k, ty: v.ty * k, scale: v.scale * k, base: v.base * k });
      }
      setV(size);
    });
    ro.observe(viewport.current);
    return () => ro.disconnect();
  }, [aligning]);

  useEffect(() => {
    if (image && V && !view) setView(fitView(image.el.naturalWidth, image.el.naturalHeight, V));
  }, [image, V, view]);

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = viewport.current;
    if (!aligning || !el) return undefined;
    const onWheel = ev => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const k = Math.exp(-ev.deltaY * 0.0015);
      setView(v => v && zoomAbout(v, k, ev.clientX - rect.left, ev.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [aligning]);

  // Arrow keys nudge (Shift for bigger steps), +/- zoom, [ ] rotate.
  useEffect(() => {
    if (!aligning) return undefined;
    const onKey = ev => {
      if (ev.target?.tagName === 'INPUT') return;
      const step = ev.shiftKey ? 10 : 1;
      const c = V / 2;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[ev.key]) { const [dx, dy] = moves[ev.key]; setView(v => v && { ...v, tx: v.tx + dx, ty: v.ty + dy }); }
      else if (ev.key === '+' || ev.key === '=') setView(v => v && zoomAbout(v, 1.02, c, c));
      else if (ev.key === '-') setView(v => v && zoomAbout(v, 1 / 1.02, c, c));
      else if (ev.key === '[') setView(v => v && rotateAbout(v, -0.25, c, c));
      else if (ev.key === ']') setView(v => v && rotateAbout(v, 0.25, c, c));
      else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aligning, V]);

  // Drag to move; two fingers to pinch-zoom.
  const local = ev => {
    const rect = viewport.current.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  const onPointerDown = ev => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, local(ev));
  };
  const onPointerMove = ev => {
    const ps = pointers.current;
    if (!ps.has(ev.pointerId)) return;
    const before = [...ps.values()];
    ps.set(ev.pointerId, local(ev));
    const after = [...ps.values()];
    if (after.length === 1) {
      const dx = after[0].x - before[0].x, dy = after[0].y - before[0].y;
      setView(v => v && { ...v, tx: v.tx + dx, ty: v.ty + dy });
    } else if (after.length === 2) {
      const mid = p => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const dist = p => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      const m0 = mid(before), m1 = mid(after), k = dist(after) / dist(before);
      setView(v => v && zoomAbout({ ...v, tx: v.tx + m1.x - m0.x, ty: v.ty + m1.y - m0.y }, k, m1.x, m1.y));
    }
  };
  const onPointerUp = ev => { pointers.current.delete(ev.pointerId); };

  const zoomTo = scale => setView(v => v && zoomAbout(v, scale / v.scale, V / 2, V / 2));
  const rotateTo = deg => setView(v => v && rotateAbout(v, deg - v.rot, V / 2, V / 2));

  return (
    <div className={s.overlay} onPointerDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className={cx(s.dialog, e.importDialog)} role="dialog" aria-modal="true" aria-label="Background photo">
        <div className={s.dialogHeader}>
          <h3 className={s.dialogTitle}>Background photo</h3>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {!aligning && (
          <>
            <label
              className={cx(e.dropZone, dragOver && e.dropZoneOver)}
              onDragOver={ev => { ev.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={ev => { ev.preventDefault(); setDragOver(false); loadFile(ev.dataTransfer.files[0]); }}
            >
              <input type="file" accept="image/*" className={e.fileInput} onChange={ev => loadFile(ev.target.files[0])} />
              <span className={e.dropTitle}>Choose an image</span>
              <span className={e.dropHint}>or drop or paste one here</span>
            </label>
            <p className={s.dialogNote}>
              The photo goes underneath the editor’s grid so you can trace the cages and copy the numbers. It stays on your device.
            </p>
          </>
        )}

        {aligning && (
          <>
            <p className={s.dialogNote}>
              Drag to move, and scroll or pinch to zoom. Line the puzzle’s outer border up with the template.
            </p>
            <div
              ref={viewport}
              className={e.viewport}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {view && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob URL, nothing for next/image to optimise
                <img
                  src={image.url}
                  alt="Uploaded puzzle"
                  draggable={false}
                  className={e.alignImage}
                  style={{
                    width: image.el.naturalWidth,
                    height: image.el.naturalHeight,
                    transform: `translate(${view.tx}px, ${view.ty}px) rotate(${view.rot}deg) scale(${view.scale})`,
                  }}
                />
              )}
              <Template />
            </div>
            {view && (
              <div className={e.sliders}>
                <label className={e.slider}>
                  <span>Zoom</span>
                  <input
                    type="range" min={-1.5} max={2.5} step={0.005}
                    value={Math.log(view.scale / view.base)}
                    onChange={ev => zoomTo(view.base * Math.exp(Number(ev.target.value)))}
                  />
                </label>
                <label className={e.slider}>
                  <span>Rotate</span>
                  <input type="range" min={-15} max={15} step={0.1} value={view.rot} onChange={ev => rotateTo(Number(ev.target.value))} />
                </label>
              </div>
            )}
            <div className={s.controls}>
              <button type="button" className={s.btn} onClick={() => setImage(null)}>Choose another image</button>
              <button type="button" className={s.btn} onClick={() => setView(fitView(image.el.naturalWidth, image.el.naturalHeight, V))}>Reset view</button>
              <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={() => onDone(crop(image.el, view, V))} disabled={!view}>
                Use photo
              </button>
            </div>
          </>
        )}

        {error && <p className={e.importError}>{error}</p>}
      </div>
    </div>
  );
}

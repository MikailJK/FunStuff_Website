import { useMemo, useRef } from 'react';
import { rowOf, colOf, cageIndex } from '../engine/board.js';
import { cageShape, CageOutline } from '../ui/Board.jsx';
import { labelCell } from './model.js';
import s from '../ui/sudoku.module.css';
import e from './editor.module.css';

const cx = (...names) => names.filter(Boolean).join(' ');

/**
 * Board for the editor. Pointer handling works on board coordinates rather
 * than per-cell events so dragging works the same with mouse and touch.
 *
 * An optional background photo sits beneath the grid (cells go translucent)
 * so a printed puzzle can be traced. Cage totals are shown in the middle of
 * each cage, out of the way of the photo's own top-left totals.
 */
export function EditorBoard({
  draft, selected, selectedCage, drawing, errorCells, hintCells, photo, photoOpacity,
  onDown, onMove, onUp,
}) {
  const ref = useRef(null);
  const killer = draft.kind === 'killer';
  const cages = useMemo(() => (killer ? draft.cages : []), [killer, draft.cages]);
  const cageOf = useMemo(() => cageIndex(cages), [cages]);
  const shapes = useMemo(() => (killer ? Array.from({ length: 81 }, (_, i) => cageShape(i, cageOf)) : null), [killer, cageOf]);
  const sumAt = useMemo(
    () => new Map(cages.map((c, k) => [labelCell(c.cells, draft.givens), { sum: c.sum, k }])),
    [cages, draft.givens],
  );
  const drawSet = useMemo(() => new Set(drawing), [drawing]);
  const selCells = useMemo(() => new Set(selectedCage != null ? cages[selectedCage]?.cells ?? [] : []), [cages, selectedCage]);

  const cellAt = ev => {
    const rect = ref.current.getBoundingClientRect();
    const c = Math.floor(((ev.clientX - rect.left) / rect.width) * 9);
    const r = Math.floor(((ev.clientY - rect.top) / rect.height) * 9);
    return r >= 0 && r < 9 && c >= 0 && c < 9 ? r * 9 + c : null;
  };

  return (
    <div
      ref={ref}
      className={cx(s.board, e.board, photo && e.withPhoto)}
      role="grid"
      aria-label="Puzzle editor board"
      onPointerDown={ev => {
        const i = cellAt(ev);
        if (i == null) return;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        onDown(i);
      }}
      onPointerMove={ev => {
        if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
        const i = cellAt(ev);
        if (i != null) onMove(i);
      }}
      onPointerUp={() => onUp()}
      onPointerCancel={() => onUp()}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing for next/image to optimise
        <img src={photo} alt="" className={e.photo} style={{ opacity: photoOpacity }} draggable={false} />
      )}
      {Array.from({ length: 81 }, (_, i) => {
        const r = rowOf(i), c = colOf(i);
        const given = draft.givens[i] !== '0' ? draft.givens[i] : null;
        const label = sumAt.get(i);
        const uncaged = killer && cageOf[i] < 0 && !drawSet.has(i);
        return (
          <div
            key={i}
            className={cx(
              s.cell, e.cell,
              c === 8 ? s.lastCol : c % 3 === 2 && s.thickRight,
              r === 8 ? s.lastRow : r % 3 === 2 && s.thickBottom,
              uncaged && e.uncaged,
              selCells.has(i) && e.inCage,
              drawSet.has(i) && e.drawing,
              i === selected && e.selected,
              given && s.given,
              errorCells.has(i) && e.error,
            )}
          >
            {shapes && cageOf[i] >= 0 && (
              <CageOutline
                shape={shapes[i]}
                width="2px"
                inset="4px"
                className={cx(e.cageLine, selCells.has(i) && e.cageLineSelected)}
              />
            )}
            {given && <span className={s.value}>{given}</span>}
            {label && (
              <span className={cx(e.cageTotal, label.sum == null && e.totalMissing, label.k === selectedCage && e.totalSelected)}>
                {label.sum ?? '?'}
              </span>
            )}
            {hintCells.has(i) && <span className={e.hint} aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

import { memo, useMemo } from 'react';
import { rowOf, colOf } from '../engine/board.js';
import s from './sudoku.module.css';

const INSET = '3px';
const DASH = '1px';

// Which sides / diagonals of cell i stay inside the same cage.
export function cageShape(i, cageOf) {
  const r = rowOf(i), c = colOf(i), k = cageOf[i];
  const same = (dr, dc) => {
    const rr = r + dr, cc = c + dc;
    return rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && cageOf[rr * 9 + cc] === k;
  };
  return {
    t: same(-1, 0), b: same(1, 0), l: same(0, -1), r: same(0, 1),
    tl: same(-1, -1), tr: same(-1, 1), bl: same(1, -1), br: same(1, 1),
  };
}

// A dashed outline inset from the cell edge on sides that border another
// cage, running to the edge on sides that continue into the same cage. Small
// corner pieces close the gap at inside corners of L-shaped cages.
// `className` and `width` let the editor draw a bolder line.
export function CageOutline({ shape: sh, className, width = DASH, inset = INSET }) {
  const cls = className ? `${s.cageOutline} ${className}` : s.cageOutline;
  const main = {
    top: sh.t ? 0 : inset, bottom: sh.b ? 0 : inset,
    left: sh.l ? 0 : inset, right: sh.r ? 0 : inset,
    borderTopWidth: sh.t ? 0 : width, borderBottomWidth: sh.b ? 0 : width,
    borderLeftWidth: sh.l ? 0 : width, borderRightWidth: sh.r ? 0 : width,
  };
  const corner = (v, h) => ({
    [v]: 0, [h]: 0, width: inset, height: inset,
    [v === 'top' ? 'borderBottomWidth' : 'borderTopWidth']: width,
    [h === 'left' ? 'borderRightWidth' : 'borderLeftWidth']: width,
  });
  return (
    <>
      <span className={cls} style={main} />
      {sh.t && sh.l && !sh.tl && <span className={cls} style={corner('top', 'left')} />}
      {sh.t && sh.r && !sh.tr && <span className={cls} style={corner('top', 'right')} />}
      {sh.b && sh.l && !sh.bl && <span className={cls} style={corner('bottom', 'left')} />}
      {sh.b && sh.r && !sh.br && <span className={cls} style={corner('bottom', 'right')} />}
    </>
  );
}

const Cell = memo(function Cell({
  i, value, given, marks, shape, cageSum, killer,
  selected, line, same, wrong, sameDigit, onSelect,
}) {
  const r = rowOf(i), c = colOf(i);
  const cls = [
    s.cell,
    c === 8 ? s.lastCol : c % 3 === 2 && s.thickRight,
    r === 8 ? s.lastRow : r % 3 === 2 && s.thickBottom,
    line && s.line, same && s.same, selected && s.selected,
    given && s.given, wrong && s.wrong,
  ].filter(Boolean).join(' ');

  const label = value
    ? `Row ${r + 1}, column ${c + 1}: ${value}`
    : `Row ${r + 1}, column ${c + 1}: empty`;

  return (
    <button type="button" className={cls} onPointerDown={() => onSelect(i)} aria-label={label} tabIndex={-1}>
      {cageSum != null && <span className={s.cageSum}>{cageSum}</span>}
      {shape && <CageOutline shape={shape} />}
      {value ? (
        <span className={s.value}>{value}</span>
      ) : marks ? (
        <span className={`${s.marks} ${killer ? s.marksKiller : ''}`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <span key={d} className={d === sameDigit ? s.markSame : undefined}>
              {marks & (1 << d) ? d : ''}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});

/**
 * @param {{ box: number, key: number }[]} [pulses]  boxes to glow once (a new key replays it)
 * @param {(key: number) => void} [onPulseEnd]
 * @param {boolean} [locked]  solved: cells can't be selected
 */
export function Board({ board, puzzle, cageOf, selected, wrongCells, onSelect, pulses = [], onPulseEnd, locked }) {
  const killer = !!puzzle.cages;
  const selValue = selected != null ? board.values[selected] : 0;

  const shapes = useMemo(
    () => (killer ? Array.from({ length: 81 }, (_, i) => cageShape(i, cageOf)) : null),
    [killer, cageOf],
  );
  // The sum label sits in each cage's first cell in reading order.
  const sumAt = useMemo(
    () => new Map((puzzle.cages ?? []).map(cage => [Math.min(...cage.cells), cage.sum])),
    [puzzle],
  );

  return (
    <div className={locked ? `${s.board} ${s.locked}` : s.board} role="grid" aria-label="Sudoku board">
      {pulses.map(p => (
        <span
          key={p.key}
          className={s.boxPulse}
          style={{ gridRow: `${((p.box / 3) | 0) * 3 + 1} / span 3`, gridColumn: `${(p.box % 3) * 3 + 1} / span 3` }}
          onAnimationEnd={() => onPulseEnd?.(p.key)}
          aria-hidden="true"
        />
      ))}
      {board.values.map((value, i) => {
        const line = selected != null && i !== selected &&
          (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected));
        return (
          <Cell
            key={i}
            i={i}
            value={value}
            given={board.givens[i]}
            marks={board.marks[i]}
            shape={shapes?.[i]}
            cageSum={sumAt.get(i)}
            killer={killer}
            selected={i === selected}
            line={line}
            same={!!selValue && i !== selected && value === selValue}
            wrong={wrongCells.has(i)}
            sameDigit={selValue || 0}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

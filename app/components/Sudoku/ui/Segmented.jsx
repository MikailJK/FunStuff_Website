import s from './sudoku.module.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={cx(s.segment, o.id === value && s.segmentActive)}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

"use client"

// Live list of the card's requirements. Rules marked visible:'failing' only
// appear while broken. Hovering (or tapping) a row highlights its cells.
export function RuleChecklist({ results, onFocus, focused }) {
  const rows = results.filter(r => r.visible === 'always' || !r.ok);
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">Requirements</p>
      <ul className="space-y-1">
        {rows.map(r => {
          const active = focused === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onMouseEnter={() => onFocus(r.cells?.length ? r.id : null)}
                onMouseLeave={() => onFocus(null)}
                onClick={() => onFocus(active ? null : (r.cells?.length ? r.id : null))}
                className={`w-full text-left flex gap-2 items-start px-2 py-1.5 rounded border text-xs transition-colors ${
                  r.ok
                    ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300'
                    : active
                      ? 'border-red-500/70 bg-red-950/50 text-red-200'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span className={`mt-px font-bold ${r.ok ? 'text-emerald-400' : 'text-slate-500'}`}>{r.ok ? '✓' : '○'}</span>
                <span className="flex-1">
                  {r.label}
                  {!r.ok && r.message && <span className="block text-[11px] text-slate-500 mt-0.5">{r.message}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

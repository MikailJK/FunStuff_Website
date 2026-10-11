"use client"
import { useEffect, useState } from 'react';

const KEY = 'jerrymapping:howto-dismissed';

export function HowToPlay() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(window.localStorage.getItem(KEY) !== '1'); } catch { setOpen(true); }
  }, []);
  const toggle = () => {
    setOpen(o => {
      try { window.localStorage.setItem(KEY, o ? '1' : '0'); } catch { /* ignore */ }
      return !o;
    });
  };

  return (
    <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60">
      <button type="button" onClick={toggle} className="w-full flex justify-between items-center px-4 py-2 text-xs text-slate-400 hover:text-slate-200">
        <span className="uppercase tracking-widest">How to play</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-slate-400 leading-relaxed">
          <p><span className="text-slate-200 font-semibold">1. Draw a card.</span> Each card sets the job: a new panel, a river, a settlement, a wall against the void. You only get the tools and ink it gives you.</p>
          <p><span className="text-slate-200 font-semibold">2. Pick a tile.</span> The card offers a few highlighted tiles. New panels grow the map outward from the first one.</p>
          <p><span className="text-slate-200 font-semibold">3. Draw within the lines.</span> Hatched seams continue the neighboring tiles and are locked. Arrows mark rivers and roads you must carry on.</p>
          <p><span className="text-slate-200 font-semibold">4. Meet the requirements.</span> The checklist turns green as you go; submit when it&apos;s all done. Every few turns the void spreads. Walls stop it.</p>
        </div>
      )}
    </div>
  );
}

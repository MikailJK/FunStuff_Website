"use client"
import { formatWait } from '../engine/pacing.js';

// Shows the contribution limit when one is active (collaborative play, or
// simulated from Dev Tools). Hidden for unlimited single-player.
export function PacingBanner({ pacing }) {
  const { policy, ok, used, nextAt, now } = pacing;
  if (!Number.isFinite(policy.turnsPerWindow)) return null;
  const window = policy.windowHours >= 1 ? `${policy.windowHours}h` : `${Math.round(policy.windowHours * 60)} min`;
  return (
    <div className={`text-xs rounded border px-3 py-2 ${ok ? 'border-slate-700 bg-slate-900 text-slate-400' : 'border-amber-800/60 bg-amber-950/40 text-amber-300'}`}>
      {ok
        ? <>You can draw {policy.turnsPerWindow - used} more card{policy.turnsPerWindow - used === 1 ? '' : 's'} this {window} window.</>
        : <>You&apos;ve drawn your {policy.turnsPerWindow} cards for now. Next card in {formatWait(nextAt - now)}.</>}
    </div>
  );
}

// Contribution limits. A turn starts with a DRAW; a policy caps how many DRAWs
// one player may make per rolling time window. Single-player uses an unlimited
// policy; an online version would run this check server-side.

export function canStartTurn(playerId, log, now, policy) {
  if (!Number.isFinite(policy.turnsPerWindow)) return { ok: true, used: 0, nextAt: null };
  const windowMs = policy.windowHours * 3600 * 1000;
  const recent = log
    .filter(a => a.type === 'DRAW' && a.author === playerId && now - a.ts < windowMs)
    .map(a => a.ts)
    .sort((a, b) => a - b);
  if (recent.length < policy.turnsPerWindow) return { ok: true, used: recent.length, nextAt: null };
  return { ok: false, used: recent.length, nextAt: recent[recent.length - policy.turnsPerWindow] + windowMs };
}

export function formatWait(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

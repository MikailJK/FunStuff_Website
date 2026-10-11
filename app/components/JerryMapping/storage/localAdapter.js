import { STORAGE_KEY } from '../config.js';
import { toSaveFile, fromSaveFile } from '../engine/serialize.js';

// Storage adapter interface (an online version swaps in a remote adapter with
// the same shape):
//   load()                 → { state, log } | null
//   save({ state, log })   persist a snapshot (+ log tail)
//   subscribe(cb)          cb({ state, log }) when another tab/client changes it
//   identity()             → { id, name } for this player

const LOG_TAIL = 400;   // localStorage is small — older actions are dropped

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

export const localAdapter = {
  load() {
    const raw = safeGet(STORAGE_KEY);
    if (!raw) return null;
    try { return fromSaveFile(JSON.parse(raw)); } catch { return null; }
  },

  save({ state, log }) {
    return safeSet(STORAGE_KEY, JSON.stringify(toSaveFile({ state, log: log.slice(-LOG_TAIL) })));
  },

  subscribe(cb) {
    const onStorage = e => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try { cb(fromSaveFile(JSON.parse(e.newValue))); } catch { /* ignore foreign writes */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },

  identity() {
    const key = `${STORAGE_KEY}:player`;
    try {
      const saved = JSON.parse(safeGet(key) ?? 'null');
      if (saved?.id) return saved;
    } catch { /* fall through */ }
    const id = (globalThis.crypto?.randomUUID?.() ?? `p-${Math.random().toString(36).slice(2)}`);
    const player = { id, name: 'Cartographer' };
    safeSet(key, JSON.stringify(player));
    return player;
  },

  setName(player, name) {
    const next = { ...player, name };
    safeSet(`${STORAGE_KEY}:player`, JSON.stringify(next));
    return next;
  },
};

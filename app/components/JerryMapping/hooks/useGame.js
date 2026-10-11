import { useState, useEffect, useRef, useCallback } from 'react';
import { applyAction } from '../engine/state.js';
import { makeAction, fromSaveFile } from '../engine/serialize.js';
import { canStartTurn } from '../engine/pacing.js';
import { randomSeed } from '../engine/rng.js';
import { PACING_POLICIES } from '../config.js';
import { localAdapter } from '../storage/localAdapter.js';

// Owns the game store ({ state, log }) and routes every change through the
// engine. Swapping `adapter` for a remote one is the path to collaboration.
export function useGame(adapter = localAdapter) {
  const [store, setStore]   = useState(null);
  const [player, setPlayer] = useState(null);
  const [policyName, setPolicyName] = useState('unlimited');
  const [now, setNow] = useState(() => Date.now());
  const storeRef = useRef(null);

  const commit = useCallback(next => {
    storeRef.current = next;
    setStore(next);
  }, []);

  // Load (client only — localStorage isn't available during SSR).
  useEffect(() => {
    const me = adapter.identity();
    setPlayer(me);
    const saved = adapter.load();
    if (saved) {
      commit(saved);
    } else {
      const action = makeAction('NEW_MAP', { seed: randomSeed() }, me.id);
      commit({ state: applyAction(null, action), log: [action] });
    }
    return adapter.subscribe(remote => commit(remote));
  }, [adapter, commit]);

  // Autosave, debounced.
  useEffect(() => {
    if (!store) return;
    const id = setTimeout(() => adapter.save(store), 250);
    return () => clearTimeout(id);
  }, [store, adapter]);

  // Tick a clock while a pacing limit is active so the countdown updates.
  useEffect(() => {
    if (policyName === 'unlimited') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [policyName]);

  const dispatch = useCallback((type, payload = {}) => {
    const cur = storeRef.current;
    if (!cur || !player) return { ok: false, error: 'Not ready.' };
    const action = makeAction(type, payload, player.id);
    try {
      const state = applyAction(type === 'NEW_MAP' ? null : cur.state, action);
      const log = type === 'NEW_MAP' ? [action] : [...cur.log, action];
      commit({ state, log });
      return { ok: true, state };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [player, commit]);

  const newMap = useCallback(() => dispatch('NEW_MAP', { seed: randomSeed() }), [dispatch]);

  const importSave = useCallback(data => {
    const loaded = fromSaveFile(data);
    commit(loaded);
  }, [commit]);

  const rename = useCallback(name => {
    if (!player) return;
    setPlayer(adapter.setName(player, name));
    dispatch('SET_NAME', { name });
  }, [adapter, player, dispatch]);

  const policy = PACING_POLICIES[policyName];
  const pacing = store && player
    ? canStartTurn(player.id, store.log, now, policy)
    : { ok: true, nextAt: null, used: 0 };

  return {
    state: store?.state ?? null,
    log: store?.log ?? [],
    store,
    player,
    dispatch,
    newMap,
    importSave,
    rename,
    pacing: { ...pacing, policy, policyName, now: Date.now() },
    setPolicyName,
  };
}

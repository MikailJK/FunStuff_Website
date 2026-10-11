import { SAVE_FORMAT, SAVE_VERSION } from '../config.js';
import { STATE_VERSION } from './state.js';

// Save files hold a state snapshot plus the action log that produced it. The
// log is what an online version would sync; the snapshot makes loading fast.

export function toSaveFile({ state, log }) {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: Date.now(), state, log };
}

export function fromSaveFile(data) {
  if (!data || data.format !== SAVE_FORMAT) throw new Error('Not a Jerry Mapping save file.');
  if (data.state?.version !== STATE_VERSION) throw new Error('This save was made by a different version.');
  if (!data.state.tiles || !data.state.deck) throw new Error('Save file is incomplete.');
  return { state: data.state, log: Array.isArray(data.log) ? data.log : [] };
}

let counter = 0;
export function makeAction(type, payload, author) {
  counter = (counter + 1) % 1e6;
  return { id: `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, type, author, ts: Date.now(), payload };
}

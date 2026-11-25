// Browser persistence (localStorage). All access is wrapped so a full,
// disabled, or corrupted storage just means "no saved data".
//
//   sudoku:v1          { progress: { [puzzleId]: entry }, last: { kind, difficulty, id } }
//                      (entry format: engine/serialize.js)
//   sudoku:custom:v1   custom puzzle records from the editor (editor/model.js toRecord)
//   sudoku:draft:v1    the editor's unsaved work { draft, editingId, dirty }
//   sudoku:photo:v1    the editor's background photo

const KEY = 'sudoku:v1';
const CUSTOM_KEY = 'sudoku:custom:v1';
const DRAFT_KEY = 'sudoku:draft:v1';

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

export function loadStore() {
  const raw = read(KEY);
  if (raw && typeof raw.progress === 'object' && raw.progress !== null) {
    return { progress: raw.progress, last: raw.last ?? null };
  }
  return { progress: {}, last: null };
}

export const saveStore = store => write(KEY, store);

const DIGITS81 = /^[0-9]{81}$/;
const SOLUTION81 = /^[1-9]{81}$/;

function validRecord(r) {
  if (!r || typeof r.id !== 'string' || (r.kind !== 'killer' && r.kind !== 'classic')) return false;
  if (typeof r.solution !== 'string' || !SOLUTION81.test(r.solution)) return false;
  if (r.givens != null && (typeof r.givens !== 'string' || !DIGITS81.test(r.givens))) return false;
  if (r.kind === 'classic' && !r.givens) return false;
  if (r.kind === 'killer') {
    if (!Array.isArray(r.cages)) return false;
    const seen = new Set();
    for (const c of r.cages) {
      if (!c || !Number.isInteger(c.sum) || !Array.isArray(c.cells)) return false;
      for (const i of c.cells) { if (!Number.isInteger(i) || i < 0 || i > 80 || seen.has(i)) return false; seen.add(i); }
    }
    if (seen.size !== 81) return false;
  }
  return true;
}

/** @returns custom puzzle records, newest first */
export function loadCustom() {
  const raw = read(CUSTOM_KEY);
  return Array.isArray(raw) ? raw.filter(validRecord) : [];
}

export const saveCustom = records => write(CUSTOM_KEY, records);

export const loadDraft = () => read(DRAFT_KEY);
export const saveDraft = value => write(DRAFT_KEY, value);

// The editor's background photo (a JPEG data URL, a few hundred KB).
const PHOTO_KEY = 'sudoku:photo:v1';
export function loadPhoto() {
  const p = read(PHOTO_KEY);
  return typeof p === 'string' && p.startsWith('data:image/') ? p : null;
}
export function savePhoto(photo) {
  try {
    if (photo) localStorage.setItem(PHOTO_KEY, JSON.stringify(photo));
    else localStorage.removeItem(PHOTO_KEY);
  } catch {} // too big for storage: it just won't survive a reload
}

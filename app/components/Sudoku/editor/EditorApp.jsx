"use client"
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cageIndex, rowOf, colOf } from '../engine/board.js';
import { KINDS, DIFFICULTIES } from '../puzzles.js';
import { loadCustom, saveCustom, loadDraft, saveDraft, loadPhoto, savePhoto } from '../storage.js';
import { Segmented } from '../ui/Segmented.jsx';
import {
  emptyDraft, sanitizeDraft, isEmptyDraft, setGiven, canExtend, addCage, removeCage, setCageSum,
  validate, solverInput, toRecord, fromRecord,
} from './model.js';
import { useSolverCheck } from './useSolverCheck.js';
import { EditorBoard } from './EditorBoard.jsx';
import { PhotoAlign } from './PhotoAlign.jsx';
import s from '../ui/sudoku.module.css';
import e from './editor.module.css';

const cx = (...names) => names.filter(Boolean).join(' ');
const TOOLS = [{ id: 'cages', label: 'Cages' }, { id: 'digits', label: 'Digits' }];
const MOVES = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
};
const RED_CODES = new Set(['duplicate', 'size', 'range', 'fit', 'disconnected']);
const HISTORY_LIMIT = 300;
const MAX_ISSUES = 4;

const newId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const kindLabel = k => KINDS.find(x => x.id === k).label;
const placeLabel = p => `${kindLabel(p.kind)} · ${DIFFICULTIES.find(d => d.id === p.difficulty)?.label ?? p.difficulty} · #${p.position}`;

function CheckStatus({ ready, check }) {
  if (!ready) return null;
  const msg = {
    idle: ['Check the solution to make sure it has exactly one before saving.'],
    checking: ['Checking for a single solution…'],
    unique: ['Has exactly one solution. Ready to save or publish.', 'good'],
    multiple: ['Has more than one solution. The dotted cells differ between two of them: a starting digit in one of those, or a change to a cage, will narrow it down.', 'warn'],
    none: ['Has no solution. Check the totals and starting digits.', 'bad'],
    error: ['Couldn’t check this puzzle.', 'bad'],
  }[check.status];
  if (!msg) return null;
  return (
    <p className={cx(e.status, msg[1] && e[`status_${msg[1]}`])}>
      {msg[0]}
      {check.status === 'checking' && (
        <button type="button" className={s.inlineBtn} onClick={check.cancel}>Stop</button>
      )}
    </p>
  );
}

export default function EditorApp() {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState([]);
  const [tool, setTool] = useState('cages');
  const [selected, setSelected] = useState(null);
  const [selectedCage, setSelectedCage] = useState(null);
  const [drawing, setDrawing] = useState([]);
  const [records, setRecords] = useState([]);
  const [photo, setPhoto] = useState(null);         // background photo to trace (data URL)
  const [showPhoto, setShowPhoto] = useState(true);
  const [photoOpacity, setPhotoOpacity] = useState(0.6);
  const [aligning, setAligning] = useState(false);
  const [notice, setNotice] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [published, setPublished] = useState(null); // { key, status, puzzle?, error? }
  const freshSum = useRef(true); // next digit typed starts a new cage total
  const drawingRef = useRef([]);

  const killer = draft.kind === 'killer';
  const activeTool = killer ? tool : 'digits';

  // ── Load and autosave ──
  useEffect(() => {
    const saved = loadDraft();
    const d = sanitizeDraft(saved?.draft);
    if (d) {
      setDraft(d);
      setEditingId(typeof saved.editingId === 'string' ? saved.editingId : null);
      setDirty(!!saved.dirty);
      if (d.kind === 'classic') setTool('digits');
    }
    setRecords(loadCustom());
    setPhoto(loadPhoto());
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) saveDraft({ draft, editingId, dirty }); }, [loaded, draft, editingId, dirty]);
  useEffect(() => { if (loaded) savePhoto(photo); }, [loaded, photo]);

  // ── Editing with undo ──
  const commit = useCallback(next => {
    if (next === draft) return;
    setHistory(h => [...h.slice(-(HISTORY_LIMIT - 1)), draft]);
    setDraft(next);
    setDirty(true);
    setNotice(null);
  }, [draft]);

  const undo = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setDraft(prev);
    setDirty(true);
    setSelectedCage(k => (k != null && k < prev.cages.length ? k : null));
  }, [history]);

  const replaceDraft = (next, id = null) => {
    setDraft(next);
    setHistory([]);
    setEditingId(id);
    setDirty(false);
    setSelected(null);
    setSelectedCage(null);
    setTool(next.kind === 'killer' ? 'cages' : 'digits');
  };

  const okToDiscard = () =>
    !dirty || isEmptyDraft(draft) || window.confirm('Discard the unsaved changes to this puzzle?');

  const cageOf = useMemo(() => cageIndex(draft.cages), [draft.cages]);
  const { issues, ready } = useMemo(() => validate(draft), [draft]);
  const check = useSolverCheck(solverInput(draft), ready);
  const puzzleKey = useMemo(() => JSON.stringify(solverInput(draft)), [draft]);
  const pub = published?.key === puzzleKey ? published : null; // any edit makes it stale

  const errorCells = useMemo(
    () => new Set(issues.filter(x => RED_CODES.has(x.code)).flatMap(x => x.cells)),
    [issues],
  );
  const hintCells = useMemo(() => new Set(check.status === 'multiple' ? check.diff : []), [check]);

  // ── Board input ──
  const onDown = i => {
    setSelected(i);
    if (activeTool === 'digits') { setSelectedCage(null); return; }
    const k = cageOf[i];
    if (k >= 0) { setSelectedCage(k); freshSum.current = true; return; }
    setSelectedCage(null);
    drawingRef.current = [i];
    setDrawing([i]);
  };
  const onMove = i => {
    const cells = drawingRef.current;
    if (!cells.length || cells[cells.length - 1] === i) return;
    let next;
    if (cells.length >= 2 && cells[cells.length - 2] === i) next = cells.slice(0, -1); // drag back to undo a cell
    else if (canExtend(draft, cells, i)) next = [...cells, i];
    else return;
    drawingRef.current = next;
    setDrawing(next);
    setSelected(i);
  };
  const onUp = () => {
    const cells = drawingRef.current;
    if (!cells.length) return;
    drawingRef.current = [];
    setDrawing([]);
    commit(addCage(draft, cells));
    setSelectedCage(draft.cages.length);
    freshSum.current = true;
  };

  const typeDigit = useCallback(d => {
    if (activeTool === 'digits') {
      if (selected != null) commit(setGiven(draft, selected, d));
      return;
    }
    if (selectedCage == null) return;
    const cur = draft.cages[selectedCage].sum;
    const fresh = freshSum.current || cur == null;
    if (d === 0 && fresh) return; // a total can't start with 0
    let sum = fresh ? d : cur * 10 + d;
    if (sum > 45) {
      if (d === 0) return; // 50 isn't a total; keep the 5
      sum = d;             // otherwise start over from the new digit
    }
    freshSum.current = false;
    commit(setCageSum(draft, selectedCage, sum));
  }, [activeTool, selected, selectedCage, draft, commit]);

  const backspace = useCallback(() => {
    if (activeTool === 'digits') {
      if (selected != null) commit(setGiven(draft, selected, 0));
      return;
    }
    if (selectedCage == null) return;
    const cur = draft.cages[selectedCage].sum;
    freshSum.current = false;
    commit(setCageSum(draft, selectedCage, cur != null && cur >= 10 ? Math.floor(cur / 10) : null));
  }, [activeTool, selected, selectedCage, draft, commit]);

  const deleteCage = useCallback(() => {
    if (selectedCage == null) return;
    commit(removeCage(draft, selectedCage));
    setSelectedCage(null);
  }, [selectedCage, draft, commit]);

  // Keyboard: 1–9 type (and 0 in cage totals), Backspace clears, Delete removes a cage, arrows/WASD
  // move, Space switches tools, Esc deletes the selected cage (or clears the
  // selection), Ctrl/Cmd+Z undoes.
  useEffect(() => {
    if (aligning) return undefined;
    const onKey = ev => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault(); undo(); return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName ?? '')) return;
      const move = MOVES[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
      if (/^[1-9]$/.test(ev.key) || (ev.key === '0' && activeTool === 'cages')) typeDigit(Number(ev.key));
      else if (ev.key === 'Backspace' || ev.key === '0') backspace();
      else if (ev.key === 'Delete') (activeTool === 'cages' && selectedCage != null ? deleteCage() : backspace());
      else if (ev.key === 'Escape') {
        if (activeTool === 'cages' && selectedCage != null) deleteCage();
        else setSelected(null);
      }
      else if (ev.key === ' ' && killer) {
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        setTool(t => (t === 'cages' ? 'digits' : 'cages'));
      } else if (move) {
        const [dr, dc] = move;
        const next = selected == null ? 40 : ((rowOf(selected) + dr + 9) % 9) * 9 + (colOf(selected) + dc + 9) % 9;
        setSelected(next);
        if (activeTool === 'cages') { setSelectedCage(cageOf[next] >= 0 ? cageOf[next] : null); freshSum.current = true; }
      } else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aligning, undo, typeDigit, backspace, deleteCage, activeTool, selected, selectedCage, cageOf, killer]);

  // ── Toolbar actions ──
  const changeKind = k => {
    if (k === draft.kind) return;
    commit({ ...draft, kind: k });
    setTool(k === 'killer' ? 'cages' : 'digits');
    setSelectedCage(null);
  };

  const startNew = () => {
    if (!okToDiscard()) return;
    replaceDraft(emptyDraft(draft.kind));
    setNotice(null);
  };

  // The background photo is independent of the puzzle: it stays until it's
  // changed or removed.
  const closeAlign = useCallback(() => setAligning(false), []);
  const applyPhoto = dataUrl => {
    setAligning(false);
    setPhoto(dataUrl);
    setShowPhoto(true);
  };

  const save = () => {
    if (check.status !== 'unique') return;
    const id = editingId ?? newId();
    const record = toRecord(draft, check.solution, { id, now: Date.now() });
    const next = [record, ...records.filter(r => r.id !== id)];
    setRecords(next);
    saveCustom(next);
    setEditingId(id);
    setDirty(false);
    setNotice({ text: 'Saved. It’s under Custom in the puzzle select.', good: true });
  };

  // Publishing re-checks everything on the server (one solution, not already
  // published), so this only needs to report what it says.
  const publish = async () => {
    const key = puzzleKey;
    setPublished({ key, status: 'publishing' });
    try {
      const res = await fetch('/api/sudoku/puzzles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: draft.kind, difficulty, ...solverInput(draft), name: draft.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPublished({ key, status: 'done', puzzle: data.puzzle });
      else setPublished({ key, status: res.status === 409 ? 'duplicate' : 'error', puzzle: data.puzzle, error: data.error ?? 'Couldn’t publish.' });
    } catch {
      setPublished({ key, status: 'error', error: 'Couldn’t reach the server. Check your connection and try again.' });
    }
  };

  const edit = r => {
    if (r.id === editingId && !dirty) return;
    if (!okToDiscard()) return;
    replaceDraft(fromRecord(r), r.id);
    setNotice(null);
  };

  const remove = r => {
    if (!window.confirm(`Delete “${r.name || `Untitled ${kindLabel(r.kind).toLowerCase()}`}”? This can’t be undone.`)) return;
    const next = records.filter(x => x.id !== r.id);
    setRecords(next);
    saveCustom(next);
    if (r.id === editingId) { setEditingId(null); setDirty(true); }
  };

  const shownIssues = issues.slice(0, MAX_ISSUES);
  const cage = selectedCage != null ? draft.cages[selectedCage] : null;
  const hint = activeTool === 'cages'
    ? 'Drag across cells to draw a cage, then type its total. Click a cage to select it; Esc deletes it. Totals show in the middle of each cage here, and in the top-left corner when you play.'
    : 'Click a cell and type a starting digit. Backspace clears it.';

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Puzzle editor</h2>
        <div className={s.headerActions}>
          <Link href="/sudoku" className={s.iconBtn}>Puzzles</Link>
        </div>
      </div>

      <div className={e.toolbar}>
        <div className={e.toolbarRow}>
          <Segmented label="Puzzle type" options={KINDS} value={draft.kind} onChange={changeKind} />
          {killer && <Segmented label="Tool" options={TOOLS} value={tool} onChange={setTool} />}
        </div>
        <div className={e.toolbarRow}>
          <button type="button" className={s.btn} onClick={() => setAligning(true)}>{photo ? 'Change photo' : 'Add photo'}</button>
          <button type="button" className={s.btn} onClick={startNew}>New</button>
        </div>
      </div>

      <p className={e.hintText}>{hint}</p>

      <EditorBoard
        draft={draft}
        selected={selected}
        selectedCage={activeTool === 'cages' ? selectedCage : null}
        drawing={drawing}
        errorCells={errorCells}
        hintCells={hintCells}
        photo={photo && showPhoto ? photo : null}
        photoOpacity={photoOpacity}
        onDown={onDown}
        onMove={onMove}
        onUp={onUp}
      />

      {photo && (
        <div className={e.photoControls}>
          <label>
            <input type="checkbox" checked={showPhoto} onChange={ev => setShowPhoto(ev.target.checked)} />
            Show photo
          </label>
          <label>
            Strength
            <input
              type="range" min={0.15} max={1} step={0.05}
              value={photoOpacity}
              disabled={!showPhoto}
              onChange={ev => setPhotoOpacity(Number(ev.target.value))}
            />
          </label>
          <button type="button" className={s.inlineBtn} onClick={() => setPhoto(null)}>Remove photo</button>
        </div>
      )}

      {/* Cage totals need a 0 (10, 20, …); starting digits don't. */}
      <div className={s.pad} style={activeTool === 'cages' ? { gridTemplateColumns: 'repeat(10, 1fr)' } : undefined}>
        {(activeTool === 'cages' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).map(d => (
          <button key={d} type="button" className={s.padBtn} onClick={() => typeDigit(d)}>{d}</button>
        ))}
      </div>

      {activeTool === 'cages' && cage && (
        <div className={e.cagePanel}>
          <span>{cage.cells.length}-cell cage</span>
          <label className={e.sumField}>
            Total
            <input
              type="number" min={1} max={45} inputMode="numeric"
              value={cage.sum ?? ''}
              onChange={ev => commit(setCageSum(draft, selectedCage, ev.target.value === '' ? null : Number(ev.target.value)))}
            />
          </label>
          <button type="button" className={s.btn} onClick={deleteCage}>Delete cage</button>
        </div>
      )}
      {activeTool === 'digits' && selected != null && (
        <div className={e.cagePanel}>
          <span>Row {rowOf(selected) + 1}, column {colOf(selected) + 1}</span>
          <button type="button" className={s.btn} onClick={backspace}>Clear digit</button>
        </div>
      )}

      <div className={e.panel}>
        {shownIssues.length > 0 && (
          <ul className={e.issues}>
            {shownIssues.map((x, k) => <li key={k}>{x.message}</li>)}
            {issues.length > MAX_ISSUES && <li className={e.more}>and {issues.length - MAX_ISSUES} more</li>}
          </ul>
        )}
        <CheckStatus ready={ready} check={check} />
        {notice && <p className={cx(e.status, notice.good && e.status_good)}>{notice.text}</p>}

        <div className={e.saveRow}>
          <button
            type="button"
            className={s.btn}
            onClick={check.check}
            disabled={!ready || check.status !== 'idle'}
          >
            Check solution
          </button>
          <input
            className={e.nameInput}
            placeholder="Name (optional)"
            maxLength={40}
            value={draft.name}
            onChange={ev => { setDraft({ ...draft, name: ev.target.value }); setDirty(true); }}
          />
          <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={save} disabled={check.status !== 'unique' || (!dirty && !!editingId)}>
            {editingId ? 'Save changes' : 'Save puzzle'}
          </button>
          {/* Plain links: a full load guarantees the puzzle page sees ?play= on mount. */}
          {editingId && !dirty && <a href={`/sudoku?play=${editingId}`} className={s.btn}>Play it</a>}
        </div>

        <div className={e.publishRow}>
          <span className={e.publishLabel}>Publish for everyone as</span>
          <select
            className={e.select}
            aria-label="Difficulty"
            value={difficulty}
            onChange={ev => setDifficulty(ev.target.value)}
          >
            {DIFFICULTIES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button
            type="button"
            className={s.btn}
            onClick={publish}
            disabled={check.status !== 'unique' || pub?.status === 'publishing' || pub?.status === 'done'}
          >
            {pub?.status === 'publishing' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
        {pub?.status === 'done' && (
          <p className={cx(e.status, e.status_good)}>
            Published as {placeLabel(pub.puzzle)}.{' '}
            <a href={`/sudoku?play=${pub.puzzle.id}`} className={s.inlineBtn}>Play it</a>
          </p>
        )}
        {pub?.status === 'duplicate' && (
          <p className={cx(e.status, e.status_warn)}>
            {pub.puzzle ? <>This puzzle is already published, as {placeLabel(pub.puzzle)}.{' '}
              <a href={`/sudoku?play=${pub.puzzle.id}`} className={s.inlineBtn}>Play it</a></> : pub.error}
          </p>
        )}
        {pub?.status === 'error' && <p className={cx(e.status, e.status_bad)}>{pub.error}</p>}
      </div>

      {records.length > 0 && (
        <div className={e.panel}>
          <div className={s.popoverLabel}>My puzzles</div>
          <ul className={e.records}>
            {records.map(r => (
              <li key={r.id} className={cx(e.record, r.id === editingId && e.recordActive)}>
                <span className={e.recordName}>{r.name || `Untitled ${kindLabel(r.kind).toLowerCase()}`}</span>
                <span className={e.recordKind}>{kindLabel(r.kind)}</span>
                <button type="button" className={s.inlineBtn} onClick={() => edit(r)}>Edit</button>
                <a href={`/sudoku?play=${r.id}`} className={s.inlineBtn}>Play</a>
                <button type="button" className={s.inlineBtn} onClick={() => remove(r)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aligning && <PhotoAlign onDone={applyPhoto} onClose={closeAlign} />}
    </div>
  );
}

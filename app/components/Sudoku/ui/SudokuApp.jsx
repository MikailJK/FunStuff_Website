"use client"
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { KINDS, DIFFICULTIES, CUSTOM, puzzlesFor, fromCustom } from '../puzzles.js';
import { createBoard, placeAnswer, toggleMark, eraseCell, isWrong, isSolved, cageIndex, boxOf } from '../engine/board.js';
import { encodeEntry, decodeEntry, hasProgress, entryStatus } from '../engine/serialize.js';
import { loadStore, saveStore, loadCustom } from '../storage.js';
import { Board } from './Board.jsx';
import { Segmented } from './Segmented.jsx';
import s from './sudoku.module.css';

const MODES = [
  { id: 'free', title: 'Free form', desc: 'Fill the grid however you like. Nothing is checked until you press Check answer.' },
  { id: 'auto', title: 'Auto answer checking', desc: 'Every answer is checked as you place it. Wrong ones turn red and count as a mistake.' },
];
const MODE_KEY = 'sudoku:checkMode';
const MOVES = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
};

const cx = (...names) => names.filter(Boolean).join(' ');
const noop = () => {};

function Settings({ mode, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    // Stop here so closing the menu with Esc doesn't also trigger the game's undo.
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className={s.settingsWrap} ref={ref}>
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className={s.popover} role="dialog" aria-label="Settings">
          <div className={s.popoverLabel}>Answer checking</div>
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              className={cx(s.option, m.id === mode && s.optionActive)}
              onClick={() => { onChange(m.id); setOpen(false); }}
            >
              <div className={s.optionTitle}>{m.title}</div>
              <div className={s.optionDesc}>{m.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SOLVED_MSG = { text: 'Solved. Nicely done!', good: true };
const UNDO_LIMIT = 500;

const BOX_CELLS = Array.from({ length: 9 }, (_, b) =>
  Array.from({ length: 9 }, (_, k) => (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (b % 3) * 3 + (k % 3)));

// A box counts as done once it holds 1–9 with no repeats. With checking on,
// every answer in it must also be right; with it off, nothing is given away.
function boxDone(values, b, solution, checked) {
  const cells = BOX_CELLS[b];
  if (new Set(cells.map(i => values[i]).filter(Boolean)).size !== 9) return false;
  return !checked || cells.every(i => values[i] === Number(solution[i]));
}

// Shown over the board the moment the puzzle is solved. Closes on ×, Esc, or a
// click anywhere outside it.
function SolvedPopup({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    const away = e => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  return (
    <div className={s.solvedScrim}>
      <div className={s.solvedCard} ref={ref} role="dialog" aria-label="Puzzle solved">
        <button type="button" className={cx(s.closeBtn, s.solvedClose)} onClick={onClose} aria-label="Close">×</button>
        <p className={s.solvedTitle}>Solved</p>
        <p className={s.solvedText}>Nicely done!</p>
      </div>
    </div>
  );
}

function Game({ puzzle, entry, onProgress, mode, pencil, setPencil, label, active, onRestart }) {
  // `entry` is only read on mount; the parent remounts Game per puzzle/restart.
  const [init] = useState(() => decodeEntry(puzzle, entry));
  const [board, setBoard] = useState(() => init?.board ?? createBoard(puzzle));
  const [selected, setSelected] = useState(null);
  const [mistakes, setMistakes] = useState(init?.mistakes ?? 0);
  // `solved` = ever solved (kept through a restart); `locked` = this board is
  // finished, so it takes no more changes.
  const [solved, setSolved] = useState(init?.solved ?? false);
  const [locked, setLocked] = useState(() => !!init?.solved && isSolved(init.board, puzzle.solution));
  const [message, setMessage] = useState(() => (locked ? SOLVED_MSG : null));
  const [popup, setPopup] = useState(false);
  const [pulses, setPulses] = useState([]);
  const pulseKey = useRef(0);

  const cageOf = useMemo(() => cageIndex(puzzle.cages), [puzzle]);

  // Switching modes clears any stale "check" result (but not "Solved").
  // (Compares against the last mode rather than skipping the first run, which
  // React's dev-mode double mount would defeat.)
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setMessage(m => (m === SOLVED_MSG ? m : null));
  }, [mode]);

  // Save after every change.
  useEffect(() => { onProgress(puzzle, board, { mistakes, solved }); }, [onProgress, puzzle, board, mistakes, solved]);

  const markSolved = useCallback(() => {
    setSolved(true);
    setLocked(true);
    setSelected(null);
    setMessage(SOLVED_MSG);
    setPopup(true);
  }, []);
  const closePopup = useCallback(() => setPopup(false), []);
  const endPulse = useCallback(key => setPulses(ps => ps.filter(p => p.key !== key)), []);

  // How many of each digit are on the board, to hide the pad keys that are used up.
  const counts = useMemo(() => {
    const out = new Array(10).fill(0);
    for (const v of board.values) out[v]++;
    return out;
  }, [board]);

  // Undo history for this session: previous boards plus the cell each change
  // touched. Undo restores the board only; mistakes and "solved" stay counted.
  const [history, setHistory] = useState([]);
  const commit = useCallback((next, cell) => {
    if (next === board) return false;
    setHistory(h => [...h.slice(-(UNDO_LIMIT - 1)), { board, cell }]);
    setBoard(next);
    setMessage(null);
    return true;
  }, [board]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || locked) return;
    setHistory(history.slice(0, -1));
    setBoard(last.board);
    setSelected(last.cell);
    setMessage(null);
  }, [history, locked]);

  const input = useCallback((d, asMark = pencil) => {
    if (locked || selected == null || board.givens[selected]) return;
    if (asMark) {
      commit(toggleMark(board, selected, d), selected);
      return;
    }
    if (board.values[selected] === d) return;
    const wrong = d !== Number(puzzle.solution[selected]);
    const cage = cageOf[selected] >= 0 ? puzzle.cages[cageOf[selected]].cells : [];
    // In auto-check mode a known-wrong answer leaves every pencil mark alone.
    const next = placeAnswer(board, selected, d, cage, { keepMarks: mode === 'auto' && wrong });
    if (!commit(next, selected)) return;
    const b = boxOf(selected);
    if (!boxDone(board.values, b, puzzle.solution, mode === 'auto') && boxDone(next.values, b, puzzle.solution, mode === 'auto')) {
      setPulses(ps => [...ps, { box: b, key: ++pulseKey.current }]);
    }
    if (mode === 'auto') {
      if (wrong) setMistakes(m => m + 1);
      if (isSolved(next, puzzle.solution)) markSolved();
    }
  }, [board, selected, pencil, mode, puzzle, cageOf, commit, markSolved, locked]);

  const erase = useCallback(() => {
    if (locked || selected == null) return;
    commit(eraseCell(board, selected), selected);
  }, [board, selected, commit, locked]);

  const check = () => {
    if (isSolved(board, puzzle.solution)) return markSolved();
    const empty = board.values.filter(v => !v).length;
    setMessage({
      text: empty
        ? `Not finished yet: ${empty} empty cell${empty === 1 ? '' : 's'} left.`
        : 'Not quite. Something in the grid is off.',
      good: false,
    });
  };

  // Keyboard: 1–9 enter (Shift+digit always pencils), Backspace/Delete/0 erase,
  // arrows or WASD move, Space toggles answer/pencil, Esc or Ctrl/Cmd+Z undoes.
  // Disabled while an overlay is open.
  useEffect(() => {
    if (!active) return;
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '')) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const move = MOVES[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (/^[1-9]$/.test(e.key) || (digit && e.shiftKey)) {
        input(Number(digit ? digit[1] : e.key), e.shiftKey || pencil);
        if (selected == null) return;
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        erase();
        if (selected == null) return;
      } else if (move) {
        if (locked) return;
        const [dr, dc] = move;
        setSelected(sel => sel == null ? 40 : ((((sel / 9) | 0) + dr + 9) % 9) * 9 + (sel % 9 + dc + 9) % 9);
      } else if (e.key === ' ') {
        // Keep Space from also scrolling the page or re-clicking a focused button.
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        setPencil(v => !v);
      } else if (e.key === 'Escape') {
        undo();
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, input, erase, undo, pencil, setPencil, selected, locked]);

  const wrongCells = useMemo(() => {
    const out = new Set();
    if (mode === 'auto') for (let i = 0; i < 81; i++) if (isWrong(board, i, puzzle.solution)) out.add(i);
    return out;
  }, [board, mode, puzzle]);

  return (
    <>
      <div className={s.infoRow}>
        <span>
          {label}
          <button type="button" className={s.inlineBtn} onClick={onRestart}>Restart</button>
        </span>
        {mode === 'auto' && (
          <span className={cx(s.mistakes, mistakes > 0 && s.mistakesSome)}>Mistakes: {mistakes}</span>
        )}
      </div>

      <div className={s.boardWrap}>
        <Board
          board={board}
          puzzle={puzzle}
          cageOf={cageOf}
          selected={selected}
          wrongCells={wrongCells}
          onSelect={locked ? noop : setSelected}
          pulses={pulses}
          onPulseEnd={endPulse}
          locked={locked}
        />
        {popup && <SolvedPopup onClose={closePopup} />}
      </div>

      <div className={s.pad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
          // In answer mode a digit with all nine placed leaves the pad (its slot
          // stays, so the other keys don't move). Pencil mode keeps every key.
          const used = !pencil && counts[d] >= 9;
          return (
            <button
              key={d}
              type="button"
              className={cx(s.padBtn, pencil && s.padPencil, used && s.padUsed)}
              onClick={() => input(d)}
              disabled={used || locked}
              aria-hidden={used || undefined}
              aria-label={pencil ? `Pencil mark ${d}` : `Enter ${d}`}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className={cx(s.controls, s.playControls)}>
        <Segmented
          label="Input mode"
          options={[{ id: 'answer', label: 'Answer' }, { id: 'pencil', label: 'Pencil' }]}
          value={pencil ? 'pencil' : 'answer'}
          onChange={v => setPencil(v === 'pencil')}
        />
        <button type="button" className={s.btn} onClick={undo} disabled={locked || !history.length} title="Undo (Esc or Ctrl+Z)">Undo</button>
        <button type="button" className={s.btn} onClick={erase} disabled={locked}>Erase</button>
        <button
          type="button"
          className={cx(s.btn, s.btnPrimary)}
          onClick={check}
          disabled={mode === 'auto' || locked}
          title={mode === 'auto' ? 'Answers are checked as you place them' : undefined}
        >
          {mode === 'auto' ? 'Checking as you go' : 'Check answer'}
        </button>
      </div>

      <p className={cx(s.message, message?.good && s.messageGood)} aria-live="polite">{message?.text}</p>
    </>
  );
}

const TABS = [...DIFFICULTIES, CUSTOM];

function PuzzleSelect({ current, puzzles, progress, custom, onPick, onClose }) {
  const [kind, setKind] = useState(current.kind);
  const [difficulty, setDifficulty] = useState(current.difficulty);
  const options = puzzlesFor(puzzles, kind, difficulty, custom);
  const isCustom = difficulty === CUSTOM.id;

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className={s.overlay} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Choose a puzzle">
        <div className={s.dialogHeader}>
          <h3 className={s.dialogTitle}>Choose a puzzle</h3>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={s.dialogSection}>
          <div className={s.popoverLabel}>Type</div>
          <Segmented label="Puzzle type" options={KINDS} value={kind} onChange={setKind} />
        </div>
        <div className={s.dialogSection}>
          <div className={s.popoverLabel}>Difficulty</div>
          <Segmented label="Difficulty" options={TABS} value={difficulty} onChange={setDifficulty} />
        </div>

        <div className={s.dialogSection}>
          <div className={s.popoverLabel}>Puzzle</div>
          <div className={s.tiles}>
            {options.map((p, i) => {
              const st = entryStatus(p, progress[p.id]);
              const isCurrent = p.id === current.id;
              const n = p.position ?? i + 1;
              const name = p.name || `Puzzle ${n}`;
              const state = [st.solved && 'solved', st.inProgress && 'in progress', isCurrent && 'current'].filter(Boolean);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={cx(s.tile, st.solved && s.tileSolved, isCurrent && s.tileCurrent)}
                  onClick={() => onPick(kind, difficulty, p.id)}
                  aria-label={`${name}${state.length ? ` (${state.join(', ')})` : ''}`}
                  title={p.name || undefined}
                >
                  {n}
                  {st.inProgress && <span className={s.tileDot} aria-hidden="true" />}
                </button>
              );
            })}
            {isCustom && (
              <Link href="/sudoku/editor" className={cx(s.tile, s.tileAdd)} aria-label="Make a new puzzle" title="Make a new puzzle">+</Link>
            )}
          </div>
          {isCustom && (
            <p className={s.dialogNote}>
              {options.length
                ? 'Puzzles you save in the editor live in this browser. Publish one there to add it to the list for everyone.'
                : 'Nothing here yet. Make one in the editor, from scratch or by tracing a photo.'}
            </p>
          )}
        </div>

        <div className={s.legend} aria-hidden="true">
          <span><span className={cx(s.legendSwatch, s.tileSolved)} />Solved</span>
          <span><span className={s.legendDot} />In progress</span>
        </div>
      </div>
    </div>
  );
}

/** The puzzle a choice points at, or null if it no longer exists. */
const resolve = (c, puzzles, custom) =>
  (c && puzzlesFor(puzzles, c.kind, c.difficulty, custom).find(p => p.id === c.id)) || null;

const choiceFor = p => ({ kind: p.kind, difficulty: p.difficulty, id: p.id });

/** The first easy killer, or failing that the first puzzle there is. */
const defaultChoice = puzzles =>
  choiceFor(puzzlesFor(puzzles, 'killer', 'easy')[0] ?? puzzles[0]);

/** @param {{ puzzles: object[] }} props  every published puzzle (see server/db.js) */
export default function SudokuApp({ puzzles }) {
  const fallback = useMemo(() => defaultChoice(puzzles), [puzzles]);
  const [choice, setChoice] = useState(fallback);
  const [custom, setCustom] = useState([]);
  const [store, setStore] = useState(null); // null until read from the browser
  const [picking, setPicking] = useState(true);
  const [mode, setMode] = useState('auto'); // check as you go, unless the player picked otherwise
  const [pencil, setPencil] = useState(false);
  const [restarts, setRestarts] = useState(0);

  const puzzle = resolve(choice, puzzles, custom) ?? resolve(fallback, puzzles, custom);
  const { kind, difficulty } = puzzle;

  // Load saved progress, custom puzzles and settings once, in the browser only.
  // A ?play=<id> link (from the editor) opens that puzzle straight away.
  useEffect(() => {
    const loaded = loadStore();
    const mine = loadCustom().map(fromCustom);
    const playId = new URLSearchParams(window.location.search).get('play');
    const played = playId && (mine.find(p => p.id === playId) ?? puzzles.find(p => p.id === playId));
    if (played) {
      setChoice(choiceFor(played));
      loaded.last = choiceFor(played);
      setPicking(false);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (resolve(loaded.last, puzzles, mine)) {
      setChoice(loaded.last);
    }
    setCustom(mine);
    setStore(loaded);
    try { const saved = localStorage.getItem(MODE_KEY); if (saved === 'free' || saved === 'auto') setMode(saved); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, with the puzzles the page was rendered with
  useEffect(() => { if (store) saveStore(store); }, [store]);

  const changeMode = m => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch {}
  };

  const onProgress = useCallback((p, board, meta) => {
    setStore(prev => {
      const progress = { ...prev.progress };
      if (hasProgress(board) || meta.solved) progress[p.id] = encodeEntry(p, board, meta);
      else delete progress[p.id];
      return { ...prev, progress };
    });
  }, []);

  const pickPuzzle = (k, d, id) => {
    if (id !== puzzle.id) {
      const next = { kind: k, difficulty: d, id };
      setChoice(next);
      setStore(prev => ({ ...prev, last: next }));
      setRestarts(0);
    }
    setPicking(false);
  };
  const closePicker = useCallback(() => setPicking(false), []);

  // Clears the board but remembers that the puzzle was solved before.
  const restart = () => {
    setStore(prev => {
      const progress = { ...prev.progress };
      const was = decodeEntry(puzzle, progress[puzzle.id]);
      if (was?.solved) progress[puzzle.id] = encodeEntry(puzzle, createBoard(puzzle), { solved: true });
      else delete progress[puzzle.id];
      return { ...prev, progress };
    });
    setRestarts(r => r + 1);
  };

  const n = puzzle.position ?? puzzlesFor(puzzles, kind, difficulty, custom).indexOf(puzzle) + 1;
  const label = [
    KINDS.find(k => k.id === kind).label,
    TABS.find(d => d.id === difficulty).label,
    puzzle.name || `Puzzle ${n}`,
  ].join(' · ');

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Sudoku</h2>
        <div className={s.headerActions}>
          <button type="button" className={s.iconBtn} onClick={() => setPicking(true)}>Puzzle select</button>
          <Link href="/sudoku/editor" className={s.iconBtn}>Editor</Link>
          <Settings mode={mode} onChange={changeMode} />
        </div>
      </div>

      {store ? (
        <Game
          key={`${puzzle.id}:${restarts}`}
          puzzle={puzzle}
          entry={store.progress[puzzle.id]}
          onProgress={onProgress}
          mode={mode}
          pencil={pencil}
          setPencil={setPencil}
          label={label}
          active={!picking}
          onRestart={restart}
        />
      ) : (
        <div className={s.board} aria-hidden="true" />
      )}

      {store && picking && (
        <PuzzleSelect
          current={{ kind, difficulty, id: puzzle.id }}
          puzzles={puzzles}
          progress={store.progress}
          custom={custom}
          onPick={pickPuzzle}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

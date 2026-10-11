import { useState, useRef, useCallback } from 'react';

// Working copy of a tile while it is being edited, with an undo/redo stack.
// A draft is { cells: string[] (one code per cell), paths, stamps, labels,
// seeds } — `seeds` counts void seeds planted and is not submitted.

const MAX_HISTORY = 100;

function fromBase(base) {
  return { cells: base.cells.split(''), paths: [...base.paths], stamps: [...base.stamps], labels: [...base.labels], seeds: 0 };
}

export const cloneDraft = d => ({ ...d, cells: d.cells.slice(), paths: d.paths.slice(), stamps: d.stamps.slice(), labels: d.labels.slice() });

export function useTileDraft(base) {
  const [draft, setDraftState] = useState(() => fromBase(base));
  const draftRef = useRef(draft);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [, bump] = useState(0);

  const set = useCallback(next => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  // Snapshot the current draft as one undo step (call at the start of a stroke).
  const begin = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-MAX_HISTORY + 1), draftRef.current];
    redoRef.current = [];
    bump(n => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(draftRef.current);
    set(prev);
    bump(n => n + 1);
  }, [set]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(draftRef.current);
    set(next);
    bump(n => n + 1);
  }, [set]);

  const reset = useCallback(() => {
    begin();
    set(fromBase(base));
  }, [base, begin, set]);

  return {
    draft, draftRef, set, begin, undo, redo, reset,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };
}

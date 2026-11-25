import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Checks in a Web Worker how many solutions the puzzle has, only when
 * `check()` is called. A result belongs to the exact puzzle that was
 * checked: any edit makes it stale (status back to 'idle') and stops a
 * check in flight.
 *
 * status: 'idle' | 'checking' | 'unique' | 'multiple' | 'none' | 'error'
 * For 'unique', `solution`; for 'multiple', `diff` = cells where two solutions differ.
 */
export function useSolverCheck(input, enabled) {
  const [result, setResult] = useState({ status: 'idle', key: null });
  const worker = useRef(null);
  const runId = useRef(0);
  const key = enabled ? JSON.stringify(input) : null;

  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
  };

  const check = useCallback(() => {
    if (!key) return;
    stop();
    const id = ++runId.current;
    const w = new Worker(new URL('../engine/solver.worker.js', import.meta.url));
    worker.current = w;
    setResult({ status: 'checking', key });
    w.onmessage = ev => {
      if (ev.data.id !== id) return;
      const { count, solutions } = ev.data;
      stop();
      if (count === 0) return setResult({ status: 'none', key });
      if (count === 1) return setResult({ status: 'unique', solution: solutions[0], key });
      const diff = [...Array(81).keys()].filter(i => solutions[0][i] !== solutions[1][i]);
      setResult({ status: 'multiple', diff, key });
    };
    w.onerror = () => { stop(); setResult({ status: 'error', key }); };
    w.postMessage({ id, ...JSON.parse(key), maxNodes: Infinity });
  }, [key]);

  const cancel = useCallback(() => {
    runId.current++;
    stop();
    setResult({ status: 'idle', key: null });
  }, []);

  // An edit abandons any check in flight.
  useEffect(() => { runId.current++; stop(); }, [key]);
  useEffect(() => () => stop(), []);

  const current = key && result.key === key ? result : { status: 'idle' };
  return { ...current, check, cancel };
}

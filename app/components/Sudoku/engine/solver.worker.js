// Runs the solver off the main thread so a hard puzzle can't freeze the page.
import { countSolutions } from './solver.js';

self.onmessage = e => {
  const { id, givens, cages, maxNodes } = e.data;
  const result = countSolutions({ givens, cages }, 2, maxNodes ?? Infinity);
  self.postMessage({ id, ...result });
};

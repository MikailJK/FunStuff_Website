// Parsers for the UvA-KR16/KilerSudoku data format.
//
// A `.killer` file has one cage per line:
//   11=(0, 5),6+(0, 4),5
//   <sum>=<cell>[,<value>]+<cell>[,<value>]...
// Cells are (row, col), zero-indexed. The per-cell values (the solution digit)
// appear in the published data files but not in the generator's own output, so
// they are optional here.
//
// A `.ans` file is the solved grid, one Python-style list per row:
//   [1, 2, 3, 4, 5, 6, 7, 8, 9]

const CELL_RE = /\(\s*(\d)\s*,\s*(\d)\s*\)(?:\s*,\s*(\d))?/g;

/** @returns {{ cages: {sum:number, cells:number[]}[], values: (number|null)[] }} */
export function parseKiller(text) {
  const cages = [];
  const values = new Array(81).fill(null);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error(`Bad cage line: ${line}`);
    const sum = Number(line.slice(0, eq));
    const cells = [];
    for (const m of line.slice(eq + 1).matchAll(CELL_RE)) {
      const i = Number(m[1]) * 9 + Number(m[2]);
      cells.push(i);
      if (m[3] !== undefined) values[i] = Number(m[3]);
    }
    if (!Number.isFinite(sum) || cells.length === 0) throw new Error(`Bad cage line: ${line}`);
    cages.push({ sum, cells });
  }
  return { cages, values };
}

/** @returns {string} 81-character solution string */
export function parseAns(text) {
  const digits = text.replace(/[^1-9]/g, '');
  if (digits.length !== 81) throw new Error(`Expected 81 digits, got ${digits.length}`);
  return digits;
}

// Tile coordinates: integer x grows east, y grows south. The first tile sits at
// 0,0. Labels follow Jerry Gretzinger's panel naming (N3/E2 etc.).

export const SIDES = ['top', 'right', 'bottom', 'left'];

export const SIDE_DELTA = {
  top:    [0, -1],
  right:  [1, 0],
  bottom: [0, 1],
  left:   [-1, 0],
};

export const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export const keyOf = (x, y) => `${x},${y}`;

export function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function neighborOf(x, y, side) {
  const [dx, dy] = SIDE_DELTA[side];
  return { x: x + dx, y: y + dy };
}

export function coordLabel(x, y) {
  const ns = y === 0 ? '0' : y < 0 ? `N${-y}` : `S${y}`;
  const ew = x === 0 ? '0' : x > 0 ? `E${x}` : `W${-x}`;
  return `${ns} / ${ew}`;
}

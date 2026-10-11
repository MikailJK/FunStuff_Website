// Deterministic randomness. Every random decision the engine makes is derived
// from the map seed plus stable keys (turn number, coordinates, a purpose
// string), so replaying the same action log always yields the same map — the
// property an online version needs for server-authoritative draws.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// rngFor(seed, 'offers', turn) → a generator unique to that purpose.
export function rngFor(seed, ...keys) {
  return mulberry32(hashString([seed, ...keys].join('|')));
}

// Stateless [0,1) hash of integer coordinates — used for per-cell decisions.
export function hash01(seed, a, b, c = 0) {
  let h = Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B);
  h = Math.imul(h ^ (a | 0), 0xC2B2AE35);
  h = Math.imul(h ^ (b | 0), 0x27D4EB2F);
  h = Math.imul(h ^ (c | 0), 0x165667B1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2C1B3C6D);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

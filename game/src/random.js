// A small seeded random number generator (mulberry32). The same seed always
// gives the same valley, the same ring course and the same screenshot scenes,
// which is what makes the staged frames repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise over a coarse grid, for hills that roll instead of spike. */
export function makeNoise2d(random, cells) {
  const grid = [];
  for (let i = 0; i < cells * cells; i += 1) grid.push(random());
  const at = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const wrap = (v) => ((v % cells) + cells) % cells;
    const g = (gx, gy) => grid[wrap(gy) * cells + wrap(gx)];
    const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
    const bottom = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  return at;
}

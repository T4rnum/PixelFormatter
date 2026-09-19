import type { Raster } from './core/types';

/** Original procedural artwork: an observatory on a floating island, no third-party assets. */
export function makeDemo(size = 1024, noisy = true): Raster {
  const side = 64, base = new Uint8ClampedArray(side * side * 4);
  const colors = ['#11152c', '#1e2241', '#313759', '#475773', '#547b85', '#7aa49a', '#b4cbb2', '#f1e2b8', '#d5ad72', '#a97154', '#704851', '#403451', '#8f8abd', '#b7ace0', '#dfcff5', '#e4b999'];
  const put = (x: number, y: number, c: number) => { if (x < 0 || x >= side || y < 0 || y >= side) return; const v = colors[c]; const i = (y * side + x) * 4; base.set([parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 255], i); };
  const rect = (x: number, y: number, w: number, h: number, c: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c); };
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) put(x, y, y < 28 ? 0 : 1);
  for (let n = 0; n < 48; n++) { const x = (n * 37 + 7) % 64, y = (n * 17 + 3) % 38; put(x, y, n % 5 === 0 ? 7 : 3); }
  for (let y = 7; y < 20; y++) for (let x = 45; x < 58; x++) if ((x - 51) ** 2 + (y - 13) ** 2 < 40 && (x - 54) ** 2 + (y - 10) ** 2 > 28) put(x, y, 14);
  rect(4, 30, 16, 2, 2); rect(7, 28, 9, 2, 2); rect(45, 33, 17, 2, 2);
  for (let y = 40; y < 59; y++) for (let x = 10; x < 55; x++) {
    const half = Math.max(1, 23 - (y - 40) * 1.2);
    if (Math.abs(x - 32) < half) put(x, y, y < 43 ? 4 : x < 30 ? (x % 7 < 3 ? 10 : 11) : (x % 9 < 4 ? 2 : 3));
  }
  rect(16, 39, 32, 3, 5); rect(20, 38, 26, 2, 6); rect(28, 25, 14, 14, 8); rect(28, 26, 4, 13, 9); rect(41, 25, 2, 14, 10);
  rect(25, 24, 20, 3, 11); rect(27, 21, 16, 3, 12); rect(29, 18, 12, 3, 13); rect(32, 16, 6, 2, 14); rect(34, 14, 2, 3, 7);
  rect(35, 21, 4, 4, 2); rect(35, 21, 3, 1, 7); rect(33, 30, 5, 9, 10); rect(34, 31, 3, 8, 7); rect(35, 33, 2, 5, 15);
  rect(26, 39, 14, 2, 7); rect(24, 41, 14, 2, 8); rect(25, 43, 10, 2, 9);
  for (const [x, y] of [[18, 32], [47, 32], [13, 36]]) { rect(x, y, 2, 8, 10); rect(x - 2, y, 6, 3, 4); rect(x - 1, y - 2, 4, 3, 5); put(x, y - 3, 6); }
  rect(20, 42, 1, 5, 5); rect(44, 41, 1, 7, 4); put(44, 48, 5); put(33, 60, 12); put(34, 62, 3);
  let seed = 123456789;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, src = (Math.floor(y * side / size) * side + Math.floor(x * side / size)) * 4;
    const noise = noisy ? Math.floor(random() * 9) - 4 : 0;
    for (let c = 0; c < 3; c++) data[i + c] = base[src + c] + noise;
    if (noisy && random() < 0.004) for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, data[i + c] + 60);
    data[i + 3] = 255;
  }
  return { width: size, height: size, data };
}

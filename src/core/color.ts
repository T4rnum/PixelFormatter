import type { RGB } from './types';

const linear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function oklab([red, green, blue]: RGB): RGB {
  const r = linear(red),
    g = linear(green),
    b = linear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export const distance = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export const hex = (color: readonly number[]) =>
  '#' +
  color
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
export function fromHex(value: string): RGB {
  if (!/^#?[\da-f]{6}$/i.test(value)) throw new Error('palette');
  const text = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(text.slice(i, i + 2), 16)) as RGB;
}

/** Weighted median cut: repeated colors retain their population during splitting. */
export function medianCut(pixels: Uint8ClampedArray, limit: number): RGB[] {
  const histogram = new Map<number, number>();
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i + 3]) {
      const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  type Entry = { color: RGB; count: number };
  const entries: Entry[] = [...histogram].map(([k, count]) => ({
    color: [k >> 16, (k >> 8) & 255, k & 255],
    count,
  }));
  if (!entries.length) return [];
  const info = (box: Entry[]) => {
    const ranges = [0, 1, 2].map((c) => {
      let min = 255,
        max = 0;
      for (const e of box) {
        min = Math.min(min, e.color[c]);
        max = Math.max(max, e.color[c]);
      }
      return max - min;
    });
    const channel = ranges.indexOf(Math.max(...ranges));
    const count = box.reduce((sum, e) => sum + e.count, 0);
    return { channel, count, score: ranges[channel] * Math.sqrt(count) };
  };
  const boxes = [{ entries, ...info(entries) }];
  while (boxes.length < limit) {
    let index = -1,
      best = -1;
    boxes.forEach((b, i) => {
      if (b.entries.length > 1 && b.score > best) {
        best = b.score;
        index = i;
      }
    });
    if (index < 0) break;
    const box = boxes[index];
    box.entries.sort((a, b) => a.color[box.channel] - b.color[box.channel]);
    let total = 0,
      split = 0;
    while (split < box.entries.length - 1 && total < box.count / 2)
      total += box.entries[split++].count;
    const left = box.entries.slice(0, split),
      right = box.entries.slice(split);
    boxes.splice(index, 1, { entries: left, ...info(left) }, { entries: right, ...info(right) });
  }
  const result = boxes.map(
    (box) =>
      [0, 1, 2].map((c) =>
        Math.round(box.entries.reduce((sum, e) => sum + e.color[c] * e.count, 0) / box.count),
      ) as RGB,
  );
  return [...new Map(result.map((c) => [hex(c), c])).values()].sort(
    (a, b) => oklab(a)[0] - oklab(b)[0],
  );
}

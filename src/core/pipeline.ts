import { distance, medianCut, oklab } from './color';
import {
  validateSettings,
  type IndexedImage,
  type PaletteEdits,
  type Raster,
  type RGB,
  type RGBA,
  type Settings,
} from './types';

/** Coordinates in source pixels, shared by processing and grid overlay. */
export function geometry(source: Pick<Raster, 'width' | 'height'>, s: Settings) {
  const ratio =
    (s.fit === 'contain' ? Math.min : Math.max)(s.width / source.width, s.height / source.height) *
    s.scale;
  return {
    step: 1 / ratio,
    x: source.width / 2 - s.width / (2 * ratio) + (s.offsetX * source.width) / 100,
    y: source.height / 2 - s.height / (2 * ratio) + (s.offsetY * source.height) / 100,
  };
}

export function medianFilter(source: Raster, strength: number, threshold: number): Raster {
  if (!strength) return source;
  const data = new Uint8ClampedArray(source.data);
  const radius = strength;
  // Sliding channel histograms avoid sorting a neighborhood for every source pixel.
  for (let y = 0; y < source.height; y++) {
    const hist = [new Int32Array(256), new Int32Array(256), new Int32Array(256)];
    const cursor = [0, 0, 0],
      below = [0, 0, 0];
    let count = 0;
    const column = (x: number, sign: number) => {
      if (x < 0 || x >= source.width) return;
      for (let sy = Math.max(0, y - radius); sy <= Math.min(source.height - 1, y + radius); sy++) {
        const i = (sy * source.width + x) * 4;
        if (source.data[i + 3] < threshold) continue;
        count += sign;
        for (let c = 0; c < 3; c++) {
          const value = source.data[i + c];
          hist[c][value] += sign;
          if (value < cursor[c]) below[c] += sign;
        }
      }
    };
    for (let x = 0; x <= radius; x++) column(x, 1);
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      if (source.data[offset + 3] >= threshold) {
        const target = Math.floor(count / 2);
        for (let c = 0; c < 3; c++) {
          while (below[c] > target) {
            cursor[c]--;
            below[c] -= hist[c][cursor[c]];
          }
          while (below[c] + hist[c][cursor[c]] <= target) {
            below[c] += hist[c][cursor[c]];
            cursor[c]++;
          }
          data[offset + c] = cursor[c];
        }
      }
      column(x - radius, -1);
      column(x + radius + 1, 1);
    }
  }
  return { ...source, data };
}

export function resample(source: Raster, s: Settings): Uint8ClampedArray {
  const result = new Uint8ClampedArray(s.width * s.height * 4);
  const g = geometry(source, s);
  const read = (x: number, y: number) =>
    x < 0 || y < 0 || x >= source.width || y >= source.height
      ? -1
      : (Math.floor(y) * source.width + Math.floor(x)) * 4;
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const out = (y * s.width + x) * 4;
      const left = g.x + x * g.step,
        top = g.y + y * g.step;
      if (s.method === 'nearest' || g.step <= 1) {
        const i = read(left + g.step / 2, top + g.step / 2);
        if (i >= 0 && source.data[i + 3] >= s.alphaThreshold) {
          result.set(source.data.subarray(i, i + 3), out);
          result[out + 3] = 255;
        }
        continue;
      }
      // Exact area weights make fractional offsets stable; transparent/outside area counts toward coverage.
      let weight = 0;
      const sums = [0, 0, 0];
      const groups = new Map<number, { weight: number; sums: number[] }>();
      const right = left + g.step,
        bottom = top + g.step;
      for (
        let sy = Math.max(0, Math.floor(top));
        sy < Math.min(source.height, Math.ceil(bottom));
        sy++
      ) {
        const wy = Math.min(sy + 1, bottom) - Math.max(sy, top);
        for (
          let sx = Math.max(0, Math.floor(left));
          sx < Math.min(source.width, Math.ceil(right));
          sx++
        ) {
          const i = (sy * source.width + sx) * 4;
          if (source.data[i + 3] < s.alphaThreshold) continue;
          const w = wy * (Math.min(sx + 1, right) - Math.max(sx, left));
          weight += w;
          if (s.method === 'average') for (let c = 0; c < 3; c++) sums[c] += source.data[i + c] * w;
          else {
            // 5-bit buckets group small AI color variations without blending competing clusters.
            const key =
              ((source.data[i] >> 3) << 10) |
              ((source.data[i + 1] >> 3) << 5) |
              (source.data[i + 2] >> 3);
            let group = groups.get(key);
            if (!group) {
              group = { weight: 0, sums: [0, 0, 0] };
              groups.set(key, group);
            }
            group.weight += w;
            for (let c = 0; c < 3; c++) group.sums[c] += source.data[i + c] * w;
          }
        }
      }
      if (weight < (g.step * g.step) / 2 || weight === 0) continue;
      if (s.method === 'representative') {
        let best = { weight: 0, sums: [0, 0, 0] };
        for (const group of groups.values()) if (group.weight > best.weight) best = group;
        for (let c = 0; c < 3; c++) result[out + c] = Math.round(best.sums[c] / best.weight);
      } else for (let c = 0; c < 3; c++) result[out + c] = Math.round(sums[c] / weight);
      result[out + 3] = 255;
    }
  return result;
}

export function cleanIsolated(
  indices: Uint8Array,
  palette: RGBA[],
  width: number,
  height: number,
  strength: number,
) {
  const result = new Uint8Array(indices);
  if (!strength) return result;
  const labs = palette.map((c) => oklab(c.slice(0, 3) as RGB));
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        current = indices[i];
      if (!palette[current][3]) continue;
      const counts = new Map<number, number>();
      let same = false,
        transparent = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = indices[i + dy * width + dx];
          if (n === current) same = true;
          if (!palette[n][3]) transparent = true;
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      if (same || transparent) continue;
      const winner = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (
        winner[1] >= (strength === 1 ? 7 : 5) &&
        distance(labs[current], labs[winner[0]]) < (strength === 1 ? 0.025 : 0.08)
      )
        result[i] = winner[0];
    }
  return result;
}

export function summarize(image: Omit<IndexedImage, 'statistics'>, durationMs = 0): IndexedImage {
  const used = new Set<string>();
  let transparentPixels = 0;
  for (const index of image.indices) {
    if (image.palette[index][3]) used.add(image.palette[index].join(','));
    else transparentPixels++;
  }
  return { ...image, statistics: { usedColors: used.size, transparentPixels, durationMs } };
}

export function quantize(pixels: Uint8ClampedArray, s: Settings): IndexedImage {
  const colors = s.fixedPalette ?? medianCut(pixels, s.colors);
  const hasTransparent = pixels.some((v, i) => i % 4 === 3 && v === 0);
  const palette: RGBA[] = colors.map((c) => [...c, 255]);
  const transparentIndex = palette.length;
  if (hasTransparent || !palette.length) palette.push([0, 0, 0, 0]);
  const labs = colors.map(oklab),
    cache = new Map<number, number>();
  let indices = new Uint8Array(s.width * s.height);
  for (let p = 0; p < indices.length; p++) {
    const i = p * 4;
    if (!pixels[i + 3]) {
      indices[p] = transparentIndex;
      continue;
    }
    const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    let index = cache.get(key);
    if (index === undefined) {
      const lab = oklab([pixels[i], pixels[i + 1], pixels[i + 2]]);
      let best = Infinity;
      index = 0;
      labs.forEach((entry, j) => {
        const d = distance(lab, entry);
        if (d < best) {
          best = d;
          index = j;
        }
      });
      cache.set(key, index);
    }
    indices[p] = index;
  }
  indices = cleanIsolated(indices, palette, s.width, s.height, s.cleanup);
  return summarize({ width: s.width, height: s.height, indices, palette });
}

/** One-entry stage caches keep memory bounded and avoid resampling on palette changes. */
export function createProcessor() {
  let previousSource: Raster | null = null;
  let filterKey = '',
    sampleKey = '';
  let filtered: Raster | null = null,
    sampled: Uint8ClampedArray | null = null;
  return (source: Raster, s: Settings): IndexedImage => {
    validateSettings(s);
    if (
      source.width < 1 ||
      source.height < 1 ||
      !Number.isInteger(source.width) ||
      !Number.isInteger(source.height) ||
      source.width * source.height > 16_000_000 ||
      source.data.length !== source.width * source.height * 4
    )
      throw new Error('imageSize');
    const start = performance.now();
    if (source !== previousSource) {
      filtered = null;
      sampled = null;
      previousSource = source;
    }
    const fk = JSON.stringify([s.median, s.alphaThreshold]);
    if (!filtered || fk !== filterKey) {
      filtered = medianFilter(source, s.median, s.alphaThreshold);
      filterKey = fk;
      sampled = null;
    }
    const sk = JSON.stringify([
      s.width,
      s.height,
      s.fit,
      s.offsetX,
      s.offsetY,
      s.scale,
      s.method,
      s.alphaThreshold,
    ]);
    if (!sampled || sk !== sampleKey) {
      sampled = resample(filtered, s);
      sampleKey = sk;
    }
    const result = quantize(sampled, s);
    result.statistics.durationMs = performance.now() - start;
    return result;
  };
}
export const processImage = (source: Raster, settings: Settings) =>
  createProcessor()(source, settings);

export function applyEdits(image: IndexedImage, edits: PaletteEdits): IndexedImage {
  const palette: RGBA[] = image.palette.map((c, i) =>
    edits.colors[i] && c[3] ? [...edits.colors[i], 255] : [...c],
  );
  const resolve = (index: number) => {
    const visited = new Set<number>();
    while (edits.merges[index] !== undefined && !visited.has(index)) {
      visited.add(index);
      index = edits.merges[index];
    }
    if (!palette[index]) throw new Error('palette');
    return index;
  };
  const indices = image.indices.map(resolve);
  // Preserve stable palette indices for editing and undo; merged entries remain unused.
  return summarize({ ...image, palette, indices }, image.statistics.durationMs);
}

export function toRGBA(image: IndexedImage): Uint8ClampedArray {
  const data = new Uint8ClampedArray(image.indices.length * 4);
  image.indices.forEach((index, i) => data.set(image.palette[index], i * 4));
  return data;
}

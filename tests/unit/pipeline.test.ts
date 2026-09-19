import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  cleanIsolated,
  createProcessor,
  geometry,
  medianFilter,
  processImage,
  toRGBA,
} from '../../src/core/pipeline';
import { DEFAULT_SETTINGS as defaults, type Raster, type RGBA } from '../../src/core/types';
import { makeDemo } from '../../src/demo';

const raster = (width: number, height: number, pixel: (x: number, y: number) => RGBA): Raster => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
};
describe('image pipeline', () => {
  it('reduces 1024 to 64 deterministically with a bounded palette', () => {
    const source = makeDemo();
    const image = processImage(source, defaults);
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(image.indices).toHaveLength(4096);
    expect(image.statistics.usedColors).toBeLessThanOrEqual(32);
    expect(image.indices).toEqual(processImage(source, defaults).indices);
  });
  it('preserves aligned pixel art exactly', () => {
    const source = makeDemo(1024, false),
      expected = makeDemo(64, false);
    expect(toRGBA(processImage(source, defaults))).toEqual(expected.data);
  });
  it('fits a rectangular source with transparent padding and crops without stretching', () => {
    const source = raster(8, 4, () => [255, 0, 0, 255]);
    const fit = processImage(source, { ...defaults, width: 4, height: 4 });
    expect(fit.statistics.transparentPixels).toBe(8);
    const crop = processImage(source, { ...defaults, width: 4, height: 4, fit: 'cover' });
    expect(crop.statistics.transparentPixels).toBe(0);
    expect(geometry(source, { ...defaults, width: 4, height: 4, fit: 'cover' })).toEqual({
      step: 1,
      x: 2,
      y: 0,
    });
  });
  it('keeps transparent RGB out of averages and quantization', () => {
    const source = raster(2, 2, (x) => (x ? [0, 255, 0, 0] : [255, 0, 0, 255]));
    const image = processImage(source, { ...defaults, width: 1, height: 1, method: 'average' });
    expect([...toRGBA(image)]).toEqual([255, 0, 0, 255]);
  });
  it('supports fully transparent images and threshold extremes', () => {
    const source = raster(4, 4, () => [200, 100, 20, 0]);
    const image = processImage(source, { ...defaults, width: 4, height: 4, alphaThreshold: 1 });
    expect(image.palette).toEqual([[0, 0, 0, 0]]);
    expect(image.statistics.usedColors).toBe(0);
    expect(image.statistics.transparentPixels).toBe(16);
    const edge = raster(2, 1, (x) => [40, 50, 60, x ? 255 : 254]);
    expect(
      processImage(edge, { ...defaults, width: 2, height: 1, alphaThreshold: 255 }).statistics
        .transparentPixels,
    ).toBe(1);
  });
  it('reserves one transparency entry alongside 255 opaque colors', () => {
    const source = raster(256, 1, (x) => [x, 0, 0, x === 255 ? 0 : 255]);
    const image = processImage(source, { ...defaults, width: 256, height: 1, colors: 255 });
    expect(image.palette).toHaveLength(256);
    expect(image.statistics.usedColors).toBe(255);
    expect(image.indices[255]).toBe(255);
  });
  it('maps only to imported palette colors, including a one-color palette', () => {
    const image = processImage(makeDemo(64), { ...defaults, fixedPalette: [[250, 0, 0]] });
    expect(image.statistics.usedColors).toBe(1);
    expect(image.palette).toEqual([[250, 0, 0, 255]]);
  });
  it('uses area majority instead of a noisy center sample', () => {
    const source = raster(4, 4, (x, y) =>
      x === 2 && y === 2 ? [0, 255, 0, 255] : [255, 0, 0, 255],
    );
    const settings = { ...defaults, width: 1, height: 1 };
    expect([...toRGBA(processImage(source, settings))]).toEqual([255, 0, 0, 255]);
    expect([...toRGBA(processImage(source, { ...settings, method: 'nearest' }))]).toEqual([
      0, 255, 0, 255,
    ]);
  });
  it('handles fractional offsets and out-of-image sampling', () => {
    const source = raster(4, 4, () => [255, 0, 0, 255]);
    const image = processImage(source, { ...defaults, width: 2, height: 2, offsetX: 100 });
    expect(image.statistics.transparentPixels).toBe(4);
    expect(
      processImage(source, { ...defaults, width: 2, height: 2, offsetX: 12.5 }).indices,
    ).toHaveLength(4);
  });
  it('median filtering suppresses impulse noise without changing alpha', () => {
    const source = raster(3, 3, (x, y) =>
      x === 1 && y === 1 ? [255, 255, 255, 255] : [20, 20, 20, 255],
    );
    expect(medianFilter(source, 1, 128).data[16]).toBe(20);
  });
  it('isolated cleanup preserves the alpha silhouette and connected details', () => {
    const palette: RGBA[] = [
      [100, 100, 100, 255],
      [120, 120, 120, 255],
      [0, 0, 0, 0],
    ];
    const indices = new Uint8Array(9);
    indices[4] = 1;
    expect(cleanIsolated(indices, palette, 3, 3, 1)[4]).toBe(0);
    indices[0] = 2;
    expect(cleanIsolated(indices, palette, 3, 3, 2)).toEqual(indices);
    indices[0] = 0;
    indices[1] = 1;
    expect(cleanIsolated(indices, palette, 3, 3, 2)[4]).toBe(1);
  });
  it('sliding median matches a direct reference near transparent edges', () => {
    const source = raster(11, 9, (x, y) => [
      (x * 97 + y * 53) % 256,
      (x * 13 + y * 121) % 256,
      (x * y * 41) % 256,
      (x + y) % 3 ? 255 : 0,
    ]);
    for (const radius of [1, 2]) {
      const filtered = medianFilter(source, radius, 128);
      for (let y = 0; y < source.height; y++)
        for (let x = 0; x < source.width; x++) {
          const index = (y * source.width + x) * 4;
          if (!source.data[index + 3]) {
            expect([...filtered.data.subarray(index, index + 4)]).toEqual([
              ...source.data.subarray(index, index + 4),
            ]);
            continue;
          }
          for (let c = 0; c < 3; c++) {
            const values: number[] = [];
            for (
              let sy = Math.max(0, y - radius);
              sy <= Math.min(source.height - 1, y + radius);
              sy++
            )
              for (
                let sx = Math.max(0, x - radius);
                sx <= Math.min(source.width - 1, x + radius);
                sx++
              ) {
                const i = (sy * source.width + sx) * 4;
                if (source.data[i + 3]) values.push(source.data[i + c]);
              }
            values.sort((a, b) => a - b);
            expect(filtered.data[index + c]).toBe(values[Math.floor(values.length / 2)]);
          }
        }
    }
  });
  it('applies chained merges and edits while preserving stable indices and the original', () => {
    const source = raster(3, 1, (x) => [x * 100, 0, 0, 255]);
    const image = processImage(source, { ...defaults, width: 3, height: 1, colors: 3 });
    const edited = applyEdits(image, { colors: { 2: [0, 0, 255] }, merges: { 0: 1, 1: 2 } });
    expect([...edited.indices]).toEqual([2, 2, 2]);
    expect(edited.statistics.usedColors).toBe(1);
    expect(edited.palette[2]).toEqual([0, 0, 255, 255]);
    expect(image.statistics.usedColors).toBe(3);
  });
  it('stage caches invalidate for changed settings and new sources', () => {
    const process = createProcessor(),
      source = makeDemo(64);
    process(source, defaults);
    const settings = { ...defaults, colors: 8, width: 32, offsetX: 2 };
    expect(process(source, settings).indices).toEqual(processImage(source, settings).indices);
    const other = raster(64, 64, () => [255, 0, 0, 255]);
    expect(process(other, settings).palette).toEqual(processImage(other, settings).palette);
  });
  it('rejects invalid sizes and palette limits', () => {
    const source = makeDemo(8);
    for (const patch of [
      { width: 0 },
      { width: 513 },
      { colors: 256 },
      { scale: NaN },
      { fixedPalette: [] },
    ])
      expect(() => processImage(source, { ...defaults, ...patch })).toThrow();
  });
});

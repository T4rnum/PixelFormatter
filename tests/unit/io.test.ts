import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { encodePNG } from '../../src/io/png';
import { exportPalette, parsePalette } from '../../src/io/palette';
import { applyEdits, processImage, toRGBA } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { makeDemo } from '../../src/demo';

describe('indexed PNG', () => {
  it('independently decodes exactly like the edited preview, including transparency', () => {
    const raw = processImage(makeDemo(64), { ...DEFAULT_SETTINGS, offsetX: 12 });
    const image = applyEdits(raw, { colors: { 0: [255, 0, 120] }, merges: { 1: 0 } });
    const bytes = encodePNG(image),
      decoded = PNG.sync.read(Buffer.from(bytes));
    expect(bytes[25]).toBe(3);
    expect(bytes[24]).toBe(8);
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(64);
    expect([...decoded.data]).toEqual([...toRGBA(image)]);
  });
  it('writes enlarged copies as exact square blocks without adding colors', () => {
    const image = processImage(makeDemo(64), { ...DEFAULT_SETTINGS, width: 8, height: 8 });
    const decoded = PNG.sync.read(Buffer.from(encodePNG(image, 4)));
    expect(decoded.width).toBe(32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        expect([...decoded.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)]).toEqual(
          image.palette[image.indices[Math.floor(y / 4) * 8 + Math.floor(x / 4)]],
        );
  });
  it('encodes fully transparent and maximum palette images', () => {
    for (const count of [1, 256]) {
      const palette = Array.from(
        { length: count },
        (_, i) => [i, 0, 0, i === count - 1 ? 0 : 255] as [number, number, number, number],
      );
      const image = {
        width: count,
        height: 1,
        indices: Uint8Array.from({ length: count }, (_, i) => i),
        palette,
        statistics: { usedColors: count - 1, transparentPixels: 1, durationMs: 0 },
      };
      expect([...PNG.sync.read(Buffer.from(encodePNG(image))).data]).toEqual([...toRGBA(image)]);
    }
  });
});
describe('palette files', () => {
  it('imports HEX with optional hashes and exports it losslessly', () => {
    const colors = parsePalette('\uFEFF#ff0077\r\n00aa00\n#ff0077\n');
    expect(colors).toEqual([
      [255, 0, 119],
      [0, 170, 0],
    ]);
    expect(parsePalette(exportPalette(colors))).toEqual(colors);
  });
  it('imports GPL names and comments', () =>
    expect(
      parsePalette('GIMP Palette\nName: Test\nColumns: 2\n# comment\n255 0 32 Red\n0 0 0\n'),
    ).toEqual([
      [255, 0, 32],
      [0, 0, 0],
    ]));
  it('rejects empty, oversized and malformed palettes without silent truncation', () => {
    for (const text of [
      '',
      '#12345',
      'GIMP Palette\n256 0 0',
      Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(6, '0')).join('\n'),
    ])
      expect(() => parsePalette(text)).toThrow('palette');
  });
});

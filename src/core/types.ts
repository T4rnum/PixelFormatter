export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export interface Raster { width: number; height: number; data: Uint8ClampedArray }
export interface Settings {
  width: number;
  height: number;
  fit: 'contain' | 'cover';
  offsetX: number;
  offsetY: number;
  scale: number;
  method: 'representative' | 'nearest' | 'average';
  median: number;
  cleanup: number;
  colors: number;
  alphaThreshold: number;
  fixedPalette: RGB[] | null;
}
export interface IndexedImage {
  width: number;
  height: number;
  indices: Uint8Array;
  palette: RGBA[];
  statistics: { usedColors: number; transparentPixels: number; durationMs: number };
}
export interface PaletteEdits { colors: Record<number, RGB>; merges: Record<number, number> }
export const DEFAULT_SETTINGS: Settings = {
  width: 64, height: 64, fit: 'contain', offsetX: 0, offsetY: 0, scale: 1,
  method: 'representative', median: 0, cleanup: 0, colors: 32,
  alphaThreshold: 128, fixedPalette: null,
};
export const EMPTY_EDITS: PaletteEdits = { colors: {}, merges: {} };

export function validateSettings(s: Settings) {
  for (const value of [s.width, s.height]) if (!Number.isInteger(value) || value < 1 || value > 512) throw new Error('dimensions');
  if (!Number.isInteger(s.colors) || s.colors < 1 || s.colors > 255) throw new Error('colors');
  if (!Number.isFinite(s.scale) || s.scale < 0.25 || s.scale > 4) throw new Error('scale');
  if (![s.offsetX, s.offsetY].every(v => Number.isFinite(v) && Math.abs(v) <= 100)) throw new Error('offset');
  if (!Number.isInteger(s.alphaThreshold) || s.alphaThreshold < 1 || s.alphaThreshold > 255) throw new Error('alpha');
  if (![0, 1, 2].includes(s.median) || ![0, 1, 2].includes(s.cleanup)) throw new Error('filter');
  if (!['contain', 'cover'].includes(s.fit) || !['representative', 'nearest', 'average'].includes(s.method)) throw new Error('method');
  if (s.fixedPalette && (!s.fixedPalette.length || s.fixedPalette.length > 255 || s.fixedPalette.some(c => c.length !== 3 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255)))) throw new Error('palette');
}

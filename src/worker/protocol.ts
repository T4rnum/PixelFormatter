import type { IndexedImage, PaletteEdits, Raster, Settings } from '../core/types';
export type WorkerRequest =
  | { type: 'source'; source: Raster }
  | { type: 'process'; id: number; settings: Settings }
  | { type: 'export'; id: number; resultId: number; edits: PaletteEdits; scale: number };
export type WorkerResponse =
  | { type: 'result'; id: number; image: IndexedImage }
  | { type: 'export'; id: number; bytes: Uint8Array }
  | { type: 'error'; id: number; message: string };

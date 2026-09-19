import type { Raster } from '../core/types';

export async function decodeImage(file: File): Promise<Raster> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('fileType');
  if (file.size > 50_000_000) throw new Error('fileSize');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('decode'); }
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('imageSize');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('decode');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally { bitmap.close(); }
}

export function download(data: Uint8Array | string, filename: string, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

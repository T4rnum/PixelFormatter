import { zlibSync } from 'fflate';
import type { IndexedImage } from '../core/types';

const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12),
    view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(new TextEncoder().encode(name), 4);
  result.set(data, 8);
  view.setUint32(data.length + 8, crc32(result.subarray(4, data.length + 8)));
  return result;
}

/** Always writes PNG color type 3; never re-quantizes an edited palette. */
export function encodePNG(image: IndexedImage, scale = 1): Uint8Array {
  if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new Error('scale');
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > 512 ||
    image.height > 512 ||
    image.indices.length !== image.width * image.height
  )
    throw new Error('dimensions');
  if (
    !image.palette.length ||
    image.palette.length > 256 ||
    image.indices.some((i) => i >= image.palette.length)
  )
    throw new Error('palette');
  const width = image.width * scale,
    height = image.height * scale;
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 3;
  const palette = new Uint8Array(image.palette.flatMap((c) => c.slice(0, 3)));
  const alpha = new Uint8Array(image.palette.map((c) => c[3]));
  const rows = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rows[y * (width + 1) + 1 + x] =
        image.indices[Math.floor(y / scale) * image.width + Math.floor(x / scale)];
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', palette),
  ];
  if (alpha.some((a) => a < 255)) chunks.push(chunk('tRNS', alpha));
  chunks.push(chunk('IDAT', zlibSync(rows, { level: 6 })), chunk('IEND', new Uint8Array()));
  const result = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

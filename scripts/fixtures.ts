import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { makeDemo } from '../src/demo';
import { processImage } from '../src/core/pipeline';
import { DEFAULT_SETTINGS, type Raster } from '../src/core/types';
import { encodePNG } from '../src/io/png';

mkdirSync('public/examples', { recursive: true });
const write = (name: string, image: Raster) =>
  writeFileSync(
    `public/examples/${name}.png`,
    PNG.sync.write({
      width: image.width,
      height: image.height,
      data: Buffer.from(image.data),
    } as PNG),
  );
const noisy = makeDemo();
write('noisy-observatory', noisy);
write('aligned-observatory', makeDemo(1024, false));
writeFileSync(
  'public/examples/refined-observatory.png',
  encodePNG(processImage(noisy, DEFAULT_SETTINGS), 4),
);
writeFileSync(
  'public/examples/nearest-observatory.png',
  encodePNG(processImage(noisy, { ...DEFAULT_SETTINGS, method: 'nearest' }), 4),
);
const shifted = makeDemo(256, false),
  shiftedData = new Uint8ClampedArray(shifted.data.length);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) {
    const sx = x - 2,
      sy = y - 1;
    if (sx >= 0 && sy >= 0)
      shiftedData.set(
        shifted.data.subarray((sy * 256 + sx) * 4, (sy * 256 + sx) * 4 + 4),
        (y * 256 + x) * 4,
      );
  }
write('shifted-grid', { ...shifted, data: shiftedData });
const data = new Uint8ClampedArray(256 * 128 * 4);
for (let y = 0; y < 128; y++)
  for (let x = 0; x < 256; x++) {
    const thin = x === y || x === 64 || y === 64;
    data.set(thin ? [255, 255, 255, 255] : [x, y * 2, 100, x < 16 ? 0 : 255], (y * 256 + x) * 4);
  }
write('gradient-contours', { width: 256, height: 128, data });
writeFileSync(
  'public/examples/studio.hex',
  '#11152c\n#313759\n#547b85\n#7aa49a\n#b4cbb2\n#f1e2b8\n#a97154\n#704851\n#8f8abd\n#dfcff5\n',
);
console.log('Generated original fixtures and comparison images in public/examples.');

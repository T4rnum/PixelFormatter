import os from 'node:os';
import { createProcessor } from '../src/core/pipeline';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { makeDemo } from '../src/demo';

const image = makeDemo();
console.log(
  JSON.stringify({
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    node: process.version,
    input: '1024x1024',
    output: '64x64',
  }),
);
for (const median of [0, 1, 2]) {
  const timings: number[] = [];
  for (let run = 0; run < 5; run++)
    timings.push(createProcessor()(image, { ...DEFAULT_SETTINGS, median }).statistics.durationMs);
  timings.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      median,
      medianMs: Math.round(timings[2]),
      minMs: Math.round(timings[0]),
      maxMs: Math.round(timings[4]),
    }),
  );
}
const cached = createProcessor();
cached(image, DEFAULT_SETTINGS);
console.log(
  JSON.stringify({
    cachedPaletteChangeMs: Math.round(
      cached(image, { ...DEFAULT_SETTINGS, colors: 16 }).statistics.durationMs,
    ),
  }),
);

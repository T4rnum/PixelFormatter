# Architecture

PixelFormatter is a static browser application. There is no server-side image processing, database, user account, or paid API.

## Boundaries

| Module        | Responsibility                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `src/core`    | Pure, deterministic transforms on typed arrays; settings validation, geometry, quantization, index edits |
| `src/worker`  | Typed request/response protocol, stage caches, PNG encoding                                              |
| `src/io`      | Browser decode/download, palette parsing, indexed PNG serialization                                      |
| `src/ui`      | RU/EN copy, bounded history, worker coordination, synchronized canvas previews                           |
| `src/App.tsx` | Editor composition and user actions                                                                      |

`Raster` contains dimensions and an RGBA `Uint8ClampedArray`. `Settings` describes sampling, cleanup, alpha, and palette selection. `IndexedImage` contains dimensions, `Uint8Array` indices, an RGBA palette, and statistics. There is no public HTTP API.

## Sampling coordinates

The fit ratio is `min(outputWidth/sourceWidth, outputHeight/sourceHeight)` for contain, or `max(...)` for cover, multiplied by sampling scale. Each output cell spans `1/ratio` source pixels. Its origin is centered on the source, with offsets measured as percentages of source dimensions. Positive offsets move the sampling region right/down.

The original canvas and grid overlay use the exact same `geometry()` function as processing. Panning changes only the view, not the sampling region. Scaling and offsets change processing; output dimensions do not change unless explicitly edited.

## Pipeline

1. **Decode:** `createImageBitmap` applies image orientation; Canvas provides browser-normalized RGBA bytes. Validate format, compressed size, and decoded pixel count. Original bytes remain immutable.
2. **Median filter:** optional 3×3 or 5×5 channel median with sliding histograms. Neighbors below the alpha threshold are excluded; source alpha is preserved. It can remove intentional fine details, so it defaults to off.
3. **Sampling:** nearest-neighbor uses the cell center; average uses exact area weights; dominant-color uses 5-bit RGB buckets and chooses the most populous bucket's weighted mean. For enlargement, use the nearest source pixel. This is a deterministic approximation, not automatic grid detection.
4. **Alpha:** threshold before sampling. A cell needs at least 50% opaque area coverage; padding counts as transparent. Output alpha is 0 or 255.
5. **Palette:** weighted median cut repeatedly splits the RGB box with the highest range/population score at its weighted median. Box means form the palette. Fixed palettes bypass generation. Nearest-color assignment uses squared Euclidean distance in OKLab, cached per RGB color.
6. **Cleanup:** read from the unmodified index buffer and write to a new one. Replace isolated pixels only when enough neighbors agree and their perceptual difference is limited. Never alter alpha or pixels adjacent to transparency; connected lines remain untouched. This conservative heuristic can still remove deliberate isolated highlights.
7. **Edits:** RGB overrides and merge redirects apply to stable palette indices. No recoloring/quantization occurs during export. Locked-palette edits are baked into the fixed palette before the next transform. Automatic-palette edits reset on a transform change.

No dithering is applied: it can introduce patterns that resemble the noise this tool aims to remove.

## Responsiveness and ordering

React retains source pixels for original display, while the worker gets a structured clone on source change. The worker retains one source, one filtered raster, one sampled raster, and the latest indexed result. Filter caches depend on source identity, strength, and alpha threshold. Sampling caches also depend on geometry and method; palette-only changes reuse them.

Settings are debounced by 100 ms. The coordinator allows one active processing job and one pending latest job. Each request has a monotonic ID, and only the current source/settings result becomes exportable. New input invalidates readiness immediately by identity checks. Stale results are ignored; active synchronous work finishes before the newest pending job runs. This bounds queue growth but is not preemptive cancellation.

Loading files uses a separate generation counter, so a slow older decode cannot overwrite a newer file. During processing, the previous raster can remain visible with a processing badge. Edits are never applied to a stale base palette. Export and palette controls require a current result.

Export requests refer to the worker's exact result ID. The UI freezes changes during encoding and transfers the resulting PNG bytes back to the main thread. Worker failures surface in the UI. A fatal worker crash requires reload.

History stores up to 50 editor-state snapshots: settings and palette edits, not image buffers. Loading a new source clears history. Pan, zoom, and language are view preferences rather than history entries.

## Indexed PNG

The encoder writes the PNG signature, IHDR (8-bit, color type 3), PLTE, optional tRNS, IDAT, and IEND. Scanlines use PNG filter 0 and `fflate` zlib compression. Each chunk includes a CRC-32. Enlarged exports repeat indices; no colors are interpolated.

Tests decode the resulting file using the independent `pngjs` implementation and compare every RGBA pixel with the preview data. Canvas `toBlob()` is not used because it does not promise an indexed PNG.

References: [PNG specification](https://www.w3.org/TR/png-3/), [OKLab derivation](https://bottosson.github.io/posts/oklab/), [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).

## Deliberate tradeoffs

- TypeScript arrays and one worker keep the first implementation portable and inspectable; WASM/WebGPU are unnecessary at the measured default workload.
- RGB median cut is deterministic and compact, while final mapping uses OKLab. It is not a globally optimal perceptual palette.
- The browser performs initial decoding on the UI side. Processing and encoding run in the worker.
- Local-only does not mean an installed offline PWA: a deployed build still needs to load its static assets. There is no service worker in v0.1.

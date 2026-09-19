# Validation and release acceptance

## Local environment

- Windows 10, build 19045, x64
- AMD Ryzen 7 5700X
- Node.js 20.18.1
- Deterministic 1024 × 1024 noisy observatory fixture, output 64 × 64, 32 colors

`npm run benchmark` measures the processing core in Node, excluding browser decode, rendering, and the UI's 100 ms debounce. Each filter row is the median of five independent cold processor instances. Measurements vary with load.

| Source filter         | Median |     Observed range |
| --------------------- | -----: | -----------------: |
| Off                   |  31 ms |           30–51 ms |
| Gentle (3×3)          | 196 ms |         195–223 ms |
| Strong (5×5)          | 264 ms |         263–265 ms |
| Cached palette change |   1 ms | Single measurement |

The original per-pixel sort took approximately 1.26 s / 3.88 s for the two filters. Sliding histograms reduced this to the figures above. A direct-reference test verifies equivalent medians near transparent boundaries.

## Automated coverage

Unit tests independently verify dimensions, binary alpha, exact aligned-art reconstruction, fit/crop geometry, fractional offsets, dominant-color robustness to impulse noise, fixed and maximum palettes, chained merges, cache invalidation, palette-file validation, PNG color type, CRC/deflate decoding, and exact enlarged blocks.

Browser tests exercise the real module worker and download path: sample loading, actual PNG upload, HEX import, merge/edit/fixed-palette retention, undo/redo, grid overlay, localization, rapid settings, source replacement, and error recovery. A decoded exported file must reflect the latest source, not an older job.

## Manual quality acceptance before a stable release

The fixture suite proves implementation behavior, not artistic success on arbitrary inputs. The owner's representative AI-generated images have not yet been supplied.

For each real input, compare the nearest-neighbor baseline and tuned dominant-color result at equal resolution/palette budget. Inspect silhouette, thin outlines, isolated intentional highlights, color grouping, alpha edges, and overall recognizability. Record settings and both exports. Accept the stable release only after reviewing these examples with the owner.

v0.1.0 is therefore a working preview, not a claim of completed real-input artistic validation. Public demo hosting is a separate milestone.

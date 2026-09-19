# Contributing

Use Node.js 22+ and `npm ci`. Keep image processing independent of React and browser APIs; browser adapters belong in `src/io`, orchestration in the worker/UI layers.

Before opening a pull request, run:

```sh
npm run typecheck
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For algorithm changes, add a fixture that exposes the visual problem, compare against nearest-neighbor sampling, and include before/after images at the same dimensions and color budget. Add a focused regression test for the actual failure. Run `npm run benchmark` if processing cost changes.

Keep RU and EN strings in sync. New controls need accessible names, keyboard access, and disabled states during export. Test opaque and transparent inputs. Never introduce network uploads or analytics without an explicit product decision.

Make small commits with a descriptive prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). PR descriptions should explain the user-visible problem, final behavior, and validation. Do not commit local caches, source images without redistribution rights, secrets, or build output.

Report bugs with input dimensions, browser version, settings, expected behavior, and a minimal shareable sample. Avoid posting private images; generated test fixtures are welcome. Contributions are licensed under MIT.

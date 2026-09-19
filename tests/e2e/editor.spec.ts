import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';

test('sample, palette editing, undo, resizing, indexed export and RU interface', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Give every pixel a purpose.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/welcome.png', fullPage: true });
  await page.getByRole('button', { name: 'Try sample' }).click();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  await page.getByLabel('Selected color', { exact: true }).fill('#ff0088');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const file = await downloading,
    bytes = await readFile((await file.path())!);
  expect(bytes[25]).toBe(3);
  expect(PNG.sync.read(bytes).width).toBe(64);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Selected color', { exact: true })).not.toHaveValue('#ff0088');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Selected color', { exact: true })).toHaveValue('#ff0088');
  await page.getByRole('button', { name: '32 × 32', exact: true }).click();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('32');
  await page.getByRole('button', { name: 'Sampling grid', exact: true }).click();
  await expect(page.locator('.grid-overlay')).toBeVisible();
  await page.getByLabel('Interface language').selectOption('ru');
  await expect(page.getByRole('button', { name: 'Сохранить PNG', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real file upload, external palette, merge and exact export', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('image-input').setInputFiles('public/examples/noisy-observatory.png');
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await page.getByTestId('palette-input').setInputFiles({
    name: 'test.hex',
    mimeType: 'text/plain',
    buffer: Buffer.from('#000000\n#ffffff\n#ff0000\n'),
  });
  await expect(page.getByText('Fixed palette', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await page.getByLabel('Merge into', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Merge colors' }).click();
  await expect(page.locator('.swatch-grid button')).toHaveCount(2);
  await page.getByLabel('Selected color', { exact: true }).fill('#00ff00');
  await page.getByRole('button', { name: '32 × 32', exact: true }).click();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await expect(page.locator('.swatch-grid button')).toHaveCount(2);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const file = await downloading,
    decoded = PNG.sync.read(await readFile((await file.path())!));
  const allowed = new Set(['0,255,0,255', '255,0,0,255']);
  for (let i = 0; i < decoded.data.length; i += 4)
    expect(allowed.has([...decoded.data.subarray(i, i + 4)].join(','))).toBe(true);
});

test('rapid settings and source replacement never export a stale result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample' }).click();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await page.getByLabel('Source noise').selectOption('1');
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '128 × 128', exact: true }).click();
  await page.getByRole('button', { name: '32 × 32', exact: true }).click();
  const png = new PNG({ width: 8, height: 4 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 3] = 255;
  }
  await page
    .getByTestId('image-input')
    .setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await expect(page.getByTestId('status')).toContainText('Ready to export', { timeout: 30_000 });
  await expect(page.locator('.filename')).toHaveText('replacement.png');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const decoded = PNG.sync.read(await readFile((await (await downloading).path())!));
  expect(decoded.width).toBe(64);
  for (let i = 0; i < decoded.data.length; i += 4)
    if (decoded.data[i + 3]) expect([...decoded.data.subarray(i, i + 4)]).toEqual([255, 0, 0, 255]);
});

test('invalid palette is recoverable and narrow layouts remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample' }).click();
  await expect(page.getByTestId('status')).toContainText('Ready to export');
  await page
    .getByTestId('palette-input')
    .setInputFiles({ name: 'bad.hex', mimeType: 'text/plain', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert')).toContainText('Invalid palette');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
});

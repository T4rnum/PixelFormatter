import { fromHex, hex } from '../core/color';
import type { RGB } from '../core/types';

export function parsePalette(text: string): RGB[] {
  if (text.length > 100_000) throw new Error('palette');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const gpl = lines[0]?.trim() === 'GIMP Palette';
  const colors: RGB[] = [];
  for (const raw of lines.slice(gpl ? 1 : 0)) {
    const line = raw.trim();
    if (!line || (gpl && /^(#|Name:|Columns:)/.test(line)) || (!gpl && line.startsWith('//'))) continue;
    if (gpl) {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s.*)?$/);
      if (!match) throw new Error('palette');
      const color = match.slice(1, 4).map(Number) as RGB;
      if (color.some(v => v > 255)) throw new Error('palette');
      colors.push(color);
    } else colors.push(fromHex(line));
  }
  const unique = [...new Map(colors.map(c => [hex(c), c])).values()];
  if (!unique.length || unique.length > 255) throw new Error('palette');
  return unique;
}
export const exportPalette = (colors: RGB[]) => colors.map(hex).join('\n') + '\n';

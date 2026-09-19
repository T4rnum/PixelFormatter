import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Layers3,
  LockKeyhole,
  Palette,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { applyEdits } from './core/pipeline';
import { fromHex, hex } from './core/color';
import { EMPTY_EDITS, type Raster, type RGB, type Settings } from './core/types';
import { makeDemo } from './demo';
import { decodeImage, download } from './io/image';
import { exportPalette, parsePalette } from './io/palette';
import { en, ru } from './ui/i18n';
import { useHistory } from './ui/useHistory';
import { useProcessor } from './ui/useProcessor';
import { Preview } from './ui/Preview';

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="control-section">
      <h3>
        <span>{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output className="mono">
          {value}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        disabled={disabled}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function DemoArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const demo = makeDemo(64, false);
    ref.current?.getContext('2d')?.putImageData(new ImageData(demo.data, 64, 64), 0, 0);
  }, []);
  return (
    <canvas
      ref={ref}
      width={64}
      height={64}
      className="demo-art"
      aria-label="Pixel observatory sample"
    />
  );
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'ru'>(() => {
    try {
      const saved = localStorage.getItem('pixel-language');
      if (saved === 'en' || saved === 'ru') return saved;
    } catch {
      /* Storage is optional. */
    }
    return navigator.language.startsWith('ru') ? 'ru' : 'en';
  });
  const t = lang === 'ru' ? ru : en;
  const [source, setSource] = useState<Raster | null>(null),
    [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false),
    [lockRatio, setLockRatio] = useState(true),
    [exportScale, setExportScale] = useState(4);
  const [selected, setSelected] = useState(0),
    [mergeTarget, setMergeTarget] = useState('');
  const input = useRef<HTMLInputElement>(null),
    paletteInput = useRef<HTMLInputElement>(null),
    loadId = useRef(0),
    dropDepth = useRef(0);
  const history = useHistory(),
    { settings, edits } = history.state;
  const processor = useProcessor(source, settings);
  const image = useMemo(
    () =>
      processor.image
        ? processor.ready
          ? applyEdits(processor.image, edits)
          : processor.image
        : null,
    [processor.image, processor.ready, edits],
  );
  const ready = processor.ready && !loading && !saving;
  const busy = loading || (!!source && !processor.ready && !processor.failure);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('pixel-language', lang);
    } catch {
      /* Storage is optional. */
    }
  }, [lang]);
  useEffect(() => {
    setSelected(0);
    setMergeTarget('');
  }, [processor.image]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || saving) return;
      if (
        event.target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)
      )
        return;
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [history.undo, history.redo, saving]);
  const update = (patch: Partial<Settings>) =>
    history.commit((current) => {
      // Bake edits into a locked palette before a transform recomputes its indices.
      const editedFixed =
        current.settings.fixedPalette
          ?.map((c, i) => current.edits.colors[i] ?? c)
          .filter((_, i) => current.edits.merges[i] === undefined) ?? null;
      return {
        settings: { ...current.settings, fixedPalette: editedFixed, ...patch },
        edits: { ...EMPTY_EDITS },
      };
    });
  const dimension = (key: 'width' | 'height', value: number) => {
    const next = Math.max(1, Math.min(512, Math.round(value || 1)));
    if (!lockRatio) return update({ [key]: next });
    const ratio = settings.width / settings.height;
    const width = key === 'width' ? next : Math.max(1, Math.min(512, Math.round(next * ratio)));
    const height = key === 'height' ? next : Math.max(1, Math.min(512, Math.round(next / ratio)));
    update({ width, height });
  };
  const open = async (file?: File) => {
    if (!file || saving) return;
    const id = ++loadId.current;
    setLoading(true);
    setError('');
    try {
      const raster = await decodeImage(file);
      if (id !== loadId.current) return;
      setSource(raster);
      setFilename(file.name);
      history.clear();
      setSelected(0);
    } catch (e) {
      if (id === loadId.current) setError(e instanceof Error ? e.message : 'decode');
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  };
  const sample = () => {
    ++loadId.current;
    setLoading(false);
    setError('');
    setSource(makeDemo());
    setFilename('observatory-sample.png');
    history.clear();
  };
  const importColors = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('palette');
      update({ fixedPalette: parsePalette(await file.text()) });
      setError('');
    } catch {
      setError('palette');
    }
  };
  const freeze = () => {
    if (!image) return;
    const colors = [
      ...new Map(
        image.palette
          .filter((c, i) => c[3] && edits.merges[i] === undefined)
          .map((c) => [hex(c), c.slice(0, 3) as RGB]),
      ).values(),
    ];
    if (colors.length) update({ fixedPalette: colors });
  };
  const editColor = (color: RGB) => {
    history.commit((current) => ({
      ...current,
      edits: { ...current.edits, colors: { ...current.edits.colors, [selected]: color } },
    }));
  };
  const merge = () => {
    if (!mergeTarget || Number(mergeTarget) === selected) return;
    history.commit((current) => ({
      ...current,
      edits: {
        ...current.edits,
        merges: { ...current.edits.merges, [selected]: Number(mergeTarget) },
      },
    }));
    setSelected(Number(mergeTarget));
    setMergeTarget('');
  };
  const save = async (scale: number) => {
    if (!ready) return;
    setSaving(true);
    setError('');
    try {
      const bytes = await processor.exportPNG(edits, scale);
      download(
        bytes,
        `${filename.replace(/\.[^.]+$/, '') || 'pixel-art'}-${settings.width * scale}x${settings.height * scale}.png`,
        'image/png',
      );
      setNotice(t.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'processing');
    } finally {
      setSaving(false);
    }
  };
  const errorCode = error || processor.failure;
  const errorText =
    errorCode === 'palette'
      ? t.paletteError
      : ((t as Record<string, string>)[errorCode] ?? t.processingError);
  const palette = image?.palette ?? [];
  const visibleColors = palette
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c[3] && edits.merges[i] === undefined);
  const selectedColor = palette[selected];

  return (
    <div
      className="app-shell"
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          dropDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        if (--dropDepth.current <= 0) {
          dropDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dropDepth.current = 0;
        setDragging(false);
        void open(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        data-testid="image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={paletteInput}
        data-testid="palette-input"
        type="file"
        accept=".hex,.txt,.gpl"
        hidden
        onChange={(e) => {
          void importColors(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className="app-header">
        <a className="brand" href="./" aria-label="PixelFormatter">
          <span className="brand-icon">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Pixel<span className="brand-light">Formatter</span>
            <small>PIXEL ART STUDIO</small>
          </span>
        </a>
        <div className="header-right">
          <span className="privacy-pill">
            <LockKeyhole size={12} />
            {t.local}
          </span>
          <select
            className="language-select"
            aria-label={t.language}
            value={lang}
            onChange={(e) => setLang(e.target.value as 'en' | 'ru')}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <a
            className="github-link"
            href="https://github.com/T4rnum/PixelFormatter"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight size={14} />
          </a>
        </div>
      </header>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">
            {t.workspace}
            <span className="slash">/</span>01
          </span>
          <h1>{t.tagline}</h1>
        </div>
        <button
          className="button secondary"
          disabled={saving}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          {t.import}
        </button>
      </div>
      {errorCode && (
        <div role="alert" className="alert">
          <CircleHelp size={18} />
          <span>{errorText}</span>
          <button aria-label={t.dismiss} onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <main className="studio">
        <aside className="settings-panel">
          <div className="panel-heading">
            <span>
              <SlidersHorizontal size={16} />
              {t.settings}
            </span>
            <span className="tiny-label">01—04</span>
          </div>
          <fieldset disabled={saving}>
            <Section number="01" title={t.output}>
              <div className="size-presets">
                {[32, 64, 128].map((n) => (
                  <button
                    key={n}
                    className={settings.width === n && settings.height === n ? 'active' : ''}
                    onClick={() => update({ width: n, height: n })}
                  >
                    {n} × {n}
                  </button>
                ))}
              </div>
              <div className="dimension-fields">
                <label>
                  {t.width}
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={settings.width}
                    onChange={(e) => dimension('width', e.target.valueAsNumber)}
                  />
                </label>
                <span>×</span>
                <label>
                  {t.height}
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={settings.height}
                    onChange={(e) => dimension('height', e.target.valueAsNumber)}
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={lockRatio}
                  onChange={(e) => setLockRatio(e.target.checked)}
                />
                {t.lockRatio}
              </label>
            </Section>
            <Section number="02" title={t.composition}>
              <select
                aria-label={t.composition}
                value={settings.fit}
                onChange={(e) => update({ fit: e.target.value as Settings['fit'] })}
              >
                <option value="contain">{t.contain}</option>
                <option value="cover">{t.cover}</option>
              </select>
              <Range
                label={t.scale}
                min={0.25}
                max={4}
                step={0.05}
                value={settings.scale}
                suffix="×"
                onChange={(scale) => update({ scale })}
              />
              <details>
                <summary>
                  {t.grid}
                  <ChevronDown size={13} />
                </summary>
                <Range
                  label={t.offsetX}
                  min={-100}
                  max={100}
                  step={0.1}
                  value={settings.offsetX}
                  suffix="%"
                  onChange={(offsetX) => update({ offsetX })}
                />
                <Range
                  label={t.offsetY}
                  min={-100}
                  max={100}
                  step={0.1}
                  value={settings.offsetY}
                  suffix="%"
                  onChange={(offsetY) => update({ offsetY })}
                />
              </details>
            </Section>
            <Section number="03" title={t.sampling}>
              <select
                aria-label={t.sampling}
                value={settings.method}
                onChange={(e) => update({ method: e.target.value as Settings['method'] })}
              >
                <option value="representative">{t.representative}</option>
                <option value="nearest">{t.nearest}</option>
                <option value="average">{t.average}</option>
              </select>
              <Range
                label={t.transparency}
                min={1}
                max={255}
                value={settings.alphaThreshold}
                onChange={(alphaThreshold) => update({ alphaThreshold })}
              />
            </Section>
            <Section number="04" title={t.cleanup}>
              {(['median', 'cleanup'] as const).map((key) => (
                <label className="select-field" key={key}>
                  {key === 'median' ? t.median : t.isolated}
                  <select
                    aria-label={key === 'median' ? t.median : t.isolated}
                    value={settings[key]}
                    onChange={(e) => update({ [key]: Number(e.target.value) })}
                  >
                    <option value={0}>{t.off}</option>
                    <option value={1}>{t.gentle}</option>
                    <option value={2}>{t.strong}</option>
                  </select>
                </label>
              ))}
            </Section>
          </fieldset>
          <button className="reset-button" disabled={saving} onClick={history.reset}>
            <RotateCcw size={13} />
            {t.reset}
          </button>
        </aside>
        <div className="center-panel">
          <div className="document-bar">
            <span>
              <Layers3 size={14} />
              <span className="filename">{source ? filename : 'untitled'}</span>
              {source && (
                <span className="file-tag">
                  {source.width} × {source.height}
                </span>
              )}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label={t.undo}
                title={t.undo + ' (Ctrl+Z)'}
                disabled={!history.canUndo || saving}
                onClick={history.undo}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={t.redo}
                title={t.redo + ' (Ctrl+Shift+Z)'}
                disabled={!history.canRedo || saving}
                onClick={history.redo}
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
          {source ? (
            <Preview source={source} result={image} settings={settings} t={t} processing={busy} />
          ) : (
            <section className="empty-state">
              <div className="art-frame">
                <DemoArt />
                <span className="art-badge">
                  <Sparkles size={12} />
                  64 × 64
                </span>
              </div>
              <span className="eyebrow">A LITTLE LESS NOISE. A LITTLE MORE ART.</span>
              <h2>{t.title}</h2>
              <p>{t.subtitle}</p>
              <button
                className="drop-zone"
                disabled={saving}
                onClick={() => input.current?.click()}
              >
                <span className="upload-icon">
                  <ArrowUpFromLine size={22} />
                </span>
                <strong>{t.drop}</strong>
                <span>{t.formats}</span>
                <span className="browse-label">
                  {t.browse}
                  <ArrowUpRight size={13} />
                </span>
              </button>
              <button className="sample-button" onClick={sample}>
                <Sparkles size={14} />
                {t.demo}
                <span>→</span>
              </button>
            </section>
          )}
          <div className="status-bar" role="status" data-testid="status">
            <span>
              {busy || saving ? (
                <span className="spinner" />
              ) : (
                <span className={'status-dot ' + (ready ? 'lime' : '')} />
              )}{' '}
              {saving
                ? t.saving
                : loading
                  ? t.loading
                  : busy
                    ? t.processing
                    : ready
                      ? t.ready
                      : t.idle}
            </span>
            <LockKeyhole size={12} />
          </div>
        </div>
        <aside className="palette-panel">
          <div className="panel-heading">
            <span>
              <Palette size={16} />
              {t.palette}
            </span>
            <span className="tiny-label">{image?.statistics.usedColors ?? '—'}</span>
          </div>
          <div className="palette-body">
            <div className="palette-mode">
              <span className="status-dot lime" />
              {settings.fixedPalette ? t.fixed : t.automatic}
            </div>
            <fieldset disabled={saving}>
              <Range
                disabled={!!settings.fixedPalette}
                label={t.colors}
                value={settings.fixedPalette?.length ?? settings.colors}
                min={1}
                max={255}
                onChange={(colors) => {
                  if (!settings.fixedPalette) update({ colors });
                }}
              />
              {settings.fixedPalette && (
                <p className="hint">
                  {settings.fixedPalette.length} {t.entries}
                </p>
              )}
              <div className="palette-actions">
                <button
                  className="button small secondary"
                  disabled={!ready || !visibleColors.length}
                  onClick={settings.fixedPalette ? () => update({ fixedPalette: null }) : freeze}
                >
                  <LockKeyhole size={13} />
                  {settings.fixedPalette ? t.unlock : t.freeze}
                </button>
              </div>
            </fieldset>
            <div className={'swatch-grid ' + (!image ? 'placeholder-swatches' : '')}>
              {image
                ? visibleColors.map(({ c, i }) => (
                    <button
                      key={i}
                      className={'swatch ' + (selected === i ? 'selected' : '')}
                      disabled={!ready}
                      style={{ backgroundColor: hex(c) }}
                      title={`${i}: ${hex(c)}`}
                      aria-label={`${t.color} ${i} ${hex(c)}`}
                      aria-pressed={selected === i}
                      onClick={() => {
                        setSelected(i);
                        setMergeTarget('');
                      }}
                    >
                      {selected === i && (
                        <Check size={13} color={c[0] + c[1] + c[2] > 420 ? '#11151c' : '#ffffff'} />
                      )}
                    </button>
                  ))
                : [
                    '#222740',
                    '#393956',
                    '#595373',
                    '#7e7091',
                    '#b5a3b5',
                    '#e0c9c0',
                    '#425951',
                    '#638373',
                    '#91ac89',
                    '#c2d5a1',
                    '#6d545a',
                    '#b18578',
                  ].map((c, i) => (
                    <span key={i} className="swatch" style={{ backgroundColor: c }} />
                  ))}
            </div>
            {image && (
              <div className="palette-stats">
                <span>
                  {image.statistics.usedColors} {t.used}
                </span>
                <span>
                  {palette.length} {t.entries}
                </span>
              </div>
            )}
            {!!image?.statistics.transparentPixels && (
              <div className="transparency-note">
                <span className="checker" />
                {t.transparent}
              </div>
            )}
            {selectedColor?.[3] && edits.merges[selected] === undefined ? (
              <fieldset disabled={!ready} className="color-editor">
                <label>
                  {t.color}
                  <span className="color-value">
                    <input
                      type="color"
                      aria-label={t.color}
                      value={hex(selectedColor)}
                      onChange={(e) => editColor(fromHex(e.target.value))}
                    />
                    <span className="mono">{hex(selectedColor).toUpperCase()}</span>
                    <span className="color-index">{String(selected).padStart(2, '0')}</span>
                  </span>
                </label>
                <label className="select-field">
                  {t.merge}
                  <select
                    aria-label={t.merge}
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                  >
                    <option value="">—</option>
                    {visibleColors
                      .filter(({ i }) => i !== selected)
                      .map(({ c, i }) => (
                        <option key={i} value={i}>
                          {i} · {hex(c)}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="text-button" disabled={!mergeTarget} onClick={merge}>
                  {t.mergeAction}
                  <ArrowUpRight size={13} />
                </button>
              </fieldset>
            ) : (
              <p className="hint palette-hint">{t.paletteHint}</p>
            )}
            <div className="palette-file-actions">
              <button
                className="text-button"
                disabled={saving}
                onClick={() => paletteInput.current?.click()}
              >
                <ArrowUpFromLine size={13} />
                {t.importPalette}
                <span className="tiny-label">HEX / GPL</span>
              </button>
              <button
                className="text-button"
                disabled={!ready || !visibleColors.length}
                onClick={() =>
                  download(
                    exportPalette(visibleColors.map(({ c }) => c.slice(0, 3) as RGB)),
                    'palette.hex',
                    'text/plain',
                  )
                }
              >
                <ArrowDownToLine size={13} />
                {t.exportPalette}
              </button>
            </div>
            <p className="hint edit-hint">{t.paletteChanged}</p>
          </div>
          <div className="export-panel">
            <button
              className="button primary export-main"
              aria-label={t.export}
              disabled={!ready}
              onClick={() => void save(1)}
            >
              <ArrowDownToLine size={16} />
              {t.export}
              <span>↗</span>
            </button>
            <div className="enlarged-export">
              <button disabled={!ready} onClick={() => void save(exportScale)}>
                {t.enlarged}
              </button>
              <select
                aria-label={t.downloadScale}
                value={exportScale}
                onChange={(e) => setExportScale(Number(e.target.value))}
              >
                {[2, 4, 8, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </div>
            <span className="export-caption">
              PNG · INDEXED · {settings.width} × {settings.height}
            </span>
          </div>
        </aside>
      </main>
      <footer>
        <span>
          <LockKeyhole size={12} />
          {t.private}
        </span>
        <span>
          PIXELFORMATTER <i /> {t.footer}
        </span>
        <span className="mono">v0.1.0</span>
      </footer>
      {dragging && (
        <div className="drop-overlay">
          <ImagePlus size={42} />
          <h2>{t.drop}</h2>
          <p>{t.formats}</p>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

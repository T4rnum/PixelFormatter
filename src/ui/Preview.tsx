import { useEffect, useRef, useState } from 'react';
import { Maximize2, Move, Grid2X2 } from 'lucide-react';
import { geometry, toRGBA } from '../core/pipeline';
import type { IndexedImage, Raster, Settings } from '../core/types';
import type { Copy } from './i18n';

export function Preview({
  source,
  result,
  settings,
  t,
  processing,
}: {
  source: Raster;
  result: IndexedImage | null;
  settings: Settings;
  t: Copy;
  processing: boolean;
}) {
  const original = useRef<HTMLCanvasElement>(null),
    output = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(4),
    [grid, setGrid] = useState(false),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(
      [1, 2, 3, 4, 6, 8]
        .filter((n) => n <= Math.max(1, 320 / Math.max(settings.width, settings.height)))
        .at(-1)!,
    );
  }, [source, settings.width, settings.height]);
  useEffect(() => {
    const context = original.current?.getContext('2d');
    if (!context) return;
    original.current!.width = source.width;
    original.current!.height = source.height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
      0,
      0,
    );
  }, [source]);
  useEffect(() => {
    const context = output.current?.getContext('2d');
    if (!context || !result) return;
    output.current!.width = result.width;
    output.current!.height = result.height;
    context.putImageData(new ImageData(toRGBA(result), result.width, result.height), 0, 0);
  }, [result]);
  const g = geometry(source, settings),
    factor = zoom / g.step;
  const transform = `translate(${pan.x}px, ${pan.y}px)`;
  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <div className="segmented">
          <button
            className={grid ? 'active' : ''}
            onClick={() => setGrid(!grid)}
            aria-pressed={grid}
          >
            <Grid2X2 size={15} />
            {t.grid}
          </button>
        </div>
        <div className="view-controls">
          <label>
            {t.zoom}
            <select
              aria-label={t.zoom}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            title={t.center}
            aria-label={t.center}
            onClick={() => setPan({ x: 0, y: 0 })}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="preview-pair">
        {(['original', 'result'] as const).map((kind) => (
          <div className="image-panel" key={kind}>
            <div className="image-heading">
              <span>
                <span className={'status-dot ' + (kind === 'result' ? 'lime' : '')} />
                {t[kind]}
              </span>
              <span className="mono">
                {kind === 'original'
                  ? `${source.width} × ${source.height}`
                  : `${settings.width} × ${settings.height}`}
              </span>
            </div>
            <div
              className="viewport checker"
              data-testid={kind + '-viewport'}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
              }}
              onPointerMove={(e) => {
                if (drag.current)
                  setPan({
                    x: drag.current.px + e.clientX - drag.current.x,
                    y: drag.current.py + e.clientY - drag.current.y,
                  });
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <div className="canvas-anchor" style={{ transform }}>
                {kind === 'original' ? (
                  <>
                    <canvas
                      ref={original}
                      aria-label={t.original}
                      style={{
                        width: source.width * factor,
                        height: source.height * factor,
                        left: (-settings.width * zoom) / 2 - g.x * factor,
                        top: (-settings.height * zoom) / 2 - g.y * factor,
                      }}
                    />
                    {grid && (
                      <svg
                        className="grid-overlay"
                        style={{
                          width: settings.width * zoom,
                          height: settings.height * zoom,
                          left: (-settings.width * zoom) / 2,
                          top: (-settings.height * zoom) / 2,
                        }}
                      >
                        <defs>
                          <pattern
                            id="sampling-grid"
                            width={zoom}
                            height={zoom}
                            patternUnits="userSpaceOnUse"
                          >
                            <path
                              d={`M ${zoom} 0 L 0 0 0 ${zoom}`}
                              fill="none"
                              stroke="rgba(188,245,120,.65)"
                              strokeWidth=".75"
                            />
                          </pattern>
                        </defs>
                        <rect
                          width="100%"
                          height="100%"
                          fill="url(#sampling-grid)"
                          stroke="#bcf578"
                        />
                      </svg>
                    )}
                  </>
                ) : (
                  <canvas
                    ref={output}
                    aria-label={t.result}
                    style={{
                      width: (result?.width ?? settings.width) * zoom,
                      height: (result?.height ?? settings.height) * zoom,
                      left: (-(result?.width ?? settings.width) * zoom) / 2,
                      top: (-(result?.height ?? settings.height) * zoom) / 2,
                    }}
                  />
                )}
              </div>
              {kind === 'result' && processing && (
                <span className="processing-badge">
                  <span className="spinner" />
                  {t.processing}
                </span>
              )}
            </div>
            <div className="image-caption">{kind === 'original' ? t.gridHint : t.qualityHint}</div>
          </div>
        ))}
      </div>
      <div className="preview-bottom">
        <span>
          <Move size={13} />
          {t.pan}
        </span>
        <span className="mono">
          {result
            ? `${result.statistics.usedColors} ${t.used} · ${Math.round(result.statistics.durationMs)} ms`
            : '—'}
        </span>
      </div>
    </section>
  );
}

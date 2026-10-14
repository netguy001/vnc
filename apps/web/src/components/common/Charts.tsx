import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

interface SparklineProps {
  values: Array<number | null>;
  color?: string;
  width?: number;
  height?: number;
  /** Upper bound of the y axis; defaults to 100 (percentages) */
  max?: number;
}

/** Tiny dependency-free trend line. Gaps (null) break the line instead of faking data. */
export const Sparkline: React.FC<SparklineProps> = ({ values, color = 'currentColor', width = 120, height = 28, max = 100 }) => {
  const path = useMemo(() => buildPath(values, width, height, max, 2), [values, width, height, max]);
  if (!path.line) {
    return <div className="text-[10px] text-content-muted italic" style={{ height }}>collecting…</div>;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend" className="overflow-visible text-sky-400">
      <path d={path.area} fill={color} opacity={0.12} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

function buildPath(values: Array<number | null>, w: number, h: number, max: number, pad: number) {
  const n = values.length;
  if (n < 2 || values.every((v) => v === null)) return { line: '', area: '' };
  const x = (i: number) => pad + (i * (w - pad * 2)) / (n - 1);
  const y = (v: number) => h - pad - (Math.min(Math.max(v, 0), max) / max) * (h - pad * 2);
  let line = '';
  let area = '';
  let run: Array<[number, number]> = [];
  const flush = () => {
    if (run.length === 0) return;
    line += run.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ' ';
    if (run.length > 1) {
      area +=
        run.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') +
        ` L${run[run.length - 1][0].toFixed(1)},${h - pad} L${run[0][0].toFixed(1)},${h - pad} Z `;
    }
    run = [];
  };
  values.forEach((v, i) => (v === null ? flush() : run.push([x(i), y(v)])));
  flush();
  return { line: line.trim(), area: area.trim() };
}

interface HistoryChartProps {
  timestamps: number[];
  series: Series[];
  height?: number;
  max?: number;
  unit?: string;
}

/** Multi-series line chart with a hover read-out, used for metric history. */
export const HistoryChart: React.FC<HistoryChartProps> = ({ timestamps, series, height = 160, max = 100, unit = '%' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  // Track the container width so the plot fills it (1 SVG unit = 1 CSS pixel; text never distorts).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, [timestamps.length >= 2]);
  const padL = 30;
  const padB = 18;
  const innerW = W - padL - 6;
  const innerH = height - padB - 6;
  const n = timestamps.length;

  if (n < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-content-muted italic" style={{ height }}>
        Not enough history yet — the collector samples every minute.
      </div>
    );
  }

  const x = (i: number) => padL + (i * innerW) / (n - 1);
  const y = (v: number) => 4 + innerH - (Math.min(Math.max(v, 0), max) / max) * innerH;
  const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((px - padL) / innerW) * (n - 1)))));
  };

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        className="block"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Metric history chart"
      >
        {[0, 25, 50, 75, 100].map((g) => {
          const v = (g / 100) * max;
          return (
            <g key={g}>
              <line x1={padL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="currentColor" opacity={0.08} />
              <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.5}>
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={9} fill="currentColor" opacity={0.5}>
            {fmt(timestamps[i])}
          </text>
        ))}
        {series.map((s) => {
          const d = segments(s.values, x, y);
          return d ? <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" /> : null;
        })}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={4} y2={4 + innerH} stroke="currentColor" opacity={0.3} strokeDasharray="3 3" />
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] font-mono text-content-muted">
        {series.map((s) => {
          const v = hover !== null ? s.values[hover] : s.values[n - 1];
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded" style={{ background: s.color }} />
              {s.label}
              <span className="text-content-primary font-semibold">{v === null || v === undefined ? '—' : `${v}${unit}`}</span>
            </span>
          );
        })}
        <span className="ml-auto">{hover !== null ? fmt(timestamps[hover]) : 'latest'}</span>
      </div>
    </div>
  );
};

function segments(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

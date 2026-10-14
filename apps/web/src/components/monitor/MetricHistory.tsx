import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { HistoryChart } from '../common/Charts';
import { MetricSample } from '@server-console/shared';

const RANGES = ['1h', '6h', '24h', '7d'] as const;

export const MetricHistory: React.FC<{ serverId: string }> = ({ serverId }) => {
  const { resolvedTheme } = useTheme();
  const palette = resolvedTheme === 'light' ? { cpu: '#0369a1', mem: '#047857', disk: '#6d28d9' } : { cpu: '#38bdf8', mem: '#34d399', disk: '#a78bfa' };
  const [range, setRange] = useState<(typeof RANGES)[number]>('1h');
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.getMetricHistory(serverId, range);
        if (!cancelled) {
          setSamples(res.samples);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [serverId, range]);

  const downtime = samples.filter((s) => !s.available).length;
  const uptimePct = samples.length ? Math.round(((samples.length - downtime) / samples.length) * 1000) / 10 : null;

  return (
    <div className="p-4 bg-panel/80 rounded border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
          <History className="w-4 h-4 text-sky-400" /> History
          {uptimePct !== null && (
            <span className="text-[11px] font-mono font-normal text-content-muted">· reachable {uptimePct}% of samples</span>
          )}
        </h3>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                range === r ? 'bg-sky-600 text-white' : 'bg-panel-alt text-content-muted hover:text-content-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="text-xs text-rose-400">{error}</div>
      ) : (
        <HistoryChart
          timestamps={samples.map((s) => s.ts)}
          series={[
            { key: 'cpu', label: 'CPU', color: palette.cpu, values: samples.map((s) => s.cpu) },
            { key: 'mem', label: 'RAM', color: palette.mem, values: samples.map((s) => s.mem) },
            { key: 'disk', label: 'Disk', color: palette.disk, values: samples.map((s) => s.disk) },
          ]}
        />
      )}
    </div>
  );
};

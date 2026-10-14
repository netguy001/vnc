import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Server,
  Monitor,
  Terminal,
  Folder,
  Activity,
  Plus,
  RefreshCw,
  HardDrive,
  Cpu,
  Database,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Search,
  Star,
  Tag,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { Sparkline } from '../components/common/Charts';
import { useLiveMany } from '../context/LiveContext';
import { LiveBadge } from '../components/common/LiveBadge';
import { ServerDTO, ServerMonitoringData } from '@server-console/shared';
import { ServerModal } from '../components/servers/ServerModal';

interface DashboardPageProps {
  onOpenServer: (serverId: string, tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenServer }) => {
  const { showToast } = useToast();
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [liveAt, setLiveAt] = useState<Record<string, number>>({});
  const [trends, setTrends] = useState<Record<string, Array<number | null>>>({});
  const [serverMetrics, setServerMetrics] = useState<Record<string, ServerMonitoringData | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const inFlight = useRef(false);

  const loadData = useCallback(async (background = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (background) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await api.getServers();
      setServers(res.servers);

      // Probe metrics for servers in parallel
      const metricsMap: Record<string, ServerMonitoringData | null> = {};
      const trendMap: Record<string, Array<number | null>> = {};
      await Promise.all(
        res.servers.map(async (s) => {
          try {
            const m = await api.getMonitoring(s.id);
            metricsMap[s.id] = m.metrics;
          } catch {
            metricsMap[s.id] = null;
          }
          try {
            const h = await api.getMetricHistory(s.id, '1h');
            trendMap[s.id] = h.samples.map((x) => x.cpu);
          } catch {
            /* history is optional */
          }
        })
      );
      setServerMetrics(metricsMap);
      setTrends(trendMap);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  // Real-time telemetry for every card: each push replaces the numbers and extends the sparkline.
  useLiveMany<ServerMonitoringData>('metrics', servers.map((s) => s.id), (id, payload, ts) => {
    setServerMetrics((prev) => ({ ...prev, [id]: payload }));
    setLiveAt((prev) => ({ ...prev, [id]: ts }));
    setTrends((prev) => {
      const series = [...(prev[id] ?? []), payload.isAvailable ? payload.cpuUsagePercent ?? null : null];
      return { ...prev, [id]: series.slice(-90) };
    });
  });

  useEffect(() => {
    loadData();

    const AUTO_REFRESH_MS = 60000; // the server list; telemetry itself is pushed live
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, AUTO_REFRESH_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadData]);

  const total = servers.length;
  const online = servers.filter((s) => s.status === 'connected').length;
  const errors = servers.filter((s) => s.status === 'error').length;
  const offline = servers.filter((s) => s.status === 'disconnected').length;

  const handleToggleFavorite = async (s: ServerDTO) => {
    try {
      await api.updateServer(s.id, { isFavorite: !s.isFavorite });
      setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, isFavorite: !x.isFavorite } : x)));
    } catch (err: any) {
      showToast(err.message || 'Failed to update favorite', 'error');
    }
  };

  const visibleServers = servers
    .filter((s) => {
      const q = search.toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-y-auto p-2">
      {/* Top Banner & Cluster Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-panel/60 rounded-xl border border-border">
        <div>
          <h2 className="text-base font-bold text-content-primary">Infrastructure Dashboard</h2>
          <p className="text-xs text-content-muted mt-0.5">
            Local-first real-time telemetry, remote desktop consoles, and SSH sessions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers…"
              className="w-40 pl-9 pr-3 py-2 bg-panel-alt border border-border rounded-lg text-xs text-content-secondary focus:outline-none focus:border-sky-500 focus:w-56 transition-all"
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-panel-alt/80 px-4 py-2 rounded-lg border border-border">
            <div>
              <span className="text-content-muted block text-[10px]">TOTAL</span>
              <span className="text-content-primary font-bold">{total}</span>
            </div>
            <div className="h-6 w-[1px] bg-border" />
            <div>
              <span className="text-content-muted block text-[10px]">CONNECTED</span>
              <span className="text-emerald-400 font-bold">{online}</span>
            </div>
            <div className="h-6 w-[1px] bg-border" />
            <div>
              <span className="text-content-muted block text-[10px]">OFFLINE</span>
              <span className="text-content-muted font-bold">{offline}</span>
            </div>
            {errors > 0 && (
              <>
                <div className="h-6 w-[1px] bg-border" />
                <div>
                  <span className="text-content-muted block text-[10px]">ERRORS</span>
                  <span className="text-rose-400 font-bold">{errors}</span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Server</span>
          </button>

          <button
            onClick={() => loadData()}
            disabled={isLoading || isRefreshing}
            className="p-2 bg-panel-alt hover:bg-border text-content-secondary rounded-lg border border-border transition"
            title="Refresh metrics (auto-refreshes every 15s)"
            aria-label="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Server Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {servers.length === 0 && !isLoading && (
          <div className="col-span-full p-12 bg-panel/40 rounded-xl border border-border/80 text-center">
            <Server className="w-12 h-12 text-content-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-content-secondary">No servers configured yet</h3>
            <p className="text-xs text-content-muted max-w-sm mx-auto mt-1 mb-4">
              Add your local Linux development VM, Docker container, or Contabo server to begin.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition"
            >
              Add First Server
            </button>
          </div>
        )}

        {servers.length > 0 && visibleServers.length === 0 && (
          <div className="col-span-full p-8 bg-panel/40 rounded-xl border border-border/80 text-center text-xs text-content-muted italic">
            No servers match "{search}".
          </div>
        )}

        {visibleServers.map((s) => {
          const metrics = serverMetrics[s.id];
          const hasMetrics = metrics && metrics.isAvailable;

          return (
            <div
              key={s.id}
              className="bg-panel/80 border border-border rounded-xl p-4 flex flex-col justify-between hover:border-border-strong transition shadow-lg space-y-4"
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        s.status === 'connected'
                          ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                          : s.status === 'connecting'
                          ? 'bg-amber-500 animate-ping'
                          : s.status === 'error'
                          ? 'bg-rose-500'
                          : 'bg-content-muted'
                      }`}
                    />
                    <h3 className="font-semibold text-content-primary text-sm truncate">{s.name}</h3>
                    <button
                      onClick={() => handleToggleFavorite(s)}
                      title={s.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                      aria-label={s.isFavorite ? `Remove ${s.name} from favorites` : `Mark ${s.name} as favorite`}
                      className={`flex-shrink-0 transition ${s.isFavorite ? 'text-amber-400' : 'text-content-muted hover:text-amber-400'}`}
                    >
                      <Star className={`w-3.5 h-3.5 ${s.isFavorite ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-panel-alt text-content-muted font-mono flex-shrink-0">
                    {s.serverGroup || 'Default'}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs font-mono text-content-muted">
                  <span>{s.host}:{s.sshPort}</span>
                  <span className="text-content-muted">•</span>
                  <span>{s.sshUsername}</span>
                </div>

                {s.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-sky-600/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Telemetry Block */}
              <div className="p-3 bg-panel-alt/70 rounded-lg border border-border/80">
                {hasMetrics ? (
                  <div className="space-y-2 text-xs font-mono">
                    {/* CPU */}
                    <div>
                      <div className="flex justify-between text-content-muted mb-1 text-[11px]">
                        <span className="flex items-center gap-2">CPU <LiveBadge updatedAt={liveAt[s.id]} compact /></span>
                        <span className="text-content-primary font-semibold">{metrics.cpuUsagePercent ?? 0}%</span>
                      </div>
                      {(trends[s.id]?.length ?? 0) > 1 && (
                        <div className="mb-1.5" title="CPU, last hour">
                          <Sparkline values={trends[s.id]} width={240} height={24} />
                        </div>
                      )}
                      <div className="w-full bg-panel-inset h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.cpuUsagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM */}
                    <div>
                      <div className="flex justify-between text-content-muted mb-1 text-[11px]">
                        <span>RAM</span>
                        <span className="text-content-primary font-semibold">{metrics.memory?.usagePercent ?? 0}%</span>
                      </div>
                      <div className="w-full bg-panel-inset h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.memory?.usagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Disk */}
                    <div>
                      <div className="flex justify-between text-content-muted mb-1 text-[11px]">
                        <span>Disk</span>
                        <span className="text-content-primary font-semibold">{metrics.disks?.[0]?.usagePercent ?? 0}%</span>
                      </div>
                      <div className="w-full bg-panel-inset h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.disks?.[0]?.usagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-content-muted flex flex-col items-center justify-center italic">
                    <WifiOff className="w-5 h-5 mb-1 text-content-muted" />
                    <span>Monitoring unavailable</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 text-xs">
                {s.vncEnabled && (
                  <button
                    onClick={() => onOpenServer(s.id, 'console')}
                    className="flex flex-col items-center justify-center p-2 rounded bg-panel-alt hover:bg-border text-content-primary transition border border-border"
                    title="Open VNC Console"
                    aria-label={`Open VNC console for ${s.name}`}
                  >
                    <Monitor className="w-4 h-4 text-sky-400 mb-1" />
                    <span className="text-[10px]">VNC</span>
                  </button>
                )}

                <button
                  onClick={() => onOpenServer(s.id, 'terminal')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-panel-alt hover:bg-border text-content-primary transition border border-border"
                  title="Open SSH Terminal"
                  aria-label={`Open SSH terminal for ${s.name}`}
                >
                  <Terminal className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-[10px]">Terminal</span>
                </button>

                <button
                  onClick={() => onOpenServer(s.id, 'files')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-panel-alt hover:bg-border text-content-primary transition border border-border"
                  title="Open SFTP Files"
                  aria-label={`Open SFTP file manager for ${s.name}`}
                >
                  <Folder className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-[10px]">Files</span>
                </button>

                <button
                  onClick={() => onOpenServer(s.id, 'monitor')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-panel-alt hover:bg-border text-content-primary transition border border-border"
                  title="Open System Telemetry"
                  aria-label={`Open system telemetry for ${s.name}`}
                >
                  <Activity className="w-4 h-4 text-purple-400 mb-1" />
                  <span className="text-[10px]">Monitor</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={loadData}
      />
    </div>
  );
};

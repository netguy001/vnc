import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../api/client';
import { ServerDTO, ServerMonitoringData } from '@server-console/shared';
import { ServerModal } from '../components/servers/ServerModal';

interface DashboardPageProps {
  onOpenServer: (serverId: string, tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenServer }) => {
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [serverMetrics, setServerMetrics] = useState<Record<string, ServerMonitoringData | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getServers();
      setServers(res.servers);

      // Probe metrics for servers in parallel
      const metricsMap: Record<string, ServerMonitoringData | null> = {};
      await Promise.all(
        res.servers.map(async (s) => {
          try {
            const m = await api.getMonitoring(s.id);
            metricsMap[s.id] = m.metrics;
          } catch {
            metricsMap[s.id] = null;
          }
        })
      );
      setServerMetrics(metricsMap);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const total = servers.length;
  const online = servers.filter((s) => s.status === 'connected').length;
  const errors = servers.filter((s) => s.status === 'error').length;
  const offline = servers.filter((s) => s.status === 'disconnected').length;

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-y-auto p-2">
      {/* Top Banner & Cluster Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/60 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100">Infrastructure Dashboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Local-first real-time telemetry, remote desktop consoles, and SSH sessions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/80 px-4 py-2 rounded-lg border border-slate-800">
            <div>
              <span className="text-slate-500 block text-[10px]">TOTAL</span>
              <span className="text-slate-200 font-bold">{total}</span>
            </div>
            <div className="h-6 w-[1px] bg-slate-800" />
            <div>
              <span className="text-slate-500 block text-[10px]">CONNECTED</span>
              <span className="text-emerald-400 font-bold">{online}</span>
            </div>
            <div className="h-6 w-[1px] bg-slate-800" />
            <div>
              <span className="text-slate-500 block text-[10px]">OFFLINE</span>
              <span className="text-slate-400 font-bold">{offline}</span>
            </div>
            {errors > 0 && (
              <>
                <div className="h-6 w-[1px] bg-slate-800" />
                <div>
                  <span className="text-slate-500 block text-[10px]">ERRORS</span>
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
            onClick={loadData}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Server Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {servers.length === 0 && !isLoading && (
          <div className="col-span-full p-12 bg-slate-900/40 rounded-xl border border-slate-800/80 text-center">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">No servers configured yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
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

        {servers.map((s) => {
          const metrics = serverMetrics[s.id];
          const hasMetrics = metrics && metrics.isAvailable;

          return (
            <div
              key={s.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition shadow-lg space-y-4"
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        s.status === 'connected'
                          ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                          : s.status === 'connecting'
                          ? 'bg-amber-500 animate-ping'
                          : s.status === 'error'
                          ? 'bg-rose-500'
                          : 'bg-slate-600'
                      }`}
                    />
                    <h3 className="font-semibold text-slate-100 text-sm">{s.name}</h3>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                    {s.serverGroup || 'Default'}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>{s.host}:{s.sshPort}</span>
                  <span className="text-slate-600">•</span>
                  <span>{s.sshUsername}</span>
                </div>
              </div>

              {/* Telemetry Block */}
              <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80">
                {hasMetrics ? (
                  <div className="space-y-2 text-xs font-mono">
                    {/* CPU */}
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                        <span>CPU</span>
                        <span className="text-slate-200 font-semibold">{metrics.cpuUsagePercent ?? 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.cpuUsagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM */}
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                        <span>RAM</span>
                        <span className="text-slate-200 font-semibold">{metrics.memory?.usagePercent ?? 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.memory?.usagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Disk */}
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                        <span>Disk</span>
                        <span className="text-slate-200 font-semibold">{metrics.disks?.[0]?.usagePercent ?? 0}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(metrics.disks?.[0]?.usagePercent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 flex flex-col items-center justify-center italic">
                    <WifiOff className="w-5 h-5 mb-1 text-slate-600" />
                    <span>Monitoring unavailable</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 text-xs">
                {s.vncEnabled && (
                  <button
                    onClick={() => onOpenServer(s.id, 'console')}
                    className="flex flex-col items-center justify-center p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                    title="Open VNC Console"
                  >
                    <Monitor className="w-4 h-4 text-sky-400 mb-1" />
                    <span className="text-[10px]">VNC</span>
                  </button>
                )}

                <button
                  onClick={() => onOpenServer(s.id, 'terminal')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                  title="Open SSH Terminal"
                >
                  <Terminal className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-[10px]">Terminal</span>
                </button>

                <button
                  onClick={() => onOpenServer(s.id, 'files')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                  title="Open SFTP Files"
                >
                  <Folder className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-[10px]">Files</span>
                </button>

                <button
                  onClick={() => onOpenServer(s.id, 'monitor')}
                  className="flex flex-col items-center justify-center p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                  title="Open System Telemetry"
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

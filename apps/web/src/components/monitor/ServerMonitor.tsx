import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Clock,
  RefreshCw,
  AlertTriangle,
  Server,
  Layers,
} from 'lucide-react';
import { api } from '../../api/client';
import { ServerMonitoringData } from '@server-console/shared';

interface ServerMonitorProps {
  serverId: string;
  serverName: string;
}

export const ServerMonitor: React.FC<ServerMonitorProps> = ({ serverId, serverName }) => {
  const [data, setData] = useState<ServerMonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await api.getMonitoring(serverId);
      setData(res.metrics);
    } catch (err: any) {
      setData({
        serverId,
        timestamp: new Date().toISOString(),
        isAvailable: false,
        error: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [serverId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, serverId]);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1d] border border-slate-800 rounded-lg overflow-hidden shadow-2xl p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-slate-100 text-sm">System Telemetry & Metrics</span>
          {data?.timestamp && (
            <span className="text-slate-500 font-mono text-[11px]">
              (Updated {new Date(data.timestamp).toLocaleTimeString()})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span>Auto-refresh (5s)</span>
          </label>

          <button
            onClick={fetchMetrics}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Unavailable State */}
      {data && !data.isAvailable && (
        <div className="p-8 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
          <h3 className="text-base font-semibold text-slate-200">Monitoring Unavailable</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            {data.error || 'The system could not retrieve monitoring metrics. Verify SSH connection and permissions.'}
          </p>
          <button
            onClick={fetchMetrics}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition"
          >
            Retry Metric Probe
          </button>
        </div>
      )}

      {/* Available Metrics View */}
      {data && data.isAvailable && (
        <div className="space-y-4">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* CPU */}
            <div className="p-3 bg-slate-900/80 rounded border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Cpu className="w-4 h-4 text-sky-400" /> CPU Usage
                </span>
                <span className="font-mono text-slate-200 font-semibold">{data.cpuUsagePercent ?? 0}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-sky-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.cpuUsagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-2">
                Load: {data.loadAverage?.map((l) => l.toFixed(2)).join(', ') || 'N/A'}
              </span>
            </div>

            {/* RAM */}
            <div className="p-3 bg-slate-900/80 rounded border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Database className="w-4 h-4 text-emerald-400" /> Memory (RAM)
                </span>
                <span className="font-mono text-slate-200 font-semibold">{data.memory?.usagePercent ?? 0}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.memory?.usagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-2">
                {data.memory?.usedFormatted || '0 B'} / {data.memory?.totalFormatted || '0 B'}
              </span>
            </div>

            {/* Disk Root */}
            <div className="p-3 bg-slate-900/80 rounded border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <HardDrive className="w-4 h-4 text-purple-400" /> Storage (Root)
                </span>
                <span className="font-mono text-slate-200 font-semibold">
                  {data.disks?.[0]?.usagePercent ?? 0}%
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.disks?.[0]?.usagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-2">
                {data.disks?.[0]?.used || '0 B'} of {data.disks?.[0]?.size || '0 B'}
              </span>
            </div>

            {/* Uptime */}
            <div className="p-3 bg-slate-900/80 rounded border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-4 h-4 text-amber-400" /> System Uptime
                </span>
              </div>
              <div className="text-sm font-semibold font-mono text-slate-100">
                {data.uptimeFormatted || 'N/A'}
              </div>
              <span className="text-[11px] text-emerald-400 font-mono mt-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Kernel Active
              </span>
            </div>
          </div>

          {/* Disk Partitions */}
          {data.disks && data.disks.length > 0 && (
            <div className="bg-slate-900/60 rounded border border-slate-800 p-3">
              <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" /> Filesystem Mounts
              </h4>
              <div className="divide-y divide-slate-800/60 text-xs font-mono">
                {data.disks.map((d, i) => (
                  <div key={i} className="py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-300 font-semibold">{d.mount}</span>
                      <span className="text-slate-500 text-[11px]">({d.filesystem})</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">
                        {d.used} / {d.size}
                      </span>
                      <div className="w-24 bg-slate-950 rounded-full h-1.5 border border-slate-800">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(d.usagePercent, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-slate-300">{d.usagePercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Running Processes */}
          {data.topProcesses && data.topProcesses.length > 0 && (
            <div className="bg-slate-900/60 rounded border border-slate-800 p-3">
              <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" /> Top Active Processes
              </h4>
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[11px]">
                    <th className="py-1 px-2">PID</th>
                    <th className="py-1 px-2">USER</th>
                    <th className="py-1 px-2">CPU %</th>
                    <th className="py-1 px-2">MEM %</th>
                    <th className="py-1 px-2">COMMAND</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-slate-300">
                  {data.topProcesses.map((p) => (
                    <tr key={p.pid} className="hover:bg-slate-800/30">
                      <td className="py-1.5 px-2 text-slate-400">{p.pid}</td>
                      <td className="py-1.5 px-2 text-slate-400">{p.user}</td>
                      <td className="py-1.5 px-2 text-sky-400 font-semibold">{p.cpu}%</td>
                      <td className="py-1.5 px-2 text-emerald-400">{p.mem}%</td>
                      <td className="py-1.5 px-2 truncate max-w-xs">{p.command}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

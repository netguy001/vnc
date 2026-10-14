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
import { MetricHistory } from './MetricHistory';
import { useLiveData } from '../../context/LiveContext';
import { LiveBadge } from '../common/LiveBadge';
import { AiAssistant } from './AiAssistant';

interface ServerMonitorProps {
  serverId: string;
  serverName: string;
}

export const ServerMonitor: React.FC<ServerMonitorProps> = ({ serverId, serverName }) => {
  const [data, setData] = useState<ServerMonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { updatedAt } = useLiveData<ServerMonitoringData>('metrics', serverId, (payload) => setData(payload));

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await api.getMonitoring(serverId, true);
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

  return (
    <div className="flex flex-col h-full bg-panel-inset border border-border rounded-lg overflow-hidden shadow-2xl p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border text-xs text-content-secondary">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-content-primary text-sm">System Telemetry & Metrics</span>
          {data?.timestamp && (
            <span className="text-content-muted font-mono text-[11px]">
              (Updated {new Date(data.timestamp).toLocaleTimeString()})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LiveBadge updatedAt={updatedAt} />

          <button
            onClick={fetchMetrics}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-content-primary border border-border transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <MetricHistory serverId={serverId} />
      <AiAssistant serverId={serverId} serverName={serverName} />

      {/* Unavailable State */}
      {data && !data.isAvailable && (
        <div className="p-8 rounded-lg bg-panel/60 border border-border flex flex-col items-center justify-center text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
          <h3 className="text-base font-semibold text-content-secondary">Monitoring Unavailable</h3>
          <p className="text-xs text-content-muted max-w-md mt-1 mb-4">
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
            <div className="p-3 bg-panel/80 rounded border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-content-muted mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Cpu className="w-4 h-4 text-sky-400" /> CPU Usage
                </span>
                <span className="font-mono text-content-primary font-semibold">{data.cpuUsagePercent ?? 0}%</span>
              </div>
              <div className="w-full bg-panel-inset rounded-full h-2 overflow-hidden border border-border">
                <div
                  className="bg-sky-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.cpuUsagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-content-muted font-mono mt-2">
                Load: {data.loadAverage?.map((l) => l.toFixed(2)).join(', ') || 'N/A'}
              </span>
            </div>

            {/* RAM */}
            <div className="p-3 bg-panel/80 rounded border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-content-muted mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Database className="w-4 h-4 text-emerald-400" /> Memory (RAM)
                </span>
                <span className="font-mono text-content-primary font-semibold">{data.memory?.usagePercent ?? 0}%</span>
              </div>
              <div className="w-full bg-panel-inset rounded-full h-2 overflow-hidden border border-border">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.memory?.usagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-content-muted font-mono mt-2">
                {data.memory?.usedFormatted || '0 B'} / {data.memory?.totalFormatted || '0 B'}
              </span>
            </div>

            {/* Disk Root */}
            <div className="p-3 bg-panel/80 rounded border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-content-muted mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <HardDrive className="w-4 h-4 text-purple-400" /> Storage (Root)
                </span>
                <span className="font-mono text-content-primary font-semibold">
                  {data.disks?.[0]?.usagePercent ?? 0}%
                </span>
              </div>
              <div className="w-full bg-panel-inset rounded-full h-2 overflow-hidden border border-border">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data.disks?.[0]?.usagePercent ?? 0, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-content-muted font-mono mt-2">
                {data.disks?.[0]?.used || '0 B'} of {data.disks?.[0]?.size || '0 B'}
              </span>
            </div>

            {/* Uptime */}
            <div className="p-3 bg-panel/80 rounded border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-content-muted mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-4 h-4 text-amber-400" /> System Uptime
                </span>
              </div>
              <div className="text-sm font-semibold font-mono text-content-primary">
                {data.uptimeFormatted || 'N/A'}
              </div>
              <span className="text-[11px] text-emerald-400 font-mono mt-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Kernel Active
              </span>
            </div>
          </div>

          {/* Disk Partitions */}
          {data.disks && data.disks.length > 0 && (
            <div className="bg-panel/60 rounded border border-border p-3">
              <h4 className="text-xs font-semibold text-content-secondary mb-2 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" /> Filesystem Mounts
              </h4>
              <div className="divide-y divide-border/60 text-xs font-mono">
                {data.disks.map((d, i) => (
                  <div key={i} className="py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-content-secondary font-semibold">{d.mount}</span>
                      <span className="text-content-muted text-[11px]">({d.filesystem})</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-content-muted">
                        {d.used} / {d.size}
                      </span>
                      <div className="w-24 bg-panel-inset rounded-full h-1.5 border border-border">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(d.usagePercent, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-content-secondary">{d.usagePercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Running Processes */}
          {data.topProcesses && data.topProcesses.length > 0 && (
            <div className="bg-panel/60 rounded border border-border p-3">
              <h4 className="text-xs font-semibold text-content-secondary mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" /> Top Active Processes
              </h4>
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-content-muted text-[11px]">
                    <th className="py-1 px-2">PID</th>
                    <th className="py-1 px-2">USER</th>
                    <th className="py-1 px-2">CPU %</th>
                    <th className="py-1 px-2">MEM %</th>
                    <th className="py-1 px-2">COMMAND</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-content-secondary">
                  {data.topProcesses.map((p) => (
                    <tr key={p.pid} className="hover:bg-panel-alt/30">
                      <td className="py-1.5 px-2 text-content-muted">{p.pid}</td>
                      <td className="py-1.5 px-2 text-content-muted">{p.user}</td>
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

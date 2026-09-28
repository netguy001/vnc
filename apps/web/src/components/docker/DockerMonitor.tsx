import React, { useState, useEffect } from 'react';
import { Box, RefreshCw, AlertCircle, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { DockerContainerInfo } from '@server-console/shared';

interface DockerMonitorProps {
  serverId: string;
  serverName: string;
}

export const DockerMonitor: React.FC<DockerMonitorProps> = ({ serverId, serverName }) => {
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchContainers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getDockerContainers(serverId);
      setIsAvailable(res.isAvailable);
      setContainers(res.containers);
      if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setIsAvailable(false);
      setError(err.message || 'Failed to query Docker daemon');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, [serverId]);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1d] border border-slate-800 rounded-lg overflow-hidden shadow-2xl p-4 space-y-4 overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-slate-100 text-sm">Docker Engine & Containers (Read-Only)</span>
        </div>

        <button
          onClick={fetchContainers}
          disabled={isLoading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {!isAvailable && (
        <div className="p-8 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-10 h-10 text-slate-500 mb-3" />
          <h3 className="text-base font-semibold text-slate-300">Docker Daemon Not Available</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            {error || 'Docker is either not installed or the current SSH user lacks permissions to access /var/run/docker.sock.'}
          </p>
          <button
            onClick={fetchContainers}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition"
          >
            Retry Docker Probe
          </button>
        </div>
      )}

      {isAvailable && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-sans">
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Container Name</th>
                <th className="py-2.5 px-3">Image</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Port Bindings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {containers.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans italic">
                    No active or stopped containers found on this server.
                  </td>
                </tr>
              )}

              {containers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2 px-3">
                    {c.state === 'running' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Running
                      </span>
                    )}
                    {c.state === 'exited' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        Exited
                      </span>
                    )}
                    {c.state !== 'running' && c.state !== 'exited' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60 font-sans">
                        {c.state}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-100 font-sans">
                    {c.name}
                  </td>
                  <td className="py-2 px-3 text-sky-400">
                    {c.image}
                  </td>
                  <td className="py-2 px-3 text-slate-400">
                    {c.status}
                  </td>
                  <td className="py-2 px-3 text-slate-400 truncate max-w-xs">
                    {c.ports || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

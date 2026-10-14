import React, { useState, useEffect } from 'react';
import { Box, RefreshCw, AlertCircle, Play, Square, RotateCw, ScrollText, X, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LogViewer } from '../logs/LogViewer';
import { useLiveData } from '../../context/LiveContext';
import { LiveBadge } from '../common/LiveBadge';
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const canAct = user?.role === 'admin' || user?.role === 'operator';
  const [busy, setBusy] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; action: 'stop' | 'restart' } | null>(null);

  const { updatedAt } = useLiveData<{ isAvailable: boolean; containers: DockerContainerInfo[]; error?: string }>('docker', serverId, (res) => {
    setIsAvailable(res.isAvailable);
    setContainers(res.containers);
    setError(res.error ?? null);
  });

  const runAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    setBusy(name);
    try {
      await api.containerAction(serverId, name, action);
      showToast(`${action} ${name}: done`, 'success');
    } catch (err: any) {
      showToast(err.message || `Failed to ${action} ${name}`, 'error');
    } finally {
      setBusy(null);
      fetchContainers();
    }
  };

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
    <div className="flex flex-col h-full bg-panel-inset border border-border rounded-lg overflow-hidden shadow-2xl p-4 space-y-4 overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border text-xs text-content-secondary">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-content-primary text-sm">Docker Engine & Containers</span>
        </div>

        <div className="flex items-center gap-2">
        <LiveBadge updatedAt={updatedAt} />
        <button
          onClick={fetchContainers}
          disabled={isLoading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-content-primary border border-border transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
        </div>
      </div>

      {!isAvailable && (
        <div className="p-8 rounded-lg bg-panel/60 border border-border flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-10 h-10 text-content-muted mb-3" />
          <h3 className="text-base font-semibold text-content-secondary">Docker Daemon Not Available</h3>
          <p className="text-xs text-content-muted max-w-md mt-1 mb-4">
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
              <tr className="bg-panel/80 border-b border-border text-content-muted font-sans">
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Container Name</th>
                <th className="py-2.5 px-3">Image</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Port Bindings</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-content-secondary">
              {containers.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-content-muted font-sans italic">
                    No active or stopped containers found on this server.
                  </td>
                </tr>
              )}

              {containers.map((c) => (
                <tr key={c.id} className="hover:bg-panel-alt/40 transition">
                  <td className="py-2 px-3">
                    {c.state === 'running' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Running
                      </span>
                    )}
                    {c.state === 'exited' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-panel-alt text-content-muted border border-border font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-content-muted" />
                        Exited
                      </span>
                    )}
                    {c.state !== 'running' && c.state !== 'exited' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60 font-sans">
                        {c.state}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-semibold text-content-primary font-sans">
                    {c.name}
                  </td>
                  <td className="py-2 px-3 text-sky-400">
                    {c.image}
                  </td>
                  <td className="py-2 px-3 text-content-muted">
                    {c.status}
                  </td>
                  <td className="py-2 px-3 text-content-muted truncate max-w-xs">
                    {c.ports || '—'}
                  </td>
                  <td className="py-2 px-3 text-right whitespace-nowrap font-sans">
                    <button title="Logs" aria-label={`Logs for ${c.name}`} onClick={() => setLogsFor(c.name)} className="p-1 text-content-muted hover:text-sky-400">
                      <ScrollText className="w-3.5 h-3.5" />
                    </button>
                    {canAct &&
                      (busy === c.name ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin inline text-sky-400" />
                      ) : (
                        <>
                          {c.state !== 'running' && (
                            <button title="Start" aria-label={`Start ${c.name}`} onClick={() => runAction(c.name, 'start')} className="p-1 text-content-muted hover:text-emerald-400">
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.state === 'running' && (
                            <button title="Stop" aria-label={`Stop ${c.name}`} onClick={() => setConfirm({ name: c.name, action: 'stop' })} className="p-1 text-content-muted hover:text-rose-400">
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button title="Restart" aria-label={`Restart ${c.name}`} onClick={() => setConfirm({ name: c.name, action: 'restart' })} className="p-1 text-content-muted hover:text-amber-400">
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logsFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setLogsFor(null)}>
          <div className="w-full max-w-5xl bg-panel border border-border rounded-xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-sky-400" /> {logsFor}
                <span className="text-xs font-normal text-content-muted">container logs</span>
              </h3>
              <button onClick={() => setLogsFor(null)} aria-label="Close logs" className="text-content-muted hover:text-content-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <LogViewer
              sourceKey={logsFor}
              height="55vh"
              load={(o) => api.getLogs(serverId, { source: `docker:${logsFor}`, lines: o.lines, filter: o.filter || undefined })}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title={`${confirm?.action === 'stop' ? 'Stop' : 'Restart'} container ${confirm?.name ?? ''}?`}
        description={`This runs "docker ${confirm?.action} ${confirm?.name}" on ${serverName}.`}
        confirmLabel={confirm?.action === 'stop' ? 'Stop container' : 'Restart container'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm!;
          setConfirm(null);
          void runAction(c.name, c.action);
        }}
      />
    </div>
  );
};

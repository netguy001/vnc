import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cog, RefreshCw, Play, Square, RotateCw, Search, Loader2, AlertCircle } from 'lucide-react';
import { api, ServiceInfo } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

type Filter = 'all' | 'running' | 'failed' | 'inactive';

export const ServiceManager: React.FC<{ serverId: string; serverName: string }> = ({ serverId, serverName }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canAct = user?.role === 'admin' || user?.role === 'operator';
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('running');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; action: 'stop' | 'restart' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getServices(serverId);
      setServices(res.services);
      setAvailable(res.available);
      setError(res.error);
    } catch (err: any) {
      setAvailable(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    load();
    // Service states change rarely and listing them is heavier than telemetry: refresh every 10 s
    // while the tab is visible rather than pushing over the live socket.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => clearInterval(t);
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (filter === 'running' && s.active !== 'active') return false;
      if (filter === 'failed' && s.active !== 'failed') return false;
      if (filter === 'inactive' && s.active !== 'inactive') return false;
      return !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    });
  }, [services, search, filter]);

  const run = async (name: string, action: string) => {
    setBusy(name);
    try {
      await api.serviceAction(serverId, name, action);
      showToast(`${action} ${name}: done`, 'success');
    } catch (err: any) {
      showToast(err.message || `Failed to ${action} ${name}`, 'error');
    } finally {
      setBusy(null);
      load();
    }
  };

  const failed = services.filter((s) => s.active === 'failed').length;

  return (
    <div className="h-full bg-panel-inset border border-border rounded-lg p-4 space-y-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
          <Cog className="w-4 h-4 text-sky-400" /> Services
          <span className="text-xs font-normal text-content-muted">· {serverName}</span>
          {failed > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">{failed} failed</span>}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-content-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className="w-full pl-8 pr-2 py-1.5 bg-panel border border-border rounded text-xs text-content-primary focus:outline-none focus:border-sky-500"
          />
        </div>
        <div className="flex gap-1">
          {(['running', 'failed', 'inactive', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded text-[11px] capitalize transition ${filter === f ? 'bg-sky-600 text-white' : 'bg-panel-alt text-content-muted hover:text-content-primary'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt border border-border text-xs text-content-secondary hover:bg-border transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} /> Refresh
        </button>
      </div>

      {!available && !loading && (
        <div className="p-8 text-center text-xs text-content-muted flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          {error || 'Service listing is unavailable on this server.'}
        </div>
      )}

      {available && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-content-muted border-b border-border">
                <th className="py-2 px-2">Service</th>
                <th className="py-2 px-2">State</th>
                <th className="py-2 px-2">Boot</th>
                <th className="py-2 px-2 hidden lg:table-cell">Description</th>
                {canAct && <th className="py-2 px-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visible.map((s) => (
                <tr key={s.name} className="hover:bg-panel-alt/40">
                  <td className="py-1.5 px-2 font-mono text-content-primary">{s.name}</td>
                  <td className="py-1.5 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] ${
                        s.active === 'active'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : s.active === 'failed'
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-panel-alt text-content-muted border-border'
                      }`}
                    >
                      {s.active}/{s.sub}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-content-muted">{s.enabled}</td>
                  <td className="py-1.5 px-2 text-content-muted hidden lg:table-cell truncate max-w-xs">{s.description}</td>
                  {canAct && (
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      {busy === s.name ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin inline text-sky-400" />
                      ) : (
                        <>
                          {s.active !== 'active' && (
                            <button title="Start" aria-label={`Start ${s.name}`} onClick={() => run(s.name, 'start')} className="p-1 text-content-muted hover:text-emerald-400">
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {s.active === 'active' && (
                            <button title="Stop" aria-label={`Stop ${s.name}`} onClick={() => setConfirm({ name: s.name, action: 'stop' })} className="p-1 text-content-muted hover:text-rose-400">
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button title="Restart" aria-label={`Restart ${s.name}`} onClick={() => setConfirm({ name: s.name, action: 'restart' })} className="p-1 text-content-muted hover:text-amber-400">
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-content-muted italic">
                    {loading ? 'Loading…' : 'No services match.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title={`${confirm?.action === 'stop' ? 'Stop' : 'Restart'} ${confirm?.name ?? ''}?`}
        description={`This runs "systemctl ${confirm?.action} ${confirm?.name}" on ${serverName}. Active connections to the service may be interrupted.`}
        confirmLabel={confirm?.action === 'stop' ? 'Stop service' : 'Restart service'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm!;
          setConfirm(null);
          void run(c.name, c.action);
        }}
      />
    </div>
  );
};

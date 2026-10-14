import React, { useCallback, useEffect, useState } from 'react';
import { Puzzle, ShieldAlert, Power } from 'lucide-react';
import { api, PluginStatus } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

const PERMISSION_INFO: Record<string, string> = {
  'servers.read': 'See your server list and latest telemetry (never credentials)',
  'ssh.exec': 'Run commands on your servers over SSH (every command is audit-logged)',
  events: 'Listen to internal events: metrics, alerts, status changes, audit log entries',
  notify: 'Send messages through your notification channels and register new channel types',
  routes: 'Expose its own API endpoints under /api/plugins/<id>/',
  scheduler: 'Run background tasks on a timer',
};

export const PluginsManagerPage: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [approving, setApproving] = useState<PluginStatus | null>(null);

  const load = useCallback(async () => {
    try {
      setPlugins((await api.getPlugins()).plugins);
    } catch (err: any) {
      showToast(err.message || 'Failed to load plugins', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== 'admin') {
    return <div className="p-6 text-xs text-content-muted">Only administrators can manage plugins.</div>;
  }

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, 'success');
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    }
    await load();
    onChanged();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold text-content-primary flex items-center gap-2">
          <Puzzle className="w-5 h-5 text-sky-400" /> Plugins
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Plugins live in the <code className="font-mono">plugins/</code> folder next to the server. They run inside the server process, so only enable
          plugins whose code you trust.
        </p>
      </div>

      {plugins.length === 0 && <p className="text-xs text-content-muted italic">No plugins found.</p>}

      {plugins.map((p) => (
        <div key={p.id} className="p-4 bg-panel/80 border border-border rounded-xl space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-content-primary flex items-center gap-2">
                {p.name}
                <span className="text-[10px] font-mono text-content-muted">v{p.version}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    p.active ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-content-muted border-border bg-panel-alt'
                  }`}
                >
                  {p.active ? 'running' : p.enabled ? 'enabled (not running)' : 'disabled'}
                </span>
              </div>
              <p className="text-xs text-content-muted mt-1">{p.description}</p>
            </div>
            <button
              onClick={() => (p.enabled ? act(() => api.disablePlugin(p.id), `${p.name} disabled`) : setApproving(p))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium flex-shrink-0 transition ${
                p.enabled ? 'bg-panel-alt border border-border text-content-primary hover:bg-border' : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" /> {p.enabled ? 'Disable' : 'Enable…'}
            </button>
          </div>

          {p.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.permissions.map((perm) => (
                <span key={perm} title={PERMISSION_INFO[perm]} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-panel-alt border border-border text-content-secondary">
                  {perm}
                </span>
              ))}
            </div>
          )}
          {p.error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <ShieldAlert className="w-3.5 h-3.5" /> {p.error}
            </div>
          )}
        </div>
      ))}

      <ConfirmDialog
        isOpen={!!approving}
        danger={false}
        title={`Enable ${approving?.name ?? 'plugin'}?`}
        description={
          approving?.permissions.length
            ? 'This plugin is requesting: ' +
              approving.permissions.map((perm) => `${perm} — ${PERMISSION_INFO[perm] ?? ''}`).join(' • ')
            : 'This plugin requests no special permissions.'
        }
        confirmLabel="Approve & enable"
        onCancel={() => setApproving(null)}
        onConfirm={() => {
          const p = approving!;
          setApproving(null);
          void act(() => api.enablePlugin(p.id, p.permissions), `${p.name} enabled`);
        }}
      />
    </div>
  );
};

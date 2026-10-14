import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, CheckCircle2, Plus, Send, Trash2, Radio } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AlertEventDTO, AlertMetric, AlertRuleDTO, NotificationChannelDTO, ServerDTO } from '@server-console/shared';

const METRICS: Array<{ value: AlertMetric; label: string; unit: string }> = [
  { value: 'cpu', label: 'CPU usage', unit: '%' },
  { value: 'mem', label: 'Memory usage', unit: '%' },
  { value: 'disk', label: 'Disk usage (fullest)', unit: '%' },
  { value: 'load', label: 'Load average (1m)', unit: '' },
  { value: 'offline', label: 'Server unreachable', unit: '' },
];

const inputCls =
  'w-full bg-panel-inset border border-border rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-sky-500';
const btnCls = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition';

function ruleSummary(r: AlertRuleDTO): string {
  const m = METRICS.find((x) => x.value === r.metric)!;
  if (r.metric === 'offline') return `Unreachable${r.durationMin ? ` for ${r.durationMin} min` : ''}`;
  return `${m.label} > ${r.threshold}${m.unit}${r.durationMin ? ` for ${r.durationMin} min` : ''}`;
}

export const AlertsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState<AlertRuleDTO[]>([]);
  const [events, setEvents] = useState<AlertEventDTO[]>([]);
  const [channels, setChannels] = useState<NotificationChannelDTO[]>([]);
  const [drivers, setDrivers] = useState<Array<{ type: string; label: string; fields: string[] }>>([]);
  const [servers, setServers] = useState<ServerDTO[]>([]);

  const [rule, setRule] = useState({ name: '', serverId: '', metric: 'cpu' as AlertMetric, threshold: 90, durationMin: 5, channelIds: [] as string[] });
  const [chan, setChan] = useState({ name: '', type: 'telegram', config: {} as Record<string, string> });

  const load = useCallback(async () => {
    try {
      const [r, e, s] = await Promise.all([api.getAlertRules(), api.getAlertEvents(30), api.getServers()]);
      setRules(r.rules);
      setEvents(e.events);
      setServers(s.servers);
      if (isAdmin) {
        const c = await api.getChannels();
        setChannels(c.channels);
        setDrivers(c.drivers);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load alerts', 'error');
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) showToast(ok, 'success');
      await load();
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    }
  };

  const serverName = (id: string | null) => (id ? servers.find((s) => s.id === id)?.name || 'unknown server' : 'All servers');
  const driver = drivers.find((d) => d.type === chan.type);
  const open = events.filter((e) => !e.resolvedAt);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-content-primary flex items-center gap-2">
          <Bell className="w-5 h-5 text-sky-400" /> Alerts & Notifications
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Rules are evaluated every minute against collected metrics. A rule fires only when the condition holds for its whole duration.
        </p>
      </div>

      {/* Active */}
      <div className={`p-4 rounded-xl border ${open.length ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
        {open.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> No active alerts
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-rose-400 font-semibold">
              <BellRing className="w-4 h-4" /> {open.length} active alert{open.length > 1 ? 's' : ''}
            </div>
            {open.map((e) => (
              <div key={e.id} className="text-xs text-content-secondary font-mono">
                {e.serverName} — {e.ruleName} (peak {e.peakValue ?? '—'}) since {new Date(e.startedAt).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rules */}
        <section className="p-4 bg-panel/80 border border-border rounded-xl space-y-3">
          <h2 className="text-sm font-semibold text-content-primary">Alert rules</h2>
          {rules.length === 0 && <p className="text-xs text-content-muted italic">No rules yet.</p>}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 rounded bg-panel-alt/60 border border-border text-xs">
              <div className="min-w-0">
                <div className="font-medium text-content-primary truncate">{r.name}</div>
                <div className="text-content-muted font-mono">
                  {ruleSummary(r)} · {serverName(r.serverId)} · {r.channelIds.length} channel{r.channelIds.length === 1 ? '' : 's'}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="flex items-center gap-1 text-content-muted cursor-pointer">
                    <input type="checkbox" checked={r.isEnabled} onChange={(e) => guard(() => api.setAlertRuleEnabled(r.id, e.target.checked))} />
                    on
                  </label>
                  <button
                    aria-label={`Delete rule ${r.name}`}
                    onClick={() => guard(() => api.deleteAlertRule(r.id), 'Rule deleted')}
                    className="text-content-muted hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {isAdmin && (
            <form
              className="pt-3 border-t border-border space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                guard(async () => {
                  await api.createAlertRule({ ...rule, serverId: rule.serverId || null });
                  setRule({ ...rule, name: '' });
                }, 'Rule created');
              }}
            >
              <input className={inputCls} placeholder="Rule name (e.g. High CPU)" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} required />
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={rule.metric} onChange={(e) => setRule({ ...rule, metric: e.target.value as AlertMetric })}>
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select className={inputCls} value={rule.serverId} onChange={(e) => setRule({ ...rule, serverId: e.target.value })}>
                  <option value="">All servers</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {rule.metric !== 'offline' && (
                  <label className="text-[11px] text-content-muted">
                    Threshold
                    <input type="number" className={inputCls} value={rule.threshold} onChange={(e) => setRule({ ...rule, threshold: Number(e.target.value) })} />
                  </label>
                )}
                <label className="text-[11px] text-content-muted">
                  Sustained for (minutes)
                  <input type="number" min={0} max={1440} className={inputCls} value={rule.durationMin} onChange={(e) => setRule({ ...rule, durationMin: Number(e.target.value) })} />
                </label>
              </div>
              <div className="text-[11px] text-content-muted">
                Notify:
                {channels.length === 0 && <span className="italic"> add a channel first (optional — events are still recorded)</span>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-1 cursor-pointer text-content-secondary">
                      <input
                        type="checkbox"
                        checked={rule.channelIds.includes(c.id)}
                        onChange={(e) =>
                          setRule({ ...rule, channelIds: e.target.checked ? [...rule.channelIds, c.id] : rule.channelIds.filter((x) => x !== c.id) })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className={`${btnCls} bg-sky-600 hover:bg-sky-500 text-white`}>
                <Plus className="w-3.5 h-3.5" /> Add rule
              </button>
            </form>
          )}
        </section>

        {/* Channels */}
        <section className="p-4 bg-panel/80 border border-border rounded-xl space-y-3">
          <h2 className="text-sm font-semibold text-content-primary">Notification channels</h2>
          {!isAdmin && <p className="text-xs text-content-muted italic">Only administrators can view and manage channels.</p>}
          {isAdmin && channels.length === 0 && <p className="text-xs text-content-muted italic">No channels yet.</p>}
          {isAdmin &&
            channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-2.5 rounded bg-panel-alt/60 border border-border text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-content-primary truncate flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-sky-400" /> {c.name}
                  </div>
                  <div className="text-content-muted font-mono">{c.type} · {c.summary}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => guard(() => api.testChannel(c.id), 'Test notification sent')}
                    className="flex items-center gap-1 text-content-muted hover:text-sky-400"
                  >
                    <Send className="w-3.5 h-3.5" /> Test
                  </button>
                  <label className="flex items-center gap-1 text-content-muted cursor-pointer">
                    <input type="checkbox" checked={c.isEnabled} onChange={(e) => guard(() => api.setChannelEnabled(c.id, e.target.checked))} />
                    on
                  </label>
                  <button aria-label={`Delete channel ${c.name}`} onClick={() => guard(() => api.deleteChannel(c.id), 'Channel deleted')} className="text-content-muted hover:text-rose-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

          {isAdmin && (
            <form
              className="pt-3 border-t border-border space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                guard(async () => {
                  await api.createChannel(chan);
                  setChan({ name: '', type: chan.type, config: {} });
                }, 'Channel added');
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Channel name" value={chan.name} onChange={(e) => setChan({ ...chan, name: e.target.value })} required />
                <select className={inputCls} value={chan.type} onChange={(e) => setChan({ ...chan, type: e.target.value, config: {} })}>
                  {drivers.map((d) => (
                    <option key={d.type} value={d.type}>{d.label}</option>
                  ))}
                </select>
              </div>
              {driver?.fields.map((f) => (
                <input
                  key={f}
                  className={inputCls}
                  type={/token|secret|url/i.test(f) ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder={f}
                  value={chan.config[f] || ''}
                  onChange={(e) => setChan({ ...chan, config: { ...chan.config, [f]: e.target.value } })}
                  required
                />
              ))}
              <p className="text-[11px] text-content-muted">Secrets are encrypted at rest and never shown again.</p>
              <button type="submit" className={`${btnCls} bg-sky-600 hover:bg-sky-500 text-white`}>
                <Plus className="w-3.5 h-3.5" /> Add channel
              </button>
            </form>
          )}
        </section>
      </div>

      {/* History */}
      <section className="p-4 bg-panel/80 border border-border rounded-xl">
        <h2 className="text-sm font-semibold text-content-primary mb-3">Recent alert events</h2>
        {events.length === 0 ? (
          <p className="text-xs text-content-muted italic">Nothing has fired yet.</p>
        ) : (
          <div className="space-y-1">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-xs font-mono py-1 border-b border-border/50 last:border-0">
                <span className={`w-2 h-2 rounded-full ${e.resolvedAt ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                <span className="text-content-primary">{e.serverName}</span>
                <span className="text-content-secondary">{e.ruleName}</span>
                <span className="text-content-muted ml-auto">
                  {new Date(e.startedAt).toLocaleString()}
                  {e.resolvedAt ? ` → ${new Date(e.resolvedAt).toLocaleTimeString()}` : ' (active)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export interface PluginWidget {
  type: 'stats' | 'table' | 'form' | 'text';
  title?: string;
  source?: string;
  columns?: Array<{ key: string; label: string; format?: 'text' | 'badge' | 'datetime' }>;
  rowActions?: Array<{ label: string; method: 'POST' | 'PUT' | 'DELETE'; path: string; confirm?: boolean }>;
  submit?: { method: 'POST' | 'PUT'; path: string };
  fields?: Array<{ name: string; label: string; type?: 'text' | 'number' | 'select'; required?: boolean; placeholder?: string; options?: string[]; default?: string | number }>;
}

export interface PluginPageDef {
  id: string;
  title: string;
  icon?: string;
  widgets: PluginWidget[];
}

const BADGE: Record<string, string> = {
  up: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  down: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};
const TONE: Record<string, string> = { good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-rose-400' };

const inputCls = 'w-full bg-panel-inset border border-border rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-sky-500';

/** Fills :param placeholders in a plugin path from a table row. */
const fillPath = (path: string, row: Record<string, any>) => path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(String(row[k] ?? '')));

const Widget: React.FC<{ pluginId: string; w: PluginWidget; version: number; bump: () => void }> = ({ pluginId, w, version, bump }) => {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [pendingAction, setPendingAction] = useState<{ label: string; run: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!w.source) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.pluginRequest(pluginId, 'GET', w.source!);
        if (!cancelled) {
          setData(res);
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
  }, [pluginId, w.source, version]);

  const call = async (method: string, path: string, body?: unknown, okMsg?: string) => {
    try {
      await api.pluginRequest(pluginId, method, path, body);
      if (okMsg) showToast(okMsg, 'success');
      bump();
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-panel/80 border border-border rounded-xl text-xs text-rose-400">
        {w.title ? `${w.title}: ` : ''}
        {error}
      </div>
    );
  }

  const rows: any[] = Array.isArray(data) ? data : data?.rows ?? [];

  return (
    <div className="p-4 bg-panel/80 border border-border rounded-xl">
      {w.title && <h2 className="text-sm font-semibold text-content-primary mb-3">{w.title}</h2>}

      {w.type === 'stats' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rows.map((s) => (
            <div key={s.label} className="p-3 rounded bg-panel-alt/60 border border-border">
              <div className="text-[11px] text-content-muted">{s.label}</div>
              <div className={`text-xl font-semibold font-mono ${TONE[s.tone] || 'text-content-primary'}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {w.type === 'text' && <pre className="text-xs text-content-secondary whitespace-pre-wrap font-mono">{data?.text ?? '…'}</pre>}

      {w.type === 'table' && (
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-xs text-content-muted italic">Nothing here yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-content-muted border-b border-border">
                  {w.columns?.map((c) => (
                    <th key={c.key} className="py-1.5 pr-3 font-medium">{c.label}</th>
                  ))}
                  {w.rowActions && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? i} className="border-b border-border/50 last:border-0">
                    {w.columns?.map((c) => {
                      const v = row[c.key];
                      return (
                        <td key={c.key} className="py-1.5 pr-3 font-mono text-content-secondary">
                          {c.format === 'badge' ? (
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${BADGE[String(v)] || 'bg-panel-alt text-content-muted border-border'}`}>{String(v ?? '—')}</span>
                          ) : c.format === 'datetime' ? (
                            v ? new Date(v).toLocaleString() : '—'
                          ) : (
                            String(v ?? '—')
                          )}
                        </td>
                      );
                    })}
                    {w.rowActions && (
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {w.rowActions.map((a) => (
                          <button
                            key={a.label}
                            className="text-content-muted hover:text-rose-400 ml-2"
                            onClick={() => {
                              const run = () => call(a.method, fillPath(a.path, row));
                              a.confirm ? setPendingAction({ label: `${a.label} "${row.name ?? row.id}"`, run }) : void run();
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {w.type === 'form' && w.submit && (
        <form
          className="grid md:grid-cols-3 gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const body: Record<string, any> = {};
            for (const f of w.fields ?? []) {
              const v = form[f.name] ?? f.default ?? (f.type === 'select' ? f.options?.[0] : '');
              body[f.name] = f.type === 'number' ? Number(v) : v;
            }
            void call(w.submit!.method, w.submit!.path, body, 'Saved').then(() => setForm({}));
          }}
        >
          {w.fields?.map((f) => (
            <label key={f.name} className="text-[11px] text-content-muted">
              {f.label}
              {f.type === 'select' ? (
                <select className={inputCls} value={form[f.name] ?? f.default ?? f.options?.[0]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  {f.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  type={f.type === 'number' ? 'number' : 'text'}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              )}
            </label>
          ))}
          <button type="submit" className="px-3 py-1.5 rounded text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white md:col-span-3 w-fit">
            Submit
          </button>
        </form>
      )}

      <ConfirmDialog
        isOpen={!!pendingAction}
        title="Please confirm"
        description={pendingAction?.label ?? ''}
        confirmLabel="Confirm"
        onCancel={() => setPendingAction(null)}
        onConfirm={async () => {
          const p = pendingAction;
          setPendingAction(null);
          await p?.run();
        }}
      />
    </div>
  );
};

export const PluginPage: React.FC<{ pluginId: string; pluginName: string; page: PluginPageDef }> = ({ pluginId, pluginName, page }) => {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold text-content-primary">{page.title}</h1>
        <p className="text-[11px] text-content-muted">Provided by plugin “{pluginName}”</p>
      </div>
      {page.widgets.map((w, i) => (
        <Widget key={i} pluginId={pluginId} w={w} version={version} bump={bump} />
      ))}
    </div>
  );
};

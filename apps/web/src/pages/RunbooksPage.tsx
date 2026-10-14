import React, { useCallback, useEffect, useState } from 'react';
import { PlayCircle, Plus, Trash2, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, ScrollText } from 'lucide-react';
import { api, RunbookDTO, RunbookRunDTO } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ServerDTO } from '@server-console/shared';

const TEMPLATES: Array<{ label: string; name: string; script: string }> = [
  { label: 'Disk & memory report', name: 'Disk & memory report', script: 'df -h --total | tail -n 15\necho\nfree -h\necho\nuptime' },
  { label: 'Pending package updates (read-only)', name: 'Pending updates', script: 'if command -v apt >/dev/null; then apt list --upgradable 2>/dev/null | tail -n +2; elif command -v dnf >/dev/null; then dnf check-update; else echo "no supported package manager"; fi' },
  { label: 'Top memory consumers', name: 'Top memory consumers', script: 'ps -eo pid,user,%mem,%cpu,comm --sort=-%mem | head -n 11' },
  { label: 'Docker: prune unused images', name: 'Docker image prune', script: 'docker image prune -f' },
  { label: 'Failed systemd units', name: 'Failed units', script: 'systemctl --failed --no-legend --no-pager || true' },
];

const inputCls = 'w-full bg-panel-inset border border-border rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-sky-500';

const RunView: React.FC<{ run: RunbookRunDTO }> = ({ run }) => {
  const [open, setOpen] = useState<string | null>(null);
  const failed = run.results.filter((r) => !r.ok).length;
  return (
    <div className="border border-border rounded bg-panel-alt/40 text-xs">
      <div className="flex items-center gap-3 px-3 py-2">
        {!run.finishedAt ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" /> : failed ? <XCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        <span className="font-medium text-content-primary">{run.runbookName}</span>
        <span className="text-content-muted font-mono">
          {run.trigger}
          {run.startedBy ? ` · ${run.startedBy}` : ''} · {new Date(run.startedAt).toLocaleString()}
        </span>
        <span className="ml-auto font-mono text-content-muted">
          {run.results.length - failed} ok{failed ? `, ${failed} failed` : ''}
        </span>
      </div>
      {run.results.map((r) => (
        <div key={r.serverId} className="border-t border-border/60">
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-panel-alt/60" onClick={() => setOpen(open === r.serverId ? null : r.serverId)}>
            {open === r.serverId ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span className={r.ok ? 'text-emerald-400' : 'text-rose-400'}>{r.ok ? '✓' : '✗'}</span>
            <span className="text-content-primary">{r.serverName}</span>
            <span className="text-content-muted font-mono ml-auto">
              {r.error ? r.error : `exit ${r.exitCode}`} · {(r.durationMs / 1000).toFixed(1)}s
            </span>
          </button>
          {open === r.serverId && (
            <pre className="mx-3 mb-2 p-2 bg-black/40 rounded text-[11px] font-mono text-content-secondary whitespace-pre-wrap max-h-72 overflow-auto">
              {r.output || r.error || '(no output)'}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
};

export const RunbooksPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [runbooks, setRunbooks] = useState<RunbookDTO[]>([]);
  const [runs, setRuns] = useState<RunbookRunDTO[]>([]);
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [toRun, setToRun] = useState<RunbookDTO | null>(null);
  const [toDelete, setToDelete] = useState<RunbookDTO | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    script: '',
    targetType: 'all' as RunbookDTO['targetType'],
    group: '',
    serverIds: [] as string[],
    scheduled: false,
    intervalMin: 60,
    timeoutSec: 60,
  });

  const load = useCallback(async () => {
    try {
      const [rb, sv] = await Promise.all([api.getRunbooks(), api.getServers()]);
      setRunbooks(rb.runbooks);
      setRuns(rb.runs);
      setServers(sv.servers);
    } catch (err: any) {
      showToast(err.message || 'Failed to load runbooks', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (user?.role !== 'admin') {
    return <div className="p-6 text-xs text-content-muted">Only administrators can manage and run runbooks.</div>;
  }

  const groups = [...new Set(servers.map((s) => s.serverGroup || 'Default'))];

  const targetLabel = (r: RunbookDTO) =>
    r.targetType === 'all' ? 'All servers' : r.targetType === 'group' ? `Group: ${r.targetValue}` : `${r.targetValue.split(',').filter(Boolean).length} server(s)`;

  const execute = async (rb: RunbookDTO) => {
    setRunning(rb.id);
    try {
      const { run } = await api.runRunbook(rb.id);
      const failed = run.results.filter((r) => !r.ok).length;
      showToast(failed ? `${rb.name}: ${failed} server(s) failed` : `${rb.name}: completed on ${run.results.length} server(s)`, failed ? 'error' : 'success');
    } catch (err: any) {
      showToast(err.message || 'Run failed', 'error');
    } finally {
      setRunning(null);
      load();
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-content-primary flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-sky-400" /> Runbooks
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Saved scripts executed over SSH on one or many servers, on demand or on a schedule. Scripts run as each server&apos;s SSH user via{' '}
          <code className="font-mono">bash</code>; every run is recorded in the audit log.
        </p>
      </div>

      <section className="p-4 bg-panel/80 border border-border rounded-xl space-y-2">
        <h2 className="text-sm font-semibold text-content-primary">Your runbooks</h2>
        {runbooks.length === 0 && <p className="text-xs text-content-muted italic">None yet — create one below, or start from a template.</p>}
        {runbooks.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-2.5 rounded bg-panel-alt/60 border border-border text-xs">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-content-primary truncate">{r.name}</div>
              <div className="text-content-muted font-mono">
                {targetLabel(r)} · {r.intervalMin ? `every ${r.intervalMin} min` : 'manual'} · timeout {r.timeoutSec}s
              </div>
            </div>
            <button
              disabled={running === r.id}
              onClick={() => setToRun(r)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition disabled:opacity-60"
            >
              {running === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />} Run
            </button>
            <button aria-label={`Delete ${r.name}`} onClick={() => setToDelete(r)} className="text-content-muted hover:text-rose-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </section>

      <section className="p-4 bg-panel/80 border border-border rounded-xl">
        <h2 className="text-sm font-semibold text-content-primary mb-3">New runbook</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.createRunbook({
                name: form.name,
                description: form.description,
                script: form.script,
                targetType: form.targetType,
                targetValue: form.targetType === 'group' ? form.group || groups[0] : form.targetType === 'servers' ? form.serverIds.join(',') : '',
                intervalMin: form.scheduled ? form.intervalMin : null,
                timeoutSec: form.timeoutSec,
              });
              showToast('Runbook saved', 'success');
              setForm({ ...form, name: '', description: '', script: '' });
              load();
            } catch (err: any) {
              showToast(err.message || 'Failed to save', 'error');
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
            Start from:
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => setForm({ ...form, name: t.name, script: t.script })} className="px-2 py-0.5 rounded bg-panel-alt border border-border hover:text-content-primary">
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <textarea
            className={`${inputCls} font-mono h-36`}
            placeholder={'#!/bin/bash\n# commands to run on each target server'}
            value={form.script}
            onChange={(e) => setForm({ ...form, script: e.target.value })}
            spellCheck={false}
            required
          />
          <div className="grid md:grid-cols-3 gap-2 items-end">
            <label className="text-[11px] text-content-muted">
              Targets
              <select className={inputCls} value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as RunbookDTO['targetType'] })}>
                <option value="all">All enabled servers</option>
                <option value="group">A server group</option>
                <option value="servers">Specific servers</option>
              </select>
            </label>
            {form.targetType === 'group' && (
              <label className="text-[11px] text-content-muted">
                Group
                <select className={inputCls} value={form.group || groups[0]} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                  {groups.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            )}
            {form.targetType === 'servers' && (
              <div className="text-[11px] text-content-muted md:col-span-2 flex flex-wrap gap-x-3 gap-y-1">
                {servers.map((s) => (
                  <label key={s.id} className="flex items-center gap-1 text-content-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.serverIds.includes(s.id)}
                      onChange={(e) => setForm({ ...form, serverIds: e.target.checked ? [...form.serverIds, s.id] : form.serverIds.filter((x) => x !== s.id) })}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <label className="text-[11px] text-content-muted">
              Timeout (seconds)
              <input type="number" min={5} max={600} className={inputCls} value={form.timeoutSec} onChange={(e) => setForm({ ...form, timeoutSec: Number(e.target.value) })} />
            </label>
            <div className="text-[11px] text-content-muted flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-content-secondary">
                <input type="checkbox" checked={form.scheduled} onChange={(e) => setForm({ ...form, scheduled: e.target.checked })} /> Run every
              </label>
              <input
                type="number"
                min={1}
                max={10080}
                disabled={!form.scheduled}
                className={`${inputCls} w-20`}
                value={form.intervalMin}
                onChange={(e) => setForm({ ...form, intervalMin: Number(e.target.value) })}
              />
              min
            </div>
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white">
            <Plus className="w-3.5 h-3.5" /> Save runbook
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-content-primary">Recent runs</h2>
        {runs.length === 0 && <p className="text-xs text-content-muted italic">No runs yet.</p>}
        {runs.map((r) => (
          <RunView key={r.id} run={r} />
        ))}
      </section>

      <ConfirmDialog
        isOpen={!!toRun}
        danger={false}
        title={`Run "${toRun?.name ?? ''}"?`}
        description={toRun ? `This executes the script on: ${targetLabel(toRun)}. It runs with each server's SSH account.` : ''}
        confirmLabel="Run now"
        onCancel={() => setToRun(null)}
        onConfirm={() => {
          const r = toRun!;
          setToRun(null);
          void execute(r);
        }}
      />
      <ConfirmDialog
        isOpen={!!toDelete}
        title={`Delete "${toDelete?.name ?? ''}"?`}
        description="The runbook, its schedule and its run history will be removed."
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const r = toDelete!;
          setToDelete(null);
          try {
            await api.deleteRunbook(r.id);
            load();
          } catch (err: any) {
            showToast(err.message, 'error');
          }
        }}
      />
    </div>
  );
};

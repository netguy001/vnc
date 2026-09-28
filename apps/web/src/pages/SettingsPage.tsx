import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Database,
  Lock,
  FileText,
  RefreshCw,
  Terminal,
  CheckCircle,
  HelpCircle,
  Cpu,
} from 'lucide-react';
import { api } from '../api/client';
import { AuditLogDTO } from '@server-console/shared';

export const SettingsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getAuditLogs(50);
      setLogs(res.logs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-y-auto p-2">
      <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-400" />
          <span>Security & System Architecture</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configuration parameters, cryptographic key management, and security audit log
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Security Cards */}
        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Credential Encryption</span>
          </div>
          <p className="text-xs text-slate-400">
            All SSH passwords, private keys, and VNC secrets are encrypted in SQLite using authenticated <strong className="text-slate-200">AES-256-GCM</strong> with 96-bit random IVs.
          </p>
          <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-emerald-400 flex items-center justify-between">
            <span>Algorithm: AES-256-GCM</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Key className="w-4 h-4 text-sky-400" />
            <span>Session Authentication</span>
          </div>
          <p className="text-xs text-slate-400">
            Sessions are validated using signed JWT tokens with HttpOnly cookies or Bearer tokens, protecting both REST API and WebSocket bridges.
          </p>
          <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-sky-400 flex items-center justify-between">
            <span>WebSocket Auth: Active</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Database className="w-4 h-4 text-purple-400" />
            <span>Storage & Persistence</span>
          </div>
          <p className="text-xs text-slate-400">
            Local SQLite database with WAL (Write-Ahead Logging) enabled. The data-access layer is architected for drop-in PostgreSQL migration.
          </p>
          <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-purple-400 flex items-center justify-between">
            <span>Driver: Native SQLite (WAL)</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-semibold">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Audit Trail Logs</span>
          </div>

          <button
            onClick={fetchLogs}
            disabled={isLoadingLogs}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-sans text-[11px]">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Operator</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Details</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {logs.length === 0 && !isLoadingLogs && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans italic">
                    No audit records recorded yet.
                  </td>
                </tr>
              )}

              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-slate-500 text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-300 font-sans">
                    {log.username || 'system'}
                  </td>
                  <td className="py-2 px-3 text-sky-400 font-bold">
                    {log.action}
                  </td>
                  <td className="py-2 px-3 text-slate-400 truncate max-w-sm">
                    {log.details || '—'}
                  </td>
                  <td className="py-2 px-3">
                    {log.success ? (
                      <span className="text-emerald-400 font-sans text-[11px] font-medium">SUCCESS</span>
                    ) : (
                      <span className="text-rose-400 font-sans text-[11px] font-medium">FAILED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

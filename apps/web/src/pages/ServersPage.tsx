import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Search,
  Shield,
  Edit,
  Trash2,
  Monitor,
  Terminal,
  Folder,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { ServerDTO, ConnectionTestResult } from '@server-console/shared';
import { ServerModal } from '../components/servers/ServerModal';

interface ServersPageProps {
  onOpenServer: (serverId: string, tab: string) => void;
}

export const ServersPage: React.FC<ServersPageProps> = ({ onOpenServer }) => {
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerDTO | null>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; res: ConnectionTestResult } | null>(null);

  const loadServers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getServers();
      setServers(res.servers);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleTestConnection = async (id: string) => {
    setTestingServerId(id);
    setTestResult(null);
    try {
      const res = await api.testConnection(id);
      setTestResult({ id, res: res.result });
      await loadServers();
    } catch (err: any) {
      alert('Test failed: ' + err.message);
    } finally {
      setTestingServerId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete server "${name}"?`)) return;
    try {
      await api.deleteServer(id);
      await loadServers();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const groups = Array.from(new Set(servers.map((s) => s.serverGroup || 'Default')));

  const filteredServers = servers.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.host.toLowerCase().includes(search.toLowerCase());
    const matchGroup = selectedGroup === 'ALL' || s.serverGroup === selectedGroup;
    return matchSearch && matchGroup;
  });

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-hidden p-2">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by server name, host or IP..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">All Groups ({servers.length})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingServer(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Server</span>
          </button>

          <button
            onClick={loadServers}
            disabled={isLoading}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Test Result Toast */}
      {testResult && (
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Connection probe results:</span>
            <span className={testResult.res.sshSuccess ? 'text-emerald-400' : 'text-rose-400'}>
              SSH: {testResult.res.sshMessage}
            </span>
            <span className="text-slate-600">|</span>
            <span className={testResult.res.vncSuccess ? 'text-emerald-400' : 'text-rose-400'}>
              VNC: {testResult.res.vncMessage}
            </span>
            {testResult.res.latencyMs !== undefined && (
              <span className="text-slate-500">({testResult.res.latencyMs}ms)</span>
            )}
          </div>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      )}

      {/* Servers Table */}
      <div className="flex-1 bg-slate-900/60 rounded-xl border border-slate-800 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 select-none">
            <tr>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium">Name & Group</th>
              <th className="py-3 px-4 font-medium">Host / SSH</th>
              <th className="py-3 px-4 font-medium">VNC Desktop</th>
              <th className="py-3 px-4 font-medium">Auth</th>
              <th className="py-3 px-4 font-medium text-right">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filteredServers.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                  No matching servers found.
                </td>
              </tr>
            )}

            {filteredServers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/40 transition">
                {/* Status */}
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      s.status === 'connected'
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                        : s.status === 'connecting'
                        ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                        : s.status === 'error'
                        ? 'bg-rose-950/80 text-rose-400 border-rose-800/60'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'connected'
                          ? 'bg-emerald-400'
                          : s.status === 'connecting'
                          ? 'bg-amber-400 animate-ping'
                          : s.status === 'error'
                          ? 'bg-rose-400'
                          : 'bg-slate-500'
                      }`}
                    />
                    {s.status.toUpperCase()}
                  </span>
                </td>

                {/* Name & Group */}
                <td className="py-3 px-4 font-semibold text-slate-100">
                  <div className="flex items-center gap-2">
                    <span>{s.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-normal">
                      {s.serverGroup || 'Default'}
                    </span>
                  </div>
                  {s.description && (
                    <div className="text-[11px] text-slate-500 font-normal truncate max-w-xs mt-0.5">
                      {s.description}
                    </div>
                  )}
                </td>

                {/* Host / SSH */}
                <td className="py-3 px-4 font-mono text-slate-400">
                  {s.sshUsername}@{s.host}:{s.sshPort}
                </td>

                {/* VNC */}
                <td className="py-3 px-4 font-mono text-xs">
                  {s.vncEnabled ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{s.vncPort || 5900}</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">Disabled</span>
                  )}
                </td>

                {/* Auth */}
                <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                  {s.authMethod === 'password' ? 'Password' : 'Key'}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Launch Buttons */}
                    {s.vncEnabled && (
                      <button
                        onClick={() => onOpenServer(s.id, 'console')}
                        className="p-1.5 rounded hover:bg-slate-800 text-sky-400 border border-slate-800 hover:border-slate-700"
                        title="VNC Remote Desktop"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onOpenServer(s.id, 'terminal')}
                      className="p-1.5 rounded hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-slate-700"
                      title="SSH Terminal"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onOpenServer(s.id, 'files')}
                      className="p-1.5 rounded hover:bg-slate-800 text-amber-400 border border-slate-800 hover:border-slate-700"
                      title="SFTP File Manager"
                    >
                      <Folder className="w-3.5 h-3.5" />
                    </button>

                    {/* Test */}
                    <button
                      onClick={() => handleTestConnection(s.id)}
                      disabled={testingServerId === s.id}
                      className="p-1.5 rounded hover:bg-slate-800 text-purple-400 border border-slate-800 hover:border-slate-700 disabled:opacity-50"
                      title="Test Connection Reachability"
                    >
                      {testingServerId === s.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shield className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => {
                        setEditingServer(s);
                        setShowAddModal(true);
                      }}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
                      title="Edit Configuration"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(s.id, s.name)}
                      className="p-1.5 rounded hover:bg-slate-800 text-rose-400 border border-slate-800 hover:border-slate-700"
                      title="Delete Server"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ServerModal
        initialServer={editingServer}
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingServer(null);
        }}
        onSaved={loadServers}
      />
    </div>
  );
};

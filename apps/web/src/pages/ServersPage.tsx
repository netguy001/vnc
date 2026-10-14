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
  Copy,
  Star,
  Tag,
} from 'lucide-react';
import { api } from '../api/client';
import { ServerDTO, ConnectionTestResult } from '@server-console/shared';
import { ServerModal } from '../components/servers/ServerModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useToast } from '../context/ToastContext';

interface ServersPageProps {
  onOpenServer: (serverId: string, tab: string) => void;
}

export const ServersPage: React.FC<ServersPageProps> = ({ onOpenServer }) => {
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);

  const { showToast } = useToast();

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerDTO | null>(null);
  const [cloneMode, setCloneMode] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; res: ConnectionTestResult } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTag, setSelectedTag] = useState('ALL');

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
      showToast('Test failed: ' + err.message, 'error');
    } finally {
      setTestingServerId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteServer(deleteTarget.id);
      showToast(`Server "${deleteTarget.name}" deleted`, 'success');
      setDeleteTarget(null);
      await loadServers();
    } catch (err: any) {
      showToast('Delete failed: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const groups = Array.from(new Set(servers.map((s) => s.serverGroup || 'Default')));
  const allTags = Array.from(new Set(servers.flatMap((s) => s.tags))).sort();

  const handleToggleFavorite = async (s: ServerDTO) => {
    try {
      await api.updateServer(s.id, { isFavorite: !s.isFavorite });
      setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, isFavorite: !x.isFavorite } : x)));
    } catch (err: any) {
      showToast(err.message || 'Failed to update favorite', 'error');
    }
  };

  const filteredServers = servers
    .filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.host.toLowerCase().includes(search.toLowerCase());
      const matchGroup = selectedGroup === 'ALL' || s.serverGroup === selectedGroup;
      const matchTag = selectedTag === 'ALL' || s.tags.includes(selectedTag);
      return matchSearch && matchGroup && matchTag;
    })
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-hidden p-2">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-panel/60 rounded-xl border border-border text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by server name, host or IP..."
              className="w-full pl-9 pr-3 py-1.5 bg-panel-alt border border-border rounded text-content-secondary focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-2.5 py-1.5 bg-panel-alt border border-border rounded text-content-secondary focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">All Groups ({servers.length})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-2.5 py-1.5 bg-panel-alt border border-border rounded text-content-secondary focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingServer(null);
              setCloneMode(false);
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
            className="p-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Refresh list"
            aria-label="Refresh server list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Test Result Toast */}
      {testResult && (
        <div className="p-3 bg-panel border border-border-strong rounded-lg flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-content-muted">Connection probe results:</span>
            <span className={testResult.res.sshSuccess ? 'text-emerald-400' : 'text-rose-400'}>
              SSH: {testResult.res.sshMessage}
            </span>
            <span className="text-content-muted">|</span>
            <span className={testResult.res.vncSuccess ? 'text-emerald-400' : 'text-rose-400'}>
              VNC: {testResult.res.vncMessage}
            </span>
            {testResult.res.latencyMs !== undefined && (
              <span className="text-content-muted">({testResult.res.latencyMs}ms)</span>
            )}
          </div>
          <button onClick={() => setTestResult(null)} className="text-content-muted hover:text-content-secondary">
            ✕
          </button>
        </div>
      )}

      {/* Servers Table */}
      <div className="flex-1 bg-panel/60 rounded-xl border border-border overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-panel border-b border-border text-content-muted select-none">
            <tr>
              <th className="py-3 px-4 font-medium w-8"></th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium">Name & Group</th>
              <th className="py-3 px-4 font-medium">Host / SSH</th>
              <th className="py-3 px-4 font-medium">VNC Desktop</th>
              <th className="py-3 px-4 font-medium">Auth</th>
              <th className="py-3 px-4 font-medium text-right">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-content-secondary">
            {filteredServers.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-content-muted italic">
                  No matching servers found.
                </td>
              </tr>
            )}

            {filteredServers.map((s) => (
              <tr key={s.id} className="hover:bg-panel-alt/40 transition">
                {/* Favorite */}
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleToggleFavorite(s)}
                    title={s.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                    aria-label={s.isFavorite ? `Remove ${s.name} from favorites` : `Mark ${s.name} as favorite`}
                    className={`transition ${s.isFavorite ? 'text-amber-400' : 'text-content-muted hover:text-amber-400'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${s.isFavorite ? 'fill-amber-400' : ''}`} />
                  </button>
                </td>

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
                        : 'bg-panel-alt text-content-muted border-border'
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
                          : 'bg-content-muted'
                      }`}
                    />
                    {s.status.toUpperCase()}
                  </span>
                </td>

                {/* Name & Group */}
                <td className="py-3 px-4 font-semibold text-content-primary">
                  <div className="flex items-center gap-2">
                    <span>{s.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel-alt text-content-muted font-mono font-normal">
                      {s.serverGroup || 'Default'}
                    </span>
                  </div>
                  {s.description && (
                    <div className="text-[11px] text-content-muted font-normal truncate max-w-xs mt-0.5">
                      {s.description}
                    </div>
                  )}
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {s.tags.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-sky-600/10 border border-sky-500/20 text-sky-400 text-[10px] font-normal font-mono"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Host / SSH */}
                <td className="py-3 px-4 font-mono text-content-muted">
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
                    <span className="text-content-muted">Disabled</span>
                  )}
                </td>

                {/* Auth */}
                <td className="py-3 px-4 font-mono text-[11px] text-content-muted">
                  {s.authMethod === 'password' ? 'Password' : 'Key'}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Launch Buttons */}
                    {s.vncEnabled && (
                      <button
                        onClick={() => onOpenServer(s.id, 'console')}
                        className="p-1.5 rounded hover:bg-panel-alt text-sky-400 border border-border hover:border-border-strong"
                        title="VNC Remote Desktop"
                        aria-label={`Open VNC console for ${s.name}`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onOpenServer(s.id, 'terminal')}
                      className="p-1.5 rounded hover:bg-panel-alt text-emerald-400 border border-border hover:border-border-strong"
                      title="SSH Terminal"
                      aria-label={`Open SSH terminal for ${s.name}`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onOpenServer(s.id, 'files')}
                      className="p-1.5 rounded hover:bg-panel-alt text-amber-400 border border-border hover:border-border-strong"
                      title="SFTP File Manager"
                      aria-label={`Open SFTP file manager for ${s.name}`}
                    >
                      <Folder className="w-3.5 h-3.5" />
                    </button>

                    {/* Test */}
                    <button
                      onClick={() => handleTestConnection(s.id)}
                      disabled={testingServerId === s.id}
                      className="p-1.5 rounded hover:bg-panel-alt text-purple-400 border border-border hover:border-border-strong disabled:opacity-50"
                      title="Test Connection Reachability"
                      aria-label={`Test connection to ${s.name}`}
                    >
                      {testingServerId === s.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shield className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Clone */}
                    <button
                      onClick={() => {
                        setEditingServer(s);
                        setCloneMode(true);
                        setShowAddModal(true);
                      }}
                      className="p-1.5 rounded hover:bg-panel-alt text-content-secondary border border-border hover:border-border-strong"
                      title="Clone Server"
                      aria-label={`Clone ${s.name} into a new server`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => {
                        setEditingServer(s);
                        setCloneMode(false);
                        setShowAddModal(true);
                      }}
                      className="p-1.5 rounded hover:bg-panel-alt text-content-secondary border border-border hover:border-border-strong"
                      title="Edit Configuration"
                      aria-label={`Edit configuration for ${s.name}`}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(s)}
                      className="p-1.5 rounded hover:bg-panel-alt text-rose-400 border border-border hover:border-border-strong"
                      title="Delete Server"
                      aria-label={`Delete ${s.name}`}
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
        key={`${editingServer?.id || 'new'}-${cloneMode}`}
        initialServer={editingServer}
        cloneMode={cloneMode}
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingServer(null);
          setCloneMode(false);
        }}
        onSaved={() => {
          showToast(cloneMode ? 'Server cloned successfully' : 'Server saved', 'success');
          loadServers();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete server"
        description={`This permanently removes "${deleteTarget?.name}" and its stored credentials. This cannot be undone.`}
        confirmLabel="Delete Server"
        isBusy={isDeleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

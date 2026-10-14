import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, X, BookMarked, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { CommandSnippetDTO } from '@server-console/shared';
import { useToast } from '../../context/ToastContext';

interface SnippetsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  onRun: (command: string) => void;
}

export const SnippetsPanel: React.FC<SnippetsPanelProps> = ({ isOpen, onClose, serverId, onRun }) => {
  const { showToast } = useToast();
  const [snippets, setSnippets] = useState<CommandSnippetDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [scopeToServer, setScopeToServer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSnippets(serverId);
      setSnippets(res.snippets);
    } catch (err: any) {
      showToast(err.message || 'Failed to load snippets', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, serverId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !command.trim()) return;
    setIsSaving(true);
    try {
      await api.createSnippet({
        label: label.trim(),
        command: command.trim(),
        serverId: scopeToServer ? serverId : undefined,
      });
      setLabel('');
      setCommand('');
      setScopeToServer(false);
      setShowAddForm(false);
      await load();
      showToast('Snippet saved', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save snippet', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSnippet(id);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      showToast(err.message || 'Failed to delete snippet', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-panel border-l border-border-strong shadow-2xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
          <BookMarked className="w-4 h-4 text-sky-400" />
          <span>Command Snippets</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-content-muted hover:text-content-secondary hover:bg-panel-alt">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-content-muted text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && snippets.length === 0 && (
          <div className="text-center py-8 text-xs text-content-muted italic px-4">
            No snippets yet. Save frequently-used commands for one-click reuse.
          </div>
        )}

        {snippets.map((s) => (
          <div
            key={s.id}
            className="group p-2.5 rounded-lg bg-panel-alt border border-border hover:border-border-strong transition"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-content-primary truncate">{s.label}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                <button
                  onClick={() => onRun(s.command)}
                  title="Run in terminal"
                  className="p-1 rounded hover:bg-border text-emerald-400"
                >
                  <Play className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  title="Delete snippet"
                  className="p-1 rounded hover:bg-border text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            <code className="block mt-1 text-[11px] text-content-muted font-mono truncate">{s.command}</code>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2">
        {showAddForm ? (
          <form onSubmit={handleAdd} className="space-y-2">
            <input
              autoFocus
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Restart nginx)"
              className="w-full px-2.5 py-1.5 bg-panel-alt border border-border rounded text-xs text-content-primary focus:outline-none focus:border-sky-500"
            />
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command"
              rows={2}
              className="w-full px-2.5 py-1.5 bg-panel-alt border border-border rounded text-xs text-content-primary font-mono focus:outline-none focus:border-sky-500"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-content-muted cursor-pointer">
              <input
                type="checkbox"
                checked={scopeToServer}
                onChange={(e) => setScopeToServer(e.target.checked)}
                className="rounded bg-panel-alt border-border"
              />
              Only show for this server
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !label.trim() || !command.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium"
              >
                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-sky-400 border border-border text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            New Snippet
          </button>
        )}
      </div>
    </div>
  );
};

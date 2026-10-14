import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { SshTerminal } from './SshTerminal';

interface TerminalTab {
  id: number;
  label: string;
}

const MAX_TABS = 8;

/**
 * Hosts several independent SSH shells for one server. Every tab keeps its WebSocket and scrollback
 * alive while hidden, so switching tabs (or leaving the Terminal view) never kills a running session.
 */
export const TerminalWorkspace: React.FC<{ serverId: string; serverName: string; isActive: boolean }> = ({ serverId, serverName, isActive }) => {
  const nextId = useRef(2);
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: 1, label: 'Shell 1' }]);
  const [activeId, setActiveId] = useState(1);

  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
    const id = nextId.current++;
    setTabs((t) => [...t, { id, label: `Shell ${id}` }]);
    setActiveId(id);
  };

  const closeTab = (id: number) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining[Math.max(0, idx - 1)].id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 mb-2 overflow-x-auto" role="tablist" aria-label="Terminal sessions">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-t text-xs cursor-pointer border border-b-0 transition ${
              t.id === activeId ? 'bg-panel-inset border-border text-content-primary' : 'bg-panel-alt/60 border-transparent text-content-muted hover:text-content-secondary'
            }`}
            onClick={() => setActiveId(t.id)}
          >
            <span className="font-mono">{t.label}</span>
            {tabs.length > 1 && (
              <button
                aria-label={`Close ${t.label}`}
                className="p-0.5 rounded hover:bg-border text-content-muted hover:text-rose-400"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          title={tabs.length >= MAX_TABS ? 'Tab limit reached' : 'New terminal'}
          aria-label="New terminal"
          className="p-1.5 rounded text-content-muted hover:text-sky-400 hover:bg-panel-alt disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        {tabs.map((t) => (
          <div key={t.id} className={`absolute inset-0 ${t.id === activeId ? '' : 'hidden'}`}>
            <SshTerminal serverId={serverId} serverName={serverName} isActive={isActive && t.id === activeId} />
          </div>
        ))}
      </div>
    </div>
  );
};

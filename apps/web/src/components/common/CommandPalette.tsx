import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Server, Terminal, Monitor, Folder, Activity, LayoutDashboard, Settings, Plus, CornerDownLeft, Bell } from 'lucide-react';
import { ServerDTO } from '@server-console/shared';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  servers: ServerDTO[];
  onOpenServer: (serverId: string, tab: string) => void;
  onGoTo: (tab: string) => void;
  onAddServer: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ElementType;
  keywords: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  servers,
  onOpenServer,
  onGoTo,
  onAddServer,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const items = useMemo<PaletteItem[]>(() => {
    const navItems: PaletteItem[] = [
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        keywords: 'dashboard home overview',
        action: () => onGoTo('dashboard'),
      },
      {
        id: 'nav-servers',
        label: 'Go to Servers',
        icon: Server,
        keywords: 'servers list',
        action: () => onGoTo('servers'),
      },
      {
        id: 'nav-alerts',
        label: 'Go to Alerts',
        icon: Bell,
        keywords: 'alerts notifications rules telegram discord',
        action: () => onGoTo('alerts'),
      },
      {
        id: 'nav-runbooks',
        label: 'Go to Runbooks',
        icon: Activity,
        keywords: 'runbooks scripts automation schedule',
        action: () => onGoTo('runbooks'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        icon: Settings,
        keywords: 'settings preferences account',
        action: () => onGoTo('settings'),
      },
      {
        id: 'add-server',
        label: 'Add New Server',
        icon: Plus,
        keywords: 'add create new server',
        action: onAddServer,
      },
    ];

    const serverItems: PaletteItem[] = servers.flatMap((s) => [
      {
        id: `${s.id}-terminal`,
        label: `${s.name} — Terminal`,
        subtitle: `${s.sshUsername}@${s.host}`,
        icon: Terminal,
        keywords: `${s.name} ${s.host} terminal ssh`,
        action: () => onOpenServer(s.id, 'terminal'),
      },
      ...(s.vncEnabled
        ? [
            {
              id: `${s.id}-vnc`,
              label: `${s.name} — VNC Console`,
              subtitle: `${s.sshUsername}@${s.host}`,
              icon: Monitor,
              keywords: `${s.name} ${s.host} vnc console desktop`,
              action: () => onOpenServer(s.id, 'console'),
            },
          ]
        : []),
      {
        id: `${s.id}-files`,
        label: `${s.name} — SFTP Files`,
        subtitle: `${s.sshUsername}@${s.host}`,
        icon: Folder,
        keywords: `${s.name} ${s.host} sftp files`,
        action: () => onOpenServer(s.id, 'files'),
      },
      {
        id: `${s.id}-monitor`,
        label: `${s.name} — Telemetry`,
        subtitle: `${s.sshUsername}@${s.host}`,
        icon: Activity,
        keywords: `${s.name} ${s.host} monitor telemetry stats`,
        action: () => onOpenServer(s.id, 'monitor'),
      },
    ]);

    return [...navItems, ...serverItems];
  }, [servers, onGoTo, onAddServer, onOpenServer]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items.filter((item) => item.keywords.toLowerCase().includes(q)).slice(0, 20);
  }, [items, query]);

  const runItem = useCallback(
    (item: PaletteItem) => {
      item.action();
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[12vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg bg-panel border border-border-strong rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-content-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search servers or jump to a page..."
            className="flex-1 bg-transparent text-sm text-content-primary placeholder-content-muted focus:outline-none"
            aria-label="Command palette search"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-panel-alt border border-border text-content-muted font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-content-muted italic">No matches found.</div>
          )}
          {filtered.map((item, idx) => {
            const Icon = item.icon;
            const isActive = idx === activeIndex;
            return (
              <button
                key={item.id}
                onClick={() => runItem(item)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition ${
                  isActive ? 'bg-sky-600/15 text-sky-300' : 'text-content-secondary hover:bg-panel-alt'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0 text-content-muted" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{item.label}</div>
                  {item.subtitle && <div className="truncate text-[11px] text-content-muted font-mono">{item.subtitle}</div>}
                </div>
                {isActive && <CornerDownLeft className="w-3 h-3 text-sky-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

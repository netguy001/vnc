import React, { useState, useEffect } from 'react';
import {
  Server,
  Monitor,
  LayoutDashboard,
  Settings,
  Plus,
  LogOut,
  ChevronDown,
  ChevronRight,
  Star,
  Sun,
  Moon,
  Search,
  Bell,
  Puzzle,
  ScrollText,
  Activity,
  Database,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLive } from '../../context/LiveContext';
import { useToast } from '../../context/ToastContext';
import { LiveBadge } from '../common/LiveBadge';
import { useTheme } from '../../context/ThemeContext';
import { ServerDTO } from '@server-console/shared';
import { api, PluginUiEntry } from '../../api/client';

const PLUGIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Activity,
  database: Database,
  globe: Globe,
  shield: ShieldCheck,
  bell: Bell,
  server: Server,
};
import { ServerModal } from '../servers/ServerModal';
import { CommandPalette } from '../common/CommandPalette';

interface AppLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  selectedServerId?: string;
  setSelectedServerId: (id: string | undefined) => void;
  pluginPages?: PluginUiEntry[];
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  setCurrentTab,
  selectedServerId,
  setSelectedServerId,
  pluginPages = [],
  children,
}) => {
  const { user, logout } = useAuth();
  const { resolvedTheme, setMode } = useTheme();
  const { onEvent } = useLive();
  const { showToast } = useToast();
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showPalette, setShowPalette] = useState(false);

  const refreshServers = async () => {
    try {
      const res = await api.getServers();
      setServers(res.servers);
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  };

  useEffect(() => {
    refreshServers();
    // Status changes arrive over the live socket; this slow poll only picks up added/removed servers.
    const interval = setInterval(refreshServers, 60000);
    return () => clearInterval(interval);
  }, []);

  // Real-time: sidebar status dots and alert toasts.
  useEffect(
    () =>
      onEvent((msg) => {
        if (msg.type === 'status') {
          setServers((prev) => prev.map((s) => (s.id === msg.serverId ? { ...s, status: msg.status } : s)));
        } else if (msg.type === 'alert') {
          showToast(
            msg.state === 'fired' ? `ALERT: ${msg.ruleName} on ${msg.serverName}` : `Resolved: ${msg.ruleName} on ${msg.serverName}`,
            msg.state === 'fired' ? 'error' : 'success'
          );
        }
      }),
    [onEvent, showToast]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const favoriteServers = servers.filter((s) => s.isFavorite);

  const groupedServers = servers.reduce<Record<string, ServerDTO[]>>((acc, s) => {
    const group = s.serverGroup || 'Default';
    if (!acc[group]) acc[group] = [];
    acc[group].push(s);
    return acc;
  }, {});

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleSelectServer = (id: string) => {
    setSelectedServerId(id);
    if (['dashboard', 'servers', 'alerts', 'runbooks', 'plugins', 'settings'].includes(currentTab) || currentTab.startsWith('plugin:')) {
      setCurrentTab('console');
    }
  };

  const handlePaletteOpenServer = (id: string, tab: string) => {
    setSelectedServerId(id);
    setCurrentTab(tab);
  };

  const statusDotClass = (status: ServerDTO['status']) =>
    status === 'connected'
      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
      : status === 'connecting'
      ? 'bg-amber-500 animate-ping'
      : status === 'error'
      ? 'bg-rose-500'
      : 'bg-content-muted';

  const renderServerRow = (s: ServerDTO) => {
    const isSelected = selectedServerId === s.id;
    return (
      <button
        key={s.id}
        onClick={() => handleSelectServer(s.id)}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition group ${
          isSelected
            ? 'bg-sky-600/20 text-sky-300 font-medium border border-sky-500/40'
            : 'text-content-secondary hover:bg-panel-alt hover:text-content-primary'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(s.status)}`} />
          <span className="truncate">{s.name}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {s.isFavorite && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
          {s.vncEnabled && <Monitor className="w-3 h-3 text-content-muted group-hover:text-content-secondary" />}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-app text-content-primary">
      {/* Top Header Bar */}
      <header className="h-12 bg-panel/90 border-b border-border px-4 flex items-center justify-between flex-shrink-0 select-none z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="IOC — Infrastructure Operations Console"
              className="h-9 w-9 object-contain"
              title="IOC — Infrastructure Operations Console"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel-alt text-content-muted font-mono font-normal">
              v1.0
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border mx-2" />

          {/* Quick Main Nav */}
          <nav className="flex items-center gap-1 text-xs">
            <button
              onClick={() => {
                setSelectedServerId(undefined);
                setCurrentTab('dashboard');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                currentTab === 'dashboard' && !selectedServerId
                  ? 'bg-panel-alt text-sky-400 font-medium'
                  : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setSelectedServerId(undefined);
                setCurrentTab('servers');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                currentTab === 'servers' && !selectedServerId
                  ? 'bg-panel-alt text-sky-400 font-medium'
                  : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/50'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Servers ({servers.length})</span>
            </button>

            <button
              onClick={() => {
                setSelectedServerId(undefined);
                setCurrentTab('alerts');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                currentTab === 'alerts' && !selectedServerId
                  ? 'bg-panel-alt text-sky-400 font-medium'
                  : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/50'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alerts</span>
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  setSelectedServerId(undefined);
                  setCurrentTab('runbooks');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                  currentTab === 'runbooks' && !selectedServerId
                    ? 'bg-panel-alt text-sky-400 font-medium'
                    : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/50'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Runbooks</span>
              </button>
            )}

            {pluginPages.flatMap((entry) =>
              entry.pages.map((pg) => {
                const tabId = `plugin:${entry.pluginId}:${pg.id}`;
                const Icon = (pg.icon && PLUGIN_ICONS[pg.icon]) || Puzzle;
                return (
                  <button
                    key={tabId}
                    onClick={() => {
                      setSelectedServerId(undefined);
                      setCurrentTab(tabId);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                      currentTab === tabId && !selectedServerId
                        ? 'bg-panel-alt text-sky-400 font-medium'
                        : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{pg.title}</span>
                  </button>
                );
              })
            )}
          </nav>

          <button
            onClick={() => setShowPalette(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-panel-alt text-content-muted hover:text-content-secondary hover:border-border-strong transition text-xs ml-2"
            title="Command palette"
          >
            <Search className="w-3 h-3" />
            <span>Search…</span>
            <kbd className="text-[10px] px-1 py-0.5 rounded bg-app border border-border font-mono">
              {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>
        </div>

        {/* User profile & Settings */}
        <div className="flex items-center gap-3 text-xs">
          <LiveBadge compact />

          <button
            onClick={() => setMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
            title={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle theme"
            className="p-1.5 rounded text-content-muted hover:text-content-secondary hover:bg-panel-alt/60 transition"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="h-4 w-[1px] bg-border" />

          <div className="flex items-center gap-2 text-content-secondary">
            <div className="w-6 h-6 rounded-full bg-panel-alt border border-border flex items-center justify-center text-sky-400 text-xs font-semibold">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <span className="font-medium text-content-primary">{user?.username}</span>
            <span className="px-1.5 py-0.5 rounded bg-panel-alt border border-border font-mono text-[10px] text-content-muted">
              {user?.role}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          {user?.role === 'admin' && (
            <button
              onClick={() => {
                setSelectedServerId(undefined);
                setCurrentTab('plugins');
              }}
              title="Plugins"
              className={`p-1.5 rounded transition ${
                currentTab === 'plugins'
                  ? 'bg-panel-alt text-sky-400'
                  : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/60'
              }`}
            >
              <Puzzle className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              setSelectedServerId(undefined);
              setCurrentTab('settings');
            }}
            title="System Settings & Audit Logs"
            className={`p-1.5 rounded transition ${
              currentTab === 'settings'
                ? 'bg-panel-alt text-sky-400'
                : 'text-content-muted hover:text-content-secondary hover:bg-panel-alt/60'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 rounded text-content-muted hover:text-rose-400 hover:bg-panel-alt/60 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container: Sidebar + Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-60 bg-panel/60 border-r border-border flex flex-col flex-shrink-0 select-none">
          <div className="p-3 border-b border-border/80 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-content-muted">
              Infrastructure
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 text-xs transition"
              title="Add Server"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          {/* Server List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {servers.length === 0 && (
              <div className="p-4 text-center text-xs text-content-muted">
                No servers configured.
                <button
                  onClick={() => setShowAddModal(true)}
                  className="block mx-auto mt-2 text-sky-400 hover:underline"
                >
                  Add your first server
                </button>
              </div>
            )}

            {favoriteServers.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>Favorites</span>
                </div>
                <div className="space-y-0.5 pl-1">{favoriteServers.map(renderServerRow)}</div>
              </div>
            )}

            {Object.entries(groupedServers).map(([group, sList]) => {
              const isCollapsed = Boolean(collapsedGroups[group]);
              return (
                <div key={group} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-content-muted hover:text-content-secondary transition"
                  >
                    <span className="truncate">{group}</span>
                    <span className="flex items-center text-content-muted">
                      {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                  </button>

                  {!isCollapsed && <div className="space-y-0.5 pl-1">{sList.map(renderServerRow)}</div>}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-app overflow-hidden p-3">{children}</main>
      </div>

      {/* Add Server Modal */}
      <ServerModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSaved={refreshServers} />

      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        servers={servers}
        onOpenServer={handlePaletteOpenServer}
        onGoTo={(tab) => {
          setSelectedServerId(undefined);
          setCurrentTab(tab);
        }}
        onAddServer={() => setShowAddModal(true)}
      />
    </div>
  );
};

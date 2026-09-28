import React, { useState, useEffect } from 'react';
import {
  Server,
  Terminal,
  Monitor,
  LayoutDashboard,
  Settings,
  Plus,
  LogOut,
  ChevronDown,
  ChevronRight,
  Shield,
  Activity,
  HardDrive,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ServerDTO } from '@server-console/shared';
import { api } from '../../api/client';
import { ServerModal } from '../servers/ServerModal';

interface AppLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  selectedServerId?: string;
  setSelectedServerId: (id: string | undefined) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  setCurrentTab,
  selectedServerId,
  setSelectedServerId,
  children,
}) => {
  const { user, logout } = useAuth();
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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
    const interval = setInterval(refreshServers, 15000);
    return () => clearInterval(interval);
  }, []);

  // Group servers by serverGroup
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
    if (currentTab === 'dashboard' || currentTab === 'servers' || currentTab === 'settings') {
      setCurrentTab('console');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100">
      {/* Top Header Bar */}
      <header className="h-12 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0 select-none z-30">
        <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="IOC — Infrastructure Operations Console"
              className="h-9 w-9 object-contain"
              title="IOC — Infrastructure Operations Console"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-normal">
              v1.0
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-800 mx-2" />

          {/* Quick Main Nav */}
          <nav className="flex items-center gap-1 text-xs">
            <button
              onClick={() => {
                setSelectedServerId(undefined);
                setCurrentTab('dashboard');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${
                currentTab === 'dashboard' && !selectedServerId
                  ? 'bg-slate-800 text-sky-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
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
                  ? 'bg-slate-800 text-sky-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Servers ({servers.length})</span>
            </button>
          </nav>
        </div>

        {/* User profile & Settings */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400 text-xs font-semibold">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <span className="font-medium text-slate-200">{user?.username}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-400">
              {user?.role}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-800" />

          <button
            onClick={() => {
              setSelectedServerId(undefined);
              setCurrentTab('settings');
            }}
            title="System Settings & Audit Logs"
            className={`p-1.5 rounded transition ${
              currentTab === 'settings'
                ? 'bg-slate-800 text-sky-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container: Sidebar + Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-60 bg-slate-900/60 border-r border-slate-800 flex flex-col flex-shrink-0 select-none">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
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

          {/* Grouped Server List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {Object.keys(groupedServers).length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                No servers configured.
                <button
                  onClick={() => setShowAddModal(true)}
                  className="block mx-auto mt-2 text-sky-400 hover:underline"
                >
                  Add your first server
                </button>
              </div>
            )}

            {Object.entries(groupedServers).map(([group, sList]) => {
              const isCollapsed = Boolean(collapsedGroups[group]);
              return (
                <div key={group} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition"
                  >
                    <span className="truncate">{group}</span>
                    <span className="flex items-center text-slate-500">
                      {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-1">
                      {sList.map((s) => {
                        const isSelected = selectedServerId === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => handleSelectServer(s.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition group ${
                              isSelected
                                ? 'bg-sky-600/20 text-sky-300 font-medium border border-sky-500/40'
                                : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {/* Status dot */}
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  s.status === 'connected'
                                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                                    : s.status === 'connecting'
                                    ? 'bg-amber-500 animate-ping'
                                    : s.status === 'error'
                                    ? 'bg-rose-500'
                                    : 'bg-slate-600'
                                }`}
                              />
                              <span className="truncate">{s.name}</span>
                            </div>

                            {s.vncEnabled && (
                              <Monitor className="w-3 h-3 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#090d16] overflow-hidden p-3">
          {children}
        </main>
      </div>

      {/* Add Server Modal */}
      <ServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={refreshServers}
      />
    </div>
  );
};

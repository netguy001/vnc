import React, { useState, useEffect, useCallback } from 'react';
import { api, PluginUiEntry } from './api/client';
import { PluginPage } from './pages/PluginPage';
import { PluginsManagerPage } from './pages/PluginsManagerPage';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ServersPage } from './pages/ServersPage';
import { ServerDetailPage } from './pages/ServerDetailPage';
import { RunbooksPage } from './pages/RunbooksPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(undefined);
  const [serverActiveTab, setServerActiveTab] = useState<string>('console');

  const [pluginUi, setPluginUi] = useState<PluginUiEntry[]>([]);
  const refreshPluginUi = useCallback(async () => {
    try {
      setPluginUi((await api.getPluginUi()).plugins);
    } catch {
      setPluginUi([]);
    }
  }, []);
  useEffect(() => {
    if (user) void refreshPluginUi();
  }, [user, refreshPluginUi]);

  const renderPluginTab = () => {
    const [, pluginId, pageId] = currentTab.split(':');
    const entry = pluginUi.find((p) => p.pluginId === pluginId);
    const page = entry?.pages.find((pg) => pg.id === pageId);
    return entry && page ? (
      <PluginPage pluginId={entry.pluginId} pluginName={entry.pluginName} page={page as any} />
    ) : (
      <div className="p-6 text-xs text-content-muted">This plugin page is no longer available.</div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#090d16] flex flex-col items-center justify-center text-slate-400 gap-3">
        <img src="/logo.png" alt="IOC" className="w-16 h-16 rounded-xl object-contain opacity-90" />
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        <span className="text-xs font-mono text-slate-500">Initializing IOC...</span>
      </div>
    );
  }


  if (!user) {
    return <LoginPage />;
  }

  const handleOpenServer = (id: string, tab: string) => {
    setSelectedServerId(id);
    setServerActiveTab(tab);
    setCurrentTab(tab);
  };

  return (
    <AppLayout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      selectedServerId={selectedServerId}
      setSelectedServerId={setSelectedServerId}
      pluginPages={pluginUi}
    >
      <ErrorBoundary label={selectedServerId ? 'server view' : currentTab} key={`${selectedServerId ?? ''}:${currentTab}`}>
      {selectedServerId ? (
        <ServerDetailPage
          serverId={selectedServerId}
          activeTab={serverActiveTab}
          setActiveTab={setServerActiveTab}
          onBack={() => setSelectedServerId(undefined)}
        />
      ) : (
        <>
          {currentTab === 'dashboard' && (
            <DashboardPage onOpenServer={handleOpenServer} />
          )}
          {currentTab === 'servers' && (
            <ServersPage onOpenServer={handleOpenServer} />
          )}
          {currentTab === 'alerts' && <AlertsPage />}
          {currentTab === 'runbooks' && <RunbooksPage />}
          {currentTab === 'plugins' && <PluginsManagerPage onChanged={refreshPluginUi} />}
          {currentTab.startsWith('plugin:') && renderPluginTab()}
          {currentTab === 'settings' && <SettingsPage />}
        </>
      )}
      </ErrorBoundary>
    </AppLayout>
  );
};
export default App;

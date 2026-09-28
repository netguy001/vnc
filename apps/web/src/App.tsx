import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ServersPage } from './pages/ServersPage';
import { ServerDetailPage } from './pages/ServerDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(undefined);
  const [serverActiveTab, setServerActiveTab] = useState<string>('console');

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
    >
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
          {currentTab === 'settings' && <SettingsPage />}
        </>
      )}
    </AppLayout>
  );
};
export default App;

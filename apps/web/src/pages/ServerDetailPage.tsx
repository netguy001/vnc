import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Terminal,
  Folder,
  Activity,
  Box,
  Shield,
  ShieldCheck,
  Network,
  Loader2,
  ExternalLink,
  ChevronLeft,
  Cog,
  ScrollText,
} from 'lucide-react';
import { api } from '../api/client';
import { ServerDTO } from '@server-console/shared';
import { VncViewer } from '../components/vnc/VncViewer';
import { TerminalWorkspace } from '../components/terminal/TerminalWorkspace';
import { SftpFileManager } from '../components/sftp/SftpFileManager';
import { ServerMonitor } from '../components/monitor/ServerMonitor';
import { DockerMonitor } from '../components/docker/DockerMonitor';
import { SecurityDashboard } from '../components/security/SecurityDashboard';
import { HostKeyBadge } from '../components/servers/HostKeyBadge';
import { ServiceManager } from '../components/services/ServiceManager';
import { LogExplorer } from '../components/logs/LogExplorer';
import { NetworkMonitor } from '../components/network/NetworkMonitor';

interface ServerDetailPageProps {
  serverId: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onBack: () => void;
}

export const ServerDetailPage: React.FC<ServerDetailPageProps> = ({
  serverId,
  activeTab,
  setActiveTab,
  onBack,
}) => {
  const [server, setServer] = useState<ServerDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [terminalOpened, setTerminalOpened] = useState(activeTab === 'terminal');

  // Open the terminal lazily (first visit) and keep it mounted afterwards; reset when switching servers.
  useEffect(() => {
    setTerminalOpened(activeTab === 'terminal');
  }, [serverId]);
  useEffect(() => {
    if (activeTab === 'terminal') setTerminalOpened(true);
  }, [activeTab]);

  const loadServer = async () => {
    setIsLoading(true);
    try {
      const res = await api.getServer(serverId);
      setServer(res.server);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServer();
  }, [serverId]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await api.testConnection(serverId);
      alert(
        `Connection Test Results:\n\nSSH: ${res.result.sshSuccess ? 'SUCCESS' : 'FAILED'} (${res.result.sshMessage})\nVNC: ${res.result.vncSuccess ? 'SUCCESS' : 'FAILED'} (${res.result.vncMessage})\nLatency: ${res.result.latencyMs || 0}ms`
      );
      loadServer();
    } catch (err: any) {
      alert('Test error: ' + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading && !server) {
    return (
      <div className="flex-1 flex items-center justify-center text-content-muted text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span>Loading server details...</span>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="p-8 text-center text-content-muted">
        <p>Server not found or deleted.</p>
        <button onClick={onBack} className="mt-3 text-sky-400 hover:underline text-xs">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden space-y-2">
      {/* Server Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-panel/80 rounded-lg border border-border text-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 rounded bg-panel-alt hover:bg-border text-content-muted hover:text-content-primary transition"
            title="Back to servers"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-content-primary text-sm">{server.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-panel-alt text-content-muted font-mono text-[10px]">
                {server.serverGroup || 'Default'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-content-muted font-mono text-[11px] mt-0.5">
              <span>{server.sshUsername}@{server.host}:{server.sshPort}</span>
              {server.vncEnabled && (
                <>
                  <span className="text-content-muted">•</span>
                  <span className="text-emerald-400">VNC :{server.vncPort}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-panel-alt/80 p-1 rounded-lg border border-border">
          {server.vncEnabled && (
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeTab === 'console'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>VNC Console</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'terminal'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'files'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>SFTP Files</span>
          </button>

          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'monitor'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab('docker')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'docker'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Docker</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'security'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Security &amp; Firewall</span>
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'network'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Network</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'services'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <Cog className="w-3.5 h-3.5" />
            <span>Services</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              activeTab === 'logs'
                ? 'bg-sky-600 text-white shadow'
                : 'text-content-muted hover:text-content-secondary hover:bg-border/60'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Logs</span>
          </button>
        </div>

        <HostKeyBadge serverId={server.id} />

        {/* Quick Probe */}
        <button
          onClick={handleTestConnection}
          disabled={isTesting}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-panel-alt hover:bg-border text-content-secondary rounded border border-border font-medium transition"
          title="Test SSH and VNC Connection"
        >
          {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 text-sky-400" />}
          <span>Probe Server</span>
        </button>
      </div>

      {/* Main Workspace Viewport */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'console' && (
          <VncViewer
            serverId={server.id}
            serverName={server.name}
            onSwitchToTerminal={() => setActiveTab('terminal')}
            onStatusChange={(st) => {
              if (st !== server.status) {
                setServer((prev) => (prev ? { ...prev, status: st } : null));
              }
            }}
          />
        )}

        {/* Mounted once opened and then only hidden, so shells survive switching tabs. */}
        {terminalOpened && (
          <div className={activeTab === 'terminal' ? 'h-full' : 'hidden'}>
            <TerminalWorkspace key={server.id} serverId={server.id} serverName={server.name} isActive={activeTab === 'terminal'} />
          </div>
        )}

        {activeTab === 'files' && (
          <SftpFileManager serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'monitor' && (
          <ServerMonitor serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'docker' && (
          <DockerMonitor serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'security' && (
          <SecurityDashboard serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'network' && (
          <NetworkMonitor serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'services' && (
          <ServiceManager serverId={server.id} serverName={server.name} />
        )}

        {activeTab === 'logs' && (
          <LogExplorer serverId={server.id} serverName={server.name} />
        )}
      </div>
    </div>
  );
};

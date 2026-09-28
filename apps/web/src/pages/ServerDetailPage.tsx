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
} from 'lucide-react';
import { api } from '../api/client';
import { ServerDTO } from '@server-console/shared';
import { VncViewer } from '../components/vnc/VncViewer';
import { SshTerminal } from '../components/terminal/SshTerminal';
import { SftpFileManager } from '../components/sftp/SftpFileManager';
import { ServerMonitor } from '../components/monitor/ServerMonitor';
import { DockerMonitor } from '../components/docker/DockerMonitor';
import { SecurityDashboard } from '../components/security/SecurityDashboard';
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
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span>Loading server details...</span>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="p-8 text-center text-slate-400">
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-slate-900/80 rounded-lg border border-slate-800 text-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition"
            title="Back to servers"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm">{server.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                {server.serverGroup || 'Default'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] mt-0.5">
              <span>{server.sshUsername}@{server.host}:{server.sshPort}</span>
              {server.vncEnabled && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-emerald-400">VNC :{server.vncPort}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          {server.vncEnabled && (
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeTab === 'console'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Network</span>
          </button>
        </div>

        {/* Quick Probe */}
        <button
          onClick={handleTestConnection}
          disabled={isTesting}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-medium transition"
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

        {activeTab === 'terminal' && (
          <SshTerminal serverId={server.id} serverName={server.name} />
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
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Network,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Globe,
  Radio,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Share2,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  ServerNetworkOverview,
  PingResult,
  DnsLookupResult,
  PortProbeResult,
  SocketConnection,
} from '@server-console/shared';

interface NetworkMonitorProps {
  serverId: string;
  serverName: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const NetworkMonitor: React.FC<NetworkMonitorProps> = ({ serverId, serverName }) => {
  const [data, setData] = useState<ServerNetworkOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'interfaces' | 'sockets' | 'routing' | 'diagnostics'>('interfaces');

  // Sockets table filter/search
  const [socketSearch, setSocketSearch] = useState('');
  const [socketStateFilter, setSocketStateFilter] = useState<string>('ALL');

  // Diagnostics State: Ping
  const [pingHost, setPingHost] = useState('8.8.8.8');
  const [pingCount, setPingCount] = useState(4);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // Diagnostics State: DNS
  const [dnsHost, setDnsHost] = useState('google.com');
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsLookupResult | null>(null);

  // Diagnostics State: Port Probe
  const [probeHost, setProbeHost] = useState('1.1.1.1');
  const [probePort, setProbePort] = useState(443);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<PortProbeResult | null>(null);

  // Toast notification
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setActionNotification({ type, message });
    setTimeout(() => setActionNotification(null), 4000);
  };

  const fetchNetwork = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.getNetworkOverview(serverId);
      setData(res.network);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch network telemetry');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchNetwork(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchNetwork]);

  // Diagnostics handlers
  const handleRunPing = async () => {
    if (!pingHost.trim()) {
      showToast('error', 'Please enter a target host or IP for ping');
      return;
    }
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await api.pingTarget(serverId, pingHost.trim(), pingCount);
      setPingResult(res.result);
      if (res.result.success) {
        showToast('success', `Ping to ${pingHost} finished: ${res.result.lossPercent}% loss, avg ${res.result.avgMs || 0}ms`);
      } else {
        showToast('error', `Ping to ${pingHost} failed`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Ping failed');
    } finally {
      setPingLoading(false);
    }
  };

  const handleRunDns = async () => {
    if (!dnsHost.trim()) {
      showToast('error', 'Please enter a domain name for DNS lookup');
      return;
    }
    setDnsLoading(true);
    setDnsResult(null);
    try {
      const res = await api.lookupDns(serverId, dnsHost.trim());
      setDnsResult(res.result);
      if (res.result.success) {
        showToast('success', `Resolved ${dnsHost}: ${res.result.records.join(', ')}`);
      } else {
        showToast('error', `Failed to resolve ${dnsHost}`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'DNS lookup failed');
    } finally {
      setDnsLoading(false);
    }
  };

  const handleRunPortProbe = async () => {
    if (!probeHost.trim() || !probePort) {
      showToast('error', 'Please enter a target host and port');
      return;
    }
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const res = await api.probePort(serverId, probeHost.trim(), Number(probePort));
      setProbeResult(res.result);
      if (res.result.isOpen) {
        showToast('success', `Port ${probePort} on ${probeHost} is OPEN (${res.result.latencyMs || 0}ms)`);
      } else {
        showToast('error', `Port ${probePort} on ${probeHost} is CLOSED / UNREACHABLE`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Port probe failed');
    } finally {
      setProbeLoading(false);
    }
  };

  // Filter socket connections
  const filteredConnections: SocketConnection[] = (data?.connections || []).filter((conn: SocketConnection) => {
    const matchesSearch =
      socketSearch === '' ||
      conn.localAddress.toLowerCase().includes(socketSearch.toLowerCase()) ||
      conn.remoteAddress.toLowerCase().includes(socketSearch.toLowerCase()) ||
      conn.state.toLowerCase().includes(socketSearch.toLowerCase()) ||
      (conn.process && conn.process.toLowerCase().includes(socketSearch.toLowerCase()));

    const matchesState =
      socketStateFilter === 'ALL' ||
      conn.state.toUpperCase() === socketStateFilter.toUpperCase() ||
      (socketStateFilter === 'TIME-WAIT' && conn.state === 'TIME_WAIT') ||
      (socketStateFilter === 'CLOSE-WAIT' && conn.state === 'CLOSE_WAIT');

    return matchesSearch && matchesState;
  });

  const stateColors: Record<string, string> = {
    ESTABLISHED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    LISTEN: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    TIME_WAIT: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    'TIME-WAIT': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    CLOSE_WAIT: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    'CLOSE-WAIT': 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    SYN_SENT: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };

  // Aggregate stats
  const totalRxBytes = (data?.interfaces || []).reduce((sum, iface) => sum + iface.rxBytes, 0);
  const totalTxBytes = (data?.interfaces || []).reduce((sum, iface) => sum + iface.txBytes, 0);
  const totalRxPackets = (data?.interfaces || []).reduce((sum, iface) => sum + iface.rxPackets, 0);
  const totalTxPackets = (data?.interfaces || []).reduce((sum, iface) => sum + iface.txPackets, 0);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1d] border border-slate-800 rounded-lg overflow-hidden shadow-2xl p-4 space-y-4 overflow-y-auto">
      {/* Toast Notification */}
      {actionNotification && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs shadow-lg transition-all animate-fadeIn ${
            actionNotification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{actionNotification.message}</span>
          </div>
          <button
            onClick={() => setActionNotification(null)}
            className="text-slate-400 hover:text-slate-200 text-sm ml-4 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 text-xs text-slate-300 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100 text-sm">Network Traffic &amp; Interface Monitor</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                {serverName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] mt-0.5">
              <span>Primary Gateway: {data?.routing.defaultGateway || 'Detecting...'}</span>
              {data?.timestamp && (
                <>
                  <span>•</span>
                  <span>Synced {new Date(data.timestamp).toLocaleTimeString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 text-xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 w-3.5 h-3.5"
            />
            <span>Auto-refresh (5s)</span>
          </label>

          <button
            onClick={() => fetchNetwork(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-medium transition disabled:opacity-50"
            title="Refresh Network Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        {/* Total Inbound RX */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Total Received (RX)</span>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {data ? formatBytes(totalRxBytes) : '---'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {data ? `${totalRxPackets.toLocaleString()} pkts` : '0 pkts'}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        {/* Total Outbound TX */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
              <span>Total Transmitted (TX)</span>
            </div>
            <div className="text-lg font-bold font-mono text-sky-400 mt-1">
              {data ? formatBytes(totalTxBytes) : '---'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {data ? `${totalTxPackets.toLocaleString()} pkts` : '0 pkts'}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* Active Sockets */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Active Sockets</span>
            </div>
            <div className="text-lg font-bold font-mono text-slate-100 mt-1">
              {data ? data.connectionStats.total : '---'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {data
                ? `${data.connectionStats.established} Established • ${data.connectionStats.listen} Listen`
                : '0 Established'}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        {/* Gateway & DNS */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>Default Gateway</span>
            </div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1 truncate max-w-[140px]" title={data?.routing.defaultGateway || 'None'}>
              {data?.routing.defaultGateway || 'None'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[140px]">
              DNS: {data?.routing.dnsServers.slice(0, 2).join(', ') || 'N/A'}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Globe className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 flex-shrink-0">
        <button
          onClick={() => setActiveSubTab('interfaces')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
            activeSubTab === 'interfaces'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Interfaces &amp; Throughput ({data?.interfaces.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('sockets')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
            activeSubTab === 'sockets'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Active Sockets &amp; Peers ({data?.connections.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('routing')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
            activeSubTab === 'routing'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Routing &amp; DNS</span>
        </button>

        <button
          onClick={() => setActiveSubTab('diagnostics')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
            activeSubTab === 'diagnostics'
              ? 'bg-sky-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Diagnostics Console (Ping, DNS, Port)</span>
        </button>
      </div>

      {/* Main Content Area */}
      {isLoading && !data ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400 mb-3" />
          <span className="text-xs">Querying Linux network interfaces and socket telemetry...</span>
        </div>
      ) : error && !data ? (
        <div className="p-6 bg-rose-950/30 border border-rose-800/50 rounded-lg text-center text-rose-300">
          <AlertTriangle className="w-8 h-8 mx-auto text-rose-400 mb-2" />
          <h4 className="font-semibold text-sm">Failed to Load Network Telemetry</h4>
          <p className="text-xs text-rose-400/80 mt-1">{error}</p>
          <button
            onClick={() => fetchNetwork(true)}
            className="mt-3 px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-xs rounded border border-rose-700 text-white transition"
          >
            Retry Connection
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 space-y-4">
          {/* TAB 1: INTERFACES */}
          {activeSubTab === 'interfaces' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.interfaces || []).map((iface) => (
                  <div
                    key={iface.name}
                    className="p-4 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-lg flex flex-col justify-between space-y-3 transition shadow-lg"
                  >
                    <div>
                      {/* Interface Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-100">{iface.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                              iface.status.toUpperCase() === 'UP'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {iface.status.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          MTU {iface.mtu || 1500}
                        </span>
                      </div>

                      {/* IP Addresses */}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">IPv4:</span>
                          <span className="font-mono text-slate-200">
                            {iface.ipAddress || <span className="text-slate-600">None</span>}
                          </span>
                        </div>
                        {iface.ip6Address && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">IPv6:</span>
                            <span className="font-mono text-slate-400 text-[11px] truncate max-w-[200px]" title={iface.ip6Address}>
                              {iface.ip6Address}
                            </span>
                          </div>
                        )}
                        {iface.macAddress && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">MAC:</span>
                            <span className="font-mono text-slate-400 text-[11px]">{iface.macAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RX / TX Throughput Grid */}
                    <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <ArrowDownLeft className="w-3 h-3" />
                          <span>RX Received</span>
                        </div>
                        <div className="text-sm font-bold font-mono text-slate-100 mt-1">
                          {iface.rxFormatted}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {iface.rxPackets.toLocaleString()} pkts
                        </div>
                        {(iface.rxErrors > 0 || iface.rxDropped > 0) && (
                          <div className="text-[10px] text-rose-400 font-mono mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Err: {iface.rxErrors} | Drop: {iface.rxDropped}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                        <div className="flex items-center gap-1 text-[11px] text-sky-400 font-medium">
                          <ArrowUpRight className="w-3 h-3" />
                          <span>TX Transmitted</span>
                        </div>
                        <div className="text-sm font-bold font-mono text-slate-100 mt-1">
                          {iface.txFormatted}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {iface.txPackets.toLocaleString()} pkts
                        </div>
                        {(iface.txErrors > 0 || iface.txDropped > 0) && (
                          <div className="text-[10px] text-rose-400 font-mono mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Err: {iface.txErrors} | Drop: {iface.txDropped}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE SOCKETS & PEERS */}
          {activeSubTab === 'sockets' && (
            <div className="space-y-4">
              {/* Connection State Breakdown Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSocketStateFilter('ALL')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                    socketStateFilter === 'ALL'
                      ? 'bg-slate-100 text-slate-900 shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ALL ({data?.connectionStats.total || 0})
                </button>

                <button
                  onClick={() => setSocketStateFilter('ESTABLISHED')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition ${
                    socketStateFilter === 'ESTABLISHED'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                >
                  ESTABLISHED ({data?.connectionStats.established || 0})
                </button>

                <button
                  onClick={() => setSocketStateFilter('LISTEN')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition ${
                    socketStateFilter === 'LISTEN'
                      ? 'bg-sky-600 text-white border-sky-500'
                      : 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                  }`}
                >
                  LISTEN ({data?.connectionStats.listen || 0})
                </button>

                <button
                  onClick={() => setSocketStateFilter('TIME-WAIT')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition ${
                    socketStateFilter === 'TIME-WAIT'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                >
                  TIME-WAIT ({data?.connectionStats.timeWait || 0})
                </button>

                <button
                  onClick={() => setSocketStateFilter('CLOSE-WAIT')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition ${
                    socketStateFilter === 'CLOSE-WAIT'
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                  }`}
                >
                  CLOSE-WAIT ({data?.connectionStats.closeWait || 0})
                </button>

                <div className="flex-1" />

                {/* Filter Search Input */}
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={socketSearch}
                    onChange={(e) => setSocketSearch(e.target.value)}
                    placeholder="Search IP, port, or process..."
                    className="w-full pl-8 pr-3 py-1 bg-slate-900/90 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              {/* Layout: Top Remote IPs + Sockets Table */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Top Remote IPs */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-col space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>Top Remote Peers</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {data?.connectionStats.topRemoteIps.length || 0} IPs
                    </span>
                  </div>

                  <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
                    {(data?.connectionStats.topRemoteIps || []).length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No active remote peers
                      </div>
                    ) : (
                      (data?.connectionStats.topRemoteIps || []).map((peer: { ip: string; count: number }, idx: number) => (
                        <div
                          key={peer.ip}
                          className="p-2 rounded bg-slate-950/70 border border-slate-800 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500 w-4">#{idx + 1}</span>
                            <span className="font-mono text-slate-200">{peer.ip}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-[11px] font-bold">
                            {peer.count} conn
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Sockets Table */}
                <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Proto</th>
                          <th className="py-2.5 px-3">State</th>
                          <th className="py-2.5 px-3">Local Address</th>
                          <th className="py-2.5 px-3">Remote Address</th>
                          <th className="py-2.5 px-3">Process</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {filteredConnections.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">
                              No connections found matching filters.
                            </td>
                          </tr>
                        ) : (
                          filteredConnections.map((conn: SocketConnection, idx: number) => (
                            <tr key={`${conn.localAddress}-${conn.remoteAddress}-${idx}`} className="hover:bg-slate-800/40 transition">
                              <td className="py-2 px-3 text-slate-400 uppercase text-[11px]">
                                {conn.protocol}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    stateColors[conn.state] || 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {conn.state}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-200">
                                {conn.localAddress}:{conn.localPort}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {conn.remoteAddress}:{conn.remotePort}
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-[11px] truncate max-w-[150px]" title={conn.process || ''}>
                                {conn.process || '---'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ROUTING & DNS */}
          {activeSubTab === 'routing' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Default Route Card */}
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>Default Gateway Route</span>
                  </div>
                  <div className="text-xl font-mono font-bold text-slate-100">
                    {data?.routing.defaultGateway || 'None'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Interface: <span className="text-sky-400">{data?.routing.defaultInterface || 'N/A'}</span>
                  </div>
                </div>

                {/* Configured DNS Resolvers */}
                <div className="md:col-span-2 p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-sky-400" />
                      <span>DNS Nameservers (/etc/resolv.conf)</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {data?.routing.dnsServers.length || 0} nameservers
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {(data?.routing.dnsServers || []).map((ns: string) => (
                      <div
                        key={ns}
                        className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-200"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{ns}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Kernel IP Routing Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
                <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-indigo-400" />
                    <span>Kernel IP Routes (ip route)</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {data?.routing.routes.length || 0} routes active
                  </span>
                </div>

                <div className="p-3 space-y-1 overflow-x-auto">
                  {(data?.routing.routes || []).length === 0 ? (
                    <div className="text-slate-500 text-xs py-4 text-center">No active routes found.</div>
                  ) : (
                    (data?.routing.routes || []).map((routeStr: string, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 bg-slate-950/70 border border-slate-800/80 rounded font-mono text-xs text-slate-200 hover:bg-slate-900 transition flex items-center gap-2"
                      >
                        <span className="text-slate-500 text-[10px] w-6">#{idx + 1}</span>
                        <span>{routeStr}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DIAGNOSTICS CONSOLE (PING, DNS, PORT PROBE) */}
          {activeSubTab === 'diagnostics' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Tool 1: Ping Latency Test */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-100">ICMP Ping Latency Test</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Target Host or IP</label>
                    <input
                      type="text"
                      value={pingHost}
                      onChange={(e) => setPingHost(e.target.value)}
                      placeholder="e.g. 8.8.8.8 or google.com"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="flex flex-wrap gap-1">
                    {['8.8.8.8', '1.1.1.1', 'google.com', 'cloudflare.com'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPingHost(p)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition"
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Packets Count</label>
                    <select
                      value={pingCount}
                      onChange={(e) => setPingCount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    >
                      <option value={2}>2 Packets (Fast)</option>
                      <option value={4}>4 Packets (Standard)</option>
                      <option value={8}>8 Packets (Extended)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleRunPing}
                    disabled={pingLoading}
                    className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded transition flex items-center justify-center gap-2"
                  >
                    {pingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>Execute Ping</span>
                  </button>
                </div>

                {/* Ping Results */}
                {pingResult && (
                  <div className="mt-3 p-3 rounded bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Target:</span>
                      <span className="text-slate-200 font-bold">{pingResult.host}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Packet Loss:</span>
                      <span className={pingResult.lossPercent === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {pingResult.lossPercent}% ({pingResult.received}/{pingResult.transmitted})
                      </span>
                    </div>

                    {pingResult.avgMs !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Average RTT:</span>
                        <span className="text-sky-400 font-bold">{pingResult.avgMs} ms</span>
                      </div>
                    )}

                    {pingResult.minMs !== undefined && pingResult.maxMs !== undefined && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Min/Max RTT:</span>
                        <span>{pingResult.minMs}ms / {pingResult.maxMs}ms</span>
                      </div>
                    )}

                    {pingResult.rawOutput && (
                      <details className="mt-2 text-[10px] text-slate-400 cursor-pointer">
                        <summary className="hover:text-slate-300">View Raw Output</summary>
                        <pre className="mt-1 p-2 bg-black/60 rounded text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {pingResult.rawOutput}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* Tool 2: DNS Query Resolver */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold text-slate-100">DNS Query Resolver</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Domain Name</label>
                    <input
                      type="text"
                      value={dnsHost}
                      onChange={(e) => setDnsHost(e.target.value)}
                      placeholder="e.g. github.com or openai.com"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="flex flex-wrap gap-1">
                    {['google.com', 'github.com', 'microsoft.com', 'cloudflare.com'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setDnsHost(d)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition"
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleRunDns}
                    disabled={dnsLoading}
                    className="w-full mt-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium text-xs rounded transition flex items-center justify-center gap-2"
                  >
                    {dnsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    <span>Resolve Domain</span>
                  </button>
                </div>

                {/* DNS Results */}
                {dnsResult && (
                  <div className="mt-3 p-3 rounded bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Domain:</span>
                      <span className="text-slate-200 font-bold">{dnsResult.host}</span>
                    </div>

                    {dnsResult.latencyMs !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Response Time:</span>
                        <span className="text-sky-400 font-bold">{dnsResult.latencyMs} ms</span>
                      </div>
                    )}

                    <div>
                      <span className="text-slate-400 block mb-1">Resolved Addresses:</span>
                      {dnsResult.records.length === 0 ? (
                        <span className="text-rose-400">No records found</span>
                      ) : (
                        <div className="space-y-1">
                          {dnsResult.records.map((rec: string, idx: number) => (
                            <div key={idx} className="px-2 py-1 bg-slate-900 rounded text-emerald-400 text-[11px] font-mono">
                              {rec}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {dnsResult.rawOutput && (
                      <details className="mt-2 text-[10px] text-slate-400 cursor-pointer">
                        <summary className="hover:text-slate-300">View Raw Output</summary>
                        <pre className="mt-1 p-2 bg-black/60 rounded text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {dnsResult.rawOutput}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* Tool 3: Outbound TCP Port Probe */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Radio className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-slate-100">Outbound TCP Port Probe</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Remote Host / IP</label>
                    <input
                      type="text"
                      value={probeHost}
                      onChange={(e) => setProbeHost(e.target.value)}
                      placeholder="e.g. 1.1.1.1 or example.com"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Port Number</label>
                    <input
                      type="number"
                      value={probePort}
                      onChange={(e) => setProbePort(Number(e.target.value))}
                      placeholder="443"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      { port: 80, label: 'HTTP (80)' },
                      { port: 443, label: 'HTTPS (443)' },
                      { port: 53, label: 'DNS (53)' },
                      { port: 22, label: 'SSH (22)' },
                      { port: 3306, label: 'MySQL (3306)' },
                    ].map((p) => (
                      <button
                        key={p.port}
                        onClick={() => setProbePort(p.port)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleRunPortProbe}
                    disabled={probeLoading}
                    className="w-full mt-2 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs rounded transition flex items-center justify-center gap-2"
                  >
                    {probeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>Probe Remote Port</span>
                  </button>
                </div>

                {/* Port Probe Results */}
                {probeResult && (
                  <div className="mt-3 p-3 rounded bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Endpoint:</span>
                      <span className="text-slate-200 font-bold">
                        {probeResult.host}:{probeResult.port}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold border ${
                          probeResult.isOpen
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {probeResult.isOpen ? 'OPEN / REACHABLE' : 'CLOSED / FILTERED'}
                      </span>
                    </div>

                    {probeResult.latencyMs !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Latency:</span>
                        <span className="text-purple-400 font-bold">{probeResult.latencyMs} ms</span>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                      {probeResult.message}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  Power,
  Flame,
  Globe,
  Radio,
  Lock,
  Unlock,
  Key,
  Users,
  UserX,
  Terminal,
  Activity,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  ServerSecurityOverview,
  AddFirewallRuleInput,
  FirewallRule,
  ListeningPort,
  FailedLoginAttempt,
  ActiveUserSession,
  Fail2BanJail,
  SecurityAuditItem,
} from '@server-console/shared';
import { api } from '../../api/client';

interface SecurityDashboardProps {
  serverId: string;
  serverName: string;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  serverId,
  serverName,
}) => {
  const [data, setData] = useState<ServerSecurityOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'firewall' | 'ports' | 'logins' | 'audit'>('firewall');
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add rule form state
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [rulePort, setRulePort] = useState('');
  const [ruleProto, setRuleProto] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny' | 'limit'>('allow');
  const [ruleFromIp, setRuleFromIp] = useState('');
  const [ruleComment, setRuleComment] = useState('');
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  // Firewall toggle state
  const [isTogglingFirewall, setIsTogglingFirewall] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setActionNotification({ type, message });
    setTimeout(() => setActionNotification(null), 4000);
  };

  const fetchSecurity = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const res = await api.getSecurityOverview(serverId);
      setData(res.security);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch security telemetry');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchSecurity();
  }, [fetchSecurity]);

  // Handle Firewall Enable/Disable Toggle
  const handleToggleFirewall = async (enable: boolean) => {
    const actionWord = enable ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${actionWord.toUpperCase()} the UFW firewall on ${serverName}?`)) {
      return;
    }

    setIsTogglingFirewall(true);
    try {
      const res = await api.toggleFirewall(serverId, enable);
      showToast('success', res.message);
      await fetchSecurity(true);
    } catch (err: any) {
      showToast('error', err.message || `Failed to ${actionWord} firewall`);
    } finally {
      setIsTogglingFirewall(false);
    }
  };

  // Handle Add Firewall Rule
  const handleAddRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulePort.trim()) return;

    setIsSubmittingRule(true);
    try {
      const ruleInput: AddFirewallRuleInput = {
        port: rulePort.trim(),
        protocol: ruleProto,
        action: ruleAction,
        fromIp: ruleFromIp.trim() || undefined,
        comment: ruleComment.trim() || undefined,
      };

      const res = await api.addFirewallRule(serverId, ruleInput);
      showToast('success', res.message);
      setShowAddRuleModal(false);
      setRulePort('');
      setRuleComment('');
      setRuleFromIp('');
      await fetchSecurity(true);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to add firewall rule');
    } finally {
      setIsSubmittingRule(false);
    }
  };

  // Preset Rule Shortcut
  const handleAddPresetRule = async (port: string, proto: 'tcp' | 'udp' | 'any', action: 'allow' | 'limit', comment: string) => {
    try {
      const res = await api.addFirewallRule(serverId, {
        port,
        protocol: proto,
        action,
        comment,
      });
      showToast('success', res.message);
      await fetchSecurity(true);
    } catch (err: any) {
      showToast('error', err.message || `Failed to add ${comment} rule`);
    }
  };

  // Handle Delete Firewall Rule
  const handleDeleteRule = async (ruleNumber?: number) => {
    if (!ruleNumber) return;
    if (!confirm(`Delete firewall rule #${ruleNumber}?`)) return;

    try {
      const res = await api.deleteFirewallRule(serverId, ruleNumber);
      showToast('success', res.message);
      await fetchSecurity(true);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete rule');
    }
  };

  // Handle Unban IP
  const handleUnbanIp = async (jail: string, ip: string) => {
    try {
      const res = await api.unbanIp(serverId, jail, ip);
      showToast('success', res.message);
      await fetchSecurity(true);
    } catch (err: any) {
      showToast('error', err.message || `Failed to unban IP ${ip}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-panel-inset text-content-muted gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-medium">Scanning server security posture and firewall...</span>
      </div>
    );
  }

  const score = data?.securityScore ?? 0;
  const isFirewallActive = data?.firewall.status === 'active';
  const listeningCount = data?.listeningPorts.length ?? 0;
  const publicListeningCount = data?.listeningPorts.filter((p: ListeningPort) => p.isPublic).length ?? 0;
  const failedCount = data?.failedLogins.length ?? 0;
  const isFail2banRunning = Boolean(data?.fail2ban.isRunning);

  // Score color badge
  const getScoreColor = (sc: number) => {
    if (sc >= 80) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30';
    if (sc >= 60) return 'text-amber-400 border-amber-500/40 bg-amber-950/30';
    return 'text-rose-400 border-rose-500/40 bg-rose-950/30';
  };

  return (
    <div className="flex flex-col h-full bg-panel-inset overflow-y-auto text-content-secondary">
      {/* Action Notification Toast */}
      {actionNotification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg border shadow-2xl flex items-center gap-2 text-xs font-medium transition backdrop-blur-md ${
            actionNotification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500 text-rose-200'
          }`}
        >
          {actionNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{actionNotification.message}</span>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-panel/80 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-content-primary">Security &amp; Firewall Console</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-panel-alt border border-border text-content-muted font-mono">
              {serverName}
            </span>
          </div>
          <p className="text-xs text-content-muted mt-0.5">
            Network firewall, port attack surface, intrusion logs, and automated SSH security audit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSecurity(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-panel-alt hover:bg-border disabled:opacity-50 text-content-primary rounded border border-border text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Scanning...' : 'Rescan Posture'}</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="m-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg flex items-center gap-3 text-xs text-rose-300">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => fetchSecurity(true)} className="underline hover:text-white">
            Retry
          </button>
        </div>
      )}

      {/* Key Metrics Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border-b border-border/80">
        {/* Security Score */}
        <div className={`p-3.5 rounded-lg border flex flex-col justify-between ${getScoreColor(score)}`}>
          <div className="flex items-center justify-between text-xs font-medium">
            <span>Security Score</span>
            <Shield className="w-4 h-4 opacity-80" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono">{score}</span>
            <span className="text-xs opacity-70">/ 100</span>
          </div>
          <div className="mt-1 text-[11px] font-medium opacity-80">
            {score >= 80 ? 'Well Protected' : score >= 60 ? 'Needs Attention' : 'Vulnerable'}
          </div>
        </div>

        {/* Firewall Status */}
        <div className="p-3.5 rounded-lg border border-border bg-panel/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>UFW Firewall</span>
            <Flame className={`w-4 h-4 ${isFirewallActive ? 'text-emerald-400' : 'text-content-muted'}`} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isFirewallActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-sm font-semibold uppercase">{data?.firewall.status || 'Unknown'}</span>
          </div>
          <div className="mt-1 text-[11px] text-content-muted truncate">
            {isFirewallActive ? `${data?.firewall.rules.length || 0} active rules` : 'Disabled'}
          </div>
        </div>

        {/* Exposed Public Ports */}
        <div className="p-3.5 rounded-lg border border-border bg-panel/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Open Ports</span>
            <Globe className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-content-primary">{listeningCount}</span>
            <span className="text-xs text-content-muted">total</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-400">
            {publicListeningCount} exposed publicly
          </div>
        </div>

        {/* Intrusion Protection (Fail2ban) */}
        <div className="p-3.5 rounded-lg border border-border bg-panel/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Fail2ban</span>
            <Lock className={`w-4 h-4 ${isFail2banRunning ? 'text-emerald-400' : 'text-content-muted'}`} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isFail2banRunning ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-sm font-semibold">{isFail2banRunning ? 'Active' : 'Not Running'}</span>
          </div>
          <div className="mt-1 text-[11px] text-content-muted">
            {data?.fail2ban.jails.length || 0} jail(s) monitored
          </div>
        </div>

        {/* Recent Failed Logins */}
        <div className="p-3.5 rounded-lg border border-border bg-panel/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Failed Logins</span>
            <UserX className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold font-mono ${failedCount > 0 ? 'text-rose-400' : 'text-content-primary'}`}>
              {failedCount}
            </span>
            <span className="text-xs text-content-muted">in log</span>
          </div>
          <div className="mt-1 text-[11px] text-content-muted">
            {failedCount > 0 ? 'Brute force probe detected' : 'Zero recent failures'}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center px-4 border-b border-border bg-panel/40 text-xs">
        <button
          onClick={() => setActiveSubTab('firewall')}
          className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-medium transition ${
            activeSubTab === 'firewall'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Firewall Rules (UFW)</span>
          <span className="px-1.5 py-0.2 rounded bg-panel-alt text-[10px] text-content-secondary">
            {data?.firewall.rules.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('ports')}
          className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-medium transition ${
            activeSubTab === 'ports'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Listening Ports</span>
          <span className="px-1.5 py-0.2 rounded bg-panel-alt text-[10px] text-content-secondary">
            {listeningCount}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('logins')}
          className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-medium transition ${
            activeSubTab === 'logins'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Intrusion &amp; Sessions</span>
          {failedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800/60 text-[10px]">
              {failedCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-medium transition ${
            activeSubTab === 'audit'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Hardening Audit</span>
          <span className="px-1.5 py-0.2 rounded bg-panel-alt text-[10px] text-content-secondary">
            {data?.auditItems.length || 0}
          </span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* ===================== TAB 1: FIREWALL CONTROL ===================== */}
        {activeSubTab === 'firewall' && (
          <div className="space-y-4">
            {/* Firewall Toggle & Summary Box */}
            <div className="flex flex-wrap items-center justify-between p-4 rounded-lg bg-panel border border-border gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                    isFirewallActive
                      ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-400'
                      : 'bg-rose-950/60 border-rose-600/50 text-rose-400'
                  }`}
                >
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-content-primary text-sm">
                      UFW Packet Filter Firewall
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                        isFirewallActive
                          ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950 border border-rose-500/50 text-rose-300'
                      }`}
                    >
                      {isFirewallActive ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <div className="text-xs text-content-muted mt-0.5">
                    Default Policy: Incoming <span className="font-mono text-content-secondary">{data?.firewall.defaultIncoming}</span>, Outgoing <span className="font-mono text-content-secondary">{data?.firewall.defaultOutgoing}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleFirewall(!isFirewallActive)}
                  disabled={isTogglingFirewall}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition ${
                    isFirewallActive
                      ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-800 text-rose-300'
                      : 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-800 text-emerald-300'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isFirewallActive ? 'Disable Firewall' : 'Enable Firewall'}</span>
                </button>

                <button
                  onClick={() => setShowAddRuleModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rule</span>
                </button>
              </div>
            </div>

            {/* Quick Rule Presets */}
            <div className="p-3 bg-panel/50 border border-border rounded-lg">
              <span className="text-xs font-medium text-content-muted block mb-2">
                ⚡ Quick Presets (1-Click Rule Creation):
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAddPresetRule('22', 'tcp', 'allow', 'SSH access')}
                  className="px-2.5 py-1 bg-panel-alt hover:bg-border text-content-secondary rounded border border-border text-xs transition"
                >
                  + Allow SSH (22/tcp)
                </button>
                <button
                  onClick={() => handleAddPresetRule('80', 'tcp', 'allow', 'HTTP web')}
                  className="px-2.5 py-1 bg-panel-alt hover:bg-border text-content-secondary rounded border border-border text-xs transition"
                >
                  + Allow HTTP (80/tcp)
                </button>
                <button
                  onClick={() => handleAddPresetRule('443', 'tcp', 'allow', 'HTTPS secure web')}
                  className="px-2.5 py-1 bg-panel-alt hover:bg-border text-content-secondary rounded border border-border text-xs transition"
                >
                  + Allow HTTPS (443/tcp)
                </button>
                <button
                  onClick={() => handleAddPresetRule('22', 'tcp', 'limit', 'Anti brute-force rate limit')}
                  className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 rounded border border-amber-800/60 text-xs transition"
                  title="Limits SSH login attempts to 6 per 30 seconds"
                >
                  🛡️ Rate-Limit SSH (Anti Brute-Force)
                </button>
                <button
                  onClick={() => handleAddPresetRule('5900:5910', 'tcp', 'allow', 'VNC remote display')}
                  className="px-2.5 py-1 bg-panel-alt hover:bg-border text-content-secondary rounded border border-border text-xs transition"
                >
                  + Allow VNC (5900-5910/tcp)
                </button>
              </div>
            </div>

            {/* Current Active Firewall Rules Table */}
            <div className="border border-border rounded-lg overflow-hidden bg-panel/60">
              <div className="px-4 py-2.5 bg-panel border-b border-border text-xs font-semibold text-content-secondary flex items-center justify-between">
                <span>Active Rules ({data?.firewall.rules.length || 0})</span>
                <span className="text-[11px] text-content-muted font-normal">
                  Rules are evaluated sequentially from top to bottom
                </span>
              </div>

              {data?.firewall.rules.length === 0 ? (
                <div className="p-8 text-center text-content-muted text-xs">
                  No custom firewall rules configured. Default policy applies to all traffic.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-content-secondary">
                    <thead className="bg-panel-inset/80 text-content-muted border-b border-border font-mono text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">To (Port / Service)</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">From Source</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data?.firewall.rules.map((rule: FirewallRule, idx: number) => (
                        <tr key={idx} className="hover:bg-panel-alt/30 transition">
                          <td className="py-2.5 px-3 font-mono text-content-muted">
                            {rule.number || idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-content-primary">
                            {rule.to}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                rule.action === 'ALLOW'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                  : rule.action === 'DENY' || rule.action === 'REJECT'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                              }`}
                            >
                              {rule.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-content-muted">
                            {rule.from}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleDeleteRule(rule.number)}
                              title={`Delete rule #${rule.number}`}
                              className="p-1 rounded text-content-muted hover:text-rose-400 hover:bg-panel-alt transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 2: LISTENING PORTS ===================== */}
        {activeSubTab === 'ports' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-panel border border-border rounded-lg text-xs text-content-secondary">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <span>Detected Network Listening Sockets (via <code className="font-mono text-content-primary">ss -tulpn</code>)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Publicly Exposed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Localhost (127.0.0.1)
                </span>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden bg-panel/60">
              <table className="w-full text-left text-xs text-content-secondary">
                <thead className="bg-panel-inset/80 text-content-muted border-b border-border font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Port</th>
                    <th className="py-2.5 px-3">Protocol</th>
                    <th className="py-2.5 px-3">Bind Address</th>
                    <th className="py-2.5 px-3">Process Name</th>
                    <th className="py-2.5 px-3">PID</th>
                    <th className="py-2.5 px-3">Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data?.listeningPorts.map((port: ListeningPort, idx: number) => (
                    <tr key={idx} className="hover:bg-panel-alt/30 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-300">
                        {port.port}
                      </td>
                      <td className="py-2.5 px-3 font-mono uppercase text-content-muted">
                        {port.protocol}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-content-secondary">
                        {port.bindAddress}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-content-primary">
                        {port.process}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-content-muted">
                        {port.pid || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {port.isPublic ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/50 flex items-center gap-1 w-fit">
                            <Globe className="w-3 h-3" /> Public (0.0.0.0)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3" /> Local Only
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================== TAB 3: INTRUSION & SESSIONS ===================== */}
        {activeSubTab === 'logins' && (
          <div className="space-y-4">
            {/* Active User Sessions */}
            <div className="border border-border rounded-lg overflow-hidden bg-panel/60">
              <div className="px-4 py-2.5 bg-panel border-b border-border text-xs font-semibold text-content-secondary flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Currently Logged-In Sessions ({data?.activeSessions.length || 0})
                </span>
                <span className="text-[11px] text-content-muted font-normal">Active SSH and local ttys</span>
              </div>
              {data?.activeSessions.length === 0 ? (
                <div className="p-4 text-content-muted text-xs text-center">No active interactive sessions</div>
              ) : (
                <table className="w-full text-left text-xs text-content-secondary">
                  <thead className="bg-panel-inset/80 text-content-muted border-b border-border font-mono text-[11px]">
                    <tr>
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3">TTY</th>
                      <th className="py-2 px-3">From Host / IP</th>
                      <th className="py-2 px-3">Login Time</th>
                      <th className="py-2 px-3">Command</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data?.activeSessions.map((sess: ActiveUserSession, idx: number) => (
                      <tr key={idx} className="hover:bg-panel-alt/30">
                        <td className="py-2 px-3 font-semibold text-emerald-300">{sess.user}</td>
                        <td className="py-2 px-3 font-mono text-content-muted">{sess.tty}</td>
                        <td className="py-2 px-3 font-mono text-content-secondary">{sess.fromIp}</td>
                        <td className="py-2 px-3 text-content-muted">{sess.loginTime}</td>
                        <td className="py-2 px-3 font-mono text-content-muted">{sess.command || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Fail2Ban Jails & Banned IPs */}
            <div className="border border-border rounded-lg overflow-hidden bg-panel/60">
              <div className="px-4 py-2.5 bg-panel border-b border-border text-xs font-semibold text-content-secondary flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-sky-400" />
                  Fail2ban Jails ({data?.fail2ban.jails.length || 0})
                </span>
                <span className={`text-[11px] font-medium ${isFail2banRunning ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isFail2banRunning ? 'Daemon Running' : 'Daemon Inactive'}
                </span>
              </div>
              <div className="p-4 space-y-3">
                {data?.fail2ban.jails.length === 0 ? (
                  <div className="text-xs text-content-muted text-center py-2">
                    No active Fail2ban jails configured.
                  </div>
                ) : (
                  data?.fail2ban.jails.map((jail: Fail2BanJail, idx: number) => (
                    <div key={idx} className="p-3 bg-panel-inset rounded border border-border flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-content-secondary text-xs flex items-center gap-2">
                          <span>Jail:</span>
                          <span className="font-mono text-sky-300">{jail.name}</span>
                        </div>
                        <div className="text-[11px] text-content-muted mt-1">
                          Currently Banned: <span className="text-rose-400 font-bold">{jail.currentlyBanned}</span> IP(s)
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {jail.bannedIps.map((bIp: string, bIdx: number) => (
                          <div key={bIdx} className="flex items-center gap-1.5 px-2 py-1 bg-panel rounded border border-border-strong text-xs font-mono">
                            <span className="text-rose-300">{bIp}</span>
                            <button
                              onClick={() => handleUnbanIp(jail.name, bIp)}
                              className="text-content-muted hover:text-content-primary"
                              title="Unban this IP"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Failed Password Attempts Log */}
            <div className="border border-border rounded-lg overflow-hidden bg-panel/60">
              <div className="px-4 py-2.5 bg-panel border-b border-border text-xs font-semibold text-content-secondary flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserX className="w-4 h-4 text-rose-400" />
                  Recent Failed Login Probes ({data?.failedLogins.length || 0})
                </span>
                <span className="text-[11px] text-content-muted font-normal">Parsed from SSH authentication journals</span>
              </div>
              {data?.failedLogins.length === 0 ? (
                <div className="p-6 text-center text-content-muted text-xs">
                  Zero failed login attempts detected in recent SSH auth logs. Clean audit.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-content-secondary">
                  <thead className="bg-panel-inset/80 text-content-muted border-b border-border font-mono text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Target Username</th>
                      <th className="py-2 px-3">Attacker IP</th>
                      <th className="py-2 px-3">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data?.failedLogins.map((fail: FailedLoginAttempt, idx: number) => (
                      <tr key={idx} className="hover:bg-panel-alt/30">
                        <td className="py-2 px-3 text-content-muted font-mono text-[11px]">{fail.timestamp}</td>
                        <td className="py-2 px-3 font-semibold text-rose-300 font-mono">{fail.user}</td>
                        <td className="py-2 px-3 font-mono text-content-primary">{fail.ip}</td>
                        <td className="py-2 px-3 text-content-muted">{fail.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 4: HARDENING AUDIT ===================== */}
        {activeSubTab === 'audit' && (
          <div className="space-y-4">
            <div className="p-4 bg-panel border border-border rounded-lg flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-content-primary">Automated Server Hardening Audit</h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Best-practice security benchmarks for production Linux instances.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-muted">Posture Rating:</span>
                <span className={`px-2.5 py-1 rounded text-xs font-bold font-mono border ${getScoreColor(score)}`}>
                  {score} / 100
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data?.auditItems.map((item: SecurityAuditItem) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border bg-panel/60 border-border flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-xs text-content-secondary">{item.title}</h4>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'pass'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : item.status === 'warn'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                            : item.status === 'fail'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                            : 'bg-panel-alt text-content-secondary border border-border'
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-content-muted mt-2 leading-relaxed">{item.description}</p>
                  </div>

                  {item.recommendation && (
                    <div className="mt-3 pt-2.5 border-t border-border/80 flex items-start gap-1.5 text-[11px] text-amber-300/90 font-mono">
                      <span className="shrink-0 font-bold">Fix:</span>
                      <span>{item.recommendation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Firewall Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border-strong rounded-lg max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-semibold text-content-primary flex items-center gap-2 text-sm">
                <Flame className="w-4 h-4 text-emerald-400" />
                Add UFW Firewall Rule
              </h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="text-content-muted hover:text-content-secondary text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRuleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Port or Port Range:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. 80, 443, 3000:3010"
                  value={rulePort}
                  onChange={(e) => setRulePort(e.target.value)}
                  className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Protocol:</label>
                  <select
                    value={ruleProto}
                    onChange={(e: any) => setRuleProto(e.target.value)}
                    className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary focus:outline-none focus:border-sky-500"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="any">Any Protocol</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Action:</label>
                  <select
                    value={ruleAction}
                    onChange={(e: any) => setRuleAction(e.target.value)}
                    className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary focus:outline-none focus:border-sky-500"
                  >
                    <option value="allow">ALLOW (Permit traffic)</option>
                    <option value="deny">DENY (Block traffic)</option>
                    <option value="limit">LIMIT (Rate limit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Source IP / Subnet (Optional):
                </label>
                <input
                  type="text"
                  placeholder="Leave empty for Anywhere, or e.g. 192.168.1.50"
                  value={ruleFromIp}
                  onChange={(e) => setRuleFromIp(e.target.value)}
                  className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Comment / Description (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Web Frontend"
                  value={ruleComment}
                  onChange={(e) => setRuleComment(e.target.value)}
                  className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-3 py-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRule || !rulePort.trim()}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium"
                >
                  {isSubmittingRule ? 'Applying...' : 'Apply Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Database,
  Lock,
  FileText,
  RefreshCw,
  CheckCircle,
  User,
  Palette,
  Sliders,
  AlertTriangle,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Sun,
  Moon,
  Monitor as MonitorIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { AuditLogDTO, UserPreferencesDTO } from '@server-console/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AccessSection } from '../components/settings/AccessSection';

type SettingsTab = 'account' | 'preferences' | 'defaults' | 'access' | 'security' | 'danger';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'defaults', label: 'Connection Defaults', icon: Sliders },
  { id: 'access', label: 'Access & 2FA', icon: Lock },
  { id: 'security', label: 'Security & Audit', icon: Shield },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-2">
      <div className="p-4 bg-panel/60 rounded-xl border border-border mb-4">
        <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <span>Settings</span>
        </h2>
        <p className="text-xs text-content-muted mt-0.5">
          Account, appearance, connection defaults, and system administration
        </p>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        <nav className="w-48 flex-shrink-0 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                  activeTab === tab.id
                    ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30'
                    : 'text-content-secondary hover:bg-panel-alt border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto pr-1">
          {activeTab === 'account' && <AccountSection />}
          {activeTab === 'preferences' && <PreferencesSection />}
          {activeTab === 'defaults' && <DefaultsSection />}
          {activeTab === 'access' && <AccessSection />}
          {activeTab === 'security' && <SecuritySection />}
          {activeTab === 'danger' && <DangerZoneSection />}
        </div>
      </div>
    </div>
  );
};

// ---------- Account ----------

const AccountSection: React.FC = () => {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();

  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAccount(true);
    try {
      const res = await api.updateAccount({ username, email: email || undefined });
      setUser(res.user);
      showToast('Account details updated', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update account', 'error');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      showToast('Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <form onSubmit={handleSaveAccount} className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
          <User className="w-4 h-4 text-sky-400" />
          <span>Account Details</span>
        </div>

        <div>
          <label className="block text-content-secondary font-medium mb-1 text-xs">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs focus:outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label className="block text-content-secondary font-medium mb-1 text-xs">Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@local.host"
            className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs focus:outline-none focus:border-sky-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSavingAccount}
          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-xs font-medium transition flex items-center gap-1.5"
        >
          {isSavingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save Changes
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Change Password</span>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords(!showPasswords)}
            className="text-content-muted hover:text-content-secondary"
            title={showPasswords ? 'Hide passwords' : 'Show passwords'}
          >
            {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div>
          <label className="block text-content-secondary font-medium mb-1 text-xs">Current Password</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-content-secondary font-medium mb-1 text-xs">New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-content-secondary font-medium mb-1 text-xs">Confirm New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isChangingPassword}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium transition flex items-center gap-1.5"
        >
          {isChangingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Update Password
        </button>
      </form>
    </div>
  );
};

// ---------- Preferences ----------

const PreferencesSection: React.FC = () => {
  const { mode, setMode } = useTheme();
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<UserPreferencesDTO | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api.getPreferences().then((res) => setPrefs(res.preferences)).catch(() => {});
  }, []);

  const handleThemeChange = async (next: ThemeMode) => {
    setMode(next);
    try {
      await api.updatePreferences({ themeMode: next });
    } catch {}
  };

  const savePrefs = async (updates: Partial<UserPreferencesDTO>) => {
    if (!prefs) return;
    const merged = { ...prefs, ...updates };
    setPrefs(merged);
    setIsSaving(true);
    try {
      await api.updatePreferences(updates);
      showToast('Preference saved', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save preference', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const themeOptions: { value: ThemeMode; label: string; icon: React.ElementType }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: MonitorIcon },
  ];

  return (
    <div className="space-y-4 max-w-xl">
      <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
          <Palette className="w-4 h-4 text-purple-400" />
          <span>Appearance</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => handleThemeChange(opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition ${
                  mode === opt.value
                    ? 'bg-sky-600/15 border-sky-500/40 text-sky-400'
                    : 'bg-panel-alt border-border text-content-secondary hover:border-border-strong'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {prefs && (
        <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <RefreshCw className="w-4 h-4 text-sky-400" />
            <span>Dashboard Behavior</span>
          </div>

          <div>
            <label className="block text-content-secondary font-medium mb-1 text-xs">
              Auto-refresh interval ({prefs.dashboardRefreshSeconds}s)
            </label>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={prefs.dashboardRefreshSeconds}
              onChange={(e) => setPrefs({ ...prefs, dashboardRefreshSeconds: Number(e.target.value) })}
              onMouseUp={() => savePrefs({ dashboardRefreshSeconds: prefs.dashboardRefreshSeconds })}
              onTouchEnd={() => savePrefs({ dashboardRefreshSeconds: prefs.dashboardRefreshSeconds })}
              className="w-full accent-sky-500"
            />
          </div>

          <div>
            <label className="block text-content-secondary font-medium mb-1 text-xs">Default landing page</label>
            <select
              value={prefs.defaultLandingTab}
              onChange={(e) => savePrefs({ defaultLandingTab: e.target.value })}
              className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs focus:outline-none focus:border-sky-500"
            >
              <option value="dashboard">Dashboard</option>
              <option value="servers">Servers List</option>
            </select>
          </div>

          {isSaving && <span className="text-[11px] text-content-muted">Saving…</span>}
        </div>
      )}
    </div>
  );
};

// ---------- Connection Defaults ----------

const DefaultsSection: React.FC = () => {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<UserPreferencesDTO | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api.getPreferences().then((res) => setPrefs(res.preferences)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setIsSaving(true);
    try {
      await api.updatePreferences({
        defaultSshPort: prefs.defaultSshPort,
        defaultSshUsername: prefs.defaultSshUsername,
        defaultVncPort: prefs.defaultVncPort,
      });
      showToast('Connection defaults saved', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save defaults', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!prefs) return null;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl p-4 bg-panel/80 rounded-xl border border-border space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
        <Sliders className="w-4 h-4 text-amber-400" />
        <span>Default Values for New Servers</span>
      </div>
      <p className="text-xs text-content-muted">
        Pre-fills the "Add Server" form so you spend less time typing when most of your fleet shares the same conventions.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-content-secondary font-medium mb-1 text-xs">Default SSH Port</label>
          <input
            type="number"
            value={prefs.defaultSshPort}
            onChange={(e) => setPrefs({ ...prefs, defaultSshPort: Number(e.target.value) })}
            className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
          />
        </div>
        <div>
          <label className="block text-content-secondary font-medium mb-1 text-xs">Default VNC Port</label>
          <input
            type="number"
            value={prefs.defaultVncPort}
            onChange={(e) => setPrefs({ ...prefs, defaultVncPort: Number(e.target.value) })}
            className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-content-secondary font-medium mb-1 text-xs">Default SSH Username</label>
        <input
          type="text"
          value={prefs.defaultSshUsername}
          onChange={(e) => setPrefs({ ...prefs, defaultSshUsername: e.target.value })}
          className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary text-xs font-mono focus:outline-none focus:border-sky-500"
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-xs font-medium transition flex items-center gap-1.5"
      >
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save Defaults
      </button>
    </form>
  );
};

// ---------- Security & Audit (existing content) ----------

const SecuritySection: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getAuditLogs(50);
      setLogs(res.logs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Credential Encryption</span>
          </div>
          <p className="text-xs text-content-muted">
            All SSH passwords, private keys, and VNC secrets are encrypted in SQLite using authenticated{' '}
            <strong className="text-content-primary">AES-256-GCM</strong> with 96-bit random IVs.
          </p>
          <div className="p-2 bg-panel-alt rounded border border-border font-mono text-[11px] text-emerald-400 flex items-center justify-between">
            <span>Algorithm: AES-256-GCM</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <Key className="w-4 h-4 text-sky-400" />
            <span>Session Authentication</span>
          </div>
          <p className="text-xs text-content-muted">
            Sessions are validated using signed JWT tokens with HttpOnly cookies or Bearer tokens, protecting both REST API and WebSocket bridges.
          </p>
          <div className="p-2 bg-panel-alt rounded border border-border font-mono text-[11px] text-sky-400 flex items-center justify-between">
            <span>WebSocket Auth: Active</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <Database className="w-4 h-4 text-purple-400" />
            <span>Storage & Persistence</span>
          </div>
          <p className="text-xs text-content-muted">
            Local SQLite database with WAL (Write-Ahead Logging) enabled. The data-access layer is architected for drop-in PostgreSQL migration.
          </p>
          <div className="p-2 bg-panel-alt rounded border border-border font-mono text-[11px] text-purple-400 flex items-center justify-between">
            <span>Driver: Native SQLite (WAL)</span>
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <div className="bg-panel/60 rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border text-xs text-content-secondary">
          <div className="flex items-center gap-2 font-semibold">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Audit Trail Logs</span>
          </div>

          <button
            onClick={fetchLogs}
            disabled={isLoadingLogs}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-border text-content-muted font-sans text-[11px]">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Operator</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Details</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-content-secondary">
              {logs.length === 0 && !isLoadingLogs && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-content-muted font-sans italic">
                    No audit records recorded yet.
                  </td>
                </tr>
              )}

              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-panel-alt">
                  <td className="py-2 px-3 text-content-muted text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-semibold text-content-secondary font-sans">
                    {log.username || 'system'}
                  </td>
                  <td className="py-2 px-3 text-sky-400 font-bold">{log.action}</td>
                  <td className="py-2 px-3 text-content-muted truncate max-w-sm">{log.details || '—'}</td>
                  <td className="py-2 px-3">
                    {log.success ? (
                      <span className="text-emerald-400 font-sans text-[11px] font-medium">SUCCESS</span>
                    ) : (
                      <span className="text-rose-400 font-sans text-[11px] font-medium">FAILED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ---------- Danger Zone ----------

const DangerZoneSection: React.FC = () => {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [confirmWipeLogs, setConfirmWipeLogs] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await api.exportServers();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ioc-servers-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Server list exported (credentials excluded — re-enter on import)', 'success');
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await api.importServers({ servers: parsed.servers || [] });
      showToast(
        `Imported ${res.imported} server(s)${res.errors.length ? `, ${res.errors.length} failed` : ''}`,
        res.errors.length ? 'error' : 'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Import failed — check the file format', 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="p-4 bg-panel/80 rounded-xl border border-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
          <Download className="w-4 h-4 text-sky-400" />
          <span>Export / Import Server List</span>
        </div>
        <p className="text-xs text-content-muted">
          Exports server connection metadata as JSON. For security, passwords and private keys are never included —
          re-enter credentials after importing.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-xs font-medium transition"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-panel-alt hover:bg-border border border-border disabled:opacity-50 text-content-secondary rounded text-xs font-medium transition"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </div>
      </div>

      <div className="p-4 bg-rose-950/20 rounded-xl border border-rose-900/40 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
          <AlertTriangle className="w-4 h-4" />
          <span>Destructive Actions</span>
        </div>
        <div className="flex items-center justify-between p-3 bg-panel-alt rounded border border-border">
          <div>
            <div className="text-xs font-medium text-content-primary">Clear audit log history</div>
            <div className="text-[11px] text-content-muted mt-0.5">Removes all recorded audit entries. Cannot be undone.</div>
          </div>
          <button
            onClick={() => setConfirmWipeLogs(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-700/50 text-rose-300 rounded text-xs font-medium transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Logs
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmWipeLogs}
        title="Clear audit log history"
        description="This permanently deletes every recorded audit log entry. This cannot be undone."
        confirmLabel="Clear Logs"
        onConfirm={async () => {
          try {
            const res = await api.clearAuditLogs();
            showToast(`Cleared ${res.cleared} audit log entr${res.cleared === 1 ? 'y' : 'ies'}`, 'success');
          } catch (err: any) {
            showToast(err.message || 'Failed to clear audit logs', 'error');
          } finally {
            setConfirmWipeLogs(false);
          }
        }}
        onCancel={() => setConfirmWipeLogs(false)}
      />
    </div>
  );
};

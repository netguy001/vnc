import React, { useState } from 'react';
import { ServerDTO, ServerCreateInput, ConnectionTestResult } from '@server-console/shared';
import { api } from '../../api/client';
import { Server, Key, Lock, Monitor, Shield, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface ServerModalProps {
  initialServer?: ServerDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ServerModal: React.FC<ServerModalProps> = ({
  initialServer,
  isOpen,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialServer);

  const [name, setName] = useState(initialServer?.name || '');
  const [host, setHost] = useState(initialServer?.host || '');
  const [sshPort, setSshPort] = useState(initialServer?.sshPort || 22);
  const [sshUsername, setSshUsername] = useState(initialServer?.sshUsername || 'root');
  const [authMethod, setAuthMethod] = useState<'password' | 'privateKey'>(
    initialServer?.authMethod || 'password'
  );
  const [sshPassword, setSshPassword] = useState('');
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [showSshPassphrase, setShowSshPassphrase] = useState(false);

  // VNC
  const [vncEnabled, setVncEnabled] = useState(initialServer?.vncEnabled ?? true);
  const [vncHost, setVncHost] = useState(initialServer?.vncHost || '');
  const [vncPort, setVncPort] = useState(initialServer?.vncPort || 5900);
  const [vncPassword, setVncPassword] = useState('');
  const [showVncPassword, setShowVncPassword] = useState(false);

  const [serverGroup, setServerGroup] = useState(initialServer?.serverGroup || 'Default');
  const [description, setDescription] = useState(initialServer?.description || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: ServerCreateInput = {
      name: name.trim(),
      host: host.trim(),
      sshPort: Number(sshPort),
      sshUsername: sshUsername.trim(),
      authMethod,
      sshPassword: sshPassword || undefined,
      sshPrivateKey: sshPrivateKey || undefined,
      sshPassphrase: sshPassphrase || undefined,
      vncEnabled,
      vncHost: vncHost.trim() || undefined,
      vncPort: Number(vncPort),
      vncPassword: vncPassword || undefined,
      serverGroup: serverGroup.trim() || 'Default',
      description: description.trim() || undefined,
    };

    try {
      if (isEditing && initialServer) {
        await api.updateServer(initialServer.id, payload);
      } else {
        await api.createServer(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestExisting = async () => {
    if (!initialServer) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection(initialServer.id);
      setTestResult(res.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-slate-100">
              {isEditing ? `Edit Server: ${initialServer?.name}` : 'Add New Server'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* General Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Server Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Ubuntu 24.04"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Server Group</label>
              <input
                type="text"
                value={serverGroup}
                onChange={(e) => setServerGroup(e.target.value)}
                placeholder="e.g. Production, Staging, Contabo"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* SSH Configuration */}
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-1.5 font-semibold text-sky-400 text-xs">
              <Lock className="w-3.5 h-3.5" /> SSH Connection
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-medium mb-1">Host / IP Address *</label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="e.g. 194.163.150.10 or 127.0.0.1"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">SSH Port</label>
                <input
                  type="number"
                  required
                  value={sshPort}
                  onChange={(e) => setSshPort(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">SSH Username *</label>
                <input
                  type="text"
                  required
                  value={sshUsername}
                  onChange={(e) => setSshUsername(e.target.value)}
                  placeholder="root or ubuntu"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Auth Method</label>
                <select
                  value={authMethod}
                  onChange={(e: any) => setAuthMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="password">Password</option>
                  <option value="privateKey">SSH Private Key</option>
                </select>
              </div>
            </div>

            {authMethod === 'password' && (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  SSH Password {isEditing && initialServer?.hasSshPassword && '(Leave blank to keep existing)'}
                </label>
                <div className="relative">
                  <input
                    type={showSshPassword ? 'text' : 'password'}
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSshPassword(!showSshPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none"
                    title={showSshPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSshPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {authMethod === 'privateKey' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    SSH Private Key (PEM/OpenSSH) {isEditing && initialServer?.hasSshPrivateKey && '(Leave blank to keep existing)'}
                  </label>
                  <textarea
                    rows={3}
                    value={sshPrivateKey}
                    onChange={(e) => setSshPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Passphrase (optional)</label>
                  <div className="relative">
                    <input
                      type={showSshPassphrase ? 'text' : 'password'}
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                      placeholder="Key passphrase if encrypted"
                      className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSshPassphrase(!showSshPassphrase)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none"
                      title={showSshPassphrase ? 'Hide password' : 'Show password'}
                    >
                      {showSshPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* VNC Configuration */}
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                <Monitor className="w-3.5 h-3.5" /> VNC Remote Desktop
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={vncEnabled}
                  onChange={(e) => setVncEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500"
                />
                <span>Enable VNC</span>
              </label>
            </div>

            {vncEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">VNC Host</label>
                  <input
                    type="text"
                    value={vncHost}
                    onChange={(e) => setVncHost(e.target.value)}
                    placeholder={host || 'Defaults to host'}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">VNC Port</label>
                  <input
                    type="number"
                    value={vncPort}
                    onChange={(e) => setVncPort(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    VNC Password {isEditing && initialServer?.hasVncPassword && '(Saved)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showVncPassword ? 'text' : 'password'}
                      value={vncPassword}
                      onChange={(e) => setVncPassword(e.target.value)}
                      placeholder="Optional VNC password"
                      className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVncPassword(!showVncPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none"
                      title={showVncPassword ? 'Hide password' : 'Show password'}
                    >
                      {showVncPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Connection Results */}
          {testResult && (
            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center gap-1.5">
                {testResult.sshSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span className={testResult.sshSuccess ? 'text-emerald-300' : 'text-rose-300'}>
                  SSH: {testResult.sshMessage}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {testResult.vncSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span className={testResult.vncSuccess ? 'text-emerald-300' : 'text-rose-300'}>
                  VNC: {testResult.vncMessage}
                </span>
              </div>
              {testResult.latencyMs !== undefined && (
                <div className="text-slate-500">Probe Latency: {testResult.latencyMs}ms</div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleTestExisting}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded transition font-medium"
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  <span>Test Connection</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium transition flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEditing ? 'Save Changes' : 'Create Server'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

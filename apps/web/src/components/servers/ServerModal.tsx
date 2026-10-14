import React, { useState } from 'react';
import { ServerDTO, ServerCreateInput, ConnectionTestResult } from '@server-console/shared';
import { api } from '../../api/client';
import { Server, Key, Lock, Monitor, Shield, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Star, Tag, X } from 'lucide-react';

interface ServerModalProps {
  initialServer?: ServerDTO | null;
  /** When true, prefills fields from initialServer but always creates a new server (used for "Clone"). */
  cloneMode?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ServerModal: React.FC<ServerModalProps> = ({
  initialServer,
  cloneMode = false,
  isOpen,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialServer) && !cloneMode;

  const [name, setName] = useState(
    cloneMode && initialServer ? `${initialServer.name} (Copy)` : initialServer?.name || ''
  );
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
  const [tags, setTags] = useState<string[]>(cloneMode ? initialServer?.tags || [] : initialServer?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(initialServer?.isFavorite ?? false);

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
      tags,
      isFavorite,
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

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t) && tags.length < 20) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
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
      <div className="bg-panel border border-border rounded-xl max-w-xl w-full p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-content-primary">
              {isEditing
                ? `Edit Server: ${initialServer?.name}`
                : cloneMode
                ? `Clone Server: ${initialServer?.name}`
                : 'Add New Server'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
              className={`p-1 rounded transition ${isFavorite ? 'text-amber-400' : 'text-content-muted hover:text-amber-400'}`}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
            <button onClick={onClose} className="text-content-muted hover:text-content-secondary">
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {cloneMode && (
          <div className="mt-4 p-3 rounded bg-amber-950/30 border border-amber-800/60 text-amber-300 text-xs">
            Connection settings were copied. For security, passwords and private keys are never sent to the
            browser — re-enter credentials below to complete this server.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* General Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-content-secondary font-medium mb-1">Server Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Ubuntu 24.04"
                className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-content-secondary font-medium mb-1">Server Group</label>
              <input
                type="text"
                value={serverGroup}
                onChange={(e) => setServerGroup(e.target.value)}
                placeholder="e.g. Production, Staging, Europe-DC"
                className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-content-primary focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-content-secondary font-medium mb-1 flex items-center gap-1.5">
              <Tag className="w-3 h-3" /> Tags
            </label>
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-panel-alt border border-border rounded">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-600/15 border border-sky-500/30 text-sky-300 text-[11px]"
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="hover:text-rose-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length === 0 ? 'e.g. production, web, db (Enter to add)' : 'Add tag…'}
                className="flex-1 min-w-[100px] bg-transparent text-content-primary focus:outline-none py-0.5"
              />
            </div>
          </div>

          {/* SSH Configuration */}
          <div className="p-3 bg-panel-alt/60 rounded border border-border/80 space-y-3">
            <div className="flex items-center gap-1.5 font-semibold text-sky-400 text-xs">
              <Lock className="w-3.5 h-3.5" /> SSH Connection
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-content-secondary font-medium mb-1">Host / IP Address *</label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="e.g. 192.168.1.100 or 10.0.0.5"
                  className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-content-secondary font-medium mb-1">SSH Port</label>
                <input
                  type="number"
                  required
                  value={sshPort}
                  onChange={(e) => setSshPort(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-content-secondary font-medium mb-1">SSH Username *</label>
                <input
                  type="text"
                  required
                  value={sshUsername}
                  onChange={(e) => setSshUsername(e.target.value)}
                  placeholder="root or ubuntu"
                  className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">Auth Method</label>
                <select
                  value={authMethod}
                  onChange={(e: any) => setAuthMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary focus:outline-none focus:border-sky-500"
                >
                  <option value="password">Password</option>
                  <option value="privateKey">SSH Private Key</option>
                </select>
              </div>
            </div>

            {authMethod === 'password' && (
              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  SSH Password {isEditing && initialServer?.hasSshPassword && '(Leave blank to keep existing)'}
                </label>
                <div className="relative">
                  <input
                    type={showSshPassword ? 'text' : 'password'}
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3 pr-10 py-2 bg-panel border border-border-strong rounded text-content-primary focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSshPassword(!showSshPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none"
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
                  <label className="block text-content-secondary font-medium mb-1">
                    SSH Private Key (PEM/OpenSSH) {isEditing && initialServer?.hasSshPrivateKey && '(Leave blank to keep existing)'}
                  </label>
                  <textarea
                    rows={3}
                    value={sshPrivateKey}
                    onChange={(e) => setSshPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-content-secondary font-medium mb-1">Passphrase (optional)</label>
                  <div className="relative">
                    <input
                      type={showSshPassphrase ? 'text' : 'password'}
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                      placeholder="Key passphrase if encrypted"
                      className="w-full pl-3 pr-10 py-2 bg-panel border border-border-strong rounded text-content-primary focus:outline-none focus:border-sky-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSshPassphrase(!showSshPassphrase)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none"
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
          <div className="p-3 bg-panel-alt/60 rounded border border-border/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                <Monitor className="w-3.5 h-3.5" /> VNC Remote Desktop
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-content-secondary">
                <input
                  type="checkbox"
                  checked={vncEnabled}
                  onChange={(e) => setVncEnabled(e.target.checked)}
                  className="rounded bg-panel border-border-strong text-sky-500"
                />
                <span>Enable VNC</span>
              </label>
            </div>

            {vncEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-content-secondary font-medium mb-1">VNC Host</label>
                  <input
                    type="text"
                    value={vncHost}
                    onChange={(e) => setVncHost(e.target.value)}
                    placeholder={host || 'Defaults to host'}
                    className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-content-secondary font-medium mb-1">VNC Port</label>
                  <input
                    type="number"
                    value={vncPort}
                    onChange={(e) => setVncPort(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-content-secondary font-medium mb-1">
                    VNC Password {isEditing && initialServer?.hasVncPassword && '(Saved)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showVncPassword ? 'text' : 'password'}
                      value={vncPassword}
                      onChange={(e) => setVncPassword(e.target.value)}
                      placeholder="Optional VNC password"
                      className="w-full pl-3 pr-10 py-2 bg-panel border border-border-strong rounded text-content-primary font-mono focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVncPassword(!showVncPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none"
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
            <div className="p-3 bg-panel-alt rounded border border-border space-y-1.5 font-mono text-[11px]">
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
                <div className="text-content-muted">Probe Latency: {testResult.latencyMs}ms</div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleTestExisting}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-panel-alt hover:bg-border text-sky-400 border border-border rounded transition font-medium"
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
                className="px-4 py-2 rounded bg-panel-alt hover:bg-border text-content-secondary transition"
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

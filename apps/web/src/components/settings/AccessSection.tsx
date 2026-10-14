import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, KeyRound, Users, Trash2, Copy, Plus } from 'lucide-react';
import { api, ApiTokenDTO, UserRow } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

const card = 'p-4 bg-panel/80 border border-border rounded-xl space-y-3';
const inputCls = 'w-full bg-panel-inset border border-border rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-sky-500';
const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition';

const TwoFactorCard: React.FC = () => {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => setEnabled((await api.getTotpStatus()).enabled), []);
  useEffect(() => {
    load().catch(() => setEnabled(false));
  }, [load]);

  const start = async () => {
    try {
      const res = await api.beginTotpSetup();
      setSetup({ secret: res.secret, qr: await QRCode.toDataURL(res.uri, { margin: 1, width: 180 }) });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const confirm = async () => {
    try {
      const res = await api.enableTotp(code);
      setRecovery(res.recoveryCodes);
      setSetup(null);
      setCode('');
      setEnabled(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const disable = async () => {
    try {
      await api.disableTotp(password);
      setPassword('');
      setDisabling(false);
      setEnabled(false);
      showToast('Two-factor authentication disabled', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <section className={card}>
      <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" /> Two-factor authentication
        {enabled !== null && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${enabled ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-content-muted border-border bg-panel-alt'}`}>
            {enabled ? 'on' : 'off'}
          </span>
        )}
      </h3>
      <p className="text-xs text-content-muted">Require a code from an authenticator app (Google Authenticator, Authy, 1Password…) in addition to your password.</p>

      {recovery && (
        <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="text-xs text-amber-400 font-semibold">Save these recovery codes now — they are shown only once.</div>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs text-content-primary">
            {recovery.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button className={`${btn} bg-panel-alt border border-border text-content-primary`} onClick={() => navigator.clipboard?.writeText(recovery.join('\n'))}>
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button className={`${btn} text-content-muted`} onClick={() => setRecovery(null)}>
            I&apos;ve saved them
          </button>
        </div>
      )}

      {enabled === false && !setup && (
        <button className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`} onClick={start}>
          Set up 2FA
        </button>
      )}

      {setup && (
        <div className="flex flex-wrap gap-4 items-start">
          <img src={setup.qr} alt="2FA QR code" className="rounded bg-white p-1 w-[180px] h-[180px]" />
          <div className="space-y-2 text-xs text-content-muted flex-1 min-w-[220px]">
            <p>1. Scan the QR code with your authenticator app, or enter this key manually:</p>
            <code className="block p-2 rounded bg-panel-inset border border-border font-mono text-content-primary break-all">{setup.secret}</code>
            <p>2. Enter the 6-digit code it shows to confirm:</p>
            <div className="flex gap-2">
              <input className={`${inputCls} w-32 font-mono tracking-widest`} inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`} onClick={confirm} disabled={code.length < 6}>
                Verify &amp; enable
              </button>
            </div>
          </div>
        </div>
      )}

      {enabled && !disabling && (
        <button className={`${btn} bg-panel-alt border border-border text-content-primary hover:bg-border`} onClick={() => setDisabling(true)}>
          Disable 2FA…
        </button>
      )}
      {enabled && disabling && (
        <div className="flex gap-2 items-center">
          <input type="password" className={`${inputCls} w-56`} placeholder="Confirm with your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className={`${btn} bg-rose-600 hover:bg-rose-500 text-white`} onClick={disable}>
            Disable
          </button>
          <button className={`${btn} text-content-muted`} onClick={() => setDisabling(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
};

const TokensCard: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tokens, setTokens] = useState<ApiTokenDTO[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'viewer' | 'operator' | 'admin'>('viewer');
  const [days, setDays] = useState<string>('90');
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => setTokens((await api.getTokens()).tokens), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const roles = (['viewer', 'operator', 'admin'] as const).filter((r) => r === 'viewer' || user?.role === 'admin' || (user?.role === 'operator' && r === 'operator'));

  return (
    <section className={card}>
      <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-sky-400" /> API tokens
      </h3>
      <p className="text-xs text-content-muted">
        For scripts and monitoring (e.g. Prometheus). Send as <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Tokens cannot manage accounts or settings.
      </p>

      {fresh && (
        <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
          <div className="text-xs text-emerald-400 font-semibold">Copy your new token now — it will not be shown again.</div>
          <code className="block p-2 rounded bg-panel-inset border border-border font-mono text-[11px] break-all text-content-primary">{fresh}</code>
          <div className="flex gap-2">
            <button className={`${btn} bg-panel-alt border border-border text-content-primary`} onClick={() => navigator.clipboard?.writeText(fresh)}>
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button className={`${btn} text-content-muted`} onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {tokens.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 p-2 rounded bg-panel-alt/60 border border-border text-xs">
          <div className="min-w-0">
            <div className="font-medium text-content-primary truncate">
              {t.name} <span className="text-[10px] font-mono text-content-muted">({t.role})</span>
            </div>
            <div className="text-content-muted font-mono">
              created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleString()}` : 'never used'} ·{' '}
              {t.expiresAt ? `expires ${new Date(t.expiresAt).toLocaleDateString()}` : 'no expiry'}
            </div>
          </div>
          <button
            aria-label={`Revoke ${t.name}`}
            className="text-content-muted hover:text-rose-400"
            onClick={async () => {
              await api.revokeToken(t.id);
              load();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await api.createToken({ name, role, expiresInDays: days ? Number(days) : null });
            setFresh(res.token);
            setName('');
            load();
          } catch (err: any) {
            showToast(err.message, 'error');
          }
        }}
      >
        <label className="text-[11px] text-content-muted flex-1 min-w-[140px]">
          Name
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="prometheus" required />
        </label>
        <label className="text-[11px] text-content-muted">
          Role
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as any)}>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-content-muted">
          Expires in (days)
          <input className={`${inputCls} w-24`} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} placeholder="never" />
        </label>
        <button type="submit" className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`}>
          <Plus className="w-3.5 h-3.5" /> Create token
        </button>
      </form>
    </section>
  );
};

const UsersCard: React.FC = () => {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'operator' as UserRow['role'] });
  const [toDelete, setToDelete] = useState<UserRow | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => setUsers((await api.getUsers()).users), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) showToast(ok, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
    load();
  };

  return (
    <section className={card}>
      <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
        <Users className="w-4 h-4 text-purple-400" /> Users &amp; roles
      </h3>
      <p className="text-xs text-content-muted">
        <b>Viewer</b>: dashboards and read-only views · <b>Operator</b>: + terminal, VNC, files, service &amp; container actions · <b>Admin</b>: everything, including servers, firewall, runbooks and users.
      </p>

      {users.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-3 p-2 rounded bg-panel-alt/60 border border-border text-xs">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-content-primary">{u.username}</span>
            {u.id === me?.id && <span className="ml-1.5 text-[10px] text-content-muted">(you)</span>}
            {u.totpEnabled && <span className="ml-2 text-[10px] text-emerald-400">2FA</span>}
          </div>
          <select
            value={u.role}
            disabled={u.id === me?.id}
            onChange={(e) => guard(() => api.updateUser(u.id, { role: e.target.value as UserRow['role'] }), 'Role updated')}
            className="bg-panel border border-border rounded px-2 py-1 text-xs text-content-primary disabled:opacity-60"
            aria-label={`Role for ${u.username}`}
          >
            <option>viewer</option>
            <option>operator</option>
            <option>admin</option>
          </select>
          {u.totpEnabled && u.id !== me?.id && (
            <button className="text-content-muted hover:text-amber-400" onClick={() => guard(() => api.updateUser(u.id, { disableTotp: true }), '2FA reset')}>
              Reset 2FA
            </button>
          )}
          <button className="text-content-muted hover:text-sky-400" onClick={() => setResetFor(u)}>
            Set password
          </button>
          {u.id !== me?.id && (
            <button aria-label={`Delete ${u.username}`} className="text-content-muted hover:text-rose-400" onClick={() => setToDelete(u)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {resetFor && (
        <div className="flex gap-2 items-center p-2 rounded border border-border bg-panel-alt/40">
          <span className="text-xs text-content-muted">New password for {resetFor.username}:</span>
          <input type="password" className={`${inputCls} w-52`} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min 8 characters" />
          <button
            className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`}
            onClick={() =>
              guard(async () => {
                await api.updateUser(resetFor.id, { newPassword: newPw });
                setResetFor(null);
                setNewPw('');
              }, 'Password updated')
            }
          >
            Save
          </button>
          <button className={`${btn} text-content-muted`} onClick={() => setResetFor(null)}>
            Cancel
          </button>
        </div>
      )}

      <form
        className="flex flex-wrap gap-2 items-end pt-2 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          guard(async () => {
            await api.createUser(form);
            setForm({ ...form, username: '', password: '' });
          }, 'User created');
        }}
      >
        <label className="text-[11px] text-content-muted">
          Username
          <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </label>
        <label className="text-[11px] text-content-muted">
          Password
          <input type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
        </label>
        <label className="text-[11px] text-content-muted">
          Role
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRow['role'] })}>
            <option>viewer</option>
            <option>operator</option>
            <option>admin</option>
          </select>
        </label>
        <button type="submit" className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`}>
          <Plus className="w-3.5 h-3.5" /> Add user
        </button>
      </form>

      <ConfirmDialog
        isOpen={!!toDelete}
        title={`Delete user ${toDelete?.username ?? ''}?`}
        description="Their sessions stop working and their API tokens are removed."
        confirmLabel="Delete user"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const u = toDelete!;
          setToDelete(null);
          void guard(() => api.deleteUser(u.id), 'User deleted');
        }}
      />
    </section>
  );
};

export const AccessSection: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <TwoFactorCard />
      <TokensCard />
      {user?.role === 'admin' && <UsersCard />}
    </div>
  );
};

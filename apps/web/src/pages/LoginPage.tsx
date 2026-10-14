import React, { useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Lock, User, Mail, ShieldCheck, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { isInitialized, login, setup } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isInitialized) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setIsLoading(true);
    try {
      if (isInitialized) {
        await login({ username, password, totp: totp || undefined });
      } else {
        await setup({ username, password, email: email || undefined });
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.data?.totpRequired) {
        setNeedsTotp(true);
        setError(totp ? err.message : null);
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-app flex items-center justify-center p-4">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-panel border border-border rounded-xl p-8 shadow-2xl z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo.png"
            alt="IOC — Infrastructure Operations Console"
            className="w-16 h-16 rounded-xl object-contain mb-3 shadow-lg shadow-sky-500/10"
          />
          <h1 className="text-xl font-bold text-content-primary tracking-wide">
            <span className="text-sky-400">IOC</span>
          </h1>
          <p className="text-[11px] text-content-muted -mt-0.5">Infrastructure Operations Console</p>
          <p className="text-xs text-content-muted mt-2">
            {isInitialized
              ? 'Local-first infrastructure & server control'
              : 'Initial setup: Create administrator credentials'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-content-secondary font-medium mb-1">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-9 pr-3 py-2 bg-panel-alt border border-border-strong rounded text-content-primary placeholder-content-muted focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {isInitialized && needsTotp && (
            <div>
              <label className="block text-content-secondary font-medium mb-1">Two-factor code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="123456 or a recovery code"
                className="w-full px-3 py-2 bg-panel-alt border border-border-strong rounded text-content-primary placeholder-content-muted focus:outline-none focus:border-sky-500 font-mono tracking-widest"
              />
            </div>
          )}

          {!isInitialized && (
            <div>
              <label className="block text-content-secondary font-medium mb-1">Email (Optional)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@local.host"
                  className="w-full pl-9 pr-3 py-2 bg-panel-alt border border-border-strong rounded text-content-primary placeholder-content-muted focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-content-secondary font-medium mb-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2 bg-panel-alt border border-border-strong rounded text-content-primary placeholder-content-muted focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!isInitialized && (
            <div>
              <label className="block text-content-secondary font-medium mb-1">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2 bg-panel-alt border border-border-strong rounded text-content-primary placeholder-content-muted focus:outline-none focus:border-sky-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none transition-colors"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded transition flex items-center justify-center gap-2 mt-2 shadow-lg shadow-sky-600/20"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{isInitialized ? 'Sign In to Console' : 'Initialize & Create Admin'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 p-2.5 rounded bg-panel-alt/60 border border-border text-center text-[11px] text-content-muted">
          Configured in <span className="font-mono text-sky-400 font-semibold">admin.config.json</span>
          <div className="text-[10px] text-content-muted mt-0.5">
            Default: <code className="text-content-secondary font-mono">admin</code> / <code className="text-content-secondary font-mono">admin1234</code>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/80 text-center text-[11px] text-content-muted">
          Local-first architecture • Zero external credentials exposure
        </div>
      </div>
    </div>
  );
};

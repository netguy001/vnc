import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const CONSENT_KEY = 'ioc_ai_consent';

/** Renders the model's reply: fenced blocks as code, everything else as paragraphs. */
const Answer: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```(?:\w+)?\n?/);
  return (
    <div className="space-y-2 text-xs text-content-secondary leading-relaxed">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="p-2 rounded bg-black/40 border border-border font-mono text-[11px] text-content-primary whitespace-pre-wrap overflow-x-auto">
            {part.trim()}
          </pre>
        ) : (
          part.trim() && (
            <p key={i} className="whitespace-pre-wrap">
              {part.trim()}
            </p>
          )
        )
      )}
    </div>
  );
};

export const AiAssistant: React.FC<{ serverId: string; serverName: string }> = ({ serverId, serverName }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<{ enabled: boolean; model: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: string; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api.getAiStatus().then(setStatus).catch(() => setStatus({ enabled: false, model: '' }));
  }, []);

  if (user?.role === 'viewer') return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.aiDiagnose(serverId, question.trim() || undefined));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 bg-panel/80 rounded border border-border space-y-3">
      <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-400" /> AI assistant
        {status?.enabled && <span className="text-[10px] font-mono font-normal text-content-muted">{status.model}</span>}
      </h3>

      {status && !status.enabled && (
        <p className="text-xs text-content-muted">
          Optional. Add <code className="font-mono">ANTHROPIC_API_KEY=…</code> to <code className="font-mono">.env</code> and restart the server to enable health analysis for {serverName}.
        </p>
      )}

      {status?.enabled && !consented && (
        <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 text-xs text-content-secondary space-y-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" /> Before you use this
          </div>
          <p>
            Analysing a server sends a read-only snapshot — resource usage, top processes, failed services, recent error-level log lines and container
            names — to Anthropic&apos;s API. Obvious secrets (passwords, tokens, keys) are redacted first, but logs can still contain sensitive details.
            The assistant only gives advice; it never runs commands.
          </p>
          <button
            className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium"
            onClick={() => {
              try {
                localStorage.setItem(CONSENT_KEY, '1');
              } catch {
                /* consent just won't persist */
              }
              setConsented(true);
            }}
          >
            I understand, enable for this browser
          </button>
        </div>
      )}

      {status?.enabled && consented && (
        <>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && run()}
              placeholder="Optional question, e.g. “why is CPU high?” — leave empty for a general health check"
              className="flex-1 bg-panel-inset border border-border rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={run}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Analyze
            </button>
          </div>
          {error && <div className="text-xs text-rose-400">{error}</div>}
          {result && <Answer text={result.answer} />}
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useLive } from '../../context/LiveContext';

/** "● LIVE" pill: green and pulsing while connected, amber while reconnecting, grey when offline. */
export const LiveBadge: React.FC<{ updatedAt?: number | null; compact?: boolean }> = ({ updatedAt, compact }) => {
  const { status } = useLive();
  const [, force] = useState(0);

  // Re-render every second so "updated 3s ago" stays honest.
  useEffect(() => {
    if (!updatedAt) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [updatedAt]);

  const age = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  const stale = status === 'live' && age !== null && age > 15;
  const tone = stale || status === 'connecting' ? 'amber' : status === 'live' ? 'emerald' : 'slate';
  const label = status === 'live' ? (stale ? 'STALE' : 'LIVE') : status === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  const cls =
    tone === 'emerald'
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : tone === 'amber'
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-content-muted border-border bg-panel-alt';
  const dot = tone === 'emerald' ? 'bg-emerald-400 animate-pulse' : tone === 'amber' ? 'bg-amber-400' : 'bg-content-muted';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${cls}`}
      title={status === 'live' ? 'Real-time updates over WebSocket' : 'Real-time connection is not active; retrying automatically'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
      {!compact && age !== null && status === 'live' && <span className="font-normal opacity-80">· {age}s</span>}
    </span>
  );
};

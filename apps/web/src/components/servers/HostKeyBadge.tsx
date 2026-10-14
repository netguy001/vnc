import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

/** Shows the pinned SSH host-key fingerprint; admins can clear it after a legitimate server rebuild. */
export const HostKeyBadge: React.FC<{ serverId: string }> = ({ serverId }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [key, setKey] = useState<{ fingerprint: string; firstSeenAt: string } | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    api.getHostKey(serverId).then((r) => setKey(r.hostKey)).catch(() => setKey(null));
  }, [serverId]);
  useEffect(load, [load]);

  if (key === undefined) return null;

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border bg-panel-alt text-[11px] text-content-secondary"
        title={key ? `Pinned on first connect ${new Date(key.firstSeenAt).toLocaleString()}.\n${key.fingerprint}` : 'The key will be pinned on the next connection'}
      >
        <Fingerprint className={`w-3.5 h-3.5 ${key ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span className="font-mono">{key ? key.fingerprint.slice(0, 18) + '…' : 'host key not pinned yet'}</span>
        {key && user?.role === 'admin' && (
          <button className="text-content-muted hover:text-amber-400 ml-1" onClick={() => setConfirm(true)}>
            reset
          </button>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirm}
        title="Reset the trusted host key?"
        description="Only do this if the server was rebuilt or its SSH keys were intentionally rotated. The next connection will trust whatever key the server presents — if you didn't expect a change, investigate first (it could be a man-in-the-middle)."
        confirmLabel="Reset host key"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try {
            await api.resetHostKey(serverId);
            showToast('Host key cleared; it will be re-pinned on the next connection', 'success');
          } catch (err: any) {
            showToast(err.message, 'error');
          }
          load();
        }}
      />
    </>
  );
};

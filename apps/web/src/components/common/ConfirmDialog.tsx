import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  /** If set, the user must type this exact text to enable the confirm button. */
  confirmText?: string;
  confirmLabel?: string;
  danger?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmText,
  confirmLabel = 'Confirm',
  danger = true,
  isBusy = false,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  if (!isOpen) return null;

  const requiresTyping = Boolean(confirmText);
  const canConfirm = !requiresTyping || typed === confirmText;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${danger ? 'bg-rose-950/60 text-rose-400' : 'bg-sky-950/60 text-sky-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-sm font-semibold text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        {requiresTyping && (
          <div className="mt-4">
            <label className="text-[11px] text-slate-500 block mb-1">
              Type <span className="font-mono text-slate-300">{confirmText}</span> to confirm
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
            />
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isBusy}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || isBusy}
            className={`px-3 py-1.5 text-xs rounded text-white font-medium transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

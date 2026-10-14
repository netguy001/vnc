import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  RotateCcw,
  Trash2,
  Copy,
  ClipboardPaste,
  Terminal as TerminalIcon,
  Maximize2,
  Minimize2,
  CheckCircle2,
  BookMarked,
} from 'lucide-react';
import { api } from '../../api/client';
import { SnippetsPanel } from './SnippetsPanel';

interface SshTerminalProps {
  serverId: string;
  serverName: string;
  /** False while the terminal is mounted but hidden (another tab is showing); it refits when shown again. */
  isActive?: boolean;
}

export const SshTerminal: React.FC<SshTerminalProps> = ({ serverId, serverName, isActive = true }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);
  const manualCloseRef = useRef(false);

  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const connect = useCallback((isAutoReconnect = false) => {
    if (!terminalRef.current) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectTickRef.current) {
      clearInterval(reconnectTickRef.current);
      reconnectTickRef.current = null;
    }
    setReconnectCountdown(null);
    if (!isAutoReconnect) {
      reconnectAttemptsRef.current = 0;
    }

    // Teardown previous instance (mark as manual so its onclose doesn't trigger a reconnect)
    if (wsRef.current) {
      manualCloseRef.current = true;
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (xtermRef.current) {
      try {
        xtermRef.current.dispose();
      } catch {}
      xtermRef.current = null;
    }

    terminalRef.current.innerHTML = '';
    setStatus('connecting');
    setErrorMessage(null);

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0a0f1d',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Defer the initial fit so a near-simultaneous dispose (e.g. React StrictMode's
    // double-invoke in dev) can't leave xterm's renderer mid-fit when torn down.
    requestAnimationFrame(() => {
      if (xtermRef.current === term) {
        try {
          fitAddon.fit();
        } catch {}
      }
    });

    term.writeln('\x1b[36mConnecting to SSH session via IOC secure bridge...\x1b[0m\r\n');

    // Smart Copy & Paste Keyboard Shortcuts
    term.attachCustomKeyEventHandler((event) => {
      // Handle Ctrl+C / Cmd+C
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (term.hasSelection()) {
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => {});
            showToast('Selection copied to clipboard');
          }
          return false; // Prevent sending SIGINT when user intends to copy!
        }
        return true; // Let SIGINT pass through if nothing is selected
      }

      // Handle Ctrl+V / Cmd+V
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (event.type === 'keydown') {
          navigator.clipboard.readText().then((text) => {
            if (text && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(text);
              showToast(`Pasted ${text.length} chars to terminal`);
            }
          }).catch(() => {});
        }
        return false; // Prevent sending ^V to shell
      }

      return true;
    });

    // Auto copy on mouse selection
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel && sel.trim().length > 0) {
        navigator.clipboard.writeText(sel).catch(() => {});
      }
    });

    // Open WebSocket
    const wsUrl = api.getTerminalWsUrl(serverId, term.cols, term.rows);
    const ws = new WebSocket(wsUrl);

    manualCloseRef.current = false;
    // Guards against a superseded connection's async callbacks touching a disposed terminal
    const isStale = () => xtermRef.current !== term;

    ws.onopen = () => {
      if (isStale()) return;
      setStatus('connected');
      setErrorMessage(null);
      reconnectAttemptsRef.current = 0;
      // Send initial terminal dimensions
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      term.focus();
    };

    ws.onmessage = (event) => {
      if (isStale()) return;
      term.write(event.data);
    };

    ws.onerror = () => {
      if (isStale()) return;
      setStatus('error');
      setErrorMessage('WebSocket connection failed.');
    };

    ws.onclose = (event) => {
      if (isStale()) return;
      setStatus('disconnected');
      if (event.code !== 1000) {
        term.writeln(`\r\n\x1b[31mSession disconnected (${event.reason || 'code ' + event.code})\x1b[0m\r\n`);
      } else {
        term.writeln('\r\n\x1b[33mSession ended.\x1b[0m\r\n');
      }

      // Auto-reconnect with exponential backoff, unless this was a deliberate close/teardown
      if (!manualCloseRef.current && !unmountedRef.current && event.code !== 1000) {
        reconnectAttemptsRef.current += 1;
        const attempt = reconnectAttemptsRef.current;
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15000);
        let remaining = Math.ceil(delayMs / 1000);
        setReconnectCountdown(remaining);
        term.writeln(`\x1b[33mReconnecting in ${remaining}s (attempt ${attempt})...\x1b[0m`);

        const tick = setInterval(() => {
          if (unmountedRef.current) {
            clearInterval(tick);
            return;
          }
          remaining -= 1;
          setReconnectCountdown(remaining > 0 ? remaining : null);
          if (remaining <= 0) clearInterval(tick);
        }, 1000);
        reconnectTickRef.current = tick;

        reconnectTimerRef.current = setTimeout(() => {
          clearInterval(tick);
          reconnectTickRef.current = null;
          if (!unmountedRef.current) connect(true);
        }, delayMs);
      }
    };

    // Forward keystrokes to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    wsRef.current = ws;
  }, [serverId]);

  // A terminal that was hidden has zero size; refit it (and tell the remote PTY) when it becomes visible.
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      if (unmountedRef.current || !fitAddonRef.current || !xtermRef.current) return;
      try {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        }
        xtermRef.current.focus();
      } catch {
        /* renderer not ready yet */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    // Resize observer
    const handleResize = () => {
      if (unmountedRef.current || !fitAddonRef.current || !xtermRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      try {
        fitAddonRef.current.fit();
        wsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          })
        );
      } catch {
        // xterm renderer may be mid-teardown during a reconnect/remount; safe to ignore
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      unmountedRef.current = true;
      manualCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (reconnectTickRef.current) {
        clearInterval(reconnectTickRef.current);
        reconnectTickRef.current = null;
      }
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch {}
      }
    };
  }, [connect]);

  const clearTerminal = () => {
    xtermRef.current?.clear();
  };

  const copySelection = () => {
    const selection = xtermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  };

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text);
      }
    } catch (err: any) {
      showToast('Failed to read clipboard: ' + (err?.message || err));
    }
  };

  const runSnippet = (command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(command.endsWith('\n') ? command : command + '\n');
      xtermRef.current?.focus();
      showToast(`Ran snippet: ${command.split('\n')[0]}`);
    } else {
      showToast('Terminal is not connected');
    }
  };

  const toggleFullscreen = () => {
    const elem = terminalRef.current?.parentElement;
    if (!elem) return;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-full bg-panel-inset border border-border rounded-lg overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel/90 border-b border-border text-xs text-content-secondary select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-content-secondary">{serverName} — SSH Terminal</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-panel-alt border border-border font-mono text-[11px]">
            {status === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-400">ONLINE</span>
              </>
            )}
            {status === 'connecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-400">CONNECTING</span>
              </>
            )}
            {status === 'disconnected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-content-muted" />
                <span className="text-content-muted">
                  {reconnectCountdown !== null ? `RECONNECTING (${reconnectCountdown}s)` : 'OFFLINE'}
                </span>
              </>
            )}
            {status === 'error' && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-rose-400">ERROR</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => connect()}
            title="Reconnect SSH Session"
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reconnect</span>
          </button>

          <button
            onClick={clearTerminal}
            title="Clear buffer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-content-muted" />
            <span>Clear</span>
          </button>

          <button
            onClick={copySelection}
            title="Copy selected text"
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <Copy className="w-3.5 h-3.5 text-content-muted" />
            <span>Copy</span>
          </button>

          <button
            onClick={pasteClipboard}
            title="Paste to shell"
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
            <span>Paste</span>
          </button>

          <button
            onClick={() => setShowSnippets((v) => !v)}
            title="Command snippets"
            className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
              showSnippets
                ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                : 'bg-panel-alt hover:bg-border text-content-secondary border-border'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>Snippets</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        className="relative flex-1 p-2 bg-[#0a0f1d] overflow-hidden"
        onContextMenu={(e) => {
          e.preventDefault();
          const sel = xtermRef.current?.getSelection();
          if (sel && sel.length > 0) {
            navigator.clipboard.writeText(sel).catch(() => {});
            showToast('Selection copied to clipboard');
          } else {
            pasteClipboard();
          }
        }}
      >
        {/* Floating Notification Toast */}
        {notification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-sky-950/90 border border-sky-500/80 text-white text-xs shadow-xl flex items-center gap-2 pointer-events-none backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        <div ref={terminalRef} className="w-full h-full" />

        <SnippetsPanel
          isOpen={showSnippets}
          onClose={() => setShowSnippets(false)}
          serverId={serverId}
          onRun={runSnippet}
        />
      </div>
    </div>
  );
};

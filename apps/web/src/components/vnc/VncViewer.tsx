import React, { useEffect, useRef, useState, useCallback } from 'react';
import RFB from '@novnc/novnc';
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  Camera,
  Clipboard,
  ClipboardPaste,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  WifiOff,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Terminal as TerminalIcon,
  Send,
  CornerDownLeft,
} from 'lucide-react';
import { api } from '../../api/client';

interface VncViewerProps {
  serverId: string;
  serverName: string;
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;
  onSwitchToTerminal?: () => void;
}

interface KeyDef {
  code: string;
  keysym: number;
  shift?: boolean;
}

// Complete hardware scancode & keysym mapping table for accurate typing into QEMU console
const CHAR_TO_KEY: Record<string, KeyDef> = {
  // Lowercase
  'a': { code: 'KeyA', keysym: 0x61 },
  'b': { code: 'KeyB', keysym: 0x62 },
  'c': { code: 'KeyC', keysym: 0x63 },
  'd': { code: 'KeyD', keysym: 0x64 },
  'e': { code: 'KeyE', keysym: 0x65 },
  'f': { code: 'KeyF', keysym: 0x66 },
  'g': { code: 'KeyG', keysym: 0x67 },
  'h': { code: 'KeyH', keysym: 0x68 },
  'i': { code: 'KeyI', keysym: 0x69 },
  'j': { code: 'KeyJ', keysym: 0x6a },
  'k': { code: 'KeyK', keysym: 0x6b },
  'l': { code: 'KeyL', keysym: 0x6c },
  'm': { code: 'KeyM', keysym: 0x6d },
  'n': { code: 'KeyN', keysym: 0x6e },
  'o': { code: 'KeyO', keysym: 0x6f },
  'p': { code: 'KeyP', keysym: 0x70 },
  'q': { code: 'KeyQ', keysym: 0x71 },
  'r': { code: 'KeyR', keysym: 0x72 },
  's': { code: 'KeyS', keysym: 0x73 },
  't': { code: 'KeyT', keysym: 0x74 },
  'u': { code: 'KeyU', keysym: 0x75 },
  'v': { code: 'KeyV', keysym: 0x76 },
  'w': { code: 'KeyW', keysym: 0x77 },
  'x': { code: 'KeyX', keysym: 0x78 },
  'y': { code: 'KeyY', keysym: 0x79 },
  'z': { code: 'KeyZ', keysym: 0x7a },

  // Uppercase (requires Shift)
  'A': { code: 'KeyA', keysym: 0x41, shift: true },
  'B': { code: 'KeyB', keysym: 0x42, shift: true },
  'C': { code: 'KeyC', keysym: 0x43, shift: true },
  'D': { code: 'KeyD', keysym: 0x44, shift: true },
  'E': { code: 'KeyE', keysym: 0x45, shift: true },
  'F': { code: 'KeyF', keysym: 0x46, shift: true },
  'G': { code: 'KeyG', keysym: 0x47, shift: true },
  'H': { code: 'KeyH', keysym: 0x48, shift: true },
  'I': { code: 'KeyI', keysym: 0x49, shift: true },
  'J': { code: 'KeyJ', keysym: 0x4a, shift: true },
  'K': { code: 'KeyK', keysym: 0x4b, shift: true },
  'L': { code: 'KeyL', keysym: 0x4c, shift: true },
  'M': { code: 'KeyM', keysym: 0x4d, shift: true },
  'N': { code: 'KeyN', keysym: 0x4e, shift: true },
  'O': { code: 'KeyO', keysym: 0x4f, shift: true },
  'P': { code: 'KeyP', keysym: 0x50, shift: true },
  'Q': { code: 'KeyQ', keysym: 0x51, shift: true },
  'R': { code: 'KeyR', keysym: 0x52, shift: true },
  'S': { code: 'KeyS', keysym: 0x53, shift: true },
  'T': { code: 'KeyT', keysym: 0x54, shift: true },
  'U': { code: 'KeyU', keysym: 0x55, shift: true },
  'V': { code: 'KeyV', keysym: 0x56, shift: true },
  'W': { code: 'KeyW', keysym: 0x57, shift: true },
  'X': { code: 'KeyX', keysym: 0x58, shift: true },
  'Y': { code: 'KeyY', keysym: 0x59, shift: true },
  'Z': { code: 'KeyZ', keysym: 0x5a, shift: true },

  // Numbers
  '0': { code: 'Digit0', keysym: 0x30 },
  '1': { code: 'Digit1', keysym: 0x31 },
  '2': { code: 'Digit2', keysym: 0x32 },
  '3': { code: 'Digit3', keysym: 0x33 },
  '4': { code: 'Digit4', keysym: 0x34 },
  '5': { code: 'Digit5', keysym: 0x35 },
  '6': { code: 'Digit6', keysym: 0x36 },
  '7': { code: 'Digit7', keysym: 0x37 },
  '8': { code: 'Digit8', keysym: 0x38 },
  '9': { code: 'Digit9', keysym: 0x39 },

  // Unshifted punctuation & spacing
  ' ': { code: 'Space', keysym: 0x20 },
  '-': { code: 'Minus', keysym: 0x2d },
  '=': { code: 'Equal', keysym: 0x3d },
  '[': { code: 'BracketLeft', keysym: 0x5b },
  ']': { code: 'BracketRight', keysym: 0x5d },
  '\\': { code: 'Backslash', keysym: 0x5c },
  ';': { code: 'Semicolon', keysym: 0x3b },
  '\'': { code: 'Quote', keysym: 0x27 },
  '`': { code: 'Backquote', keysym: 0x60 },
  ',': { code: 'Comma', keysym: 0x2c },
  '.': { code: 'Period', keysym: 0x2e },
  '/': { code: 'Slash', keysym: 0x2f },
  '\n': { code: 'Enter', keysym: 0xff0d },
  '\t': { code: 'Tab', keysym: 0xff09 },

  // Shifted punctuation
  '!': { code: 'Digit1', keysym: 0x21, shift: true },
  '@': { code: 'Digit2', keysym: 0x40, shift: true },
  '#': { code: 'Digit3', keysym: 0x23, shift: true },
  '$': { code: 'Digit4', keysym: 0x24, shift: true },
  '%': { code: 'Digit5', keysym: 0x25, shift: true },
  '^': { code: 'Digit6', keysym: 0x5e, shift: true },
  '&': { code: 'Digit7', keysym: 0x26, shift: true },
  '*': { code: 'Digit8', keysym: 0x2a, shift: true },
  '(': { code: 'Digit9', keysym: 0x28, shift: true },
  ')': { code: 'Digit0', keysym: 0x29, shift: true },
  '_': { code: 'Minus', keysym: 0x5f, shift: true },
  '+': { code: 'Equal', keysym: 0x2b, shift: true },
  '{': { code: 'BracketLeft', keysym: 0x7b, shift: true },
  '}': { code: 'BracketRight', keysym: 0x7d, shift: true },
  '|': { code: 'Backslash', keysym: 0x7c, shift: true },
  ':': { code: 'Semicolon', keysym: 0x3a, shift: true },
  '"': { code: 'Quote', keysym: 0x22, shift: true },
  '~': { code: 'Backquote', keysym: 0x7e, shift: true },
  '<': { code: 'Comma', keysym: 0x3c, shift: true },
  '>': { code: 'Period', keysym: 0x3e, shift: true },
  '?': { code: 'Slash', keysym: 0x3f, shift: true },
};

export const VncViewer: React.FC<VncViewerProps> = ({
  serverId,
  serverName,
  onStatusChange,
  onSwitchToTerminal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);

  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [desktopName, setDesktopName] = useState<string>('Remote Desktop');
  const [isScaleViewport, setIsScaleViewport] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [quickInputText, setQuickInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastVncClipboard, setLastVncClipboard] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // VNC Password prompt state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [vncPasswordInput, setVncPasswordInput] = useState('');
  const [showVncPasswordText, setShowVncPasswordText] = useState(false);

  // Key symbols for RFB
  const KEY_SYMS = {
    Ctrl: 0xffe3,
    Alt: 0xffe9,
    Esc: 0xff1b,
    Tab: 0xff09,
    Super: 0xffeb,
    Enter: 0xff0d,
    Backspace: 0xff08,
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const updateStatus = (newStatus: 'connected' | 'connecting' | 'disconnected' | 'error') => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  // Type string character by character as hardware-accurate RFB scancodes + keysyms
  const typeTextToVnc = async (text: string) => {
    const rfb = rfbRef.current;
    if (!rfb || !text) return;

    setIsTyping(true);
    showToast(`Injecting ${text.length} character${text.length === 1 ? '' : 's'} into console...`);

    // Also update remote X11/GUI clipboard if remote OS supports it
    try {
      rfb.clipboardPasteFrom(text);
    } catch {}

    try {
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\r') continue;

        const def = CHAR_TO_KEY[char];
        if (def) {
          if (def.shift) {
            rfb.sendKey(0xffe1, 'ShiftLeft', true);
            await new Promise((r) => setTimeout(r, 6));
          }

          rfb.sendKey(def.keysym, def.code, true);
          await new Promise((r) => setTimeout(r, 10));
          rfb.sendKey(def.keysym, def.code, false);

          if (def.shift) {
            await new Promise((r) => setTimeout(r, 6));
            rfb.sendKey(0xffe1, 'ShiftLeft', false);
          }
        } else {
          // Fallback for extended unicode characters
          const codePoint = char.codePointAt(0) || 0;
          const keysym = codePoint <= 0x7e ? codePoint : 0x01000000 | codePoint;
          rfb.sendKey(keysym, undefined, true);
          await new Promise((r) => setTimeout(r, 10));
          rfb.sendKey(keysym, undefined, false);
        }

        // Inter-keystroke spacing so hardware QEMU i8042 buffer does not drop characters
        await new Promise((r) => setTimeout(r, 8));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const connect = useCallback(async (isAutoReconnect = false) => {
    if (!containerRef.current) return;

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

    // Disconnect existing
    manualDisconnectRef.current = true;
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch {}
      rfbRef.current = null;
    }

    // Clear previous screen elements
    containerRef.current.innerHTML = '';
    setErrorMessage(null);
    updateStatus('connecting');

    try {
      // 1. Fetch saved decrypted credentials for this server
      let savedPassword: string | undefined = undefined;
      try {
        const creds = await api.getVncCredentials(serverId);
        if (creds.password) {
          savedPassword = creds.password;
          setVncPasswordInput(creds.password);
        }
      } catch (e) {
        console.warn('Could not fetch saved VNC credentials:', e);
      }

      const url = api.getVncWsUrl(serverId);
      const rfbOptions: any = {
        wsProtocols: ['binary'],
      };
      if (savedPassword) {
        rfbOptions.credentials = { password: savedPassword };
      }

      const rfb = new RFB(containerRef.current, url, rfbOptions);

      rfb.scaleViewport = isScaleViewport;
      rfb.resizeSession = false;

      manualDisconnectRef.current = false;

      rfb.addEventListener('connect', () => {
        updateStatus('connected');
        setErrorMessage(null);
        setShowPasswordModal(false);
        reconnectAttemptsRef.current = 0;
      });

      rfb.addEventListener('disconnect', (e: any) => {
        updateStatus('disconnected');
        if (e.detail?.clean === false) {
          setErrorMessage('VNC connection closed unexpectedly.');
        }

        if (!manualDisconnectRef.current && !unmountedRef.current && e.detail?.clean === false) {
          reconnectAttemptsRef.current += 1;
          const attempt = reconnectAttemptsRef.current;
          const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15000);
          let remaining = Math.ceil(delayMs / 1000);
          setReconnectCountdown(remaining);

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
      });

      rfb.addEventListener('desktopname', (e: any) => {
        if (e.detail?.name) {
          setDesktopName(e.detail.name);
        }
      });

      // Synchronize remote clipboard to local clipboard automatically if supported
      rfb.addEventListener('clipboard', (e: any) => {
        if (e.detail?.text) {
          setLastVncClipboard(e.detail.text);
          try {
            navigator.clipboard.writeText(e.detail.text);
            showToast('Remote clipboard copied to local clipboard');
          } catch {}
        }
      });

      rfb.addEventListener('credentialsrequired', () => {
        setShowPasswordModal(true);
      });

      rfbRef.current = rfb;
    } catch (err: any) {
      updateStatus('error');
      setErrorMessage(`Failed to start VNC viewer: ${err.message}`);
    }
  }, [serverId, isScaleViewport]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      manualDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (reconnectTickRef.current) {
        clearInterval(reconnectTickRef.current);
        reconnectTickRef.current = null;
      }
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch {}
        rfbRef.current = null;
      }
    };
  }, [connect]);

  // Intercept Ctrl+V before noVNC canvas can swallow it and send ^V to remote tty
  useEffect(() => {
    const handleKeyDownCapture = async (e: KeyboardEvent) => {
      // Don't intercept if user is inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (status !== 'connected' || !rfbRef.current) return;

        // Stop noVNC canvas handler from swallowing Ctrl+V
        e.preventDefault();
        e.stopPropagation();

        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text) {
              await typeTextToVnc(text);
              return;
            }
          }
        } catch {
          // If browser blocked permission without user gesture, focus quick paste bar or modal
        }

        setShowClipboardModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
  }, [status]);

  // Toggle scaling
  const toggleScale = () => {
    const next = !isScaleViewport;
    setIsScaleViewport(next);
    if (rfbRef.current) {
      rfbRef.current.scaleViewport = next;
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    const elem = containerRef.current?.parentElement;
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Send single special key (down + up)
  const sendKey = (keysym: number) => {
    if (!rfbRef.current) return;
    rfbRef.current.sendKey(keysym, undefined, true);
    setTimeout(() => {
      rfbRef.current?.sendKey(keysym, undefined, false);
    }, 50);
  };

  // Send Ctrl+Alt+Del
  const sendCtrlAltDel = () => {
    if (!rfbRef.current) return;
    rfbRef.current.sendCtrlAltDel();
  };

  // Paste text to remote VNC from modal
  const handlePasteToVnc = async () => {
    if (!clipboardText) return;
    const text = clipboardText;
    setShowClipboardModal(false);
    setClipboardText('');
    await typeTextToVnc(text);
  };

  // Read native clipboard and paste
  const handleDirectPaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          await typeTextToVnc(text);
          return;
        }
      }
      setShowClipboardModal(true);
    } catch {
      setShowClipboardModal(true);
    }
  };

  // Submit text from Quick Paste Bar
  const handleQuickSubmit = async (withEnter: boolean) => {
    if (!quickInputText) return;
    const text = quickInputText + (withEnter ? '\n' : '');
    setQuickInputText('');
    await typeTextToVnc(text);
  };

  // Copy current screen canvas directly to clipboard as image
  const handleCopyScreenImage = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) {
      showToast('No active display canvas to copy');
      return;
    }

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast('Screenshot copied to clipboard!');
        } catch {
          handleScreenshot();
        }
      });
    } catch (e) {
      handleScreenshot();
    }
  };

  // Take screenshot
  const handleScreenshot = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${serverName.replace(/\s+/g, '_')}_vnc_${new Date().toISOString().slice(0, 19)}.png`;
      a.click();
      showToast('Screenshot downloaded');
    } catch (err) {
      alert('Unable to capture screenshot: ' + err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-panel-inset border border-border rounded-lg overflow-hidden shadow-2xl">
      {/* VNC Top Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-panel/90 border-b border-border text-xs text-content-secondary gap-2 select-none">
        {/* Status & Desktop Info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-panel-alt/80 border border-border font-mono">
            {status === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-400 font-medium">CONNECTED</span>
              </>
            )}
            {status === 'connecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-400 font-medium">CONNECTING</span>
              </>
            )}
            {status === 'disconnected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-content-muted" />
                <span className="text-content-muted font-medium">
                  {reconnectCountdown !== null ? `RECONNECTING (${reconnectCountdown}s)` : 'DISCONNECTED'}
                </span>
              </>
            )}
            {status === 'error' && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-rose-400 font-medium">ERROR</span>
              </>
            )}
          </div>
          <span className="text-content-muted font-medium truncate max-w-[200px]" title={desktopName}>
            {desktopName}
          </span>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => connect()}
            title="Reconnect VNC session"
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reconnect</span>
          </button>

          <div className="h-4 w-[1px] bg-border mx-1" />

          {/* Special Keys Toolbar */}
          <button
            onClick={() => sendKey(KEY_SYMS.Ctrl)}
            className="px-2 py-1 rounded bg-panel-alt hover:bg-border font-mono text-[11px] text-content-secondary border border-border"
            title="Send Ctrl key"
          >
            Ctrl
          </button>
          <button
            onClick={() => sendKey(KEY_SYMS.Alt)}
            className="px-2 py-1 rounded bg-panel-alt hover:bg-border font-mono text-[11px] text-content-secondary border border-border"
            title="Send Alt key"
          >
            Alt
          </button>
          <button
            onClick={() => sendKey(KEY_SYMS.Esc)}
            className="px-2 py-1 rounded bg-panel-alt hover:bg-border font-mono text-[11px] text-content-secondary border border-border"
            title="Send Escape key"
          >
            Esc
          </button>
          <button
            onClick={() => sendKey(KEY_SYMS.Tab)}
            className="px-2 py-1 rounded bg-panel-alt hover:bg-border font-mono text-[11px] text-content-secondary border border-border"
            title="Send Tab key"
          >
            Tab
          </button>
          <button
            onClick={() => sendKey(KEY_SYMS.Super)}
            className="px-2 py-1 rounded bg-panel-alt hover:bg-border font-mono text-[11px] text-content-secondary border border-border"
            title="Send Windows / Super key"
          >
            Win
          </button>
          <button
            onClick={sendCtrlAltDel}
            className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-mono text-[11px] border border-rose-800/50"
            title="Send Ctrl+Alt+Delete sequence"
          >
            Ctrl+Alt+Del
          </button>

          <div className="h-4 w-[1px] bg-border mx-1" />

          {/* Clipboard & Tools */}
          <button
            onClick={handleDirectPaste}
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Paste clipboard text into remote console (or press Ctrl+V)"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
            <span>Paste</span>
          </button>

          <button
            onClick={handleCopyScreenImage}
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Copy screenshot of remote console to your clipboard"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" />
            <span>Copy Screen</span>
          </button>

          <button
            onClick={() => setShowClipboardModal(true)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Open clipboard typing & sync manager"
          >
            <Clipboard className="w-3.5 h-3.5 text-amber-400" />
            <span>Clipboard</span>
          </button>

          <button
            onClick={toggleScale}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
              isScaleViewport
                ? 'bg-sky-950/60 border-sky-600 text-sky-300'
                : 'bg-panel-alt border-border text-content-secondary hover:bg-border'
            }`}
            title="Toggle Fit to Screen / 1:1 Scale"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isScaleViewport ? 'Fit' : '1:1'}</span>
          </button>

          <button
            onClick={handleScreenshot}
            className="p-1 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
            title="Download Screenshot"
          >
            <Camera className="w-3.5 h-3.5 text-purple-400" />
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

      {/* Main VNC Canvas Viewport */}
      <div className="relative flex-1 w-full h-full bg-[#050811] flex items-center justify-center overflow-auto p-1">
        {/* Floating Notification Toast */}
        {notification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-sky-950/90 border border-sky-500/80 text-white text-xs shadow-xl flex items-center gap-2 pointer-events-none backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        {/* Error overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-panel-inset/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-lg font-semibold text-rose-300">VNC Connection Failed</h3>
            <p className="text-sm text-content-muted max-w-md mt-1 mb-4">{errorMessage || 'Connection could not be established.'}</p>
            <button
              onClick={() => connect()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-sm font-medium transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Disconnected overlay */}
        {status === 'disconnected' && !errorMessage && (
          <div className="absolute inset-0 bg-panel-inset/70 z-20 flex flex-col items-center justify-center p-6 text-center">
            <WifiOff className="w-10 h-10 text-content-muted mb-3" />
            <h3 className="text-base font-semibold text-content-secondary">
              {reconnectCountdown !== null ? 'Reconnecting…' : 'VNC Session Inactive'}
            </h3>
            <p className="text-xs text-content-muted max-w-xs mt-1 mb-4">
              {reconnectCountdown !== null
                ? `Retrying in ${reconnectCountdown}s...`
                : 'Click reconnect to start the remote desktop session.'}
            </p>
            <button
              onClick={() => connect()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-sm font-medium transition"
            >
              Connect Now
            </button>
          </div>
        )}

        {/* noVNC mount target */}
        <div ref={containerRef} className="vnc-canvas-container w-full h-full flex items-center justify-center" />
      </div>

      {/* Quick Paste & Command Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-panel/95 border-t border-border text-xs text-content-secondary">
        <div className="flex items-center gap-1.5 text-content-muted font-mono text-[11px] shrink-0">
          <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>Quick Paste:</span>
        </div>

        <div className="relative flex-1">
          <input
            type="text"
            ref={quickInputRef}
            value={quickInputText}
            onChange={(e) => setQuickInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickSubmit(true);
              }
            }}
            placeholder="Type or paste (Ctrl+V) command/password and press Enter to type into console..."
            className="w-full pl-3 pr-8 py-1.5 bg-panel-inset border border-border-strong/80 rounded text-xs text-content-secondary font-mono focus:outline-none focus:border-sky-500 placeholder:text-content-muted"
          />
          {quickInputText && (
            <button
              onClick={() => setQuickInputText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => handleQuickSubmit(false)}
          disabled={!quickInputText || isTyping || status !== 'connected'}
          title="Send text to console without pressing Enter"
          className="flex items-center gap-1 px-2.5 py-1.5 bg-panel-alt hover:bg-border disabled:opacity-50 text-content-secondary text-xs font-medium rounded border border-border transition"
        >
          <Send className="w-3 h-3 text-content-muted" />
          <span>Send</span>
        </button>

        <button
          onClick={() => handleQuickSubmit(true)}
          disabled={!quickInputText || isTyping || status !== 'connected'}
          title="Send text to console and execute (press Enter)"
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded shadow transition"
        >
          <CornerDownLeft className="w-3 h-3" />
          <span>Send + ↵</span>
        </button>

        <button
          onClick={handleDirectPaste}
          disabled={status !== 'connected' || isTyping}
          title="Paste directly from system clipboard into console"
          className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium rounded transition"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>Paste Clipboard</span>
        </button>

        {onSwitchToTerminal && (
          <button
            onClick={onSwitchToTerminal}
            title="Switch to SSH Terminal tab to highlight, select, and copy text outputs"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs font-medium rounded transition"
          >
            <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Terminal (Copy Text)</span>
          </button>
        )}
      </div>

      {/* Clipboard & Keystroke Typing Modal */}
      {showClipboardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border-strong rounded-lg max-w-md w-full p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-semibold text-content-primary flex items-center gap-2 text-sm">
                <Clipboard className="w-4 h-4 text-sky-400" />
                VNC Clipboard & Paste
              </h3>
              <button
                onClick={() => setShowClipboardModal(false)}
                className="text-content-muted hover:text-content-secondary text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Type or paste text to inject into remote console:
                </label>
                <textarea
                  rows={4}
                  autoFocus
                  value={clipboardText}
                  onChange={(e) => setClipboardText(e.target.value)}
                  placeholder="Paste commands, passwords, or text here (Ctrl+V)..."
                  className="w-full px-3 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-secondary font-mono focus:outline-none focus:border-sky-500"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      try {
                        const t = await navigator.clipboard.readText();
                        if (t) setClipboardText(t);
                      } catch {}
                    }}
                    type="button"
                    className="px-3 py-1.5 bg-panel-alt hover:bg-border text-content-secondary text-xs font-medium rounded transition"
                  >
                    Paste from Clipboard
                  </button>
                  <button
                    onClick={handlePasteToVnc}
                    disabled={!clipboardText || isTyping}
                    className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium rounded transition"
                  >
                    Type into Console
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded bg-panel-inset/70 border border-border text-[11px] text-content-muted space-y-1">
                <div className="font-medium text-content-secondary flex items-center gap-1.5">
                  <span>💡</span> How to Copy Text Output
                </div>
                <div>
                  This VNC screen is a virtual monitor pixel canvas (text cannot be dragged to select). To highlight, copy, or scroll terminal outputs, switch to the{' '}
                  {onSwitchToTerminal ? (
                    <button
                      onClick={() => {
                        setShowClipboardModal(false);
                        onSwitchToTerminal();
                      }}
                      className="text-sky-400 font-semibold underline hover:text-sky-300"
                    >
                      &gt;_ Terminal tab
                    </button>
                  ) : (
                    <span className="text-sky-400 font-semibold">&gt;_ Terminal tab</span>
                  )}{' '}
                  for full mouse selection &amp; copy!
                </div>
              </div>

              {lastVncClipboard && (
                <div className="pt-3 border-t border-border">
                  <span className="block text-xs text-content-muted mb-1">Last received from remote clipboard:</span>
                  <div className="p-2 bg-panel-inset rounded border border-border text-xs font-mono text-content-secondary max-h-24 overflow-auto">
                    {lastVncClipboard}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lastVncClipboard);
                      showToast('Copied to local clipboard!');
                    }}
                    className="mt-2 text-xs text-sky-400 hover:underline"
                  >
                    Copy to Local Clipboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VNC Password Prompt Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border-strong rounded-lg max-w-sm w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-semibold text-content-primary flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-sky-400" />
                VNC Authentication Required
              </h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-content-muted hover:text-content-secondary text-sm"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rfbRef.current) {
                  rfbRef.current.sendCredentials({ password: vncPasswordInput });
                  setShowPasswordModal(false);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  VNC Password:
                </label>
                <div className="relative">
                  <input
                    type={showVncPasswordText ? 'text' : 'password'}
                    autoFocus
                    required
                    value={vncPasswordInput}
                    onChange={(e) => setVncPasswordInput(e.target.value)}
                    placeholder="Enter VNC password"
                    className="w-full pl-3 pr-10 py-2 bg-panel-inset border border-border-strong rounded text-xs text-content-primary font-mono focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVncPasswordText(!showVncPasswordText)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted hover:text-content-secondary focus:outline-none"
                    title={showVncPasswordText ? 'Hide password' : 'Show password'}
                  >
                    {showVncPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

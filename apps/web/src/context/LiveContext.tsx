import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export type LiveTopic = 'metrics' | 'network' | 'docker';
export type LiveStatus = 'connecting' | 'live' | 'offline';

type DataHandler = (payload: any, ts: number) => void;
type EventHandler = (msg: any) => void;

interface LiveContextType {
  status: LiveStatus;
  /** Subscribes to a (topic, server) feed. Returns an unsubscribe function. Feeds are ref-counted. */
  subscribe: (topic: LiveTopic, serverId: string, handler: DataHandler) => () => void;
  /** Listens to broadcast messages (status changes, alerts). */
  onEvent: (handler: EventHandler) => () => void;
}

const LiveContext = createContext<LiveContextType | null>(null);

const wsUrl = () => `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/live`;

/**
 * One shared WebSocket for all real-time data. Subscriptions are ref-counted, replayed after every
 * reconnect, and a heartbeat detects silently dead connections so the UI never shows stale data as live.
 */
export const LiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const feeds = useRef(new Map<string, Set<DataHandler>>()); // "topic:serverId" -> handlers
  const eventHandlers = useRef(new Set<EventHandler>());
  const attempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeen = useRef(Date.now());

  const send = (msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  };

  useEffect(() => {
    if (!user) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        attempts.current = 0;
        lastSeen.current = Date.now();
        setStatus('live');
        for (const key of feeds.current.keys()) {
          const [topic, serverId] = key.split(':');
          send({ type: 'subscribe', topic, serverId });
        }
      };

      ws.onmessage = (ev) => {
        lastSeen.current = Date.now();
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'data') {
          feeds.current.get(`${msg.topic}:${msg.serverId}`)?.forEach((h) => h(msg.payload, msg.ts));
        } else if (msg.type === 'status' || msg.type === 'alert') {
          eventHandlers.current.forEach((h) => h(msg));
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setStatus('offline');
        const delay = Math.min(15000, 1000 * 2 ** attempts.current++);
        reconnectTimer.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    // Heartbeat: the server answers pings; if nothing at all arrives for 20 s the socket is dead.
    const beat = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastSeen.current > 20000) {
        wsRef.current.close();
        return;
      }
      send({ type: 'ping', t: Date.now() });
    }, 8000);

    return () => {
      disposed = true;
      clearInterval(beat);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user]);

  const subscribe = useCallback((topic: LiveTopic, serverId: string, handler: DataHandler) => {
    const key = `${topic}:${serverId}`;
    let set = feeds.current.get(key);
    if (!set) {
      set = new Set();
      feeds.current.set(key, set);
      send({ type: 'subscribe', topic, serverId });
    }
    set.add(handler);
    return () => {
      const current = feeds.current.get(key);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        feeds.current.delete(key);
        send({ type: 'unsubscribe', topic, serverId });
      }
    };
  }, []);

  const onEvent = useCallback((handler: EventHandler) => {
    eventHandlers.current.add(handler);
    return () => {
      eventHandlers.current.delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe, onEvent }), [status, subscribe, onEvent]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
};

export function useLive(): LiveContextType {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}

/**
 * Subscribes to a live feed for one server. `data` is the latest pushed value (or null until the first
 * push); `updatedAt` is when it arrived; `status` is the connection state.
 */
export function useLiveData<T = any>(topic: LiveTopic, serverId: string | undefined, onData?: (payload: T) => void) {
  const { subscribe, status } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const cb = useRef(onData);
  cb.current = onData;

  useEffect(() => {
    setData(null);
    setUpdatedAt(null);
    if (!serverId) return;
    return subscribe(topic, serverId, (payload, ts) => {
      setData(payload as T);
      setUpdatedAt(ts);
      cb.current?.(payload as T);
    });
  }, [topic, serverId, subscribe]);

  return { data, updatedAt, status };
}

/** Subscribes to the same topic for many servers at once (e.g. the dashboard cards). */
export function useLiveMany<T = any>(topic: LiveTopic, serverIds: string[], onData: (serverId: string, payload: T, ts: number) => void) {
  const { subscribe } = useLive();
  const cb = useRef(onData);
  cb.current = onData;
  const key = serverIds.join(',');

  useEffect(() => {
    const offs = serverIds.map((id) => subscribe(topic, id, (payload, ts) => cb.current(id, payload as T, ts)));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, key, subscribe]);
}

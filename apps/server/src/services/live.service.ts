import { WebSocket } from 'ws';
import { serverService } from './server.service.js';
import { monitorService } from './monitor.service.js';
import { networkService } from './network.service.js';
import { dockerService } from './docker.service.js';
import { metricsStore } from './metrics-store.service.js';
import { events } from './events.js';

export type LiveTopic = 'metrics' | 'network' | 'docker';

interface TopicSpec {
  intervalMs: number;
  /** Produces the payload for one server. Must be read-only. */
  poll: (serverId: string) => Promise<unknown>;
}

const MAX_SUBSCRIPTIONS_PER_SOCKET = 60;

const TOPICS: Record<LiveTopic, TopicSpec> = {
  // Telemetry: CPU / memory / disk / load / processes. Goes through the metrics store so it is also
  // sampled into history (throttled) and feeds the alert engine.
  metrics: {
    intervalMs: 3000,
    poll: async (serverId) => {
      const sample = await metricsStore.collectOne(serverId, { persist: 'throttled' });
      return sample ? metricsStore.getCached(serverId, 60_000) : null;
    },
  },
  network: {
    intervalMs: 3000,
    poll: async (serverId) => {
      const creds = serverService.getDecryptedCredentials(serverId);
      return creds?.server ? networkService.getNetworkOverview(creds) : null;
    },
  },
  docker: {
    intervalMs: 5000,
    poll: async (serverId) => {
      const creds = serverService.getDecryptedCredentials(serverId);
      return creds?.server ? dockerService.getContainers(creds) : null;
    },
  },
};

interface Channel {
  key: string;
  topic: LiveTopic;
  serverId: string;
  subscribers: Set<WebSocket>;
  running: boolean;
  timer: NodeJS.Timeout | null;
  lastPayload: unknown;
}

/**
 * Real-time hub behind the /api/live WebSocket. Clients subscribe to (topic, server) pairs; a channel
 * polls its data source only while it has at least one subscriber, never overlaps polls, and pushes each
 * result to every subscriber. Status changes and alerts are broadcast to all connected clients.
 */
export class LiveService {
  private channels = new Map<string, Channel>();
  private sockets = new Map<WebSocket, Set<string>>();
  private wired = false;

  /** Subscribes to core events once. Safe to call repeatedly. */
  wire(): void {
    if (this.wired) return;
    this.wired = true;
    events.on('server.status', (e) => this.broadcast({ type: 'status', serverId: e.serverId, status: e.to }));
    events.on('alert.fired', (e) => this.broadcast({ type: 'alert', state: 'fired', ...e }));
    events.on('alert.resolved', (e) => this.broadcast({ type: 'alert', state: 'resolved', ...e }));
  }

  get clientCount(): number {
    return this.sockets.size;
  }

  addClient(ws: WebSocket): void {
    this.sockets.set(ws, new Set());
    this.send(ws, { type: 'hello', serverTime: Date.now(), topics: Object.keys(TOPICS) });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe') this.subscribe(ws, msg.topic, msg.serverId);
        else if (msg.type === 'unsubscribe') this.unsubscribe(ws, msg.topic, msg.serverId);
        else if (msg.type === 'ping') this.send(ws, { type: 'pong', t: msg.t });
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', () => this.removeClient(ws));
    ws.on('error', () => this.removeClient(ws));
  }

  private removeClient(ws: WebSocket): void {
    const keys = this.sockets.get(ws);
    if (!keys) return;
    for (const key of [...keys]) this.leave(ws, key);
    this.sockets.delete(ws);
  }

  private subscribe(ws: WebSocket, topic: string, serverId: string): void {
    const spec = TOPICS[topic as LiveTopic];
    const owned = this.sockets.get(ws);
    if (!spec || !owned || typeof serverId !== 'string') return;
    if (!serverService.getServerById(serverId)) {
      this.send(ws, { type: 'error', topic, serverId, message: 'Server not found' });
      return;
    }
    const key = `${topic}:${serverId}`;
    if (owned.has(key)) return;
    if (owned.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
      this.send(ws, { type: 'error', topic, serverId, message: 'Too many subscriptions' });
      return;
    }

    let channel = this.channels.get(key);
    if (!channel) {
      channel = { key, topic: topic as LiveTopic, serverId, subscribers: new Set(), running: false, timer: null, lastPayload: undefined };
      this.channels.set(key, channel);
    }
    channel.subscribers.add(ws);
    owned.add(key);

    // New subscribers get the last known value immediately, then the next poll follows right away.
    if (channel.lastPayload !== undefined) this.send(ws, { type: 'data', topic, serverId, payload: channel.lastPayload, ts: Date.now() });
    if (!channel.timer && !channel.running) this.schedule(channel, 0);
  }

  private unsubscribe(ws: WebSocket, topic: string, serverId: string): void {
    this.leave(ws, `${topic}:${serverId}`);
  }

  private leave(ws: WebSocket, key: string): void {
    this.sockets.get(ws)?.delete(key);
    const channel = this.channels.get(key);
    if (!channel) return;
    channel.subscribers.delete(ws);
    if (channel.subscribers.size === 0) {
      if (channel.timer) clearTimeout(channel.timer);
      this.channels.delete(key);
    }
  }

  private schedule(channel: Channel, delayMs: number): void {
    channel.timer = setTimeout(() => void this.tick(channel), delayMs);
    channel.timer.unref();
  }

  private async tick(channel: Channel): Promise<void> {
    channel.timer = null;
    if (channel.subscribers.size === 0) return;
    channel.running = true;
    const started = Date.now();
    try {
      const payload = await TOPICS[channel.topic].poll(channel.serverId);
      if (payload !== null && payload !== undefined) {
        channel.lastPayload = payload;
        this.fanOut(channel, { type: 'data', topic: channel.topic, serverId: channel.serverId, payload, ts: Date.now() });
      }
    } catch (err: any) {
      this.fanOut(channel, { type: 'error', topic: channel.topic, serverId: channel.serverId, message: err?.message || 'poll failed' });
    } finally {
      channel.running = false;
      // Keep a steady cadence: wait only for the remainder of the interval after the poll itself.
      if (this.channels.get(channel.key) === channel && channel.subscribers.size > 0) {
        this.schedule(channel, Math.max(500, TOPICS[channel.topic].intervalMs - (Date.now() - started)));
      }
    }
  }

  private fanOut(channel: Channel, msg: unknown): void {
    const text = JSON.stringify(msg);
    for (const ws of channel.subscribers) if (ws.readyState === WebSocket.OPEN) ws.send(text);
  }

  private broadcast(msg: unknown): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(text);
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  shutdown(): void {
    for (const ch of this.channels.values()) if (ch.timer) clearTimeout(ch.timer);
    this.channels.clear();
    for (const ws of this.sockets.keys()) ws.close(1001, 'server shutting down');
    this.sockets.clear();
  }
}

export const liveService = new LiveService();

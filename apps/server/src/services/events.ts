import { EventEmitter } from 'node:events';
import type { MetricSample, ServerMonitoringData } from '@server-console/shared';

/** Internal event bus. Plugins subscribe through the plugin context; core services publish here. */
export interface CoreEvents {
  'metrics.collected': { serverId: string; serverName: string; sample: MetricSample; data: ServerMonitoringData };
  'server.status': { serverId: string; serverName: string; from: string; to: string };
  'alert.fired': { eventId: string; ruleName: string; serverId: string; serverName: string; metric: string; value: number; threshold: number };
  'alert.resolved': { eventId: string; ruleName: string; serverId: string; serverName: string; metric: string };
  'audit.logged': { action: string; username?: string; serverId?: string; details?: string };
}

class TypedBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  on<K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void): () => void {
    this.emitter.on(event, handler as any);
    return () => this.emitter.off(event, handler as any);
  }

  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    // Listener failures (e.g. a faulty plugin) must never break the emitting service.
    for (const fn of this.emitter.listeners(event)) {
      try {
        const r = (fn as any)(payload);
        if (r && typeof r.catch === 'function') {
          r.catch((e: any) => console.error(`[events] ${event} handler failed:`, e?.message || e));
        }
      } catch (e: any) {
        console.error(`[events] ${event} handler failed:`, e?.message || e);
      }
    }
  }
}

export const events = new TypedBus();

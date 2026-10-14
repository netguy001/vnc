import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { getDatabase } from '../db/client.js';
import { events, CoreEvents } from '../services/events.js';
import { serverService } from '../services/server.service.js';
import { sshService } from '../services/ssh.service.js';
import { auditService } from '../services/audit.service.js';
import { notifierService, ChannelDriver, NotificationMessage } from '../services/notifier.service.js';
import { metricsStore } from '../services/metrics-store.service.js';

/**
 * Plugins are trusted code running inside the server process (Node offers no in-process sandbox).
 * The permission model below is a *declared-capability contract*: the admin approves exactly what the
 * manifest requests, plugins only receive the matching parts of the context, and every privileged
 * action (SSH commands) is written to the audit log. Only install plugins you trust.
 */
export const PERMISSIONS = ['servers.read', 'ssh.exec', 'events', 'notify', 'routes', 'scheduler'] as const;
export type Permission = (typeof PERMISSIONS)[number];
type Role = 'viewer' | 'operator' | 'admin';

const WidgetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stats'), source: z.string(), title: z.string().optional() }),
  z.object({
    type: z.literal('table'),
    title: z.string().optional(),
    source: z.string(),
    columns: z.array(z.object({ key: z.string(), label: z.string(), format: z.enum(['text', 'badge', 'datetime']).optional() })),
    rowActions: z
      .array(z.object({ label: z.string(), method: z.enum(['POST', 'PUT', 'DELETE']), path: z.string(), confirm: z.boolean().optional() }))
      .optional(),
  }),
  z.object({
    type: z.literal('form'),
    title: z.string().optional(),
    submit: z.object({ method: z.enum(['POST', 'PUT']), path: z.string() }),
    fields: z.array(
      z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(['text', 'number', 'select']).default('text'),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        options: z.array(z.string()).optional(),
        default: z.union([z.string(), z.number()]).optional(),
      })
    ),
  }),
  z.object({ type: z.literal('text'), source: z.string(), title: z.string().optional() }),
]);

const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
  name: z.string().min(1).max(60),
  version: z.string().max(20),
  description: z.string().max(300).default(''),
  author: z.string().max(80).optional(),
  main: z.string().default('index.mjs'),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
  ui: z
    .object({
      pages: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            title: z.string().max(40),
            icon: z.string().max(20).optional(),
            widgets: z.array(WidgetSchema),
          })
        )
        .default([]),
    })
    .optional(),
});
export type PluginManifest = z.infer<typeof ManifestSchema>;

export interface PluginRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  user: { username: string; role: Role };
}

/** Wrap a string so the route returns it verbatim instead of JSON (e.g. Prometheus text). */
export class RawResponse {
  constructor(public body: string, public contentType = 'text/plain; charset=utf-8', public status = 200) {}
}

type RouteHandler = (req: PluginRequest) => unknown | Promise<unknown>;
interface PluginRoute {
  method: string;
  segments: string[];
  role: Role;
  handler: RouteHandler;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  granted: Permission[];
  enabled: boolean;
  active: boolean;
  error?: string;
  needsApproval: boolean;
  routes: PluginRoute[];
  cleanups: Array<() => void | Promise<void>>;
  module?: { deactivate?: () => void | Promise<void> };
}

export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  permissions: Permission[];
  granted: Permission[];
  enabled: boolean;
  active: boolean;
  needsApproval: boolean;
  error?: string;
  hasUi: boolean;
}

const pluginsDir = process.env.PLUGINS_DIR ? path.resolve(process.env.PLUGINS_DIR) : path.join(config.projectRoot, 'plugins');

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export class PluginService {
  private plugins = new Map<string, LoadedPlugin>();

  discover(): void {
    this.plugins.clear();
    if (!fs.existsSync(pluginsDir)) return;
    const db = getDatabase();

    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(dir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
        if (manifest.id !== entry.name) throw new Error(`manifest id "${manifest.id}" must match folder name "${entry.name}"`);
        const mainPath = path.resolve(dir, manifest.main);
        if (!mainPath.startsWith(dir + path.sep)) throw new Error('main must stay inside the plugin folder');

        const row = db.get<any>('SELECT enabled, granted FROM plugins WHERE id = ?', [manifest.id]);
        const granted: Permission[] = row ? JSON.parse(row.granted || '[]') : [];
        const needsApproval = manifest.permissions.some((p) => !granted.includes(p));
        this.plugins.set(manifest.id, {
          manifest,
          dir,
          granted,
          enabled: !!row?.enabled,
          active: false,
          needsApproval,
          routes: [],
          cleanups: [],
        });
      } catch (err: any) {
        console.error(`[plugins] ignoring "${entry.name}": ${err.message}`);
      }
    }
  }

  async loadAll(): Promise<void> {
    this.discover();
    for (const p of this.plugins.values()) {
      if (p.enabled && !p.needsApproval) await this.activate(p.manifest.id);
      else if (p.enabled && p.needsApproval) p.error = 'Plugin requests new permissions - approve them to re-enable';
    }
  }

  list(): PluginStatus[] {
    return [...this.plugins.values()].map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      permissions: p.manifest.permissions,
      granted: p.granted,
      enabled: p.enabled,
      active: p.active,
      needsApproval: p.needsApproval,
      error: p.error,
      hasUi: !!p.manifest.ui?.pages.length,
    }));
  }

  /** UI descriptors of active plugins, for the sidebar/pages. */
  uiPages() {
    return [...this.plugins.values()]
      .filter((p) => p.active && p.manifest.ui?.pages.length)
      .map((p) => ({ pluginId: p.manifest.id, pluginName: p.manifest.name, pages: p.manifest.ui!.pages }));
  }

  async enable(id: string, approved: string[]): Promise<void> {
    const p = this.plugins.get(id);
    if (!p) throw httpError(404, 'Plugin not found');
    const wanted = p.manifest.permissions;
    const missing = wanted.filter((perm) => !approved.includes(perm));
    if (missing.length) throw httpError(400, `All requested permissions must be approved (missing: ${missing.join(', ')})`);

    getDatabase().run(
      `INSERT INTO plugins (id, enabled, granted, updated_at) VALUES (?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET enabled = 1, granted = excluded.granted, updated_at = excluded.updated_at`,
      [id, JSON.stringify(wanted), new Date().toISOString()]
    );
    p.granted = [...wanted];
    p.enabled = true;
    p.needsApproval = false;
    await this.activate(id);
    if (p.error) throw httpError(500, `Plugin failed to start: ${p.error}`);
  }

  async disable(id: string): Promise<void> {
    const p = this.plugins.get(id);
    if (!p) throw httpError(404, 'Plugin not found');
    getDatabase().run(
      `INSERT INTO plugins (id, enabled, granted, updated_at) VALUES (?, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET enabled = 0, updated_at = excluded.updated_at`,
      [id, JSON.stringify(p.granted), new Date().toISOString()]
    );
    p.enabled = false;
    await this.deactivate(id);
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.plugins.keys()]) await this.deactivate(id);
  }

  // ---------- request dispatch ----------

  async handleRequest(
    pluginId: string,
    method: string,
    subPath: string,
    req: { query: any; body: any; user: { username: string; role: Role } },
    roleOk: (role: Role, min: Role) => boolean
  ): Promise<unknown> {
    const p = this.plugins.get(pluginId);
    if (!p || !p.active) throw httpError(404, 'Plugin not available');
    const parts = subPath.split('/').filter(Boolean);

    for (const route of p.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      const matches = route.segments.every((seg, i) => {
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
          return true;
        }
        return seg === parts[i];
      });
      if (!matches) continue;
      if (!roleOk(req.user.role, route.role)) throw httpError(403, `Requires ${route.role} role`);
      return route.handler({ params, query: req.query || {}, body: req.body, user: req.user });
    }
    throw httpError(404, 'Plugin route not found');
  }

  // ---------- lifecycle ----------

  private async activate(id: string): Promise<void> {
    const p = this.plugins.get(id)!;
    await this.deactivate(id);
    p.error = undefined;
    try {
      const mainUrl = pathToFileURL(path.resolve(p.dir, p.manifest.main)).href + `?v=${Date.now()}`;
      const mod = await import(mainUrl);
      const activate = mod.default ?? mod.activate;
      if (typeof activate !== 'function') throw new Error('plugin must default-export an activate(ctx) function');
      p.module = mod;
      await activate(this.buildContext(p));
      p.active = true;
      console.log(`[plugins] activated ${id}@${p.manifest.version}`);
    } catch (err: any) {
      p.error = err.message || String(err);
      console.error(`[plugins] failed to activate ${id}: ${p.error}`);
      await this.deactivate(id, p.error);
    }
  }

  private async deactivate(id: string, keepError?: string): Promise<void> {
    const p = this.plugins.get(id);
    if (!p) return;
    try {
      await p.module?.deactivate?.();
    } catch (err: any) {
      console.error(`[plugins] ${id} deactivate() threw: ${err.message}`);
    }
    for (const fn of p.cleanups.splice(0)) {
      try {
        await fn();
      } catch {
        /* best effort */
      }
    }
    p.routes = [];
    p.active = false;
    p.module = undefined;
    p.error = keepError;
  }

  private buildContext(p: LoadedPlugin) {
    const id = p.manifest.id;
    const has = (perm: Permission) => p.granted.includes(perm);
    const need = (perm: Permission) => {
      if (!has(perm)) throw new Error(`Plugin "${id}" lacks permission "${perm}"`);
    };
    const prefix = `[plugin:${id}]`;
    const db = getDatabase;

    return {
      plugin: { id, version: p.manifest.version },
      log: {
        info: (...a: unknown[]) => console.log(prefix, ...a),
        warn: (...a: unknown[]) => console.warn(prefix, ...a),
        error: (...a: unknown[]) => console.error(prefix, ...a),
      },
      http: { text: (body: string, contentType?: string, status?: number) => new RawResponse(body, contentType, status) },

      /** Small per-plugin key/value store (JSON values). No permission needed. */
      storage: {
        get: <T = unknown>(key: string): T | undefined => {
          const row = db().get<any>('SELECT value FROM plugin_kv WHERE plugin_id = ? AND key = ?', [id, key]);
          return row ? (JSON.parse(row.value) as T) : undefined;
        },
        set: (key: string, value: unknown): void => {
          const json = JSON.stringify(value);
          if (json.length > 512 * 1024) throw new Error('storage value too large (512 KB max)');
          db().run(
            'INSERT INTO plugin_kv (plugin_id, key, value) VALUES (?, ?, ?) ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value',
            [id, key, json]
          );
        },
        delete: (key: string): void => {
          db().run('DELETE FROM plugin_kv WHERE plugin_id = ? AND key = ?', [id, key]);
        },
      },

      servers: {
        list: () => {
          need('servers.read');
          return serverService.listServers();
        },
        get: (serverId: string) => {
          need('servers.read');
          return serverService.getServerById(serverId);
        },
        /** Latest cached telemetry snapshot (no SSH round-trip). */
        latestMetrics: (serverId: string) => {
          need('servers.read');
          return metricsStore.getCached(serverId, 10 * 60_000);
        },
      },

      ssh: {
        exec: async (serverId: string, command: string, timeoutMs = 15000): Promise<string> => {
          need('ssh.exec');
          const creds = serverService.getDecryptedCredentials(serverId);
          if (!creds?.server) throw new Error('Server not found');
          auditService.log({
            action: 'PLUGIN_SSH_EXEC',
            username: `plugin:${id}`,
            serverId: creds.server.id,
            serverName: creds.server.name,
            details: command.slice(0, 300),
          });
          return sshService.executeCommand(creds, command, Math.min(timeoutMs, 60000));
        },
      },

      events: {
        on: <K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void) => {
          need('events');
          p.cleanups.push(events.on(event, handler));
        },
      },

      notify: {
        send: async (msg: NotificationMessage, channelIds?: string[]) => {
          need('notify');
          const ids = channelIds ?? notifierService.list().filter((c) => c.isEnabled).map((c) => c.id);
          await notifierService.broadcast(ids, msg);
        },
        registerChannelType: (driver: ChannelDriver) => {
          need('notify');
          notifierService.registerDriver(driver);
        },
      },

      routes: {
        add: (method: 'GET' | 'POST' | 'PUT' | 'DELETE', routePath: string, handler: RouteHandler, opts: { role?: Role } = {}) => {
          need('routes');
          p.routes.push({
            method,
            segments: routePath.split('/').filter(Boolean),
            role: opts.role ?? (method === 'GET' ? 'viewer' : 'operator'),
            handler,
          });
        },
      },

      scheduler: {
        every: (seconds: number, fn: () => void | Promise<void>) => {
          need('scheduler');
          const t = setInterval(() => {
            Promise.resolve(fn()).catch((e) => console.error(prefix, 'scheduled task failed:', e?.message || e));
          }, Math.max(5, seconds) * 1000);
          t.unref();
          p.cleanups.push(() => clearInterval(t));
        },
      },
    };
  }
}

export const pluginService = new PluginService();

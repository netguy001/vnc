import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { cryptoService } from './crypto.service.js';
import type { NotificationChannelDTO } from '@server-console/shared';

export interface NotificationMessage {
  title: string;
  body: string;
  severity: 'critical' | 'info' | 'resolved';
}

export interface ChannelDriver {
  type: string;
  label: string;
  /** Config field names required for this channel type */
  fields: string[];
  send(config: Record<string, string>, msg: NotificationMessage): Promise<void>;
  /** Short non-secret description of where the message goes */
  summarize(config: Record<string, string>): string;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
}

const ICON = { critical: '🔴', info: 'ℹ️', resolved: '✅' } as const;

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid url';
  }
}

const BUILTIN: ChannelDriver[] = [
  {
    type: 'telegram',
    label: 'Telegram bot',
    fields: ['botToken', 'chatId'],
    summarize: (c) => `chat ${c.chatId}`,
    send: (c, m) =>
      postJson(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
        chat_id: c.chatId,
        text: `${ICON[m.severity]} ${m.title}\n${m.body}`,
      }),
  },
  {
    type: 'discord',
    label: 'Discord webhook',
    fields: ['url'],
    summarize: (c) => safeHost(c.url),
    send: (c, m) => postJson(c.url, { content: `${ICON[m.severity]} **${m.title}**\n${m.body}` }),
  },
  {
    type: 'slack',
    label: 'Slack webhook',
    fields: ['url'],
    summarize: (c) => safeHost(c.url),
    send: (c, m) => postJson(c.url, { text: `${ICON[m.severity]} *${m.title}*\n${m.body}` }),
  },
  {
    type: 'webhook',
    label: 'Generic webhook (JSON)',
    fields: ['url'],
    summarize: (c) => safeHost(c.url),
    send: (c, m) => postJson(c.url, { ...m, source: 'ioc', timestamp: new Date().toISOString() }),
  },
];

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export class NotifierService {
  private drivers = new Map<string, ChannelDriver>(BUILTIN.map((d) => [d.type, d]));

  /** Lets plugins add channel types (e.g. email, PagerDuty). */
  registerDriver(driver: ChannelDriver): void {
    this.drivers.set(driver.type, driver);
  }

  listDrivers(): Array<Pick<ChannelDriver, 'type' | 'label' | 'fields'>> {
    return [...this.drivers.values()].map(({ type, label, fields }) => ({ type, label, fields }));
  }

  list(): NotificationChannelDTO[] {
    return getDatabase()
      .query<any>('SELECT * FROM notification_channels ORDER BY created_at')
      .map((r) => this.toDTO(r));
  }

  create(input: { name: string; type: string; config: Record<string, string> }): NotificationChannelDTO {
    const driver = this.drivers.get(input.type);
    if (!driver) throw badRequest(`Unknown channel type "${input.type}"`);
    for (const f of driver.fields) {
      if (!input.config[f]) throw badRequest(`Missing field "${f}"`);
    }
    if (driver.fields.includes('url') && !/^https:\/\//i.test(input.config.url)) {
      throw badRequest('Webhook URL must start with https://');
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    getDatabase().run(
      'INSERT INTO notification_channels (id, name, type, encrypted_config, is_enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [id, input.name, input.type, cryptoService.encrypt(JSON.stringify(input.config)), now]
    );
    return this.toDTO(getDatabase().get<any>('SELECT * FROM notification_channels WHERE id = ?', [id]));
  }

  setEnabled(id: string, enabled: boolean): boolean {
    return getDatabase().run('UPDATE notification_channels SET is_enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]).changes > 0;
  }

  delete(id: string): boolean {
    return getDatabase().run('DELETE FROM notification_channels WHERE id = ?', [id]).changes > 0;
  }

  async sendTo(channelId: string, msg: NotificationMessage): Promise<void> {
    const row = getDatabase().get<any>('SELECT * FROM notification_channels WHERE id = ?', [channelId]);
    if (!row) throw new Error('Channel not found');
    const driver = this.drivers.get(row.type);
    if (!driver) throw new Error(`No driver for channel type "${row.type}"`);
    const config = JSON.parse(cryptoService.decrypt(row.encrypted_config) || '{}');
    await driver.send(config, msg);
  }

  /** Sends to several channels; failures are logged, never thrown. */
  async broadcast(channelIds: string[], msg: NotificationMessage): Promise<void> {
    const db = getDatabase();
    await Promise.all(
      channelIds.map(async (id) => {
        const row = db.get<any>('SELECT is_enabled FROM notification_channels WHERE id = ?', [id]);
        if (!row || !row.is_enabled) return;
        try {
          await this.sendTo(id, msg);
        } catch (err: any) {
          console.error(`[notifier] channel ${id} failed: ${err.message}`);
        }
      })
    );
  }

  private toDTO(row: any): NotificationChannelDTO {
    let summary = '';
    try {
      const driver = this.drivers.get(row.type);
      summary = driver ? driver.summarize(JSON.parse(cryptoService.decrypt(row.encrypted_config) || '{}')) : '';
    } catch {
      summary = 'unreadable config';
    }
    return { id: row.id, name: row.name, type: row.type, isEnabled: !!row.is_enabled, summary, createdAt: row.created_at };
  }
}

export const notifierService = new NotifierService();

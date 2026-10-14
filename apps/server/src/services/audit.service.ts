import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { events } from './events.js';
import { AuditLogDTO } from '@server-console/shared';

export class AuditService {
  log(params: {
    userId?: string;
    username?: string;
    action: string;
    serverId?: string;
    serverName?: string;
    details?: string;
    success?: boolean;
    ipAddress?: string;
  }): void {
    try {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO audit_logs (id, user_id, username, action, server_id, server_name, details, success, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          params.userId || null,
          params.username || null,
          params.action,
          params.serverId || null,
          params.serverName || null,
          params.details || null,
          params.success !== false ? 1 : 0,
          params.ipAddress || null,
          now,
        ]
      );
      events.emit('audit.logged', {
        action: params.action,
        username: params.username,
        serverId: params.serverId,
        details: params.details,
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }

  getLogs(limit = 100): AuditLogDTO[] {
    const db = getDatabase();
    const rows = db.query<any>(
      `SELECT id, created_at as timestamp, user_id as userId, username, action, 
              server_id as serverId, server_name as serverName, details, success, ip_address as ipAddress
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.userId || undefined,
      username: r.username || undefined,
      action: r.action,
      serverId: r.serverId || undefined,
      serverName: r.serverName || undefined,
      details: r.details || undefined,
      success: Boolean(r.success),
      ipAddress: r.ipAddress || undefined,
    }));
  }

  clearLogs(): number {
    const db = getDatabase();
    const result = db.run('DELETE FROM audit_logs');
    return result.changes;
  }
}

export const auditService = new AuditService();

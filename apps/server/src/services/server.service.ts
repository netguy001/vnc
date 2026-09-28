import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { cryptoService } from './crypto.service.js';
import {
  ServerDTO,
  ServerCreateInput,
  ServerUpdateInput,
  ServerStatusType,
} from '@server-console/shared';

export interface InternalServerCredentials {
  server: ServerDTO;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  vncPassword?: string;
}

export class ServerService {
  listServers(): ServerDTO[] {
    const db = getDatabase();
    const rows = db.query<any>(`
      SELECT s.*, 
        (c.encrypted_ssh_password IS NOT NULL AND c.encrypted_ssh_password != '') as has_ssh_password,
        (c.encrypted_ssh_key IS NOT NULL AND c.encrypted_ssh_key != '') as has_ssh_key,
        (c.encrypted_vnc_password IS NOT NULL AND c.encrypted_vnc_password != '') as has_vnc_password
      FROM servers s
      LEFT JOIN server_credentials c ON s.id = c.server_id
      ORDER BY s.server_group ASC, s.name ASC
    `);

    return rows.map(this.mapRowToDTO);
  }

  getServerById(id: string): ServerDTO | null {
    const db = getDatabase();
    const row = db.get<any>(
      `
      SELECT s.*, 
        (c.encrypted_ssh_password IS NOT NULL AND c.encrypted_ssh_password != '') as has_ssh_password,
        (c.encrypted_ssh_key IS NOT NULL AND c.encrypted_ssh_key != '') as has_ssh_key,
        (c.encrypted_vnc_password IS NOT NULL AND c.encrypted_vnc_password != '') as has_vnc_password
      FROM servers s
      LEFT JOIN server_credentials c ON s.id = c.server_id
      WHERE s.id = ?
    `,
      [id]
    );

    if (!row) return null;
    return this.mapRowToDTO(row);
  }

  createServer(input: ServerCreateInput): ServerDTO {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO servers (
        id, name, host, ssh_port, ssh_username, auth_method,
        vnc_host, vnc_port, vnc_enabled, server_group,
        description, is_enabled, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.host,
        input.sshPort || 22,
        input.sshUsername,
        input.authMethod,
        input.vncHost || input.host,
        input.vncPort || 5900,
        input.vncEnabled !== false ? 1 : 0,
        input.serverGroup || 'Default',
        input.description || null,
        input.isEnabled !== false ? 1 : 0,
        'disconnected',
        now,
        now,
      ]
    );

    // Encrypt and store credentials
    const credId = crypto.randomUUID();
    const encryptedSshPassword = cryptoService.encrypt(input.sshPassword);
    const encryptedSshKey = cryptoService.encrypt(input.sshPrivateKey);
    const encryptedSshPassphrase = cryptoService.encrypt(input.sshPassphrase);
    const encryptedVncPassword = cryptoService.encrypt(input.vncPassword);

    db.run(
      `INSERT INTO server_credentials (
        id, server_id, encrypted_ssh_password, encrypted_ssh_key,
        encrypted_ssh_passphrase, encrypted_vnc_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        credId,
        id,
        encryptedSshPassword,
        encryptedSshKey,
        encryptedSshPassphrase,
        encryptedVncPassword,
        now,
        now,
      ]
    );

    const created = this.getServerById(id);
    if (!created) throw new Error('Failed to create server');
    return created;
  }

  updateServer(id: string, input: ServerUpdateInput): ServerDTO {
    const db = getDatabase();
    const existing = this.getServerById(id);
    if (!existing) {
      throw new Error(`Server with ID ${id} not found`);
    }

    const now = new Date().toISOString();

    db.run(
      `UPDATE servers SET
        name = COALESCE(?, name),
        host = COALESCE(?, host),
        ssh_port = COALESCE(?, ssh_port),
        ssh_username = COALESCE(?, ssh_username),
        auth_method = COALESCE(?, auth_method),
        vnc_host = COALESCE(?, vnc_host),
        vnc_port = COALESCE(?, vnc_port),
        vnc_enabled = COALESCE(?, vnc_enabled),
        server_group = COALESCE(?, server_group),
        description = COALESCE(?, description),
        is_enabled = COALESCE(?, is_enabled),
        updated_at = ?
      WHERE id = ?`,
      [
        input.name ?? null,
        input.host ?? null,
        input.sshPort ?? null,
        input.sshUsername ?? null,
        input.authMethod ?? null,
        input.vncHost ?? null,
        input.vncPort ?? null,
        input.vncEnabled !== undefined ? (input.vncEnabled ? 1 : 0) : null,
        input.serverGroup ?? null,
        input.description ?? null,
        input.isEnabled !== undefined ? (input.isEnabled ? 1 : 0) : null,
        now,
        id,
      ]
    );

    // Update credentials if provided
    if (
      input.sshPassword !== undefined ||
      input.sshPrivateKey !== undefined ||
      input.sshPassphrase !== undefined ||
      input.vncPassword !== undefined
    ) {
      const updates: string[] = [];
      const params: any[] = [];

      if (input.sshPassword !== undefined) {
        updates.push('encrypted_ssh_password = ?');
        params.push(cryptoService.encrypt(input.sshPassword));
      }
      if (input.sshPrivateKey !== undefined) {
        updates.push('encrypted_ssh_key = ?');
        params.push(cryptoService.encrypt(input.sshPrivateKey));
      }
      if (input.sshPassphrase !== undefined) {
        updates.push('encrypted_ssh_passphrase = ?');
        params.push(cryptoService.encrypt(input.sshPassphrase));
      }
      if (input.vncPassword !== undefined) {
        updates.push('encrypted_vnc_password = ?');
        params.push(cryptoService.encrypt(input.vncPassword));
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);
        db.run(
          `UPDATE server_credentials SET ${updates.join(', ')} WHERE server_id = ?`,
          params
        );
      }
    }

    const updated = this.getServerById(id);
    if (!updated) throw new Error('Failed to update server');
    return updated;
  }

  deleteServer(id: string): boolean {
    const db = getDatabase();
    const result = db.run('DELETE FROM servers WHERE id = ?', [id]);
    return result.changes > 0;
  }

  updateStatus(id: string, status: ServerStatusType): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.run(
      "UPDATE servers SET status = ?, last_connected_at = CASE WHEN ? = 'connected' THEN ? ELSE last_connected_at END WHERE id = ?",
      [status, status, now, id]
    );
  }

  /**
   * Internal method strictly for backend services. NEVER leak to API responses!
   */
  getDecryptedCredentials(id: string): InternalServerCredentials | null {
    const server = this.getServerById(id);
    if (!server) return null;

    const db = getDatabase();
    const credRow = db.get<any>(
      'SELECT * FROM server_credentials WHERE server_id = ?',
      [id]
    );

    if (!credRow) {
      return { server };
    }

    return {
      server,
      sshPassword: cryptoService.decrypt(credRow.encrypted_ssh_password) || undefined,
      sshPrivateKey: cryptoService.decrypt(credRow.encrypted_ssh_key) || undefined,
      sshPassphrase: cryptoService.decrypt(credRow.encrypted_ssh_passphrase) || undefined,
      vncPassword: cryptoService.decrypt(credRow.encrypted_vnc_password) || undefined,
    };
  }

  private mapRowToDTO(row: any): ServerDTO {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      sshPort: row.ssh_port,
      sshUsername: row.ssh_username,
      authMethod: row.auth_method,
      hasSshPassword: Boolean(row.has_ssh_password),
      hasSshPrivateKey: Boolean(row.has_ssh_key),
      vncHost: row.vnc_host || row.host,
      vncPort: row.vnc_port,
      vncEnabled: Boolean(row.vnc_enabled),
      hasVncPassword: Boolean(row.has_vnc_password),
      serverGroup: row.server_group,
      description: row.description || undefined,
      isEnabled: Boolean(row.is_enabled),
      status: row.status as ServerStatusType,
      lastConnectedAt: row.last_connected_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const serverService = new ServerService();

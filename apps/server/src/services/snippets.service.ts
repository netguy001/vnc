import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import { CommandSnippetDTO, CommandSnippetCreateInput } from '@server-console/shared';

export class SnippetsService {
  listSnippets(userId: string, serverId?: string): CommandSnippetDTO[] {
    const db = getDatabase();
    const rows = serverId
      ? db.query<any>(
          'SELECT * FROM command_snippets WHERE user_id = ? AND (server_id = ? OR server_id IS NULL) ORDER BY created_at DESC',
          [userId, serverId]
        )
      : db.query<any>('SELECT * FROM command_snippets WHERE user_id = ? ORDER BY created_at DESC', [userId]);

    return rows.map(this.mapRow);
  }

  createSnippet(userId: string, input: CommandSnippetCreateInput): CommandSnippetDTO {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO command_snippets (id, user_id, label, command, server_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, input.label, input.command, input.serverId || null, now]
    );

    const created = db.get<any>('SELECT * FROM command_snippets WHERE id = ?', [id]);
    return this.mapRow(created);
  }

  deleteSnippet(userId: string, id: string): boolean {
    const db = getDatabase();
    const result = db.run('DELETE FROM command_snippets WHERE id = ? AND user_id = ?', [id, userId]);
    return result.changes > 0;
  }

  private mapRow(row: any): CommandSnippetDTO {
    return {
      id: row.id,
      label: row.label,
      command: row.command,
      serverId: row.server_id || undefined,
      createdAt: row.created_at,
    };
  }
}

export const snippetsService = new SnippetsService();

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): T[];
  get<T = any>(sql: string, params?: any[]): T | undefined;
  run(sql: string, params?: any[]): { changes: number; lastInsertRowid: number | bigint };
  exec(sql: string): void;
  close(): void;
}

export class SQLiteDatabaseClient implements IDatabaseClient {
  private db: DatabaseSync;

  constructor(filePath?: string) {
    const targetPath = filePath || config.dbPath;
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(targetPath);
    // Enable WAL mode for better concurrency and foreign keys
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  query<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  get<T = any>(sql: string, params: any[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return (stmt.get(...params) as T) || undefined;
  }

  run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

let dbInstance: IDatabaseClient | null = null;

export function getDatabase(): IDatabaseClient {
  if (!dbInstance) {
    dbInstance = new SQLiteDatabaseClient();
  }
  return dbInstance;
}

export function setDatabase(db: IDatabaseClient): void {
  dbInstance = db;
}

import ssh2Pkg from 'ssh2';
import type { ConnectConfig, ClientChannel, Client as SshClientType } from 'ssh2';
import net from 'node:net';
import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';

const { Client } = ssh2Pkg;
import { InternalServerCredentials } from './server.service.js';
import { ConnectionTestResult } from '@server-console/shared';

interface PooledEntry {
  key: string;
  serverId: string;
  ready: Promise<SshClientType>;
  client?: SshClientType;
  lastUsed: number;
  active: number;
}

export class SshService {
  /**
   * Builds an ssh2 ConnectConfig from internal credentials
   */
  private buildConfig(creds: InternalServerCredentials, timeoutMs = 10000): ConnectConfig {
    const { server, sshPassword, sshPrivateKey, sshPassphrase } = creds;

    const config: ConnectConfig = {
      host: server.host,
      port: server.sshPort || 22,
      username: server.sshUsername,
      readyTimeout: timeoutMs,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      // Trust-on-first-use host key pinning: the first fingerprint seen is stored, any later
      // change is refused so a MITM cannot capture credentials or shell traffic.
      hostHash: 'sha256',
      hostVerifier: (fingerprint: string) => this.verifyHostKey(server.id, fingerprint),
    };

    if (server.authMethod === 'password') {
      config.password = sshPassword || '';
    } else if (server.authMethod === 'privateKey') {
      config.privateKey = sshPrivateKey || '';
      if (sshPassphrase) {
        config.passphrase = sshPassphrase;
      }
    }

    return config;
  }

  private verifyHostKey(serverId: string, hashedKey: string): boolean {
    // ssh2 hands us the sha256 digest as hex; present it in OpenSSH's base64 form.
    const fingerprint = `SHA256:${Buffer.from(hashedKey, 'hex').toString('base64').replace(/=+$/, '')}`;
    try {
      const db = getDatabase();
      const known = db.get<{ fingerprint: string }>('SELECT fingerprint FROM host_keys WHERE server_id = ?', [serverId]);
      if (!known) {
        db.run('INSERT INTO host_keys (server_id, fingerprint, first_seen_at) VALUES (?, ?, ?)', [
          serverId,
          fingerprint,
          new Date().toISOString(),
        ]);
        return true;
      }
      return known.fingerprint === fingerprint;
    } catch {
      return false; // fail closed
    }
  }

  getHostKey(serverId: string): { fingerprint: string; firstSeenAt: string } | null {
    const row = getDatabase().get<any>('SELECT fingerprint, first_seen_at FROM host_keys WHERE server_id = ?', [serverId]);
    return row ? { fingerprint: row.fingerprint, firstSeenAt: row.first_seen_at } : null;
  }

  resetHostKey(serverId: string): void {
    getDatabase().run('DELETE FROM host_keys WHERE server_id = ?', [serverId]);
    this.evictServer(serverId);
  }

  /**
   * Establishes a connected SSH client
   */
  async getConnectedClient(creds: InternalServerCredentials, timeoutMs = 10000): Promise<SshClientType> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          client.end();
          reject(new Error(`SSH connection timed out after ${timeoutMs / 1000}s`));
        }
      }, timeoutMs);

      client
        .on('ready', () => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            resolve(client);
          }
        })
        .on('error', (err: any) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            let message = err.message || 'SSH connection error';
            if (err.level === 'client-authentication') {
              message = 'SSH authentication failed: invalid username, password, or private key.';
            } else if (err.code === 'ECONNREFUSED') {
              message = `SSH connection refused on ${creds.server.host}:${creds.server.sshPort}.`;
            } else if (/host denied|verification failed/i.test(message)) {
              message =
                'SSH host key changed since it was first trusted - connection blocked (possible man-in-the-middle). ' +
                'If the server was legitimately rebuilt, reset its trusted host key in the server settings.';
            } else if (err.code === 'ENOTFOUND') {
              message = `Host "${creds.server.host}" not found. Verify DNS or IP address.`;
            }
            reject(new Error(message));
          }
        })
        .connect(this.buildConfig(creds, timeoutMs));
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Connection reuse. Opening a fresh SSH session per command is slow and, on servers running
  // fail2ban / MaxStartups, looks like a connection flood. One authenticated connection per server is
  // kept and commands are multiplexed over it as separate channels; idle connections close after 60 s.
  // Interactive shells, SFTP sessions and connection tests deliberately keep their own connections.
  // ---------------------------------------------------------------------------------------------
  private pool = new Map<string, PooledEntry>();
  private sweeper: NodeJS.Timeout | null = null;
  private static readonly IDLE_MS = 60_000;
  private static readonly MAX_CHANNELS = 6; // stay under sshd's default MaxSessions of 10

  private poolKey(creds: InternalServerCredentials): string {
    const { server, sshPassword, sshPrivateKey, sshPassphrase } = creds;
    const secretHash = crypto
      .createHash('sha256')
      .update(`${sshPassword ?? ''}\0${sshPrivateKey ?? ''}\0${sshPassphrase ?? ''}`)
      .digest('hex')
      .slice(0, 16);
    return `${server.id}|${server.host}|${server.sshPort}|${server.sshUsername}|${server.authMethod}|${secretHash}`;
  }

  private evict(entry: PooledEntry): void {
    if (this.pool.get(entry.key) === entry) this.pool.delete(entry.key);
    try {
      entry.client?.end();
    } catch {
      /* already closed */
    }
  }

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const entry of [...this.pool.values()]) {
        if (entry.active === 0 && now - entry.lastUsed > SshService.IDLE_MS) this.evict(entry);
      }
      if (this.pool.size === 0 && this.sweeper) {
        clearInterval(this.sweeper);
        this.sweeper = null;
      }
    }, 20_000);
    this.sweeper.unref();
  }

  /** Drops pooled connections for a server (after deletion, host-key reset, ...). */
  evictServer(serverId: string): void {
    for (const entry of [...this.pool.values()]) if (entry.serverId === serverId) this.evict(entry);
  }

  closeAll(): void {
    for (const entry of [...this.pool.values()]) this.evict(entry);
  }

  private async acquire(
    creds: InternalServerCredentials,
    timeoutMs: number
  ): Promise<{ client: SshClientType; release: (broken?: boolean) => void }> {
    const key = this.poolKey(creds);
    let entry = this.pool.get(key);

    if (!entry) {
      const created: PooledEntry = { key, serverId: creds.server.id, lastUsed: Date.now(), active: 0, ready: undefined as unknown as Promise<SshClientType> };
      created.ready = this.getConnectedClient(creds, Math.max(timeoutMs, 10000)).then((client) => {
        created.client = client;
        const drop = () => {
          if (this.pool.get(key) === created) this.pool.delete(key);
        };
        client.on('close', drop);
        client.on('error', drop);
        client.on('end', drop);
        return client;
      });
      created.ready.catch(() => {
        if (this.pool.get(key) === created) this.pool.delete(key);
      });
      this.pool.set(key, created);
      this.ensureSweeper();
      entry = created;
    }

    // Too many concurrent channels on the shared connection: use a throwaway one instead of queueing.
    if (entry.active >= SshService.MAX_CHANNELS) {
      const own = await this.getConnectedClient(creds, timeoutMs);
      return { client: own, release: () => own.end() };
    }

    const client = await entry.ready;
    const live = entry;
    live.active++;
    live.lastUsed = Date.now();
    let released = false;
    return {
      client,
      release: (broken = false) => {
        if (released) return;
        released = true;
        live.active--;
        live.lastUsed = Date.now();
        if (broken) this.evict(live); // a timed-out or failed channel leaves the connection in an unknown state
      },
    };
  }

  /**
   * Runs a multi-line script through `bash -s` and reports stdout, stderr and the exit code
   * (non-zero exits are returned, not thrown). Output is capped per stream.
   */
  async runScript(
    creds: InternalServerCredentials,
    script: string,
    timeoutMs = 60000
  ): Promise<{ stdout: string; stderr: string; code: number | null; truncated: boolean }> {
    const { client, release } = await this.acquire(creds, Math.min(timeoutMs, 15000));
    const CAP = 200_000;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        release(true);
        reject(new Error(`Script timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      client.exec('bash -s', (err: any, stream: any) => {
        if (err) {
          settled = true;
          clearTimeout(timer);
          release(true);
          reject(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        let truncated = false;
        const append = (cur: string, chunk: Buffer) => {
          if (cur.length >= CAP) {
            truncated = true;
            return cur;
          }
          return cur + chunk.toString();
        };
        stream.on('data', (d: Buffer) => (stdout = append(stdout, d)));
        stream.stderr.on('data', (d: Buffer) => (stderr = append(stderr, d)));
        stream.on('close', (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          release();
          resolve({ stdout, stderr, code, truncated });
        });
        stream.end(script.endsWith('\n') ? script : script + '\n');
      });
    });
  }

  /**
   * Executes a command on the remote server and returns stdout
   */
  async executeCommand(creds: InternalServerCredentials, command: string, timeoutMs = 15000): Promise<string> {
    const { client, release } = await this.acquire(creds, timeoutMs);

    return new Promise((resolve, reject) => {
      let settled = false;
      const execTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          release(true);
          reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${command}`));
        }
      }, timeoutMs);

      client.exec(command, (err: any, stream: any) => {
        if (err) {
          if (!settled) {
            settled = true;
            clearTimeout(execTimer);
            release(true);
            reject(err);
          }
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(execTimer);
            release();
            if (code !== 0 && stderr.trim().length > 0) {
              reject(new Error(`Command exited with code ${code}: ${stderr.trim()}`));
            } else {
              resolve(stdout);
            }
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * Tests SSH connection and TCP reachability of VNC port
   */
  async testConnection(creds: InternalServerCredentials): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    let sshSuccess = false;
    let sshMessage = '';
    let vncSuccess = false;
    let vncMessage = '';

    // Test SSH
    try {
      const client = await this.getConnectedClient(creds, 7000);
      client.end();
      sshSuccess = true;
      sshMessage = `SSH connection successful to ${creds.server.host}:${creds.server.sshPort}`;
    } catch (err: any) {
      sshSuccess = false;
      sshMessage = err.message;
    }

    // Test VNC port reachability if VNC is configured
    if (creds.server.vncEnabled) {
      const vncHost = creds.server.vncHost || creds.server.host;
      const vncPort = creds.server.vncPort || 5900;
      try {
        await this.checkTcpPort(vncHost, vncPort, 5000);
        vncSuccess = true;
        vncMessage = `VNC port ${vncPort} is reachable on ${vncHost}`;
      } catch (err: any) {
        vncSuccess = false;
        vncMessage = `VNC connection failed: ${err.message}`;
      }
    } else {
      vncSuccess = true;
      vncMessage = 'VNC is disabled for this server';
    }

    const latencyMs = Date.now() - startTime;
    return {
      sshSuccess,
      sshMessage,
      vncSuccess,
      vncMessage,
      latencyMs,
    };
  }

  /**
   * Simple TCP handshake probe
   */
  private checkTcpPort(host: string, port: number, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve();
        }
      });

      socket.on('timeout', () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error(`Connection to ${host}:${port} timed out after ${timeoutMs / 1000}s`));
        }
      });

      socket.on('error', (err: any) => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error(err.message || 'Port unreachable'));
        }
      });

      socket.connect(port, host);
    });
  }

  /**
   * Starts an interactive PTY shell
   */
  async startInteractiveShell(
    creds: InternalServerCredentials,
    cols = 80,
    rows = 24
  ): Promise<{
    client: SshClientType;
    stream: ClientChannel;
  }> {
    const client = await this.getConnectedClient(creds);

    return new Promise((resolve, reject) => {
      client.shell(
        {
          term: 'xterm-256color',
          cols,
          rows,
        },
        (err: any, stream: any) => {
          if (err) {
            client.end();
            return reject(err);
          }
          resolve({ client, stream });
        }
      );
    });
  }
}

export const sshService = new SshService();

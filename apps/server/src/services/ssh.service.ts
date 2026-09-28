import ssh2Pkg from 'ssh2';
import type { ConnectConfig, ClientChannel, Client as SshClientType } from 'ssh2';
import net from 'node:net';

const { Client } = ssh2Pkg;
import { InternalServerCredentials } from './server.service.js';
import { ConnectionTestResult } from '@server-console/shared';

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
            } else if (err.code === 'ENOTFOUND') {
              message = `Host "${creds.server.host}" not found. Verify DNS or IP address.`;
            }
            reject(new Error(message));
          }
        })
        .connect(this.buildConfig(creds, timeoutMs));
    });
  }

  /**
   * Executes a command on the remote server and returns stdout
   */
  async executeCommand(creds: InternalServerCredentials, command: string, timeoutMs = 15000): Promise<string> {
    const client = await this.getConnectedClient(creds, timeoutMs);

    return new Promise((resolve, reject) => {
      client.exec(command, (err: any, stream: any) => {
        if (err) {
          client.end();
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            client.end();
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

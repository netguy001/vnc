import { SFTPWrapper } from 'ssh2';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { InternalServerCredentials } from './server.service.js';
import { shQuote } from './shell.js';
import { sshService } from './ssh.service.js';
import { SftpFileItem } from '@server-console/shared';

export class SftpService {
  /**
   * Helper to obtain an SFTP session from an SSH client
   */
  private async getSftpSession(creds: InternalServerCredentials): Promise<{ client: any; sftp: SFTPWrapper }> {
    const client = await sshService.getConnectedClient(creds);
    return new Promise((resolve, reject) => {
      client.sftp((err: any, sftp: any) => {
        if (err) {
          client.end();
          return reject(new Error(`Failed to initialize SFTP subsystem: ${err.message}`));
        }
        resolve({ client, sftp });
      });
    });
  }

  /**
   * List files in a remote directory
   */
  async listFiles(creds: InternalServerCredentials, remotePath = '/'): Promise<SftpFileItem[]> {
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      const normalizedPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;

      sftp.readdir(normalizedPath, (err, list) => {
        client.end();
        if (err) {
          return reject(new Error(`Failed to read directory "${normalizedPath}": ${err.message}`));
        }

        const items: SftpFileItem[] = list.map((item) => {
          const isDir = Boolean(item.attrs.mode & 0o040000);
          const isSymlink = Boolean(item.attrs.mode & 0o120000);
          const size = item.attrs.size || 0;
          const mtime = item.attrs.mtime ? new Date(item.attrs.mtime * 1000).toISOString() : new Date().toISOString();
          const itemPath = normalizedPath === '/' ? `/${item.filename}` : `${normalizedPath}/${item.filename}`;

          return {
            name: item.filename,
            path: itemPath,
            size,
            sizeFormatted: this.formatBytes(size),
            isDirectory: isDir,
            isSymbolicLink: isSymlink,
            modifiedTime: mtime,
            permissions: this.formatPermissions(item.attrs.mode),
          };
        });

        // Sort: directories first, then alphabetically
        items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(items);
      });
    });
  }

  /**
   * Download a remote file as a readable stream
   */
  async createDownloadStream(creds: InternalServerCredentials, remoteFilePath: string): Promise<{ stream: Readable; cleanup: () => void }> {
    const { client, sftp } = await this.getSftpSession(creds);

    const readStream = sftp.createReadStream(remoteFilePath);

    const cleanup = () => {
      try {
        client.end();
      } catch {}
    };

    readStream.on('close', cleanup);
    readStream.on('error', cleanup);

    return { stream: readStream, cleanup };
  }

  /**
   * Upload a stream to a remote file path
   */
  async uploadFile(creds: InternalServerCredentials, remoteFilePath: string, fileStream: Readable): Promise<void> {
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      const writeStream = sftp.createWriteStream(remoteFilePath);

      writeStream.on('finish', () => {
        client.end();
        resolve();
      });

      writeStream.on('error', (err: Error) => {
        client.end();
        reject(new Error(`SFTP upload error: ${err.message}`));
      });

      fileStream.pipe(writeStream);
    });
  }

  /**
   * Create a directory
   */
  async mkdir(creds: InternalServerCredentials, remoteDirPath: string): Promise<void> {
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      sftp.mkdir(remoteDirPath, (err) => {
        client.end();
        if (err) {
          return reject(new Error(`Failed to create directory: ${err.message}`));
        }
        resolve();
      });
    });
  }

  /**
   * Rename or move a file/directory
   */
  async rename(creds: InternalServerCredentials, oldPath: string, newPath: string): Promise<void> {
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        client.end();
        if (err) {
          return reject(new Error(`Failed to rename path: ${err.message}`));
        }
        resolve();
      });
    });
  }

  /**
   * Read a remote file's full contents as UTF-8 text (for the inline editor).
   * Caps at 2MB to avoid loading huge binaries into memory/browser.
   */
  async readFileAsText(creds: InternalServerCredentials, remoteFilePath: string): Promise<string> {
    const MAX_BYTES = 2 * 1024 * 1024;
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      const stream = sftp.createReadStream(remoteFilePath);
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;

      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          if (!settled) {
            settled = true;
            stream.destroy();
            client.end();
            reject(new Error('File is too large to edit in the browser (limit 2MB)'));
          }
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (settled) return;
        settled = true;
        client.end();
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      stream.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        client.end();
        reject(new Error(`Failed to read file: ${err.message}`));
      });
    });
  }

  /**
   * Overwrite a remote file with UTF-8 text content (for the inline editor's Save).
   */
  async writeFileFromText(creds: InternalServerCredentials, remoteFilePath: string, content: string): Promise<void> {
    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      const writeStream = sftp.createWriteStream(remoteFilePath);

      writeStream.on('finish', () => {
        client.end();
        resolve();
      });

      writeStream.on('error', (err: Error) => {
        client.end();
        reject(new Error(`Failed to save file: ${err.message}`));
      });

      writeStream.end(Buffer.from(content, 'utf8'));
    });
  }

  /**
   * Delete a file or directory
   */
  async deleteItem(creds: InternalServerCredentials, remotePath: string, recursive = false): Promise<void> {
    const normalized = remotePath.trim();
    if (!normalized || normalized === '/' || normalized === '.' || normalized === '..') {
      throw new Error(`Refusing to delete unsafe path "${remotePath}"`);
    }

    if (recursive) {
      // Use rm -rf via ssh command for reliable recursive directory deletion. The path is single-quoted so
      // $VARS, backticks and $(...) in a file name are never expanded by the remote shell; `--` stops
      // option parsing for names starting with "-". The root-path guard above blocks `rm -rf /`.
      await sshService.executeCommand(creds, `rm -rf -- ${shQuote(normalized)}`);
      return;
    }

    const { client, sftp } = await this.getSftpSession(creds);

    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        if (!err) {
          client.end();
          return resolve();
        }

        // If unlink fails, try rmdir in case it's an empty directory
        sftp.rmdir(remotePath, (rmdirErr) => {
          client.end();
          if (rmdirErr) {
            return reject(new Error(`Failed to delete "${remotePath}": ${rmdirErr.message}`));
          }
          resolve();
        });
      });
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private formatPermissions(mode: number): string {
    const octal = (mode & 0o777).toString(8);
    return octal.padStart(3, '0');
  }
}

export const sftpService = new SftpService();

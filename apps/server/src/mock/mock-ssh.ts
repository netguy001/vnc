import ssh2Pkg from 'ssh2';
import type { Server as SshServerType, ServerChannel, Session } from 'ssh2';
import crypto from 'node:crypto';

const { Server: SshServer } = ssh2Pkg;

export class MockSshServer {
  private server: SshServerType | null = null;
  public port: number;
  private hostKey: string;

  constructor(port = 2222) {
    this.port = port;
    // Generate an RSA private key for the test SSH server
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    this.hostKey = privateKey;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new SshServer(
        {
          hostKeys: [this.hostKey],
        },
        (client) => {
          client
            .on('authentication', (ctx) => {
              // Accept user 'admin' or any test user with password 'admin' or 'secret' or any private key
              ctx.accept();
            })
            .on('ready', () => {
              client.on('session', (accept) => {
                const session: Session = accept();

                // Interactive PTY / Shell support
                session.on('pty', (acceptPty) => {
                  acceptPty();
                });

                session.on('shell', (acceptShell) => {
                  const stream: ServerChannel = acceptShell();
                  stream.write(
                    '\x1b[32m====================================================\r\n' +
                    ' Welcome to ServerConsole Local Test Environment\r\n' +
                    ' Linux local-test 6.8.0-generic #1 SMP x86_64 GNU/Linux\r\n' +
                    '====================================================\x1b[0m\r\n\r\n' +
                    'admin@local-test:~$ '
                  );

                  let lineBuffer = '';

                  stream.on('data', (data: Buffer) => {
                    const str = data.toString('utf-8');
                    for (const char of str) {
                      if (char === '\r' || char === '\n') {
                        stream.write('\r\n');
                        this.handleShellCommand(lineBuffer.trim(), stream);
                        lineBuffer = '';
                        stream.write('admin@local-test:~$ ');
                      } else if (char === '\x7f' || char === '\b') {
                        // Backspace
                        if (lineBuffer.length > 0) {
                          lineBuffer = lineBuffer.slice(0, -1);
                          stream.write('\b \b');
                        }
                      } else {
                        lineBuffer += char;
                        stream.write(char); // echo
                      }
                    }
                  });
                });

                // Exec command support (used for monitoring & test commands)
                session.on('exec', (acceptExec, _rejectExec, info) => {
                  const stream: ServerChannel = acceptExec();
                  const cmd = info.command;

                  if (cmd.includes('free')) {
                    stream.write(
                      '===UPTIME===\n' +
                      '36000.50 71000.20\n' +
                      '===LOADAVG===\n' +
                      '0.45 0.32 0.28 1/240 12345\n' +
                      '===FREE===\n' +
                      '               total        used        free      shared  buff/cache   available\n' +
                      'Mem:     16777216000  8388608000  4194304000   104857600  4194304000  8188608000\n' +
                      '===DF===\n' +
                      'Filesystem     1024-blocks      Used Available Capacity Mounted on\n' +
                      '/dev/sda1        104857600  36700160  68157440      35% /\n' +
                      '===PS===\n' +
                      '  PID USER     %CPU %MEM COMMAND\n' +
                      '    1 root      0.1  0.2 systemd\n' +
                      '  892 node      4.2  2.5 node /app/server.js\n' +
                      ' 1024 nginx     1.1  0.8 nginx: worker process\n'
                    );
                    stream.exit(0);
                    stream.end();
                  } else if (cmd.includes('docker ps')) {
                    const containers = [
                      {
                        ID: 'a1b2c3d4e5f6',
                        Names: 'server-console-web',
                        Image: 'server-console/web:latest',
                        Status: 'Up 4 hours',
                        State: 'running',
                        Ports: '0.0.0.0:80->80/tcp',
                        CreatedAt: '2026-09-26 06:00:00',
                      },
                      {
                        ID: 'f6e5d4c3b2a1',
                        Names: 'redis-cache',
                        Image: 'redis:7-alpine',
                        Status: 'Up 12 hours',
                        State: 'running',
                        Ports: '6379/tcp',
                        CreatedAt: '2026-09-25 22:00:00',
                      },
                    ];
                    stream.write(containers.map((c) => JSON.stringify(c)).join('\n') + '\n');
                    stream.exit(0);
                    stream.end();
                  } else if (cmd.includes('===UFW===')) {
                    stream.write(
                      '===UFW===\n' +
                      'Status: active\n\n' +
                      '     To                         Action      From\n' +
                      '     --                         ------      ----\n' +
                      '[ 1] 22/tcp                     ALLOW IN    Anywhere\n' +
                      '[ 2] 80/tcp                     ALLOW IN    Anywhere\n' +
                      '[ 3] 443/tcp                    ALLOW IN    Anywhere\n' +
                      '[ 4] 5900/tcp                   ALLOW IN    192.168.1.0/24\n' +
                      '===UFW_VERBOSE===\n' +
                      'Status: active\n' +
                      'Logging: on (low)\n' +
                      'Default: deny (incoming), allow (outgoing), disabled (routed)\n' +
                      '===PORTS===\n' +
                      'Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess\n' +
                      'tcp   LISTEN 0      128    0.0.0.0:22          0.0.0.0:*    users:(("sshd",pid=1234,fd=3))\n' +
                      'tcp   LISTEN 0      511    0.0.0.0:80          0.0.0.0:*    users:(("nginx",pid=2345,fd=6))\n' +
                      'tcp   LISTEN 0      511    0.0.0.0:443         0.0.0.0:*    users:(("nginx",pid=2345,fd=7))\n' +
                      'tcp   LISTEN 0      100    127.0.0.1:3001      0.0.0.0:*    users:(("node",pid=3456,fd=18))\n' +
                      '===SESSIONS===\n' +
                      'admin    pts/0    192.168.1.100    10:00   0.00s  w\n' +
                      '===FAILED_LOGINS===\n' +
                      'Sep 26 09:12:34 srv-node-01 sshd[4567]: Failed password for root from 185.220.101.5 port 41234 ssh2\n' +
                      'Sep 26 09:14:22 srv-node-01 sshd[4568]: Failed password for invalid user admin from 185.220.101.5 port 41235 ssh2\n' +
                      '===FAIL2BAN===\n' +
                      'Status\n' +
                      '|- Number of jail:      1\n' +
                      '`- Jail list:   sshd\n' +
                      '===SSHD_CONFIG===\n' +
                      'permitrootlogin prohibit-password\n' +
                      'passwordauthentication yes\n' +
                      'pubkeyauthentication yes\n' +
                      'port 22\n' +
                      '===UPDATES===\n' +
                      '3;1\n'
                    );
                    stream.exit(0);
                    stream.end();
                  } else if (cmd.includes('===NET_DEV===')) {
                    stream.write(
                      '===NET_DEV===\n' +
                      'Inter-|   Receive                                                |  Transmit\n' +
                      ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
                      '    lo: 48920194   32401    0    0    0     0          0         0 48920194   32401    0    0    0     0       0          0\n' +
                      '  eth0: 894520194 1250912    0    0    0     0          0      1240 452019401 1045201    0    0    0     0       0          0\n' +
                      '===IP_BRIEF===\n' +
                      'lo               UP             127.0.0.1/8 ::1/128 \n' +
                      'eth0             UP             192.168.1.100/24 fe80::a00:27ff:fe4e:66a1/64 \n' +
                      '===SOCKETS===\n' +
                      'Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\n' +
                      'tcp   ESTAB  0      0      192.168.1.100:22    192.168.1.50:54321\n' +
                      'tcp   ESTAB  0      0      192.168.1.100:443   203.0.113.195:48912\n' +
                      'tcp   TIME-WAIT 0   0      192.168.1.100:80    198.51.100.22:33214\n' +
                      'tcp   LISTEN 0      128    0.0.0.0:22          0.0.0.0:*\n' +
                      'tcp   LISTEN 0      511    0.0.0.0:80          0.0.0.0:*\n' +
                      'tcp   LISTEN 0      511    0.0.0.0:443         0.0.0.0:*\n' +
                      '===ROUTES===\n' +
                      'default via 192.168.1.1 dev eth0 proto dhcp metric 100\n' +
                      '192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100\n' +
                      '===RESOLV===\n' +
                      'nameserver 1.1.1.1\n' +
                      'nameserver 8.8.8.8\n'
                    );
                    stream.exit(0);
                    stream.end();
                  } else if (cmd.includes('ping')) {
                    stream.write(
                      'PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.\n' +
                      '64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms\n' +
                      '64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=11.8 ms\n' +
                      '64 bytes from 1.1.1.1: icmp_seq=3 ttl=57 time=12.1 ms\n' +
                      '--- 1.1.1.1 ping statistics ---\n' +
                      '3 packets transmitted, 3 received, 0% packet loss, time 2003ms\n' +
                      'rtt min/avg/max/mdev = 11.820/12.106/12.412/0.243 ms\n'
                    );
                    stream.exit(0);
                    stream.end();
                  } else {
                    stream.write(`Executed: ${cmd}\n`);
                    stream.exit(0);
                    stream.end();
                  }
                });

                // SFTP support
                session.on('sftp', (acceptSftp) => {
                  const sftp = acceptSftp();
                  // Basic mock SFTP responder
                  sftp.on('OPEN', (reqid, _filename, _flags) => {
                    sftp.handle(reqid, Buffer.from('mock-handle-1'));
                  });
                  sftp.on('READDIR', (reqid, _handle) => {
                    // Send sample directory contents
                    const entries: any[] = [
                      {
                        filename: 'var',
                        longname: 'drwxr-xr-x 2 root root 4096 Sep 26 09:00 var',
                        attrs: { mode: 0o040755, size: 4096, mtime: Math.floor(Date.now() / 1000), atime: Math.floor(Date.now() / 1000), uid: 0, gid: 0 },
                      },
                      {
                        filename: 'etc',
                        longname: 'drwxr-xr-x 2 root root 4096 Sep 26 09:00 etc',
                        attrs: { mode: 0o040755, size: 4096, mtime: Math.floor(Date.now() / 1000), atime: Math.floor(Date.now() / 1000), uid: 0, gid: 0 },
                      },
                      {
                        filename: 'app.config.json',
                        longname: '-rw-r--r-- 1 admin admin 1248 Sep 26 09:15 app.config.json',
                        attrs: { mode: 0o100644, size: 1248, mtime: Math.floor(Date.now() / 1000), atime: Math.floor(Date.now() / 1000), uid: 1000, gid: 1000 },
                      },
                      {
                        filename: 'server.log',
                        longname: '-rw-r--r-- 1 admin admin 28940 Sep 26 10:20 server.log',
                        attrs: { mode: 0o100644, size: 28940, mtime: Math.floor(Date.now() / 1000), atime: Math.floor(Date.now() / 1000), uid: 1000, gid: 1000 },
                      },
                    ];
                    sftp.name(reqid, entries);
                  });
                  sftp.on('CLOSE', (reqid) => {
                    sftp.status(reqid, 0); // SSH_FX_OK
                  });
                });
              });
            });
        }
      );

      this.server.on('error', (err: any) => {
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[MockSSH] Test SSH/SFTP server listening on 0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleShellCommand(cmd: string, stream: ServerChannel) {
    if (!cmd) return;
    if (cmd === 'clear') {
      stream.write('\x1b[2J\x1b[H');
    } else if (cmd === 'whoami') {
      stream.write('admin\r\n');
    } else if (cmd === 'uname -a') {
      stream.write('Linux local-test 6.8.0-generic #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\r\n');
    } else if (cmd === 'ls' || cmd === 'ls -la') {
      stream.write('total 36\r\ndrwxr-xr-x 4 admin admin 4096 Sep 26 09:00 .\r\ndrwxr-xr-x 3 root  root  4096 Sep 26 08:00 ..\r\n-rw-r--r-- 1 admin admin 1248 Sep 26 09:15 app.config.json\r\n-rw-r--r-- 1 admin admin 28940 Sep 26 10:20 server.log\r\n');
    } else if (cmd === 'docker ps') {
      stream.write('CONTAINER ID   IMAGE                      COMMAND                  CREATED        STATUS        PORTS                  NAMES\r\na1b2c3d4e5f6   server-console/web:latest  "/entrypoint.sh"         4 hours ago    Up 4 hours    0.0.0.0:80->80/tcp     server-console-web\r\nf6e5d4c3b2a1   redis:7-alpine             "docker-entrypoint.s…"   12 hours ago   Up 12 hours   6379/tcp               redis-cache\r\n');
    } else {
      stream.write(`bash: ${cmd}: command executed on local-test\r\n`);
    }
  }
}

import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';
import {
  ServerNetworkOverview,
  NetworkInterfaceStats,
  SocketConnection,
  NetworkConnectionStats,
  NetworkRoutingInfo,
  PingResult,
  DnsLookupResult,
  PortProbeResult,
} from '@server-console/shared';

export class NetworkService {
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private buildNetworkScript(): string {
    return `
echo "===NET_DEV==="
cat /proc/net/dev 2>/dev/null || echo ""

echo "===IP_BRIEF==="
ip -br addr 2>/dev/null || ip addr 2>/dev/null || echo ""

echo "===SOCKETS==="
(ss -ant 2>/dev/null || netstat -ant 2>/dev/null) | head -n 150 || echo ""

echo "===ROUTES==="
ip route 2>/dev/null || route -n 2>/dev/null || echo ""

echo "===RESOLV==="
grep nameserver /etc/resolv.conf 2>/dev/null || echo ""
`;
  }

  async getNetworkOverview(creds: InternalServerCredentials): Promise<ServerNetworkOverview> {
    try {
      const output = await sshService.executeCommand(creds, this.buildNetworkScript(), 10000);
      return this.parseNetworkOutput(creds.server.id, output);
    } catch (err: any) {
      return {
        serverId: creds.server.id,
        timestamp: new Date().toISOString(),
        isAvailable: false,
        interfaces: [],
        connectionStats: {
          total: 0,
          established: 0,
          listen: 0,
          timeWait: 0,
          closeWait: 0,
          other: 0,
          topRemoteIps: [],
        },
        connections: [],
        routing: {
          dnsServers: [],
          routes: [],
        },
        error: `Could not retrieve network telemetry: ${err.message}`,
      };
    }
  }

  private parseNetworkOutput(serverId: string, raw: string): ServerNetworkOverview {
    const sections: Record<string, string> = {};
    let currentSection = '';

    for (const line of raw.split('\n')) {
      const match = line.match(/^===([A-Z_]+)===/);
      if (match) {
        currentSection = match[1];
        sections[currentSection] = '';
      } else if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    // 1. Parse /proc/net/dev
    const netDevRaw = sections['NET_DEV'] || '';
    const interfacesMap: Record<string, Partial<NetworkInterfaceStats>> = {};

    for (const line of netDevRaw.split('\n')) {
      if (!line.includes(':')) continue;
      const [ifNamePart, statsPart] = line.split(':');
      const ifName = ifNamePart.trim();
      const fields = statsPart.trim().split(/\s+/).map((v) => parseInt(v, 10) || 0);

      if (fields.length >= 16) {
        // [rxBytes, rxPackets, rxErrors, rxDropped, ..., txBytes, txPackets, txErrors, txDropped]
        const rxBytes = fields[0];
        const rxPackets = fields[1];
        const rxErrors = fields[2];
        const rxDropped = fields[3];
        const txBytes = fields[8];
        const txPackets = fields[9];
        const txErrors = fields[10];
        const txDropped = fields[11];

        interfacesMap[ifName] = {
          name: ifName,
          rxBytes,
          rxPackets,
          rxErrors,
          rxDropped,
          txBytes,
          txPackets,
          txErrors,
          txDropped,
          rxFormatted: this.formatBytes(rxBytes),
          txFormatted: this.formatBytes(txBytes),
          status: 'UP',
        };
      }
    }

    // 2. Parse IP Addresses (ip -br addr or ip addr)
    const ipBriefRaw = sections['IP_BRIEF'] || '';
    for (const line of ipBriefRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      const ifName = parts[0];

      if (interfacesMap[ifName]) {
        const stateStr = (parts[1] || '').toUpperCase();
        if (stateStr === 'UP' || stateStr === 'DOWN') {
          interfacesMap[ifName].status = stateStr as 'UP' | 'DOWN';
        }

        // Search for IPv4 and IPv6
        for (let i = 2; i < parts.length; i++) {
          const val = parts[i];
          if (val.includes('.') && val.includes('/') && !interfacesMap[ifName].ipAddress) {
            interfacesMap[ifName].ipAddress = val;
          } else if (val.includes(':') && val.includes('/') && !interfacesMap[ifName].ip6Address) {
            interfacesMap[ifName].ip6Address = val;
          }
        }
      }
    }

    const interfaces: NetworkInterfaceStats[] = Object.values(interfacesMap).map((item) => ({
      name: item.name || 'unknown',
      ipAddress: item.ipAddress,
      ip6Address: item.ip6Address,
      macAddress: item.macAddress,
      status: item.status || 'UNKNOWN',
      mtu: item.mtu,
      rxBytes: item.rxBytes || 0,
      rxPackets: item.rxPackets || 0,
      rxErrors: item.rxErrors || 0,
      rxDropped: item.rxDropped || 0,
      txBytes: item.txBytes || 0,
      txPackets: item.txPackets || 0,
      txErrors: item.txErrors || 0,
      txDropped: item.txDropped || 0,
      rxFormatted: item.rxFormatted || '0 B',
      txFormatted: item.txFormatted || '0 B',
    }));

    // 3. Parse Socket Connections (ss -ant or netstat -ant)
    const socketsRaw = sections['SOCKETS'] || '';
    const connections: SocketConnection[] = [];
    let established = 0;
    let listen = 0;
    let timeWait = 0;
    let closeWait = 0;
    let other = 0;
    const remoteIpCounts: Record<string, number> = {};

    for (const line of socketsRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('State') || trimmed.startsWith('Active') || trimmed.startsWith('Proto')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        let stateRaw = parts[0].toUpperCase();
        let local = parts[3];
        let remote = parts[4];

        // Netstat layout vs ss layout
        if (stateRaw === 'TCP' || stateRaw === 'UDP') {
          stateRaw = (parts[parts.length - 1] || 'UNKNOWN').toUpperCase();
          local = parts[3];
          remote = parts[4];
        }

        let state: SocketConnection['state'] = 'UNKNOWN';
        if (stateRaw.includes('ESTAB')) {
          state = 'ESTABLISHED';
          established++;
        } else if (stateRaw.includes('LISTEN')) {
          state = 'LISTEN';
          listen++;
        } else if (stateRaw.includes('TIME-WAIT') || stateRaw.includes('TIME_WAIT')) {
          state = 'TIME_WAIT';
          timeWait++;
        } else if (stateRaw.includes('CLOSE-WAIT') || stateRaw.includes('CLOSE_WAIT')) {
          state = 'CLOSE_WAIT';
          closeWait++;
        } else if (stateRaw.includes('SYN-SENT') || stateRaw.includes('SYN_SENT')) {
          state = 'SYN_SENT';
          other++;
        } else {
          other++;
        }

        if (local && remote && remote.includes(':')) {
          const lColon = local.lastIndexOf(':');
          const rColon = remote.lastIndexOf(':');
          const localAddr = local.slice(0, lColon);
          const localPort = parseInt(local.slice(lColon + 1), 10) || 0;
          const remoteAddr = remote.slice(0, rColon);
          const remotePort = parseInt(remote.slice(rColon + 1), 10) || 0;

          if (remoteAddr && remoteAddr !== '*' && remoteAddr !== '0.0.0.0' && remoteAddr !== '::' && remoteAddr !== '127.0.0.1') {
            remoteIpCounts[remoteAddr] = (remoteIpCounts[remoteAddr] || 0) + 1;
          }

          if (connections.length < 80) {
            connections.push({
              protocol: 'tcp',
              state,
              localAddress: localAddr,
              localPort,
              remoteAddress: remoteAddr,
              remotePort,
            });
          }
        }
      }
    }

    const topRemoteIps = Object.entries(remoteIpCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const connectionStats: NetworkConnectionStats = {
      total: established + listen + timeWait + closeWait + other,
      established,
      listen,
      timeWait,
      closeWait,
      other,
      topRemoteIps,
    };

    // 4. Parse Routing & DNS
    const routesRaw = sections['ROUTES'] || '';
    const routes: string[] = [];
    let defaultGateway: string | undefined;
    let defaultInterface: string | undefined;

    for (const rLine of routesRaw.split('\n')) {
      const t = rLine.trim();
      if (!t) continue;
      routes.push(t);

      const gwMatch = t.match(/default via ([^\s]+)(?: dev ([^\s]+))?/);
      if (gwMatch) {
        defaultGateway = gwMatch[1];
        defaultInterface = gwMatch[2];
      }
    }

    const resolvRaw = sections['RESOLV'] || '';
    const dnsServers: string[] = [];
    for (const dLine of resolvRaw.split('\n')) {
      const match = dLine.trim().match(/nameserver\s+([^\s]+)/);
      if (match && !dnsServers.includes(match[1])) {
        dnsServers.push(match[1]);
      }
    }

    const routing: NetworkRoutingInfo = {
      defaultGateway,
      defaultInterface,
      dnsServers,
      routes: routes.slice(0, 15),
    };

    return {
      serverId,
      timestamp: new Date().toISOString(),
      isAvailable: true,
      interfaces,
      connectionStats,
      connections,
      routing,
    };
  }

  /**
   * Diagnostic: Ping remote host
   */
  async pingTarget(creds: InternalServerCredentials, host: string, count = 3): Promise<PingResult> {
    const cleanHost = host.trim().replace(/[^a-zA-Z0-9.-]/g, '');
    if (!cleanHost) throw new Error('Invalid host target');

    const cmd = `ping -c ${count} -W 2 ${cleanHost} 2>&1`;
    try {
      const output = await sshService.executeCommand(creds, cmd, 8000);
      const lossMatch = output.match(/(\d+)%\s+packet loss/i);
      const rttMatch = output.match(/rtt min\/avg\/max\/mdev = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)/i);

      return {
        host: cleanHost,
        transmitted: count,
        received: lossMatch ? Math.round(count * (1 - parseInt(lossMatch[1], 10) / 100)) : count,
        lossPercent: lossMatch ? parseInt(lossMatch[1], 10) : 0,
        minMs: rttMatch ? parseFloat(rttMatch[1]) : undefined,
        avgMs: rttMatch ? parseFloat(rttMatch[2]) : undefined,
        maxMs: rttMatch ? parseFloat(rttMatch[3]) : undefined,
        rawOutput: output.trim(),
        success: lossMatch ? parseInt(lossMatch[1], 10) < 100 : true,
      };
    } catch (err: any) {
      return {
        host: cleanHost,
        transmitted: count,
        received: 0,
        lossPercent: 100,
        rawOutput: err.message || 'Ping failed',
        success: false,
      };
    }
  }

  /**
   * Diagnostic: DNS lookup
   */
  async lookupDns(creds: InternalServerCredentials, host: string): Promise<DnsLookupResult> {
    const cleanHost = host.trim().replace(/[^a-zA-Z0-9.-]/g, '');
    if (!cleanHost) throw new Error('Invalid host target');

    const cmd = `(getent hosts ${cleanHost} 2>/dev/null || nslookup ${cleanHost} 2>/dev/null) 2>&1`;
    try {
      const output = await sshService.executeCommand(creds, cmd, 8000);
      const records: string[] = [];

      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] && (parts[0].includes('.') || parts[0].includes(':'))) {
          records.push(parts[0]);
        }
      }

      return {
        host: cleanHost,
        records: Array.from(new Set(records)),
        rawOutput: output.trim(),
        success: records.length > 0 || output.includes(cleanHost),
      };
    } catch (err: any) {
      return {
        host: cleanHost,
        records: [],
        rawOutput: err.message || 'DNS lookup failed',
        success: false,
      };
    }
  }

  /**
   * Diagnostic: Probe outbound port reachability
   */
  async probePort(creds: InternalServerCredentials, host: string, port: number): Promise<PortProbeResult> {
    const cleanHost = host.trim().replace(/[^a-zA-Z0-9.-]/g, '');
    if (!cleanHost || port <= 0 || port > 65535) throw new Error('Invalid host or port');

    // Use python or bash tcp pseudo-device to probe port
    const cmd = `python3 -c "import socket; s = socket.socket(); s.settimeout(3); s.connect(('${cleanHost}', ${port})); s.close(); print('OPEN')" 2>/dev/null || (nc -z -w 3 ${cleanHost} ${port} 2>/dev/null && echo 'OPEN') || echo 'CLOSED'`;

    try {
      const output = (await sshService.executeCommand(creds, cmd, 6000)).trim();
      const isOpen = output.includes('OPEN');

      return {
        host: cleanHost,
        port,
        isOpen,
        message: isOpen ? `Port ${port} on ${cleanHost} is reachable.` : `Port ${port} on ${cleanHost} is unreachable or connection timed out.`,
      };
    } catch (err: any) {
      return {
        host: cleanHost,
        port,
        isOpen: false,
        message: `Probe failed: ${err.message}`,
      };
    }
  }
}

export const networkService = new NetworkService();

import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';
import { ServerMonitoringData, DiskUsage, ProcessInfo } from '@server-console/shared';

export class MonitorService {
  async getMetrics(creds: InternalServerCredentials): Promise<ServerMonitoringData> {
    const serverId = creds.server.id;
    const now = new Date().toISOString();

    try {
      // Execute a compound command gathering standard Linux metrics in one roundtrip
      const compoundCmd = `
        echo "===UPTIME==="
        cat /proc/uptime 2>/dev/null || uptime
        echo "===LOADAVG==="
        cat /proc/loadavg 2>/dev/null || true
        echo "===FREE==="
        free -b 2>/dev/null || true
        echo "===DF==="
        df -k -P 2>/dev/null || true
        echo "===PS==="
        ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu 2>/dev/null | head -n 11 || true
      `;

      const output = await sshService.executeCommand(creds, compoundCmd, 8000);
      return this.parseOutput(serverId, now, output);
    } catch (err: any) {
      return {
        serverId,
        timestamp: now,
        isAvailable: false,
        error: `Monitoring unavailable: ${err.message}`,
      };
    }
  }

  private parseOutput(serverId: string, timestamp: string, output: string): ServerMonitoringData {
    const sections: Record<string, string> = {};
    let currentSection = '';

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('===') && trimmed.endsWith('===')) {
        currentSection = trimmed.replace(/===/g, '');
        sections[currentSection] = '';
      } else if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    // 1. Uptime
    let uptimeSeconds = 0;
    let uptimeFormatted = 'Unknown';
    if (sections['UPTIME']) {
      const parts = sections['UPTIME'].trim().split(/\s+/);
      const secs = parseFloat(parts[0]);
      if (!isNaN(secs)) {
        uptimeSeconds = Math.floor(secs);
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        uptimeFormatted = `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m`;
      }
    }

    // 2. Load Average
    let loadAverage: [number, number, number] = [0, 0, 0];
    if (sections['LOADAVG']) {
      const parts = sections['LOADAVG'].trim().split(/\s+/);
      if (parts.length >= 3) {
        loadAverage = [
          parseFloat(parts[0]) || 0,
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
        ];
      }
    }

    // 3. Memory
    let memory: ServerMonitoringData['memory'] = undefined;
    if (sections['FREE']) {
      const lines = sections['FREE'].trim().split('\n');
      for (const line of lines) {
        if (line.toLowerCase().startsWith('mem:')) {
          const parts = line.split(/\s+/);
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const free = parseInt(parts[3], 10);
          if (total > 0) {
            const usagePercent = Math.round((used / total) * 100);
            memory = {
              totalBytes: total,
              usedBytes: used,
              freeBytes: free,
              usagePercent,
              totalFormatted: this.formatBytes(total),
              usedFormatted: this.formatBytes(used),
            };
          }
        }
      }
    }

    // 4. Disks
    const disks: DiskUsage[] = [];
    if (sections['DF']) {
      const lines = sections['DF'].trim().split('\n');
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 6) {
          const filesystem = parts[0];
          // Skip tempfs or loops unless desired
          if (filesystem.startsWith('/dev/') || parts[5] === '/') {
            const totalKb = parseInt(parts[1], 10) * 1024;
            const usedKb = parseInt(parts[2], 10) * 1024;
            const availKb = parseInt(parts[3], 10) * 1024;
            const percentStr = parts[4].replace('%', '');
            const usagePercent = parseInt(percentStr, 10) || 0;
            disks.push({
              filesystem,
              size: this.formatBytes(totalKb),
              used: this.formatBytes(usedKb),
              available: this.formatBytes(availKb),
              usagePercent,
              mount: parts[5],
            });
          }
        }
      }
    }

    // 5. Processes
    const topProcesses: ProcessInfo[] = [];
    let cpuSum = 0;
    if (sections['PS']) {
      const lines = sections['PS'].trim().split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          const pid = parseInt(parts[0], 10);
          const user = parts[1];
          const cpu = parseFloat(parts[2]) || 0;
          const mem = parseFloat(parts[3]) || 0;
          const command = parts.slice(4).join(' ');
          cpuSum += cpu;
          topProcesses.push({ pid, user, cpu, mem, command });
        }
      }
    }

    // Estimate CPU usage percentage from loadavg or top processes
    const cpuUsagePercent = Math.min(Math.round(cpuSum), 100);

    return {
      serverId,
      timestamp,
      isAvailable: true,
      uptimeSeconds,
      uptimeFormatted,
      loadAverage,
      cpuUsagePercent,
      memory,
      disks,
      topProcesses,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

export const monitorService = new MonitorService();

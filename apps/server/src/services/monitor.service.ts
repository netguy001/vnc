import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';
import { ServerMonitoringData, DiskUsage, ProcessInfo } from '@server-console/shared';

export class MonitorService {
  async getMetrics(creds: InternalServerCredentials): Promise<ServerMonitoringData> {
    const serverId = creds.server.id;
    const now = new Date().toISOString();

    try {
      // Execute a compound command gathering standard Linux metrics in one roundtrip.
      // CPU usage is computed from two /proc/stat samples 200ms apart (the standard
      // technique) rather than summing `ps %cpu`, which double-counts across cores
      // and includes `ps` sampling itself as a process.
      const compoundCmd = `
        echo "===UPTIME==="
        cat /proc/uptime 2>/dev/null || uptime
        echo "===LOADAVG==="
        cat /proc/loadavg 2>/dev/null || true
        echo "===STAT1==="
        head -n 1 /proc/stat 2>/dev/null || true
        sleep 0.2
        echo "===STAT2==="
        head -n 1 /proc/stat 2>/dev/null || true
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

    // 5. Processes (for the top-processes table only — not used for headline CPU%,
    // since %cpu summed across processes double-counts on multi-core systems)
    const topProcesses: ProcessInfo[] = [];
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
          topProcesses.push({ pid, user, cpu, mem, command });
        }
      }
    }

    // 6. System-wide CPU usage from two /proc/stat samples (standard delta technique).
    // Falls back to 0 if either sample is missing/malformed.
    let cpuUsagePercent = 0;
    const stat1 = this.parseProcStatLine(sections['STAT1']);
    const stat2 = this.parseProcStatLine(sections['STAT2']);
    if (stat1 && stat2) {
      const totalDelta = stat2.total - stat1.total;
      const idleDelta = stat2.idle - stat1.idle;
      if (totalDelta > 0) {
        cpuUsagePercent = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
      }
    }

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

  /**
   * Parses a line like "cpu  123 0 456 7890 12 0 3 0 0 0" (user, nice, system, idle,
   * iowait, irq, softirq, steal, guest, guest_nice) into total and idle jiffies.
   */
  private parseProcStatLine(section: string | undefined): { total: number; idle: number } | null {
    if (!section) return null;
    const line = section.trim().split('\n')[0];
    if (!line || !line.startsWith('cpu')) return null;
    const values = line.trim().split(/\s+/).slice(1).map((v) => parseInt(v, 10) || 0);
    if (values.length < 4) return null;
    const idle = values[3] + (values[4] || 0); // idle + iowait
    const total = values.reduce((sum, v) => sum + v, 0);
    return { total, idle };
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

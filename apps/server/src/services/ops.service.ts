import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';
import { shQuote, badRequest } from './shell.js';

export { shQuote };

const UNIT_RE = /^[A-Za-z0-9@._:-]{1,120}$/;
const CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const LOG_PATH_RE = /^\/var\/log\/[A-Za-z0-9@._\-/]{1,200}$/;

export const SERVICE_ACTIONS = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'] as const;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];
export const CONTAINER_ACTIONS = ['start', 'stop', 'restart'] as const;
export type ContainerAction = (typeof CONTAINER_ACTIONS)[number];

export interface ServiceInfo {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
  enabled: string;
}

export interface LogQuery {
  source: string; // file:/var/log/x | journal | unit:<name> | docker:<name>
  lines?: number;
  filter?: string;
  since?: string; // e.g. 15m, 2h, 1d
}

// Mutating commands escalate with passwordless sudo when not root.
const SUDO_PREAMBLE = 'S=""; [ "$(id -u)" -ne 0 ] && S="sudo -n";';

export class OpsService {
  validateUnit(name: string): string {
    if (!UNIT_RE.test(name) || name.includes('..')) throw badRequest('Invalid service name');
    return name;
  }

  validateContainer(name: string): string {
    if (!CONTAINER_RE.test(name)) throw badRequest('Invalid container name');
    return name;
  }

  async listServices(creds: InternalServerCredentials): Promise<{ available: boolean; services: ServiceInfo[]; error?: string }> {
    try {
      const out = await sshService.executeCommand(
        creds,
        'command -v systemctl >/dev/null 2>&1 || { echo NO_SYSTEMD; exit 0; }; ' +
          'echo ===UNITS===; systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null; ' +
          'echo ===FILES===; systemctl list-unit-files --type=service --no-legend --no-pager 2>/dev/null',
        15000
      );
      if (out.includes('NO_SYSTEMD')) return { available: false, services: [], error: 'systemd is not available on this server' };

      const [unitsPart, filesPart = ''] = out.split('===FILES===');
      const enabledMap = new Map<string, string>();
      for (const line of filesPart.split('\n')) {
        const [unit, state] = line.trim().split(/\s+/);
        if (unit && state) enabledMap.set(unit, state);
      }

      const services: ServiceInfo[] = [];
      for (const line of unitsPart.replace('===UNITS===', '').split('\n')) {
        const m = line.trim().match(/^(\S+\.service)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
        if (!m) continue;
        services.push({ name: m[1], load: m[2], active: m[3], sub: m[4], description: m[5], enabled: enabledMap.get(m[1]) ?? 'unknown' });
      }
      services.sort((a, b) => Number(b.active === 'active') - Number(a.active === 'active') || a.name.localeCompare(b.name));
      return { available: true, services };
    } catch (err: any) {
      return { available: false, services: [], error: err.message };
    }
  }

  async serviceAction(creds: InternalServerCredentials, unit: string, action: ServiceAction): Promise<string> {
    if (!SERVICE_ACTIONS.includes(action)) throw badRequest('Unsupported action');
    const name = shQuote(this.validateUnit(unit));
    const out = await sshService.runScript(
      creds,
      `${SUDO_PREAMBLE}\n$S systemctl ${action} ${name} 2>&1; code=$?\n$S systemctl is-active ${name} 2>&1 | head -1; exit $code`,
      30000
    );
    if (out.code !== 0) throw Object.assign(new Error(out.stdout.trim() || out.stderr.trim() || `systemctl ${action} failed`), { statusCode: 502 });
    return out.stdout.trim();
  }

  async containerAction(creds: InternalServerCredentials, container: string, action: ContainerAction): Promise<string> {
    if (!CONTAINER_ACTIONS.includes(action)) throw badRequest('Unsupported action');
    const name = shQuote(this.validateContainer(container));
    const out = await sshService.runScript(creds, `${SUDO_PREAMBLE}\n$S docker ${action} ${name} 2>&1`, 60000);
    if (out.code !== 0) throw Object.assign(new Error(out.stdout.trim() || out.stderr.trim() || `docker ${action} failed`), { statusCode: 502 });
    return out.stdout.trim();
  }

  async listLogSources(creds: InternalServerCredentials): Promise<string[]> {
    const out = await sshService.executeCommand(
      creds,
      'find /var/log -maxdepth 2 -type f -readable -size +0 ! -name "*.gz" ! -name "*.[0-9]" ! -name "*.xz" ! -name "*.old" 2>/dev/null | sort | head -150',
      10000
    ).catch(() => '');
    return out.split('\n').map((l) => l.trim()).filter((l) => LOG_PATH_RE.test(l) && !l.includes('..'));
  }

  /** Builds the remote shell command for a log query; every user-controlled piece is validated or quoted. */
  buildLogCommand(q: LogQuery): string {
    const n = Math.min(Math.max(Math.floor(q.lines || 200), 10), 2000);
    const filter = (q.filter || '').slice(0, 200);
    // -F: literal match, so user input can never be interpreted as a regex or shell syntax.
    const grep = filter ? ` | grep -a -i -F -e ${shQuote(filter)}` : '';
    let cmd: string;

    if (q.source.startsWith('file:')) {
      const file = q.source.slice(5);
      if (!LOG_PATH_RE.test(file) || file.includes('..')) throw badRequest('Only files under /var/log are readable');
      cmd = filter ? `tail -n 20000 ${shQuote(file)}${grep} | tail -n ${n}` : `tail -n ${n} ${shQuote(file)}`;
    } else if (q.source === 'journal' || q.source.startsWith('unit:')) {
      const unitArg = q.source.startsWith('unit:') ? ` -u ${shQuote(this.validateUnit(q.source.slice(5)))}` : '';
      let since = '';
      if (q.since) {
        const m = q.since.match(/^(\d{1,3})([smhd])$/);
        if (!m) throw badRequest('since must look like 15m, 2h or 1d');
        const unit = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' }[m[2] as 's' | 'm' | 'h' | 'd'];
        since = ` --since ${shQuote(`${m[1]} ${unit} ago`)}`;
      }
      cmd = `journalctl --no-pager -o short-iso${unitArg}${since} -n ${filter ? 20000 : n}${grep}${filter ? ` | tail -n ${n}` : ''}`;
    } else if (q.source.startsWith('docker:')) {
      const name = this.validateContainer(q.source.slice(7));
      cmd = `docker logs --timestamps --tail ${filter ? 20000 : n} ${shQuote(name)} 2>&1${grep}${filter ? ` | tail -n ${n}` : ''}`;
    } else {
      throw badRequest('Unknown log source');
    }

    return `${SUDO_PREAMBLE}\n${cmd.replace(/^(tail|journalctl|docker)/, '$S $1')} | tail -c 400000`;
  }

  async readLogs(creds: InternalServerCredentials, q: LogQuery): Promise<{ lines: string[]; truncated: boolean }> {
    const out = await sshService.runScript(creds, this.buildLogCommand(q), 30000);
    const text = out.stdout || out.stderr;
    return { lines: text.split('\n').filter((l, i, a) => l.length > 0 || i < a.length - 1), truncated: out.truncated };
  }
}

export const opsService = new OpsService();

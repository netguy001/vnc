import { InternalServerCredentials } from './server.service.js';
import { shQuote, badRequest } from './shell.js';
import { sshService } from './ssh.service.js';
import {
  ServerSecurityOverview,
  FirewallStatus,
  FirewallRule,
  ListeningPort,
  FailedLoginAttempt,
  ActiveUserSession,
  Fail2BanStatus,
  Fail2BanJail,
  SshHardeningPosture,
  SecurityAuditItem,
  AddFirewallRuleInput,
} from '@server-console/shared';

export class SecurityService {
  /**
   * Consolidated script to fetch all security data in a single SSH session
   */
  private buildDiscoveryScript(): string {
    return `
echo "===UFW==="
which ufw >/dev/null 2>&1 && ufw status numbered 2>/dev/null || echo "UFW_NOT_FOUND"

echo "===UFW_VERBOSE==="
which ufw >/dev/null 2>&1 && ufw status verbose 2>/dev/null || echo ""

echo "===PORTS==="
(ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null) | head -n 40 || echo ""

echo "===SESSIONS==="
(w -h 2>/dev/null || who 2>/dev/null) | head -n 20 || echo ""

echo "===FAILED_LOGINS==="
(journalctl -u ssh -n 40 --no-pager 2>/dev/null | grep -i "Failed" | tail -n 15) || (grep -i "Failed password" /var/log/auth.log 2>/dev/null | tail -n 15) || echo ""

echo "===FAIL2BAN==="
which fail2ban-client >/dev/null 2>&1 && fail2ban-client status 2>/dev/null || echo "FAIL2BAN_NOT_FOUND"

echo "===SSHD_CONFIG==="
(sshd -T 2>/dev/null | grep -E "^(permitrootlogin|passwordauthentication|pubkeyauthentication|port) ") || (grep -E "^(PermitRootLogin|PasswordAuthentication|Port)" /etc/ssh/sshd_config 2>/dev/null) || echo ""

echo "===UPDATES==="
if [ -f /usr/lib/update-notifier/apt-check ]; then
  /usr/lib/update-notifier/apt-check 2>/dev/null || echo "0;0"
else
  echo "0;0"
fi
`;
  }

  async getSecurityOverview(creds: InternalServerCredentials): Promise<ServerSecurityOverview> {
    try {
      const output = await sshService.executeCommand(creds, this.buildDiscoveryScript(), 12000);
      return this.parseDiscoveryOutput(creds.server.id, output, creds.server.sshPort);
    } catch (err: any) {
      return {
        serverId: creds.server.id,
        timestamp: new Date().toISOString(),
        isAvailable: false,
        securityScore: 0,
        firewall: {
          isInstalled: false,
          type: 'none',
          status: 'unknown',
          defaultIncoming: 'unknown',
          defaultOutgoing: 'unknown',
          rules: [],
        },
        listeningPorts: [],
        failedLogins: [],
        activeSessions: [],
        fail2ban: {
          isInstalled: false,
          isRunning: false,
          jails: [],
        },
        sshHardening: {
          permitRootLogin: 'unknown',
          passwordAuthentication: 'unknown',
          pubkeyAuthentication: 'unknown',
          sshPort: creds.server.sshPort || 22,
          isStandardPort: (creds.server.sshPort || 22) === 22,
        },
        auditItems: [],
        error: `Could not retrieve security telemetry: ${err.message}`,
      };
    }
  }

  private parseDiscoveryOutput(serverId: string, raw: string, configuredSshPort = 22): ServerSecurityOverview {
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

    // 1. Parse UFW Firewall
    const ufwRaw = (sections['UFW'] || '').trim();
    const ufwVerbose = (sections['UFW_VERBOSE'] || '').trim();
    const firewall: FirewallStatus = {
      isInstalled: !ufwRaw.includes('UFW_NOT_FOUND'),
      type: ufwRaw.includes('UFW_NOT_FOUND') ? 'none' : 'ufw',
      status: ufwRaw.toLowerCase().includes('status: active') ? 'active' : 'inactive',
      defaultIncoming: 'deny (default)',
      defaultOutgoing: 'allow (default)',
      rules: [],
    };

    // Extract default policies if available
    const defaultMatch = ufwVerbose.match(/Default:\s+deny\s+\(incoming\),\s+allow\s+\(outgoing\)/i);
    if (defaultMatch) {
      firewall.defaultIncoming = 'deny';
      firewall.defaultOutgoing = 'allow';
    }

    // Parse numbered rules: [ 1] 22/tcp ALLOW IN Anywhere
    const ruleLines = ufwRaw.split('\n');
    for (const rLine of ruleLines) {
      const ruleMatch = rLine.match(/\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY|LIMIT|REJECT)\s+(?:IN\s+)?(.+)/i);
      if (ruleMatch) {
        const actionStr = ruleMatch[3].toUpperCase();
        firewall.rules.push({
          number: parseInt(ruleMatch[1], 10),
          to: ruleMatch[2].trim(),
          action: actionStr as FirewallRule['action'],
          from: ruleMatch[4].trim(),
          raw: rLine.trim(),
        });
      }
    }

    // 2. Parse Listening Ports
    const portsRaw = (sections['PORTS'] || '').trim();
    const listeningPorts: ListeningPort[] = [];
    const portLines = portsRaw.split('\n');

    for (const pLine of portLines) {
      const trimmed = pLine.trim();
      if (!trimmed || trimmed.startsWith('Netid') || trimmed.startsWith('Proto') || trimmed.startsWith('Active')) continue;

      const parts = trimmed.split(/\s+/);
      const isTcp = parts[0]?.toLowerCase().includes('tcp');
      const isUdp = parts[0]?.toLowerCase().includes('udp');
      if (!isTcp && !isUdp) continue;

      // Address field (ss has 5th field as Local Address:Port, netstat has 4th)
      let localAddr = '';
      let procStr = '';

      for (const part of parts) {
        if (
          !localAddr &&
          part.includes(':') &&
          !part.endsWith(':*') &&
          (part.startsWith('0.0.0.0:') ||
            part.startsWith('127.0.0.1:') ||
            part.startsWith('*:') ||
            part.startsWith('[::]:') ||
            part.startsWith(':::') ||
            part.startsWith('::1:') ||
            part.startsWith(':::*') === false)
        ) {
          localAddr = part;
        } else if (part.includes('users:') || part.includes('pid=') || part.includes('/')) {
          procStr = part;
        }
      }

      if (!localAddr) continue;

      const lastColon = localAddr.lastIndexOf(':');
      const portNum = parseInt(localAddr.slice(lastColon + 1), 10);
      const bindIp = localAddr.slice(0, lastColon);

      if (isNaN(portNum) || portNum <= 0) continue;

      const isPublic = bindIp === '0.0.0.0' || bindIp === '*' || bindIp === '::' || bindIp === '[::]';

      let process = 'unknown';
      let pid: number | undefined;

      const procMatch = procStr.match(/"([^"]+)",pid=(\d+)/) || procStr.match(/(\d+)\/([^\s]+)/);
      if (procMatch) {
        if (procMatch[1] && !isNaN(parseInt(procMatch[1], 10))) {
          pid = parseInt(procMatch[1], 10);
          process = procMatch[2] || 'unknown';
        } else {
          process = procMatch[1] || 'unknown';
          pid = procMatch[2] ? parseInt(procMatch[2], 10) : undefined;
        }
      }

      // Avoid duplicates
      if (!listeningPorts.some((p) => p.port === portNum && p.protocol === (isTcp ? 'tcp' : 'udp'))) {
        listeningPorts.push({
          protocol: isTcp ? 'tcp' : 'udp',
          port: portNum,
          bindAddress: bindIp || '*',
          process,
          pid,
          isPublic,
        });
      }
    }

    // 3. Parse Active Sessions
    const sessionsRaw = (sections['SESSIONS'] || '').trim();
    const activeSessions: ActiveUserSession[] = [];
    for (const sLine of sessionsRaw.split('\n')) {
      if (!sLine.trim()) continue;
      const parts = sLine.trim().split(/\s+/);
      if (parts.length >= 3) {
        activeSessions.push({
          user: parts[0],
          tty: parts[1],
          fromIp: parts[2] || 'local',
          loginTime: parts[3] || 'recent',
          command: parts.slice(4).join(' ') || undefined,
        });
      }
    }

    // 4. Parse Failed Logins
    const failedRaw = (sections['FAILED_LOGINS'] || '').trim();
    const failedLogins: FailedLoginAttempt[] = [];
    for (const fLine of failedRaw.split('\n')) {
      if (!fLine.trim()) continue;
      // Example: Sep 26 08:30:12 srv-node-01 sshd[1234]: Failed password for root from 192.168.1.50 port 54321 ssh2
      const ipMatch = fLine.match(/from\s+([0-9a-fA-F:.]+)/);
      const userMatch = fLine.match(/for\s+(?:invalid\s+user\s+)?([^\s]+)\s+from/);
      const timeMatch = fLine.match(/^([A-Za-z]+\s+\d+\s+[\d:]+)/);

      if (ipMatch) {
        failedLogins.push({
          timestamp: timeMatch ? timeMatch[1] : 'Recent',
          user: userMatch ? userMatch[1] : 'unknown',
          ip: ipMatch[1],
          method: 'password',
        });
      }
    }

    // 5. Parse Fail2Ban
    const f2bRaw = (sections['FAIL2BAN'] || '').trim();
    const fail2ban: Fail2BanStatus = {
      isInstalled: !f2bRaw.includes('FAIL2BAN_NOT_FOUND'),
      isRunning: f2bRaw.includes('Number of jail'),
      jails: [],
    };

    if (fail2ban.isRunning) {
      const jailMatch = f2bRaw.match(/Jail list:\s+(.+)/);
      if (jailMatch) {
        const jailNames = jailMatch[1].split(',').map((j) => j.trim()).filter(Boolean);
        for (const name of jailNames) {
          fail2ban.jails.push({
            name,
            currentlyFailed: 0,
            totalFailed: 0,
            currentlyBanned: 0,
            totalBanned: 0,
            bannedIps: [],
          });
        }
      }
    }

    // 6. Parse SSHD Hardening
    const sshdRaw = (sections['SSHD_CONFIG'] || '').toLowerCase();
    const permitRootMatch = sshdRaw.match(/permitrootlogin\s+([^\s]+)/);
    const passAuthMatch = sshdRaw.match(/passwordauthentication\s+([^\s]+)/);
    const pubkeyMatch = sshdRaw.match(/pubkeyauthentication\s+([^\s]+)/);
    const portMatch = sshdRaw.match(/port\s+(\d+)/);

    const sshPort = portMatch ? parseInt(portMatch[1], 10) : configuredSshPort;
    const sshHardening: SshHardeningPosture = {
      permitRootLogin: (permitRootMatch ? permitRootMatch[1] : 'yes') as any,
      passwordAuthentication: (passAuthMatch ? passAuthMatch[1] : 'yes') as any,
      pubkeyAuthentication: (pubkeyMatch ? pubkeyMatch[1] : 'yes') as any,
      sshPort,
      isStandardPort: sshPort === 22,
    };

    // 7. Parse Pending Updates
    const updatesRaw = (sections['UPDATES'] || '').trim();
    let pendingUpdatesCount = 0;
    let securityUpdatesCount = 0;
    const updateParts = updatesRaw.split(';');
    if (updateParts.length >= 2) {
      pendingUpdatesCount = parseInt(updateParts[0], 10) || 0;
      securityUpdatesCount = parseInt(updateParts[1], 10) || 0;
    }

    // 8. Calculate Security Posture Score & Audit Checklist
    const auditItems: SecurityAuditItem[] = [];
    let score = 100;

    // Item A: Firewall
    if (firewall.status === 'active') {
      auditItems.push({
        id: 'firewall',
        title: 'Network Firewall Active',
        status: 'pass',
        description: `UFW is active with ${firewall.rules.length} configured rule${firewall.rules.length === 1 ? '' : 's'}.`,
      });
    } else {
      score -= 25;
      auditItems.push({
        id: 'firewall',
        title: 'Firewall Inactive or Disabled',
        status: 'fail',
        description: 'No active packet firewall detected. All open ports are exposed to public scan.',
        recommendation: 'Enable UFW and allow only essential ports (SSH, HTTP/S).',
      });
    }

    // Item B: Root Login
    if (sshHardening.permitRootLogin === 'no' || sshHardening.permitRootLogin === 'prohibit-password') {
      auditItems.push({
        id: 'root_login',
        title: 'Root Login Protected',
        status: 'pass',
        description: `Direct root login is restricted (${sshHardening.permitRootLogin}).`,
      });
    } else {
      score -= 20;
      auditItems.push({
        id: 'root_login',
        title: 'Direct Root Password Login Enabled',
        status: 'warn',
        description: 'PermitRootLogin is set to "yes". Attackers can target the root user directly.',
        recommendation: 'Set PermitRootLogin to "prohibit-password" or create a dedicated sudo user.',
      });
    }

    // Item C: Password Authentication
    if (sshHardening.passwordAuthentication === 'no') {
      auditItems.push({
        id: 'ssh_keys',
        title: 'Key-Based Authentication Enforced',
        status: 'pass',
        description: 'Password authentication is disabled; only cryptographic SSH keys are accepted.',
      });
    } else {
      score -= 15;
      auditItems.push({
        id: 'ssh_keys',
        title: 'Password Authentication Allowed',
        status: 'warn',
        description: 'SSH permits password logins, which are susceptible to dictionary and brute force attacks.',
        recommendation: 'Set up SSH public keys and disable password authentication.',
      });
    }

    // Item D: Intrusion Prevention (Fail2ban)
    if (fail2ban.isRunning) {
      auditItems.push({
        id: 'fail2ban',
        title: 'Fail2ban Intrusion Prevention Active',
        status: 'pass',
        description: `Fail2ban daemon is running with ${fail2ban.jails.length} active jail(s).`,
      });
    } else {
      score -= 15;
      auditItems.push({
        id: 'fail2ban',
        title: 'No Brute-Force Protection (Fail2ban)',
        status: 'warn',
        description: 'Fail2ban is not actively running to ban abusive IP addresses automatically.',
        recommendation: 'Install and enable fail2ban (`apt install fail2ban`).',
      });
    }

    // Item E: Pending Security Updates
    if (securityUpdatesCount > 0) {
      score -= 15;
      auditItems.push({
        id: 'updates',
        title: `${securityUpdatesCount} Pending Security Update${securityUpdatesCount === 1 ? '' : 's'}`,
        status: 'warn',
        description: `${pendingUpdatesCount} total packages can be upgraded, including ${securityUpdatesCount} critical security fixes.`,
        recommendation: 'Run `apt update && apt upgrade` to apply latest CVE patches.',
      });
    } else {
      auditItems.push({
        id: 'updates',
        title: 'Security Packages Up to Date',
        status: 'pass',
        description: 'No unapplied security vulnerability updates detected.',
      });
    }

    // Item F: SSH Port
    if (sshHardening.isStandardPort) {
      score -= 5;
      auditItems.push({
        id: 'ssh_port',
        title: 'Standard SSH Port (22)',
        status: 'info',
        description: 'SSH is listening on standard port 22, the most frequently probed port on the internet.',
        recommendation: 'Consider changing SSH to a non-standard port (e.g. 2222) to eliminate automated bot noise.',
      });
    } else {
      auditItems.push({
        id: 'ssh_port',
        title: `Non-Standard SSH Port (${sshHardening.sshPort})`,
        status: 'pass',
        description: `SSH port is obfuscated on custom port ${sshHardening.sshPort}.`,
      });
    }

    return {
      serverId,
      timestamp: new Date().toISOString(),
      isAvailable: true,
      securityScore: Math.max(0, Math.min(100, score)),
      firewall,
      listeningPorts,
      failedLogins: failedLogins.slice(0, 15),
      activeSessions,
      fail2ban,
      sshHardening,
      auditItems,
      pendingUpdatesCount,
      securityUpdatesCount,
    };
  }

  /**
   * Adds a new UFW firewall rule
   */
  async addFirewallRule(creds: InternalServerCredentials, input: AddFirewallRuleInput): Promise<{ success: boolean; message: string }> {
    const { port, protocol = 'any', action = 'allow', fromIp, comment } = input;

    // Validate port / service
    const cleanPort = String(port ?? '').trim();
    if (!cleanPort) {
      throw badRequest('Port is required (e.g. 22 or 80 or 8000:8080)');
    }
    // Every value below ends up in a root shell command, so each is validated against a strict pattern.
    if (!/^(\d{1,5}(:\d{1,5})?|[A-Za-z0-9_-]{1,30})$/.test(cleanPort)) throw badRequest('Invalid port or service name');
    if (!['allow', 'deny', 'reject', 'limit'].includes(String(action))) throw badRequest('Invalid action');
    if (!['any', 'tcp', 'udp'].includes(String(protocol))) throw badRequest('Invalid protocol');
    const source = fromIp?.trim();
    if (source && source !== 'any' && source !== 'Anywhere' && !/^[0-9a-fA-F:.]{2,45}(\/\d{1,3})?$/.test(source)) {
      throw badRequest('Invalid source address');
    }

    let cmd = `ufw ${action}`;

    if (source && source !== 'any' && source !== 'Anywhere') {
      cmd += ` from ${source} to any port ${cleanPort}`;
      if (protocol && protocol !== 'any') {
        cmd += ` proto ${protocol}`;
      }
    } else {
      cmd += ` ${cleanPort}`;
      if (protocol && protocol !== 'any') {
        cmd += `/${protocol}`;
      }
    }

    if (comment && comment.trim()) {
      cmd += ` comment ${shQuote(comment.trim().slice(0, 100))}`;
    }

    const output = await sshService.executeCommand(creds, cmd, 10000);
    return {
      success: true,
      message: output.trim() || `Rule ${action} ${cleanPort} applied successfully.`,
    };
  }

  /**
   * Deletes a UFW rule by rule number
   */
  async deleteFirewallRule(creds: InternalServerCredentials, ruleNumber: number): Promise<{ success: boolean; message: string }> {
    if (!Number.isInteger(ruleNumber) || ruleNumber <= 0) {
      throw badRequest('Valid rule number is required');
    }

    const cmd = `echo "y" | ufw delete ${ruleNumber}`;
    const output = await sshService.executeCommand(creds, cmd, 10000);
    return {
      success: true,
      message: output.trim() || `Rule #${ruleNumber} deleted successfully.`,
    };
  }

  /**
   * Toggles UFW firewall state (enable/disable)
   */
  async toggleFirewall(creds: InternalServerCredentials, enable: boolean): Promise<{ success: boolean; message: string }> {
    const cmd = enable ? 'ufw --force enable' : 'ufw disable';
    const output = await sshService.executeCommand(creds, cmd, 10000);
    return {
      success: true,
      message: output.trim() || `Firewall ${enable ? 'enabled' : 'disabled'} successfully.`,
    };
  }

  /**
   * Unbans an IP address via Fail2ban
   */
  async unbanIp(creds: InternalServerCredentials, jail: string, ip: string): Promise<{ success: boolean; message: string }> {
    if (!ip || !jail) {
      throw badRequest('Both jail name and IP address are required');
    }
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(jail.trim())) throw badRequest('Invalid jail name');
    if (!/^[0-9a-fA-F:.]{2,45}$/.test(ip.trim())) throw badRequest('Invalid IP address');
    const cmd = `fail2ban-client set ${shQuote(jail.trim())} unbanip ${shQuote(ip.trim())}`;
    const output = await sshService.executeCommand(creds, cmd, 10000);
    return {
      success: true,
      message: output.trim() || `IP ${ip} unbanned from jail ${jail}.`,
    };
  }
}

export const securityService = new SecurityService();

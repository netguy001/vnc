import { describe, it, expect } from 'vitest';
import { opsService, shQuote } from '../services/ops.service.js';

describe('shQuote', () => {
  it('neutralises quotes and shell metacharacters', () => {
    expect(shQuote('plain')).toBe("'plain'");
    expect(shQuote("it's")).toBe(`'it'\\''s'`);
    expect(shQuote('$(rm -rf /); `id`')).toBe("'$(rm -rf /); `id`'");
  });
});

describe('ops input validation', () => {
  it('accepts normal unit and container names', () => {
    expect(opsService.validateUnit('nginx.service')).toBe('nginx.service');
    expect(opsService.validateUnit('getty@tty1.service')).toBe('getty@tty1.service');
    expect(opsService.validateContainer('my-app_1')).toBe('my-app_1');
  });

  it('rejects injection attempts in unit and container names', () => {
    for (const bad of ['nginx; rm -rf /', 'a b', '$(id)', 'x`id`', '../etc', 'a|b', 'a\\b', '']) {
      expect(() => opsService.validateUnit(bad)).toThrow();
    }
    for (const bad of ['-rf', 'a;b', 'a b', '$(id)', '']) {
      expect(() => opsService.validateContainer(bad)).toThrow();
    }
  });
});

describe('log command builder', () => {
  it('only reads files under /var/log', () => {
    expect(() => opsService.buildLogCommand({ source: 'file:/etc/shadow' })).toThrow(/var\/log/);
    expect(() => opsService.buildLogCommand({ source: 'file:/var/log/../../etc/shadow' })).toThrow();
    expect(opsService.buildLogCommand({ source: 'file:/var/log/syslog', lines: 50 })).toContain("tail -n 50 '/var/log/syslog'");
  });

  it('quotes the filter and treats it as a literal string', () => {
    const cmd = opsService.buildLogCommand({ source: 'file:/var/log/syslog', filter: "x'; reboot; echo '" });
    expect(cmd).toContain('grep -a -i -F -e');
    expect(cmd).toContain(`'x'\\''; reboot; echo '\\'''`);
    expect(cmd).not.toMatch(/; reboot; echo '\s*\|/);
  });

  it('clamps the line count and validates the since window', () => {
    expect(opsService.buildLogCommand({ source: 'journal', lines: 999999 })).toContain('-n 2000');
    expect(() => opsService.buildLogCommand({ source: 'journal', since: '1h; reboot' })).toThrow(/since/);
    expect(opsService.buildLogCommand({ source: 'unit:nginx.service', since: '15m' })).toContain("--since '15 minutes ago'");
  });

  it('rejects unknown sources', () => {
    expect(() => opsService.buildLogCommand({ source: 'bash:whoami' })).toThrow(/Unknown log source/);
  });
});

import { securityService } from '../services/security.service.js';
import { networkService } from '../services/network.service.js';

// These reject before any SSH connection is attempted, so fake credentials are enough.
const creds = { server: { id: 'x', host: '127.0.0.1', sshPort: 1, sshUsername: 'u', authMethod: 'password' } } as any;

describe('shell-injection guards', () => {
  it('rejects malicious firewall rule fields', async () => {
    await expect(securityService.addFirewallRule(creds, { port: '22; reboot' } as any)).rejects.toThrow(/Invalid port/);
    await expect(securityService.addFirewallRule(creds, { port: '22', action: 'allow; id' } as any)).rejects.toThrow(/Invalid action/);
    await expect(securityService.addFirewallRule(creds, { port: '22', protocol: 'tcp;id' } as any)).rejects.toThrow(/Invalid protocol/);
    await expect(securityService.addFirewallRule(creds, { port: '22', fromIp: '1.1.1.1; id' } as any)).rejects.toThrow(/Invalid source/);
  });

  it('rejects malicious fail2ban unban arguments and rule numbers', async () => {
    await expect(securityService.unbanIp(creds, 'sshd; reboot', '1.2.3.4')).rejects.toThrow(/Invalid jail/);
    await expect(securityService.unbanIp(creds, 'sshd', '1.2.3.4 && id')).rejects.toThrow(/Invalid IP/);
    await expect(securityService.deleteFirewallRule(creds, '1; reboot' as any)).rejects.toThrow(/rule number/);
  });

  it('rejects non-numeric ports in the port probe', async () => {
    await expect(networkService.probePort(creds, 'example.com', '80; id' as any)).rejects.toThrow(/Invalid host or port/);
  });
});

import { redactSecrets } from '../services/ai.service.js';

describe('redactSecrets', () => {
  it('strips common secret shapes before context leaves the machine', () => {
    const out = redactSecrets(
      [
        'db password=hunter2 failed',
        'Authorization: Bearer abcdefghijklmnop12345',
        'api_key: "sk-abcdefghijklmnopqrstuv"',
        '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----',
        'normal line: service started in 3ms',
      ].join('\n')
    );
    expect(out).not.toMatch(/hunter2|abcdefghijklmnop12345|sk-abcdef|AAAA/);
    expect(out).toContain('normal line: service started in 3ms');
    expect(out).toContain('[REDACTED');
  });
});

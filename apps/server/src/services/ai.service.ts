import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_CONTEXT_CHARS = 14_000;

// Read-only snapshot of a server's health. Nothing here modifies the machine.
const CONTEXT_SCRIPT = `
echo "## uptime & load"; uptime
echo "## memory"; free -h 2>/dev/null | head -4
echo "## disk"; df -h -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | head -12
echo "## top processes by CPU"; ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu 2>/dev/null | head -8
echo "## top processes by memory"; ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%mem 2>/dev/null | head -6
echo "## failed systemd units"; systemctl --failed --no-legend --no-pager 2>/dev/null | head -10
echo "## recent error-level journal entries"; journalctl -p err -n 40 --no-pager -o short-iso 2>/dev/null | cut -c1-260
echo "## docker containers"; docker ps -a --format '{{.Names}}  {{.Status}}' 2>/dev/null | head -15
`;

/** Removes obvious secrets before anything leaves the machine. Best-effort, not a guarantee. */
export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(authorization|bearer)\b[:=\s]+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [REDACTED]')
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2[REDACTED]')
    .replace(/\b(sk|pk|ghp|gho|xox[bpas]|AKIA)[-_A-Za-z0-9]{12,}\b/g, '[REDACTED KEY]');
}

export class AiService {
  get enabled(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  get model(): string {
    return process.env.AI_MODEL || 'claude-sonnet-5-5';
  }

  private lastCall = new Map<string, number>();

  async diagnose(
    creds: InternalServerCredentials,
    userKey: string,
    question?: string
  ): Promise<{ answer: string; model: string; contextChars: number }> {
    if (!this.enabled) throw Object.assign(new Error('The AI assistant is not configured. Set ANTHROPIC_API_KEY in .env and restart.'), { statusCode: 503 });

    const last = this.lastCall.get(userKey) ?? 0;
    if (Date.now() - last < 8000) throw Object.assign(new Error('Please wait a few seconds between AI requests.'), { statusCode: 429 });
    this.lastCall.set(userKey, Date.now());

    const snap = await sshService.runScript(creds, CONTEXT_SCRIPT, 25000);
    const context = redactSecrets(snap.stdout).slice(0, MAX_CONTEXT_CHARS);

    const system =
      'You are a senior Linux/SRE assistant inside a server management console. You are given a read-only ' +
      'snapshot of one server. Diagnose problems concisely: lead with the most likely cause, cite the specific ' +
      'evidence from the snapshot, then list concrete next steps. When you suggest shell commands, put them in ' +
      'fenced code blocks and prefer read-only investigation commands first; clearly label anything that changes ' +
      'state or restarts something. You cannot run commands yourself - the operator will. If the snapshot shows ' +
      'nothing wrong, say so plainly instead of inventing issues. Keep it under 350 words.';

    const userMsg =
      `Server: ${creds.server.name}\n\n<snapshot>\n${context}\n</snapshot>\n\n` +
      (question?.trim() ? `Operator question: ${question.trim().slice(0, 500)}` : 'Give a health assessment and flag anything that needs attention.');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1200, system, messages: [{ role: 'user', content: userMsg }] }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw Object.assign(new Error(`AI request failed (HTTP ${res.status}). ${res.status === 401 ? 'Check ANTHROPIC_API_KEY.' : detail}`), { statusCode: 502 });
    }
    const data: any = await res.json();
    const answer = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return { answer: answer || 'The model returned an empty response.', model: this.model, contextChars: context.length };
  }
}

export const aiService = new AiService();

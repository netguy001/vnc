import {
  UserDTO,
  ServerDTO,
  ServerCreateInput,
  ServerUpdateInput,
  ConnectionTestResult,
  ServerMonitoringData,
  DockerContainerInfo,
  SftpFileItem,
  AuditLogDTO,
  ServerSecurityOverview,
  AddFirewallRuleInput,
  ServerNetworkOverview,
  PingResult,
  DnsLookupResult,
  PortProbeResult,
  UserPreferencesDTO,
  UpdatePreferencesInput,
  CommandSnippetDTO,
  CommandSnippetCreateInput,
  ChangePasswordInput,
  UpdateAccountInput,
  MetricSample,
  AlertRuleDTO,
  AlertEventDTO,
  NotificationChannelDTO,
} from '@server-console/shared';

const API_BASE = '/api';

export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  permissions: string[];
  granted: string[];
  enabled: boolean;
  active: boolean;
  needsApproval: boolean;
  error?: string;
  hasUi: boolean;
}

export interface ApiTokenDTO {
  id: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface UserRow extends UserDTO {
  totpEnabled: boolean;
}

/** Error carrying the HTTP status and parsed JSON body of a failed API call. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any = null) {
    super(message);
  }
}

export interface ServiceInfo {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
  enabled: string;
}

export interface RunResultItem {
  serverId: string;
  serverName: string;
  ok: boolean;
  exitCode: number | null;
  output: string;
  error?: string;
  durationMs: number;
}

export interface RunbookDTO {
  id: string;
  name: string;
  description: string;
  script: string;
  targetType: 'all' | 'group' | 'servers';
  targetValue: string;
  intervalMin: number | null;
  timeoutSec: number;
  createdAt: string;
}

export interface RunbookRunDTO {
  id: string;
  runbookId: string;
  runbookName: string;
  trigger: 'manual' | 'schedule';
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  results: RunResultItem[];
}

export interface PluginUiEntry {
  pluginId: string;
  pluginName: string;
  pages: Array<{ id: string; title: string; icon?: string; widgets: any[] }>;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('sc_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('sc_token', token);
    } else {
      localStorage.removeItem('sc_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.body !== undefined && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      let errorData: any = null;
      try {
        errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
      }
      throw new ApiError(errorMessage, response.status, errorData);
    }

    return response.json();
  }

  // Auth
  async getSetupStatus(): Promise<{ initialized: boolean }> {
    return this.request('/auth/setup-status');
  }

  async setup(data: { username: string; password: string; email?: string }): Promise<{ user: UserDTO; token: string }> {
    const res = await this.request<{ user: UserDTO; token: string }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.token);
    return res;
  }

  async login(data: { username: string; password: string; totp?: string }): Promise<{ user: UserDTO; token: string }> {
    const res = await this.request<{ user: UserDTO; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.token);
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getMe(): Promise<{ user: UserDTO }> {
    return this.request('/auth/me');
  }

  // Servers
  async getServers(): Promise<{ servers: ServerDTO[] }> {
    return this.request('/servers');
  }

  async getServer(id: string): Promise<{ server: ServerDTO }> {
    return this.request(`/servers/${id}`);
  }

  async createServer(data: ServerCreateInput): Promise<{ server: ServerDTO }> {
    return this.request('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: ServerUpdateInput): Promise<{ server: ServerDTO }> {
    return this.request(`/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}`, {
      method: 'DELETE',
    });
  }

  async testConnection(id: string): Promise<{ result: ConnectionTestResult }> {
    return this.request(`/servers/${id}/test-connection`, {
      method: 'POST',
    });
  }

  async getMonitoring(id: string, fresh = false): Promise<{ metrics: ServerMonitoringData }> {
    return this.request(`/servers/${id}/monitor${fresh ? '?fresh=1' : ''}`);
  }

  async getMetricHistory(id: string, range: string): Promise<{ range: string; intervalSec: number; samples: MetricSample[] }> {
    return this.request(`/servers/${id}/metrics/history?range=${encodeURIComponent(range)}`);
  }

  // Alerts & notifications
  async getAlertRules(): Promise<{ rules: AlertRuleDTO[] }> {
    return this.request('/alerts/rules');
  }
  async createAlertRule(data: Omit<AlertRuleDTO, 'id' | 'createdAt' | 'isEnabled'>): Promise<{ rule: AlertRuleDTO }> {
    return this.request('/alerts/rules', { method: 'POST', body: JSON.stringify(data) });
  }
  async setAlertRuleEnabled(id: string, isEnabled: boolean): Promise<{ success: boolean }> {
    return this.request(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify({ isEnabled }) });
  }
  async deleteAlertRule(id: string): Promise<{ success: boolean }> {
    return this.request(`/alerts/rules/${id}`, { method: 'DELETE' });
  }
  async getAlertEvents(limit = 50): Promise<{ events: AlertEventDTO[] }> {
    return this.request(`/alerts/events?limit=${limit}`);
  }
  async getChannels(): Promise<{ channels: NotificationChannelDTO[]; drivers: Array<{ type: string; label: string; fields: string[] }> }> {
    return this.request('/alerts/channels');
  }
  async createChannel(data: { name: string; type: string; config: Record<string, string> }): Promise<{ channel: NotificationChannelDTO }> {
    return this.request('/alerts/channels', { method: 'POST', body: JSON.stringify(data) });
  }
  async setChannelEnabled(id: string, isEnabled: boolean): Promise<{ success: boolean }> {
    return this.request(`/alerts/channels/${id}`, { method: 'PUT', body: JSON.stringify({ isEnabled }) });
  }
  async deleteChannel(id: string): Promise<{ success: boolean }> {
    return this.request(`/alerts/channels/${id}`, { method: 'DELETE' });
  }
  async testChannel(id: string): Promise<{ success: boolean }> {
    return this.request(`/alerts/channels/${id}/test`, { method: 'POST' });
  }

  // AI assistant
  async getAiStatus(): Promise<{ enabled: boolean; model: string }> {
    return this.request('/ai/status');
  }
  async aiDiagnose(id: string, question?: string): Promise<{ answer: string; model: string; contextChars: number }> {
    return this.request(`/servers/${id}/ai/diagnose`, { method: 'POST', body: JSON.stringify({ question }) });
  }

  // Users, tokens, 2FA
  async getUsers(): Promise<{ users: UserRow[] }> {
    return this.request('/auth/users');
  }
  async createUser(data: { username: string; password: string; role: string }): Promise<{ user: UserDTO }> {
    return this.request('/auth/users', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateUser(id: string, data: { role?: string; newPassword?: string; disableTotp?: boolean }): Promise<{ success: boolean }> {
    return this.request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteUser(id: string): Promise<{ success: boolean }> {
    return this.request(`/auth/users/${id}`, { method: 'DELETE' });
  }
  async getTokens(): Promise<{ tokens: ApiTokenDTO[] }> {
    return this.request('/auth/tokens');
  }
  async createToken(data: { name: string; role?: string; expiresInDays?: number | null }): Promise<{ token: string; info: ApiTokenDTO }> {
    return this.request('/auth/tokens', { method: 'POST', body: JSON.stringify(data) });
  }
  async revokeToken(id: string): Promise<{ success: boolean }> {
    return this.request(`/auth/tokens/${id}`, { method: 'DELETE' });
  }
  async getTotpStatus(): Promise<{ enabled: boolean }> {
    return this.request('/auth/totp');
  }
  async beginTotpSetup(): Promise<{ secret: string; uri: string }> {
    return this.request('/auth/totp/setup', { method: 'POST' });
  }
  async enableTotp(code: string): Promise<{ success: boolean; recoveryCodes: string[] }> {
    return this.request('/auth/totp/enable', { method: 'POST', body: JSON.stringify({ code }) });
  }
  async disableTotp(password: string): Promise<{ success: boolean }> {
    return this.request('/auth/totp/disable', { method: 'POST', body: JSON.stringify({ password }) });
  }

  // Services, logs, docker actions
  async getServices(id: string): Promise<{ available: boolean; services: ServiceInfo[]; error?: string }> {
    return this.request(`/servers/${id}/services`);
  }
  async serviceAction(id: string, name: string, action: string): Promise<{ success: boolean; state: string }> {
    return this.request(`/servers/${id}/services/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
  }
  async getLogSources(id: string): Promise<{ files: string[] }> {
    return this.request(`/servers/${id}/logs/sources`);
  }
  async getLogs(id: string, params: { source: string; lines?: number; filter?: string; since?: string }): Promise<{ lines: string[]; truncated: boolean }> {
    const q = new URLSearchParams({ source: params.source });
    if (params.lines) q.set('lines', String(params.lines));
    if (params.filter) q.set('filter', params.filter);
    if (params.since) q.set('since', params.since);
    return this.request(`/servers/${id}/logs?${q.toString()}`);
  }
  async containerAction(id: string, container: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/docker/containers/${encodeURIComponent(container)}/${action}`, { method: 'POST' });
  }

  // Runbooks
  async getRunbooks(): Promise<{ runbooks: RunbookDTO[]; runs: RunbookRunDTO[] }> {
    return this.request('/runbooks');
  }
  async createRunbook(data: Omit<RunbookDTO, 'id' | 'createdAt'>): Promise<{ runbook: RunbookDTO }> {
    return this.request('/runbooks', { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteRunbook(id: string): Promise<{ success: boolean }> {
    return this.request(`/runbooks/${id}`, { method: 'DELETE' });
  }
  async runRunbook(id: string): Promise<{ run: RunbookRunDTO }> {
    return this.request(`/runbooks/${id}/run`, { method: 'POST' });
  }

  // Plugins
  async getPlugins(): Promise<{ plugins: PluginStatus[] }> {
    return this.request('/plugin-manager');
  }
  async getPluginUi(): Promise<{ plugins: PluginUiEntry[] }> {
    return this.request('/plugin-manager/ui');
  }
  async enablePlugin(id: string, approvedPermissions: string[]): Promise<{ success: boolean }> {
    return this.request(`/plugin-manager/${id}/enable`, { method: 'POST', body: JSON.stringify({ approvedPermissions }) });
  }
  async disablePlugin(id: string): Promise<{ success: boolean }> {
    return this.request(`/plugin-manager/${id}/disable`, { method: 'POST' });
  }
  async pluginRequest<T = any>(pluginId: string, method: string, path: string, body?: unknown): Promise<T> {
    return this.request(`/plugins/${pluginId}/${path.replace(/^\//, '')}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  // SSH host key pinning
  async getHostKey(id: string): Promise<{ hostKey: { fingerprint: string; firstSeenAt: string } | null }> {
    return this.request(`/servers/${id}/host-key`);
  }
  async resetHostKey(id: string): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/host-key/reset`, { method: 'POST' });
  }

  async getDockerContainers(id: string): Promise<{ isAvailable: boolean; containers: DockerContainerInfo[]; error?: string }> {
    return this.request(`/servers/${id}/docker`);
  }

  // Security & Firewall
  async getSecurityOverview(id: string): Promise<{ security: ServerSecurityOverview }> {
    return this.request(`/servers/${id}/security`);
  }

  async addFirewallRule(id: string, rule: AddFirewallRuleInput): Promise<{ success: boolean; message: string }> {
    return this.request(`/servers/${id}/firewall/rule`, {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async deleteFirewallRule(id: string, ruleNumber: number): Promise<{ success: boolean; message: string }> {
    return this.request(`/servers/${id}/firewall/rule/${ruleNumber}`, {
      method: 'DELETE',
    });
  }

  async toggleFirewall(id: string, enable: boolean): Promise<{ success: boolean; message: string }> {
    return this.request(`/servers/${id}/firewall/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enable }),
    });
  }

  async unbanIp(id: string, jail: string, ip: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/servers/${id}/security/unban`, {
      method: 'POST',
      body: JSON.stringify({ jail, ip }),
    });
  }

  // Network Monitoring & Diagnostics
  async getNetworkOverview(id: string): Promise<{ network: ServerNetworkOverview }> {
    return this.request(`/servers/${id}/network`);
  }

  async pingTarget(id: string, host: string, count = 4): Promise<{ result: PingResult }> {
    return this.request(`/servers/${id}/network/ping`, {
      method: 'POST',
      body: JSON.stringify({ host, count }),
    });
  }

  async lookupDns(id: string, host: string): Promise<{ result: DnsLookupResult }> {
    return this.request(`/servers/${id}/network/dns`, {
      method: 'POST',
      body: JSON.stringify({ host }),
    });
  }

  async probePort(id: string, host: string, port: number): Promise<{ result: PortProbeResult }> {
    return this.request(`/servers/${id}/network/port-probe`, {
      method: 'POST',
      body: JSON.stringify({ host, port }),
    });
  }

  // SFTP
  async listFiles(id: string, path = '/'): Promise<{ currentPath: string; files: SftpFileItem[] }> {
    const query = new URLSearchParams({ path }).toString();
    return this.request(`/servers/${id}/files?${query}`);
  }

  getDownloadUrl(id: string, path: string): string {
    // Authenticated by the httpOnly session cookie; tokens are never put in URLs.
    return `${API_BASE}/servers/${id}/files/download?path=${encodeURIComponent(path)}`;
  }

  async uploadFile(id: string, targetDir: string, file: File): Promise<{ success: boolean; path: string }> {
    const formData = new FormData();
    formData.append('targetDir', targetDir);
    formData.append('file', file);

    return this.request(`/servers/${id}/files/upload`, {
      method: 'POST',
      body: formData,
    });
  }

  async readFileContent(id: string, path: string): Promise<{ path: string; content: string }> {
    const query = new URLSearchParams({ path }).toString();
    return this.request(`/servers/${id}/files/content?${query}`);
  }

  async writeFileContent(id: string, path: string, content: string): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/files/content`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    });
  }

  async mkdir(id: string, path: string): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  async renamePath(id: string, oldPath: string, newPath: string): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/files/rename`, {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    });
  }

  async deletePath(id: string, path: string, recursive = false): Promise<{ success: boolean }> {
    return this.request(`/servers/${id}/files`, {
      method: 'DELETE',
      body: JSON.stringify({ path, recursive }),
    });
  }

  // Audit Logs & Stats
  async getAuditLogs(limit = 100): Promise<{ logs: AuditLogDTO[] }> {
    return this.request(`/audit-logs?limit=${limit}`);
  }

  async getStats(): Promise<{
    totalServers: number;
    connected: number;
    disconnected: number;
    error: number;
    groups: string[];
  }> {
    return this.request('/stats');
  }

  async getVncCredentials(id: string): Promise<{ hasPassword: boolean; password: string | null; vncHost: string; vncPort: number }> {
    return this.request(`/servers/${id}/vnc-credentials`);
  }

  // Settings: Preferences
  async getPreferences(): Promise<{ preferences: UserPreferencesDTO }> {
    return this.request('/settings/preferences');
  }

  async updatePreferences(data: UpdatePreferencesInput): Promise<{ preferences: UserPreferencesDTO }> {
    return this.request('/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Settings: Account
  async updateAccount(data: UpdateAccountInput): Promise<{ user: UserDTO }> {
    return this.request('/settings/account', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changePassword(data: ChangePasswordInput): Promise<{ success: boolean }> {
    return this.request('/settings/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Settings: Command Snippets
  async getSnippets(serverId?: string): Promise<{ snippets: CommandSnippetDTO[] }> {
    return this.request(`/settings/snippets${serverId ? `?serverId=${serverId}` : ''}`);
  }

  async createSnippet(data: CommandSnippetCreateInput): Promise<{ snippet: CommandSnippetDTO }> {
    return this.request('/settings/snippets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteSnippet(id: string): Promise<{ success: boolean }> {
    return this.request(`/settings/snippets/${id}`, {
      method: 'DELETE',
    });
  }

  // Settings: Export / Import
  async exportServers(): Promise<any> {
    return this.request('/settings/export-servers');
  }

  async importServers(data: { servers: ServerCreateInput[] }): Promise<{ imported: number; errors: string[] }> {
    return this.request('/settings/import-servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async clearAuditLogs(): Promise<{ success: boolean; cleared: number }> {
    return this.request('/settings/audit-logs', {
      method: 'DELETE',
    });
  }

  // WebSocket URL helpers
  getVncWsUrl(id: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/servers/${id}/vnc`;
  }

  getTerminalWsUrl(id: string, cols = 80, rows = 24): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/servers/${id}/terminal?cols=${cols}&rows=${rows}`;
  }
}

export const api = new ApiClient();

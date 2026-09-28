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
} from '@server-console/shared';

const API_BASE = '/api';

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

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
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

  async login(data: { username: string; password: string }): Promise<{ user: UserDTO; token: string }> {
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

  async getMonitoring(id: string): Promise<{ metrics: ServerMonitoringData }> {
    return this.request(`/servers/${id}/monitor`);
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
    const token = this.token ? `&token=${encodeURIComponent(this.token)}` : '';
    return `${API_BASE}/servers/${id}/files/download?path=${encodeURIComponent(path)}${token}`;
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

  // WebSocket URL helpers
  getVncWsUrl(id: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    return `${protocol}//${host}/api/servers/${id}/vnc${tokenParam}`;
  }

  getTerminalWsUrl(id: string, cols = 80, rows = 24): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const tokenParam = this.token ? `&token=${encodeURIComponent(this.token)}` : '';
    return `${protocol}//${host}/api/servers/${id}/terminal?cols=${cols}&rows=${rows}${tokenParam}`;
  }
}

export const api = new ApiClient();

export type ServerAuthMethod = 'password' | 'privateKey';

export type ServerStatusType = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface UserDTO {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'operator' | 'viewer';
  createdAt: string;
}

export interface ServerDTO {
  id: string;
  name: string;
  host: string;
  sshPort: number;
  sshUsername: string;
  authMethod: ServerAuthMethod;
  hasSshPassword?: boolean;
  hasSshPrivateKey?: boolean;
  vncHost?: string;
  vncPort?: number;
  vncEnabled: boolean;
  hasVncPassword?: boolean;
  serverGroup?: string;
  description?: string;
  isEnabled: boolean;
  status: ServerStatusType;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerCreateInput {
  name: string;
  host: string;
  sshPort: number;
  sshUsername: string;
  authMethod: ServerAuthMethod;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  vncHost?: string;
  vncPort?: number;
  vncPassword?: string;
  vncEnabled?: boolean;
  serverGroup?: string;
  description?: string;
  isEnabled?: boolean;
}

export interface ServerUpdateInput extends Partial<ServerCreateInput> {}

export interface ConnectionTestResult {
  sshSuccess: boolean;
  sshMessage: string;
  vncSuccess: boolean;
  vncMessage: string;
  latencyMs?: number;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usagePercent: number;
  mount: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

export interface ServerMonitoringData {
  serverId: string;
  timestamp: string;
  isAvailable: boolean;
  error?: string;
  uptimeSeconds?: number;
  uptimeFormatted?: string;
  loadAverage?: [number, number, number];
  cpuUsagePercent?: number;
  memory?: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    totalFormatted: string;
    usedFormatted: string;
  };
  disks?: DiskUsage[];
  topProcesses?: ProcessInfo[];
}

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'unknown';
  ports?: string;
  created?: string;
  cpuUsage?: string;
  memoryUsage?: string;
}

export interface SftpFileItem {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  modifiedTime: string;
  permissions: string;
}

export interface AuditLogDTO {
  id: string;
  timestamp: string;
  userId?: string;
  username?: string;
  action: string;
  serverId?: string;
  serverName?: string;
  details?: string;
  success: boolean;
  ipAddress?: string;
}

export interface TerminalResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface FirewallRule {
  number?: number;
  to: string;
  action: 'ALLOW' | 'DENY' | 'LIMIT' | 'REJECT';
  from: string;
  comment?: string;
  raw?: string;
}

export interface FirewallStatus {
  isInstalled: boolean;
  type: 'ufw' | 'iptables' | 'none';
  status: 'active' | 'inactive' | 'unknown';
  defaultIncoming: string;
  defaultOutgoing: string;
  rules: FirewallRule[];
}

export interface ListeningPort {
  protocol: 'tcp' | 'udp';
  port: number;
  bindAddress: string;
  process: string;
  pid?: number;
  isPublic: boolean;
}

export interface FailedLoginAttempt {
  timestamp: string;
  user: string;
  ip: string;
  port?: string;
  method?: string;
}

export interface ActiveUserSession {
  user: string;
  tty: string;
  fromIp: string;
  loginTime: string;
  idle?: string;
  command?: string;
}

export interface Fail2BanJail {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
}

export interface Fail2BanStatus {
  isInstalled: boolean;
  isRunning: boolean;
  jails: Fail2BanJail[];
}

export interface SshHardeningPosture {
  permitRootLogin: 'yes' | 'no' | 'prohibit-password' | 'unknown';
  passwordAuthentication: 'yes' | 'no' | 'unknown';
  pubkeyAuthentication: 'yes' | 'no' | 'unknown';
  sshPort: number;
  isStandardPort: boolean;
}

export interface SecurityAuditItem {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  description: string;
  recommendation?: string;
}

export interface ServerSecurityOverview {
  serverId: string;
  timestamp: string;
  isAvailable: boolean;
  securityScore: number;
  firewall: FirewallStatus;
  listeningPorts: ListeningPort[];
  failedLogins: FailedLoginAttempt[];
  activeSessions: ActiveUserSession[];
  fail2ban: Fail2BanStatus;
  sshHardening: SshHardeningPosture;
  auditItems: SecurityAuditItem[];
  pendingUpdatesCount?: number;
  securityUpdatesCount?: number;
  error?: string;
}

export interface AddFirewallRuleInput {
  port: string;
  protocol?: 'tcp' | 'udp' | 'any';
  action: 'allow' | 'deny' | 'limit';
  fromIp?: string;
  comment?: string;
}

export interface NetworkInterfaceStats {
  name: string;
  ipAddress?: string;
  ip6Address?: string;
  macAddress?: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  mtu?: number;
  rxBytes: number;
  rxPackets: number;
  rxErrors: number;
  rxDropped: number;
  txBytes: number;
  txPackets: number;
  txErrors: number;
  txDropped: number;
  rxFormatted: string;
  txFormatted: string;
}

export interface SocketConnection {
  protocol: 'tcp' | 'udp';
  state: 'ESTABLISHED' | 'LISTEN' | 'TIME_WAIT' | 'CLOSE_WAIT' | 'SYN_SENT' | 'UNKNOWN';
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  process?: string;
}

export interface NetworkConnectionStats {
  total: number;
  established: number;
  listen: number;
  timeWait: number;
  closeWait: number;
  other: number;
  topRemoteIps: { ip: string; count: number }[];
}

export interface NetworkRoutingInfo {
  defaultGateway?: string;
  defaultInterface?: string;
  dnsServers: string[];
  routes: string[];
}

export interface ServerNetworkOverview {
  serverId: string;
  timestamp: string;
  isAvailable: boolean;
  interfaces: NetworkInterfaceStats[];
  connectionStats: NetworkConnectionStats;
  connections: SocketConnection[];
  routing: NetworkRoutingInfo;
  error?: string;
}

export interface PingResult {
  host: string;
  transmitted: number;
  received: number;
  lossPercent: number;
  minMs?: number;
  avgMs?: number;
  maxMs?: number;
  rawOutput: string;
  success: boolean;
}

export interface DnsLookupResult {
  host: string;
  records: string[];
  server?: string;
  latencyMs?: number;
  rawOutput: string;
  success: boolean;
}

export interface PortProbeResult {
  host: string;
  port: number;
  isOpen: boolean;
  latencyMs?: number;
  message: string;
}



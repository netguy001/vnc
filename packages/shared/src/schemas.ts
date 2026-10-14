import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  totp: z.string().max(20).optional(),
});

export const SetupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  email: z.string().email().optional(),
});

export const ServerCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  host: z.string().min(1, 'Host/IP is required').max(255),
  sshPort: z.number().int().min(1).max(65535).default(22),
  sshUsername: z.string().min(1, 'SSH Username is required').max(100),
  authMethod: z.enum(['password', 'privateKey']),
  sshPassword: z.string().optional(),
  sshPrivateKey: z.string().optional(),
  sshPassphrase: z.string().optional(),
  vncHost: z.string().max(255).optional(),
  vncPort: z.number().int().min(1).max(65535).optional().default(5900),
  vncPassword: z.string().optional(),
  vncEnabled: z.boolean().optional().default(true),
  serverGroup: z.string().max(50).optional().default('Default'),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().optional().default(true),
  tags: z.array(z.string().min(1).max(30)).max(20).optional().default([]),
  isFavorite: z.boolean().optional().default(false),
});

export const ServerUpdateSchema = ServerCreateSchema.partial();

export const FilePathQuerySchema = z.object({
  path: z.string().optional().default('/'),
});

export const MkdirSchema = z.object({
  path: z.string().min(1),
});

export const RenameSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
});

export const DeletePathSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().optional().default(false),
});

export const UpdatePreferencesSchema = z.object({
  themeMode: z.enum(['dark', 'light', 'system']).optional(),
  dashboardRefreshSeconds: z.number().int().min(5).max(300).optional(),
  defaultLandingTab: z.string().max(50).optional(),
  defaultSshPort: z.number().int().min(1).max(65535).optional(),
  defaultSshUsername: z.string().max(100).optional(),
  defaultVncPort: z.number().int().min(1).max(65535).optional(),
});

export const CommandSnippetCreateSchema = z.object({
  label: z.string().min(1).max(100),
  command: z.string().min(1).max(2000),
  serverId: z.string().optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export const UpdateAccountSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
});

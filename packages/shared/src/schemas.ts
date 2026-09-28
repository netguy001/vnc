import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
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

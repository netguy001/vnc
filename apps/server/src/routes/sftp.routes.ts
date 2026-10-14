import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { requireAuth } from '../middleware/auth.middleware.js';
import { serverService } from '../services/server.service.js';
import { sftpService } from '../services/sftp.service.js';
import { auditService } from '../services/audit.service.js';
import {
  FilePathQuerySchema,
  MkdirSchema,
  RenameSchema,
  DeletePathSchema,
} from '@server-console/shared';

export function registerSftpRoutes(fastify: FastifyInstance): void {
  // All SFTP routes require authentication
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/servers') && req.url.includes('/files')) {
      await requireAuth(req, reply);
    }
  });

  // List files in directory
  fastify.get('/api/servers/:id/files', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { path?: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const remotePath = req.query.path || '/';

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      const files = await sftpService.listFiles(creds, remotePath);
      return reply.send({ currentPath: remotePath, files });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Download file
  fastify.get('/api/servers/:id/files/download', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { path: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const remotePath = req.query.path;

    if (!remotePath) {
      return reply.status(400).send({ error: 'Query param "path" is required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      const { stream } = await sftpService.createDownloadStream(creds, remotePath);
      const filename = path.basename(remotePath);

      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Type', 'application/octet-stream');

      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SFTP_DOWNLOAD',
        serverId: id,
        serverName: creds.server.name,
        details: `Downloaded ${remotePath}`,
        ipAddress: req.ip,
      });

      return reply.send(stream);
    } catch (err: any) {
      return reply.status(500).send({ error: `Download failed: ${err.message}` });
    }
  });

  // Read a text file's contents (for inline editing)
  fastify.get('/api/servers/:id/files/content', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { path?: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const remotePath = req.query.path;
    if (!remotePath) {
      return reply.status(400).send({ error: 'Query param "path" is required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      const content = await sftpService.readFileAsText(creds, remotePath);
      return reply.send({ path: remotePath, content });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Write/save a text file's contents (for inline editing)
  fastify.put('/api/servers/:id/files/content', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const body = req.body as { path?: string; content?: string };
    if (!body?.path || body.content === undefined) {
      return reply.status(400).send({ error: '"path" and "content" are required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      await sftpService.writeFileFromText(creds, body.path, body.content);
      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SFTP_EDIT',
        serverId: id,
        serverName: creds.server.name,
        details: `Edited ${body.path}`,
        ipAddress: req.ip,
      });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Upload file
  fastify.post('/api/servers/:id/files/upload', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      const data = await req.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Read target directory from fields
      const targetDirField = (data.fields.targetDir as any)?.value;
      const targetDir = typeof targetDirField === 'string' ? targetDirField : '/';
      const remoteFilePath = targetDir.endsWith('/') ? `${targetDir}${data.filename}` : `${targetDir}/${data.filename}`;

      await sftpService.uploadFile(creds, remoteFilePath, data.file);

      auditService.log({
        userId: req.user?.userId,
        username: req.user?.username,
        action: 'SFTP_UPLOAD',
        serverId: id,
        serverName: creds.server.name,
        details: `Uploaded ${data.filename} to ${remoteFilePath}`,
        ipAddress: req.ip,
      });

      return reply.send({ success: true, path: remoteFilePath });
    } catch (err: any) {
      return reply.status(500).send({ error: `Upload failed: ${err.message}` });
    }
  });

  // Create directory
  fastify.post('/api/servers/:id/files/mkdir', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const parseResult = MkdirSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      await sftpService.mkdir(creds, parseResult.data.path);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Rename path
  fastify.post('/api/servers/:id/files/rename', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const parseResult = RenameSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'oldPath and newPath are required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      await sftpService.rename(creds, parseResult.data.oldPath, parseResult.data.newPath);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Delete file or directory
  fastify.delete('/api/servers/:id/files', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const parseResult = DeletePathSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'path is required' });
    }

    const creds = serverService.getDecryptedCredentials(id);
    if (!creds || !creds.server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    try {
      await sftpService.deleteItem(creds, parseResult.data.path, parseResult.data.recursive);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}

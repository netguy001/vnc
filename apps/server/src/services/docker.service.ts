import { InternalServerCredentials } from './server.service.js';
import { sshService } from './ssh.service.js';
import { DockerContainerInfo } from '@server-console/shared';

export class DockerService {
  async getContainers(creds: InternalServerCredentials): Promise<{ isAvailable: boolean; containers: DockerContainerInfo[]; error?: string }> {
    try {
      // Fetch docker ps formatted as JSON lines
      const output = await sshService.executeCommand(
        creds,
        'docker ps -a --format "{{json .}}"',
        8000
      );

      const lines = output.trim().split('\n').filter((l) => l.trim().length > 0);
      const containers: DockerContainerInfo[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const stateLower = (parsed.State || '').toLowerCase();
          let state: DockerContainerInfo['state'] = 'unknown';
          if (stateLower.includes('running')) state = 'running';
          else if (stateLower.includes('exited')) state = 'exited';
          else if (stateLower.includes('paused')) state = 'paused';
          else if (stateLower.includes('restart')) state = 'restarting';

          containers.push({
            id: (parsed.ID || '').slice(0, 12),
            name: parsed.Names || parsed.ID,
            image: parsed.Image || 'unknown',
            status: parsed.Status || 'unknown',
            state,
            ports: parsed.Ports || '',
            created: parsed.CreatedAt || '',
          });
        } catch {
          // Ignore JSON parse errors for a line
        }
      }

      return {
        isAvailable: true,
        containers,
      };
    } catch (err: any) {
      return {
        isAvailable: false,
        containers: [],
        error: `Docker is not running or not installed on this server (${err.message})`,
      };
    }
  }
}

export const dockerService = new DockerService();

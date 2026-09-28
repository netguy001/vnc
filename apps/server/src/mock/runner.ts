import { MockVncServer } from './mock-vnc.js';
import { MockSshServer } from './mock-ssh.js';

async function main() {
  console.log('--- Starting ServerConsole Local Mock Servers ---');
  const vnc = new MockVncServer(5901);
  const ssh = new MockSshServer(2222);

  await vnc.start();
  await ssh.start();

  console.log('--------------------------------------------------');
  console.log('Ready for local testing:');
  console.log(' - VNC Server: 127.0.0.1:5901 (RFB 3.8, No Auth)');
  console.log(' - SSH Server: 127.0.0.1:2222 (User: admin, Pass: admin)');
  console.log('--------------------------------------------------');

  const shutdown = async () => {
    console.log('\nShutting down mock servers...');
    await vnc.stop();
    await ssh.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start mock servers:', err);
  process.exit(1);
});

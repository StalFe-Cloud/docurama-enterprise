// Direct API entry keeps the listener in this exact spawned PID. The lifecycle
// proves kernel socket ownership before authorizing any mutating suite.
import nextServer from '../node_modules/next/dist/server/lib/start-server.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid owned server port');
await nextServer.startServer({ dir: root, isDev: true, hostname: '127.0.0.1', port, allowRetry: false });

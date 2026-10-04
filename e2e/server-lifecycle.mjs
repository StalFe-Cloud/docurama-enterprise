// Give the dedicated Next dev process a predictable budget without inheriting
// NODE_OPTIONS/preloads. Next's existing memory restart guard remains enabled.
export function ownedServerArguments() {
  return ['--max-old-space-size=4096', 'e2e/start-server.mjs'];
}

export function assertOwnedServerAlive(server) {
  if (server && (server.exitCode !== null || server.signalCode !== null)) {
    throw new Error(`Owned dev server exited during suite (${server.signalCode ?? server.exitCode}); see owned server log`);
  }
}

// Only handles returned by this lifecycle's spawn calls are observed. The
// caller's finally stops the owned suite group on rejection, then the server
// group, and confirms exit before authorizing scratch deletion.
export async function waitForOwnedCommand(child, server) {
  assertOwnedServerAlive(server);
  const listeners = [];
  const listen = (target, event, handler) => {
    if (!target) return;
    target.once(event, handler);
    listeners.push([target, event, handler]);
  };
  try {
    await new Promise((resolve, reject) => {
      listen(child, 'error', reject);
      listen(child, 'exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Suite command failed (${signal ?? code})`)));
      listen(server, 'error', (error) => reject(new Error(`Owned dev server failed during suite: ${error.message}`)));
      listen(server, 'exit', (code, signal) => reject(new Error(`Owned dev server exited during suite (${signal ?? code}); see owned server log`)));
      try { assertOwnedServerAlive(server); } catch (error) { reject(error); }
      if (child.exitCode !== null || child.signalCode !== null) {
        if (child.exitCode === 0) resolve();
        else reject(new Error(`Suite command failed (${child.signalCode ?? child.exitCode})`));
      }
    });
  } finally {
    for (const [target, event, handler] of listeners) target.removeListener(event, handler);
  }
}

// CI caller declares an owned loopback *_test/*_e2e PostgreSQL database whose
// reviewed migrations are already applied. This runner never migrates SQLite.
import { runIsolated } from './run-isolated.mjs';
runIsolated({ ownedPostgres: true }).catch((error) => {
  console.error(`PostgreSQL E2E refused/failed: ${error.message}`);
  process.exitCode = process.exitCode || 1;
});

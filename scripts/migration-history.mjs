import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// This is the checked-out, reviewed provider history, including its baseline.
export function readMigrationHistory(directory, baselineName = '0_release_baseline') {
  const names = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.equal(names[0], baselineName, 'The reviewed baseline must be the first migration');
  assert(names.length > 1, 'An upgrade verification requires a migration after the baseline');
  return names.map(name => ({
    migration_name: name,
    checksum: createHash('sha256').update(readFileSync(join(directory, name, 'migration.sql'))).digest('hex'),
  }));
}

export function assertAppliedMigrationHistory(applied, reviewed) {
  assert.deepEqual(applied.map(entry => entry.migration_name), reviewed.map(entry => entry.migration_name),
    'Applied migrations must exactly match the reviewed provider history, including its baseline');
  for (let index = 0; index < reviewed.length; index++) {
    assert.equal(applied[index].checksum, reviewed[index].checksum,
      `Applied migration checksum must match reviewed SQL: ${reviewed[index].migration_name}`);
  }
}

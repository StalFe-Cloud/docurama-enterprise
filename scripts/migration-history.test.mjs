import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readMigrationHistory, assertAppliedMigrationHistory } from './migration-history.mjs';

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'docurama-migration-history-'));
  const add = (name, sql = 'SELECT 1;\n') => {
    mkdirSync(join(directory, name));
    writeFileSync(join(directory, name, 'migration.sql'), sql);
  };
  try { run(directory, add); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('reviewed baseline plus a growing tail is required and verified exactly', () => fixture((directory, add) => {
  add('0_release_baseline'); add('20260920_first');
  const first = readMigrationHistory(directory);
  assertAppliedMigrationHistory(first, first);
  add('20261004_later', 'SELECT 2;\n');
  const later = readMigrationHistory(directory);
  assert.equal(later.length, first.length + 1);
  assertAppliedMigrationHistory(later, later);
  assert.throws(() => assertAppliedMigrationHistory(first, later), /exactly match/);
}));

test('missing baseline or baseline-only history cannot claim an upgrade', () => fixture((directory, add) => {
  add('20260920_first');
  assert.throws(() => readMigrationHistory(directory), /baseline/);
  add('0_release_baseline');
  assert.equal(readMigrationHistory(directory).length, 2);
  fixture((baselineOnly, addBaseline) => {
    addBaseline('0_release_baseline');
    assert.throws(() => readMigrationHistory(baselineOnly), /after the baseline/);
  });
}));

test('extra, duplicate, wrong-name and changed SQL receipts are rejected', () => fixture((directory, add) => {
  add('0_release_baseline'); add('20260920_first');
  const history = readMigrationHistory(directory);
  assert.throws(() => assertAppliedMigrationHistory([...history, history[1]], history), /exactly match/);
  assert.throws(() => assertAppliedMigrationHistory([history[0], history[0]], history), /exactly match/);
  assert.throws(() => assertAppliedMigrationHistory([history[0], { ...history[1], migration_name: 'unknown' }], history), /exactly match/);
  assert.throws(() => assertAppliedMigrationHistory([history[0], { ...history[1], checksum: '0'.repeat(64) }], history), /checksum/);
  writeFileSync(join(directory, '0_release_baseline', 'migration.sql'), 'SELECT 9;\n');
  assert.throws(() => assertAppliedMigrationHistory(history, readMigrationHistory(directory)), /checksum/);
}));

test('every real provider history includes its baseline and all reviewed tail checksums', () => {
  for (const provider of ['sqlite', 'postgresql']) {
    const history = readMigrationHistory(resolve('prisma', provider, 'migrations'));
    assertAppliedMigrationHistory(history, history);
    assert(history.every(entry => /^[a-f0-9]{64}$/.test(entry.checksum)));
    assert.throws(() => assertAppliedMigrationHistory(history.slice(0, -1), history), /exactly match/);
  }
});

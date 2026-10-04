// Node 22.18+: node deploy/helm/docurama/tests/policy.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { publicRegistrationAllowed, tenantCreationAllowed } from '../../../../src/lib/deployment-policy.ts';

const chart = fileURLToPath(new URL('../', import.meta.url));
const template = readFileSync(new URL('../templates/deployment.yaml', import.meta.url), 'utf8');
const reserved = ['DOCURAMA_DEPLOYMENT_MODE', 'DOCURAMA_PUBLIC_REGISTRATION'];
const helm = spawnSync('helm', ['version', '--short'], { encoding: 'utf8' });
const helmUnavailable = ['ENOENT', 'EPERM'].includes(helm.error?.code);
const helmSkipReason = `Helm cannot execute (${helm.error?.code}); rendered manifests remain unvalidated`;

test('Enterprise chart explicitly closes public signup and fixes dedicated mode', () => {
  assert.match(template, /name: DOCURAMA_DEPLOYMENT_MODE\s+value: "selfhost"/);
  assert.match(template, /name: DOCURAMA_PUBLIC_REGISTRATION\s+value: "false"/);
  assert.match(template, /range \.Values\.extraEnv[\s\S]+has \.name \(list "DOCURAMA_DEPLOYMENT_MODE" "DOCURAMA_PUBLIC_REGISTRATION"\)[\s\S]+fail/);
});

test('dedicated application policy rejects public signup and additional tenants', () => {
  const prior = reserved.map(name => process.env[name]);
  try {
    process.env.DOCURAMA_DEPLOYMENT_MODE = 'selfhost';
    for (const registration of ['false', 'true']) {
      process.env.DOCURAMA_PUBLIC_REGISTRATION = registration;
      assert.equal(publicRegistrationAllowed(), false);
      assert.equal(tenantCreationAllowed('PLATFORM_ADMIN', 0), true);
      assert.equal(tenantCreationAllowed('WORKSPACE_ADMIN', 0), false);
      assert.equal(tenantCreationAllowed('PLATFORM_ADMIN', 1), false);
    }
  } finally {
    reserved.forEach((name, index) => {
      if (prior[index] === undefined) delete process.env[name];
      else process.env[name] = prior[index];
    });
  }
});

test('Helm lint and rendered Enterprise environment', { skip: helmUnavailable ? helmSkipReason : false }, () => {
  assert.equal(helm.status, 0, helm.stderr);
  const lint = spawnSync('helm', ['lint', chart], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  const render = spawnSync('helm', ['template', 'policy', chart], { encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
  assert.match(render.stdout, /name: DOCURAMA_DEPLOYMENT_MODE\s+value: "selfhost"/);
  assert.match(render.stdout, /name: DOCURAMA_PUBLIC_REGISTRATION\s+value: "false"/);
});

for (const name of reserved) {
  test(`Helm refuses policy override ${name}`, { skip: helmUnavailable ? helmSkipReason : false }, () => {
    const render = spawnSync('helm', ['template', 'policy', chart, '--set', `extraEnv[0].name=${name}`, '--set-string', 'extraEnv[0].value=saas'], { encoding: 'utf8' });
    assert.notEqual(render.status, 0);
    assert.match(render.stderr, /Enterprise installation policy cannot be overridden/);
  });
}

test('Helm permits unrelated environment settings', { skip: helmUnavailable ? helmSkipReason : false }, () => {
  const render = spawnSync('helm', ['template', 'policy', chart, '--set', 'extraEnv[0].name=DOCURAMA_WORKER', '--set-string', 'extraEnv[0].value=off'], { encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
  assert.match(render.stdout, /name: DOCURAMA_WORKER\s+value: "?off"?/);
});

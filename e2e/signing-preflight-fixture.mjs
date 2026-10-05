// Internal child: invoked only by signing-preflight-isolation.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const database = process.env.DATABASE_URL?.slice(5);
assert.ok(process.env.DATABASE_URL?.startsWith('file:'));
assert.ok(database && basename(database) === 'suite.db');
const directory = dirname(await realpath(database));
assert.equal(dirname(directory), await realpath(tmpdir()));
assert.ok(basename(directory).startsWith('docurama-e2e-'));
assert.equal((await lstat(database)).isSymbolicLink(), false);
assert.equal((await lstat(database)).nlink, 1);
const nonce = process.env.E2E_SIGNING_FIXTURE_NONCE;
assert.match(nonce || '', /^[a-f0-9]{64}$/);
assert.equal(await readFile(join(directory, 'signing-route-owner'), 'utf8'), nonce);
assert.equal(process.env.SMTP_URL, '');
assert.equal(process.env.SMTP_FROM, undefined);
assert.equal(process.env.EVIDENCE_PORTAL_URL, undefined);
assert.equal(process.env.NODE_OPTIONS, undefined);
const { db } = await import('../src/lib/db.ts');
const { NextRequest } = await import('next/server');
const { freezeTemplateContract } = await import('../src/lib/contract-snapshot.ts');
const { freezeConsentTerms, readConsentSnapshot } = await import('../src/lib/consent.ts');
const { computeEnvelopeDigest, computeEnvelopeEvidenceDigest } = await import('../src/lib/esign.ts');
const { POST } = await import('../src/app/api/sign/[token]/route.ts');
const { GET: completedDocument } = await import('../src/app/api/sign/[token]/completed/route.ts');
const { PDFDocument } = await import('pdf-lib');
let counter = 0;
async function fixture({ fields = [], level = 'simple', consentSnapshot = freezeConsentTerms({ consentText: 'Reviewed fixture consent', consentVersion: 'fixture-v7' }) } = {}) {
  const key = `route-${++counter}`;
  const sender = await db.user.create({ data: { email: `${key}-sender@example.invalid`, passwordHash: 'no-login', firstName: 'Fixture', lastName: 'Sender' } });
  const tenant = await db.tenant.create({ data: { name: key, slug: key, status: 'ACTIVE' } });
  await db.member.create({ data: { userId: sender.id, tenantId: tenant.id, role: 'OWNER' } });
  await db.esignPreferences.create({ data: { tenantId: tenant.id, signatureLevel: level } });
  const template = await db.template.create({ data: { tenantId: tenant.id, name: key, publicSlug: key, version: '1', bodyMarkdown: 'Authoritative synthetic agreement.', pages: 1 } });
  const email = `${key}-signer@example.invalid`;
  const locations = fields.map(field => ({ id: 'field', type: 'text', pageNumber: 1, x: 10, y: 40, width: 20, height: 5,
    recipientIndex: 0, recipientEmail: email, recipientName: 'Fixture Signer', label: 'Fixture field', required: true, ...field }));
  const envelope = await db.envelope.create({ data: { tenantId: tenant.id, createdById: sender.id, templateId: template.id,
    title: key, publicCode: key, status: 'SENT', pages: 1, contractSnapshot: freezeTemplateContract(template, locations), consentSnapshot } });
  const recipient = await db.recipient.create({ data: { envelopeId: envelope.id, name: 'Fixture Signer', email, role: 'SIGNER', order: 1, accessToken: `${key}-token` } });
  return { envelope, recipient, tenant, sender };
}
const sign = (f, extra = {}) => {
  const terms = f.envelope.consentSnapshot ? readConsentSnapshot(f.envelope.consentSnapshot) : readConsentSnapshot(freezeConsentTerms());
  return POST(new NextRequest(`http://127.0.0.1/api/sign/${f.recipient.accessToken}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'sign', name: 'Fixture Signer', font: 'caveat', consent: true,
      consentDigest: terms.digest, consentVersion: terms.version, ...extra }) }), { params: Promise.resolve({ token: f.recipient.accessToken }) });
};
async function snapshot(f) {
  return { recipient: await db.recipient.findUnique({ where: { id: f.recipient.id } }), envelope: await db.envelope.findUnique({ where: { id: f.envelope.id } }),
    events: await db.envelopeEvent.findMany({ where: { envelopeId: f.envelope.id } }), outbox: await db.mailOutbox.findMany({ where: { envelopeId: f.envelope.id } }) };
}
async function refused(f, body = {}, expected = 400) {
  const before = await snapshot(f);
  const result = await sign(f, body);
  assert.equal(result.status, expected, await result.text());
  assert.deepEqual(await snapshot(f), before);
}
try {
  await refused(await fixture({ fields: [{ type: 'signature', width: .001, height: .001 }] }), {}, 409);
  await refused(await fixture({ fields: [{ width: 2, height: 2 }] }), { values: { field: 'X'.repeat(600) } }, 409);
  const unsupportedActor = await fixture();
  await db.recipient.update({ where: { id: unsupportedActor.recipient.id }, data: { name: 'Unsupported 漢字 event actor' } });
  await refused(unsupportedActor, {}, 409); // The typed adoption is Latin; the prospective SIGNED event is not.
  const unsupportedLedger = await fixture();
  await db.envelopeEvent.create({ data: { envelopeId: unsupportedLedger.envelope.id, action: 'SENT', actor: 'Fixture', detail: 'Unsupported 漢字 ledger metadata' } });
  await refused(unsupportedLedger, {}, 409);
  await refused(await fixture(), { consentDigest: '0'.repeat(64) });
  await refused(await fixture(), { consentVersion: 'stale-v1' });
  await refused(await fixture(), { consentText: 'Unreviewed substitute' });
  await refused(await fixture(), { consentDigest: undefined });
  await refused(await fixture(), { consentVersion: undefined });
  await refused(await fixture({ consentSnapshot: null }), {}, 409);
  for (const level of ['advanced', 'qualified', 'unknown']) await refused(await fixture({ level }), {}, 409);
  const reauth = await fixture();
  await db.esignPreferences.update({ where: { tenantId: reauth.tenant.id }, data: { requireReauth: true } });
  await refused(reauth, {}, 409);
  const part11 = await fixture();
  await db.esignPreferences.update({ where: { tenantId: part11.tenant.id }, data: { part11Mode: true } });
  await refused(part11, {}, 409);
  const concurrent = await fixture();
  const before = await snapshot(concurrent);
  const responses = await Promise.all(Array.from({ length: 8 }, () => sign(concurrent, { consentDigest: 'f'.repeat(64) })));
  assert.ok(responses.every(response => response.status === 400));
  assert.deepEqual(await snapshot(concurrent), before);
  // A real serializable SQLite transaction must accept exactly one adoption.
  // All five field types use the actual renderer before commit, not a stub.
  const positive = await fixture({ fields: ['signature', 'initials', 'text', 'date', 'checkbox'].map((type, index) => ({
    id: `positive-${type}`, type, x: 5, y: 20 + index * 12, width: type === 'checkbox' ? 5 : 38, height: 7,
  })) });
  const frozenTerms = readConsentSnapshot(positive.envelope.consentSnapshot);
  await db.esignPreferences.update({ where: { tenantId: positive.tenant.id }, data: {
    consentText: 'New tenant wording must apply only to future envelopes.', consentVersion: 'fixture-v8',
  } });
  const validResponses = await Promise.all(Array.from({ length: 8 }, () => sign(positive, { values: {
    'positive-text': 'Reviewed agreement', 'positive-date': '2026-10-05', 'positive-checkbox': true,
  } })));
  assert.equal(validResponses.filter(response => response.status === 200).length, 1);
  assert.equal(validResponses.filter(response => response.status === 409).length, 7);
  const after = await snapshot(positive);
  assert.equal(after.recipient.status, 'SIGNED');
  assert.equal(after.envelope.status, 'COMPLETED');
  assert.equal(after.envelope.consentSnapshot, positive.envelope.consentSnapshot);
  const adoption = JSON.parse(after.recipient.signatureData);
  assert.equal(adoption.version, 2);
  assert.equal(adoption.consent, frozenTerms.text);
  assert.equal(adoption.consentVersion, frozenTerms.version);
  assert.equal(adoption.consentDigest, frozenTerms.digest);
  assert.deepEqual(adoption.values, { 'positive-signature': 'Fixture Signer', 'positive-initials': 'FS',
    'positive-text': 'Reviewed agreement', 'positive-date': '2026-10-05', 'positive-checkbox': true });
  assert.equal(after.events.filter(event => event.action === 'SIGNED').length, 1);
  assert.equal(after.events.filter(event => event.action === 'SEALED').length, 1);
  assert.equal(after.outbox.length, 2);
  assert.ok(after.outbox.every(row => row.template === 'SIGN_COMPLETED' && row.status === 'QUEUED' && row.attempts === 0));
  assert.deepEqual(after.outbox.map(row => row.toEmail).sort(), [positive.recipient.email, positive.sender.email].sort());
  const recordResponse = await completedDocument(new NextRequest(`http://127.0.0.1/api/sign/${positive.recipient.accessToken}/completed?format=record`),
    { params: Promise.resolve({ token: positive.recipient.accessToken }) });
  assert.equal(recordResponse.status, 200);
  const record = await recordResponse.json();
  assert.equal(record.signers[0].consentText, frozenTerms.text);
  assert.equal(record.signers[0].consentVersion, frozenTerms.version);
  assert.equal(record.signers[0].consentDigest, frozenTerms.digest);
  const hashes = [];
  const pdfArtifacts = [];
  for (const [format, expectedHash] of [['', record.finalDocumentSha256], ['?format=record-pdf', record.completionRecordSha256]]) {
    const response = await completedDocument(new NextRequest(`http://127.0.0.1/api/sign/${positive.recipient.accessToken}/completed${format}`),
      { params: Promise.resolve({ token: positive.recipient.accessToken }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, expectedHash);
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
    hashes.push(hash);
    pdfArtifacts.push(bytes);
  }
  assert.deepEqual(await snapshot(positive), after);
  // Full JSON retains post-completion activity even at equal-clock precision.
  // Such later activity must not enter or invalidate either printable output.
  await db.envelopeEvent.create({ data: { envelopeId: positive.envelope.id, action: 'EVIDENCE_EXPORTED',
    actor: 'Export actor 漢字', detail: 'Later activity: unsupported 漢字 printable glyphs', at: after.envelope.sealedAt } });
  const afterExportActivity = await snapshot(positive);
  const liveResponse = await completedDocument(new NextRequest(`http://127.0.0.1/api/sign/${positive.recipient.accessToken}/completed?format=record`),
    { params: Promise.resolve({ token: positive.recipient.accessToken }) });
  assert.equal(liveResponse.status, 200);
  const liveRecord = await liveResponse.json();
  assert.equal(liveRecord.events.filter(event => event.action === 'EVIDENCE_EXPORTED' && event.actor === 'Export actor 漢字').length, 1);
  assert.equal(liveRecord.eventCount, record.eventCount + 1);
  assert.equal(liveRecord.finalDocumentSha256, record.finalDocumentSha256);
  assert.equal(liveRecord.completionRecordSha256, record.completionRecordSha256);
  for (const [index, format] of ['', '?format=record-pdf'].entries()) {
    const response = await completedDocument(new NextRequest(`http://127.0.0.1/api/sign/${positive.recipient.accessToken}/completed${format}`),
      { params: Promise.resolve({ token: positive.recipient.accessToken }) });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, pdfArtifacts[index]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[index]);
  }
  assert.deepEqual(await snapshot(positive), afterExportActivity);

  // Read-only export retains genuine historical V1 wording; it must not
  // invent the version/digest that was never captured by that older schema.
  const historical = await fixture({ consentSnapshot: null });
  const historicalCreatedAt = new Date('2025-02-02T04:05:06.000Z');
  const historicalAt = new Date('2025-02-03T04:05:06.000Z');
  const historicalConsent = 'Historical fixture wording that was actually captured at adoption.';
  const historicalAdoption = JSON.stringify({ version: 1, name: 'Historical Signer', font: 'caveat',
    consent: historicalConsent, consentAcceptedAt: historicalAt.toISOString(), authMethod: 'EMAIL_LINK', values: {} });
  const historicalSigner = await db.recipient.update({ where: { id: historical.recipient.id }, data: {
    status: 'SIGNED', signedAt: historicalAt, signatureData: historicalAdoption,
  } });
  const historicalSealInput = { id: historical.envelope.id, publicCode: historical.envelope.publicCode,
    title: historical.envelope.title, pages: historical.envelope.pages, createdAt: historicalCreatedAt,
    documentSha256: null, contractSnapshot: historical.envelope.contractSnapshot, fields: historical.envelope.fields,
    recipients: [historicalSigner], events: [] };
  const historicalEvidenceSha256 = computeEnvelopeEvidenceDigest(historicalSealInput);
  await db.envelope.update({ where: { id: historical.envelope.id }, data: { createdAt: historicalCreatedAt, status: 'COMPLETED', completedAt: historicalAt,
    sealedAt: historicalAt, sha256: computeEnvelopeDigest(historicalSealInput), evidenceSha256: historicalEvidenceSha256 } });
  const historicalSnapshot = await snapshot(historical);
  const historicalRecord = () => completedDocument(new NextRequest(`http://127.0.0.1/api/sign/${historical.recipient.accessToken}/completed?format=record`),
    { params: Promise.resolve({ token: historical.recipient.accessToken }) });
  const historicalResponse = await historicalRecord();
  assert.equal(historicalResponse.status, 200);
  const historicalBody = await historicalResponse.json();
  assert.equal(historicalBody.signers[0].consentText, historicalConsent);
  assert.equal(Object.hasOwn(historicalBody.signers[0], 'consentVersion'), false);
  assert.equal(Object.hasOwn(historicalBody.signers[0], 'consentDigest'), false);
  assert.match(historicalBody.finalDocumentSha256, /^[a-f0-9]{64}$/);
  assert.match(historicalBody.completionRecordSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await snapshot(historical), historicalSnapshot);
  for (const guard of ['all-signers', 'sealed-time', 'evidence-seal']) {
    if (guard === 'all-signers') await db.recipient.update({ where: { id: historical.recipient.id }, data: { status: 'PENDING' } });
    if (guard === 'sealed-time') await db.envelope.update({ where: { id: historical.envelope.id }, data: { sealedAt: null } });
    if (guard === 'evidence-seal') await db.envelope.update({ where: { id: historical.envelope.id }, data: { evidenceSha256: '0'.repeat(64) } });
    const guarded = await snapshot(historical);
    assert.equal((await historicalRecord()).status, 409, `${guard} must still protect historical V1 export`);
    assert.deepEqual(await snapshot(historical), guarded);
    if (guard === 'all-signers') await db.recipient.update({ where: { id: historical.recipient.id }, data: { status: 'SIGNED' } });
    if (guard === 'sealed-time') await db.envelope.update({ where: { id: historical.envelope.id }, data: { sealedAt: historicalAt } });
    if (guard === 'evidence-seal') await db.envelope.update({ where: { id: historical.envelope.id }, data: { evidenceSha256: historicalEvidenceSha256 } });
  }
  assert.deepEqual(await snapshot(historical), historicalSnapshot);
  console.log(`SIGNING_ROUTE_ISOLATION_OK: ${JSON.stringify({ rejectionCases: 16, rejectedConcurrentRequests: 8,
    acceptedConcurrentRequests: 1, duplicateConcurrentRequests: 7, signedEvents: 1, sealedEvents: 1,
    completionNotifications: 2, consentVersion: frozenTerms.version, modernRecordMatchesFrozenConsent: true,
    historicalRecordRetainsOwnWording: true, historicalRecordInventsConsentMetadata: false, historicalExportGuards: 3,
    lateUnicodeEqualClockActivityVisibleInJson: true, printablePdfBytesStableAfterActivity: true,
    finalPdfSha256: hashes[0], recordPdfSha256: hashes[1], liveMailOrProviders: false })}`);
} finally { await db.$disconnect(); }

import { beforeEach, expect, mock, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { base32Decode } from "../src/lib/totp";
const now = new Date();
let user: any;
let proof: any;
let createdSession: any;
let revokedCount = 0;
let sessionsCreated = 0;
const challenges = new Map<string, any>();
const db: any = {
  user: { findUnique: async () => structuredClone(user), update: async ({data}: any) => Object.assign(user,data), updateMany: async ({where,data}: any) => {if (where.totpPendingSecret !== undefined && user.totpPendingSecret !== where.totpPendingSecret) return {count:0}; if (where.totpRecoveryCodes !== undefined && user.totpRecoveryCodes !== where.totpRecoveryCodes) return {count:0}; Object.assign(user,data); return { count: 1 };} },
  member: { findMany: async () => user.memberships, findFirst: async () => user.memberships.find((m:any) => m.tenant.enforceTwoFactor) },
  session: { findUnique: async () => ({ id: "session", userId: "user", lastSeenAt: now, expiresAt: new Date(Date.now()+60000), mfaVerifiedAt: proof }), updateMany: async () => {revokedCount++; return { count: 1 };}, create: async ({data}: any) => { sessionsCreated++; createdSession=data; return { id: "session", ...data }; } },
  authChallenge: { findUnique: async ({where}: any) => challenges.get(where.id), create: async ({data}: any) => { const c = { id: `challenge-${challenges.size}`, attempts: 0, ...data }; challenges.set(c.id,c); return c; }, updateMany: async ({where}:any) => {const c=challenges.get(where.id); if(c && c.attempts<5) c.attempts++; return {count:c?1:0};}, deleteMany: async ({where}: any) => ({ count: challenges.delete(where.id) ? 1 : 0 }) },
  securityEvent: { create: async () => ({}) }, auditEvent: { create: async () => ({}) },
};
db.$transaction = async (work:any) => work(db);
mock.module("@/lib/db", () => ({ db }));
mock.module("next/headers", () => ({cookies: async () => ({get: () => null}), headers: async () => new Headers()}));
mock.module("@/lib/password-async", () => ({ verifyPasswordAsync: async () => true, hashPasswordAsync: async () => "upgraded" }));
const { resolveSessionUser } = await import("../src/lib/auth");
const { POST } = await import("../src/app/api/auth/login/route");
beforeEach(() => {
  user = { id: "user", email: "fixture@example.test", firstName: "Test", lastName: "User", role: "USER", status: "ACTIVE", passwordHash: "modern", activeTenantId: "tenant", totpEnabled: false, totpSecret: null,
    memberships: [{tenantId: "tenant", role:"MEMBER", tenant: {name:"Test", slug:"test", planCode:"ENTERPRISE", enforceTwoFactor:true}}] };
  proof = null; createdSession=null; revokedCount=0; sessionsCreated = 0; challenges.clear();
  (globalThis as any).__docuramaLoginBuckets?.clear();
});
const login = (body: any = {}) => POST(new Request("http://localhost/api/auth/login", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({email:user.email,password:"synthetic",...body})}) as any);
test("enforced unenrolled password sign-in returns enrollment challenge without session", async () => {
  const response = await login(); const body = await response.json();
  expect(body.requiresEnrollment).toBe(true); expect(body.token).toBeUndefined(); expect(sessionsCreated).toBe(0);
});
test("enforcement rejects existing password-only session", async () => expect(await resolveSessionUser("session")).toBeNull());
test("enabled flag without secret fails closed at login", async () => { user.totpEnabled=true; const response=await login(); expect(response.status).toBe(403); expect(sessionsCreated).toBe(0); });
test("enabled flag without secret fails closed at session resolution", async () => { user.totpEnabled=true; expect(await resolveSessionUser("session")).toBeNull(); });
test("enrolled users need per-session MFA evidence", async () => {user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP"; expect(await resolveSessionUser("session")).toBeNull();});
test("optional unenrolled users retain password sign-in", async () => {user.memberships[0].tenant.enforceTwoFactor=false; const response=await login(); expect(response.status).toBe(200); expect(sessionsCreated).toBe(1);});
test("OTP challenges must have login purpose even with a valid code", async () => {user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP"; challenges.set("other",{id:"other",userId:"user",purpose:"2FA_ENROLL",attempts:0,expiresAt:new Date(Date.now()+60000)}); const response=await login({otp:otp(user.totpSecret),challenge:"other"}); expect(response.status).toBe(401);});
function otp(secret:string) {
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",base32Decode(secret)).update(counter).digest(); const offset=digest[19]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
test("verified enrollment creates MFA-proven session and recovery codes", async () => {
  const start=await (await login()).json(); expect(start.secret).toHaveLength(32); expect(sessionsCreated).toBe(0);
  const response=await login({enrollment:true,challenge:start.challenge,otp:otp(start.secret)}); const body=await response.json();
  expect(response.status).toBe(200); expect(body.recoveryCodes).toHaveLength(10); expect(createdSession.mfaVerifiedAt).toBeInstanceOf(Date); expect(user.totpEnabled).toBe(true); expect(revokedCount).toBe(1);
});
test("concurrent enrollment challenge consumption succeeds once", async () => {
  const start=await (await login()).json(); const payload={enrollment:true,challenge:start.challenge,otp:otp(start.secret)};
  const responses=await Promise.all([login(payload),login(payload)]); expect(responses.filter(r=>r.status===200)).toHaveLength(1); expect(sessionsCreated).toBe(1);
});
test("bound enrollment rejects another account challenge", async () => {
  const start=await (await login()).json(); challenges.get(start.challenge).userId="other-user";
  expect((await login({enrollment:true,challenge:start.challenge,otp:otp(start.secret)})).status).toBe(401); expect(sessionsCreated).toBe(0);
});
test("expired enrollment does not create a session", async () => {
  const start=await (await login()).json(); challenges.get(start.challenge).expiresAt=new Date(0);
  expect((await login({enrollment:true,challenge:start.challenge,otp:otp(start.secret)})).status).toBe(401); expect(sessionsCreated).toBe(0);
});
test("verified TOTP session resolves successfully", async () => {user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP"; proof=new Date(); expect((await resolveSessionUser("session"))?.id).toBe("user");});
test("concurrent OTP challenge consumption creates one session", async () => {
  user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP";
  const start=await (await login()).json(); const payload={challenge:start.challenge,otp:otp(user.totpSecret)};
  const responses=await Promise.all([login(payload),login(payload)]); expect(responses.filter(r=>r.status===200)).toHaveLength(1); expect(sessionsCreated).toBe(1);
});
test("same recovery code across separate challenges is burned once", async () => {
  user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP"; user.totpRecoveryCodes=JSON.stringify([createHash("sha256").update("abcd-1234").digest("hex")]);
  const first=await (await login()).json(); const second=await (await login()).json();
  const responses=await Promise.all([login({challenge:first.challenge,otp:"abcd-1234"}),login({challenge:second.challenge,otp:"abcd-1234"})]);
  expect(responses.filter(r=>r.status===200)).toHaveLength(1); expect(sessionsCreated).toBe(1); expect(user.totpRecoveryCodes).toBe("[]");
});
test("login throttle bounds repeated account attempts", async () => {
  user.memberships[0].tenant.enforceTwoFactor=false;
  for(let i=0;i<20;i++) expect((await login()).status).toBe(200);
  expect((await login()).status).toBe(429);
});
test("tenant enforcement prevents disabling an enrolled factor", async () => {
  const { postSettingsOp } = await import("../src/lib/settings-handlers");
  user.totpEnabled=true; user.totpSecret="JBSWY3DPEHPK3PXP"; proof=new Date();
  const me=await resolveSessionUser("session");
  const response=await postSettingsOp(me!,{op:"2fa.disable",data:{password:"synthetic",code:otp(user.totpSecret)}},new Request("http://localhost/api/workspace/settings",{method:"POST"}) as any);
  expect(response.status).toBe(403); expect(user.totpEnabled).toBe(true); expect(user.totpSecret).toBe("JBSWY3DPEHPK3PXP");
});

/** Standalone integration check: creates a unique disposable SQLite database. */
import { mock } from "bun:test";
import { randomUUID, createHmac } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const scratch=resolve("../../assessment/mfa-scratch"); mkdirSync(scratch,{recursive:true});
const database=resolve(scratch,`mfa-${randomUUID()}.db`);
process.env.DATABASE_URL=`file:${database.replaceAll("\\","/")}`;
process.env.DOCURAMA_TRUST_PROXY_HEADERS="0";
// Apply the checked-in SQLite migration sequence to this new file only.
// Bun's embedded SQLite avoids spawning a schema engine or contacting a provider.
const sqlite=new Database(database,{create:true});
for(const directory of readdirSync("prisma/sqlite/migrations",{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort()) {
  sqlite.exec(readFileSync(resolve("prisma/sqlite/migrations",directory,"migration.sql"),"utf8"));
}
sqlite.close();
mock.module("next/headers",()=>({cookies:async()=>({get:()=>null}),headers:async()=>new Headers()}));
const { db }=await import("../src/lib/db");
const { hashPasswordAsync, resolveSessionUser }=await import("../src/lib/auth");
const { POST }=await import("../src/app/api/auth/login/route");
const { base32Decode }=await import("../src/lib/totp");
function otp(secret:string) {
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",base32Decode(secret)).update(counter).digest(); const offset=digest[19]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
try {
  const tenant=await db.tenant.create({data:{name:"Synthetic MFA tenant",slug:`mfa-${randomUUID()}`,enforceTwoFactor:true}});
  const user=await db.user.create({data:{email:`mfa-${randomUUID()}@example.test`,passwordHash:await hashPasswordAsync("synthetic fixture only"),firstName:"Synthetic",lastName:"Fixture",activeTenantId:tenant.id,memberships:{create:{tenantId:tenant.id,role:"MEMBER"}}}});
  const login=(data:Record<string,unknown>={})=>POST(new Request("http://localhost/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:user.email,password:"synthetic fixture only",...data})}) as any);
  const oldSession=await db.session.create({data:{userId:user.id,expiresAt:new Date(Date.now()+60000)}});
  assert.equal(await resolveSessionUser(oldSession.id),null);
  const start=await (await login()).json(); assert.equal(start.requiresEnrollment,true); assert.equal(start.token,undefined);
  assert.equal(await db.session.count({where:{userId:user.id}}),1);
  const complete=await login({enrollment:true,challenge:start.challenge,otp:otp(start.secret)}); assert.equal(complete.status,200);
  const result=await complete.json(); assert.equal(result.recoveryCodes.length,10);
  const verified=await resolveSessionUser(result.token); assert.equal(verified?.id,user.id);
  assert.ok((await db.session.findUnique({where:{id:result.token}}))?.mfaVerifiedAt);
  assert.ok((await db.session.findUnique({where:{id:oldSession.id}}))?.revokedAt);
  const {postSettingsOp}=await import("../src/lib/settings-handlers");
  assert.equal((await postSettingsOp(verified!,{op:"2fa.disable",data:{password:"synthetic fixture only",code:otp(start.secret)}},new Request("http://localhost/api/workspace/settings",{method:"POST"}) as any)).status,403);
  // Separate challenges racing over one recovery code must produce one session.
  const a=await (await login()).json(); const b=await (await login()).json();
  const attempts=await Promise.all([login({challenge:a.challenge,otp:result.recoveryCodes[0]}),login({challenge:b.challenge,otp:result.recoveryCodes[0]})]);
  assert.equal(attempts.filter(r=>r.status===200).length,1);
  assert.equal(await db.session.count({where:{userId:user.id,revokedAt:null}}),2);
  const single=await (await login()).json();
  const otpAttempts=await Promise.all([login({challenge:single.challenge,otp:otp(start.secret)}),login({challenge:single.challenge,otp:otp(start.secret)})]);
  assert.equal(otpAttempts.filter(r=>r.status===200).length,1);
  assert.equal(await db.session.count({where:{userId:user.id,revokedAt:null}}),3);
  const second=await db.user.create({data:{email:`mfa-${randomUUID()}@example.test`,passwordHash:await hashPasswordAsync("second synthetic fixture"),firstName:"Second",lastName:"Fixture",activeTenantId:tenant.id,memberships:{create:{tenantId:tenant.id,role:"MEMBER"}}}});
  const loginSecond=(data:Record<string,unknown>={})=>POST(new Request("http://localhost/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:second.email,password:"second synthetic fixture",...data})}) as any);
  const enrollSecond=await (await loginSecond()).json();
  const enrollData={enrollment:true,challenge:enrollSecond.challenge,otp:otp(enrollSecond.secret)};
  const enrollmentAttempts=await Promise.all([loginSecond(enrollData),loginSecond(enrollData)]);
  assert.equal(enrollmentAttempts.filter(r=>r.status===200).length,1);
  assert.equal(await db.session.count({where:{userId:second.id}}),1);
  console.log(JSON.stringify({status:"PASS",database,checks:["fresh schema including MFA column","enforcement blocks old sessions","enrollment gives no session","verified enrollment gives proof/recovery codes","old sessions revoked","factor disable blocked","recovery-code race yields one session","OTP challenge race yields one session","enrollment challenge race yields one session"]},null,2));
} finally {await db.$disconnect();}

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, realpath, rm } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { readLimitedByteStream, withStorageReadLimits, abortableMetadata } from "../src/lib/storage-read";
import { s3GetBytes, resetS3ClientCache, type S3Mode } from "../src/lib/object-store";
mock.module("../src/lib/db", () => ({ db: {} }));
const { readStoredBytes } = await import("../src/lib/document-store");
const names = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_SESSION_TOKEN", "S3_BUCKET", "S3_ENDPOINT", "S3_SSE_KMS_KEY_ID", "S3_CREDENTIALS_MODE", "STORAGE_DIR"];
const prior = new Map(names.map(name => [name, process.env[name]]));
let server: Server, mode: Extract<S3Mode,{configured:true}>, scratch: string;
const sockets = new Set<import("node:net").Socket>();
const closed = new Map<string, Promise<void>>();
const seen = new Map<string, number>();
const key = "documents/tenant-test/doc_" + "a".repeat(32) + ".pdf";
async function within<T>(promise:Promise<T>,ms=1500):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("owned stream did not close")),ms);})]);}
 finally {if(timer!==undefined)clearTimeout(timer);}
}
beforeAll(async()=>{
 for(const name of names)delete process.env[name];
 process.env.S3_ACCESS_KEY_ID="owned-synthetic-access";process.env.S3_SECRET_ACCESS_KEY="owned-synthetic-secret";
 scratch=await mkdtemp(join(tmpdir(),"docurama-storage-bounds-"));
 expect(dirname(await realpath(scratch))).toBe(await realpath(tmpdir()));
 process.env.STORAGE_DIR=scratch;
 await mkdir(join(scratch,"documents","tenant-test"),{recursive:true});
 await writeFile(join(scratch,key),Buffer.from("%PDF-synthetic-local-bytes"));
 server=createServer((req,res)=>{
  const name=(req.url??"").split("?")[0].split("/").pop()!;
  seen.set(name,(seen.get(name)??0)+1);
  closed.set(name,new Promise<void>(resolve=>res.once("close",resolve)));
  if(name==="slow-headers")return;
  if(name==="slow-body"){res.writeHead(200,{"content-type":"application/pdf"});res.write("%PDF-");return;}
  if(name==="header-oversize"){res.writeHead(200,{"content-length":"999999999"});res.write("%PDF-");return;}
  if(name==="stream-oversize"){res.writeHead(200);res.write(Buffer.alloc(1024));return;}
  res.end("%PDF-owned-loopback");
 });
 server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
 await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.removeListener("error",reject);resolve();});});
 const address=server.address();if(!address||typeof address==="string")throw new Error("owned loopback listener unavailable");
 mode={configured:true,endpoint:`http://127.0.0.1:${address.port}`,bucket:"owned-bounds",region:"us-east-1",forcePathStyle:true,autoCreateBucket:false,credentialsMode:"static"};
 resetS3ClientCache();
 // Resolve the lazy SDK on this owned listener before measuring cancellation.
 expect((await s3GetBytes(mode,"warm")).toString()).toBe("%PDF-owned-loopback");
},10000);
afterAll(async()=>{
 resetS3ClientCache();
 if(server){for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 if(scratch){expect(dirname(await realpath(scratch))).toBe(await realpath(tmpdir()));expect(basename(scratch)).toStartWith("docurama-storage-bounds-");await rm(scratch,{recursive:true,force:true});}
 for(const [name,value]of prior){if(value===undefined)delete process.env[name];else process.env[name]=value;}
});
describe("bounded authoritative source reads",()=>{
 test("normal and bounded owned S3 reads return the same bytes",async()=>{
  const normal=await s3GetBytes(mode,"normal"),bounded=await s3GetBytes(mode,"bounded",{timeoutMs:1500,maxBytes:64});
  expect(bounded).toEqual(normal);
 });
 test("deadline aborts both stalled headers and stalled bodies and closes owned response",async()=>{
  for(const name of ["slow-headers","slow-body"]){const start=performance.now();
   await expect(s3GetBytes(mode,name,{timeoutMs:150,maxBytes:64})).rejects.toThrow("deadline");
   expect(performance.now()-start).toBeLessThan(1500);expect(seen.get(name)).toBe(1);
   await within(closed.get(name)!);
  }
 });
 test("declared and streamed size overruns destroy owned response before completion",async()=>{
  for(const name of ["header-oversize","stream-oversize"]){
   await expect(s3GetBytes(mode,name,{timeoutMs:1500,maxBytes:64})).rejects.toThrow("size limit");
   expect(seen.get(name)).toBe(1);await within(closed.get(name)!);
  }
 });
 test("caller cancellation stops an active owned S3 body",async()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{timer=setTimeout(()=>controller.abort(),100);
   await expect(s3GetBytes(mode,"slow-body",{timeoutMs:1500,maxBytes:64,signal:controller.signal})).rejects.toThrow("cancelled");
   await within(closed.get("slow-body")!);
  }finally{if(timer!==undefined)clearTimeout(timer);}
 });
 test("local reads enforce caps and preserve default read compatibility",async()=>{
  const access=process.env.S3_ACCESS_KEY_ID,secret=process.env.S3_SECRET_ACCESS_KEY;
  delete process.env.S3_ACCESS_KEY_ID;delete process.env.S3_SECRET_ACCESS_KEY;
  try {
  const normal=await readStoredBytes(key);expect(normal.toString()).toBe("%PDF-synthetic-local-bytes");
  expect(await readStoredBytes(key,{timeoutMs:1000,maxBytes:64})).toEqual(normal);
  await expect(readStoredBytes(key,{timeoutMs:1000,maxBytes:4})).rejects.toThrow("size limit");
  const controller=new AbortController();controller.abort();
  await expect(readStoredBytes(key,{timeoutMs:1000,maxBytes:64,signal:controller.signal})).rejects.toThrow("cancelled");
  for(const invalid of ["documents/../doc_"+"a".repeat(32)+".pdf","documents/tenant-test/not-a-minted-id.pdf"])
   await expect(readStoredBytes(invalid,{timeoutMs:1000,maxBytes:64})).rejects.toThrow();
  } finally {process.env.S3_ACCESS_KEY_ID=access;process.env.S3_SECRET_ACCESS_KEY=secret;}
 });
 test("bounded stream destroys an overrun that was absent from metadata",async()=>{
  const stream=Readable.from([Buffer.alloc(32),Buffer.alloc(64)]);
  await expect(withStorageReadLimits({timeoutMs:1000,maxBytes:64},bound=>readLimitedByteStream(stream,bound))).rejects.toThrow("size limit");
  expect(stream.destroyed).toBe(true);
 });
 test("stream deadline stops a producer awaiting more bytes",async()=>{
  const stream=new Readable({read(){this.push(Buffer.from("first"));this._read=()=>{};}});
  const streamClosed=once(stream,"close");
  await expect(withStorageReadLimits({timeoutMs:50,maxBytes:64},bound=>readLimitedByteStream(stream,bound))).rejects.toThrow("deadline");
  expect(stream.destroyed).toBe(true);await within(streamClosed);
 });
 test("abortable metadata does not start an eventual data read after cancellation",async()=>{
  const controller=new AbortController();let complete!:(value:string)=>void;
  const metadata=new Promise<string>(resolve=>{complete=resolve;});
  const pending=abortableMetadata(metadata,controller.signal);controller.abort();
  await expect(pending).rejects.toThrow("cancelled");complete("late stat completion");
 });
 test("already-aborted metadata observes a late rejection without leaving an unhandled promise",async()=>{
  const controller=new AbortController();controller.abort();
  await expect(abortableMetadata(Promise.reject(new Error("late metadata error")),controller.signal)).rejects.toThrow("cancelled");
 });
 test("initialization waiting on a late result cannot exceed the read deadline",async()=>{
  let complete!:(value:string)=>void;
  const initialization=new Promise<string>(resolve=>{complete=resolve;});
  const started=performance.now();
  await expect(withStorageReadLimits({timeoutMs:50},async()=>initialization)).rejects.toThrow("deadline");
  expect(performance.now()-started).toBeLessThan(1500);complete("late initialization completion");
 });
 test("uncancellable iterator bodies are rejected before consuming data",async()=>{
  let consumed=false;
  const body={async *[Symbol.asyncIterator](){consumed=true;yield Buffer.from("bytes");}};
  await expect(withStorageReadLimits({timeoutMs:1000,maxBytes:64},bound=>readLimitedByteStream(body,bound))).rejects.toThrow("cancelled safely");
  expect(consumed).toBe(false);
 });
 test("invalid limit values fail before requesting source data",async()=>{
  for(const limits of [{timeoutMs:0},{timeoutMs:Infinity},{maxBytes:0},{maxBytes:NaN}]){
   let touched=false;await expect(withStorageReadLimits(limits,async()=>{touched=true;})).rejects.toThrow("Invalid");expect(touched).toBe(false);
  }
 });
});

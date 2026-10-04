import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/serializers";
import { signerReadRestriction } from "@/lib/signing-policy";
import { buildFinalDocument, FinalDocumentError } from "@/lib/final-document";
import { ContractSnapshotError } from "@/lib/contract-snapshot";
import { readSignatureData, SignatureDataError } from "@/lib/signature-data";
import { EnvelopeFieldsError } from "@/lib/envelope-fields";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{token:string}> }) {
  try {
    const {token}=await ctx.params;
    if(!token||token.length>256)return jsonError("Invalid recipient link",404);
    const recipient=await db.recipient.findUnique({where:{accessToken:token},include:{envelope:{include:{
      document:true,recipients:{orderBy:{order:"asc"}},events:{orderBy:{at:"asc"}},tenant:{select:{status:true}},
    }}}});
    if(!recipient)return jsonError("Invalid recipient link",404);
    const e=recipient.envelope;
    if (e.document && e.document.tenantId !== e.tenantId) return jsonError("Invalid document workspace binding",409);
    const restriction=signerReadRestriction(e.tenant);
    if(restriction)return jsonError(restriction,409);
    if(!["SIGNER","CC"].includes(recipient.role)||e.status!=="COMPLETED"||!e.sealedAt)return jsonError("Available only to recipients after every signer completes",409);
    const final=await buildFinalDocument(e);
    if(req.nextUrl.searchParams.get("format")==="record"){
      return Response.json({code:e.publicCode,status:e.status,sealedAt:e.sealedAt.toISOString(),originalSha256:e.documentId?e.sha256:null,
        finalDocumentSha256:final.sha256,completionRecordSha256:final.recordSha256,pages:final.pages,evidenceSha256:e.evidenceSha256 ?? null,conformance:null,signers:e.recipients.filter(r=>r.role==="SIGNER").map(r=>({name:r.name,email:r.email,order:r.order,status:r.status,signedAt:r.signedAt?.toISOString()??null,authMethod:"EMAIL_LINK",adoptedName:readSignatureData(r.signatureData).name,consentText:readSignatureData(r.signatureData).consent,consentAcceptedAt:readSignatureData(r.signatureData).consentAcceptedAt})),
        eventCount:e.events.length,events:e.events.map(ev=>({at:ev.at.toISOString(),actor:ev.actor,action:ev.action,detail:ev.detail}))},
        {headers:{"cache-control":"no-store"}});
    }
    if(req.nextUrl.searchParams.get("format")==="record-pdf") return new Response(new Uint8Array(final.recordBytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${e.publicCode}-completion-record.pdf"`,"cache-control":"no-store","x-document-sha256":final.recordSha256}});
    return new Response(new Uint8Array(final.bytes),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${e.publicCode}-completed.pdf"`,"cache-control":"no-store","x-document-sha256":final.sha256}});
  }catch(error){
    if(error instanceof FinalDocumentError||error instanceof ContractSnapshotError||error instanceof SignatureDataError||error instanceof EnvelopeFieldsError)return jsonError(error.message,409);
    console.error("[completed document]",error);return jsonError("The completed document could not be generated",500);
  }
}

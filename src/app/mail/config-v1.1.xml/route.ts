import { NextRequest, NextResponse } from "next/server";

/**
 * Thunderbird / K-9 autoconfig (config-v1.1.xml), per the ISPDB database
 * autoconfig format. Served on mail.docurama.eu and any host at
 * /mail/config-v1.1.xml?emailaddress=…
 */
export function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("emailaddress") ?? "";
  const domain = email.split("@")[1] || "docurama.eu";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${domain}">
    <domain>${domain}</domain>
    <displayName>Docurama Mail</displayName>
    <displayShortName>Docurama</displayShortName>
    <incomingServer type="imap">
      <hostname>mail.docurama.eu</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>mail.docurama.eu</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

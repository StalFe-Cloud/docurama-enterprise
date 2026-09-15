import { NextResponse } from "next/server";

/**
 * Outlook Autodiscover (POX). Clients POST or GET
 * /autodiscover/autodiscover.xml with the mailbox address; we answer with
 * the same IMAP/SMTP endpoints as the Thunderbird autoconfig.
 */
export function GET() {
  return respond();
}

export function POST() {
  return respond();
}

function respond() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <User>
      <DisplayName>Docurama Mail</DisplayName>
    </User>
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <Protocol>
        <Type>IMAP</Type>
        <Server>mail.docurama.eu</Server>
        <Port>993</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>%EMAILADDRESS%</LoginName>
        <SSL>on</SSL>
      </Protocol>
      <Protocol>
        <Type>SMTP</Type>
        <Server>mail.docurama.eu</Server>
        <Port>587</Port>
        <DomainRequired>off</DomainRequired>
        <LoginName>%EMAILADDRESS%</LoginName>
        <SSL>on</SSL>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

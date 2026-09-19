---
title: "Get your team signing in one afternoon: a 45-minute rollout plan"
description: "A practical onboarding plan for rolling Docurama out to a small team — workspace setup, domain verification, team groups, templates and the first real envelope, in under an hour."
date: 2026-09-13
author: "Docurama Team"
tags: [product, onboarding, teams]
draft: false
---

You do not need a project plan to adopt eSignatures — you need one focused afternoon. Here is the 45-minute rollout we recommend to new Business workspaces; the same shape works for Starter with three seats.

## Minutes 0–10: workspace and signature

Sign up and the wizard walks you through the essentials — name your organization, adopt your signature (draw it, type it in one of three handwriting fonts, or upload a stamp). The signature you adopt here is what appears on every envelope you sign. Enable two-factor authentication when the wizard offers it; on Business and Enterprise you can require it for every member from Settings → Users.

## Minutes 10–20: invite the team

Settings → Users → invite your teammates by email, assigning roles as you go: `OWNER` or `ADMIN` for people who manage billing and templates, `MEMBER` for senders. Pending invitations hold a seat from the moment you send them, so your seat count stays honest. On Business and above, organize members into small teams — Sales, HR, Legal — so templates and envelope visibility follow your org chart instead of fighting it.

## Minutes 20–35: look like yourselves

Two settings do the brand work:

1. **Sending domain** (Settings → Account). Add your domain; we verify it over live DNS (TXT) before any mail leaves from it. Signing invitations arrive from `contracts@yourcompany.com`, not from us — better deliverability, better trust, and the signer portal shows a verified-sender badge that helps recipients spot phishing.
2. **Contract templates.** Instead of uploading PDFs repeatedly, turn your NDA, quotation and supply agreement into templates with recipient roles and routing order. The [template library](/modeles-de-contrats) has French-law starters you can adapt in minutes.

## Minutes 35–45: the first real envelope

Pick something friendly — an NDA with a partner, not the 80-page supply agreement. Documents → New envelope: choose the template or upload a PDF, add recipients in routing order, write a one-line personal message, send. Your recipient gets a personal link to a one-page signing experience: document preview (watermarked, so nobody screenshots a clean copy before signing), signature adoption, eIDAS consent, done.

Then watch three things happen:

- Each signer's action lands in the envelope's event ledger — opened, viewed, signed, sealed.
- On completion, the envelope seals with a PAdES-conformance signature and an RFC 3161 timestamp.
- The document gets a public verification code — send it to your counterparty so *they* can prove it too.

Export the evidence pack once, open `verify.html` offline, and you will understand the product better than any demo could.

## After the first envelope

- Set a **reminder policy** (Settings → Notifications) so chasing becomes automatic — quiet hours respected, SMS escalation for the urgent ones.
- Wire the **REST API** or **MCP server** (Settings → API) if signing lives inside your own tools.
- Skim the [knowledge base](/docs) — sending, templates, verification, compliance and self-hosting are each a five-minute read.

That is the afternoon. If anything takes longer than promised, tell us — the feedback link in the app reaches the team that builds it.

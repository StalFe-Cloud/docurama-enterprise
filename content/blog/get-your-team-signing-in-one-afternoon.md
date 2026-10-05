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

Sign up, name your organization and configure your account. In the public email-link signing flow, each signer enters a typed signature name and explicitly adopts it for the contract. An account signature or selected handwriting style does not guarantee that a handwritten rendering appears in every completed PDF.

## Minutes 10–20: invite the team

Settings → Users → invite your teammates by email, assigning roles as you go: `OWNER` or `ADMIN` for people who manage billing and templates, `MEMBER` for senders. Pending invitations hold a seat from the moment you send them, so your seat count stays honest. On Business and above, organize members into small teams — Sales, HR, Legal — so templates and envelope visibility follow your org chart instead of fighting it.

## Minutes 20–35: look like yourselves

Two settings do the brand work:

1. **Sending domain and SMTP identity.** Configure an authorized SMTP relay and sender address. A workspace sender override requires a currently verified sending domain; DNS verification does not configure the relay or establish mailbox delivery. Test actual delivery to controlled inboxes before using it with recipients.
2. **Contract templates.** Instead of uploading PDFs repeatedly, turn your NDA, quotation and supply agreement into templates with recipient roles and routing order. The [template library](/modeles-de-contrats) has French-law starters you can adapt in minutes.

## Minutes 35–45: the first real envelope

Pick something friendly — an NDA with a partner, not the 80-page supply agreement. Documents → New envelope: choose the template or upload a PDF, add recipients in routing order, write a one-line personal message, send. Your recipient gets a personal link to a one-page signing experience: document review, typed signature adoption and explicit consent.

Then watch three things happen:

- Each signer's action lands in the envelope's event ledger — viewed, signed and completed.
- On completion, download the completed document PDF and separate signing record PDF. This flow records email-link signing and digest evidence; it does not embed PAdES signatures or obtain independent timestamps.
- The document gets a public verification code — send it to your counterparty so they can inspect the reported record.

Export the evidence pack once, open `verify.html` offline, and you will understand the product better than any demo could.

## After the first envelope

- Set a **reminder policy** (Settings → Notifications) so chasing becomes automatic — quiet hours respected, SMS escalation for the urgent ones.
- Wire the **REST API** or **MCP server** (Settings → API) if signing lives inside your own tools.
- Skim the [knowledge base](/docs) — sending, templates, verification, compliance and self-hosting are each a five-minute read.

That is the afternoon. If anything takes longer than promised, tell us — the feedback link in the app reaches the team that builds it.

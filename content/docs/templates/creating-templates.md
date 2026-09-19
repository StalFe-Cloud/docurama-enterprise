---
title: Creating Templates
description: Build reusable envelope templates from scratch or from the French contract library, with roles, routing order and per-plan template limits.
group: Templates
order: 1
tags: [templates, routing, envelopes]
---

A template is a reusable envelope blueprint: its document or contract text, its recipient roles and its routing order. Sending from a template takes seconds and keeps contract language consistent across the whole team — the Sales group sends the same NDA wording every time, because it comes from the same template.

## What goes into a template

- **Name and description** — internal labels your team sees in the template library.
- **The document** — an uploaded PDF, or contract text written directly in the template.
- **Roles** — signer roles and CC recipients, named by function ("The Client", "The Supplier") rather than by email address.
- **Routing order** — the turn order in which recipients act when the envelope is sent.

## Creating a template from scratch

Open the **Templates** section of the workspace and choose **New template**:

1. Name the template. The name is internal; signers see the envelope title you set when sending.
2. Add the document — upload a PDF, or write the contract text the signers will read.
3. Define the roles and their routing order.
4. Save. The template is immediately available to everyone in the workspace.

## Starting from the French contract library

The fastest route for common French-law contracts is the [French contract library](/docs/templates/template-library) at `/modeles-de-contrats`. Browse the catalogue, open a template and choose **Use template**: the send dialog opens pre-filled with the document, the roles and the routing order. You can adjust anything before sending, and adjusting does not modify the library entry.

## Roles and routing order

Routing order is **enforced**, not advisory. When an envelope is sent, each recipient receives a personal `/sign/{token}` link by email, and recipient two cannot sign until recipient one has. On the signer portal, each recipient sees the document with a **per-recipient watermark**, the signers rail with live status, and the standard signing experience: adopt a signature, eIDAS consent, or decline with a reason.

CC recipients are not part of the routing order — they receive a copy of the completed envelope.

## Template limits per plan

| Plan | Templates included |
| --- | --- |
| Solo | 2 |
| Starter | 2 |
| Business | Unlimited |
| Business | Unlimited |
| Enterprise | Unlimited |

If you hit the two-template limit on Solo or Starter, clean up templates you no longer send, or upgrade from **Settings → Billing** — Business and above include unlimited templates.

## Sending from a template

From the **Templates** section, choose a template and start a send. The dialog arrives pre-filled — title, message, roles and routing — and you only enter the actual recipient emails. Any per-envelope edits (a name, a clause, a title) apply to that envelope only; the template is untouched.

Sent envelopes keep a link to the source template in their evidence chain, so you can always answer "which version of the contract produced this signed copy?" months later.

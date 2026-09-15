---
title: Quickstart
description: From signup to a working workspace in six steps.
group: Getting started
order: 2
tags: [onboarding, signup, setup]
---

This page takes you from nothing to a workspace that can send envelopes. It
follows the onboarding wizard at `app.docurama.eu/welcome`, which tracks the
same six steps and shows which ones are still open.

## 1. Create your account

Sign up at `app.docurama.eu/welcome`. Signup creates your user account and an
organization workspace in one step, and starts a 14 day Starter trial. The
trial length is a platform setting, so your deployment may differ.

## 2. Verify your email

A verification link is sent from `notifications@docurama.eu`. The raw token
only ever exists inside that link; the database stores a SHA-256 hash of it.

> [!IMPORTANT]
> **No outbound SMTP transport is wired on this deployment yet.** Transactional
> mail is written to the mail ledger with status `QUEUED`, carrying the raw
> link, instead of being silently dropped. Until a transport is provisioned,
> the onboarding wizard offers workspace admins an audited shortcut to mark the
> address verified. See [Email delivery](/docs/account/email-delivery).

## 3. Name your organization

Give the workspace its real name and pick an industry and company size. The
industry and size are optional context captured once; they tune workspace
defaults and are not used for anything else.

## 4. Add your signature

Draw, type or upload a signature. Signatures are stored per user, not per
document, so they are reused on every envelope you sign. You can keep several
and mark one as the default. Initials are stored as a separate kind alongside
full signatures.

## 5. Invite your team

Invitations are tokenised links of the form `/invite/<token>`. Each invitation
carries a role (`OWNER`, `ADMIN` or `MEMBER`), expires after 14 days and can be
revoked before it is accepted. See [Users and roles](/docs/account/users-and-roles).

## 6. Turn on two-factor authentication

Enrol TOTP under **Settings, Profile**. Workspace owners and admins can make it
mandatory for every member under **Settings, Users**. Enrolment returns ten
recovery codes exactly once; only their hashes are stored. See
[Two-factor authentication](/docs/account/two-factor-authentication).

## What to do next

- Send something: [Sending an envelope](/docs/signing/sending-an-envelope)
- Learn the vocabulary: [Core concepts](/docs/getting-started/core-concepts)
- Send from your own domain: [Sending domains](/docs/account/sending-domains)
- Automate it: [API overview](/docs/api)

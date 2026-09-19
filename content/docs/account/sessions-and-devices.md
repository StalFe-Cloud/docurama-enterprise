---
title: Sessions and Devices
description: Server-side sessions you can revoke instantly, and the device list for reviewing what is signed in where.
group: Account and security
order: 2
tags: [security, sessions, devices]
---

Where you are signed in matters as much as what your password is. Docurama sessions are stored and validated server-side, which makes them revocable in a way pure cookie tokens never are — and gives you a device list to review.

## Server-side sessions

Every sign-in creates a session that lives on the server. Each subsequent request validates against it, so the session's fate is under your control at all times:

- **Revoking a session takes effect immediately.** There is no grace window in which a stolen cookie keeps working after you kill it — the next request with that session is refused.
- **Signing out revokes the session you signed out of**, on that device, at that moment.

## The device list

**Settings → Profile** shows your active sessions: which browser or device each one belongs to, and when it was last active. Review it the way you review card statements occasionally: everything on the list should be yours, and anything you do not recognize should be revoked on sight.

## When to revoke

- A laptop or phone is **lost or stolen** — revoke its session from another device before it occurs to anyone to use it.
- You signed in on a **shared or borrowed computer** — a reception desk, a client's meeting room.
- You see a session **you do not recognize** — revoke it, then change your password.
- You **changed your password** — a clean moment to clear every other session.

Revoking one session affects only that device. Your other sessions, your API keys and your 2FA enrolment are untouched.

## What revocation does not do

- It does not affect **signer links**. Recipients are not users with sessions: their personal `/sign/{token}` links live and die with the envelope, not with anybody's session.
- It does not reset your password, your stored signatures or your 2FA enrolment.
- It does not touch **API keys** — those are separate credentials with their own scopes; revoke them from **Settings → API** if a key is compromised.

## The audit trail

Session changes are recorded as audit events like every other mutation in the platform. If you ever need to answer "when was that session revoked, and by whom", the audit log has it.

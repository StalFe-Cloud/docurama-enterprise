---
title: Two-Factor Authentication
description: Enrol a TOTP authenticator app, keep your recovery codes safe, and enforce 2FA across the whole workspace.
group: Account and security
order: 1
tags: [security, 2fa, totp]
---

Docurama supports time-based one-time passwords (TOTP) — the six-digit codes from any authenticator app. Enrolment is per user; enforcement is per workspace. Both take less than five minutes, and the five minutes are worth it: 2FA stops the stolen-password class of account takeover entirely.

## Enrolling

1. Open **Settings → Profile** and enable two-factor authentication.
2. Scan the displayed QR code with your authenticator app — Google Authenticator, Aegis, 1Password, Authy, or your company's app of choice.
3. Enter the current code to confirm enrolment.

From then on, signing in asks for your password and a current code.

## Recovery codes

Enrolment generates **ten recovery codes**, displayed **exactly once** — Docurama stores only hashes of them. Save them where you would save house keys: a password manager, or printed in a drawer at home.

Each code works **once**, in place of a TOTP code — typically when you replace your phone and the authenticator does not carry over. If you burn through a few, you still have the rest; the count left is a good reason not to store them on the phone they are meant to rescue.

## Enforcing 2FA workspace-wide

Workspace owners and admins can make 2FA **mandatory for every member** from **Settings → Users**. Once enforced:

- members who have not enrolled are required to do so,
- new members meet the 2FA step during onboarding — the welcome wizard includes it,
- and the workspace no longer has that one colleague who "meant to get around to it".

For teams handling contracts all day, org-wide enforcement is the recommended posture.

## If you lose your device

1. Sign in with a **recovery code**.
2. Re-enrol from **Settings → Profile** with your new device — this generates a fresh TOTP secret and a **fresh set of ten recovery codes**.
3. Codes from the previous enrolment stop working.

If you have no recovery codes left, contact `support@docurama.eu` from your account email. Be prepared to prove control of the account. An honest note: support cannot read your codes or your TOTP secret — nobody can, which is the point.

## 2FA and single sign-on

If your workspace signs in through an identity provider, your IdP's own MFA policy protects the SSO path — enforce it there (see [Single sign-on](/docs/account/single-sign-on)). The local TOTP protects the password sign-in path; SSO-provisioned accounts have no usable password until they deliberately set one via the reset flow.

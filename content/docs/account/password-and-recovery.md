---
title: Password and Account Recovery
description: Reset your password with a single-use email link, know how SSO accounts differ, and what to do when you are locked out.
group: Account and security
order: 4
tags: [password, recovery, account]
---

Passwords fail in two directions: forgotten and compromised. Both are recoverable in a couple of minutes, and neither requires anyone at Docurama — or anyone in your workspace — to see your password.

## Resetting your password

From the sign-in page:

1. Choose **Forgot password?** and enter your account email.
2. You receive an email containing a single-use reset link.
3. Open the link and choose a new password.

The reset link carries the raw token; the database stores only a **SHA-256 hash** of it. That means the link is worthless after use, cannot be read out of the database, and cannot be reused by anyone who glimpses it.

If the email never arrives, check the spam folder and try again — persistent silence usually means the address was typed wrong, so double-check the account you are resetting.

## After a reset

- **Review your sessions.** If you reset because of a suspected compromise, revoke everything else from **Settings → Profile** — see [Sessions and devices](/docs/account/sessions-and-devices).
- **2FA stays enrolled.** A password reset does not turn off two-factor authentication: you will still need your authenticator or a recovery code. If the device is the thing you lost, see [Two-factor authentication](/docs/account/two-factor-authentication).

## Choosing a password

Use a unique password for Docurama — a password manager makes uniqueness free. Length beats cleverness: four random words are stronger and easier to type than `P@ssw0rd!23`. Never reuse a password that has ever appeared in a breach; your password manager will tell you when one has.

## SSO accounts and passwords

Members provisioned through single sign-on have **no usable password** — sign-in happens through your identity provider, which is precisely the point of SSO. If an SSO member ever needs a local password (an IdP outage, for instance), the standard password reset flow above lets them set one. Day-to-day they should keep using SSO, and the enforced MFA policy lives in your IdP. See [Single sign-on](/docs/account/single-sign-on).

## If you are locked out

- **Password forgotten** — use the reset flow above.
- **2FA device lost** — sign in with a recovery code, then re-enrol with the new device.
- **No recovery codes left** — contact `support@docurama.eu` from your account email and be ready to prove the account is yours.

## What admins cannot do

Workspace admins cannot read, set or reset your password. Recovery always goes through your own inbox, by design — a compromised admin account must never become a path into every member's account. The one thing admins *can* enforce is two-factor authentication for everyone, which is the control that actually matters.

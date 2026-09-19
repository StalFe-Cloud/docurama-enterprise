---
title: Single Sign-On (SSO)
description: Connect your identity provider over OIDC or SAML 2.0, bind it to your company email domain, and let members sign in with one button.
group: Account and security
order: 3
tags: [sso, oidc, saml, security]
---

Docurama supports single sign-on over **OIDC** and **SAML 2.0**. A connection is managed by workspace owners and admins in **Settings → SSO** and is **bound to your company email domain** — one active connection per domain. Members type their email on the login page and a **Continue with {label}** button appears for the matching domain; behind it, your identity provider does the authentication.

## Before you start

- A domain your members' email addresses share, for example `@yourcompany.com`.
- An app or client registration in your identity provider.
- An owner or admin account on the Docurama workspace.

## Setting up OIDC

Works with **Microsoft Entra ID, Google Workspace, Okta, Keycloak and Authentik**, and any other standards-compliant OIDC provider.

1. In **Settings → SSO**, add an OIDC connection.
2. Register a client in your IdP and configure its **redirect URI**:

   ```
   https://app.docurama.eu/api/auth/sso/callback/oidc
   ```

   The redirect URI always follows the pattern `{origin}/api/auth/sso/callback/oidc` — on a self-hosted deployment, use your own origin.

3. In Docurama, enter the **issuer URL**, the **client ID** and the **client secret**, and give the connection a label — the label is the text on the Continue button.
4. Use the **discovery test** button to confirm Docurama can reach your IdP's discovery document before anyone relies on the connection.

## Setting up SAML 2.0

1. In **Settings → SSO**, add a SAML connection.
2. Give your IdP Docurama's SP metadata, published at:

   ```
   https://app.docurama.eu/api/auth/sso/metadata/saml
   ```

   The assertion consumer service (ACS) URL is `{origin}/api/auth/sso/callback/saml`.

3. Paste your **IdP metadata XML** into Docurama.
4. Save, then test with one member before rolling the connection out to the whole domain.

## Domain binding and the login experience

A connection is bound to one email domain, and only one connection can be active per domain. On the login page, a member types their email address; if the domain has an active connection, the **Continue with {label}** button appears. Addresses on other domains — a personal webmail address, a contractor on their own domain — simply sign in with a password as usual.

## Just-in-time provisioning

The first time someone signs in through SSO, their account is created automatically: **active, email-verified, and a MEMBER of the workspace**. No invitations to send, no seat to pre-hold — the user exists the moment your IdP says they are real. Owners and admins can promote them to ADMIN afterwards like any other member.

## SSO and passwords

SSO-provisioned accounts have **no usable password** — there is nothing to phish or brute-force. If a member ever needs the password path, for example during an IdP outage, the normal password reset flow lets them set one (see [Password and account recovery](/docs/account/password-and-recovery)). Day-to-day, they should keep using SSO.

## Troubleshooting

- **The Continue button does not appear** — the typed email's domain must exactly match the connection's domain, and the connection must be active. Check both in **Settings → SSO**.
- **The discovery test fails** — verify the issuer URL: it must be the base URL your IdP actually publishes, with the correct scheme and no trailing path that does not exist.

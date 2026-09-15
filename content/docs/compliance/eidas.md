---
title: eIDAS & Legal Admissibility
description: Understanding EU Regulation No 910/2014, signature tiers, and legal weight under French Civil Code Article 1367.
group: Compliance
order: 1
tags: [eidas, legal, france]
---

# eIDAS & Legal Admissibility

Under European Union law and Article 1367 of the French Civil Code (*Code civil*), an electronic signature has the same legal value as a handwritten signature when it reliably identifies the signatory and guarantees the integrity of the signed act.

## eIDAS Signature Tiers

Regulation (EU) No 910/2014 defines three distinct tiers:

### 1. Simple Electronic Signature (SES)
- Standard signature affixed via web browser.
- Authenticated via email link delivery, cryptographic session cookies, and audit log.
- Suitable for standard business contracts, quotes, and non-contentious agreements.

### 2. Advanced Electronic Signature (AES)
- Uniquely linked to the signatory.
- Capable of identifying the signatory (e.g. via SMS OTP two-factor authentication).
- Created using electronic signature creation data that the signatory can, with a high level of confidence, use under their sole control.
- Linked to the data signed in such a way that any subsequent change in the data is detectable (SHA-256 seal).

### 3. Qualified Electronic Signature (QES)
- Created by a Qualified Electronic Signature Creation Device (QSCD) and based on a qualified certificate issued by an accredited EU QTSP.
- Carries the automatic legal presumption of equivalence to handwritten signatures across all EU Member States.

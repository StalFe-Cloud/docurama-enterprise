---
title: Roles, Invites and Seats
description: What owners, admins and members can do, how tokenized invitations work, and why a pending invite already holds a seat.
group: Teams and roles
order: 1
tags: [teams, roles, invites, seats]
---

Every workspace member holds one of three roles: OWNER, ADMIN or MEMBER. Roles decide what a member can change; seats decide how many members you can have. The two interact through one rule that surprises people the first time: **a pending invitation already holds a seat**.

## The three roles

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| Send envelopes, manage documents and templates | ✔ | ✔ | ✔ |
| Manage their own profile, signature and 2FA | ✔ | ✔ | ✔ |
| Invite members and manage roles | ✔ | ✔ | |
| Manage team groups | ✔ | ✔ | |
| Manage SSO connections | ✔ | ✔ | |
| Enforce 2FA workspace-wide | ✔ | ✔ | |
| Plan, term and billing management | ✔ | | |

The account that created the workspace holds the owner role. Roles are per workspace — being an admin here says nothing about any other workspace.

## How invitations work

1. An owner or admin invites from **Settings → Users**: an email address plus a role.
2. The invitee receives a tokenized link of the form `/invite/<token>` that carries the role.
3. The invitee opens it, sets a password, and joins the workspace in that role.

Invitations **expire after 14 days** and can be **revoked** before acceptance. Revoking is the right move when someone left the company before ever signing in — it frees their seat immediately.

## Pending invites hold a seat

Seats are enforced **at invite time, not at join time**: a pending invitation counts against your plan's seat count from the moment it is sent. When members plus pending invitations fill the plan's seats, further invites are refused with a clear error ("All N seats…"). Nothing silently overbooks; nothing lets you invite ten people into three seats.

### Seat math, with an example

Starter has three seats:

- 1 owner + 1 member + 1 pending invite = 3 seats used. The next invite is blocked.
- Revoke the stale invite → a seat frees up → you can invite again.
- Genuinely need more senders? Change the plan in **Settings → Billing**.

Business includes 10 seats. For larger teams, contact sales about Enterprise.

## Seats vs recipients

Seats are only for people working **inside** the workspace. Recipients and signers — the people who receive envelopes — never need an account, never need a seat, and are **unlimited on every plan**. Ten directors signing one envelope still cost you zero seats.

## Changing roles

Owners and admins change a member's role from **Settings → Users**. Promote a trusted member to admin when they run the team day-to-day; keep billing with the owner. For organizing members into Sales, HR and Legal groups — which is labeling, not permissions — see [Team groups](/docs/teams/team-groups).

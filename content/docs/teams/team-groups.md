---
title: Team Groups
description: Organize members into small groups such as Sales, HR and Legal, available from Business and above.
group: Teams and roles
order: 2
tags: [teams, groups, organization]
---

Workplaces have departments; workspaces deserve them too. Team groups let you organize members into small, named groups — Sales, HR, Legal — so a growing member list stays legible and the org chart is visible inside Docurama itself.

## What team groups are

A team group is a named set of workspace members. Groups are small by design — the Sales group, the HR group — matching how companies actually split responsibility for contracts: Sales sends quotations, HR sends employment paperwork, Legal sends the NDAs everyone else borrows.

## Availability

Team groups are available on **Business and Enterprise**. On Solo and Starter the member list is small enough that groups would be ceremony: Solo has one member, Starter three.

## Creating and managing groups

Everything lives in **Settings → Users**:

- The **Teams card** lists your existing groups — create, rename or delete them there.
- Each member row carries a **Team column** — assign a member to a group from there, or leave them ungrouped.

Group operations — create, rename, delete, and assigning members — are **admin-only**, and every one of them lands in the audit trail. Group names must be unique within the workspace; a duplicate name is rejected rather than silently merged.

## What groups are good for

- **Keeping Settings → Users scannable.** A growing workspace reads much better as Sales / HR / Legal than as a flat alphabetical list.
- **Answering "who is in the Legal team?"** with one glance instead of an org-chart archaeology session.
- **Making templates make sense.** When the template library holds a dozen house contracts, knowing that the NDA set belongs to the Legal group gives every member a starting point.

## What groups are not

Team groups are **purely organizational**. Membership does not change visibility of documents, envelopes or templates in any way — a member of the Sales group sees exactly what they would see with no group at all. Groups are also not a permission system: they cannot grant or restrict anything. For permissions, see [Roles, invites and seats](/docs/teams/roles-and-invites); for security controls that actually bite, look at 2FA enforcement and [single sign-on](/docs/account/single-sign-on).

## Deleting a group

Deleting a group never deletes or unassigns its members — they simply become ungrouped and stay in the workspace with their roles untouched. Deleting the Sales group because you renamed it to "Revenue" is safe; creating the new one first keeps the column populated throughout.

---
title: Reminders and Quiet Hours
description: The three reminder mechanisms, quiet hours and weekend settings, and SMS or WhatsApp escalation on Business and above.
group: Notifications
order: 1
tags: [notifications, reminders, quiet-hours, sms]
---

People forget to sign. Docurama gives you three ways to nudge a pending recipient, plus settings that keep the nudging polite — quiet hours, weekend silence, and escalation channels for signers who live in their text messages rather than their inbox.

## The three reminder mechanisms

| Mode | What it is | When to use it |
| --- | --- | --- |
| Manual nudge | A reminder you fire right now from an envelope | Ad-hoc, one envelope, today |
| Per-envelope schedule | A reminder schedule configured on the envelope | Contracts with a deadline |
| Platform jobs | The background jobs that run your configured schedules automatically | Everything — nobody needs to be logged in |

### Manual nudges

From the documents table or the envelope details, choose **Remind**: the pending recipient receives a reminder email immediately. Use it when a signer calls you and says "send it again".

### Per-envelope schedules

When you send an envelope — or afterwards from its details — you can configure a reminder schedule. Reminders then go out on that schedule for as long as the envelope waits, without anyone lifting a finger.

### Platform jobs

Schedules are delivered by the platform's background jobs, which run whether or not anyone has the workspace open. A reminder configured on Friday evening still fires on Monday morning.

Reminders go to the recipient whose turn it is — recipients who already signed, and those not yet up in the routing order, are not nagged.

## Quiet hours

In **Settings → Notifications** you can define **quiet hours**, for example 20:00–08:00. Reminders that would fall inside the window are held and delivered after it ends. Your signers deal with enough midnight notifications; contract reminders do not need to be among them.

## Weekends

The weekend setting keeps **Saturday and Sunday silent**. Combined with quiet hours, it means signers only ever hear from you during business hours — which, in practice, is also when reminder emails perform best.

## SMS and WhatsApp escalation

On **Business and above**, you can escalate a pending recipient by **SMS or WhatsApp** when email is not getting through — ideal for site managers, external partners and executives who answer texts within minutes and emails within weeks. SMS settings live in **Settings → SMS**.

Escalated messages carry the same personal signing link as the email invitation. One caution: the link is **personal to that recipient** — never paste one signer's link into a group chat, and never let one recipient sign for another.

## Sender identity

Reminders come from the same sender as the original invitation. If you verified a sending domain, reminders benefit from the same deliverability and the verified-sender badge on the signer portal — see [Sending domains](/docs/domains/sending-domains).

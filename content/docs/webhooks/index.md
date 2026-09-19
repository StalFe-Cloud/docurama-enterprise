---
title: Webhooks
description: Subscribe to envelope lifecycle events over HTTPS, verify every delivery with a per-endpoint HMAC-SHA256 secret, and inspect retries.
group: Webhooks
order: 1
tags: [webhooks, integrations, hmac, api]
---

Instead of polling the REST API, register an HTTPS endpoint and Docurama pushes an event every time something happens to your envelopes. Webhooks are managed in **Settings → API**, and every delivery is cryptographically signed so you can prove it came from Docurama and not from whoever found your URL.

## Events

| Event | Fired when |
| --- | --- |
| `envelope.sent` | The envelope is dispatched and recipients receive their links |
| `envelope.viewed` | A recipient opens their signing link |
| `envelope.signed` | A recipient signs |
| `envelope.sealed` | The last signer signs; the envelope is sealed with its digest and timestamp |
| `envelope.declined` | A recipient declines, with the reason in the payload |
| `envelope.voided` | The sender voids the envelope |
| `envelope.reminded` | A reminder goes out to a pending recipient |

## Creating an endpoint

In **Settings → API**, add a webhook endpoint:

- The URL must be **HTTPS** (loopback addresses are allowed for local development).
- On creation, a **per-endpoint secret** is generated and shown **exactly once** — store it with your integration. The secret is never displayed again; if you lose it, delete the endpoint and create a new one.

## Verifying the signature

Every delivery carries three headers:

- `X-Docurama-Signature` — the **HMAC-SHA256 of the raw request body**, keyed with the endpoint secret, hex-encoded
- `X-Docurama-Event` — the event name
- `X-Docurama-Delivery` — a unique delivery id

Always verify before trusting. A minimal Node.js handler:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

app.post("/docurama-webhook", (req, res) => {
  const raw = req.rawBody; // the exact bytes received, not re-serialized JSON
  const expected = createHmac("sha256", process.env.DOCURAMA_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");
  const received = req.get("x-docurama-signature") ?? "";

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.sendStatus(400); // not from Docurama
  }

  const event = req.get("x-docurama-event");
  res.sendStatus(204);          // acknowledge fast,
  handleEvent(event, JSON.parse(raw)); // then process
});
```

The same logic in any language: read the raw body, HMAC-SHA256 it with your endpoint secret, hex-encode, compare with the header in constant time. Two rules that save hours of debugging: compute the HMAC over the **raw bytes exactly as received** (re-serializing JSON changes the string), and **respond 2xx quickly** — do the heavy work after acknowledging.

## Retries

If your server answers non-2xx or times out, the delivery is retried with a fixed backoff schedule: after **1, 5, 15 and 30 minutes**. Retries are **byte-identical** — the original payload snapshot is replayed — so your handler must treat the same delivery arriving twice as one event (use the `X-Docurama-Delivery` id to deduplicate).

Endpoint health is tracked as a success rate. A failing endpoint is clearly visible in the UI and can be disabled without deleting it, so a broken integration does not block your event stream.

## Inspecting deliveries

The endpoint manager in **Settings → API** shows a live feed of deliveries per endpoint: the event, the response status, the attempt count and the next scheduled attempt. When an integration seems silent, this feed is the first place to look — it tells you whether events left Docurama and what your server answered.

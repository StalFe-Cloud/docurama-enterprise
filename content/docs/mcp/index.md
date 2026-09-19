---
title: MCP Server
description: Connect AI agents to Docurama over the Model Context Protocol with scoped API keys and per-key rate limits.
group: MCP server
order: 1
tags: [mcp, ai, agents, api]
---

Docurama ships a native **Model Context Protocol (MCP)** server — the standard way for AI assistants and agents to call external tools. Instead of hand-writing API calls, you connect an MCP client to your workspace, and the agent discovers by itself what it can do.

## What the MCP server is

The MCP server exposes Docurama operations as **tools** that any MCP-capable client can call: a coding agent in your IDE, an assistant such as Claude, or an internal automation you built. The client connects with an API key, learns the tool list, and calls tools on your behalf — with the same authentication and the same audit trail as everything else in the platform.

## What agents can do

| Tool | What it does |
| --- | --- |
| `envelope_list` | List active envelopes in the current workspace |
| `envelope_detail` | Inspect the recipients and audit timeline of one envelope |
| `document_verify` | Verify the cryptographic validity of a sealed document |

The current toolset is deliberately read-and-verify oriented: an agent can tell you where a contract stands and check that a sealed document is genuine, which is exactly what you want an assistant doing unsupervised.

## Connecting an agent

1. **Create an API key** in **Settings → API**, selecting only the scopes the agent needs.
2. Open **Settings → MCP** for your workspace's MCP server connection details — the endpoint and the authentication to use.
3. Configure your MCP client with the server endpoint and the API key.

Keys are shown **once** at creation and stored server-side as SHA-256 hashes. If you lose one, revoke it and create a new one — there is no way to display it again.

## Scopes and per-key rate limits

Two controls keep agents on a leash:

- **Scopes.** API keys carry scopes such as ENVELOPES and TEMPLATES. An MCP session can only do what its key's scopes allow — a verify-only key cannot mutate anything, even if the agent tries.
- **Per-key rate limits.** Every key has its own rate limit. An agent that polls in a tight loop will be throttled, not the rest of your workspace. Well-behaved agents react to [webhooks](/docs/webhooks) instead of polling continuously.

## Running agents safely

- **One key per agent**, so you can revoke one integration without touching the others.
- **Minimal scopes** — grant exactly what the agent's task needs.
- **Audit trail** — every mutation is recorded like a human action, so "which agent did this?" is always answerable.
- **No passwords involved** — agents authenticate with keys, never with user credentials.

## MCP and the REST API

The MCP server complements the REST API at `/api/v1`: same data, same authentication model. Use REST for deterministic integrations (your CRM, your ERP) and MCP for agents that benefit from discovering tools on their own. Both are covered in the [API reference](/docs/api).

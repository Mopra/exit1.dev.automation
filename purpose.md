# exit1.dev.automation

Automation and AI agent hub for [exit1.dev](https://exit1.dev) — a real-time uptime monitoring platform.

## What lives here

This repo holds the long-running automations, scheduled jobs, and AI agents that sit *next to* exit1.dev rather than inside the core app. It is the place for code that:

- Reacts to events emitted by exit1.dev (webhooks for downtime / uptime, alerts, domain expiry, DNS drift, etc.)
- Runs background jobs that aren't a fit for Firebase Cloud Functions or the VPS check runner
- Hosts AI agents that operate on monitoring data (incident triage, root-cause analysis, status-page authoring, customer comms drafts)
- Bridges exit1.dev to third-party systems (Slack, Linear, GitHub, ticketing, on-call, internal dashboards)

## What does *not* live here

- Check execution — that runs on the dedicated VPS pool in [exit1.dev/vps/](../exit1.dev/vps/)
- Public API, alert delivery, BigQuery storage — those live in [exit1.dev/functions/](../exit1.dev/functions/)
- The MCP server consumed by AI assistants — that lives in [exit1.dev/mcp/](../exit1.dev/mcp/)

If a feature belongs in the product itself, it goes in `exit1.dev`. If it is operational glue or an autonomous agent that *uses* the product, it goes here.

## Stack

- **Runtime:** Node.js (LTS)
- **Hosting:** Dedicated VPS (same operational model as the check runner — long-lived processes managed by PM2 or systemd)
- **Language:** JavaScript / TypeScript
- **Style:** Small, single-purpose services. Each automation is its own entry point, started independently.

## Roadmap

| Status | Automation | Description |
|---|---|---|
| In progress | **Webhook receiver** | CLI listener for `website_down` / `website_up` events emitted by exit1.dev webhooks. First step toward downstream automations (alert routing, incident creation, AI triage). |
| Planned | Incident triage agent | LLM-driven classification of incoming downtime events (transient vs. real, severity, blast radius). |
| Planned | Status-page draft agent | Generates status-page incident copy from the raw event stream for human review. |
| Planned | On-call routing | Forward filtered events to PagerDuty / Opsgenie / Slack with deduplication and noise suppression beyond what exit1.dev's built-in webhook presets do. |

## Repo layout (current)

```
exit1.dev.automation/
├── purpose.md          # this file
├── README.md           # how to run things
├── package.json
└── src/
    └── webhook-receiver/
        └── server.js   # first automation: CLI webhook listener
```

Each automation gets its own subdirectory under `src/` and its own npm script.

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
| Live | **Webhook receiver** | HTTP listener for `website_down` / `website_up` events emitted by exit1.dev webhooks. Normalizes deliveries and feeds downstream automations. Runs at `automation.exit1.dev`. |
| Live | **X status bot** | Auto-posts outages and recoveries to X. AI-written copy (OpenRouter) with template fallback; recoveries thread under the down-post with downtime duration; dedup, flap suppression, and a hard post-budget guard. Ships dry-run-first. |
| Planned | Incident triage agent | LLM-driven classification of incoming downtime events (transient vs. real, severity, blast radius). |
| Planned | Status-page draft agent | Generates status-page incident copy from the raw event stream for human review. |
| Planned | On-call routing | Forward filtered events to PagerDuty / Opsgenie / Slack with deduplication and noise suppression beyond what exit1.dev's built-in webhook presets do. |

## Repo layout (current)

```
exit1.dev.automation/
├── purpose.md          # this file
├── README.md           # how to run things
├── DEPLOY.md           # VPS runbook for going live
├── Dockerfile          # container image
├── docker-compose.yml  # reference deployment
├── package.json
└── src/
    ├── config.js              # env → config (one source of truth)
    ├── webhook-receiver/
    │   └── server.js          # HTTP listener; acks + hands off to the publisher
    ├── lib/
    │   ├── normalize.js       # raw delivery → clean incident
    │   ├── publisher.js       # dedup / flap / budget orchestration
    │   ├── copy.js            # OpenRouter copy + template fallback
    │   ├── x-client.js        # twitter-api-v2 wrapper (dry-run aware)
    │   └── state.js           # persistent JSON store
    └── dev/
        └── simulate.js        # offline end-to-end pipeline exercise
```

Each automation gets its own entry point and npm script; shared building blocks live in `src/lib/`.

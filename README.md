# exit1.dev.automation

Automation and AI agent hub for [exit1.dev](https://exit1.dev). See [purpose.md](purpose.md) for the long version.

## What it does today

A webhook receiver that turns exit1.dev uptime events into posts on X:

```
site goes down → exit1.dev webhook → receiver → normalize
              → hold briefly to confirm it isn't a blip (debounce)
              → AI copy (OpenRouter) → post to X → store the tweet id
site recovers → exit1.dev webhook → receiver → close the incident
              (down-only by default — no recovery post)
```

So followers see, in real time, when something exit1.dev monitors goes down. To keep X writes (and the API tier) cheap, the bot is **down-only by default** — one write per incident — and **debounces** short outages so blips never reach X. Flip `POST_RECOVERY=true` to also thread an all-clear reply when a site recovers.

### Pipeline at a glance

| Step | File | Notes |
|---|---|---|
| Receive + ack | [src/webhook-receiver/server.js](src/webhook-receiver/server.js) | Pretty-prints the delivery, acks `200` immediately, then publishes async. |
| Normalize | [src/lib/normalize.js](src/lib/normalize.js) | Raw payload → clean incident (`down` / `up` / `error`), host extraction, duration helper. |
| Decide | [src/lib/publisher.js](src/lib/publisher.js) | Debounce hold (blips post nothing), dedup (one open incident/site), flap cooldown, post-budget guard. Down-only unless `POST_RECOVERY=true`. Serialized queue. |
| Write copy | [src/lib/copy.js](src/lib/copy.js) | OpenRouter AI copy with a deterministic template fallback. ≤280 chars enforced. |
| Post / thread | [src/lib/x-client.js](src/lib/x-client.js) | `twitter-api-v2`, OAuth 1.0a. Posts the down alert; an optional recovery reply threads into it when `POST_RECOVERY=true`. |
| Persist | [src/lib/state.js](src/lib/state.js) | JSON file: open incidents, post-budget ledger, flap cooldowns. Atomic writes. |

### Safety rails (why this won't spam or overspend)

- **Dry-run by default** — `DRY_RUN=true` generates and logs copy but posts nothing. Nothing goes public until you explicitly flip it.
- **Down-only by default** — one X write per incident, not two. The "back up" reply is off unless `POST_RECOVERY=true`, so the write budget stretches twice as far.
- **Debounce** — a down-post is held for `MIN_OUTAGE_MS` (default 5 min); if the site recovers within the window, nothing is posted at all, so short blips never reach X (and never cost a write).
- **Dedup** — a site already marked down won't post again until it recovers.
- **Flap suppression** — after a recovery, a new down-post for that site is suppressed for `FLAP_COOLDOWN_MS` (default 15 min).
- **Post budget** — hard caps (`30/day`, `400/month` by default) sized under X's lowest write quota; over budget → log-and-skip, never a hard API failure. Counted in wall-clock time, so a backlog of old-timestamped events can't blow the cap.
- **Per-site status-page link** — each post links to the affected site's public status page (`exit1.dev/status/<slug>`), resolved by matching the event to the public-monitors index; sites without a status page fall back to the home page. `INCLUDE_LINK=false` drops the link. On X pay-per-use a post with a link costs ~$0.20 vs ~$0.015, but posts already name the host (a domain), so the monthly budget cap (~$80/mo worst case) is the real spend bound.
- **Graceful AI fallback** — any OpenRouter failure (timeout, error, empty/over-long, content filter) falls back to the template, so a flaky model never blocks or garbles a public post.

## Run locally

```bash
npm install
cp .env.example .env     # then fill in keys; leave DRY_RUN=true
npm run webhook          # start the receiver (loads .env automatically)
npm run webhook:dev      # auto-restart on changes
```

Default endpoint: `http://localhost:3000/webhook`. The startup banner shows publish mode, copy mode, and budget.

### Simulate the whole pipeline (no HTTP, never posts)

```bash
npm run simulate
```

Runs a scripted sequence against a throwaway state file in dry-run — a held-then-published down, a duplicate, a silent down-only recovery, a suppressed flap, and a debounced blip — so you can see exactly what would (and wouldn't) be posted. Uses a short debounce window so it doesn't actually wait minutes. Uses real AI copy if `OPENROUTER_API_KEY` is set, otherwise the template.

### Send a test delivery to a running receiver

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'content-type: application/json' \
  -d '{
    "event": "website_down",
    "summary": "🚨 App is DOWN",
    "timestamp": 1778284903794,
    "website": {
      "id": "abc123", "name": "App", "url": "https://app.exit1.dev/health",
      "type": "website", "status": "offline",
      "lastStatusCode": 503, "statusCodeInfo": "HTTP 503",
      "error": "HTTP 503: Service Unavailable", "targetIp": "34.117.33.233"
    },
    "previousStatus": "online", "userId": "user_demo"
  }'
```

## Configure

All config is environment variables — see [.env.example](.env.example) for the full annotated list. The essentials:

| Var | Default | Purpose |
|---|---|---|
| `DRY_RUN` | `true` | When true, never posts to X. Flip to `false` to go live. |
| `X_API_KEY` / `X_API_SECRET` | — | X app consumer key/secret (OAuth 1.0a). |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | — | Access token/secret for the posting account. |
| `OPENROUTER_API_KEY` | — | Enables AI copy. Without it, template is used. |
| `OPENROUTER_MODEL` | `anthropic/claude-3.5-haiku` | Any OpenRouter slug. |
| `POST_BUDGET_PER_DAY` / `_PER_MONTH` | `30` / `400` | Hard self-imposed post caps. |
| `MIN_OUTAGE_MS` | `300000` | Debounce hold before a down posts; recovery inside it posts nothing. `0` posts immediately. |
| `POST_RECOVERY` | `false` | When true, also thread an all-clear reply on recovery (doubles writes/incident). |
| `FLAP_COOLDOWN_MS` | `900000` | Post-recovery suppression window per site. |
| `INCLUDE_LINK` | `true` | Append the affected site's status-page link (home fallback) to posts. |
| `STATE_FILE` | `./data/state.json` | Persistent state. **Must be on a durable volume in prod.** |

## Deploy

See [DEPLOY.md](DEPLOY.md) for the VPS runbook (the receiver already runs at `automation.exit1.dev`; going live is: add creds → deploy in dry-run → verify → flip `DRY_RUN=false`).

## Point exit1.dev at it

In exit1.dev under **Alerts → Webhooks**, add `https://automation.exit1.dev/webhook` with the generic preset (already configured). Any check carrying that webhook delivers `website_down` / `website_up` events here.

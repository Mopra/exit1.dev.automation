# Deploy runbook — automation receiver → X publisher

The receiver already runs on the Frankfurt VPS at `https://automation.exit1.dev/webhook`
(Docker container `exit1-automation-receiver` under `/opt/exit1-automation/`, fronted by
Traefik). This describes how to ship the X-publishing change and turn it on safely.

## 0. Prerequisites — get the credentials

**X (Twitter) API** — at [developer.x.com](https://developer.x.com):
1. Create a Project + App on a paid plan that allows writes (Free legacy ~500 posts/mo
   is enough but is no longer offered to new developers; Basic comfortably covers it).
2. App settings → **User authentication settings** → set permission to **Read and Write**.
3. **Keys and tokens** → copy the **API Key** + **API Key Secret** (consumer keys).
4. Generate the **Access Token + Secret** *after* setting Read/Write — copy both.
   (Regenerating order matters: tokens made before Read/Write was set will 403 on post.)

**OpenRouter** — at [openrouter.ai](https://openrouter.ai), create an API key. (One already
exists for this project; rotate it since it was shared in chat.)

## 1. Pull the code on the VPS

```bash
cd /opt/exit1-automation/repo      # the git checkout
git pull
```

## 2. Add the new env vars

Append to the VPS `.env` (next to the compose file). Keep `DRY_RUN=true` for the first deploy:

```ini
DRY_RUN=true
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-3.5-haiku
# Optional overrides:
# POST_BUDGET_PER_DAY=30
# POST_BUDGET_PER_MONTH=400
# INCLUDE_LINK=false
```

## 3. Ensure state persists

The post-budget ledger and open-incident threading state live in `STATE_FILE`
(`/app/data/state.json` in the container). **It must be on a persistent volume**, or a
restart loses the budget counter and recovery threads. Confirm the compose service mounts
a volume at `/app/data` (the reference [docker-compose.yml](docker-compose.yml) defines
`automation-data:/app/data`). If the current VPS compose doesn't, add it before going live.

## 4. Rebuild + restart (still dry-run)

```bash
cd /opt/exit1-automation
docker compose up -d --build
docker logs -f exit1-automation-receiver
```

The banner should read `Publish  DRY-RUN …`. Watch a few real deliveries: each down/up
should log `⮑ X (dry-run) down/up [...]` with the exact copy that *would* post. Confirm:
- copy looks correct and on-brand,
- recoveries reply into the right thread (`reply→<down id>`),
- dedup / flap-cooldown skips look sane.

## 5. Go live

When the dry-run copy looks right, set `DRY_RUN=false` in the VPS `.env` and restart:

```bash
docker compose up -d
```

Banner should read `Publish  LIVE — posting to X`. The next real outage posts for real.

## 6. After go-live

- **Rotate the OpenRouter key** that was shared in chat.
- Watch the first live incident end-to-end on the X account.
- If volume gets noisy, lower `POST_BUDGET_PER_DAY` or raise `FLAP_COOLDOWN_MS`.
- Roll back instantly by setting `DRY_RUN=true` and restarting — no code change needed.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `X post failed: HTTP 403 … duplicate content` | X blocks identical text within ~24–48h. AI copy varies enough; the template may repeat — vary brand/text or rely on AI. |
| `X post failed: HTTP 403` on every post | App not Read/Write, or tokens generated before Read/Write was set. Regenerate tokens. |
| `X post failed: HTTP 429 … rate-limited` | Hit X's quota. Budget guard should prevent this; lower the budgets. |
| Copy always uses the template | `OPENROUTER_API_KEY` missing/invalid, or model slug wrong — check logs for `[copy] AI generation failed`. |
| Duplicate posts after a restart | `data/` not on a persistent volume — state was lost. |

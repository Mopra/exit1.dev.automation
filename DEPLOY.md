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
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
# Optional overrides:
# POST_BUDGET_PER_DAY=30
# POST_BUDGET_PER_MONTH=400
# OPENROUTER_TEMPERATURE=0.85   # higher = more varied, too high = confabulation
# COPY_RECENT_MEMORY=8          # recent posts shown to the model to avoid repetition
```

> **Upgrading an existing deploy:** the VPS `.env` may still pin
> `OPENROUTER_MODEL=anthropic/claude-3.5-haiku`. Change it to
> `anthropic/claude-sonnet-4.5` (or delete the line to take the code default),
> otherwise the human-voice copy upgrade won't take effect.

## 3. Ensure state persists

The post-budget ledger and open-incident state (for dedup and, with
`POST_RECOVERY=true`, recovery threading) live in `STATE_FILE`
(`/app/data/state.json` in the container). **It must be on a persistent volume**, or a
restart loses the budget counter and every open incident. (Debounce holds are in-memory and
are *meant* to be lost on restart — a held down simply never posts, which fails safe.)
Confirm the compose service mounts
a volume at `/app/data` (the reference [docker-compose.yml](docker-compose.yml) defines
`automation-data:/app/data`). If the current VPS compose doesn't, add it before going live.

## 4. Rebuild + restart (still dry-run)

```bash
cd /opt/exit1-automation
docker compose up -d --build
docker logs -f exit1-automation-receiver
```

The banner should read `Publish  DRY-RUN …` and `Policy  …s debounce · down-only`. Watch a
few real deliveries: a down should first log `⮑ X holding …`, then `⮑ X (dry-run) down [...]`
once the debounce window elapses, with the exact copy that *would* post. Confirm:
- copy looks correct and on-brand,
- short blips (recovered inside the debounce window) log `down suppressed` and post nothing,
- recoveries close the incident silently (or, if `POST_RECOVERY=true`, reply into the right thread `reply→<down id>`),
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

## Content scheduler (evergreen posts)

A second automation lives in `src/scheduler/`: it posts pre-written, human-voice
tweets (not outages) from the hand-curated calendar in `src/scheduler/calendar.js`
(each post has an explicit UTC date + time). It shares `DRY_RUN` and the X creds
with the outage bot but keeps its own state file (`CONTENT_STATE_FILE`, default
`/app/data/scheduler-state.json` — already on the mounted volume). By default it
runs **in-process inside the receiver**, so no extra container/service is needed.

**Review before going live:**
```bash
npm run calendar        # writes drafts/content-calendar.md — the exact posts + times
```
Read that file. It is what will go out, to the minute (jitter included).

**Deploy:** nothing extra — the same `git pull` + `docker compose up -d --build`
picks it up. With `DRY_RUN=true` the receiver log shows a `exit1 content scheduler`
banner and, at each slot, a `[scheduler] (dry-run) <pillar>` line with the copy that
*would* post. When the calendar looks right, the existing `DRY_RUN=false` flip turns
on real posting for **both** the outage bot and the scheduler.

**Cadence:** fully determined by `calendar.js` — each post has an explicit date
and time, with per-day counts that already fluctuate 2-4. A small deterministic
`CONTENT_JITTER_MIN` (default 12) nudges each time so posts never land on the
exact same minute daily. To reschedule or rewrite, edit `calendar.js` and re-run
`npm run calendar`.

**Knobs** (all optional, see `.env.example`): `CONTENT_SCHEDULER_ENABLED`,
`CONTENT_DRY_RUN`, `CONTENT_JITTER_MIN`, `CONTENT_GRACE_MIN`, `CONTENT_STATE_FILE`.

### Independent on/off per automation

`DRY_RUN` is only the global default. The outage bot and the content scheduler
each have their own switch, so they go live independently:

| Goal | Env |
|---|---|
| Everything off (safe) | `DRY_RUN=true` |
| Content scheduler live, outage **disabled** | `OUTAGE_ENABLED=false` + `CONTENT_DRY_RUN=false` |
| Content live, outage still dry-run (logs only) | `CONTENT_DRY_RUN=false` (leave `DRY_RUN=true`) |
| Both live | `DRY_RUN=false` |

`OUTAGE_ENABLED=false` fully disables the outage pipeline (deliveries acked and
dropped, no copy, no posts). `OUTAGE_DRY_RUN` / `CONTENT_DRY_RUN` override
`DRY_RUN` for just that automation when set. The receiver banner shows the
outage bot's mode; the `exit1 content scheduler` banner shows the scheduler's.

**Run it standalone instead** (separate PM2 app / container): `npm run scheduler`,
and set `CONTENT_SCHEDULER_ENABLED=false` in the receiver so posts do not fire twice.

> Combined write volume stays well within the API tier: 3-6 scheduled posts/day plus
> at most the outage budget. The scheduler skips (marks "missed"), never backfills,
> any slot whose window passed while the box was down — so a restart never dumps a
> burst or posts yesterday's content late.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `X post failed: HTTP 403 … duplicate content` | X blocks identical text within ~24–48h. AI copy varies enough; the template may repeat — vary brand/text or rely on AI. |
| `X post failed: HTTP 403` on every post | App not Read/Write, or tokens generated before Read/Write was set. Regenerate tokens. |
| `X post failed: HTTP 429 … rate-limited` | Hit X's quota. Budget guard should prevent this; lower the budgets. |
| Copy always uses the template | `OPENROUTER_API_KEY` missing/invalid, or model slug wrong — check logs for `[copy] AI generation failed`. |
| Duplicate posts after a restart | `data/` not on a persistent volume — state was lost. |

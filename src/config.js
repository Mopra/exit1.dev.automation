// Centralized configuration for the automation services.
// Everything is sourced from environment variables so the same code runs
// locally (dry-run) and on the VPS (live) without edits.

const bool = (v, dflt) => {
  if (v == null || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
};

const int = (v, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
};

const float = (v, dflt) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
};

const str = (v, dflt) => (v == null || v === '' ? dflt : String(v));

// Like bool() but returns null when the var is unset, so a per-automation
// override can fall back to a shared default with `?? `.
const boolOpt = (v) => (v == null || v === '' ? null : bool(v, false));

// Global posting default. Each automation has its OWN switch that overrides this
// when set, so the outage bot and the content scheduler go live independently.
const dryRunDefault = bool(process.env.DRY_RUN, true);

export const config = {
  // ── HTTP receiver ──────────────────────────────────────────────
  port: int(process.env.PORT, 3000),
  webhookPath: str(process.env.WEBHOOK_PATH, '/webhook'),
  webhookSecret: process.env.WEBHOOK_SECRET || null,

  // ── X (Twitter) publishing ─────────────────────────────────────
  // DRY_RUN is the GLOBAL default: when true, copy is generated and logged but
  // nothing is posted. Defaults to true so nothing can post until switched on.
  // Each automation overrides this independently (config.outage.dryRun /
  // config.scheduler.dryRun), so you can take ONE live without the other.
  dryRun: dryRunDefault,
  x: {
    appKey: process.env.X_API_KEY || null,
    appSecret: process.env.X_API_SECRET || null,
    accessToken: process.env.X_ACCESS_TOKEN || null,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET || null,
  },

  // ── Outage bot (webhook -> X): on/off + its own posting mode ────
  // enabled=false fully disables the outage pipeline (no copy generated, no
  // posts, deliveries are acked and dropped). dryRun falls back to DRY_RUN
  // unless OUTAGE_DRY_RUN is set explicitly.
  outage: {
    enabled: bool(process.env.OUTAGE_ENABLED, true),
    dryRun: boolOpt(process.env.OUTAGE_DRY_RUN) ?? dryRunDefault,
  },

  // ── AI copywriting (OpenRouter) ────────────────────────────────
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || null,
    model: str(process.env.OPENROUTER_MODEL, 'anthropic/claude-sonnet-4.5'),
    // Sent as attribution headers; helps with OpenRouter ranking/limits.
    referer: str(process.env.OPENROUTER_REFERER, 'https://exit1.dev'),
    title: str(process.env.OPENROUTER_TITLE, 'exit1.dev status bot'),
    timeoutMs: int(process.env.OPENROUTER_TIMEOUT_MS, 12000),
    // Run warm: variety comes mostly from angle nudges + recent-post memory +
    // repetition penalties (see copy.js), so temperature is kept moderate —
    // high enough to vary phrasing, low enough that the model doesn't start
    // confabulating cause/impact about famous hosts.
    temperature: float(process.env.OPENROUTER_TEMPERATURE, 0.85),
  },

  // ── Copy variety ───────────────────────────────────────────────
  // How many recently-posted texts to feed the model as "don't echo these",
  // so consecutive posts read like a human wrote them, not a template.
  copy: {
    recentMemory: int(process.env.COPY_RECENT_MEMORY, 8),
  },

  // ── Posting policy ─────────────────────────────────────────────
  // Hard self-imposed budget so we never hit X's write quota. Sized to
  // survive the lowest (Free legacy) ceilings: ~50 posts/24h app cap,
  // ~500/month. Posts are counted in a rolling window in state.
  budget: {
    perDay: int(process.env.POST_BUDGET_PER_DAY, 30),
    perMonth: int(process.env.POST_BUDGET_PER_MONTH, 400),
  },
  // After a site recovers, suppress a *new* down-post for this long to
  // avoid spamming X when a site flaps up/down repeatedly.
  flapCooldownMs: int(process.env.FLAP_COOLDOWN_MS, 15 * 60 * 1000),

  // Debounce: hold a down-post this long before publishing it. If the site
  // recovers within the window, nothing is posted at all — this is what keeps
  // short flaps/blips off the timeline and, more importantly, off X's write
  // quota. The cost is a small delay before a real outage is announced. Set to
  // 0 to post downs immediately (no hold).
  debounce: {
    minOutageMs: int(process.env.MIN_OUTAGE_MS, 5 * 60 * 1000),
  },

  // Recovery ("back up") posts. OFF by default: the bot posts only when a site
  // goes down, which is one X write per incident instead of two (a down post
  // plus a threaded reply). Set POST_RECOVERY=true to also thread an all-clear
  // reply under each down-post.
  recovery: {
    enabled: bool(process.env.POST_RECOVERY, false),
  },

  // Branding woven into copy / fallback template. `url` is the website
  // (exit1.dev) — it's both the home fallback and the base for status-page
  // links (exit1.dev/status/<slug>).
  brand: {
    url: str(process.env.BRAND_URL, 'https://exit1.dev'),
    name: str(process.env.BRAND_NAME, 'exit1.dev'),
  },
  // Append a link to each post: the affected site's public status page
  // (exit1.dev/status/<slug>), or the home page if it has no status page.
  // Default on — the link is the call to action. Set INCLUDE_LINK=false to
  // drop it entirely (note: posts still name the host, which X may auto-link,
  // so the monthly budget — not this flag — is the real pay-per-use cost bound).
  includeLink: bool(process.env.INCLUDE_LINK, true),

  // Public-monitors index used to resolve a site → its status-page slug.
  status: {
    apiBase: str(process.env.STATUS_API_BASE, 'https://app.exit1.dev'),
    indexTtlMs: int(process.env.STATUS_INDEX_TTL_MS, 10 * 60 * 1000),
    timeoutMs: int(process.env.STATUS_API_TIMEOUT_MS, 8000),
  },

  // ── Content scheduler (evergreen posts, separate from the outage bot) ──
  // Posts the hand-curated calendar in src/scheduler/calendar.js (explicit
  // date + time per post). Shares the same DRY_RUN + X creds as the outage bot,
  // but its own state file and its own logic. Default-on, but DRY_RUN gates
  // real posting. To change WHAT/WHEN, edit calendar.js (not env).
  scheduler: {
    enabled: bool(process.env.CONTENT_SCHEDULER_ENABLED, true),
    // Posting mode for the scheduler; falls back to DRY_RUN unless
    // CONTENT_DRY_RUN is set. This is how the scheduler posts live while the
    // outage bot stays dry-run or disabled.
    dryRun: boolOpt(process.env.CONTENT_DRY_RUN) ?? dryRunDefault,
    // +/- minutes of deterministic jitter on each post's time, so posts do not
    // land on the exact same minute every day (an automation tell). Stable per
    // post, so the rendered draft matches what actually posts.
    jitterMinutes: int(process.env.CONTENT_JITTER_MIN, 12),
    // If a slot's time passes by more than this while the process is down, skip
    // it (mark "missed") instead of posting stale content hours/days late.
    graceMinutes: int(process.env.CONTENT_GRACE_MIN, 180),
    // How often the scheduler checks for a due slot.
    tickMs: int(process.env.CONTENT_TICK_MS, 60 * 1000),
    // Separate from STATE_FILE so the two automations never share a file.
    stateFile: str(process.env.CONTENT_STATE_FILE, './data/scheduler-state.json'),
  },

  // ── Persistence ────────────────────────────────────────────────
  stateFile: str(process.env.STATE_FILE, './data/state.json'),
};

// Convenience: do we have everything needed to actually post?
export const xConfigured = Boolean(
  config.x.appKey && config.x.appSecret && config.x.accessToken && config.x.accessSecret
);
export const openrouterConfigured = Boolean(config.openrouter.apiKey);

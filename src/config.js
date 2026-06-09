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

const str = (v, dflt) => (v == null || v === '' ? dflt : String(v));

export const config = {
  // ── HTTP receiver ──────────────────────────────────────────────
  port: int(process.env.PORT, 3000),
  webhookPath: str(process.env.WEBHOOK_PATH, '/webhook'),
  webhookSecret: process.env.WEBHOOK_SECRET || null,

  // ── X (Twitter) publishing ─────────────────────────────────────
  // When DRY_RUN is true, copy is generated and threading state is
  // updated, but nothing is actually posted to X. Defaults to true so
  // the bot can never post publicly until it is explicitly switched on.
  dryRun: bool(process.env.DRY_RUN, true),
  x: {
    appKey: process.env.X_API_KEY || null,
    appSecret: process.env.X_API_SECRET || null,
    accessToken: process.env.X_ACCESS_TOKEN || null,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET || null,
  },

  // ── AI copywriting (OpenRouter) ────────────────────────────────
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || null,
    model: str(process.env.OPENROUTER_MODEL, 'anthropic/claude-3.5-haiku'),
    // Sent as attribution headers; helps with OpenRouter ranking/limits.
    referer: str(process.env.OPENROUTER_REFERER, 'https://exit1.dev'),
    title: str(process.env.OPENROUTER_TITLE, 'exit1.dev status bot'),
    timeoutMs: int(process.env.OPENROUTER_TIMEOUT_MS, 12000),
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

  // Branding woven into copy / fallback template.
  brand: {
    url: str(process.env.BRAND_URL, 'https://exit1.dev'),
    name: str(process.env.BRAND_NAME, 'exit1.dev'),
  },
  // Add an explicit clickable brand URL to posts. Note: every post already
  // names the monitored host (itself a domain X may auto-link), so on X's
  // pay-per-use pricing posts tend to land in the higher "contains a link"
  // bucket (~$0.20 vs ~$0.015) regardless — the monthly post budget, not
  // this flag, is what bounds spend. Default off to skip an extra CTA link.
  includeLink: bool(process.env.INCLUDE_LINK, false),

  // ── Persistence ────────────────────────────────────────────────
  stateFile: str(process.env.STATE_FILE, './data/state.json'),
};

// Convenience: do we have everything needed to actually post?
export const xConfigured = Boolean(
  config.x.appKey && config.x.appSecret && config.x.accessToken && config.x.accessSecret
);
export const openrouterConfigured = Boolean(config.openrouter.apiKey);

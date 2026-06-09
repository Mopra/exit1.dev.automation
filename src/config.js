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

  // ── Persistence ────────────────────────────────────────────────
  stateFile: str(process.env.STATE_FILE, './data/state.json'),
};

// Convenience: do we have everything needed to actually post?
export const xConfigured = Boolean(
  config.x.appKey && config.x.appSecret && config.x.accessToken && config.x.accessSecret
);
export const openrouterConfigured = Boolean(config.openrouter.apiKey);

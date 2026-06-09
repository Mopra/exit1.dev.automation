// Resolves the public status-page URL for a monitored site.
//
// The webhook payload does NOT tell us whether a site has a public status
// page or what its slug is — only checks flagged `public: true` (the curated
// connect@exit1.dev set) get one, and the slug can be a custom value. So we
// look the site up in the public-monitors index (the same feed the website's
// /status pages use), match it to the webhook event by url/host, and read the
// real slug. No match → the site has no status page → fall back to home.
//
// The index lists ~hundreds of monitors and is CDN-cached; we cache it
// in-memory with a TTL so we hit the API at most once per window, not per
// webhook.

import { config } from '../config.js';

const normHost = (h) =>
  h ? String(h).trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '') : null;

const normUrl = (u) =>
  u ? String(u).trim().toLowerCase().replace(/\/+$/, '') : null;

let cache = { at: 0, byHost: new Map(), byUrl: new Map(), loaded: false };

async function loadIndex(now) {
  if (cache.loaded && now - cache.at < config.status.indexTtlMs) return cache;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.status.timeoutMs);
  try {
    const res = await fetch(`${config.status.apiBase}/v1/public/monitors`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const monitors = Array.isArray(json?.monitors) ? json.monitors : [];

    const byHost = new Map();
    const byUrl = new Map();
    for (const m of monitors) {
      if (!m?.slug) continue;
      const h = normHost(m.host);
      // First entry wins for a given host (stable, avoids surprises when two
      // checks share a host); url is the precise key and always overwrites.
      if (h && !byHost.has(h)) byHost.set(h, m.slug);
      const u = normUrl(m.url);
      if (u) byUrl.set(u, m.slug);
    }
    cache = { at: now, byHost, byUrl, loaded: true };
  } catch (err) {
    console.warn(`[status-page] index fetch failed (${err.message}) — using ${cache.loaded ? 'stale cache' : 'home fallback'}`);
    // Throttle retries either way so an API blip doesn't trigger a fetch per
    // webhook; keep any previously loaded (stale) maps to stay useful.
    cache = { ...cache, at: now };
  } finally {
    clearTimeout(timer);
  }
  return cache;
}

// Returns the per-site status-page URL, or the home URL if the site has no
// public status page (or the lookup fails). Never throws.
export async function resolveStatusLink(incident) {
  const home = config.brand.url;
  try {
    const idx = await loadIndex(Date.now());
    const url = normUrl(incident?.site?.url);
    const host = normHost(incident?.site?.host);
    const slug = (url && idx.byUrl.get(url)) || (host && idx.byHost.get(host)) || null;
    if (!slug) return home;
    return `${config.brand.url}/status/${encodeURIComponent(slug)}`;
  } catch {
    return home;
  }
}

// Test seam: reset the in-memory index cache.
export function _resetCache() {
  cache = { at: 0, byHost: new Map(), byUrl: new Map(), loaded: false };
}

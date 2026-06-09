// Generates the text of a post.
//
// Primary path: OpenRouter (OpenAI-compatible chat completions) writes
// on-brand microcopy. If anything goes wrong — no key, timeout, HTTP
// error, empty/over-long output, upstream content filter — we fall back
// to a deterministic template so a public post is never blocked or
// garbled by a flaky model call.

import { config, openrouterConfigured } from '../config.js';

const MAX_LEN = 280;

const URL_RE = /\bhttps?:\/\/\S+/gi;

// When links are disabled, drop scheme-prefixed URLs (e.g. ones echoed
// from a check's error string). Applied inside clamp() so BOTH the AI and
// the deterministic template paths are covered uniformly. Note: this only
// removes explicit https:// URLs — a post still names the monitored host
// (itself a domain X may auto-link); the post-budget cap is what bounds
// pay-per-use cost, not this strip.
const neutralizeLinks = (t) =>
  config.includeLink ? t : t.replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim();

const clamp = (text) => {
  const t = neutralizeLinks(String(text ?? '').trim());
  // Truncate by code point so an emoji / astral character is never split
  // into a lone surrogate right at the 280 boundary.
  const cp = [...t];
  if (cp.length <= MAX_LEN) return t;
  return `${cp.slice(0, MAX_LEN - 1).join('').trimEnd()}…`;
};

// Strip wrappers an LLM sometimes adds despite instructions.
const sanitize = (raw) => {
  let t = String(raw ?? '').trim();
  // Drop a single pair of wrapping quotes.
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) {
    t = t.slice(1, -1).trim();
  }
  // Remove a leading "Tweet:" / "Post:" style preamble.
  return t.replace(/^(tweet|post|copy|here'?s[^:]*):\s*/i, '');
};

// ── Deterministic templates (always available) ──────────────────
const httpDetail = (site) => {
  if (site.error) return site.error;
  if (site.httpInfo) return site.httpInfo;
  if (site.status) return `status: ${site.status}`;
  return 'not responding';
};

const link = () => (config.includeLink ? ` ${config.brand.url}` : '');

const templateDown = (incident) => {
  const { site } = incident;
  const who = site.host || site.name;
  return clamp(
    `🔴 ${who} is DOWN — ${httpDetail(site)}. Tracking it live with ${config.brand.name} uptime monitoring.${link()}`
  );
};

const templateUp = (incident, durationText) => {
  const who = incident.site.host || incident.site.name;
  return clamp(
    `🟢 ${who} is back UP after ${durationText} of downtime. All clear — monitored by ${config.brand.name}.${link()}`
  );
};

const template = (incident, opts) =>
  opts.phase === 'up' ? templateUp(incident, opts.durationText) : templateDown(incident);

// ── OpenRouter ──────────────────────────────────────────────────
const SYSTEM_PROMPT = [
  `You are the social voice of ${config.brand.name}, a real-time uptime-monitoring service.`,
  'You write a single short post for X reporting that a site we MONITOR changed state (went down or recovered).',
  'Rules:',
  '- Output ONLY the post text. No quotes, no preamble, no hashtag-spam (at most one hashtag, optional).',
  '- Hard limit 270 characters.',
  '- Lead with one status emoji (🔴 for down, 🟢 for recovered).',
  '- State only the facts you are given. Never invent a cause, blame, severity, or detail.',
  `- We ONLY observe these sites from the outside; we do not own, operate, host, or fix them.`,
  '- Never imply we (or anyone) are investigating, working on, or resolving the issue.',
  `- Refer to us as "${config.brand.name}" (the monitor that detected it). Do NOT include any URL or @handle.`,
  '- Tone: calm, factual, neutral. A detached status observation, not a joke and not an apology.',
].join('\n');

const buildUserPrompt = (incident, opts) => {
  const s = incident.site;
  const facts = [
    `event: ${opts.phase === 'up' ? 'recovered (back online)' : 'went down (offline)'}`,
    `site: ${s.host || s.name}`,
    s.httpInfo ? `http: ${s.httpInfo}` : null,
    s.error ? `error: ${s.error}` : null,
    s.responseTime != null ? `responseTime: ${s.responseTime}ms` : null,
    opts.phase === 'up' && opts.durationText ? `downtimeDuration: ${opts.durationText}` : null,
  ].filter(Boolean);
  return `Write the post for this event.\n${facts.join('\n')}`;
};

async function generateWithOpenRouter(incident, opts) {
  const { apiKey, model, referer, title, timeoutMs } = config.openrouter;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': title,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(incident, opts) },
        ],
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status} ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const reason = choice?.finish_reason;
    if (reason === 'error' || reason === 'content_filter') {
      throw new Error(`OpenRouter finish_reason=${reason}`);
    }
    const text = sanitize(choice?.message?.content);
    if (!text) throw new Error('OpenRouter returned empty content');
    return clamp(text);
  } finally {
    clearTimeout(timer);
  }
}

// Public: always resolves to a usable string.
export async function generateCopy(incident, opts) {
  if (openrouterConfigured) {
    try {
      return await generateWithOpenRouter(incident, opts);
    } catch (err) {
      console.warn(`[copy] AI generation failed (${err.message}) — using template`);
    }
  }
  return template(incident, opts);
}

export { template as templateCopy };

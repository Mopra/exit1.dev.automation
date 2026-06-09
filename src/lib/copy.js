// Generates the text of a post.
//
// Primary path: OpenRouter (OpenAI-compatible chat completions) writes
// on-brand microcopy. If anything goes wrong — no key, timeout, HTTP
// error, empty/over-long output, upstream content filter — we fall back
// to a deterministic template so a public post is never blocked or
// garbled by a flaky model call.

import { config, openrouterConfigured } from '../config.js';

const MAX_LEN = 280;
const TCO_LEN = 23; // X counts every URL as 23 chars (t.co), regardless of length

const URL_RE = /\bhttps?:\/\/\S+/gi;

const stripUrls = (t) =>
  String(t ?? '').replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim();

// Truncate by code point so an emoji / astral character is never split into
// a lone surrogate at the boundary.
const cpClamp = (t, max) => {
  const cp = [...t];
  if (cp.length <= max) return t;
  return `${cp.slice(0, max - 1).join('').trimEnd()}…`;
};

// Assemble the final post: message body + an optional appended link. Strips
// any stray URL from the body (e.g. echoed from an error string) so the
// appended link is the only one, and reserves room so the result is within
// 280 in BOTH raw length and X's t.co-weighted length.
const withLink = (body, linkUrl) => {
  const clean = stripUrls(body);
  if (!linkUrl) return cpClamp(clean, MAX_LEN);
  const reserve = Math.max(String(linkUrl).length, TCO_LEN) + 1; // link + a space
  return `${cpClamp(clean, MAX_LEN - reserve)} ${linkUrl}`;
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

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Deterministic templates (always available) — body only; the link is
// appended by withLink() in generateCopy. These are the safety net for when
// the model call fails, so they rotate through a few phrasings too — a flaky
// model run shouldn't drop us back to one rigid, obviously-canned sentence.
const httpDetail = (site) => {
  if (site.error) return site.error;
  if (site.httpInfo) return site.httpInfo;
  if (site.status) return `status: ${site.status}`;
  return 'not responding';
};

const templateDown = (incident) => {
  const who = incident.site.host || incident.site.name;
  const detail = httpDetail(incident.site);
  return pick([
    `Heads up — ${who} looks down right now (${detail}).`,
    `${who} just stopped responding from where we're watching: ${detail}.`,
    `Looks like ${who} is having trouble — ${detail}.`,
    `${who} isn't answering at the moment (${detail}).`,
  ]);
};

const templateUp = (incident, durationText) => {
  const who = incident.site.host || incident.site.name;
  return pick([
    `And ${who} is back — about ${durationText} of downtime.`,
    `${who} is responding again after roughly ${durationText} down.`,
    `${who} sorted itself out — back up after ${durationText}.`,
    `Recovery: ${who} is answering again after ${durationText}.`,
  ]);
};

const template = (incident, opts) =>
  opts.phase === 'up' ? templateUp(incident, opts.durationText) : templateDown(incident);

// ── OpenRouter ──────────────────────────────────────────────────
const SYSTEM_PROMPT = [
  `You run the X account for ${config.brand.name}, a real-time uptime monitor. You watch a lot of sites from the outside and post when one you're tracking drops or comes back.`,
  'Write ONE short post — a real tweet a person would write — about the event below.',
  '',
  "Voice: a sharp engineer casually narrating what they're seeing on their dashboard. First person is fine (\"looks like…\", \"from where I'm watching…\"). Sound like a person, not a status page.",
  '',
  'Keep posts feeling different from each other:',
  '- Vary how you open. Do NOT start every post the same way, and do NOT lead every post with an emoji or the same word.',
  '- Vary sentence shape and length — sometimes one clause, sometimes two.',
  '- A leading 🔴 (down) or 🟢 (recovered) is fine occasionally for at-a-glance status, but it is optional. Most posts should not have one.',
  '',
  'Hard rules:',
  '- Output ONLY the post text. No quotes, no preamble, no labels, no hashtags.',
  '- Under 270 characters.',
  '- Report ONLY what the data gives you: the site, that it went down or came back, the status code / error string, the response time, and the downtime length. Use the EXACT status code you are given (do not round 503 to "500s").',
  '- Do NOT speculate about the cause, the impact, the consequences, severity, or who/what is affected. Never write things like "renewals are stalling", "users can\'t log in", "affecting everyone", or "across the board" — you have no idea, you only see an HTTP response.',
  '- Do NOT describe what the site or service is for, or what it normally does, unless you are told. Just name it.',
  '- You ONLY observe these sites from the outside — you do not own, host, operate, or fix them. Never imply you (or anyone) are investigating or working on a fix.',
  `- You ARE ${config.brand.name}, so do NOT credit it in every post, and never tack on a sign-off like "detected by ${config.brand.name}", "monitored by ${config.brand.name}", or "via ${config.brand.name}". Mention ${config.brand.name} only once in a while, and only if it reads naturally. Do not include any URL or @handle.`,
  '- Never mock, celebrate, or editorialize about someone else having an outage. Matter-of-fact and a little human, never gloating.',
].join('\n');

// Per-post nudges. One is picked at random each call so back-to-back posts
// take different shapes instead of all converging on the same sentence.
const DOWN_ANGLES = [
  'Lead with the symptom you see, then name the site.',
  'Lead with the site name, then what it is doing.',
  'Open mid-thought, like you just caught it on the dashboard.',
  'Keep it to a single short sentence.',
  'Frame it as a quick heads-up for anyone using the site.',
  'Note that it just started (a moment ago / right now).',
  'Plain and flat — just what you are seeing, no flourish.',
];

const UP_ANGLES = [
  'React to the recovery first ("and it\'s back"), then the detail.',
  'Lead with the site name and that it is responding again.',
  'Work in how long it was down, casually.',
  'Note things look back to normal (the 200 / the response time).',
  'Keep it to a single short sentence.',
  'Close the loop like you have been watching the whole time.',
];

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

  const angle = pick(opts.phase === 'up' ? UP_ANGLES : DOWN_ANGLES);
  const parts = [
    'Write the post for this event.',
    facts.join('\n'),
    '',
    `Angle for THIS post (a nudge, not a rule — stay natural): ${angle}`,
  ];

  // Show the model its recent posts (URLs stripped) so it can deliberately
  // avoid reusing their openings, structure, and stock phrases.
  const recent = (Array.isArray(opts.recentPosts) ? opts.recentPosts : [])
    .map((t) => stripUrls(t))
    .filter(Boolean);
  if (recent.length) {
    parts.push(
      '',
      'Your recent posts are below. Write something that clearly does NOT reuse their opening words, sentence structure, or stock phrases — this one must read differently:',
      recent.map((t) => `- ${t}`).join('\n')
    );
  }

  return parts.join('\n');
};

async function generateWithOpenRouter(incident, opts) {
  const { apiKey, model, referer, title, timeoutMs, temperature } = config.openrouter;
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
        max_tokens: 160,
        temperature,
        // Push the model off tokens/phrases it has just used, so a run of
        // posts doesn't drift back into one repeated shape. (Providers that
        // don't support these — e.g. Anthropic via OpenRouter — ignore them.)
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
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
    return text; // body only — link is appended by generateCopy
  } finally {
    clearTimeout(timer);
  }
}

// Public: always resolves to a usable post string, with opts.link (a status
// page or home URL) appended when present.
export async function generateCopy(incident, opts) {
  let body;
  if (openrouterConfigured) {
    try {
      body = await generateWithOpenRouter(incident, opts);
    } catch (err) {
      console.warn(`[copy] AI generation failed (${err.message}) — using template`);
      body = template(incident, opts);
    }
  } else {
    body = template(incident, opts);
  }
  return withLink(body, opts?.link ?? null);
}

// Standalone template post (body + link), for tests/fallback callers.
export const templateCopy = (incident, opts) =>
  withLink(template(incident, opts), opts?.link ?? null);

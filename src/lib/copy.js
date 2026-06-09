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
// a lone surrogate at the boundary. Uses a plain "..." rather than the "…"
// glyph, which reads as an AI tell.
const cpClamp = (t, max) => {
  const cp = [...t];
  if (cp.length <= max) return t;
  const ELLIPSIS = '...';
  return `${cp.slice(0, Math.max(0, max - ELLIPSIS.length)).join('').trimEnd()}${ELLIPSIS}`;
};

// Remove the punctuation that makes copy read as machine-written. The em dash
// is the big tell the user called out; en/figure dashes, smart quotes, and the
// "…" glyph go too. Numeric ranges keep a hyphen ("200-500"); clause-joining
// dashes become a comma, the way a person typing quickly would write it.
const stripAiArtifacts = (t) => {
  let s = String(t ?? '');
  s = s.replace(/(\d)\s*[—–―]\s*(\d)/g, '$1-$2'); // 200 — 500 -> 200-500
  s = s.replace(/\s*[—–―]\s*/g, ', '); // clause dash -> comma
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...');
  // Tidy doubled punctuation the dash->comma swap can create.
  s = s.replace(/,\s*([,.;:!?])/g, '$1').replace(/([.!?;:])\s*,/g, '$1');
  return s.replace(/\s{2,}/g, ' ').trim();
};

// The hashtag people actually search to follow a service's outage: the brand
// label + "down" (github.com -> #githubdown,
// acme-v02.api.letsencrypt.org -> #letsencryptdown). The same tag rides the
// recovery reply so followers get the all-clear under the tag they're watching.
const SECONDARY_TLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'go', 'gob']);
const brandLabel = (host) => {
  if (!host) return null;
  const labels = String(host).toLowerCase().replace(/:\d+$/, '').split('.').filter(Boolean);
  if (labels.length < 2) return labels[0] || null;
  let i = labels.length - 2; // second-to-last (the registrable name, usually)
  if (SECONDARY_TLDS.has(labels[i]) && labels.length >= 3) i -= 1; // ...co.uk -> step in
  return labels[i] || null;
};

const outageHashtag = (incident) => {
  const brand = brandLabel(incident.site.host || incident.site.name);
  const clean = (brand || '').replace(/[^a-z0-9]/gi, ''); // tags are alphanumeric only
  return clean ? `#${clean}down` : null;
};

// Assemble the final post from the message body plus an always-present outage
// hashtag and an optional status-page link. De-AIs the body, drops any URL or
// hashtag the model slipped in (so ours are the only ones), and reserves room
// so the result fits 280 in BOTH raw length and X's t.co-weighted length.
const assemble = (body, { hashtag, link }) => {
  let clean = stripAiArtifacts(stripUrls(body));
  clean = clean.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1').replace(/\s{2,}/g, ' ').trim();

  let reserve = 0;
  if (hashtag) reserve += hashtag.length + 1; // " #brandown"
  if (link) reserve += Math.max(String(link).length, TCO_LEN) + 1; // link (t.co) + space
  const trimmed = cpClamp(clean, Math.max(0, MAX_LEN - reserve));

  return [trimmed, hashtag, link].filter(Boolean).join(' ');
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

// ── Deterministic templates (always available) — body only; the hashtag and
// link are appended by assemble() in generateCopy. These are the safety net
// for when the model call fails, so they rotate through a few phrasings too: a
// flaky model run shouldn't drop us back to one rigid, obviously-canned line.
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
    `Heads up, ${who} looks down right now (${detail}).`,
    `${who} just stopped responding from where we're watching: ${detail}.`,
    `Looks like ${who} is having trouble. ${detail}.`,
    `${who} isn't answering at the moment (${detail}).`,
  ]);
};

const templateUp = (incident, durationText) => {
  const who = incident.site.host || incident.site.name;
  return pick([
    `And ${who} is back, about ${durationText} of downtime.`,
    `${who} is responding again after roughly ${durationText} down.`,
    `${who} sorted itself out. Back up after ${durationText}.`,
    `Recovery: ${who} is answering again after ${durationText}.`,
  ]);
};

const template = (incident, opts) =>
  opts.phase === 'up' ? templateUp(incident, opts.durationText) : templateDown(incident);

// ── OpenRouter ──────────────────────────────────────────────────
const SYSTEM_PROMPT = [
  `You run the X account for ${config.brand.name}, a real-time uptime monitor. You watch a lot of sites from the outside and post when one you're tracking drops or comes back.`,
  'Write ONE short post, a real tweet a person would write, about the event below.',
  '',
  'Voice: a sharp engineer casually noting what they\'re seeing on their dashboard. First person is fine ("looks like it just dropped", "still down from where I\'m watching"). Sound like a person, not a status page.',
  '',
  'Keep posts feeling different from each other:',
  '- Vary how you open. Do NOT start every post the same way, and do NOT lead every post with an emoji or the same word.',
  '- Vary sentence shape and length. Sometimes one clause, sometimes two.',
  '- A leading 🔴 (down) or 🟢 (recovered) is fine occasionally for at-a-glance status, but it is optional. Most posts should not have one.',
  '',
  'Write like a human, not like AI. This matters:',
  '- NEVER use an em dash or en dash (the long "—" or "–" characters). Use a comma, a period, or parentheses instead. This is the #1 tell and it is banned.',
  '- No smart/curly quotes and no "…" glyph. Plain , . ! ? " \' only.',
  '- Skip AI cadence entirely. Banned: "not just X", "it\'s not X, it\'s Y", "isn\'t just", "more than just", "and honestly", "let\'s be real", rhetorical questions, and any dramatic build-up or contrast framing. State the fact plainly and stop.',
  '',
  'Hard rules:',
  '- Output ONLY the post text. No quotes around it, no preamble, no labels, no hashtags (one is added for you).',
  '- Under 270 characters.',
  '- Report ONLY what the data gives you: the site, that it went down or came back, the status code / error string, the response time, and the downtime length. Use the EXACT status code you are given (do not round 503 to "500s").',
  '- You can see ONLY an HTTP code, an error string, a response time, and how long it was down. You do NOT know what the site is for, who uses it, what breaks downstream, or why it failed, so do not guess any of it even if the hostname is famous. CONCRETELY BANNED: explaining what the service does ("the cert issuance API", "their login system"); naming who is affected ("if you\'re trying to renew certs", "users can\'t check out"); guessing the cause ("that\'s why it\'s timing out", "looks like a bad deploy"); and scope or severity ("across the board", "major outage"). Name the site, state the code and timing, stop.',
  '- You ONLY observe these sites from the outside. You do not own, host, operate, or fix them. Never imply you (or anyone) are investigating or working on a fix.',
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
  'Plain and flat. Just what you are seeing, no flourish.',
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
    `Angle for THIS post (a nudge, not a rule, stay natural): ${angle}`,
  ];

  // Show the model its recent posts (URLs stripped) so it can deliberately
  // avoid reusing their openings, structure, and stock phrases.
  const recent = (Array.isArray(opts.recentPosts) ? opts.recentPosts : [])
    .map((t) => stripUrls(t))
    .filter(Boolean);
  if (recent.length) {
    parts.push(
      '',
      'Your recent posts are below. Write something that clearly does NOT reuse their opening words, sentence structure, or stock phrases. This one must read differently:',
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

// Public: always resolves to a usable post string with the outage hashtag and,
// when present, opts.link (a status page or home URL) appended.
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
  return assemble(body, { hashtag: outageHashtag(incident), link: opts?.link ?? null });
}

// Standalone template post (body + hashtag + link), for tests/fallback callers.
export const templateCopy = (incident, opts) =>
  assemble(template(incident, opts), { hashtag: outageHashtag(incident), link: opts?.link ?? null });

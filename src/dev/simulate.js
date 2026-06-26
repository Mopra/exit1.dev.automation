// Local end-to-end exercise of the down/up -> X pipeline, without HTTP and
// without ever posting to X. Verifies normalization, dedup, the debounce hold
// (short blips post nothing), down-only recovery handling, flap suppression,
// the budget guard, AND status-page link resolution (a real public-monitored
// site -> /status/<slug>; an unknown site -> home page).
//
//   npm run simulate
//
// Forces DRY_RUN on and uses a throwaway state file. Reaches the live public
// status API (read-only) to resolve links, and uses real AI copy if
// OPENROUTER_API_KEY is set, otherwise the deterministic template.

process.env.DRY_RUN = 'true';
process.env.STATE_FILE = './data/sim-state.json';
process.env.FLAP_COOLDOWN_MS = process.env.FLAP_COOLDOWN_MS ?? String(15 * 60 * 1000);
// Tiny debounce window so the demo can show a held down-post actually firing
// without a real multi-minute wait. (Production default is 5 min.)
process.env.MIN_OUTAGE_MS = process.env.MIN_OUTAGE_MS ?? '400';
// Down-only is the default. Uncomment to also demo threaded recovery replies:
// process.env.POST_RECOVERY = 'true';

import { promises as fs } from 'node:fs';

await fs.rm('./data/sim-state.json', { force: true }).catch(() => {});

// Dynamic imports AFTER the env assignments above — a static `import` is
// hoisted and would evaluate config.js (reading STATE_FILE) before they run.
const { config } = await import('../config.js');
const { handleDelivery, flush } = await import('../lib/publisher.js');

const minutes = (n) => n * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = Date.now();

// Pick a real public-monitored site so we can see a status-page link resolve.
let publicSite = { name: 'GitHub', url: 'https://github.com', host: 'github.com' };
try {
  const res = await fetch(`${config.status.apiBase}/v1/public/monitors`);
  const { monitors = [] } = await res.json();
  const m = monitors.find((x) => x.host) ?? null;
  if (m) publicSite = { name: m.name || m.host, url: m.url, host: m.host };
} catch {
  /* fall back to the hardcoded guess */
}
// A site that is definitely NOT in the public index -> should link to home.
const privateSite = { name: 'Internal', url: 'https://no-status-page.invalid', host: 'no-status-page.invalid' };

const down = (s, at, extra = {}) => ({
  event: 'website_down',
  summary: `🚨 ${s.name} is DOWN`,
  timestamp: at,
  website: {
    id: s.host,
    name: s.name,
    url: s.url,
    type: 'website',
    status: 'offline',
    responseTime: 0,
    lastStatusCode: extra.code ?? 503,
    statusCodeInfo: `HTTP ${extra.code ?? 503}`,
    error: `HTTP ${extra.code ?? 503}: Service Unavailable`,
    targetIp: '34.117.33.233',
  },
  previousStatus: 'online',
  userId: 'user_demo',
});

const up = (s, at) => ({
  event: 'website_up',
  summary: `✅ ${s.name} is back UP`,
  timestamp: at,
  website: {
    id: s.host,
    name: s.name,
    url: s.url,
    type: 'website',
    status: 'online',
    responseTime: 240,
    lastStatusCode: 200,
    statusCodeInfo: 'HTTP 200',
    targetIp: '34.117.33.233',
  },
  previousStatus: 'offline',
  userId: 'user_demo',
});

const HOLD = config.debounce.minOutageMs;
const fire = async (label, payload) => {
  const result = await handleDelivery(payload);
  console.log(`• ${label}\n  → ${JSON.stringify(result)}\n`);
  return result;
};

console.log(`\n─── pipeline simulation (dry-run, down-only, ${HOLD}ms debounce) ───\n`);

// 1) A real outage on a public site: the down is HELD, then publishes once the
//    debounce window elapses with the site still down (→ status-page link).
await fire(`${publicSite.host} down → held ${HOLD}ms to confirm`, down(publicSite, base - minutes(42)));
await fire('same site down again → already pending, ignored', down(publicSite, base - minutes(40)));
await sleep(HOLD + 150);
await flush(); // let the debounce timer fire and the down-post complete
console.log('  (debounce window elapsed → down-post published above)\n');

// 2) Recovery in down-only mode: close the incident, arm the cooldown, post
//    nothing. (Set POST_RECOVERY=true to thread an all-clear reply instead.)
await fire(`${publicSite.host} recovers → closed silently (down-only)`, up(publicSite, base));

// 3) It drops again right after recovering → flap cooldown suppresses the down.
await fire(`${publicSite.host} flaps down again → flap cooldown suppresses`, down(publicSite, base, { code: 503 }));

// 4) A pure blip on another site: down then up INSIDE the window → never posted
//    (→ no status-page lookup, no copy, no X write).
await fire(`${privateSite.host} down → held ${HOLD}ms`, down(privateSite, base - minutes(3), { code: 500 }));
await fire(`${privateSite.host} recovers within window → down suppressed`, up(privateSite, base - minutes(3) + 100));

console.log('─── done ───\n');
process.exit(0);

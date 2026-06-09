// Local end-to-end exercise of the down/up -> X pipeline, without HTTP
// and without ever posting to X. Verifies normalization, dedup, threaded
// recovery, flap suppression, and the budget guard.
//
//   npm run simulate
//
// Forces DRY_RUN on and uses a throwaway state file. If OPENROUTER_API_KEY
// is set it will generate real AI copy (cheap); otherwise it uses the
// deterministic template.

process.env.DRY_RUN = 'true';
process.env.STATE_FILE = './data/sim-state.json';
process.env.FLAP_COOLDOWN_MS = process.env.FLAP_COOLDOWN_MS ?? String(15 * 60 * 1000);

import { promises as fs } from 'node:fs';

// Start from a clean slate so runs are repeatable.
await fs.rm('./data/sim-state.json', { force: true }).catch(() => {});

const { handleDelivery } = await import('../lib/publisher.js');

const minutes = (n) => n * 60 * 1000;
const base = Date.now();

const down = (name, url, at, extra = {}) => ({
  event: 'website_down',
  summary: `🚨 ${name} is DOWN`,
  timestamp: at,
  website: {
    id: extra.id ?? name.toLowerCase().replace(/\W+/g, '-'),
    name,
    url,
    type: 'website',
    status: 'offline',
    responseTime: 0,
    lastStatusCode: extra.code ?? 503,
    statusCodeInfo: `HTTP ${extra.code ?? 503}`,
    error: extra.error ?? `HTTP ${extra.code ?? 503}: Service Unavailable`,
    targetIp: '34.117.33.233',
  },
  previousStatus: 'online',
  userId: 'user_demo',
});

const up = (name, url, at, extra = {}) => ({
  event: 'website_up',
  summary: `✅ ${name} is back UP`,
  timestamp: at,
  website: {
    id: extra.id ?? name.toLowerCase().replace(/\W+/g, '-'),
    name,
    url,
    type: 'website',
    status: 'online',
    responseTime: extra.responseTime ?? 240,
    lastStatusCode: 200,
    statusCodeInfo: 'HTTP 200',
    targetIp: '34.117.33.233',
  },
  previousStatus: 'offline',
  userId: 'user_demo',
});

const steps = [
  ['A goes down', down('App', 'https://app.exit1.dev/health', base - minutes(42))],
  ['A down again (duplicate)', down('App', 'https://app.exit1.dev/health', base - minutes(40))],
  ['A recovers (threaded reply, ~42m)', up('App', 'https://app.exit1.dev/health', base)],
  ['B goes down', down('Docs', 'https://docs.exit1.dev', base - minutes(3), { code: 500 })],
  ['B recovers quickly (flap)', up('Docs', 'https://docs.exit1.dev', base - minutes(1))],
  ['B flaps down again (cooldown should suppress)', down('Docs', 'https://docs.exit1.dev', base, { code: 500 })],
];

console.log('\n─── pipeline simulation (dry-run) ───\n');
for (const [label, payload] of steps) {
  const result = await handleDelivery(payload);
  console.log(`• ${label}`);
  console.log(`  → ${JSON.stringify(result)}\n`);
}
console.log('─── done ───\n');
process.exit(0);

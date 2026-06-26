import express from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config, xConfigured, openrouterConfigured } from '../config.js';
import { handleDelivery, onPublish } from '../lib/publisher.js';
import { startScheduler } from '../scheduler/scheduler.js';

// exit1.dev signs each delivery as `X-Exit1-Signature: sha256=<hex>`, an
// HMAC-SHA256 of the exact raw request body keyed by the webhook secret
// (see functions/src/alert-webhook.ts). We must verify against the raw bytes
// we received — re-serializing req.body could reorder keys / change spacing
// and break the comparison.
const verifySignature = (header, rawBody) => {
  if (!header || !rawBody?.length || !SECRET) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac('sha256', SECRET).update(rawBody).digest();
  const provided = Buffer.from(m[1], 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

const PORT = config.port;
const PATH = config.webhookPath;
const SECRET = config.webhookSecret;

const app = express();
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const paint = (color, s) => `${c[color]}${s}${c.reset}`;

const eventStyle = (event) => {
  if (event === 'website_down') return { color: 'red', icon: '⬇' };
  if (event === 'website_up') return { color: 'green', icon: '⬆' };
  if (event === 'website_error') return { color: 'yellow', icon: '⚠' };
  return { color: 'cyan', icon: '•' };
};

const fmtTime = (ms) => {
  if (!ms) return paint('gray', 'no timestamp');
  const d = new Date(ms);
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

const fmtMs = (n) => (typeof n === 'number' ? `${n}ms` : paint('gray', 'n/a'));

const printDelivery = (req, body) => {
  const id = req.header('x-request-id') ?? randomUUID().slice(0, 8);
  const event = body?.event ?? 'unknown';
  const { color, icon } = eventStyle(event);
  const w = body?.website ?? {};

  const header = `${paint(color, `${c.bold}${icon} ${event}${c.reset}`)} ${paint('gray', `[${id}]`)}`;
  const summary = body?.summary ? `  ${body.summary}` : '';
  const time = `  ${paint('gray', fmtTime(body?.timestamp))}`;

  const lines = [
    '',
    paint('gray', '─'.repeat(72)),
    header,
    summary,
    time,
    '',
    `  ${paint('bold', 'Website')}      ${w.name ?? paint('gray', 'unknown')} ${paint('gray', `(${w.id ?? '—'})`)}`,
    `  ${paint('bold', 'URL')}          ${w.url ?? paint('gray', '—')}`,
    `  ${paint('bold', 'Type')}         ${w.type ?? paint('gray', '—')}`,
    `  ${paint('bold', 'Status')}       ${w.status ?? paint('gray', '—')} ${body?.previousStatus ? paint('gray', `(was ${body.previousStatus})`) : ''}`,
    `  ${paint('bold', 'HTTP')}         ${w.statusCodeInfo ?? paint('gray', '—')}`,
    `  ${paint('bold', 'Response')}     ${fmtMs(w.responseTime)}${w.responseTimeExceeded ? paint('yellow', '  (threshold exceeded)') : ''}`,
    `  ${paint('bold', 'Target IP')}    ${w.targetIp ?? paint('gray', '—')}`,
    w.error ? `  ${paint('bold', 'Error')}        ${paint('red', w.error)}` : null,
    body?.userId ? `  ${paint('bold', 'User')}         ${paint('gray', body.userId)}` : null,
    paint('gray', '─'.repeat(72)),
  ].filter(Boolean);

  console.log(lines.join('\n'));
};

const logPublish = (r) => {
  if (!r) return;
  if (r.action === 'post' || r.action === 'reply') {
    const arrow = r.action === 'reply' ? `reply→${r.inReplyTo}` : 'post';
    console.log(paint('magenta', `  ⮑ X ${arrow} [${r.tweetId}] ${r.site}`));
  } else if (r.action === 'dry-run-post' || r.action === 'dry-run-reply') {
    console.log(paint('magenta', `  ⮑ X ${paint('dim', '(dry-run)')} ${r.phase} [${r.tweetId}] ${r.site}`));
  } else if (r.action === 'hold') {
    console.log(paint('gray', `  ⮑ X holding ${r.site}: ${r.reason}`));
  } else if (r.action === 'skip') {
    console.log(paint('gray', `  ⮑ X skip: ${r.reason}`));
  } else if (r.action === 'error') {
    console.log(paint('red', `  ⮑ X error: ${r.reason}`));
  }
};

// A debounced down-post publishes on a timer, after the original request has
// been acked — route its result through the same logger so it's still seen.
onPublish(logPublish);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post(PATH, (req, res) => {
  if (SECRET) {
    if (!verifySignature(req.header('x-exit1-signature'), req.rawBody)) {
      console.warn(paint('yellow', `[auth] rejected delivery: bad or missing X-Exit1-Signature`));
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const body = req.body ?? {};
  if (!body || typeof body !== 'object') {
    console.warn(paint('yellow', '[parse] non-object body'));
    return res.status(400).json({ ok: false, error: 'invalid body' });
  }

  printDelivery(req, body);

  // Ack immediately so exit1.dev never times out / retries, then run the
  // publish pipeline asynchronously. handleDelivery is serialized and
  // never throws.
  res.status(200).json({ ok: true });
  handleDelivery(body)
    .then(logPublish)
    .catch((err) => console.error(paint('red', `  ⮑ X pipeline crashed: ${err?.message ?? err}`)));
});

app.use((req, res) => {
  console.log(paint('gray', `[404] ${req.method} ${req.url}`));
  res.status(404).json({ ok: false, error: 'not found' });
});

// Error handler (4-arg) for body-parser failures — malformed JSON
// (entity.parse.failed) or oversized bodies (entity.too.large). Logs one
// concise line instead of letting Express dump a full stack to stdout on
// every junk request to the public endpoint.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 400;
  const kind = err.type || (status === 413 ? 'payload too large' : 'bad request');
  console.warn(paint('yellow', `[${status}] ${req.method} ${req.url} — ${kind}`));
  if (!res.headersSent) res.status(status).json({ ok: false, error: kind });
});

const server = app.listen(PORT, () => {
  const publishMode = !config.outage.enabled
    ? paint('gray', 'DISABLED — outage posting off (OUTAGE_ENABLED=false)')
    : config.outage.dryRun
      ? paint('yellow', 'DRY-RUN — copy generated & logged, nothing posted to X')
      : xConfigured
        ? paint('green', 'LIVE — posting to X')
        : paint('yellow', 'LIVE requested but X creds missing — falling back to dry-run');
  const copyMode = openrouterConfigured
    ? paint('green', `AI (${config.openrouter.model})`)
    : paint('yellow', 'template only — set OPENROUTER_API_KEY for AI copy');

  console.log('');
  console.log(paint('bold', '  exit1.dev webhook receiver → X publisher'));
  console.log(paint('gray', '  ──────────────────────────────────────────'));
  console.log(`  ${paint('bold', 'Listening')}  http://localhost:${PORT}${PATH}`);
  console.log(`  ${paint('bold', 'Health')}     http://localhost:${PORT}/health`);
  console.log(`  ${paint('bold', 'Auth')}       ${SECRET ? paint('green', 'HMAC-SHA256 of body required (X-Exit1-Signature)') : paint('yellow', 'open — set WEBHOOK_SECRET to require auth')}`);
  console.log(`  ${paint('bold', 'Publish')}    ${publishMode}`);
  console.log(`  ${paint('bold', 'Copy')}       ${copyMode}`);
  console.log(`  ${paint('bold', 'Budget')}     ${config.budget.perDay}/day · ${config.budget.perMonth}/month · link in posts: ${config.includeLink ? 'on' : 'off'}`);
  const debounceLabel = config.debounce.minOutageMs > 0
    ? `${Math.round(config.debounce.minOutageMs / 1000)}s debounce`
    : paint('yellow', 'no debounce (post immediately)');
  const recoveryLabel = config.recovery.enabled
    ? 'down + recovery reply'
    : 'down-only (1 write/incident)';
  console.log(`  ${paint('bold', 'Policy')}     ${debounceLabel} · ${recoveryLabel}`);
  console.log('');
  console.log(paint('gray', '  Waiting for deliveries… (Ctrl+C to stop)'));

  // Start the evergreen content scheduler in-process so the single-container
  // deploy posts on its own cadence too. If you instead run the standalone
  // runner (npm run scheduler) or a second container, set
  // CONTENT_SCHEDULER_ENABLED=false here to avoid double-posting.
  if (config.scheduler.enabled) {
    startScheduler();
  } else {
    console.log(paint('gray', '  Content scheduler disabled (CONTENT_SCHEDULER_ENABLED=false)'));
  }
});

const shutdown = (signal) => {
  console.log('');
  console.log(paint('gray', `[${signal}] shutting down`));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

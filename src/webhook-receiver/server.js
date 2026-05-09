import express from 'express';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const PATH = process.env.WEBHOOK_PATH ?? '/webhook';
const SECRET = process.env.WEBHOOK_SECRET ?? null;

const app = express();
app.use(express.json({ limit: '1mb' }));

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

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post(PATH, (req, res) => {
  if (SECRET) {
    const provided = req.header('x-webhook-secret') ?? req.query.secret;
    if (provided !== SECRET) {
      console.warn(paint('yellow', `[auth] rejected delivery: bad or missing secret`));
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const body = req.body ?? {};
  if (!body || typeof body !== 'object') {
    console.warn(paint('yellow', '[parse] non-object body'));
    return res.status(400).json({ ok: false, error: 'invalid body' });
  }

  printDelivery(req, body);
  res.status(200).json({ ok: true });
});

app.use((req, res) => {
  console.log(paint('gray', `[404] ${req.method} ${req.url}`));
  res.status(404).json({ ok: false, error: 'not found' });
});

const server = app.listen(PORT, () => {
  console.log('');
  console.log(paint('bold', '  exit1.dev webhook receiver'));
  console.log(paint('gray', '  ──────────────────────────────'));
  console.log(`  ${paint('bold', 'Listening')}  http://localhost:${PORT}${PATH}`);
  console.log(`  ${paint('bold', 'Health')}     http://localhost:${PORT}/health`);
  console.log(`  ${paint('bold', 'Auth')}       ${SECRET ? paint('green', 'shared secret required (x-webhook-secret)') : paint('yellow', 'open — set WEBHOOK_SECRET to require auth')}`);
  console.log('');
  console.log(paint('gray', '  Waiting for deliveries… (Ctrl+C to stop)'));
});

const shutdown = (signal) => {
  console.log('');
  console.log(paint('gray', `[${signal}] shutting down`));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

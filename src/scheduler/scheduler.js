// The content scheduler engine.
//
// Once a minute it asks: is any slot due right now that has not been handled? If
// so it posts exactly one (via the shared, DRY_RUN-aware x-client) and records
// it. "Due" means now is in the window [scheduledAt, scheduledAt + grace]. A
// slot whose window has fully passed while the process was down is recorded as
// "missed" and never fired late, so you never wake up to yesterday's "good
// morning" post landing at noon.
//
// Safety properties:
//   • At most one post per tick — a cold start mid-day drips the still-valid
//     slots out one per minute instead of dumping a burst at X.
//   • Every decision is persisted, so a crash/restart cannot double-post.
//   • DRY_RUN (config.dryRun) is honored by x-client: nothing leaves the box
//     until it is flipped off, the copy is just logged.

import { config, xConfigured } from '../config.js';
import { postTweet } from '../lib/x-client.js';
import { buildCalendar } from './schedule.js';
import { SchedulerStore } from './state.js';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', magenta: '\x1b[35m', gray: '\x1b[90m', cyan: '\x1b[36m',
};
const paint = (color, s) => `${c[color]}${s}${c.reset}`;

const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

// Pick the single entry to act on this tick: the earliest unhandled entry whose
// scheduled time has arrived. Entries still in the future are left alone;
// entries past their grace window are returned flagged stale so the caller can
// mark them missed (also one per tick, to keep the file writes calm).
const pickActionable = async (entries, store, now, graceMs) => {
  for (const e of entries) {
    if (now < e.scheduledMs) break; // sorted ascending — nothing due yet
    if (await store.isHandled(e.key)) continue;
    const stale = now > e.scheduledMs + graceMs;
    return { entry: e, stale };
  }
  return null;
};

const tick = async ({ entries, store, now }) => {
  const graceMs = config.scheduler.graceMinutes * 60000;
  const hit = await pickActionable(entries, store, now(), graceMs);
  if (!hit) return;

  const { entry, stale } = hit;

  if (stale) {
    await store.record(entry.key, { at: now(), status: 'missed', text: entry.text });
    console.warn(paint('yellow', `[scheduler] missed ${entry.key} (was due ${fmt(entry.scheduledMs)}, grace ${config.scheduler.graceMinutes}m passed) — skipping, not posting late`));
    return;
  }

  try {
    const res = await postTweet(entry.text, { dryRun: config.scheduler.dryRun });
    const status = res.dryRun ? 'dry-run' : 'posted';
    await store.record(entry.key, { at: now(), status, tweetId: res.id, text: entry.text });
    const tag = res.dryRun ? paint('dim', '(dry-run)') : paint('green', 'LIVE');
    console.log(paint('magenta', `[scheduler] ${tag} ${entry.pillar} [${res.id}]`) + ` ${paint('gray', entry.key)}`);
    console.log(`           ${entry.text}`);
  } catch (err) {
    // Do NOT record on failure — leave the slot unhandled so the next tick
    // retries it (still inside the grace window). A persistent failure will
    // eventually age out to "missed" rather than spin forever.
    console.error(paint('yellow', `[scheduler] post failed for ${entry.key}: ${err?.message ?? err} — will retry next tick`));
  }
};

export function startScheduler({ now = () => Date.now() } = {}) {
  const sc = config.scheduler;
  const entries = buildCalendar({ jitterMax: sc.jitterMinutes });
  const store = new SchedulerStore(sc.stateFile);

  // Per-day counts, just for the startup banner.
  const perDay = {};
  for (const e of entries) perDay[e.date] = (perDay[e.date] ?? 0) + 1;
  const counts = Object.values(perDay);
  const dayspan = counts.length;
  const lo = counts.length ? Math.min(...counts) : 0;
  const hi = counts.length ? Math.max(...counts) : 0;

  const first = entries[0];
  const last = entries[entries.length - 1];
  const mode = config.scheduler.dryRun
    ? paint('yellow', 'DRY-RUN — copy logged, nothing posted')
    : xConfigured
      ? paint('green', 'LIVE — posting to X')
      : paint('yellow', 'LIVE requested but X creds missing — dry-run');

  console.log('');
  console.log(paint('bold', '  exit1 content scheduler'));
  console.log(paint('gray', '  ─────────────────────────'));
  console.log(`  ${paint('bold', 'Posts')}      ${entries.length} over ${dayspan} days (${lo}-${hi}/day)`);
  console.log(`  ${paint('bold', 'Window')}     ${first ? first.date : '—'} → ${last ? last.date : '—'}  ${paint('gray', `(+/- ${sc.jitterMinutes}m jitter)`)}`);
  console.log(`  ${paint('bold', 'Publish')}    ${mode}`);
  console.log(`  ${paint('bold', 'State')}      ${store.file}`);
  console.log('');

  // Run one tick right away (so a cold start mid-window does not wait a full
  // minute), then on an interval. The interval is unref'd so it never holds a
  // standalone process open by itself.
  const run = () => tick({ entries, store, now }).catch((e) => console.error('[scheduler] tick error', e));
  run();
  const timer = setInterval(run, sc.tickMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

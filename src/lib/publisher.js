// Orchestrates the down/up -> X pipeline.
//
//   normalize -> decide (dedup, budget, flap cooldown) -> generate copy
//   -> post/reply on X -> update threading state.
//
// All deliveries are funnelled through a single serial queue so the JSON
// state file and the X timeline stay consistent even under bursts.

import { config } from '../config.js';
import { normalize, humanDuration } from './normalize.js';
import { Store } from './state.js';
import { generateCopy } from './copy.js';
import { resolveStatusLink } from './status-page.js';
import { postTweet, replyTweet } from './x-client.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_WINDOW_MS = 30 * DAY_MS;

const store = new Store(config.stateFile);

let chain = Promise.resolve();

// Down-posts being debounced: siteKey -> { timer, incident }. A `down` event
// schedules a hold here instead of posting immediately; a recovery arriving
// inside the window cancels it, so a short blip posts nothing. In-memory only:
// a process restart drops any in-flight holds, which fails safe (the down just
// never posts) rather than emitting a stale alert.
const pending = new Map();

// Sink for results that complete asynchronously — i.e. a debounced down-post
// fired by a timer, which the original caller has long since stopped awaiting.
// The server wires this to its console logger so a held post is still reported
// when it finally publishes. No-op until set.
let onAsyncResult = null;
export function onPublish(fn) {
  onAsyncResult = typeof fn === 'function' ? fn : null;
}

// Append work onto the serial queue so the JSON state file and the X timeline
// stay consistent, isolating failures so one bad task can't wedge the chain.
// Used for inbound deliveries and for debounced down-posts firing on a timer.
function enqueue(task) {
  const run = () =>
    Promise.resolve()
      .then(task)
      .catch((err) => ({ action: 'error', reason: err?.message ?? String(err) }));
  chain = chain.then(run, run);
  return chain;
}

// Public entry point. Never throws — returns a result describing what
// happened (posted / held / skipped / error) for logging.
export function handleDelivery(rawBody) {
  return enqueue(() => process(rawBody));
}

// Await the queue, including any debounced post that has already fired. For
// tests and the offline simulator; the live server doesn't need it.
export function flush() {
  return chain;
}

async function withinBudget(now) {
  const day = await store.postsInWindow(DAY_MS, now);
  if (day >= config.budget.perDay) {
    return { ok: false, reason: `daily budget reached (${day}/${config.budget.perDay})` };
  }
  const month = await store.postsInWindow(MONTH_WINDOW_MS, now);
  if (month >= config.budget.perMonth) {
    return { ok: false, reason: `monthly budget reached (${month}/${config.budget.perMonth})` };
  }
  return { ok: true };
}

async function process(rawBody) {
  // Outage automation can be turned off entirely, independent of the content
  // scheduler. When off, deliveries are acked and dropped (no copy, no posts).
  if (!config.outage.enabled) {
    return { action: 'skip', reason: 'outage automation disabled (OUTAGE_ENABLED=false)' };
  }

  const incident = normalize(rawBody);
  if (!incident) return { action: 'skip', reason: 'unparseable body' };
  if (!incident.siteKey) return { action: 'skip', reason: 'no usable site identifier' };

  if (incident.kind === 'down') return handleDown(incident);
  if (incident.kind === 'up') return handleUp(incident);
  return { action: 'skip', reason: `event "${incident.event}" is not actionable` };
}

async function handleDown(incident) {
  const { siteKey } = incident;
  // Rate/budget/cooldown decisions use wall-clock, never the (untrusted,
  // possibly backlogged) event timestamp — X enforces its quota in real time.
  const now = Date.now();

  // Already-open incident for this site? The site is still down; don't
  // double-post.
  if (await store.getOpenIncident(siteKey)) {
    return { action: 'skip', reason: 'incident already open for this site' };
  }

  // Already holding a down for this site in the debounce window — the existing
  // timer will decide; a repeated down event changes nothing.
  if (pending.has(siteKey)) {
    return { action: 'skip', reason: 'down already pending (debounce window)' };
  }

  // Flap suppression: if this site recovered very recently, hold off.
  const cooldownUntil = await store.getCooldownUntil(siteKey, config.flapCooldownMs);
  if (now < cooldownUntil) {
    return { action: 'skip', reason: 'within flap cooldown window' };
  }

  // Debounce: don't post yet. Hold for minOutageMs; if the site recovers inside
  // the window (handleUp clears the timer), the outage was a blip and we post
  // nothing. Only a site still down when the timer fires gets a post. This is
  // the main write-saver. minOutageMs <= 0 disables the hold (post now).
  if (config.debounce.minOutageMs > 0) {
    const timer = setTimeout(() => {
      enqueue(() => firePendingDown(siteKey)).then((r) => onAsyncResult?.(r));
    }, config.debounce.minOutageMs);
    // A pending hold must never keep the process alive on shutdown.
    if (typeof timer.unref === 'function') timer.unref();
    pending.set(siteKey, { timer, incident });
    return {
      action: 'hold',
      reason: `debouncing ${config.debounce.minOutageMs}ms before posting`,
      site: incident.site.host ?? incident.site.name,
    };
  }

  return postDown(incident);
}

// Runs when a debounce window elapses with the site still down. On the serial
// queue (see enqueue), so it can touch state safely.
async function firePendingDown(siteKey) {
  const entry = pending.get(siteKey);
  if (!entry) return { action: 'skip', reason: 'pending down was cancelled' };
  pending.delete(siteKey);
  return postDown(entry.incident);
}

// Generate + publish the down-post and open the incident. Shared by the
// immediate path (debounce off) and the timer path (debounce window elapsed).
async function postDown(incident) {
  const { siteKey, at, site } = incident;
  const now = Date.now();

  // A parallel path may have opened an incident while we held the timer.
  if (await store.getOpenIncident(siteKey)) {
    return { action: 'skip', reason: 'incident already open for this site' };
  }

  const budget = await withinBudget(now);
  if (!budget.ok) {
    return { action: 'skip', reason: budget.reason };
  }

  const link = config.includeLink ? await resolveStatusLink(incident) : null;
  const recentPosts = await store.getRecentPosts(config.copy.recentMemory);
  const text = await generateCopy(incident, { phase: 'down', link, recentPosts });
  const tweet = await postTweet(text, { dryRun: config.outage.dryRun });

  await store.openIncident(siteKey, {
    downTweetId: tweet.id,
    downAt: at, // event time — used only for downtime-duration math
    name: site.name,
    host: site.host,
  });
  // Remember the text (even in dry-run) purely so the next post can avoid
  // echoing it — this is variety memory, not the budget ledger below.
  await store.addRecentPost(text);
  if (!tweet.dryRun) await store.recordPost(now);

  return {
    action: tweet.dryRun ? 'dry-run-post' : 'post',
    phase: 'down',
    tweetId: tweet.id,
    text,
    site: site.host ?? site.name,
  };
}

async function handleUp(incident) {
  const { siteKey, at, site } = incident;
  const now = Date.now();

  // Recovered inside the debounce window: the down-post never went out. Cancel
  // the hold and stay silent — this is where blip/flap writes are saved.
  const held = pending.get(siteKey);
  if (held) {
    clearTimeout(held.timer);
    pending.delete(siteKey);
    return {
      action: 'skip',
      reason: 'recovered within debounce window — down suppressed',
      site: site.host ?? site.name,
    };
  }

  const open = await store.getOpenIncident(siteKey);
  if (!open) {
    // We never posted a "down" for this site (started up, missed event,
    // budget-skipped, or flap-suppressed) — nothing to recover.
    return { action: 'skip', reason: 'no open incident to recover' };
  }

  // Close the incident and arm the flap cooldown (wall-clock) up front,
  // regardless of whether we post an all-clear — so a failed recovery post
  // can't leave the site stuck "open" and suppress its future down-posts, and
  // the next down debounces/cools down normally.
  await store.setRecovered(siteKey, now);
  await store.closeIncident(siteKey);

  // Down-only mode (default): we don't post recoveries at all, which is what
  // halves writes per incident. Set POST_RECOVERY=true to thread an all-clear
  // reply onto the original down-post.
  if (!config.recovery.enabled) {
    return {
      action: 'skip',
      reason: 'recovery posting disabled (down-only)',
      closed: true,
      site: site.host ?? site.name,
    };
  }

  // Downtime duration is the only thing that legitimately uses event time.
  const durationMs = at - (open.downAt ?? at);

  const budget = await withinBudget(now);
  if (!budget.ok) {
    return { action: 'skip', reason: budget.reason, closed: true };
  }

  const link = config.includeLink ? await resolveStatusLink(incident) : null;
  const recentPosts = await store.getRecentPosts(config.copy.recentMemory);
  const text = await generateCopy(incident, {
    phase: 'up',
    durationMs,
    durationText: humanDuration(durationMs),
    link,
    recentPosts,
  });
  const reply = await replyTweet(text, open.downTweetId, { dryRun: config.outage.dryRun });

  await store.addRecentPost(text);
  if (!reply.dryRun) await store.recordPost(now);

  return {
    action: reply.dryRun ? 'dry-run-reply' : 'reply',
    phase: 'up',
    tweetId: reply.id,
    inReplyTo: open.downTweetId,
    durationText: humanDuration(durationMs),
    text,
    site: site.host ?? site.name,
  };
}

export { store };

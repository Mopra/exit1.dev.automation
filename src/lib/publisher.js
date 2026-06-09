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

// Public entry point. Never throws — returns a result describing what
// happened (posted / skipped / error) for logging.
export function handleDelivery(rawBody) {
  const run = () =>
    process(rawBody).catch((err) => ({
      action: 'error',
      reason: err?.message ?? String(err),
    }));
  // Serialize, but isolate failures so one bad delivery can't wedge the chain.
  chain = chain.then(run, run);
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
  const incident = normalize(rawBody);
  if (!incident) return { action: 'skip', reason: 'unparseable body' };
  if (!incident.siteKey) return { action: 'skip', reason: 'no usable site identifier' };

  if (incident.kind === 'down') return handleDown(incident);
  if (incident.kind === 'up') return handleUp(incident);
  return { action: 'skip', reason: `event "${incident.event}" is not actionable` };
}

async function handleDown(incident) {
  const { siteKey, at, site } = incident;
  // Rate/budget/cooldown decisions use wall-clock, never the (untrusted,
  // possibly backlogged) event timestamp — X enforces its quota in real time.
  const now = Date.now();

  // Already-open incident for this site? The site is still down; don't
  // double-post.
  const open = await store.getOpenIncident(siteKey);
  if (open) {
    return { action: 'skip', reason: 'incident already open for this site' };
  }

  // Flap suppression: if this site recovered very recently, hold off.
  const cooldownUntil = await store.getCooldownUntil(siteKey, config.flapCooldownMs);
  if (now < cooldownUntil) {
    return { action: 'skip', reason: 'within flap cooldown window' };
  }

  const budget = await withinBudget(now);
  if (!budget.ok) {
    return { action: 'skip', reason: budget.reason };
  }

  const link = config.includeLink ? await resolveStatusLink(incident) : null;
  const recentPosts = await store.getRecentPosts(config.copy.recentMemory);
  const text = await generateCopy(incident, { phase: 'down', link, recentPosts });
  const tweet = await postTweet(text);

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

  const open = await store.getOpenIncident(siteKey);
  if (!open) {
    // We never posted a "down" for this site (started up, missed event,
    // budget-skipped, or flap-suppressed) — nothing to recover.
    return { action: 'skip', reason: 'no open incident to recover' };
  }

  // Close the incident and record the recovery time (wall-clock, for the
  // flap window) up front. We already hold open.downTweetId for the reply,
  // so closing first means a failed recovery post can't leave the site
  // stuck "open" and suppress its future down-posts.
  await store.setRecovered(siteKey, now);
  await store.closeIncident(siteKey);

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
  const reply = await replyTweet(text, open.downTweetId);

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

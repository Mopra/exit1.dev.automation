// Thin wrapper around twitter-api-v2 for posting and threaded replies.
//
// Honors DRY_RUN: when on (the default), nothing is sent to X — the copy
// is logged and a synthetic id is returned so the threading/state logic
// can be exercised end-to-end without credentials or public posts.

import { config, xConfigured } from '../config.js';

let _client = null;
let _dryRunSeq = 0;

async function getRwClient() {
  if (_client) return _client;
  // Lazy import so the dependency is only required when actually posting.
  const { TwitterApi } = await import('twitter-api-v2');
  const api = new TwitterApi({
    appKey: config.x.appKey,
    appSecret: config.x.appSecret,
    accessToken: config.x.accessToken,
    accessSecret: config.x.accessSecret,
  });
  _client = api.readWrite;
  return _client;
}

const dryRunResult = (text, inReplyTo) => {
  _dryRunSeq += 1;
  const id = `dryrun-${_dryRunSeq}`;
  const tag = inReplyTo ? `reply→${inReplyTo}` : 'post';
  console.log(`\x1b[35m[dry-run ${tag}]\x1b[0m ${text}`);
  return { id, dryRun: true };
};

// Normalize twitter-api-v2 errors into a readable Error.
const describeError = (err) => {
  // ApiResponseError shape: code, errors, rateLimit, isAuthError, data.detail
  const parts = [];
  if (err?.code) parts.push(`HTTP ${err.code}`);
  if (err?.rateLimitError) parts.push('rate-limited');
  const detail = err?.data?.detail || err?.errors?.[0]?.message || err?.message;
  if (detail) parts.push(detail);
  return parts.join(' — ') || String(err);
};

export async function postTweet(text, { dryRun = config.dryRun } = {}) {
  if (dryRun || !xConfigured) {
    if (!xConfigured && !dryRun) {
      console.warn('[x] credentials missing — forcing dry-run for this post');
    }
    return dryRunResult(text, null);
  }
  try {
    const client = await getRwClient();
    const { data } = await client.v2.tweet(text);
    return { id: data.id, dryRun: false };
  } catch (err) {
    throw new Error(`X post failed: ${describeError(err)}`);
  }
}

export async function replyTweet(text, inReplyToTweetId, { dryRun = config.dryRun } = {}) {
  // A recovery whose down-post was a dry run (or whose id we lost) can't
  // thread — fall back to a standalone post so the "all clear" still goes out.
  const canThread = inReplyToTweetId && !String(inReplyToTweetId).startsWith('dryrun-');

  if (dryRun || !xConfigured) {
    if (!xConfigured && !dryRun) {
      console.warn('[x] credentials missing — forcing dry-run for this reply');
    }
    return dryRunResult(text, canThread ? inReplyToTweetId : null);
  }
  try {
    const client = await getRwClient();
    const { data } = canThread
      ? await client.v2.reply(text, inReplyToTweetId)
      : await client.v2.tweet(text);
    return { id: data.id, dryRun: false };
  } catch (err) {
    throw new Error(`X reply failed: ${describeError(err)}`);
  }
}

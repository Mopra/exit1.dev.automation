// Tiny persistent store backed by a single JSON file.
//
// It tracks three things:
//   • openIncidents  — siteKey -> { downTweetId, downAt, name, host }
//                      so a recovery can reply into the original thread.
//   • posts          — epoch-ms timestamps of every real post, used to
//                      enforce the rolling daily/monthly budget.
//   • cooldowns      — siteKey -> epoch-ms a site last recovered, used
//                      to suppress flapping (rapid down/up) re-posts.
//
// All writes go through a single promise chain so concurrent webhook
// deliveries can't corrupt the file or race each other.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

const empty = () => ({ openIncidents: {}, posts: [], cooldowns: {} });

export class Store {
  constructor(file) {
    this.file = path.resolve(file);
    this.data = empty();
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this.data;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        openIncidents: parsed.openIncidents ?? {},
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        cooldowns: parsed.cooldowns ?? {},
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.data = empty();
      } else {
        // Present but unreadable (truncated write, partial volume restore,
        // bad manual edit). Quarantine it rather than silently overwriting,
        // and shout — a reset drops the post-budget ledger and every open
        // incident (so down sites lose their threaded recovery).
        const aside = `${this.file}.corrupt-${Date.now()}`;
        try {
          await fs.rename(this.file, aside);
          console.error(
            `[state] ${this.file} unreadable (${err.message}); quarantined to ${aside}, starting fresh — post budget + open incidents reset`
          );
        } catch (renameErr) {
          console.error(
            `[state] ${this.file} unreadable (${err.message}) and could not quarantine (${renameErr.message}); starting fresh — post budget + open incidents reset`
          );
        }
        this.data = empty();
      }
    }
    this.loaded = true;
    return this.data;
  }

  // Serialize a mutate-then-persist operation.
  #mutate(fn) {
    this.queue = this.queue.then(async () => {
      await this.load();
      const result = await fn(this.data);
      await this.#persist();
      return result;
    });
    return this.queue;
  }

  async #persist() {
    const dir = path.dirname(this.file);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await fs.rename(tmp, this.file); // atomic on same filesystem
  }

  // ── Incidents ────────────────────────────────────────────────
  async getOpenIncident(siteKey) {
    await this.load();
    return this.data.openIncidents[siteKey] ?? null;
  }

  openIncident(siteKey, record) {
    return this.#mutate((d) => {
      d.openIncidents[siteKey] = record;
    });
  }

  closeIncident(siteKey) {
    return this.#mutate((d) => {
      const rec = d.openIncidents[siteKey] ?? null;
      delete d.openIncidents[siteKey];
      return rec;
    });
  }

  // ── Flap cooldown ────────────────────────────────────────────
  async getCooldownUntil(siteKey, cooldownMs) {
    await this.load();
    const recoveredAt = this.data.cooldowns[siteKey];
    return recoveredAt ? recoveredAt + cooldownMs : 0;
  }

  setRecovered(siteKey, at) {
    return this.#mutate((d) => {
      d.cooldowns[siteKey] = at;
    });
  }

  // ── Post budget ──────────────────────────────────────────────
  async postsInWindow(windowMs, now = Date.now()) {
    await this.load();
    const since = now - windowMs;
    return this.data.posts.filter((t) => t >= since).length;
  }

  recordPost(at = Date.now()) {
    return this.#mutate((d) => {
      d.posts.push(at);
      // Prune anything older than the longest window we care about.
      const cutoff = at - MONTH_MS;
      d.posts = d.posts.filter((t) => t >= cutoff);
      // Prune stale cooldowns too.
      for (const [k, v] of Object.entries(d.cooldowns)) {
        if (v < cutoff) delete d.cooldowns[k];
      }
    });
  }
}

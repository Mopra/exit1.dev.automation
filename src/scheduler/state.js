// Tiny persistent store for the content scheduler, kept separate from the
// outage bot's state (src/lib/state.js) so the two automations never step on
// each other's files.
//
// It tracks one thing: which slot instances have already been handled, keyed by
// "<date>#s<slot>" -> { at, status, text }. status is 'posted' | 'dry-run' |
// 'missed'. Recording a slot (in any status) means "do not touch this again",
// which is what makes restarts safe: a post fires at most once, and a slot the
// process slept through is marked missed rather than fired late.
//
// Atomic writes (tmp + rename) and a serialized write queue mirror the outage
// store, so a crash mid-write cannot corrupt the file.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const empty = () => ({ sent: {}, version: 1 });

export class SchedulerStore {
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
      this.data = { sent: parsed.sent ?? {}, version: parsed.version ?? 1 };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Present but unreadable — quarantine rather than silently overwrite, so
        // a bad volume restore does not cause the whole month to repost.
        const aside = `${this.file}.corrupt-${Date.now()}`;
        try {
          await fs.rename(this.file, aside);
          console.error(`[scheduler-state] ${this.file} unreadable (${err.message}); quarantined to ${aside}, starting fresh`);
        } catch (renameErr) {
          console.error(`[scheduler-state] ${this.file} unreadable (${err.message}) and could not quarantine (${renameErr.message}); starting fresh`);
        }
      }
      this.data = empty();
    }
    this.loaded = true;
    return this.data;
  }

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
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  async isHandled(key) {
    await this.load();
    return Boolean(this.data.sent[key]);
  }

  async getHandled(key) {
    await this.load();
    return this.data.sent[key] ?? null;
  }

  record(key, record) {
    return this.#mutate((d) => {
      d.sent[key] = record;
    });
  }

  async countByStatus() {
    await this.load();
    const out = { posted: 0, 'dry-run': 0, missed: 0 };
    for (const v of Object.values(this.data.sent)) {
      out[v.status] = (out[v.status] ?? 0) + 1;
    }
    return out;
  }
}

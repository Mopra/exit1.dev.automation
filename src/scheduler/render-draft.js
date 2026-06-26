// Renders the content calendar to a human-readable markdown draft you approve
// BEFORE anything goes live. It calls the same buildCalendar() the runtime uses,
// so the times and texts here are exactly what will post (down to the jitter).
//
//   npm run calendar           # writes drafts/content-calendar.md
//   node src/scheduler/render-draft.js
//
// Re-run it whenever you edit calendar.js (text, dates, or times).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { buildCalendar } from './schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../drafts/content-calendar.md');

const tz = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);

const sc = config.scheduler;
const entries = buildCalendar({ jitterMax: sc.jitterMinutes });

// Group by date for readability.
const byDate = new Map();
for (const e of entries) {
  if (!byDate.has(e.date)) byDate.set(e.date, []);
  byDate.get(e.date).push(e);
}

const overLimit = entries.filter((e) => e.length > 280);
const lines = [];
lines.push(`# Content calendar draft — @pradslabs`);
lines.push('');
lines.push(`> Generated from \`src/scheduler/calendar.js\`. This is exactly what the VPS will post (DRY_RUN gates whether it actually sends). Re-run \`npm run calendar\` after edits.`);
lines.push('');
const counts = [...byDate.values()].map((d) => d.length);
lines.push(`- **Posts:** ${entries.length}  (fluctuating ${Math.min(...counts)}-${Math.max(...counts)}/day, avg ${(entries.length / byDate.size).toFixed(1)})`);
lines.push(`- **Window:** ${entries[0]?.date} → ${entries[entries.length - 1]?.date}  (${byDate.size} days)`);
lines.push(`- **Jitter:** +/- ${sc.jitterMinutes}m on each post time (deterministic; reflected in the times below)`);
lines.push(`- **Times shown:** UTC · Copenhagen · New York`);
lines.push(`- **Over 280 chars:** ${overLimit.length === 0 ? 'none ✅' : overLimit.map((e) => e.key).join(', ')}`);
lines.push('');
lines.push(`Categories: ` + [...new Set(entries.map((e) => e.pillar))].map((l) => `**${l}**`).join(' · '));
lines.push('');

for (const [date, dayEntries] of byDate) {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(dayEntries[0].scheduledAt);
  lines.push(`## ${date} (${weekday}) — ${dayEntries.length} posts`);
  lines.push('');
  for (const e of dayEntries) {
    const utc = tz(e.scheduledAt, 'UTC');
    const cph = tz(e.scheduledAt, 'Europe/Copenhagen');
    const ny = tz(e.scheduledAt, 'America/New_York');
    lines.push(`- **${utc} UTC** · ${cph} CPH · ${ny} NY — _${e.pillarLabel}_ · ${e.length} chars`);
    lines.push(`  > ${e.text}`);
  }
  lines.push('');
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, lines.join('\n'), 'utf8');
console.log(`Wrote ${entries.length} posts to ${OUT}`);
if (overLimit.length) {
  console.warn(`WARNING: ${overLimit.length} post(s) exceed 280 chars: ${overLimit.map((e) => e.key).join(', ')}`);
}

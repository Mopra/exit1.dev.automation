// Pure scheduling logic for the content automation.
//
// The calendar is now explicit (see calendar.js): each post carries its own UTC
// date + time. This module's job is to turn that list into runtime entries —
// attach a small deterministic jitter, compute the absolute scheduled time,
// sanitize the text — and hand them back sorted by time.
//
// "Deterministic" matters: the runtime (scheduler.js) and the draft renderer
// (render-draft.js) both call buildCalendar() and MUST agree to the minute, so
// the markdown you approve is exactly what posts. That is why the jitter is
// derived from a hash of the post's date+time key, never from Math.random().

import { CALENDAR } from './calendar.js';

// ── Date / time helpers (UTC, no locale dependence) ─────────────
const partsOf = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) throw new Error(`bad date: ${ymd} (want YYYY-MM-DD)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

export const ymdToUtcMs = (ymd) => {
  const [y, mo, d] = partsOf(ymd);
  return Date.UTC(y, mo - 1, d);
};

// "HH:MM" -> minutes from midnight UTC.
export const timeToMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error(`bad time: ${hhmm} (want HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`time out of range: ${hhmm}`);
  return h * 60 + min;
};

// ── Deterministic jitter ─────────────────────────────────────────
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// A small, deterministic +/- offset per post so times do not land on the exact
// same minute every day (an automation tell), while staying reproducible.
export const jitterMinutes = (key, maxMin) => {
  if (!maxMin || maxMin < 1) return 0;
  const span = maxMin * 2 + 1;
  return (hash(key) % span) - maxMin;
};

export const slotKey = (date, time) => `${date}#${time}`;

// ── Copy safety net ──────────────────────────────────────────────
// Posts in calendar.js are written clean, but sanitize anyway so a stray paste
// can never ship an em dash, smart quote, or link (all of which read as bot /
// suppress reach). Mirrors the de-AI rules used by the outage copy in copy.js.
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const MAX_LEN = 280;

export const sanitizePost = (raw) => {
  let s = String(raw ?? '');
  s = s.replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim(); // no links in body
  s = s.replace(/(\d)\s*[—–―]\s*(\d)/g, '$1-$2'); // 200 — 500 -> 200-500
  s = s.replace(/\s*[—–―]\s*/g, ', '); // clause dash -> comma
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...');
  s = s.replace(/,\s*([,.;:!?])/g, '$1').replace(/([.!?;:])\s*,/g, '$1');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if ([...s].length > MAX_LEN) {
    s = [...s].slice(0, MAX_LEN).join('').trimEnd();
  }
  return s;
};

// ── Calendar ─────────────────────────────────────────────────────
// Reads the explicit CALENDAR list and produces runtime entries, sorted by the
// (jittered) scheduled time.
export const buildCalendar = ({ jitterMax = 12 } = {}) => {
  const entries = CALENDAR.map((item) => {
    const baseMin = timeToMinutes(item.time);
    const key = slotKey(item.date, item.time);
    const jit = jitterMinutes(key, jitterMax);
    const scheduledMs = ymdToUtcMs(item.date) + (baseMin + jit) * 60000;
    const text = sanitizePost(item.text);
    return {
      key,
      date: item.date,
      time: item.time,
      pillar: item.pillar,
      pillarLabel: item.pillar,
      baseMinUtc: baseMin,
      jitterMin: jit,
      scheduledMs,
      scheduledAt: new Date(scheduledMs),
      text,
      length: [...text].length,
    };
  });
  entries.sort((a, b) => a.scheduledMs - b.scheduledMs);
  return entries;
};

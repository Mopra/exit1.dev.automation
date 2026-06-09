// Turn a raw exit1.dev webhook delivery into a clean, predictable
// "incident" object the rest of the pipeline can rely on.
//
// Raw payload shape (from exit1.dev webhook preset):
//   { event, summary, timestamp, previousStatus, userId,
//     website: { id, name, url, type, status, responseTime,
//                lastStatusCode, statusCodeInfo, error, targetIp,
//                responseTimeExceeded } }

const hostFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    // new URL() needs a scheme; TCP/ICMP checks may be bare host[:port].
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`;
    const h = new URL(withScheme).hostname;
    return h.replace(/^www\./i, '') || null;
  } catch {
    // Fall back to a best-effort strip of scheme/path/port.
    return (
      url
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/[/:?#].*$/, '')
        .replace(/^www\./i, '') || null
    );
  }
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// The webhook's `timestamp` is attacker/clock-skew influenced. Accept it
// only inside a sane window; otherwise fall back to wall-clock now. This
// bounds downtime-duration math and keeps a poisoned value from reaching
// any time-based logic. (Budget/cooldown use wall-clock regardless.)
const clampTimestamp = (t) => {
  const now = Date.now();
  const v = num(t);
  if (v == null || v < now - WEEK_MS || v > now + FUTURE_SKEW_MS) return now;
  return v;
};

export const kindForEvent = (event) => {
  switch (event) {
    case 'website_down':
      return 'down';
    case 'website_up':
      return 'up';
    case 'website_error':
      return 'error';
    default:
      return 'other';
  }
};

export function normalize(body) {
  if (!body || typeof body !== 'object') return null;

  const event = typeof body.event === 'string' ? body.event : 'unknown';
  const w = body.website && typeof body.website === 'object' ? body.website : {};

  const url = typeof w.url === 'string' ? w.url : null;
  const host = hostFromUrl(url) ?? (typeof w.name === 'string' ? w.name : null);

  // Prefer the stable check id; fall back to url, then host. If none of
  // these exist we can't track the incident, so siteKey stays null.
  const siteKey =
    (w.id != null && String(w.id)) || url || host || null;

  const at = clampTimestamp(body.timestamp);

  const statusCode = num(w.lastStatusCode);
  const httpInfo =
    (typeof w.statusCodeInfo === 'string' && w.statusCodeInfo) ||
    (statusCode != null ? `HTTP ${statusCode}` : null);

  return {
    event,
    kind: kindForEvent(event),
    at,
    siteKey: siteKey || null,
    site: {
      id: w.id ?? null,
      name: (typeof w.name === 'string' && w.name) || host || 'a monitored site',
      url,
      host: host || null,
      type: typeof w.type === 'string' ? w.type : null,
      status: typeof w.status === 'string' ? w.status : null,
      httpInfo,
      statusCode,
      responseTime: num(w.responseTime),
      responseTimeExceeded: Boolean(w.responseTimeExceeded),
      error: typeof w.error === 'string' ? w.error : null,
      targetIp: typeof w.targetIp === 'string' ? w.targetIp : null,
    },
    previousStatus: typeof body.previousStatus === 'string' ? body.previousStatus : null,
    userId: body.userId ?? null,
    summary: typeof body.summary === 'string' ? body.summary : null,
  };
}

// Human-friendly downtime duration, e.g. "3m", "1h 12m", "2d 4h".
export function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'moments';
  const s = Math.round(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.max(s, 1)}s`;
}

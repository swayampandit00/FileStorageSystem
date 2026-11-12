const SENSITIVE = /password|token|secret|authorization|cookie/i;

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : v;
  }
  return out;
}

export const logger = {
  info(msg: string, meta: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ level: "info", msg, ...sanitize(meta), ts: new Date().toISOString() }));
  },
  warn(msg: string, meta: Record<string, unknown> = {}) {
    console.warn(JSON.stringify({ level: "warn", msg, ...sanitize(meta), ts: new Date().toISOString() }));
  },
  error(msg: string, meta: Record<string, unknown> = {}) {
    console.error(JSON.stringify({ level: "error", msg, ...sanitize(meta), ts: new Date().toISOString() }));
  },
};

/**
 * Preview access controls — pure Web Crypto, no browser-exposed secrets.
 *
 * IMPORTANT: in-memory counters are per worker instance only. A WAF/Cloudflare
 * Access (or a shared durable rate limiter) is REQUIRED for public deployment.
 */
const SESSION_SECONDS = 30 * 60;
const LOGIN_WINDOW_MS = 5 * 60_000;
const SEARCH_WINDOW_MS = 60 * 60_000;
const LOGIN_MAX = 5;
const SEARCH_MAX_PER_SESSION = 12;
const SEARCH_MAX_PER_PROCESS = 100;

type Counter = { until: number; count: number };
const counters = new Map<string, Counter>();

export interface IntuiPreviewSecrets {
  accessPassword: string | undefined;
  sessionSecret: string | undefined;
}

export function previewSecretsReady(s: IntuiPreviewSecrets): boolean {
  // Fail closed on weak/reused secrets and missing keys.
  return !!s.accessPassword && s.accessPassword.length >= 24
    && !!s.sessionSecret && s.sessionSecret.length >= 32
    && s.accessPassword !== s.sessionSecret;
}

function encode(input: string) {
  return new TextEncoder().encode(input);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  // Inputs are digests, never plaintext. No early return on length.
  let diff = a.length ^ b.length;
  const longest = Math.max(a.length, b.length);
  for (let i = 0; i < longest; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function hash(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", encode(input));
  return hex(new Uint8Array(digest));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encode(value))));
}

export async function checkPreviewPassword(
  submitted: string,
  secrets: IntuiPreviewSecrets,
): Promise<boolean> {
  if (!previewSecretsReady(secrets) || submitted.length > 512) return false;
  const [expected, actual] = await Promise.all([
    hash(secrets.accessPassword!),
    hash(submitted),
  ]);
  return constantTimeEqual(expected, actual);
}

export async function createPreviewSession(
  secrets: IntuiPreviewSecrets,
  now = Date.now(),
): Promise<string | null> {
  if (!previewSecretsReady(secrets)) return null;
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = hex(nonceBytes);
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${nonce}`;
  return `${payload}.${await hmac(payload, secrets.sessionSecret!)}`;
}

export async function verifyPreviewSession(
  session: string | undefined,
  secrets: IntuiPreviewSecrets,
  now = Date.now(),
): Promise<boolean> {
  if (!session || !previewSecretsReady(secrets)) return false;
  const match = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(session);
  if (!match) return false;
  const expires = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expires) || expires <= seconds ||
    expires > seconds + SESSION_SECONDS) return false;
  const expected = await hmac(`${match[1]}.${match[2]}`, secrets.sessionSecret!);
  return constantTimeEqual(expected, match[3]!);
}

/** Local protection only — always combine with deployment-level WAF rules. */
export function consumePreviewLimit(
  bucket: "login" | "search",
  session: string | undefined,
  now = Date.now(),
): boolean {
  // Bounded map; expiration cleanup to prevent indefinite growth.
  for (const [key, state] of counters) {
    if (state.until <= now) counters.delete(key);
  }
  if (counters.size > 1024) return false;
  const check = (key: string, windowMs: number, max: number) => {
    const state = counters.get(key);
    const active = state && state.until > now
      ? state : { until: now + windowMs, count: 0 };
    if (active.count >= max) return false;
    active.count++;
    counters.set(key, active);
    return true;
  };
  if (bucket === "login") return check("login-global", LOGIN_WINDOW_MS, LOGIN_MAX);
  if (!session) return false;
  // Session is a signed opaque value, never logged or exposed.
  if (!check("search-global", SEARCH_WINDOW_MS, SEARCH_MAX_PER_PROCESS)) return false;
  return check(`search:${session}`, SEARCH_WINDOW_MS, SEARCH_MAX_PER_SESSION);
}

export function resetPreviewLimitForTests() {
  counters.clear();
}

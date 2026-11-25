import crypto from 'node:crypto';
import type { UserRole } from '../src/types/medex.ts';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export interface SessionTokenPayload {
  userId: number;
  role: UserRole;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

let warnedMissingSecret = false;

// Track revoked JTIs until their token expiration, and per-user cutoffs after privilege/status changes
const revokedJtiExpiry = new Map<string, number>();
const userTokenInvalidBefore = new Map<number, number>();
const authAttemptBuckets = new Map<string, number[]>();

function getSigningSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16 && !configured.includes('YOUR_SESSION_SECRET')) {
    return configured;
  }
  if (!warnedMissingSecret && process.env.NODE_ENV === 'production') {
    warnedMissingSecret = true;
    console.warn(
      '[MedEx Auth] SESSION_SECRET is unset or too short; using an ephemeral secret that invalidates sessions on restart.'
    );
  }
  return EPHEMERAL_FALLBACK_SECRET;
}

function pruneRevokedTokens(now: number): void {
  if (revokedJtiExpiry.size === 0) return;
  for (const [jti, exp] of revokedJtiExpiry.entries()) {
    if (exp <= now) {
      revokedJtiExpiry.delete(jti);
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signSessionToken(input: {
  userId: number;
  role: UserRole;
  email: string;
}): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    userId: input.userId,
    role: input.role,
    email: input.email.toLowerCase(),
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<SessionTokenPayload>;
    if (
      typeof decoded.userId !== 'number' ||
      !Number.isInteger(decoded.userId) ||
      decoded.userId <= 0 ||
      typeof decoded.role !== 'string' ||
      typeof decoded.email !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }
    const now = Date.now();
    if (now > decoded.exp) {
      return null;
    }
    pruneRevokedTokens(now);
    if (decoded.jti && revokedJtiExpiry.has(decoded.jti)) {
      return null;
    }
    const cutoff = userTokenInvalidBefore.get(decoded.userId);
    if (typeof cutoff === 'number' && typeof decoded.iat === 'number' && decoded.iat < cutoff) {
      return null;
    }
    return decoded as SessionTokenPayload;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string | null | undefined): boolean {
  const payload = verifySessionToken(token);
  if (!payload || !payload.jti) return false;
  revokedJtiExpiry.set(payload.jti, payload.exp);
  return true;
}

export function invalidateUserTokens(userId: number, atMs = Date.now()): void {
  if (!Number.isInteger(userId) || userId <= 0) return;
  userTokenInvalidBefore.set(userId, atMs);
}

export function clearSessionRevocationsForTest(): void {
  revokedJtiExpiry.clear();
  userTokenInvalidBefore.clear();
}

export function consumeAuthRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const cutoff = nowMs - windowMs;
  const recent = (authAttemptBuckets.get(bucketKey) || []).filter((ts) => ts > cutoff);
  if (recent.length >= maxAttempts) {
    authAttemptBuckets.set(bucketKey, recent);
    const oldest = recent[0] || nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  recent.push(nowMs);
  authAttemptBuckets.set(bucketKey, recent);
  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - recent.length),
    retryAfterSeconds: 0,
  };
}

export function resetAuthRateLimitsForTest(): void {
  authAttemptBuckets.clear();
}

export function toMySqlDateTime(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function validateUploadDataUrl(
  dataUrl: string,
  allowedMimes: readonly string[],
  maxBytes = 10 * 1024 * 1024
): { ok: true; mimeType: string; extension: string; buffer: Buffer } | { ok: false; error: string } {
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { ok: false, error: 'Invalid file upload format.' };
  }
  const mimeType = match[1].toLowerCase();
  if (!allowedMimes.includes(mimeType)) {
    return { ok: false, error: `Unsupported file type: ${mimeType}.` };
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0 || buffer.length > maxBytes) {
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return { ok: false, error: `File exceeds the ${maxMb} MB upload limit.` };
  }
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return {
    ok: true,
    mimeType,
    extension: extMap[mimeType] || 'bin',
    buffer,
  };
}

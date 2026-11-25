import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSessionRevocationsForTest,
  consumeAuthRateLimit,
  hashPassword,
  invalidateUserTokens,
  resetAuthRateLimitsForTest,
  revokeSessionToken,
  signSessionToken,
  toMySqlDateTime,
  validateUploadDataUrl,
  verifyPassword,
  verifySessionToken,
} from './authService.ts';

test('hashPassword and verifyPassword use unique salted scrypt hashes', () => {
  const h1 = hashPassword('MedExOlongapo2026!');
  const h2 = hashPassword('MedExOlongapo2026!');

  assert.notEqual(h1, h2, 'each hash must use a fresh random salt');
  assert.ok(h1.startsWith('scrypt:'));
  assert.equal(verifyPassword('MedExOlongapo2026!', h1), true);
  assert.equal(verifyPassword('WrongPassword123', h1), false);
  assert.equal(verifyPassword('MedExOlongapo2026!', null), false);
  assert.equal(verifyPassword('MedExOlongapo2026!', 'plaintext-hash'), false);
});

test('signSessionToken and verifySessionToken reject tampered tokens', () => {
  clearSessionRevocationsForTest();
  const token = signSessionToken({
    userId: 901,
    role: 'admin',
    email: 'Admin@MedEx.ph',
  });

  const payload = verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, 901);
  assert.equal(payload.role, 'admin');
  assert.equal(payload.email, 'admin@medex.ph');
  assert.ok(typeof payload.jti === 'string' && payload.jti.length >= 16);

  // Tamper signature
  const [encodedPayload, sig] = token.split('.');
  const badSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
  assert.equal(verifySessionToken(`${encodedPayload}.${badSig}`), null);

  // Tamper payload (role escalation attempt)
  const fakePayload = Buffer.from(
    JSON.stringify({ userId: 101, role: 'admin', email: 'hacker@gmail.com', jti: 'fake', iat: Date.now(), exp: Date.now() + 60000 }),
    'utf8'
  ).toString('base64url');
  assert.equal(verifySessionToken(`${fakePayload}.${sig}`), null);
  assert.equal(verifySessionToken('invalid-token'), null);
});

test('revokeSessionToken and invalidateUserTokens revoke active tokens', () => {
  clearSessionRevocationsForTest();
  const t1 = signSessionToken({ userId: 205, role: 'merchant', email: 'm@gmail.com' });
  const t2 = signSessionToken({ userId: 205, role: 'merchant', email: 'm@gmail.com' });
  const p1 = verifySessionToken(t1);
  const p2 = verifySessionToken(t2);
  assert.ok(p1 && p2);
  assert.notEqual(p1.jti, p2.jti);

  // Logout revokes only t1
  revokeSessionToken(t1);
  assert.equal(verifySessionToken(t1), null);
  assert.ok(verifySessionToken(t2));

  // Role change / suspension cutoff invalidates all prior tokens for user 205
  invalidateUserTokens(205, Date.now() + 50);
  assert.equal(verifySessionToken(t2), null);
  clearSessionRevocationsForTest();
});

test('consumeAuthRateLimit enforces sliding window limits and recovery', () => {
  resetAuthRateLimitsForTest();
  const baseMs = 1_700_000_000_000;
  for (let i = 0; i < 3; i++) {
    const res = consumeAuthRateLimit('login:test@gmail.com', 3, 60_000, baseMs + i * 1000);
    assert.equal(res.allowed, true);
  }
  const blocked = consumeAuthRateLimit('login:test@gmail.com', 3, 60_000, baseMs + 5000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 50);

  // After window elapses, attempts succeed again
  const recovered = consumeAuthRateLimit('login:test@gmail.com', 3, 60_000, baseMs + 61_000);
  assert.equal(recovered.allowed, true);
  resetAuthRateLimitsForTest();
});

test('toMySqlDateTime converts ISO timestamps into MySQL DATETIME format', () => {
  assert.equal(toMySqlDateTime('2026-11-24T05:30:45.000Z'), '2026-11-24 05:30:45');
  assert.equal(toMySqlDateTime(null), null);
  assert.equal(toMySqlDateTime('not-a-date'), null);
});

test('validateUploadDataUrl enforces MIME allowlist and size cap', () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const ok = validateUploadDataUrl(tinyPng, ['image/png', 'image/jpeg']);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.extension, 'png');
    assert.ok(ok.buffer.length > 0);
  }

  // Disallow SVG/HTML to prevent stored XSS
  const svgAttempt = 'data:image/svg+xml;base64,PHN2Zy8+';
  const rejectedMime = validateUploadDataUrl(svgAttempt, ['image/png', 'image/jpeg', 'image/webp']);
  assert.equal(rejectedMime.ok, false);

  // Size limit enforcement
  const oversized = validateUploadDataUrl(tinyPng, ['image/png'], 5);
  assert.equal(oversized.ok, false);
});

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { createMedExRouter } from './medexRoutes.ts';
import { revokeSessionToken, signSessionToken, verifySessionToken, clearSessionRevocationsForTest } from './authService.ts';

function collectRouteSignatures(router: express.Router): string[] {
  const stack = (router as unknown as {
    stack?: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }>;
  }).stack;
  if (!Array.isArray(stack)) return [];
  const signatures: string[] = [];
  for (const layer of stack) {
    if (!layer.route?.path || !layer.route.methods) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled) signatures.push(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }
  return signatures;
}

async function withTestApiServer(
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use('/api', createMedExRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('createMedExRouter registers hardened auth, delivery PIN verify, and upload routes', () => {
  const router = createMedExRouter();
  const routes = collectRouteSignatures(router);

  assert.ok(routes.includes('POST /orders/:id/delivery/verify-code'));
  assert.ok(routes.includes('POST /auth/logout'));
  assert.ok(routes.includes('PATCH /orders/:id/status'));
  assert.ok(routes.includes('POST /ratings/delivery'));
  assert.ok(routes.includes('PUT /reviews/pharmacy/:id'));
  assert.ok(routes.includes('POST /notifications/notify-admins'));
});

test('POST /api/auth/logout revokes supplied bearer token immediately', async () => {
  clearSessionRevocationsForTest();
  const token = signSessionToken({
    userId: 777,
    role: 'resident',
    email: 'resident.test@gmail.com',
  });
  assert.ok(verifySessionToken(token));

  await withTestApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  assert.equal(verifySessionToken(token), null);
  clearSessionRevocationsForTest();
});

test('protected routes fail closed (503) without leaking DB stack details when MySQL is unavailable', async () => {
  const token = signSessionToken({
    userId: 101,
    role: 'rider',
    email: 'rider.test@gmail.com',
  });

  await withTestApiServer(async (baseUrl) => {
    const protectedRequests: Array<{ path: string; method: string; body?: unknown }> = [
      { path: '/api/orders', method: 'POST', body: { merchant_id: 201, items: [] } },
      { path: '/api/orders/501/delivery/verify-code', method: 'POST', body: { code: '1234' } },
      { path: '/api/riders/earnings', method: 'POST', body: { rider_id: 301, delivery_id: 1, amount: 45 } },
      { path: '/api/notifications/notify-admins', method: 'POST', body: { title: 'Test', message: 'Hello' } },
      { path: '/api/state', method: 'GET' },
    ];

    for (const reqSpec of protectedRequests) {
      const res = await fetch(`${baseUrl}${reqSpec.path}`, {
        method: reqSpec.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: reqSpec.body ? JSON.stringify(reqSpec.body) : undefined,
      });
      assert.equal(res.status, 503, `${reqSpec.method} ${reqSpec.path} should fail closed with 503`);
      const data = (await res.json()) as { ok: boolean; error?: string };
      assert.equal(data.ok, false);
      assert.ok(data.error && !/(\bsql\b|select |insert |update |delete from|stack|er_|errno)/i.test(data.error));
    }

    // Revoke token explicitly to leave clean in-memory state
    revokeSessionToken(token);
  });
});

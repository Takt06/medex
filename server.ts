import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPayMongoCheckoutPayload,
  canAccessPaymentOrder,
  extractBearerToken,
  extractPayMongoWebhookOutcome,
  isConfiguredPayMongoKey,
  mapPayMongoSessionStatus,
  validateCheckoutEligibility,
  validateEmergencyDispatchLogInput,
  verifyPayMongoWebhookSignature,
  type CheckoutSessionInput,
  type PayMongoMode,
  type ServerPaymentSession,
} from './server/paymongoService.ts';
import {
  checkMySqlConnection,
  findPaymentSessionFromDb,
  getAuthoritativeOrderForCheckoutFromDb,
  getOrderParticipantsFromDb,
  isMySqlConfigured,
  recordCheckoutSessionOnPaymentDb,
  resolveAuthenticatedMedExUser,
  syncEmergencyDispatchLogToDb,
  syncPaymentOutcomeToDb,
  type AuthenticatedMedExUser,
} from './server/mysqlDb.ts';
import { createMedExRouter } from './server/medexRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

interface EmergencyDispatchLogRecord {
  logId: string;
  referenceCode: string;
  idempotencyKey: string;
  userId: number;
  handoffMode: 'mobile_dialer' | 'desktop_qr';
  barangayName: string;
  addressSnapshot: string;
  latitude: number;
  longitude: number;
  loggedAt: string;
}

// Server-side in-memory stores (persisted to MySQL when connected)
const paymentSessionsById = new Map<string, ServerPaymentSession>();
const paymentSessionIdByIdempotency = new Map<string, string>();
const processedWebhookEvents = new Set<string>();
const emergencyDispatchLogs: EmergencyDispatchLogRecord[] = [];
const emergencyLogByIdempotency = new Map<string, EmergencyDispatchLogRecord>();

function getPayMongoMode(): PayMongoMode {
  return isConfiguredPayMongoKey(process.env.PAYMONGO_SECRET_KEY) ? 'paymongo_live' : 'sandbox';
}

function getAppBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // fall through to safe request host resolution
    }
  }
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = rawProto === 'https' ? 'https' : 'http';
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  const safeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)
    ? rawHost
    : `localhost:${PORT}`;
  return `${proto}://${safeHost}`;
}

function payMongoAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

async function authenticateApiRequestIfConfigured(
  req: express.Request
): Promise<{
  required: boolean;
  authenticated: boolean;
  user: AuthenticatedMedExUser | null;
}> {
  if (!(await checkMySqlConnection())) {
    return { required: false, authenticated: false, user: null };
  }
  const token = extractBearerToken(req.header('Authorization') || req.header('authorization'));
  if (!token) {
    return { required: true, authenticated: false, user: null };
  }
  const user = await resolveAuthenticatedMedExUser(token);
  return { required: true, authenticated: Boolean(user), user };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    next();
  });

  // 1. PayMongo Webhook Endpoint (MUST use raw body BEFORE express.json())
  app.post(
    '/api/webhooks/paymongo',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body || {});

      const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
      const hasWebhookSecret = Boolean(webhookSecret && !webhookSecret.includes('YOUR_PAYMONGO'));
      const isLiveKey = Boolean(process.env.PAYMONGO_SECRET_KEY?.trim().startsWith('sk_live_'));
      const sigHeader = req.header('Paymongo-Signature') || req.header('paymongo-signature');

      if (getPayMongoMode() === 'paymongo_live' && !hasWebhookSecret) {
        return res.status(503).json({
          ok: false,
          error: 'PayMongo webhook signature verification is required in live gateway mode.',
        });
      }

      if (hasWebhookSecret) {
        const verification = verifyPayMongoWebhookSignature(
          rawBody,
          sigHeader,
          webhookSecret,
          isLiveKey
        );
        if (!verification.valid) {
          return res.status(401).json({ ok: false, error: verification.reason || 'Invalid signature' });
        }
      }

      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid webhook JSON payload' });
      }

      const eventId = (parsedPayload.data as { id?: string } | undefined)?.id;
      if (eventId && processedWebhookEvents.has(eventId)) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      const outcome = extractPayMongoWebhookOutcome(parsedPayload);
      if (outcome?.sessionId) {
        const existing = paymentSessionsById.get(outcome.sessionId);
        if (existing) {
          existing.status = outcome.status;
          existing.gatewayReference = outcome.gatewayReference || existing.gatewayReference;
          existing.failureReason = outcome.failureReason;
          if (outcome.status === 'paid') {
            existing.paidAt = existing.paidAt || new Date().toISOString();
          }
          existing.updatedAt = new Date().toISOString();
          paymentSessionsById.set(existing.sessionId, existing);
        }

        await syncPaymentOutcomeToDb({
          orderId: outcome.orderId ?? existing?.orderId,
          sessionId: outcome.sessionId,
          status: outcome.status,
          gatewayReference: outcome.gatewayReference,
          failureReason: outcome.failureReason,
          paidAt: outcome.status === 'paid' ? new Date().toISOString() : undefined,
        });
      }

      if (eventId) {
        processedWebhookEvents.add(eventId);
      }

      return res.status(200).json({ received: true, outcome });
    }
  );

  // Larger JSON body limit to support base64 product photos, 10 MB Rx uploads, and merchant verification documents
  app.use(express.json({ limit: '16mb' }));

  // Publicly serve uploaded product images only (prescriptions require authenticated route)
  app.use('/uploads/products', express.static(path.resolve(process.cwd(), 'uploads', 'products')));

  // 2. Backend Health & API Capabilities
  app.get('/api/health', async (_req, res) => {
    const mode = getPayMongoMode();
    const webhookConfigured = Boolean(
      process.env.PAYMONGO_WEBHOOK_SECRET &&
        !process.env.PAYMONGO_WEBHOOK_SECRET.includes('YOUR_PAYMONGO')
    );
    const databaseConfigured = isMySqlConfigured();
    const databaseConnected = databaseConfigured ? await checkMySqlConnection() : false;
    res.json({
      ok: true,
      service: 'MedEx Express API',
      phase: 'mysql_navicat_fullstack',
      databaseEngine: 'mysql',
      databaseConfigured,
      databaseConnected,
      paymongoMode: mode,
      webhookConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  // 3. MedEx MySQL Full-Stack REST & SSE Realtime Routes
  app.use('/api', createMedExRouter());

  // 4. PayMongo GCash Checkout Session Creation
  app.post('/api/payments/gcash/checkout', async (req, res) => {
    const authState = await authenticateApiRequestIfConfigured(req);
    if (authState.required && (!authState.authenticated || !authState.user)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required to initiate GCash checkout.',
      });
    }

    const body = req.body as Partial<CheckoutSessionInput>;
    if (!body || typeof body.orderId !== 'number' || !body.orderCode || !body.idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required orderId, orderCode, or idempotencyKey.',
      });
    }

    const dbOrderLookup = await getAuthoritativeOrderForCheckoutFromDb(body.orderId);
    if (authState.required) {
      if (!dbOrderLookup) {
        return res.status(503).json({ ok: false, error: 'Unable to verify order in database.' });
      }
      if (!dbOrderLookup.valid || !dbOrderLookup.order) {
        return res
          .status(dbOrderLookup.statusCode)
          .json({ ok: false, error: dbOrderLookup.error || 'Order not eligible for GCash checkout.' });
      }
      if (
        !authState.user!.isApprovedAdmin &&
        dbOrderLookup.order.residentId !== authState.user!.userId
      ) {
        return res.status(403).json({
          ok: false,
          error: 'You are not authorized to pay for another resident order.',
        });
      }
    }

    const authOrder = dbOrderLookup?.order;
    const effectiveAmount = authOrder ? authOrder.totalAmount : Number(body.amount);
    const effectiveHasRx = authOrder ? authOrder.hasPrescription : Boolean(body.hasPrescription);
    const effectiveRxStatus = authOrder ? authOrder.prescriptionStatus : body.prescriptionStatus;

    const eligibility = validateCheckoutEligibility({
      hasPrescription: effectiveHasRx,
      prescriptionStatus: effectiveRxStatus,
      amount: effectiveAmount,
    });
    if (!eligibility.valid) {
      return res.status(eligibility.statusCode).json({ ok: false, error: eligibility.error });
    }

    const existingSessionId = paymentSessionIdByIdempotency.get(body.idempotencyKey);
    if (existingSessionId) {
      const existing = paymentSessionsById.get(existingSessionId);
      if (existing && existing.status === 'pending' && existing.orderId === body.orderId) {
        return res.status(200).json({ ok: true, session: existing, reused: true });
      }
    }

    const input: CheckoutSessionInput = {
      orderId: body.orderId,
      orderCode: authOrder ? authOrder.orderCode : body.orderCode,
      idempotencyKey: body.idempotencyKey,
      amount: effectiveAmount,
      deliveryFee: authOrder ? authOrder.deliveryFee : Number(body.deliveryFee) || 0,
      items: authOrder && authOrder.items.length > 0 ? authOrder.items : Array.isArray(body.items) ? body.items : [],
      merchantName: authOrder ? authOrder.merchantName : body.merchantName || 'MedEx Partner Pharmacy',
      customerName: body.customerName || 'MedEx Customer',
      customerEmail: authState.user?.email || body.customerEmail,
      customerPhone: body.customerPhone || '+639170000000',
      hasPrescription: effectiveHasRx,
      prescriptionStatus: effectiveRxStatus as CheckoutSessionInput['prescriptionStatus'],
    };

    const mode = getPayMongoMode();
    const nowIso = new Date().toISOString();

    if (mode === 'paymongo_live') {
      const secretKey = process.env.PAYMONGO_SECRET_KEY!.trim();
      const payload = buildPayMongoCheckoutPayload(input, getAppBaseUrl(req));

      try {
        const pmResponse = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
          method: 'POST',
          headers: {
            Authorization: payMongoAuthHeader(secretKey),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const pmJson = (await pmResponse.json()) as {
          data?: { id: string; attributes?: { checkout_url?: string } };
          errors?: Array<{ detail?: string }>;
        };

        if (!pmResponse.ok || !pmJson.data?.id || !pmJson.data.attributes?.checkout_url) {
          const detail =
            pmJson.errors?.map((e) => e.detail).filter(Boolean).join('; ') ||
            'PayMongo rejected checkout session creation.';
          return res.status(pmResponse.status >= 400 ? pmResponse.status : 502).json({
            ok: false,
            error: detail,
          });
        }

        let safeCheckoutUrl: string;
        try {
          const parsedUrl = new URL(pmJson.data.attributes.checkout_url);
          if (parsedUrl.protocol !== 'https:') {
            throw new Error('Insecure checkout URL protocol');
          }
          safeCheckoutUrl = parsedUrl.toString();
        } catch {
          return res.status(502).json({
            ok: false,
            error: 'PayMongo returned an invalid checkout redirect URL.',
          });
        }

        const session: ServerPaymentSession = {
          sessionId: pmJson.data.id,
          orderId: input.orderId,
          orderCode: input.orderCode,
          idempotencyKey: input.idempotencyKey,
          amount: input.amount,
          mode: 'paymongo_live',
          status: 'pending',
          checkoutUrl: safeCheckoutUrl,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        paymentSessionsById.set(session.sessionId, session);
        paymentSessionIdByIdempotency.set(input.idempotencyKey, session.sessionId);
        await recordCheckoutSessionOnPaymentDb(input.orderId, session.sessionId);

        return res.status(200).json({ ok: true, session });
      } catch (err) {
        return res.status(502).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to reach PayMongo API.',
        });
      }
    }

    const sessionId = `cs_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const session: ServerPaymentSession = {
      sessionId,
      orderId: input.orderId,
      orderCode: input.orderCode,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      mode: 'sandbox',
      status: 'pending',
      checkoutUrl: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    paymentSessionsById.set(sessionId, session);
    paymentSessionIdByIdempotency.set(input.idempotencyKey, sessionId);
    await recordCheckoutSessionOnPaymentDb(input.orderId, sessionId);

    return res.status(200).json({ ok: true, session });
  });

  // 5. Server-Verified Sandbox Authorization
  app.post('/api/payments/gcash/sandbox-authorize', async (req, res) => {
    const authState = await authenticateApiRequestIfConfigured(req);
    if (authState.required && (!authState.authenticated || !authState.user)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required to authorize GCash sandbox session.',
      });
    }

    if (getPayMongoMode() === 'paymongo_live') {
      return res.status(400).json({
        ok: false,
        error: 'Sandbox authorization is disabled when live PayMongo gateway is active.',
      });
    }

    const { sessionId, shouldSucceed, gcashMobile } = req.body as {
      sessionId?: string;
      shouldSucceed?: boolean;
      gcashMobile?: string;
    };

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Missing sessionId.' });
    }
    let session = paymentSessionsById.get(sessionId);
    if (!session) {
      const recovered = await findPaymentSessionFromDb(sessionId);
      if (recovered) {
        session = recovered;
        paymentSessionsById.set(sessionId, session);
      }
    }
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Payment session not found.' });
    }
    if (session.mode !== 'sandbox') {
      return res.status(400).json({
        ok: false,
        error: 'Sandbox authorization is disabled for live PayMongo sessions.',
      });
    }

    if (authState.required && authState.user) {
      const participants = await getOrderParticipantsFromDb(session.orderId);
      if (
        !participants ||
        (!authState.user.isApprovedAdmin && participants.residentId !== authState.user.userId)
      ) {
        return res.status(403).json({
          ok: false,
          error: 'You are not authorized to authorize this payment session.',
        });
      }
    }

    const nowIso = new Date().toISOString();
    const ok = Boolean(shouldSucceed);
    session.status = ok ? 'paid' : 'failed';
    session.gcashMobile = gcashMobile;
    session.gatewayReference = ok
      ? `PM-GCASH-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      : undefined;
    session.failureReason = ok ? undefined : 'PayMongo sandbox declined GCash authorization';
    session.paidAt = ok ? nowIso : undefined;
    session.updatedAt = nowIso;
    paymentSessionsById.set(sessionId, session);

    const dbSynced = await syncPaymentOutcomeToDb({
      orderId: session.orderId,
      sessionId: session.sessionId,
      status: session.status,
      gatewayReference: session.gatewayReference,
      failureReason: session.failureReason,
      paidAt: session.paidAt,
    });

    return res.status(200).json({ ok: true, session, dbSynced });
  });

  // 6. Verify GCash Payment Session Status
  app.get('/api/payments/gcash/status/:sessionId', async (req, res) => {
    const authState = await authenticateApiRequestIfConfigured(req);
    if (authState.required && (!authState.authenticated || !authState.user)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required to verify payment status.',
      });
    }

    const { sessionId } = req.params;
    let session = paymentSessionsById.get(sessionId);
    if (!session) {
      const recovered = await findPaymentSessionFromDb(sessionId);
      if (recovered) {
        session = recovered;
        paymentSessionsById.set(sessionId, session);
      }
    }

    if (authState.required && authState.user) {
      if (!session) {
        return res.status(404).json({ ok: false, error: 'Payment session not found.' });
      }
      const participants = await getOrderParticipantsFromDb(session.orderId);
      if (
        !participants ||
        !canAccessPaymentOrder(authState.user, {
          residentId: participants.residentId,
          merchantId: participants.merchantId,
        })
      ) {
        return res.status(403).json({
          ok: false,
          error: 'You are not authorized to inspect this payment session.',
        });
      }
    }

    if (getPayMongoMode() === 'paymongo_live' && !sessionId.startsWith('cs_sbx_')) {
      try {
        const secretKey = process.env.PAYMONGO_SECRET_KEY!.trim();
        const pmResponse = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions/${encodeURIComponent(sessionId)}`, {
          headers: {
            Authorization: payMongoAuthHeader(secretKey),
            Accept: 'application/json',
          },
        });
        if (pmResponse.ok) {
          const pmData = await pmResponse.json();
          const mapped = mapPayMongoSessionStatus(pmData);
          if (session) {
            session.status = mapped.status;
            session.gatewayReference = mapped.gatewayReference || session.gatewayReference;
            session.failureReason = mapped.failureReason;
            if (mapped.status === 'paid') {
              session.paidAt = session.paidAt || new Date().toISOString();
            }
            session.updatedAt = new Date().toISOString();
            paymentSessionsById.set(sessionId, session);
            const dbSynced = await syncPaymentOutcomeToDb({
              orderId: session.orderId,
              sessionId,
              status: mapped.status,
              gatewayReference: session.gatewayReference,
              failureReason: session.failureReason,
              paidAt: session.paidAt,
            });
            return res.json({ ok: true, session, dbSynced });
          }
          const dbSynced = await syncPaymentOutcomeToDb({
            sessionId,
            status: mapped.status,
            gatewayReference: mapped.gatewayReference,
            failureReason: mapped.failureReason,
            paidAt: mapped.status === 'paid' ? new Date().toISOString() : undefined,
          });
          return res.json({
            ok: true,
            dbSynced,
            session: {
              sessionId,
              mode: 'paymongo_live',
              status: mapped.status,
              gatewayReference: mapped.gatewayReference,
              failureReason: mapped.failureReason,
            },
          });
        }
      } catch {
        // fall through to cached session
      }
    }

    if (!session) {
      return res.status(404).json({ ok: false, error: 'Payment session not found.' });
    }
    return res.json({ ok: true, session, dbSynced: authState.required });
  });

  // 7. Emergency 911 Handoff Backend Dispatch Log API
  app.post('/api/emergency/dispatch-log', async (req, res) => {
    const authState = await authenticateApiRequestIfConfigured(req);
    if (authState.required && (!authState.authenticated || !authState.user)) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required to record emergency dispatch logs.',
      });
    }

    const validation = validateEmergencyDispatchLogInput(req.body);
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({
        ok: false,
        error: validation.error || 'Invalid emergency dispatch payload.',
      });
    }

    const clean = validation.normalized;
    const existing = emergencyLogByIdempotency.get(clean.idempotencyKey);
    if (existing) {
      if (authState.user && !authState.user.isApprovedAdmin && existing.userId !== authState.user.userId) {
        return res.status(403).json({ ok: false, error: 'Idempotency key belongs to another account.' });
      }
      return res.status(200).json({ ok: true, record: existing, duplicate: true });
    }

    const rawUserId = Number((req.body as { userId?: unknown })?.userId) || 0;
    const record: EmergencyDispatchLogRecord = {
      logId: `emg_${crypto.randomBytes(5).toString('hex')}`,
      referenceCode: clean.referenceCode,
      idempotencyKey: clean.idempotencyKey,
      userId: authState.user ? authState.user.userId : rawUserId,
      handoffMode: clean.handoffMode,
      barangayName: clean.barangayName,
      addressSnapshot: clean.addressSnapshot,
      latitude: clean.latitude,
      longitude: clean.longitude,
      loggedAt: new Date().toISOString(),
    };

    emergencyDispatchLogs.unshift(record);
    emergencyLogByIdempotency.set(record.idempotencyKey, record);

    await syncEmergencyDispatchLogToDb({
      idempotencyKey: record.idempotencyKey,
      handoffMode: record.handoffMode,
    });

    return res.status(201).json({ ok: true, record });
  });

  app.get('/api/emergency/dispatch-log', async (req, res) => {
    const authState = await authenticateApiRequestIfConfigured(req);
    if (!authState.required || !authState.authenticated || !authState.user) {
      return res.status(401).json({
        ok: false,
        error: 'Admin authentication is required to read emergency dispatch logs.',
      });
    }
    if (!authState.user.isApprovedAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Only approved MedEx administrators can access emergency dispatch logs.',
      });
    }
    return res.json({
      ok: true,
      count: emergencyDispatchLogs.length,
      records: emergencyDispatchLogs.slice(0, 50),
    });
  });

  const httpServer = http.createServer(app);

  // 8. Mount Vite Dev Middlewares or Production Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', async () => {
    const mysqlOk = isMySqlConfigured() ? await checkMySqlConnection(true) : false;
    console.log(
      `[MedEx Server] Running on http://0.0.0.0:${PORT} (Database: MySQL ${mysqlOk ? 'CONNECTED' : 'PREVIEW FALLBACK'} | PayMongo: ${getPayMongoMode()})`
    );
  });
}

startServer().catch((err) => {
  console.error('[MedEx Server] Fatal startup error:', err);
  process.exit(1);
});

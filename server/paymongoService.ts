import crypto from 'node:crypto';

export type PayMongoMode = 'paymongo_live' | 'sandbox';
export type BackendPaymentStatus = 'pending' | 'paid' | 'failed';

export interface CheckoutItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CheckoutSessionInput {
  orderId: number;
  orderCode: string;
  idempotencyKey: string;
  amount: number;
  deliveryFee: number;
  items: CheckoutItemInput[];
  merchantName: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  hasPrescription: boolean;
  prescriptionStatus?: 'pending_review' | 'approved' | 'rejected';
}

export interface ServerPaymentSession {
  sessionId: string;
  orderId: number;
  orderCode: string;
  idempotencyKey: string;
  amount: number;
  mode: PayMongoMode;
  status: BackendPaymentStatus;
  checkoutUrl: string | null;
  gatewayReference?: string;
  failureReason?: string;
  gcashMobile?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function isConfiguredPayMongoKey(key: string | undefined): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.includes('YOUR_PAYMONGO')) return false;
  return trimmed.startsWith('sk_test_') || trimmed.startsWith('sk_live_');
}

export function validateCheckoutEligibility(input: {
  hasPrescription: boolean;
  prescriptionStatus?: string;
  amount: number;
}): { valid: boolean; statusCode: number; error?: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Order total amount must be greater than zero.',
    };
  }
  if (input.hasPrescription && input.prescriptionStatus !== 'approved') {
    return {
      valid: false,
      statusCode: 403,
      error: 'GCash payment is locked until a licensed pharmacist approves the prescription.',
    };
  }
  return { valid: true, statusCode: 200 };
}

export function toCentavos(phpAmount: number): number {
  return Math.max(100, Math.round(phpAmount * 100));
}

export function extractBearerToken(authHeader?: string | string[] | null): string | null {
  if (!authHeader) return null;
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length >= 16 ? token : null;
}

export function canAccessPaymentOrder(
  actor: { userId: number; isApprovedAdmin: boolean; role?: string; status?: string },
  order: { residentId: number; merchantId?: number }
): boolean {
  if (actor.isApprovedAdmin) return true;
  if (order.residentId === actor.userId) return true;
  if (
    actor.role === 'merchant' &&
    actor.status === 'approved' &&
    order.merchantId !== undefined &&
    order.merchantId === actor.userId
  ) {
    return true;
  }
  return false;
}

export interface ValidatedEmergencyDispatchPayload {
  referenceCode: string;
  idempotencyKey: string;
  handoffMode: 'mobile_dialer' | 'desktop_qr';
  barangayName: string;
  addressSnapshot: string;
  latitude: number;
  longitude: number;
}

export function validateEmergencyDispatchLogInput(body: unknown): {
  valid: boolean;
  error?: string;
  normalized?: ValidatedEmergencyDispatchPayload;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid emergency dispatch payload.' };
  }
  const raw = body as Record<string, unknown>;
  const referenceCode = typeof raw.referenceCode === 'string' ? raw.referenceCode.trim() : '';
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : '';

  if (!referenceCode || referenceCode.length > 64 || !idempotencyKey || idempotencyKey.length > 120) {
    return { valid: false, error: 'Missing or invalid emergency referenceCode or idempotencyKey.' };
  }

  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 14.70 ||
    lat > 14.95 ||
    lng < 120.15 ||
    lng > 120.40
  ) {
    return {
      valid: false,
      error: 'Emergency coordinates must fall within the Olongapo City coverage area.',
    };
  }

  const handoffMode: 'mobile_dialer' | 'desktop_qr' =
    raw.handoffMode === 'mobile_dialer' ? 'mobile_dialer' : 'desktop_qr';
  const barangayName =
    typeof raw.barangayName === 'string' && raw.barangayName.trim()
      ? raw.barangayName.trim().slice(0, 80)
      : 'Olongapo City';
  const addressSnapshot =
    typeof raw.addressSnapshot === 'string'
      ? raw.addressSnapshot.trim().slice(0, 240)
      : '';

  return {
    valid: true,
    normalized: {
      referenceCode,
      idempotencyKey,
      handoffMode,
      barangayName,
      addressSnapshot,
      latitude: lat,
      longitude: lng,
    },
  };
}

export function buildPayMongoCheckoutPayload(
  input: CheckoutSessionInput,
  appBaseUrl: string
) {
  const cleanBaseUrl = appBaseUrl.replace(/\/+$/, '');
  const lineItems = input.items.map((item) => ({
    currency: 'PHP',
    amount: Math.round(item.unitPrice * 100),
    name: item.name.slice(0, 120),
    quantity: Math.max(1, Math.round(item.quantity)),
  }));

  if (input.deliveryFee > 0) {
    lineItems.push({
      currency: 'PHP',
      amount: Math.round(input.deliveryFee * 100),
      name: 'MedEx Olongapo Courier Delivery Fee',
      quantity: 1,
    });
  }

  return {
    data: {
      attributes: {
        billing: {
          name: input.customerName,
          email: input.customerEmail || 'resident@medex.ph',
          phone: input.customerPhone,
        },
        description: `MedEx Pharmacy Order ${input.orderCode} — ${input.merchantName}`,
        line_items: lineItems,
        payment_method_types: ['gcash'],
        reference_number: input.orderCode,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: `${cleanBaseUrl}/?gcash_status=success&order_id=${input.orderId}&gcash_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cleanBaseUrl}/?gcash_status=cancelled&order_id=${input.orderId}`,
        metadata: {
          order_id: String(input.orderId),
          order_code: input.orderCode,
          merchant_name: input.merchantName,
          idempotency_key: input.idempotencyKey,
        },
      },
    },
  };
}

export function verifyPayMongoWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string | undefined,
  isLiveMode: boolean
): { valid: boolean; reason?: string } {
  if (!webhookSecret || webhookSecret.includes('YOUR_PAYMONGO')) {
    return { valid: false, reason: 'Webhook secret not configured on server.' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'Missing Paymongo-Signature header.' };
  }

  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex > 0) {
      const k = segment.slice(0, eqIndex).trim();
      const v = segment.slice(eqIndex + 1).trim();
      parts.set(k, v);
    }
  }

  const timestamp = parts.get('t');
  const signature = isLiveMode ? parts.get('li') : parts.get('te') || parts.get('li');
  if (!timestamp || !signature) {
    return { valid: false, reason: 'Malformed Paymongo-Signature header.' };
  }

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'Webhook signature length mismatch.' };
  }

  const matches = crypto.timingSafeEqual(expectedBuf, actualBuf);
  return matches ? { valid: true } : { valid: false, reason: 'Webhook signature verification failed.' };
}

export interface ParsedWebhookOutcome {
  eventType: string;
  sessionId?: string;
  orderId?: number;
  status: BackendPaymentStatus;
  gatewayReference?: string;
  failureReason?: string;
}

export function extractPayMongoWebhookOutcome(payload: unknown): ParsedWebhookOutcome | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as {
    data?: {
      attributes?: {
        type?: string;
        data?: {
          id?: string;
          attributes?: {
            reference_number?: string;
            metadata?: Record<string, string>;
            payments?: Array<{ id?: string; attributes?: { status?: string; failure_message?: string } }>;
            last_payment_error?: { failed_message?: string };
          };
        };
      };
    };
  };

  const eventType = root.data?.attributes?.type;
  const resource = root.data?.attributes?.data;
  if (!eventType || !resource) return null;

  const sessionId = resource.id;
  const attrs = resource.attributes || {};
  const metaOrderId = attrs.metadata?.order_id ? Number(attrs.metadata.order_id) : undefined;
  const orderId = Number.isFinite(metaOrderId) ? metaOrderId : undefined;

  if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
    const paymentId = attrs.payments?.[0]?.id || sessionId;
    return {
      eventType,
      sessionId,
      orderId,
      status: 'paid',
      gatewayReference: paymentId ? `PM-${paymentId}` : undefined,
    };
  }

  if (eventType === 'payment.failed') {
    return {
      eventType,
      sessionId,
      orderId,
      status: 'failed',
      failureReason:
        attrs.last_payment_error?.failed_message ||
        attrs.payments?.[0]?.attributes?.failure_message ||
        'GCash authorization declined or expired.',
    };
  }

  return {
    eventType,
    sessionId,
    orderId,
    status: 'pending',
  };
}

export function mapPayMongoSessionStatus(sessionData: unknown): {
  status: BackendPaymentStatus;
  gatewayReference?: string;
  failureReason?: string;
} {
  if (!sessionData || typeof sessionData !== 'object') {
    return { status: 'pending' };
  }
  const data = (sessionData as {
    data?: {
      id?: string;
      attributes?: {
        payment_intent?: { attributes?: { status?: string } };
        payments?: Array<{ id?: string; attributes?: { status?: string; failure_message?: string } }>;
      };
    };
  }).data;

  const payments = data?.attributes?.payments || [];
  const paidPayment = payments.find((p) => p.attributes?.status === 'paid');
  if (paidPayment) {
    return {
      status: 'paid',
      gatewayReference: paidPayment.id ? `PM-${paidPayment.id}` : data?.id ? `PM-${data.id}` : undefined,
    };
  }

  const failedPayment = payments.find((p) => p.attributes?.status === 'failed');
  if (failedPayment) {
    return {
      status: 'failed',
      failureReason: failedPayment.attributes?.failure_message || 'GCash payment failed.',
    };
  }

  const piStatus = data?.attributes?.payment_intent?.attributes?.status;
  if (piStatus === 'succeeded') {
    return {
      status: 'paid',
      gatewayReference: data?.id ? `PM-${data.id}` : undefined,
    };
  }

  return { status: 'pending' };
}

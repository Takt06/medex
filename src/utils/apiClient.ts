import { getAuthToken } from './apiSync';

export type BackendPayMongoMode = 'paymongo_live' | 'sandbox';

export interface BackendHealthResponse {
  ok: boolean;
  service: string;
  phase: string;
  databaseEngine: 'mysql';
  databaseConfigured: boolean;
  databaseConnected: boolean;
  paymongoMode: BackendPayMongoMode;
  webhookConfigured: boolean;
  timestamp: string;
}

export interface BackendPaymentSession {
  sessionId: string;
  orderId: number;
  orderCode: string;
  idempotencyKey: string;
  amount: number;
  mode: BackendPayMongoMode;
  status: 'pending' | 'paid' | 'failed';
  checkoutUrl: string | null;
  gatewayReference?: string;
  failureReason?: string;
  gcashMobile?: string;
  paidAt?: string;
}

export interface CreateGcashCheckoutInput {
  orderId: number;
  orderCode: string;
  idempotencyKey: string;
  amount: number;
  deliveryFee: number;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  merchantName: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  hasPrescription: boolean;
  prescriptionStatus?: 'pending_review' | 'approved' | 'rejected';
}

function getApiRequestHeaders(includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchBackendHealth(): Promise<BackendHealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as BackendHealthResponse;
  } catch {
    return null;
  }
}

export async function createGcashCheckoutSession(
  input: CreateGcashCheckoutInput
): Promise<{ ok: boolean; session?: BackendPaymentSession; error?: string }> {
  try {
    const headers = getApiRequestHeaders(true);
    const res = await fetch('/api/payments/gcash/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as {
      ok: boolean;
      session?: BackendPaymentSession;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to initiate GCash checkout session.' };
    }
    return { ok: true, session: data.session };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach MedEx payment backend.',
    };
  }
}

export async function authorizeGcashSandboxSession(input: {
  sessionId: string;
  shouldSucceed: boolean;
  gcashMobile: string;
}): Promise<{ ok: boolean; session?: BackendPaymentSession; dbSynced?: boolean; error?: string }> {
  try {
    const headers = getApiRequestHeaders(true);
    const res = await fetch('/api/payments/gcash/sandbox-authorize', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as {
      ok: boolean;
      session?: BackendPaymentSession;
      dbSynced?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'GCash sandbox authorization failed.' };
    }
    return { ok: true, session: data.session, dbSynced: Boolean(data.dbSynced) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach MedEx payment backend.',
    };
  }
}

export async function fetchGcashSessionStatus(
  sessionId: string
): Promise<{ ok: boolean; session?: BackendPaymentSession; dbSynced?: boolean; error?: string }> {
  try {
    const headers = getApiRequestHeaders(false);
    const res = await fetch(`/api/payments/gcash/status/${encodeURIComponent(sessionId)}`, {
      headers,
    });
    const data = (await res.json()) as {
      ok: boolean;
      session?: BackendPaymentSession;
      dbSynced?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Unable to verify GCash session status.' };
    }
    return { ok: true, session: data.session, dbSynced: Boolean(data.dbSynced) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach MedEx payment backend.',
    };
  }
}

export async function sendEmergencyDispatchLog(input: {
  referenceCode: string;
  idempotencyKey: string;
  userId: number;
  handoffMode: 'mobile_dialer' | 'desktop_qr';
  barangayName: string;
  addressSnapshot: string;
  latitude: number;
  longitude: number;
}): Promise<boolean> {
  try {
    const headers = getApiRequestHeaders(true);
    const res = await fetch('/api/emergency/dispatch-log', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
}

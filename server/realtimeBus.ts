import type { Request, Response } from 'express';

export type ServerDeltaTable =
  | 'products'
  | 'merchant_profiles'
  | 'merchant_hours'
  | 'addresses';

export type ServerDeltaEventType = 'INSERT' | 'UPDATE' | 'DELETE';

interface SseClient {
  id: number;
  res: Response;
}

const clients = new Map<number, SseClient>();
let nextClientId = 1;

function sendSseFrame(res: Response, eventName: string, payload: unknown): void {
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Client disconnected; cleanup occurs on close event
  }
}

export function attachRealtimeStream(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = nextClientId++;
  clients.set(clientId, { id: clientId, res });

  sendSseFrame(res, 'connected', { ok: true, ts: Date.now() });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(clientId);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

/**
 * Broadcast an instant, non-PII table delta frame for public catalog & merchant status tables
 * (products, merchant_profiles, merchant_hours, merchant store addresses).
 */
export function emitPublicTableDelta(
  table: ServerDeltaTable,
  eventType: ServerDeltaEventType,
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null
): void {
  const frame = {
    type: 'delta',
    table,
    eventType,
    newRow,
    oldRow,
    ts: Date.now(),
  };
  for (const client of clients.values()) {
    sendSseFrame(client.res, 'medex', frame);
  }
}

/**
 * Broadcast a lightweight scope invalidation event so authenticated dashboards and
 * storefronts reconcile authorized state immediately without exposing PII on the stream.
 */
export function emitRealtimeSync(scope: 'inventory' | 'full'): void {
  const frame = {
    type: 'sync',
    scope,
    ts: Date.now(),
  };
  for (const client of clients.values()) {
    sendSseFrame(client.res, 'medex', frame);
  }
}

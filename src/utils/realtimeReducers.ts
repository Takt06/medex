import type {
  Address,
  MerchantHourRow,
  MerchantProfile,
  Product,
  UserAccount,
} from '../types/medex';
import {
  mapDbAddress,
  mapDbMerchantHours,
  mapDbMerchantProfile,
  mapDbProduct,
  mapDbUserToUserAccount,
  type DbRow,
} from './dbMappers';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export type RealtimeDeltaTable =
  | 'products'
  | 'merchant_profiles'
  | 'merchant_hours'
  | 'users'
  | 'addresses';

export interface RealtimeTableDelta {
  table: RealtimeDeltaTable;
  eventType: RealtimeEventType;
  newRow: DbRow | null;
  oldRow: DbRow | null;
}

export interface ProductImageFallbacks {
  byProductId?: Record<number, string>;
  byCategoryId?: Record<number, string>;
  defaultImage?: string;
}

function extractNumericId(row: DbRow | null | undefined, key: string): number | null {
  if (!row || row[key] === undefined || row[key] === null) return null;
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Idempotently apply a MySQL SSE Realtime `products` change (`INSERT` / `UPDATE` / `DELETE`).
 * - Prevents duplicate entries on reconnect/replay.
 * - Reconciles optimistic negative-ID inserts from the same merchant cleanly.
 * - Keeps items deterministically ordered by `product_id`.
 */
export function applyProductRealtimeEvent(
  current: Product[],
  eventType: RealtimeEventType,
  newRow: DbRow | null,
  oldRow: DbRow | null,
  imageFallbacks?: ProductImageFallbacks
): Product[] {
  if (eventType === 'DELETE') {
    const targetId = extractNumericId(oldRow, 'product_id') ?? extractNumericId(newRow, 'product_id');
    if (targetId === null) return current;
    const filtered = current.filter((p) => p.product_id !== targetId);
    return filtered.length === current.length ? current : filtered;
  }

  if (!newRow) return current;
  const incomingId = extractNumericId(newRow, 'product_id');
  if (incomingId === null) return current;

  const mapped = mapDbProduct(newRow, imageFallbacks);

  // Check if already present by real product_id (UPDATE or duplicate INSERT)
  const existingIdx = current.findIndex((p) => p.product_id === mapped.product_id);
  if (existingIdx >= 0) {
    const next = [...current];
    next[existingIdx] = mapped;
    return next;
  }

  // Reconcile any local optimistic negative-ID insert from the same merchant with matching name & unit
  const optimisticIdx = current.findIndex(
    (p) =>
      p.product_id < 0 &&
      p.merchant_id === mapped.merchant_id &&
      p.name.trim().toLowerCase() === mapped.name.trim().toLowerCase() &&
      p.unit.trim().toLowerCase() === mapped.unit.trim().toLowerCase()
  );
  if (optimisticIdx >= 0) {
    const next = [...current];
    next[optimisticIdx] = mapped;
    return next.sort((a, b) => a.product_id - b.product_id);
  }

  return [...current, mapped].sort((a, b) => a.product_id - b.product_id);
}

/**
 * Idempotently apply a MySQL SSE Realtime `merchant_profiles` change (`INSERT` / `UPDATE` / `DELETE`).
 * Reflects `is_24_hours`, `is_temporarily_closed`, `shop_name`, `contact_no`, and store additions/removals instantly.
 */
export function applyMerchantProfileRealtimeEvent(
  current: MerchantProfile[],
  eventType: RealtimeEventType,
  newRow: DbRow | null,
  oldRow: DbRow | null
): MerchantProfile[] {
  if (eventType === 'DELETE') {
    const targetId =
      extractNumericId(oldRow, 'merchant_id') ?? extractNumericId(newRow, 'merchant_id');
    if (targetId === null) return current;
    const filtered = current.filter((m) => m.merchant_id !== targetId);
    return filtered.length === current.length ? current : filtered;
  }

  if (!newRow) return current;
  const incomingId = extractNumericId(newRow, 'merchant_id');
  if (incomingId === null) return current;

  const mapped = mapDbMerchantProfile(newRow);
  const existingIdx = current.findIndex((m) => m.merchant_id === mapped.merchant_id);
  if (existingIdx >= 0) {
    const next = [...current];
    next[existingIdx] = mapped;
    return next;
  }

  return [...current, mapped].sort((a, b) => a.merchant_id - b.merchant_id);
}

/**
 * Idempotently apply a MySQL SSE Realtime `merchant_hours` change (`INSERT` / `UPDATE` / `DELETE`).
 */
export function applyMerchantHourRealtimeEvent(
  current: MerchantHourRow[],
  eventType: RealtimeEventType,
  newRow: DbRow | null,
  oldRow: DbRow | null
): MerchantHourRow[] {
  if (eventType === 'DELETE') {
    const targetId = extractNumericId(oldRow, 'hours_id') ?? extractNumericId(newRow, 'hours_id');
    if (targetId === null) return current;
    const filtered = current.filter((h) => h.hours_id !== targetId);
    return filtered.length === current.length ? current : filtered;
  }

  if (!newRow) return current;
  const incomingId = extractNumericId(newRow, 'hours_id');
  if (incomingId === null) return current;

  const mapped = mapDbMerchantHours(newRow);
  const existingIdx = current.findIndex(
    (h) =>
      h.hours_id === mapped.hours_id ||
      (h.merchant_id === mapped.merchant_id && h.day_of_week === mapped.day_of_week)
  );
  if (existingIdx >= 0) {
    const next = [...current];
    next[existingIdx] = mapped;
    return next;
  }

  return [...current, mapped].sort((a, b) => a.hours_id - b.hours_id);
}

/**
 * Idempotently apply a MySQL SSE Realtime `users` change (`INSERT` / `UPDATE` / `DELETE`).
 * Reflects Admin merchant/rider approvals, rejections, suspensions, and role updates immediately.
 */
export function applyUserRealtimeEvent(
  current: UserAccount[],
  eventType: RealtimeEventType,
  newRow: DbRow | null,
  oldRow: DbRow | null
): UserAccount[] {
  if (eventType === 'DELETE') {
    const targetId = extractNumericId(oldRow, 'user_id') ?? extractNumericId(newRow, 'user_id');
    if (targetId === null) return current;
    const filtered = current.filter((u) => u.user_id !== targetId);
    return filtered.length === current.length ? current : filtered;
  }

  if (!newRow) return current;
  const incomingId = extractNumericId(newRow, 'user_id');
  if (incomingId === null) return current;

  const mapped = mapDbUserToUserAccount(newRow);
  const existingIdx = current.findIndex((u) => u.user_id === mapped.user_id);
  if (existingIdx >= 0) {
    const next = [...current];
    next[existingIdx] = mapped;
    return next;
  }

  return [...current, mapped].sort((a, b) => a.user_id - b.user_id);
}

/**
 * Idempotently apply a MySQL SSE Realtime `addresses` change (`INSERT` / `UPDATE` / `DELETE`).
 */
export function applyAddressRealtimeEvent(
  current: Address[],
  eventType: RealtimeEventType,
  newRow: DbRow | null,
  oldRow: DbRow | null
): Address[] {
  if (eventType === 'DELETE') {
    const targetId =
      extractNumericId(oldRow, 'address_id') ?? extractNumericId(newRow, 'address_id');
    if (targetId === null) return current;
    const filtered = current.filter((a) => a.address_id !== targetId);
    return filtered.length === current.length ? current : filtered;
  }

  if (!newRow) return current;
  const incomingId = extractNumericId(newRow, 'address_id');
  if (incomingId === null) return current;

  const mapped = mapDbAddress(newRow);
  const existingIdx = current.findIndex((a) => a.address_id === mapped.address_id);
  if (existingIdx >= 0) {
    const next = [...current];
    next[existingIdx] = mapped;
    return next;
  }

  return [...current, mapped].sort((a, b) => a.address_id - b.address_id);
}

/**
 * Race-safe reconciliation after an optimistic product save or unlist fallback completes.
 * Prevents duplicate rows when a MySQL SSE Realtime `INSERT`/`UPDATE` frame arrives
 * before the HTTP mutation promise resolves.
 */
export function reconcilePersistedProduct(
  current: Product[],
  optimisticOrTargetId: number,
  persisted: Product
): Product[] {
  const withoutTempOrExisting = current.filter(
    (p) => p.product_id !== optimisticOrTargetId && p.product_id !== persisted.product_id
  );
  return [...withoutTempOrExisting, persisted].sort((a, b) => a.product_id - b.product_id);
}

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validate a single merchant operating hours entry (`HH:MM` 24-hour format).
 */
export function validateOperatingHoursRange(
  opensAt: string,
  closesAt: string,
  isClosed: boolean
): { valid: boolean; error?: string } {
  if (isClosed) return { valid: true };
  if (!HH_MM_PATTERN.test(opensAt) || !HH_MM_PATTERN.test(closesAt)) {
    return { valid: false, error: 'Use valid 24-hour HH:MM opening and closing times.' };
  }
  if (closesAt <= opensAt) {
    return { valid: false, error: 'Closing time must be later than opening time.' };
  }
  return { valid: true };
}


import { DEFAULT_CATEGORY_IMAGES, HERO_PHARMACY_IMAGE } from '../data/seedData';
import type {
  AccountStatus,
  Address,
  AuditLogEntry,
  Barangay,
  Coupon,
  CouponRedemptionLog,
  CustomerCoupon,
  DeliveryRating,
  EmergencyAlert,
  EmergencyContact,
  FeedbackCategory,
  HouseholdFlags,
  InventoryMovement,
  MerchantHourRow,
  MerchantProfile,
  NotificationItem,
  Order,
  PharmacyReview,
  ProblemReport,
  Product,
  ProductCategory,
  PublicRegisterRole,
  ReturnRefundReason,
  ReturnRefundRequest,
  ReturnRefundStatus,
  RiderEarning,
  RiderOperationalStatus,
  RiderProfile,
  UserAccount,
  UserPermissionOverrides,
  UserRole,
  VerificationDecision,
} from '../types/medex';
import {
  mapDbAddress,
  mapDbAlertVerification,
  mapDbAuditLog,
  mapDbBarangay,
  mapDbCoupon,
  mapDbCouponRedemption,
  mapDbCustomerCoupon,
  mapDbDeliveryRating,
  mapDbEmergencyAlert,
  mapDbEmergencyContact,
  mapDbFeedbackCategory,
  mapDbHouseholdFlags,
  mapDbInventoryMovement,
  mapDbMerchantHours,
  mapDbMerchantProfile,
  mapDbNotification,
  mapDbOrderBundleToOrder,
  mapDbPharmacyReview,
  mapDbProblemReportBundle,
  mapDbProduct,
  mapDbProductCategory,
  mapDbReturnRefundRequest,
  mapDbRiderEarning,
  mapDbRiderProfile,
  mapDbUserToUserAccount,
  type DbRow,
} from './dbMappers';
import type {
  ProductImageFallbacks,
  RealtimeTableDelta,
} from './realtimeReducers';

export const PRODUCT_IMAGE_FALLBACKS: ProductImageFallbacks = {
  byProductId: {},
  byCategoryId: DEFAULT_CATEGORY_IMAGES,
  defaultImage: HERO_PHARMACY_IMAGE,
};

// Session Bearer token held strictly in JavaScript memory (never localStorage/sessionStorage)
let inMemoryAuthToken: string | null = null;
let mySqlBackendActive = false;
let mySqlConfiguredOnServer = false;
let mySqlDiagnostic: string = 'not_configured';

export function getAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function setAuthToken(token: string | null): void {
  inMemoryAuthToken = token;
}

export async function fetchProtectedDocumentBlobUrl(
  url: string
): Promise<{ objectUrl: string; isBlob: boolean; error?: string }> {
  if (!url || !url.startsWith('/api/')) {
    return { objectUrl: url, isBlob: false };
  }
  try {
    const res = await fetch(url, {
      headers: inMemoryAuthToken ? { Authorization: `Bearer ${inMemoryAuthToken}` } : {},
    });
    if (!res.ok) {
      return {
        objectUrl: '',
        isBlob: false,
        error: `Could not load verification document (${res.status}).`,
      };
    }
    const blob = await res.blob();
    return { objectUrl: URL.createObjectURL(blob), isBlob: true };
  } catch {
    return {
      objectUrl: '',
      isBlob: false,
      error: 'Unable to load protected verification document.',
    };
  }
}

export function isMySqlBackendActive(): boolean {
  return mySqlBackendActive;
}

export function setMySqlBackendActive(active: boolean): void {
  mySqlBackendActive = active;
}

export function isMySqlConfiguredOnServer(): boolean {
  return mySqlConfiguredOnServer;
}

export function getMySqlDiagnostic(): string {
  return mySqlDiagnostic;
}

function buildHeaders(includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  if (inMemoryAuthToken) headers.Authorization = `Bearer ${inMemoryAuthToken}`;
  return headers;
}

async function apiRequest<T = Record<string, unknown>>(
  url: string,
  options: { method?: string; body?: unknown; requireAuth?: boolean } = {}
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  if (options.requireAuth && !inMemoryAuthToken) {
    return { ok: false, error: 'Not signed in to MySQL backend.' };
  }
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: buildHeaders(options.body !== undefined),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const parsed = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    if (!res.ok || parsed.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: parsed.error || `Request failed (${res.status})`,
      };
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach MedEx MySQL server.',
    };
  }
}

export interface MySqlBootstrapStatus {
  mysqlConfigured: boolean;
  mysqlConnected: boolean;
  mysqlDiagnostic?: string;
  adminNeedsPasswordSetup: boolean;
}

export async function fetchMySqlBootstrapStatus(): Promise<MySqlBootstrapStatus> {
  const res = await apiRequest<MySqlBootstrapStatus>('/api/auth/bootstrap-status');
  if (res.ok && res.data) {
    mySqlConfiguredOnServer = Boolean(res.data.mysqlConfigured);
    mySqlDiagnostic = res.data.mysqlDiagnostic || (res.data.mysqlConnected ? 'connected' : 'connection_failed');
    setMySqlBackendActive(Boolean(res.data.mysqlConnected));
    return {
      mysqlConfigured: Boolean(res.data.mysqlConfigured),
      mysqlConnected: Boolean(res.data.mysqlConnected),
      mysqlDiagnostic: mySqlDiagnostic,
      adminNeedsPasswordSetup: Boolean(res.data.adminNeedsPasswordSetup),
    };
  }
  setMySqlBackendActive(false);
  return {
    mysqlConfigured: mySqlConfiguredOnServer,
    mysqlConnected: false,
    mysqlDiagnostic: 'connection_failed',
    adminNeedsPasswordSetup: false,
  };
}

export interface MySqlRegistrationMetadata {
  role: PublicRegisterRole;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  date_of_birth: string;
  barangay_id?: number;
  street?: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  shop_name?: string;
  pharmacist_name?: string;
  pharmacist_license_no?: string;
  business_permit_name?: string;
  business_permit_url?: string;
  government_id_name?: string;
  government_id_url?: string;
  vehicle_type?: string;
  plate_number?: string;
  driver_license_name?: string;
  driver_license_url?: string;
  vehicle_registration_name?: string;
  vehicle_registration_url?: string;
  policy_accepted?: boolean;
  policy_version?: string;
}

export interface HydratedMySqlSnapshot {
  currentAuthUserId: number | null;
  users: UserAccount[];
  barangays: Barangay[];
  addresses: Address[];
  householdFlags: HouseholdFlags[];
  emergencyContacts: EmergencyContact[];
  categories: ProductCategory[];
  merchants: MerchantProfile[];
  merchantHours: MerchantHourRow[];
  products: Product[];
  riderProfiles: RiderProfile[];
  alerts: EmergencyAlert[];
  orders: Order[];
  riderEarnings: RiderEarning[];
  riderRatings: DeliveryRating[];
  feedbackCategories: FeedbackCategory[];
  pharmacyReviews: PharmacyReview[];
  problemReports: ProblemReport[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  coupons: Coupon[];
  customerCoupons: CustomerCoupon[];
  couponRedemptions: CouponRedemptionLog[];
  inventoryMovements: InventoryMovement[];
  returnRequests: ReturnRefundRequest[];
}

export async function claimAdminPasswordInDb(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; user?: UserAccount }> {
  const res = await apiRequest<{ token: string; user: DbRow }>('/api/auth/claim-admin', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok || !res.data?.token || !res.data?.user) {
    return { ok: false, error: res.error || 'Could not initialize Admin password.' };
  }
  setAuthToken(res.data.token);
  return { ok: true, user: mapDbUserToUserAccount(res.data.user) };
}

export async function signUpMySqlAccount(
  password: string,
  meta: MySqlRegistrationMetadata
): Promise<{
  ok: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
  user?: UserAccount;
}> {
  const res = await apiRequest<{ token: string; user: DbRow }>('/api/auth/register', {
    method: 'POST',
    body: { ...meta, password },
  });
  if (!res.ok || !res.data?.user) {
    return { ok: false, error: res.error || 'Registration failed.' };
  }
  setAuthToken(res.data.token || null);
  return {
    ok: true,
    requiresEmailConfirmation: false,
    user: mapDbUserToUserAccount(res.data.user),
  };
}

export async function signInMySqlAccount(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; user?: UserAccount }> {
  const res = await apiRequest<{ token: string; user: DbRow }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok || !res.data?.user || !res.data?.token) {
    return { ok: false, error: res.error || 'Invalid email or password.' };
  }
  setAuthToken(res.data.token);
  return { ok: true, user: mapDbUserToUserAccount(res.data.user) };
}

export async function signOutMySqlAccount(): Promise<void> {
  setAuthToken(null);
  await apiRequest('/api/auth/logout', { method: 'POST' });
}

export async function hydrateMedExStateFromMySql(): Promise<Partial<HydratedMySqlSnapshot> | null> {
  if (!mySqlBackendActive) return null;
  const res = await apiRequest<Record<string, unknown>>('/api/state');
  if (!res.ok || !res.data) return null;
  const d = res.data;

  const barangays = Array.isArray(d.barangays) ? d.barangays.map((r) => mapDbBarangay(r as DbRow)) : [];
  const categories = Array.isArray(d.categories)
    ? d.categories.map((r) => mapDbProductCategory(r as DbRow))
    : [];
  const feedbackCategories = Array.isArray(d.feedbackCategories)
    ? d.feedbackCategories.map((r) => mapDbFeedbackCategory(r as DbRow))
    : [];
  const merchants = Array.isArray(d.merchants)
    ? d.merchants.map((r) => mapDbMerchantProfile(r as DbRow))
    : [];
  const merchantHours = Array.isArray(d.merchantHours)
    ? d.merchantHours.map((r) => mapDbMerchantHours(r as DbRow))
    : [];
  const products = Array.isArray(d.products)
    ? d.products.map((r) => mapDbProduct(r as DbRow, PRODUCT_IMAGE_FALLBACKS))
    : [];
  const addresses = Array.isArray(d.addresses)
    ? d.addresses.map((r) => mapDbAddress(r as DbRow))
    : [];
  const pharmacyReviews = Array.isArray(d.pharmacyReviews)
    ? d.pharmacyReviews.map((r) => mapDbPharmacyReview(r as DbRow))
    : [];
  const riderRatings = Array.isArray(d.deliveryRatings)
    ? d.deliveryRatings.map((r) => mapDbDeliveryRating(r as DbRow))
    : [];
  const users = Array.isArray(d.users)
    ? d.users.map((r) => mapDbUserToUserAccount(r as DbRow))
    : [];
  const householdFlags = Array.isArray(d.householdFlags)
    ? d.householdFlags.map((r) => mapDbHouseholdFlags(r as DbRow))
    : [];
  const emergencyContacts = Array.isArray(d.emergencyContacts)
    ? d.emergencyContacts.map((r) => mapDbEmergencyContact(r as DbRow))
    : [];

  const verificationsMap = new Map(
    (Array.isArray(d.alertVerifications) ? d.alertVerifications : []).map((v) => {
      const mapped = mapDbAlertVerification(v as DbRow);
      return [mapped.alert_id, mapped];
    })
  );
  const alerts = Array.isArray(d.alerts)
    ? d.alerts.map((a) => mapDbEmergencyAlert(a as DbRow, verificationsMap))
    : [];
  const riderProfiles = Array.isArray(d.riderProfiles)
    ? d.riderProfiles.map((r) => mapDbRiderProfile(r as DbRow))
    : [];
  const riderEarnings = Array.isArray(d.riderEarnings)
    ? d.riderEarnings.map((e) => mapDbRiderEarning(e as DbRow))
    : [];
  const notifications = Array.isArray(d.notifications)
    ? d.notifications.map((n) => mapDbNotification(n as DbRow))
    : [];
  const auditLogs = Array.isArray(d.auditLogs)
    ? d.auditLogs.map((l) => mapDbAuditLog(l as DbRow))
    : [];

  const itemsByOrder = new Map<number, DbRow[]>();
  for (const it of Array.isArray(d.orderItems) ? d.orderItems : []) {
    const oid = Number((it as DbRow).order_id);
    const list = itemsByOrder.get(oid) || [];
    list.push(it as DbRow);
    itemsByOrder.set(oid, list);
  }
  const historyByOrder = new Map<number, DbRow[]>();
  for (const h of Array.isArray(d.orderStatusHistory) ? d.orderStatusHistory : []) {
    const oid = Number((h as DbRow).order_id);
    const list = historyByOrder.get(oid) || [];
    list.push(h as DbRow);
    historyByOrder.set(oid, list);
  }
  const rxByOrder = new Map<number, DbRow>();
  for (const rx of Array.isArray(d.prescriptions) ? d.prescriptions : []) {
    rxByOrder.set(Number((rx as DbRow).order_id), rx as DbRow);
  }
  const paymentByOrder = new Map<number, DbRow>();
  for (const p of Array.isArray(d.payments) ? d.payments : []) {
    paymentByOrder.set(Number((p as DbRow).order_id), p as DbRow);
  }
  const deliveryByOrder = new Map<number, DbRow>();
  for (const del of Array.isArray(d.deliveries) ? d.deliveries : []) {
    deliveryByOrder.set(Number((del as DbRow).order_id), del as DbRow);
  }
  const ratingByOrder = new Map<number, DeliveryRating>();
  for (const r of riderRatings) {
    ratingByOrder.set(r.order_id, r);
  }

  const orders = Array.isArray(d.orders)
    ? d.orders.map((o) => {
        const row = o as DbRow;
        const oid = Number(row.order_id);
        return mapDbOrderBundleToOrder({
          orderRow: row,
          items: itemsByOrder.get(oid) || [],
          history: historyByOrder.get(oid) || [],
          prescription: rxByOrder.get(oid),
          payment: paymentByOrder.get(oid),
          delivery: deliveryByOrder.get(oid),
          rating: ratingByOrder.get(oid),
        });
      })
    : [];

  const reportHistoryMap = new Map<number, DbRow[]>();
  for (const h of Array.isArray(d.problemReportStatusHistory) ? d.problemReportStatusHistory : []) {
    const rid = Number((h as DbRow).report_id);
    const list = reportHistoryMap.get(rid) || [];
    list.push(h as DbRow);
    reportHistoryMap.set(rid, list);
  }
  const problemReports = Array.isArray(d.problemReports)
    ? d.problemReports.map((r) => {
        const row = r as DbRow;
        return mapDbProblemReportBundle(row, reportHistoryMap.get(Number(row.report_id)) || []);
      })
    : [];

  const coupons = Array.isArray(d.coupons)
    ? d.coupons.map((c) => mapDbCoupon(c as DbRow))
    : [];
  const customerCoupons = Array.isArray(d.customerCoupons)
    ? d.customerCoupons.map((cc) => mapDbCustomerCoupon(cc as DbRow))
    : [];
  const couponRedemptions = Array.isArray(d.couponRedemptions)
    ? d.couponRedemptions.map((cr) => mapDbCouponRedemption(cr as DbRow))
    : [];
  const inventoryMovements = Array.isArray(d.inventoryMovements)
    ? d.inventoryMovements.map((im) => mapDbInventoryMovement(im as DbRow))
    : [];
  const returnRequests = Array.isArray(d.returnRequests)
    ? d.returnRequests.map((rr) => mapDbReturnRefundRequest(rr as DbRow))
    : [];

  return {
    currentAuthUserId:
      typeof d.currentAuthUserId === 'number' ? d.currentAuthUserId : null,
    barangays,
    categories,
    feedbackCategories,
    merchants,
    merchantHours,
    products,
    addresses,
    pharmacyReviews,
    riderRatings,
    users,
    householdFlags,
    emergencyContacts,
    alerts,
    riderProfiles,
    orders,
    riderEarnings,
    problemReports,
    notifications,
    auditLogs,
    coupons,
    customerCoupons,
    couponRedemptions,
    inventoryMovements,
    returnRequests,
  };
}

export async function hydrateInventoryAndMerchantStateFromMySql(): Promise<
  Pick<
    Partial<HydratedMySqlSnapshot>,
    'merchants' | 'merchantHours' | 'products' | 'addresses' | 'users'
  > | null
> {
  if (!mySqlBackendActive) return null;
  const res = await apiRequest<Record<string, unknown>>('/api/state/inventory');
  if (!res.ok || !res.data) return null;
  const d = res.data;
  return {
    merchants: Array.isArray(d.merchants)
      ? d.merchants.map((r) => mapDbMerchantProfile(r as DbRow))
      : undefined,
    merchantHours: Array.isArray(d.merchantHours)
      ? d.merchantHours.map((r) => mapDbMerchantHours(r as DbRow))
      : undefined,
    products: Array.isArray(d.products)
      ? d.products.map((r) => mapDbProduct(r as DbRow, PRODUCT_IMAGE_FALLBACKS))
      : undefined,
    addresses: Array.isArray(d.addresses)
      ? d.addresses.map((r) => mapDbAddress(r as DbRow))
      : undefined,
    users: Array.isArray(d.users)
      ? d.users.map((r) => mapDbUserToUserAccount(r as DbRow))
      : undefined,
  };
}

export interface MedExRealtimeCallbacks {
  onInventoryOrMerchantDelta: (delta: RealtimeTableDelta) => void;
  onInventoryOrMerchantSyncNeeded: () => void;
  onFullSyncNeeded: () => void;
}

export function subscribeToMedExRealtime(callbacks: MedExRealtimeCallbacks): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !mySqlBackendActive) {
    return () => {};
  }

  let fastTimer: ReturnType<typeof setTimeout> | null = null;
  let fullTimer: ReturnType<typeof setTimeout> | null = null;
  let hadError = false;

  const scheduleFast = () => {
    if (fastTimer) clearTimeout(fastTimer);
    fastTimer = setTimeout(() => callbacks.onInventoryOrMerchantSyncNeeded(), 100);
  };

  const scheduleFull = () => {
    if (fullTimer) clearTimeout(fullTimer);
    fullTimer = setTimeout(() => callbacks.onFullSyncNeeded(), 150);
  };

  const es = new EventSource('/api/realtime/events');

  es.addEventListener('connected', () => {
    if (hadError) {
      hadError = false;
      scheduleFull();
    }
  });

  es.addEventListener('medex', (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        type?: 'delta' | 'sync';
        table?: RealtimeTableDelta['table'];
        eventType?: RealtimeTableDelta['eventType'];
        newRow?: DbRow | null;
        oldRow?: DbRow | null;
        scope?: 'inventory' | 'full';
      };

      if (parsed.type === 'delta' && parsed.table && parsed.eventType) {
        callbacks.onInventoryOrMerchantDelta({
          table: parsed.table,
          eventType: parsed.eventType,
          newRow: parsed.newRow ?? null,
          oldRow: parsed.oldRow ?? null,
        });
      } else if (parsed.type === 'sync') {
        if (parsed.scope === 'inventory') {
          scheduleFast();
        } else {
          scheduleFull();
        }
      }
    } catch {
      // ignore malformed SSE frames
    }
  });

  es.onerror = () => {
    hadError = true;
  };

  return () => {
    if (fastTimer) clearTimeout(fastTimer);
    if (fullTimer) clearTimeout(fullTimer);
    es.close();
  };
}

// ----------------------------------------------------------------------------
// DB MUTATION SYNC FUNCTIONS (NO-OP IN PREVIEW MODE; LIVE MYSQL WHEN CONNECTED)
// ----------------------------------------------------------------------------

export async function completeMerchantProfileInDb(input: {
  userId: number;
  existingAddressId?: number;
  shop_name: string;
  pharmacist_name: string;
  pharmacist_license_no: string;
  contact_no: string;
  barangay_id: number;
  street: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  business_permit_name?: string;
  business_permit_url?: string;
  government_id_name?: string;
  government_id_url?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  address?: Address;
  merchant?: MerchantProfile;
  hours?: MerchantHourRow[];
}> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ address?: DbRow; merchant?: DbRow; hours?: DbRow[] }>(
    '/api/merchants/profile',
    { method: 'POST', body: input, requireAuth: true }
  );
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  return {
    ok: true,
    address: res.data.address ? mapDbAddress(res.data.address) : undefined,
    merchant: res.data.merchant ? mapDbMerchantProfile(res.data.merchant) : undefined,
    hours: Array.isArray(res.data.hours) ? res.data.hours.map(mapDbMerchantHours) : undefined,
  };
}

export async function completeRiderProfileInDb(input: {
  userId: number;
  vehicle_type: string;
  plate_number: string;
  driver_license_name?: string;
  driver_license_url?: string;
  vehicle_registration_name?: string;
  vehicle_registration_url?: string;
}): Promise<{ ok: boolean; error?: string; riderProfile?: RiderProfile }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ riderProfile?: DbRow }>('/api/riders/profile', {
    method: 'POST',
    body: input,
    requireAuth: true,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  return {
    ok: true,
    riderProfile: res.data.riderProfile ? mapDbRiderProfile(res.data.riderProfile) : undefined,
  };
}

export async function notifyApprovedAdminsInDb(
  title: string,
  message: string,
  notificationType: NotificationItem['notification_type']
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/notifications/notify-admins', {
    method: 'POST',
    body: { title, message, notificationType },
    requireAuth: true,
  });
}

export async function syncUserProfileToDb(
  _userId: number,
  firstName: string,
  lastName: string,
  phone: string
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest('/api/users/me/profile', {
    method: 'PUT',
    body: { first_name: firstName, last_name: lastName, phone_number: phone },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncSaveAddressToDb(
  addr: Address,
  isNew = false
): Promise<{ ok: boolean; address?: Address; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, address: addr };
  const isInsert = isNew || addr.address_id <= 0;
  const res = await apiRequest<{ address?: DbRow }>(
    isInsert ? '/api/addresses' : `/api/addresses/${addr.address_id}`,
    {
      method: isInsert ? 'POST' : 'PUT',
      body: addr,
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.address) return { ok: false, error: res.error };
  return { ok: true, address: mapDbAddress(res.data.address) };
}

export async function syncDeleteAddressToDb(addressId: number): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/addresses/${addressId}`, { method: 'DELETE', requireAuth: true });
}

export async function syncSetPrimaryAddressToDb(_userId: number, addressId: number): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/addresses/${addressId}/primary`, { method: 'POST', requireAuth: true });
}

export async function syncHouseholdFlagsToDb(flags: HouseholdFlags): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/household-flags', { method: 'PUT', body: flags, requireAuth: true });
}

export async function syncSaveEmergencyContactToDb(
  contact: EmergencyContact,
  isNew = false
): Promise<{ ok: boolean; contact?: EmergencyContact; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, contact };
  const isInsert = isNew || contact.contact_id <= 0;
  const res = await apiRequest<{ contact?: DbRow }>(
    isInsert ? '/api/emergency-contacts' : `/api/emergency-contacts/${contact.contact_id}`,
    { method: isInsert ? 'POST' : 'PUT', body: contact, requireAuth: true }
  );
  if (!res.ok || !res.data?.contact) return { ok: false, error: res.error };
  return { ok: true, contact: mapDbEmergencyContact(res.data.contact) };
}

export async function syncDeleteEmergencyContactToDb(contactId: number): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/emergency-contacts/${contactId}`, { method: 'DELETE', requireAuth: true });
}

export async function syncProductToDb(
  product: Product,
  uploadedImageDataUrl?: string,
  isNew = false
): Promise<{ ok: boolean; product?: Product; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, product };
  const isInsert = isNew || product.product_id <= 0;
  const res = await apiRequest<{ product?: DbRow }>(
    isInsert ? '/api/products' : `/api/products/${product.product_id}`,
    {
      method: isInsert ? 'POST' : 'PUT',
      body: { ...product, uploadedImageDataUrl },
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.product) return { ok: false, error: res.error };
  return { ok: true, product: mapDbProduct(res.data.product, PRODUCT_IMAGE_FALLBACKS) };
}

export async function syncDeleteProductToDb(
  productId: number
): Promise<{ ok: boolean; archived?: boolean; unlistedInstead?: boolean; product?: Product; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, archived: true, unlistedInstead: true };
  const res = await apiRequest<{ archived?: boolean; unlistedInstead?: boolean; product?: DbRow }>(
    `/api/products/${productId}`,
    {
      method: 'DELETE',
      requireAuth: true,
    }
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    archived: Boolean(res.data?.archived ?? true),
    unlistedInstead: Boolean(res.data?.unlistedInstead ?? true),
    product: res.data?.product
      ? mapDbProduct(res.data.product, PRODUCT_IMAGE_FALLBACKS)
      : undefined,
  };
}

export async function syncRestoreProductToDb(
  productId: number
): Promise<{ ok: boolean; product?: Product; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ product?: DbRow }>(`/api/products/${productId}/restore`, {
    method: 'POST',
    requireAuth: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    product: res.data?.product
      ? mapDbProduct(res.data.product, PRODUCT_IMAGE_FALLBACKS)
      : undefined,
  };
}

export async function syncMerchantFlagsToDb(
  merchantId: number,
  updates: Partial<
    Pick<
      MerchantProfile,
      'is_24_hours' | 'is_temporarily_closed' | 'shop_name' | 'contact_no' | 'shop_address_id'
    >
  >
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/merchants/${merchantId}/flags`, {
    method: 'PATCH',
    body: updates,
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncMerchantHoursToDb(
  merchantId: number,
  rows: Array<{
    day_of_week: number;
    opens_at: string;
    closes_at: string;
    is_closed: boolean;
  }>
): Promise<{ ok: boolean; hours?: MerchantHourRow[]; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ hours?: DbRow[] }>(`/api/merchants/${merchantId}/hours`, {
    method: 'PUT',
    body: { rows },
    requireAuth: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    hours: Array.isArray(res.data?.hours) ? res.data.hours.map(mapDbMerchantHours) : undefined,
  };
}

export async function syncOrderPlacementToDb(
  order: Order
): Promise<{ ok: boolean; order?: Order; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, order };
  const res = await apiRequest<{
    orderRow: DbRow;
    items: DbRow[];
    history: DbRow[];
    payment?: DbRow;
    prescription?: DbRow;
  }>('/api/orders', { method: 'POST', body: order, requireAuth: true });
  if (!res.ok || !res.data?.orderRow) return { ok: false, error: res.error };
  return {
    ok: true,
    order: mapDbOrderBundleToOrder({
      orderRow: res.data.orderRow,
      items: res.data.items || [],
      history: res.data.history || [],
      payment: res.data.payment,
      prescription: res.data.prescription,
    }),
  };
}

export async function syncCancelOrderToDb(
  orderId: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/orders/${orderId}/cancel`, {
    method: 'POST',
    body: { reason },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncReturnFailedDeliveryToDb(
  orderId: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/orders/${orderId}/return-failed`, {
    method: 'POST',
    body: { reason },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncOrderStatusUpdateToDb(
  orderId: number,
  status: Order['status'],
  note?: string,
  extra?: Partial<{ cancel_reason: string }>
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status, note, ...(extra || {}) },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncPrescriptionReviewToDb(
  orderId: number,
  decision: 'approved' | 'rejected',
  reviewerName: string,
  rejectReason?: string,
  remarks?: string
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/orders/${orderId}/prescription/review`, {
    method: 'POST',
    body: { decision, reviewerName, rejectReason, remarks },
    requireAuth: true,
  });
}

export async function syncPrescriptionReuploadToDb(
  orderId: number,
  rx: NonNullable<Order['prescription']>
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/orders/${orderId}/prescription`, {
    method: 'PUT',
    body: rx,
    requireAuth: true,
  });
}

export async function syncDeliveryUpsertToDb(
  order: Order,
  _isNew = false
): Promise<{ ok: boolean; deliveryId?: number; error?: string }> {
  if (!order.delivery) return { ok: false, error: 'Missing delivery record.' };
  if (!mySqlBackendActive || !inMemoryAuthToken) {
    return { ok: true, deliveryId: order.delivery.delivery_id };
  }
  const res = await apiRequest<{ deliveryId?: number }>(`/api/orders/${order.order_id}/delivery`, {
    method: 'PUT',
    body: order.delivery,
    requireAuth: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, deliveryId: res.data?.deliveryId ?? order.delivery.delivery_id };
}

export async function verifyDeliveryCodeInDb(
  orderId: number,
  code: string
): Promise<{
  ok: boolean;
  attempts?: number;
  flagged?: boolean;
  deliveryFee?: number;
  error?: string;
}> {
  if (!mySqlBackendActive || !inMemoryAuthToken) {
    return { ok: true };
  }
  const res = await apiRequest<{
    attempts?: number;
    flagged?: boolean;
    deliveryFee?: number;
    error?: string;
  }>(`/api/orders/${orderId}/delivery/verify-code`, {
    method: 'POST',
    body: { code },
    requireAuth: true,
  });
  if (!res.ok) {
    return {
      ok: false,
      attempts: res.data?.attempts,
      flagged: res.data?.flagged,
      error: res.error,
    };
  }
  return {
    ok: true,
    attempts: res.data?.attempts,
    flagged: res.data?.flagged,
    deliveryFee: res.data?.deliveryFee,
  };
}

export async function syncPaymentUpdateToDb(
  orderId: number,
  payment: Order['payment']
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/orders/${orderId}/payment`, {
    method: 'PATCH',
    body: payment,
    requireAuth: true,
  });
}

export async function syncRiderOnlineToDb(_userId: number, isOnline: boolean): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/riders/me/online', {
    method: 'PATCH',
    body: { is_online: isOnline },
    requireAuth: true,
  });
}

export async function syncRiderVehicleToDb(
  riderId: number,
  vehicleType: string,
  plateNumber: string
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/riders/${riderId}/vehicle`, {
    method: 'PATCH',
    body: { vehicle_type: vehicleType, plate_number: plateNumber },
    requireAuth: true,
  });
}

export async function syncRiderEarningToDb(earning: RiderEarning): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/riders/earnings', { method: 'POST', body: earning, requireAuth: true });
}

export async function syncDeliveryRatingToDb(rating: DeliveryRating): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/ratings/delivery', { method: 'POST', body: rating, requireAuth: true });
}

export async function syncPharmacyReviewToDb(
  review: PharmacyReview,
  isNew = false
): Promise<{ ok: boolean; review?: PharmacyReview; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, review };
  const isInsert = isNew || review.review_id <= 0;
  const res = await apiRequest<{ review?: DbRow }>(
    isInsert ? '/api/reviews/pharmacy' : `/api/reviews/pharmacy/${review.review_id}`,
    { method: isInsert ? 'POST' : 'PUT', body: review, requireAuth: true }
  );
  if (!res.ok || !res.data?.review) return { ok: false, error: res.error };
  return { ok: true, review: mapDbPharmacyReview(res.data.review) };
}

export async function syncProblemReportCreationToDb(
  report: ProblemReport
): Promise<{ ok: boolean; reportId?: number; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, reportId: report.report_id };
  const res = await apiRequest<{ reportId?: number }>('/api/reports', {
    method: 'POST',
    body: report,
    requireAuth: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, reportId: res.data?.reportId ?? report.report_id };
}

export async function syncProblemReportStatusUpdateToDb(input: {
  reportId: number;
  status: ProblemReport['status'];
  resolutionNote?: string;
  resolvedAt?: string;
  adminNotes?: string;
  csNotes?: string;
  categoryTag?: string;
  updatedAt: string;
  changedById: number;
  changedByName: string;
  changedByRole: UserRole;
  note?: string;
}): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/reports/${input.reportId}/status`, {
    method: 'PATCH',
    body: input,
    requireAuth: true,
  });
}

export async function escalateReportInDb(
  reportId: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/reports/${reportId}/escalate`, {
    method: 'POST',
    body: { reason },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncEmergencyAlertToDb(
  alert: EmergencyAlert,
  isNew = false
): Promise<{ ok: boolean; alertId?: number; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, alertId: alert.alert_id };
  const isInsert = isNew || alert.alert_id <= 0;
  const res = await apiRequest<{ alertId?: number }>(
    isInsert ? '/api/alerts' : `/api/alerts/${alert.alert_id}`,
    { method: isInsert ? 'POST' : 'PATCH', body: alert, requireAuth: true }
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, alertId: res.data?.alertId ?? alert.alert_id };
}

export async function syncAlertVerificationToDb(
  alertId: number,
  decision: VerificationDecision,
  verifierId: number,
  verifierName: string,
  notes: string
): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest(`/api/alerts/${alertId}/verify`, {
    method: 'POST',
    body: { decision, verifierId, verifierName, notes },
    requireAuth: true,
  });
}

export async function syncAccountStatusToDb(
  userId: number,
  status: AccountStatus,
  reason?: string,
  documentsVerified?: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: { status, reason, documentsVerified },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncUserRoleToDb(
  userId: number,
  role: UserRole
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: { role },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function syncBarangayToDb(
  b: Barangay
): Promise<{ ok: boolean; barangay?: Barangay; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, barangay: b };
  const res = await apiRequest<{ barangay?: DbRow }>('/api/admin/barangays', {
    method: 'POST',
    body: b,
    requireAuth: true,
  });
  if (!res.ok || !res.data?.barangay) return { ok: false, error: res.error };
  return { ok: true, barangay: mapDbBarangay(res.data.barangay) };
}

export async function syncNotificationsReadToDb(_userId: number): Promise<void> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return;
  await apiRequest('/api/notifications/read-all', { method: 'POST', requireAuth: true });
}

// ----------------------------------------------------------------------------
// RBAC INTERNAL ACCOUNTS, DELIVERY MANAGEMENT, COUPONS & RETURNS SYNC
// ----------------------------------------------------------------------------

export async function createInternalAccountInDb(input: {
  role: 'delivery_manager' | 'coupon_handler' | 'inventory_manager' | 'customer_service';
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password: string;
  date_of_birth: string;
  department_label?: string;
  grant_permissions?: string[];
}): Promise<{ ok: boolean; user?: UserAccount; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ user?: DbRow }>('/api/admin/internal-accounts', {
    method: 'POST',
    body: input,
    requireAuth: true,
  });
  if (!res.ok || !res.data?.user) return { ok: false, error: res.error };
  return { ok: true, user: mapDbUserToUserAccount(res.data.user) };
}

export async function updateUserPermissionsInDb(
  userId: number,
  overrides: UserPermissionOverrides
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/admin/internal-accounts/${userId}/permissions`, {
    method: 'PATCH',
    body: { grant: overrides.grant ?? [], revoke: overrides.revoke ?? [] },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function assignRiderToDeliveryInDb(
  orderId: number,
  riderId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/delivery-management/deliveries/${orderId}/assign`, {
    method: 'POST',
    body: { riderId },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function updateRiderOperationalStatusInDb(
  riderId: number,
  operationalStatus: RiderOperationalStatus,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/delivery-management/riders/${riderId}/operational-status`, {
    method: 'PATCH',
    body: { operationalStatus, reason },
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function saveCouponInDb(
  coupon: Coupon,
  isNew = false
): Promise<{ ok: boolean; coupon?: Coupon; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true, coupon };
  const insert = isNew || coupon.coupon_id <= 0;
  const res = await apiRequest<{ coupon?: DbRow }>(
    insert ? '/api/coupons' : `/api/coupons/${coupon.coupon_id}`,
    {
      method: insert ? 'POST' : 'PUT',
      body: coupon,
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.coupon) return { ok: false, error: res.error };
  return { ok: true, coupon: mapDbCoupon(res.data.coupon) };
}

export async function deleteCouponInDb(
  couponId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest(`/api/coupons/${couponId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
  return { ok: res.ok, error: res.error };
}

export async function claimCouponInDb(
  couponId: number
): Promise<{ ok: boolean; claim?: CustomerCoupon; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ claim?: DbRow }>('/api/coupons/claim', {
    method: 'POST',
    body: { couponId },
    requireAuth: true,
  });
  if (!res.ok || !res.data?.claim) return { ok: false, error: res.error };
  return { ok: true, claim: mapDbCustomerCoupon(res.data.claim) };
}

export async function validateCouponOnServer(input: {
  code: string;
  merchant_id: number;
  items: Array<{ product_id: number; quantity: number }>;
}): Promise<{ ok: boolean; coupon?: Coupon; discountAmount?: number; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{
    coupon?: DbRow;
    discountAmount?: number;
  }>('/api/coupons/validate', {
    method: 'POST',
    body: input,
    requireAuth: true,
  });
  if (!res.ok || !res.data?.coupon) return { ok: false, error: res.error };
  return {
    ok: true,
    coupon: mapDbCoupon(res.data.coupon),
    discountAmount: Number(res.data.discountAmount ?? 0),
  };
}

export async function createReturnRequestInDb(input: {
  order_id: number;
  reason_code: ReturnRefundReason;
  description: string;
  requested_refund_amount: number;
}): Promise<{ ok: boolean; returnRequest?: ReturnRefundRequest; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ returnRequest?: DbRow }>('/api/returns', {
    method: 'POST',
    body: input,
    requireAuth: true,
  });
  if (!res.ok || !res.data?.returnRequest) return { ok: false, error: res.error };
  return { ok: true, returnRequest: mapDbReturnRefundRequest(res.data.returnRequest) };
}

export async function respondReturnMerchantInDb(
  returnId: number,
  input: { status: ReturnRefundStatus; responseNote?: string; approvedAmount?: number }
): Promise<{ ok: boolean; returnRequest?: ReturnRefundRequest; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ returnRequest?: DbRow }>(
    `/api/returns/${returnId}/merchant-respond`,
    {
      method: 'PATCH',
      body: input,
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.returnRequest) return { ok: false, error: res.error };
  return { ok: true, returnRequest: mapDbReturnRefundRequest(res.data.returnRequest) };
}

export async function escalateReturnInDb(
  returnId: number,
  reason: string
): Promise<{ ok: boolean; returnRequest?: ReturnRefundRequest; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ returnRequest?: DbRow }>(
    `/api/returns/${returnId}/escalate`,
    {
      method: 'POST',
      body: { reason },
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.returnRequest) return { ok: false, error: res.error };
  return { ok: true, returnRequest: mapDbReturnRefundRequest(res.data.returnRequest) };
}

export async function resolveReturnCsInDb(
  returnId: number,
  input: {
    status: ReturnRefundStatus;
    csNotes?: string;
    resolutionNote?: string;
    approvedAmount?: number;
  }
): Promise<{ ok: boolean; returnRequest?: ReturnRefundRequest; error?: string }> {
  if (!mySqlBackendActive || !inMemoryAuthToken) return { ok: true };
  const res = await apiRequest<{ returnRequest?: DbRow }>(
    `/api/returns/${returnId}/cs-resolve`,
    {
      method: 'PATCH',
      body: input,
      requireAuth: true,
    }
  );
  if (!res.ok || !res.data?.returnRequest) return { ok: false, error: res.error };
  return { ok: true, returnRequest: mapDbReturnRefundRequest(res.data.returnRequest) };
}

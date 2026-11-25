import type {
  AvailabilityStatus,
  DeliveryRating,
  EmergencyAlert,
  MerchantHourRow,
  MerchantProfile,
  PharmacyReview,
  ProblemReport,
  ProblemReportStatus,
  UserAccount,
  UserRole,
} from '../types/medex';

export const STORE_POSITIVE_TAGS = [
  'Item as described',
  'Well packed',
  'Fast preparation',
  'Fair price',
  'Helpful staff',
] as const;

export const STORE_PROBLEM_TAGS = [
  'Wrong item',
  'Missing item',
  'Damaged item',
  'Slow preparation',
  'Overpriced',
] as const;

export const RIDER_QUICK_TAGS = [
  'Fast delivery',
  'Careful handling',
  'Polite courier',
  'Followed instructions',
] as const;

export const RIDER_PROBLEM_TAGS = [
  'Late arrival',
  'Damaged package',
  'Wrong drop-off',
  'Communication issue',
] as const;

/**
 * Normalize Philippine mobile numbers to +639XXXXXXXXX format.
 * Returns null if invalid.
 */
export function normalizePHPhoneNumber(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^\+639\d{9}$/.test(cleaned)) return cleaned;
  if (/^639\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^09\d{9}$/.test(cleaned)) return `+63${cleaned.slice(1)}`;
  if (/^9\d{9}$/.test(cleaned)) return `+63${cleaned}`;
  return null;
}

/**
 * Calculate exact age in years and verify >= 18 for resident eligibility.
 */
export function isAtLeast18(dateOfBirth: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dob.getTime())) return false;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= 18;
}

/**
 * Validate standard regular price of a pharmacy product.
 */
export function validateRegularPrice(regularPrice: number): { valid: boolean; error: string | null } {
  if (regularPrice <= 0 || Number.isNaN(regularPrice)) {
    return { valid: false, error: 'Regular price must be greater than zero.' };
  }
  return { valid: true, error: null };
}

/**
 * Enforce customer anonymity & PII safety on user-submitted feedback/rating text.
 * Blocks emails, Philippine/local phone numbers, street addresses, and Rx reference numbers.
 */
export function validateCommentPrivacy(
  text: string,
  maxLength: number = 500
): { valid: boolean; error: string | null; sanitized: string } {
  const trimmed = text.trim();
  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `Comment must be ${maxLength} characters or fewer.`,
      sanitized: trimmed,
    };
  }
  if (/[<>]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Plain text only — angle brackets or HTML tags are not allowed.',
      sanitized: trimmed,
    };
  }
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return {
      valid: false,
      error: 'For your privacy, do not include email addresses in public feedback.',
      sanitized: trimmed,
    };
  }
  if (/(?:\+?63[\s-]?9\d{2}|09\d{2})[\s-]?\d{3}[\s-]?\d{4}|\b\d{7,11}\b/.test(trimmed)) {
    return {
      valid: false,
      error: 'For your privacy, do not include phone or contact numbers.',
      sanitized: trimmed,
    };
  }
  if (/\b(?:brgy\.?|barangay|street|st\.|ave\.?|avenue|blk\.?\s*\d+|lot\s*\d+|purok)\b/i.test(trimmed)) {
    return {
      valid: false,
      error: 'For your privacy, do not include home street or barangay details.',
      sanitized: trimmed,
    };
  }
  if (/\b(?:rx\s*#?\s*\d+|prc-\d+|reseta\s*#?\s*\d+)\b/i.test(trimmed)) {
    return {
      valid: false,
      error: 'For your privacy, do not include prescription or license reference numbers.',
      sanitized: trimmed,
    };
  }
  return { valid: true, error: null, sanitized: trimmed };
}

/**
 * Check whether a delivered order is within the 7-day Module 9 review & report window.
 */
export function isWithin7DayWindow(
  deliveredAtIso: string | undefined,
  now: Date = new Date()
): { allowed: boolean; daysRemaining: number } {
  if (!deliveredAtIso) return { allowed: false, daysRemaining: 0 };
  const deliveredMs = new Date(deliveredAtIso).getTime();
  if (Number.isNaN(deliveredMs)) return { allowed: false, daysRemaining: 0 };
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const diff = deliveredMs + windowMs - now.getTime();
  if (diff <= 0) return { allowed: false, daysRemaining: 0 };
  return { allowed: true, daysRemaining: Math.ceil(diff / (24 * 60 * 60 * 1000)) };
}

/**
 * Module 9: A resident can edit a store review only within 24 hours of submission.
 */
export function canEditPharmacyReview(createdAtIso: string, now: Date = new Date()): boolean {
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return false;
  return now.getTime() - createdMs <= 24 * 60 * 60 * 1000;
}

/**
 * Validate store review submission rules (Module 9):
 * - Rating must be 1..5
 * - If rating is 1 or 2 stars, at least one quick tag or non-empty comment is required
 * - Plain-text privacy check up to 500 chars
 */
export function validateStoreReviewInput(input: {
  stars: number;
  tags: string[];
  comment: string;
}): { valid: boolean; error: string | null } {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    return { valid: false, error: 'Please select a star rating from 1 to 5.' };
  }
  const privacy = validateCommentPrivacy(input.comment, 500);
  if (!privacy.valid) return { valid: false, error: privacy.error };
  if (input.stars <= 2 && input.tags.length === 0 && privacy.sanitized.length === 0) {
    return {
      valid: false,
      error: 'For 1 or 2 star ratings, please choose at least one quick tag or add a short note.',
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate rider delivery rating submission (Module 6):
 * - Stars 1..5
 * - Optional comment checked for privacy/PII up to 500 chars
 */
export function validateRiderRatingInput(input: {
  stars: number;
  comment: string;
}): { valid: boolean; error: string | null } {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    return { valid: false, error: 'Please select a rider rating from 1 to 5 stars.' };
  }
  const privacy = validateCommentPrivacy(input.comment, 500);
  if (!privacy.valid) return { valid: false, error: privacy.error };
  return { valid: true, error: null };
}

/**
 * Compute dynamic pharmacy rating average and count across visible reviews only.
 */
export function computePharmacyRatingSummary(
  reviews: PharmacyReview[],
  merchantId: number
): { average: number; count: number } {
  const visible = reviews.filter((r) => r.merchant_id === merchantId && r.status === 'visible');
  if (visible.length === 0) return { average: 0, count: 0 };
  const total = visible.reduce((sum, r) => sum + r.rating, 0);
  return {
    average: Number((total / visible.length).toFixed(1)),
    count: visible.length,
  };
}

/**
 * Compute dynamic rider rating average, count, and 5-to-1 distribution from real DeliveryRating records.
 */
export function computeRiderRatingStats(
  ratings: DeliveryRating[],
  riderUserId: number
): { average: number; count: number; breakdown: Record<1 | 2 | 3 | 4 | 5, number> } {
  const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const mine = ratings.filter((r) => r.rider_id === riderUserId);
  if (mine.length === 0) {
    return { average: 5.0, count: 0, breakdown };
  }
  let sum = 0;
  for (const r of mine) {
    sum += r.stars;
    const clamped = Math.min(5, Math.max(1, Math.round(r.stars))) as 1 | 2 | 3 | 4 | 5;
    breakdown[clamped] += 1;
  }
  return {
    average: Number((sum / mine.length).toFixed(2)),
    count: mine.length,
    breakdown,
  };
}

/**
 * Module 9: Enforce forward-only status transitions for problem reports.
 * Terminal statuses ('resolved', 'dismissed') cannot transition further.
 * Only Admin may mark a report as 'dismissed'.
 */
export function canTransitionReportStatus(
  current: ProblemReportStatus,
  next: ProblemReportStatus,
  actorRole: UserRole
): boolean {
  if (current === 'resolved' || current === 'dismissed') return false;
  if (next === 'open' || next === current) return false;
  if (next === 'dismissed' && actorRole !== 'admin' && actorRole !== 'customer_service') return false;
  if (next === 'escalated') {
    if (actorRole !== 'resident' && actorRole !== 'admin') return false;
    return current === 'open' || current === 'acknowledged';
  }
  if (current === 'open') {
    return next === 'acknowledged' || next === 'resolved' || next === 'dismissed';
  }
  if (current === 'acknowledged') {
    return next === 'resolved' || next === 'dismissed';
  }
  if (current === 'escalated') {
    if (actorRole !== 'customer_service' && actorRole !== 'admin') return false;
    return next === 'acknowledged' || next === 'resolved' || next === 'dismissed';
  }
  return false;
}

/**
 * Module 9: Prevent duplicate open reports by the same resident for the same
 * (merchant, product, category) or (order, category).
 */
export function findDuplicateOpenReport(
  reports: ProblemReport[],
  params: {
    user_id: number;
    source: ProblemReport['source'];
    order_id: number | null;
    merchant_id: number | null;
    product_id: number | null;
    category_code: string;
  }
): ProblemReport | null {
  const match = reports.find((r) => {
    if (r.status !== 'open' || r.user_id !== params.user_id || r.category_code !== params.category_code) {
      return false;
    }
    if (params.source === 'order' && params.order_id !== null) {
      return r.source === 'order' && r.order_id === params.order_id;
    }
    if (params.source === 'locator') {
      return (
        r.source === 'locator' &&
        r.merchant_id === params.merchant_id &&
        r.product_id === params.product_id
      );
    }
    return r.source === 'app';
  });
  return match ?? null;
}

/**
 * Privacy / Anonymity masking for reviews, reports, and rider ratings.
 * Never reveals email, phone number, street address, or full last name.
 */
export function formatReviewerDisplayName(
  user: Pick<UserAccount, 'first_name' | 'last_name'> | undefined,
  isAnonymous: boolean
): string {
  if (isAnonymous || !user) return 'Verified Resident (Anonymous)';
  const first = user.first_name.trim() || 'Resident';
  const lastInitial = user.last_name.trim().charAt(0).toUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/**
 * Check if a problem report has remained open past 48 hours.
 */
export function isReportOver48Hours(report: Pick<ProblemReport, 'status' | 'created_at'>, now: Date = new Date()): boolean {
  if (report.status !== 'open') return false;
  const ageMs = now.getTime() - new Date(report.created_at).getTime();
  return ageMs > 48 * 60 * 60 * 1000;
}

/**
 * Generate a unique readable Problem Report reference code: PR-YYMMDD-NNNNN
 */
export function generateReportReferenceCode(sequence: number, date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(5, '0');
  return `PR-${yy}${mm}${dd}-${seq}`;
}

/**
 * Compute inventory availability status for Pharmacy Locator.
 */
export function getAvailabilityStatus(
  stockQuantity: number,
  lowStockThreshold: number = 10
): AvailabilityStatus {
  if (stockQuantity <= 0) return 'Out of Stock';
  if (stockQuantity <= lowStockThreshold) return 'Low Stock';
  return 'Available';
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Determine whether a pharmacy is open right now in Asia/Manila time (UTC+8),
 * plus human-readable next opening label.
 */
export function getMerchantOpenStatus(
  merchant: Pick<MerchantProfile, 'is_24_hours' | 'is_temporarily_closed'>,
  hours: MerchantHourRow[],
  now: Date = new Date()
): { isOpen: boolean; label: string; nextOpeningText: string } {
  if (merchant.is_temporarily_closed) {
    return {
      isOpen: false,
      label: 'Temporarily Closed',
      nextOpeningText: 'Reopening pending pharmacy update',
    };
  }
  if (merchant.is_24_hours) {
    return {
      isOpen: true,
      label: 'Open 24 Hours',
      nextOpeningText: 'Always open',
    };
  }

  // Convert `now` to Asia/Manila (UTC+8)
  const manilaMs = now.getTime() + 8 * 60 * 60 * 1000;
  const manilaDate = new Date(manilaMs);
  const day = manilaDate.getUTCDay(); // 0=Sun..6=Sat
  const currentMin = manilaDate.getUTCHours() * 60 + manilaDate.getUTCMinutes();

  const todayRows = hours.filter((h) => h.day_of_week === day && !h.is_closed);
  for (const row of todayRows) {
    const start = parseMinutes(row.opens_at);
    const end = parseMinutes(row.closes_at);
    if (currentMin >= start && currentMin < end) {
      return {
        isOpen: true,
        label: `Open until ${row.closes_at}`,
        nextOpeningText: `Closes at ${row.closes_at}`,
      };
    }
  }

  // Find next opening slot within the next 7 days
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let offset = 0; offset <= 7; offset++) {
    const targetDay = (day + offset) % 7;
    const rows = hours
      .filter((h) => h.day_of_week === targetDay && !h.is_closed)
      .sort((a, b) => parseMinutes(a.opens_at) - parseMinutes(b.opens_at));
    for (const row of rows) {
      if (offset === 0 && parseMinutes(row.opens_at) <= currentMin) continue;
      const prefix = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dayNames[targetDay];
      return {
        isOpen: false,
        label: 'Closed',
        nextOpeningText: `Opens ${prefix} at ${row.opens_at}`,
      };
    }
  }

  return {
    isOpen: false,
    label: 'Closed',
    nextOpeningText: 'Schedule unavailable',
  };
}

/**
 * Check if a resident has >= 3 false alarms or accidental presses in the past 30 days.
 */
export function hasRepeatEmergencyMisuse(
  alerts: EmergencyAlert[],
  residentId: number,
  now: Date = new Date()
): boolean {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const misuseCount = alerts.filter(
    (a) =>
      a.user_id === residentId &&
      a.verification &&
      (a.verification.decision === 'false_alarm' ||
        a.verification.decision === 'accidental_press') &&
      new Date(a.created_at).getTime() >= cutoff
  ).length;
  return misuseCount >= 3;
}

/**
 * Format emergency category code cleanly, supporting both unified 911_general and any cached legacy category.
 */
export function formatEmergencyCategoryLabel(category: string | undefined): string {
  if (!category || category === '911_general') return '911 Emergency';
  return `911 Emergency (${category.toUpperCase()})`;
}

/**
 * Determine whether the active device should use the mobile phone dialer handoff
 * or the desktop/laptop QR + location script handoff.
 */
export function isMobileEmergencyDevice(params: {
  userAgent: string;
  hasCoarsePointer: boolean;
  viewportWidth: number;
}): boolean {
  const ua = params.userAgent.toLowerCase();
  const mobileUa = /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua);
  if (mobileUa) return true;
  return params.hasCoarsePointer && params.viewportWidth <= 900;
}

/**
 * Build a plain-text emergency read-aloud & copyable location script for Olongapo 911 responders.
 */
export function buildEmergencyLocationScript(input: {
  callerName: string;
  phone: string;
  addressSnapshot: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  referenceCode?: string;
}): string {
  const lines = [
    `MEDEX 911 EMERGENCY ALERT${input.referenceCode ? ` (${input.referenceCode})` : ''}`,
    `Caller: ${input.callerName}`,
    `Callback Number: ${input.phone}`,
    `Location: ${input.addressSnapshot}`,
  ];
  if (input.landmark && input.landmark.trim()) {
    lines.push(`Landmark: ${input.landmark.trim()}`);
  }
  lines.push(`GPS Coordinates: ${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`);
  return lines.join('\n');
}

/**
 * Check duplicate general 911 alert submission within 60 seconds for the same resident.
 */
export function isDuplicateEmergencyAlert(
  alerts: EmergencyAlert[],
  residentId: number,
  now: Date = new Date()
): EmergencyAlert | null {
  const windowMs = 60 * 1000;
  const match = alerts.find(
    (a) =>
      a.user_id === residentId &&
      a.status !== 'cancelled' &&
      now.getTime() - new Date(a.created_at).getTime() <= windowMs
  );
  return match ?? null;
}

/**
 * Detect COD mismatch between order total and rider reported collected cash.
 */
export function isCodAmountMismatch(orderTotal: number, collectedAmount: number): boolean {
  return Math.abs(Number(orderTotal.toFixed(2)) - Number(collectedAmount.toFixed(2))) > 0.009;
}

/**
 * Format Philippine Peso currency cleanly.
 */
export function formatPHP(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

/**
 * Wrap a carousel slide index safely across circular boundaries.
 */
export function wrapSlideIndex(currentIndex: number, delta: number, totalSlides: number): number {
  if (totalSlides <= 0) return 0;
  return ((currentIndex + delta) % totalSlides + totalSlides) % totalSlides;
}

/**
 * Check whether the animated entrance splash screen should be bypassed via query string.
 */
export function shouldSkipSplash(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return params.get('autostart') === '1';
}

/**
 * Determine if a resident order requires an interactive GCash payment action right now
 * (either Rx-approved and pending GCash, pending OTC GCash, or failed GCash retry).
 * Never returns true while a prescription is still pending review or rejected.
 */
export function needsResidentGcashPayment(order: {
  status: string;
  payment: { method: string; status: string };
  prescription?: { status: string };
}): boolean {
  if (order.status === 'cancelled' || order.status === 'delivered') return false;
  if (order.payment.method !== 'GCash') return false;
  if (order.payment.status === 'paid' || order.payment.status === 'collected') return false;
  if (order.prescription && order.prescription.status !== 'approved') return false;
  return order.payment.status === 'pending' || order.payment.status === 'failed';
}

/**
 * Determine if a GCash order is intentionally holding payment until the pharmacist approves the Rx.
 */
export function isGcashWaitingForRxApproval(order: {
  status: string;
  payment: { method: string; status: string };
  prescription?: { status: string };
}): boolean {
  if (order.status === 'cancelled') return false;
  if (order.payment.method !== 'GCash' || order.payment.status !== 'pending') return false;
  return Boolean(order.prescription && order.prescription.status !== 'approved');
}

export const OLONGAPO_DEFAULT_CENTER: { lat: number; lng: number } = {
  lat: 14.8315,
  lng: 120.2835,
};

export const OLONGAPO_BARANGAY_CENTERS: Record<number, { lat: number; lng: number }> = {
  1: { lat: 14.8355, lng: 120.2842 }, // East Bajac-Bajac
  2: { lat: 14.8328, lng: 120.2788 }, // West Bajac-Bajac
  3: { lat: 14.8268, lng: 120.2816 }, // Pag-asa
  4: { lat: 14.8308, lng: 120.2872 }, // East Tapinac
  5: { lat: 14.8492, lng: 120.2647 }, // Barretto
  6: { lat: 14.8414, lng: 120.2738 }, // Kalaklan
};

const BARANGAY_NAME_CENTERS: Record<string, { lat: number; lng: number }> = {
  'east bajac-bajac': OLONGAPO_BARANGAY_CENTERS[1],
  'west bajac-bajac': OLONGAPO_BARANGAY_CENTERS[2],
  'pag-asa': OLONGAPO_BARANGAY_CENTERS[3],
  'east tapinac': OLONGAPO_BARANGAY_CENTERS[4],
  barretto: OLONGAPO_BARANGAY_CENTERS[5],
  kalaklan: OLONGAPO_BARANGAY_CENTERS[6],
  'new kababae': { lat: 14.8378, lng: 120.2804 },
  'new ilalim': { lat: 14.8342, lng: 120.2764 },
  'west tapinac': { lat: 14.8292, lng: 120.2836 },
  asinan: { lat: 14.8304, lng: 120.2798 },
  banicain: { lat: 14.8279, lng: 120.2768 },
  kababae: { lat: 14.8378, lng: 120.2804 },
  gordon: { lat: 14.8534, lng: 120.2962 },
  'gordon heights': { lat: 14.8534, lng: 120.2962 },
  'santa rita': { lat: 14.8482, lng: 120.2896 },
  'sta. rita': { lat: 14.8482, lng: 120.2896 },
  mabayuan: { lat: 14.8442, lng: 120.2821 },
  'new cabalan': { lat: 14.8576, lng: 120.3112 },
  'old cabalan': { lat: 14.8498, lng: 120.3054 },
};

/**
 * Resolve deterministic Olongapo City center coordinates for a barangay ID (or barangay name).
 */
export function getBarangayCenterCoords(
  barangayId: number | undefined,
  barangays?: Array<{ barangay_id: number; name: string }>
): { lat: number; lng: number } {
  if (barangayId && OLONGAPO_BARANGAY_CENTERS[barangayId]) {
    return OLONGAPO_BARANGAY_CENTERS[barangayId];
  }
  if (barangayId && barangays) {
    const match = barangays.find((b) => b.barangay_id === barangayId);
    if (match) {
      const normalized = match.name.trim().toLowerCase();
      if (BARANGAY_NAME_CENTERS[normalized]) {
        return BARANGAY_NAME_CENTERS[normalized];
      }
    }
  }
  return OLONGAPO_DEFAULT_CENTER;
}

/**
 * Validate and round map coordinates within Olongapo City & nearby Zambales/Subic Bay coverage.
 */
export function validateOlongapoCoordinates(
  lat: number,
  lng: number
): { valid: boolean; lat: number; lng: number; error: string | null } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      lat: OLONGAPO_DEFAULT_CENTER.lat,
      lng: OLONGAPO_DEFAULT_CENTER.lng,
      error: 'Map coordinates must be valid numbers.',
    };
  }
  if (lat < 14.74 || lat > 14.96 || lng < 120.14 || lng > 120.42) {
    return {
      valid: false,
      lat,
      lng,
      error: 'Please drop the store pin inside Olongapo City / Subic Bay service bounds.',
    };
  }
  return {
    valid: true,
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    error: null,
  };
}

/**
 * Resolve Leaflet tile configuration using Esri ArcGIS World Street Map (free public CDN,
 * zero API key required, no volunteer-OSM Referer 403 blocks) with zoom 17 native street detail.
 */
export function getMapTileConfig(_isDark: boolean): {
  url: string;
  attribution: string;
  subdomains: string;
  maxNativeZoom: number;
  maxZoom: number;
} {
  return {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; OpenStreetMap &amp; GIS Community',
    subdomains: 'abc',
    maxNativeZoom: 17,
    maxZoom: 19,
  };
}

/**
 * Enforce both available stock AND per-order purchase_limit on cart quantities.
 */
export function validateCartItemLimit(input: {
  requestedQuantity: number;
  stockQuantity: number;
  purchaseLimit: number;
  productName?: string;
}): { valid: boolean; maxAllowed: number; error: string | null } {
  const safeStock = Math.max(0, Math.floor(input.stockQuantity));
  const safeLimit = Math.max(1, Math.floor(input.purchaseLimit || 1));
  const maxAllowed = Math.min(safeStock, safeLimit);
  const label = input.productName ? `${input.productName}` : 'This item';

  if (safeStock <= 0) {
    return { valid: false, maxAllowed: 0, error: `${label} is currently out of stock.` };
  }
  if (input.requestedQuantity > safeStock) {
    return {
      valid: false,
      maxAllowed,
      error: `Only ${safeStock} left in stock for ${label}.`,
    };
  }
  if (input.requestedQuantity > safeLimit) {
    return {
      valid: false,
      maxAllowed,
      error: `Purchase limit for ${label} is ${safeLimit} per order.`,
    };
  }
  return { valid: true, maxAllowed, error: null };
}

function randomAlphaNum(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function buildUniqueOrderCode(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `MDX-ORD-${yy}${mm}${dd}-${randomAlphaNum(5)}`;
}

export function buildUniqueReceiptNumber(date: Date = new Date()): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `RCP-${yyyy}${mm}${dd}-${randomAlphaNum(6)}`;
}

export function buildUniqueEmergencyRefCode(date: Date = new Date()): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `MDX-EMG-${yyyy}${mm}${dd}-${randomAlphaNum(5)}`;
}

export function buildUniqueReportReferenceCode(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `PR-${yy}${mm}${dd}-${randomAlphaNum(5)}`;
}

/**
 * Strictly validate person name fields (First Name, Last Name, Pharmacist Name):
 * letters and spaces only — rejects any digits or special characters.
 */
export function validatePersonName(
  raw: string,
  fieldLabel = 'Name'
): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      error: `${fieldLabel} is required.`,
    };
  }
  if (!/^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: `${fieldLabel} must contain letters only (no numbers or special characters).`,
    };
  }
  if (normalized.replace(/\s+/g, '').length < 2) {
    return {
      valid: false,
      normalized,
      error: `${fieldLabel} must be at least 2 letters long.`,
    };
  }
  return {
    valid: true,
    normalized,
    error: null,
  };
}

export interface PasswordRequirementChecks {
  minLength: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function getPasswordRequirementChecks(password: string): PasswordRequirementChecks {
  const value = typeof password === 'string' ? password : '';
  return {
    minLength: value.length >= 8,
    hasLowercase: /[a-z]/.test(value),
    hasUppercase: /[A-Z]/.test(value),
    hasNumber: /[0-9]/.test(value),
    hasSpecial: /[^A-Za-z0-9\s]/.test(value),
  };
}

/**
 * Enforce strong account passwords on sign up:
 * at least 8 characters, one uppercase letter, one lowercase letter,
 * one number, and one special character.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  error: string | null;
} {
  const checks = getPasswordRequirementChecks(password);
  const missing: string[] = [];

  if (!checks.minLength) missing.push('at least 8 characters');
  if (!checks.hasUppercase) missing.push('one uppercase letter (A-Z)');
  if (!checks.hasLowercase) missing.push('one lowercase letter (a-z)');
  if (!checks.hasNumber) missing.push('one number (0-9)');
  if (!checks.hasSpecial) missing.push('one special character (!@#$%^&*)');

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Password must include ${missing.join(', ')}.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Strictly verify that an email is a valid @gmail.com address.
 */
export function isStrictGmailAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.includes('..')) return false;
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@gmail\.com$/.test(normalized);
}

/**
 * Enforce strict @gmail.com email addresses for all user/partner signups.
 */
export function validateSignupEmail(email: string): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const normalized = email.trim().toLowerCase();
  if (!isStrictGmailAddress(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Only valid @gmail.com email addresses are accepted for sign up (e.g., juandelacruz@gmail.com).',
    };
  }
  return { valid: true, normalized, error: null };
}

/**
 * Validate Sign In email: must be @gmail.com unless signing in as an authorized
 * internal MedEx administrative account (@medex.ph or known Admin/staff email).
 */
export function validateSignInEmail(
  email: string,
  options?: { isAdminAccount?: boolean; knownAdminEmails?: string[] }
): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Please enter your email address.' };
  }
  if (isStrictGmailAddress(normalized)) {
    return { valid: true, normalized, error: null };
  }
  const knownInternal = (options?.knownAdminEmails || []).map((e) => e.trim().toLowerCase());
  const isMedExInternalEmail = /^[a-z0-9._+-]+@medex\.ph$/.test(normalized);
  if (
    options?.isAdminAccount ||
    normalized === 'admin@medex.ph' ||
    isMedExInternalEmail ||
    knownInternal.includes(normalized)
  ) {
    return { valid: true, normalized, error: null };
  }
  return {
    valid: false,
    normalized,
    error: 'Only @gmail.com accounts can sign in (non-Gmail access is restricted to Admin & Internal Staff only).',
  };
}

/**
 * Validate and normalize Philippine PRC Pharmacist License Number (strictly 7 digits).
 * Accepts "0084512", "PRC-0084512", or "PRC-RPh-0084512" and normalizes to "PRC-0084512".
 */
export function validateAndNormalizePrcLicense(raw: string): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: 'PRC Pharmacist License Number (7 digits) is required.',
    };
  }

  const match = /^(?:(?:PRC(?:[-\s]?RPH)?|RPH)[-\s]?)?(\d{7})$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Enter a valid 7-digit PRC Pharmacist License No. (e.g., 0084512 or PRC-0084512).',
    };
  }

  const digits = match[1];
  if (/^(\d)\1{6}$/.test(digits)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter your real 7-digit PRC Pharmacist License No.',
    };
  }

  return {
    valid: true,
    normalized: `PRC-${digits}`,
    error: null,
  };
}

/**
 * Validate and normalize Philippine LTO vehicle plate numbers for courier riders.
 * Supports:
 * - Current LTO Motorcycle: 2 letters + 5 digits (7 chars, e.g., AB-12345)
 * - Transitional / Older Motorcycle: 3 letters + 3 digits (ABC-123), 3 digits + 3 letters (342-OBX),
 *   2 letters + 4 digits (AB-1234), 4 digits + 2 letters (1234-AB), varied 6-char LTO (A123BC, A1234B, 12A345)
 * - 4-Wheel Car/Sedan LTO: 3 letters + 4 digits (7 chars, e.g., ZMB-4821)
 */
export function validateAndNormalizePHPlateNumber(
  raw: string,
  vehicleType?: string
): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: 'Philippine LTO plate number is required.',
    };
  }

  const compact = trimmed.replace(/[\s-]+/g, '');
  const blocked = new Set(['PENDING', 'NONE', 'NA', 'TEST', 'TEMP', 'DUMMY', 'PLATE']);
  if (blocked.has(compact) || !/^[A-Z0-9]+$/.test(compact)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Enter a valid Philippine LTO plate number (e.g., AB-12345, 342-OBX, ABC-123, or ZMB-4821).',
    };
  }

  // Reject all-zero digit sequences
  const digitChars = compact.replace(/[A-Z]/g, '');
  if (!digitChars || /^0+$/.test(digitChars)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Plate number digits cannot be all zeros.',
    };
  }

  const vLower = (vehicleType || '').toLowerCase();
  const isFourWheel = vLower.includes('car') || vLower.includes('sedan') || vLower.includes('van');

  let match: RegExpExecArray | null = null;
  if ((match = /^([A-Z]{2})(\d{5})$/.exec(compact))) {
    // 2 letters + 5 digits (standard 7-char PH motorcycle plate)
    if (isFourWheel) {
      return {
        valid: false,
        normalized: trimmed,
        error: '4-wheel vehicles use 3 letters + 4 digits (e.g., ZMB-4821) or 3 letters + 3 digits.',
      };
    }
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if ((match = /^([A-Z]{3})(\d{4})$/.exec(compact))) {
    // 3 letters + 4 digits (4-wheel / transitional)
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if ((match = /^([A-Z]{3})(\d{3})$/.exec(compact))) {
    // 3 letters + 3 digits (older / transitional MC & 4-wheel)
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if ((match = /^(\d{3})([A-Z]{3})$/.exec(compact))) {
    // 3 digits + 3 letters (transitional MC)
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if ((match = /^([A-Z]{2})(\d{4})$/.exec(compact))) {
    // 2 letters + 4 digits (older MC)
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if ((match = /^(\d{4})([A-Z]{2})$/.exec(compact))) {
    // 4 digits + 2 letters (legacy MC)
    return { valid: true, normalized: `${match[1]}-${match[2]}`, error: null };
  }
  if (
    /^([A-Z]\d{4}[A-Z])$/.test(compact) ||
    /^([A-Z]\d{3}[A-Z]{2})$/.test(compact) ||
    /^(\d{2}[A-Z]\d{3})$/.test(compact)
  ) {
    // Varied 6-char LTO MC regional letter-digit placements
    return {
      valid: true,
      normalized: `${compact.slice(0, 3)}-${compact.slice(3)}`,
      error: null,
    };
  }

  return {
    valid: false,
    normalized: trimmed,
    error:
      'Invalid PH LTO plate format. Motorcycles typically use 2 letters + 5 digits (e.g., AB-12345) or transitional 6-char formats (342-OBX, ABC-123, AB-1234).',
  };
}

/**
 * Determine which merchant IDs are approved and visible on public/resident storefronts.
 *
 * Why this helper is critical under server-side role-scoped MySQL queries:
 * - `users` is scoped per role (guests see 0 rows; residents, riders, and merchants only
 *   receive their own single row, while Admin receives all rows).
 * - `merchant_profiles` is ALREADY filtered server-side so guests/residents only ever receive
 *   approved merchants, while a pending/rejected/suspended merchant also receives their own row.
 * - Therefore:
 *   1) If a merchant's `user_id` IS present in `users` (Admin view, local preview, or a merchant
 *      viewing themselves), strictly require `user.role === 'merchant' && user.status === 'approved'`.
 *   2) If a merchant's `user_id` is NOT present in `users` (guest, resident, rider, or another
 *      merchant under live MySQL), trust the server-verified `merchant_profiles` row and include it.
 */
export function getApprovedStorefrontMerchantIds(
  merchants: Array<{ merchant_id: number; user_id: number }>,
  users: Array<{ user_id: number; role: string; status: string }>
): Set<number> {
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const approvedIds = new Set<number>();

  for (const merchant of merchants) {
    const owner = userById.get(merchant.user_id);
    if (owner) {
      if (owner.role === 'merchant' && owner.status === 'approved') {
        approvedIds.add(merchant.merchant_id);
      }
    } else {
      approvedIds.add(merchant.merchant_id);
    }
  }

  return approvedIds;
}

/**
 * Determine whether any storefront filter, sort, or search query is currently active.
 */
export function hasActiveStorefrontFilters(filters: {
  selectedCategory: number | 'all' | 'rx' | 'featured';
  selectedMerchantId: number | 'all';
  stockFilter: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'otc' | 'rx';
  searchQuery: string;
  sortBy?: 'featured' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'nearest';
}): boolean {
  return (
    filters.selectedCategory !== 'all' ||
    filters.selectedMerchantId !== 'all' ||
    filters.stockFilter !== 'all' ||
    filters.searchQuery.trim() !== '' ||
    (filters.sortBy !== undefined && filters.sortBy !== 'featured')
  );
}

/**
 * Great-circle Haversine distance in kilometers between two lat/lng coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export interface SortAndFilterProductsParams<
  TProduct extends {
    product_id: number;
    merchant_id: number;
    category_id: number;
    name: string;
    description: string;
    dosage_strength?: string;
    regular_price: number;
    stock_quantity: number;
    low_stock_threshold: number;
    requires_prescription: boolean;
    is_listed: boolean;
    is_archived?: boolean;
  }
> {
  products: TProduct[];
  approvedMerchantIds: Set<number>;
  merchantDistanceKmById?: Map<number, number>;
  merchantNameById?: Map<number, string>;
  categoryNameById?: Map<number, string>;
  searchQuery?: string;
  selectedCategory?: number | 'all' | 'rx' | 'featured';
  selectedMerchantId?: number | 'all';
  stockFilter?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'otc' | 'rx';
  sortBy?: 'featured' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'nearest';
}

/**
 * Pure, deterministic storefront product filtering and sorting supporting:
 * - Price (Lowest to Highest / Highest to Lowest)
 * - Product Name (A-Z / Z-A)
 * - Nearest Pharmacy (Haversine distance in km)
 * - Stock Availability (All / In Stock / Low Stock / Out of Stock / OTC Only / Rx Required)
 * - Product Category & Pharmacy Branch
 * Always excludes archived or unlisted products.
 */
export function sortAndFilterProducts<
  TProduct extends {
    product_id: number;
    merchant_id: number;
    category_id: number;
    name: string;
    description: string;
    dosage_strength?: string;
    regular_price: number;
    stock_quantity: number;
    low_stock_threshold: number;
    requires_prescription: boolean;
    is_listed: boolean;
    is_archived?: boolean;
  }
>(
  products: TProduct[],
  params: Omit<SortAndFilterProductsParams<TProduct>, 'products'>
): TProduct[] {
  const q = (params.searchQuery || '').trim().toLowerCase();
  const selectedCategory = params.selectedCategory ?? 'all';
  const selectedMerchantId = params.selectedMerchantId ?? 'all';
  const stockFilter = params.stockFilter ?? 'all';
  const sortBy = params.sortBy ?? 'featured';

  const filtered = products.filter((p) => {
    if (!p.is_listed || p.is_archived) return false;
    if (!params.approvedMerchantIds.has(p.merchant_id)) return false;

    if (selectedCategory === 'rx' && !p.requires_prescription) return false;
    if (selectedCategory === 'featured' && p.stock_quantity <= 0) return false;
    if (typeof selectedCategory === 'number' && p.category_id !== selectedCategory) {
      return false;
    }

    if (selectedMerchantId !== 'all' && p.merchant_id !== selectedMerchantId) {
      return false;
    }

    if (stockFilter === 'in_stock' && p.stock_quantity <= 0) return false;
    if (
      stockFilter === 'low_stock' &&
      !(p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold)
    ) {
      return false;
    }
    if (stockFilter === 'out_of_stock' && p.stock_quantity > 0) return false;
    if (stockFilter === 'otc' && p.requires_prescription) return false;
    if (stockFilter === 'rx' && !p.requires_prescription) return false;

    if (q) {
      const shopName = (params.merchantNameById?.get(p.merchant_id) || '').toLowerCase();
      const catName = (params.categoryNameById?.get(p.category_id) || '').toLowerCase();
      const hay =
        `${p.name} ${p.description} ${p.dosage_strength || ''} ${shopName} ${catName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  switch (sortBy) {
    case 'price_asc':
      sorted.sort((a, b) => a.regular_price - b.regular_price || a.name.localeCompare(b.name));
      break;
    case 'price_desc':
      sorted.sort((a, b) => b.regular_price - a.regular_price || a.name.localeCompare(b.name));
      break;
    case 'name_asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name_desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'nearest':
      sorted.sort((a, b) => {
        const distA = params.merchantDistanceKmById?.get(a.merchant_id) ?? Number.POSITIVE_INFINITY;
        const distB = params.merchantDistanceKmById?.get(b.merchant_id) ?? Number.POSITIVE_INFINITY;
        if (distA !== distB) return distA - distB;
        return a.name.localeCompare(b.name);
      });
      break;
    case 'featured':
    default:
      sorted.sort((a, b) => {
        const aInStock = a.stock_quantity > 0 ? 1 : 0;
        const bInStock = b.stock_quantity > 0 ? 1 : 0;
        if (aInStock !== bInStock) return bInStock - aInStock;
        return a.name.localeCompare(b.name);
      });
      break;
  }

  return sorted;
}

/**
 * Return up to `limit` (default 10) non-archived products with the lowest stock quantity,
 * ordered ascending by stock_quantity, then alphabetically by name.
 */
export function getLowestStockProducts<
  TProduct extends {
    product_id: number;
    name: string;
    stock_quantity: number;
    low_stock_threshold: number;
    is_archived?: boolean;
  }
>(products: TProduct[], limit = 10): TProduct[] {
  return [...products]
    .filter((p) => !p.is_archived)
    .sort((a, b) => a.stock_quantity - b.stock_quantity || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, limit));
}

/**
 * Display-friendly merchant verification status label mapping DB `'approved'` -> `'Verified'`.
 */
export function formatMerchantStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Verified';
    case 'pending':
      return 'Pending';
    case 'rejected':
      return 'Rejected';
    case 'suspended':
      return 'Suspended';
    default:
      return status;
  }
}

const MAX_VERIFICATION_DOC_BYTES = 10 * 1024 * 1024;
const ALLOWED_VERIFICATION_DOC_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/**
 * Validate merchant Business Permit or Government-Issued ID upload (JPG, PNG, WebP, or PDF up to 10 MB).
 */
export function validateVerificationDocumentFile(
  file: { name: string; type: string; size: number } | null,
  docLabel = 'Verification document'
): { valid: boolean; error: string | null } {
  if (!file) {
    return { valid: false, error: `${docLabel} is required.` };
  }
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const validExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);
  if (!ALLOWED_VERIFICATION_DOC_MIMES.has(mime) && !validExt) {
    return {
      valid: false,
      error: `${docLabel} must be a JPG, PNG, WebP, or PDF file.`,
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: `${docLabel} file appears to be empty.` };
  }
  if (file.size > MAX_VERIFICATION_DOC_BYTES) {
    return {
      valid: false,
      error: `${docLabel} exceeds the 10 MB maximum file size limit.`,
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate that a Delivery Rider registration includes both a Driver's License ID
 * and a Vehicle Registration Document (OR/CR or proof of registration).
 */
export function validateRiderVerificationDocs(docs: {
  driver_license_url?: string | null;
  vehicle_registration_url?: string | null;
}): { valid: boolean; error: string | null } {
  if (!String(docs.driver_license_url || '').trim()) {
    return {
      valid: false,
      error: "Please upload a valid Driver's License / Government ID for Admin verification.",
    };
  }
  if (!String(docs.vehicle_registration_url || '').trim()) {
    return {
      valid: false,
      error: 'Please upload your Vehicle Registration Document (LTO OR/CR) for Admin verification.',
    };
  }
  return { valid: true, error: null };
}

export interface PharmacyRatingBreakdown {
  average: number;
  count: number;
  anonymousCount: number;
  namedCount: number;
  countsByStar: Record<1 | 2 | 3 | 4 | 5, number>;
  topTags: Array<{ tag: string; count: number }>;
}

/**
 * Compute full storefront rating breakdown (average, 5-to-1 star distribution,
 * anonymous vs named reviewer counts, and top feedback tags) across visible reviews only.
 */
export function computePharmacyRatingBreakdown(
  reviews: PharmacyReview[],
  merchantId: number
): PharmacyRatingBreakdown {
  const countsByStar: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const visible = reviews.filter((r) => r.merchant_id === merchantId && r.status === 'visible');
  if (visible.length === 0) {
    return {
      average: 0,
      count: 0,
      anonymousCount: 0,
      namedCount: 0,
      countsByStar,
      topTags: [],
    };
  }

  let total = 0;
  let anonymousCount = 0;
  let namedCount = 0;
  const tagCounts = new Map<string, number>();

  for (const r of visible) {
    total += r.rating;
    const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    countsByStar[star] += 1;
    if (r.is_anonymous) {
      anonymousCount += 1;
    } else {
      namedCount += 1;
    }
    for (const rawTag of r.tags || []) {
      const tag = rawTag.trim();
      if (!tag) continue;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 6);

  return {
    average: Number((total / visible.length).toFixed(1)),
    count: visible.length,
    anonymousCount,
    namedCount,
    countsByStar,
    topTags,
  };
}

export interface StorefrontReviewEntry {
  review: PharmacyReview;
  reviewerName: string;
  isAnonymous: boolean;
}

/**
 * Build privacy-safe, sorted storefront review entries for a given pharmacy.
 * Supports filtering by anonymity ('all' | 'anonymous' | 'named'), exact star rating, or replied-only.
 */
export function buildPharmacyStorefrontReviews(
  reviews: PharmacyReview[],
  users: Array<Pick<UserAccount, 'user_id' | 'first_name' | 'last_name'>>,
  merchantId: number,
  options?: {
    anonymity?: 'all' | 'anonymous' | 'named';
    starFilter?: 'all' | 1 | 2 | 3 | 4 | 5;
    withReplyOnly?: boolean;
  }
): StorefrontReviewEntry[] {
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const anonymity = options?.anonymity ?? 'all';
  const starFilter = options?.starFilter ?? 'all';
  const withReplyOnly = Boolean(options?.withReplyOnly);

  return reviews
    .filter((r) => r.merchant_id === merchantId && r.status === 'visible')
    .filter((r) => {
      if (anonymity === 'anonymous' && !r.is_anonymous) return false;
      if (anonymity === 'named' && r.is_anonymous) return false;
      if (starFilter !== 'all' && Math.round(r.rating) !== starFilter) return false;
      if (withReplyOnly && !r.merchant_reply?.trim()) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((review) => {
      const author = review.resident_id ? userById.get(review.resident_id) : undefined;
      const reviewerName = review.is_anonymous
        ? 'Verified Resident (Anonymous)'
        : review.reviewer_display_name?.trim() || formatReviewerDisplayName(author, false);
      return {
        review,
        reviewerName,
        isAnonymous: review.is_anonymous,
      };
    });
}

export interface PharmacyWeeklyScheduleRow {
  dayOfWeek: number;
  dayName: string;
  shortName: string;
  hoursLabel: string;
  isClosed: boolean;
  isToday: boolean;
}

/**
 * Build a deterministic 7-day Asia/Manila weekly schedule table for a pharmacy storefront.
 */
export function buildPharmacyWeeklySchedule(
  hours: MerchantHourRow[],
  is24Hours: boolean,
  isTemporarilyClosed: boolean,
  now: Date = new Date()
): PharmacyWeeklyScheduleRow[] {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const manilaDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayDow = manilaDate.getUTCDay();

  return dayNames.map((dayName, dayOfWeek) => {
    const row = hours.find((h) => h.day_of_week === dayOfWeek);
    if (isTemporarilyClosed) {
      return {
        dayOfWeek,
        dayName,
        shortName: shortNames[dayOfWeek],
        hoursLabel: 'Temporarily Closed',
        isClosed: true,
        isToday: dayOfWeek === todayDow,
      };
    }
    if (is24Hours) {
      return {
        dayOfWeek,
        dayName,
        shortName: shortNames[dayOfWeek],
        hoursLabel: 'Open 24 Hours',
        isClosed: false,
        isToday: dayOfWeek === todayDow,
      };
    }
    if (!row || row.is_closed) {
      return {
        dayOfWeek,
        dayName,
        shortName: shortNames[dayOfWeek],
        hoursLabel: 'Closed',
        isClosed: true,
        isToday: dayOfWeek === todayDow,
      };
    }
    return {
      dayOfWeek,
      dayName,
      shortName: shortNames[dayOfWeek],
      hoursLabel: `${row.opens_at} – ${row.closes_at}`,
      isClosed: false,
      isToday: dayOfWeek === todayDow,
    };
  });
}

const SAFE_DATA_URI_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,',
  'data:application/pdf;base64,',
];

/**
 * Validate that an image or document URL is safe to render in `<img src>` or `<a href>`
 * (allows relative app media paths, blob URLs, https URLs, and safe raster/PDF data URIs;
 * blocks javascript:, vbscript:, data:text/html, and data:image/svg+xml).
 */
export function isSafeImageOrDocUrl(rawUrl: string | null | undefined): boolean {
  const url = String(rawUrl || '').trim();
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('/assets/') || lower.startsWith('/uploads/') || lower.startsWith('/api/')) {
    return !lower.includes('..');
  }
  if (lower.startsWith('blob:')) {
    return true;
  }
  if (SAFE_DATA_URI_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate that an external redirect URL uses HTTPS with a valid hostname.
 */
export function isSafeHttpsUrl(rawUrl: string | null | undefined): boolean {
  const url = String(rawUrl || '').trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export const ORDER_STATUS_VALUES = [
  'awaiting_prescription_review',
  'pending',
  'placed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

/**
 * Enforce order lifecycle transitions and role-level authorization rules.
 */
export function canTransitionOrderStatus(
  currentStatus: string,
  nextStatus: string,
  actorRole: UserRole | string,
  options?: {
    prescriptionStatus?: string | null;
    isAssignedRider?: boolean;
    canManageDispatch?: boolean;
  }
): { allowed: boolean; reason: string | null } {
  if (!ORDER_STATUS_VALUES.includes(nextStatus as OrderStatusValue)) {
    return { allowed: false, reason: 'Invalid target order status.' };
  }
  if (currentStatus === 'delivered' || currentStatus === 'cancelled') {
    return { allowed: false, reason: `Cannot transition order from terminal status "${currentStatus}".` };
  }
  if (currentStatus === nextStatus) {
    return { allowed: true, reason: null };
  }

  const isAdminOrDispatch = actorRole === 'admin' || Boolean(options?.canManageDispatch);

  if (actorRole === 'resident') {
    if (nextStatus !== 'cancelled') {
      return { allowed: false, reason: 'Residents cannot manually advance order fulfillment statuses.' };
    }
    if (
      currentStatus !== 'placed' &&
      currentStatus !== 'pending' &&
      currentStatus !== 'awaiting_prescription_review'
    ) {
      return { allowed: false, reason: 'Order can no longer be cancelled after preparation starts.' };
    }
    return { allowed: true, reason: null };
  }

  if (actorRole === 'merchant') {
    if (
      options?.prescriptionStatus &&
      options.prescriptionStatus !== 'approved' &&
      (nextStatus === 'preparing' || nextStatus === 'ready_for_pickup')
    ) {
      return { allowed: false, reason: 'Prescription must be approved before preparing this order.' };
    }
    const validMerchantNext: Record<string, string[]> = {
      awaiting_prescription_review: ['pending', 'placed', 'cancelled'],
      pending: ['placed', 'preparing', 'cancelled'],
      placed: ['preparing', 'cancelled'],
      preparing: ['ready_for_pickup', 'cancelled'],
      ready_for_pickup: ['out_for_delivery'],
    };
    const allowedList = validMerchantNext[currentStatus] || [];
    if (!allowedList.includes(nextStatus)) {
      return {
        allowed: false,
        reason: `Merchant cannot move order from "${currentStatus}" to "${nextStatus}".`,
      };
    }
    return { allowed: true, reason: null };
  }

  if (actorRole === 'rider') {
    if (!options?.isAssignedRider) {
      return { allowed: false, reason: 'Only the assigned rider can update delivery fulfillment status.' };
    }
    const validRiderNext: Record<string, string[]> = {
      ready_for_pickup: ['out_for_delivery'],
      out_for_delivery: ['delivered'],
    };
    const allowedList = validRiderNext[currentStatus] || [];
    if (!allowedList.includes(nextStatus)) {
      return {
        allowed: false,
        reason: `Rider cannot move order from "${currentStatus}" to "${nextStatus}".`,
      };
    }
    return { allowed: true, reason: null };
  }

  if (isAdminOrDispatch) {
    return { allowed: true, reason: null };
  }

  return { allowed: false, reason: 'Insufficient role permissions to update order status.' };
}

export const REPORT_STATUS_VALUES: readonly ProblemReportStatus[] = [
  'open',
  'acknowledged',
  'escalated',
  'resolved',
  'dismissed',
];

/**
 * Validate problem report status changes per role.
 */
export function validateReportStatusTransition(
  currentStatus: string,
  nextStatus: string,
  actorRole: UserRole | string,
  options?: { canManageCustomerService?: boolean; isStoreOwner?: boolean }
): { allowed: boolean; reason: string | null } {
  if (!REPORT_STATUS_VALUES.includes(nextStatus as ProblemReportStatus)) {
    return { allowed: false, reason: 'Invalid problem report status.' };
  }
  const isStaff =
    actorRole === 'admin' ||
    actorRole === 'customer_service' ||
    Boolean(options?.canManageCustomerService);

  if (isStaff) {
    return { allowed: true, reason: null };
  }

  if (options?.isStoreOwner) {
    if (currentStatus === 'escalated') {
      return {
        allowed: false,
        reason: 'Escalated disputes require Customer Service or Admin resolution.',
      };
    }
    if (nextStatus !== 'acknowledged' && nextStatus !== 'resolved') {
      return {
        allowed: false,
        reason: 'Pharmacies can only acknowledge or resolve open store reports.',
      };
    }
    return { allowed: true, reason: null };
  }

  return { allowed: false, reason: 'Insufficient permission to update problem report status.' };
}






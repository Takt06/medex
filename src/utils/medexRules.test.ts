import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEmergencyLocationScript,
  buildPharmacyStorefrontReviews,
  buildPharmacyWeeklySchedule,
  buildUniqueEmergencyRefCode,
  buildUniqueOrderCode,
  buildUniqueReceiptNumber,
  buildUniqueReportReferenceCode,
  canEditPharmacyReview,
  canTransitionOrderStatus,
  canTransitionReportStatus,
  computePharmacyRatingBreakdown,
  computePharmacyRatingSummary,
  computeRiderRatingStats,
  findDuplicateOpenReport,
  formatEmergencyCategoryLabel,
  formatMerchantStatusLabel,
  formatReviewerDisplayName,
  generateReportReferenceCode,
  getApprovedStorefrontMerchantIds,
  getAvailabilityStatus,
  getBarangayCenterCoords,
  getLowestStockProducts,
  getMapTileConfig,
  getMerchantOpenStatus,
  hasActiveStorefrontFilters,
  hasRepeatEmergencyMisuse,
  haversineDistanceKm,
  isAtLeast18,
  isCodAmountMismatch,
  isDuplicateEmergencyAlert,
  isGcashWaitingForRxApproval,
  isMobileEmergencyDevice,
  isReportOver48Hours,
  isSafeHttpsUrl,
  isSafeImageOrDocUrl,
  isStrictGmailAddress,
  isWithin7DayWindow,
  needsResidentGcashPayment,
  normalizePHPhoneNumber,
  shouldSkipSplash,
  sortAndFilterProducts,
  validateAndNormalizePHPlateNumber,
  validateAndNormalizePrcLicense,
  validateCartItemLimit,
  validateCommentPrivacy,
  validateOlongapoCoordinates,
  getPasswordRequirementChecks,
  validatePasswordStrength,
  validatePersonName,
  validateRegularPrice,
  validateReportStatusTransition,
  validateRiderRatingInput,
  validateRiderVerificationDocs,
  validateSignInEmail,
  validateSignupEmail,
  validateStoreReviewInput,
  validateVerificationDocumentFile,
  wrapSlideIndex,
} from './medexRules';
import { validateMedicineImageFile } from './imageUpload';
import type { DeliveryRating, EmergencyAlert, PharmacyReview, ProblemReport, Product } from '../types/medex';

test('normalizePHPhoneNumber normalizes valid PH numbers and rejects invalid ones', () => {
  assert.equal(normalizePHPhoneNumber('09171234567'), '+639171234567');
  assert.equal(normalizePHPhoneNumber('+63 917-123-4567'), '+639171234567');
  assert.equal(normalizePHPhoneNumber('639171234567'), '+639171234567');
  assert.equal(normalizePHPhoneNumber('9171234567'), '+639171234567');
  assert.equal(normalizePHPhoneNumber('12345'), null);
});

test('isAtLeast18 enforces 18+ age rule accurately', () => {
  const refDate = new Date('2026-11-13T00:00:00Z');
  assert.equal(isAtLeast18('2008-11-13', refDate), true);
  assert.equal(isAtLeast18('2008-11-14', refDate), false);
  assert.equal(isAtLeast18('1995-05-01', refDate), true);
});

test('validateRegularPrice enforces positive product pricing', () => {
  assert.equal(validateRegularPrice(68).valid, true);
  assert.equal(validateRegularPrice(0).valid, false);
  assert.equal(validateRegularPrice(-10).valid, false);
});

test('getAvailabilityStatus classifies stock accurately', () => {
  assert.equal(getAvailabilityStatus(0, 10), 'Out of Stock');
  assert.equal(getAvailabilityStatus(7, 10), 'Low Stock');
  assert.equal(getAvailabilityStatus(25, 10), 'Available');
});

test('getMerchantOpenStatus evaluates 24h, temporarily closed, and Asia/Manila schedules', () => {
  // 2026-11-13 02:00 UTC == 10:00 Asia/Manila (Friday = day 5)
  const manila10am = new Date('2026-11-13T02:00:00Z');
  const hours = [
    { hours_id: 1, merchant_id: 1, day_of_week: 5, opens_at: '08:00', closes_at: '20:00', is_closed: false },
  ];
  assert.equal(getMerchantOpenStatus({ is_24_hours: false, is_temporarily_closed: false }, hours, manila10am).isOpen, true);
  assert.equal(getMerchantOpenStatus({ is_24_hours: false, is_temporarily_closed: true }, hours, manila10am).isOpen, false);
  assert.equal(getMerchantOpenStatus({ is_24_hours: true, is_temporarily_closed: false }, hours, manila10am).isOpen, true);
});

test('hasRepeatEmergencyMisuse & isDuplicateEmergencyAlert evaluate unified 911 alerts cleanly', () => {
  const now = new Date('2026-11-13T08:00:00Z');
  const alerts: EmergencyAlert[] = [
    {
      alert_id: 1,
      reference_code: 'EMG-1',
      idempotency_key: 'k1',
      user_id: 101,
      category: '911_general',
      address_id: 1,
      address_snapshot: 'Test',
      barangay_name: 'East Bajac-Bajac',
      latitude: 14.83,
      longitude: 120.28,
      status: 'verified',
      created_at: '2026-11-13T07:59:30Z',
      verification: {
        verification_id: 1,
        alert_id: 1,
        decision: 'genuine',
        verified_at: '2026-11-13T07:59:45Z',
        verified_by_id: 401,
        verified_by_name: 'Admin',
        notes: 'Verified',
      },
    },
    {
      alert_id: 2,
      reference_code: 'EMG-2',
      idempotency_key: 'k2',
      user_id: 102,
      category: '911_general',
      address_id: 2,
      address_snapshot: 'Test 2',
      barangay_name: 'East Tapinac',
      latitude: 14.82,
      longitude: 120.28,
      status: 'verified',
      created_at: '2026-11-10T08:00:00Z',
      verification: {
        verification_id: 2,
        alert_id: 2,
        decision: 'false_alarm',
        verified_at: '2026-11-10T08:10:00Z',
        verified_by_id: 401,
        verified_by_name: 'Admin',
        notes: 'False',
      },
    },
    {
      alert_id: 3,
      reference_code: 'EMG-3',
      idempotency_key: 'k3',
      user_id: 102,
      category: '911_general',
      address_id: 2,
      address_snapshot: 'Test 2',
      barangay_name: 'East Tapinac',
      latitude: 14.82,
      longitude: 120.28,
      status: 'verified',
      created_at: '2026-11-11T08:00:00Z',
      verification: {
        verification_id: 3,
        alert_id: 3,
        decision: 'accidental_press',
        verified_at: '2026-11-11T08:10:00Z',
        verified_by_id: 401,
        verified_by_name: 'Admin',
        notes: 'Accidental',
      },
    },
    {
      alert_id: 4,
      reference_code: 'EMG-4',
      idempotency_key: 'k4',
      user_id: 102,
      category: '911_general',
      address_id: 2,
      address_snapshot: 'Test 2',
      barangay_name: 'East Tapinac',
      latitude: 14.82,
      longitude: 120.28,
      status: 'verified',
      created_at: '2026-11-12T08:00:00Z',
      verification: {
        verification_id: 4,
        alert_id: 4,
        decision: 'false_alarm',
        verified_at: '2026-11-12T08:10:00Z',
        verified_by_id: 401,
        verified_by_name: 'Admin',
        notes: 'False',
      },
    },
  ];

  assert.equal(hasRepeatEmergencyMisuse(alerts, 102, now), true);
  assert.equal(hasRepeatEmergencyMisuse(alerts, 101, now), false);
  assert.ok(isDuplicateEmergencyAlert(alerts, 101, now));
  assert.equal(isDuplicateEmergencyAlert(alerts, 102, now), null);
});

test('911 emergency helpers format labels, detect mobile vs desktop, and build copy script', () => {
  assert.equal(formatEmergencyCategoryLabel('911_general'), '911 Emergency');
  assert.equal(formatEmergencyCategoryLabel('medical'), '911 Emergency (MEDICAL)');

  assert.equal(
    isMobileEmergencyDevice({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      hasCoarsePointer: true,
      viewportWidth: 390,
    }),
    true
  );
  assert.equal(
    isMobileEmergencyDevice({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      hasCoarsePointer: false,
      viewportWidth: 1440,
    }),
    false
  );

  const script = buildEmergencyLocationScript({
    callerName: 'Claire Santos',
    phone: '+639175550101',
    addressSnapshot: '18 18th Street, Brgy. East Bajac-Bajac, Olongapo City',
    landmark: 'Beside Barangay Hall',
    latitude: 14.8364,
    longitude: 120.2846,
    referenceCode: 'MDX-EMG-20261118-02',
  });
  assert.match(script, /MDX-EMG-20261118-02/);
  assert.match(script, /Claire Santos/);
  assert.match(script, /East Bajac-Bajac, Olongapo City/);
  assert.match(script, /14\.83640, 120\.28460/);
});

test('validateCommentPrivacy blocks phone numbers, emails, addresses, Rx codes, and HTML', () => {
  assert.equal(validateCommentPrivacy('Fast service and sealed bottle.', 500).valid, true);
  assert.equal(validateCommentPrivacy('Call me at 09171234567', 500).valid, false);
  assert.equal(validateCommentPrivacy('Email claire@medex.ph', 500).valid, false);
  assert.equal(validateCommentPrivacy('Deliver to 18th street brgy east', 500).valid, false);
  assert.equal(validateCommentPrivacy('Prescription PRC-0094821 attached', 500).valid, false);
  assert.equal(validateCommentPrivacy('<script>alert(1)</script>', 500).valid, false);
  assert.equal(validateCommentPrivacy('a'.repeat(501), 500).valid, false);
});

test('validateStoreReviewInput enforces tag/comment requirement on 1-2 stars and privacy check', () => {
  assert.equal(validateStoreReviewInput({ stars: 5, tags: [], comment: '' }).valid, true);
  assert.equal(validateStoreReviewInput({ stars: 2, tags: [], comment: '' }).valid, false);
  assert.equal(validateStoreReviewInput({ stars: 2, tags: ['Wrong item'], comment: '' }).valid, true);
  assert.equal(validateStoreReviewInput({ stars: 1, tags: [], comment: 'Box arrived crushed.' }).valid, true);
});

test('validateRiderRatingInput validates 1-5 stars and optional comment PII', () => {
  assert.equal(validateRiderRatingInput({ stars: 5, comment: '' }).valid, true);
  assert.equal(validateRiderRatingInput({ stars: 0, comment: '' }).valid, false);
  assert.equal(validateRiderRatingInput({ stars: 4, comment: 'Call 09175550101 thanks' }).valid, false);
});

test('7-day delivery window and 24-hour edit window calculate accurately', () => {
  const now = new Date('2026-11-17T10:00:00Z');
  assert.equal(isWithin7DayWindow('2026-11-15T10:00:00Z', now).allowed, true);
  assert.equal(isWithin7DayWindow('2026-11-15T10:00:00Z', now).daysRemaining, 5);
  assert.equal(isWithin7DayWindow('2026-11-01T10:00:00Z', now).allowed, false);

  assert.equal(canEditPharmacyReview('2026-11-17T02:00:00Z', now), true);
  assert.equal(canEditPharmacyReview('2026-11-16T08:00:00Z', now), false);
});

test('computePharmacyRatingSummary excludes hidden reviews and computeRiderRatingStats computes live breakdown', () => {
  const reviews: PharmacyReview[] = [
    {
      review_id: 1,
      order_id: 1,
      resident_id: 101,
      merchant_id: 201,
      rating: 5,
      tags: ['Well packed'],
      comment: 'Great',
      is_anonymous: true,
      status: 'visible',
      idempotency_key: 'r1',
      created_at: '2026-11-15T00:00:00Z',
      updated_at: '2026-11-15T00:00:00Z',
    },
    {
      review_id: 2,
      order_id: 2,
      resident_id: 102,
      merchant_id: 201,
      rating: 1,
      tags: ['Wrong item'],
      comment: 'Hidden spam',
      is_anonymous: false,
      status: 'hidden',
      moderation_reason: 'Off-topic',
      idempotency_key: 'r2',
      created_at: '2026-11-15T00:00:00Z',
      updated_at: '2026-11-15T00:00:00Z',
    },
  ];
  const summary = computePharmacyRatingSummary(reviews, 201);
  assert.equal(summary.average, 5.0);
  assert.equal(summary.count, 1);

  const riderRatings: DeliveryRating[] = [
    {
      rating_id: 1,
      delivery_id: 10,
      order_id: 10,
      resident_id: 101,
      rider_id: 301,
      stars: 5,
      tags: ['Fast delivery'],
      comment: 'Very quick',
      is_anonymous: true,
      created_at: '2026-11-15T00:00:00Z',
    },
    {
      rating_id: 2,
      delivery_id: 11,
      order_id: 11,
      resident_id: 102,
      rider_id: 301,
      stars: 4,
      tags: ['Polite courier'],
      comment: '',
      is_anonymous: false,
      created_at: '2026-11-15T00:00:00Z',
    },
  ];
  const riderStats = computeRiderRatingStats(riderRatings, 301);
  assert.equal(riderStats.average, 4.5);
  assert.equal(riderStats.count, 2);
  assert.equal(riderStats.breakdown[5], 1);
  assert.equal(riderStats.breakdown[4], 1);
});

test('canTransitionReportStatus enforces forward-only workflow and admin-only dismiss', () => {
  assert.equal(canTransitionReportStatus('open', 'acknowledged', 'merchant'), true);
  assert.equal(canTransitionReportStatus('open', 'resolved', 'merchant'), true);
  assert.equal(canTransitionReportStatus('open', 'dismissed', 'merchant'), false);
  assert.equal(canTransitionReportStatus('open', 'dismissed', 'admin'), true);
  assert.equal(canTransitionReportStatus('acknowledged', 'open', 'admin'), false);
  assert.equal(canTransitionReportStatus('resolved', 'acknowledged', 'admin'), false);
});

test('findDuplicateOpenReport prevents duplicate open reports and formatReviewerDisplayName masks PII', () => {
  const reports: ProblemReport[] = [
    {
      report_id: 1,
      reference_code: 'PR-261115-00001',
      idempotency_key: 'dup1',
      user_id: 101,
      source: 'locator',
      order_id: null,
      merchant_id: 202,
      product_id: 2,
      category_code: 'wrong_stock',
      category_label: 'Wrong stock shown',
      description: 'Store shelf empty',
      is_anonymous: true,
      status: 'open',
      created_at: '2026-11-14T00:00:00Z',
      updated_at: '2026-11-14T00:00:00Z',
      status_history: [],
    },
  ];
  assert.ok(
    findDuplicateOpenReport(reports, {
      user_id: 101,
      source: 'locator',
      order_id: null,
      merchant_id: 202,
      product_id: 2,
      category_code: 'wrong_stock',
    })
  );
  assert.equal(
    findDuplicateOpenReport(reports, {
      user_id: 101,
      source: 'locator',
      order_id: null,
      merchant_id: 202,
      product_id: 2,
      category_code: 'wrong_price',
    }),
    null
  );

  assert.equal(
    formatReviewerDisplayName({ first_name: 'Claire', last_name: 'Santos' }, true),
    'Verified Resident (Anonymous)'
  );
  assert.equal(
    formatReviewerDisplayName({ first_name: 'Claire', last_name: 'Santos' }, false),
    'Claire S.'
  );
  assert.equal(
    isReportOver48Hours({ status: 'open', created_at: '2026-11-14T00:00:00Z' }, new Date('2026-11-17T01:00:00Z')),
    true
  );
  assert.equal(
    generateReportReferenceCode(7, new Date('2026-11-17T00:00:00Z')),
    'PR-261117-00007'
  );
});

test('isCodAmountMismatch flags differences accurately', () => {
  assert.equal(isCodAmountMismatch(185.5, 185.5), false);
  assert.equal(isCodAmountMismatch(185.5, 180.0), true);
});

test('wrapSlideIndex handles forward and backward circular slide navigation', () => {
  assert.equal(wrapSlideIndex(0, -1, 4), 3);
  assert.equal(wrapSlideIndex(3, 1, 4), 0);
  assert.equal(wrapSlideIndex(1, 2, 4), 3);
  assert.equal(wrapSlideIndex(0, 1, 0), 0);
});

test('validateMedicineImageFile accepts valid medicine photos and rejects oversized or invalid types', () => {
  assert.equal(validateMedicineImageFile({ name: 'biogesic.jpg', size: 240_000, type: 'image/jpeg' }).valid, true);
  assert.equal(validateMedicineImageFile({ name: 'bottle.webp', size: 120_000, type: 'image/webp' }).valid, true);
  assert.equal(validateMedicineImageFile({ name: 'empty.png', size: 0, type: 'image/png' }).valid, false);
  assert.equal(validateMedicineImageFile({ name: 'huge.png', size: 10 * 1024 * 1024, type: 'image/png' }).valid, false);
  assert.equal(validateMedicineImageFile({ name: 'script.exe', size: 1024, type: 'application/octet-stream' }).valid, false);
});

test('shouldSkipSplash detects ?autostart=1 cleanly across query strings', () => {
  assert.equal(shouldSkipSplash('?autostart=1'), true);
  assert.equal(shouldSkipSplash('?tab=store&autostart=1'), true);
  assert.equal(shouldSkipSplash('?autostart=0'), false);
  assert.equal(shouldSkipSplash(''), false);
});

test('needsResidentGcashPayment & isGcashWaitingForRxApproval enforce Rx approval before GCash charge', () => {
  // Pending Rx review -> holds GCash payment, button hidden
  const pendingRx = {
    status: 'awaiting_prescription_review',
    payment: { method: 'GCash', status: 'pending' },
    prescription: { status: 'pending_review' },
  };
  assert.equal(needsResidentGcashPayment(pendingRx), false);
  assert.equal(isGcashWaitingForRxApproval(pendingRx), true);

  // Rejected Rx -> still blocked until re-upload & approval
  const rejectedRx = {
    status: 'awaiting_prescription_review',
    payment: { method: 'GCash', status: 'pending' },
    prescription: { status: 'rejected' },
  };
  assert.equal(needsResidentGcashPayment(rejectedRx), false);
  assert.equal(isGcashWaitingForRxApproval(rejectedRx), true);

  // Approved Rx + pending GCash -> Pay via GCash button unlocks
  const approvedRxPendingPay = {
    status: 'pending',
    payment: { method: 'GCash', status: 'pending' },
    prescription: { status: 'approved' },
  };
  assert.equal(needsResidentGcashPayment(approvedRxPendingPay), true);
  assert.equal(isGcashWaitingForRxApproval(approvedRxPendingPay), false);

  // Paid GCash -> completed
  const paidOrder = {
    status: 'placed',
    payment: { method: 'GCash', status: 'paid' },
    prescription: { status: 'approved' },
  };
  assert.equal(needsResidentGcashPayment(paidOrder), false);

  // Failed OTC GCash -> Retry unlocks
  const failedOtc = {
    status: 'pending',
    payment: { method: 'GCash', status: 'failed' },
  };
  assert.equal(needsResidentGcashPayment(failedOtc), true);

  // COD order -> never prompts GCash
  const codOrder = {
    status: 'placed',
    payment: { method: 'COD', status: 'pending' },
    prescription: { status: 'approved' },
  };
  assert.equal(needsResidentGcashPayment(codOrder), false);
});

test('getBarangayCenterCoords and validateOlongapoCoordinates resolve deterministic Olongapo coordinates', () => {
  const barretto = getBarangayCenterCoords(5);
  assert.equal(barretto.lat, 14.8492);
  assert.equal(barretto.lng, 120.2647);

  const kalaklanByName = getBarangayCenterCoords(99, [{ barangay_id: 99, name: 'Kalaklan' }]);
  assert.equal(kalaklanByName.lat, 14.8414);
  assert.equal(kalaklanByName.lng, 120.2738);

  const valid = validateOlongapoCoordinates(14.8412345, 120.2739876);
  assert.equal(valid.valid, true);
  assert.equal(valid.lat, 14.84123);
  assert.equal(valid.lng, 120.27399);

  const outOfBounds = validateOlongapoCoordinates(14.5995, 120.9842); // Manila
  assert.equal(outOfBounds.valid, false);
  assert.ok(outOfBounds.error);

  const invalidNan = validateOlongapoCoordinates(Number.NaN, 120.28);
  assert.equal(invalidNan.valid, false);
});

test('getMapTileConfig serves keyless ArcGIS World Street Map tiles and never volunteer OSM URLs', () => {
  const light = getMapTileConfig(false);
  const dark = getMapTileConfig(true);

  assert.match(light.url, /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Street_Map/);
  assert.match(dark.url, /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Street_Map/);
  assert.equal(light.url.includes('tile.openstreetmap.org'), false);
  assert.equal(dark.url.includes('basemaps.cartocdn.com'), false);
  assert.equal(light.maxNativeZoom, 17);
  assert.equal(dark.maxZoom, 19);
});

test('validateCartItemLimit enforces both stock quantity and per-order purchase limit', () => {
  assert.deepEqual(
    validateCartItemLimit({
      requestedQuantity: 2,
      stockQuantity: 10,
      purchaseLimit: 2,
      productName: 'Biogesic 500mg',
    }),
    { valid: true, maxAllowed: 2, error: null }
  );

  const overLimit = validateCartItemLimit({
    requestedQuantity: 3,
    stockQuantity: 10,
    purchaseLimit: 2,
    productName: 'Biogesic 500mg',
  });
  assert.equal(overLimit.valid, false);
  assert.equal(overLimit.maxAllowed, 2);
  assert.match(overLimit.error || '', /Purchase limit/);

  const overStock = validateCartItemLimit({
    requestedQuantity: 4,
    stockQuantity: 3,
    purchaseLimit: 10,
    productName: 'Amoxicillin',
  });
  assert.equal(overStock.valid, false);
  assert.equal(overStock.maxAllowed, 3);
  assert.match(overStock.error || '', /Only 3 left in stock/);

  const outOfStock = validateCartItemLimit({
    requestedQuantity: 1,
    stockQuantity: 0,
    purchaseLimit: 5,
    productName: 'Vitamin C',
  });
  assert.equal(outOfStock.valid, false);
  assert.equal(outOfStock.maxAllowed, 0);
});

test('collision-resistant reference generators follow format and produce unique codes', () => {
  const refDate = new Date('2026-11-21T03:00:00Z');
  const orderCodes = new Set(Array.from({ length: 20 }, () => buildUniqueOrderCode(refDate)));
  const receipts = new Set(Array.from({ length: 20 }, () => buildUniqueReceiptNumber(refDate)));
  const emergencies = new Set(Array.from({ length: 20 }, () => buildUniqueEmergencyRefCode(refDate)));
  const reports = new Set(Array.from({ length: 20 }, () => buildUniqueReportReferenceCode(refDate)));

  assert.equal(orderCodes.size, 20);
  assert.equal(receipts.size, 20);
  assert.equal(emergencies.size, 20);
  assert.equal(reports.size, 20);

  for (const c of orderCodes) assert.match(c, /^MDX-ORD-261121-[A-Z2-9]{5}$/);
  for (const r of receipts) assert.match(r, /^RCP-20261121-[A-Z2-9]{6}$/);
  for (const e of emergencies) assert.match(e, /^MDX-EMG-20261121-[A-Z2-9]{5}$/);
  for (const p of reports) assert.match(p, /^PR-261121-[A-Z2-9]{5}$/);
});

test('strict @gmail.com validation blocks non-Gmail signups and allows Admin override on sign-in', () => {
  assert.equal(isStrictGmailAddress('Juan.DelaCruz@gmail.com'), true);
  assert.equal(isStrictGmailAddress('spncr.mrngstr@gmail.com'), true);
  assert.equal(isStrictGmailAddress('user@yahoo.com'), false);
  assert.equal(isStrictGmailAddress('user@gmail.com.ph'), false);
  assert.equal(isStrictGmailAddress('bad..dot@gmail.com'), false);

  assert.equal(validateSignupEmail('  Maria.Santos@GMAIL.COM ').valid, true);
  assert.equal(validateSignupEmail('  Maria.Santos@GMAIL.COM ').normalized, 'maria.santos@gmail.com');
  assert.equal(validateSignupEmail('claire@medex.ph').valid, false);
  assert.equal(validateSignupEmail('someone@outlook.com').valid, false);

  // Sign-in accepts @gmail.com OR authorized Admin account
  assert.equal(validateSignInEmail('admin@medex.ph').valid, true);
  assert.equal(validateSignInEmail('ops@olongapo.ph', { isAdminAccount: true }).valid, true);
  assert.equal(validateSignInEmail('customer@gmail.com').valid, true);
  assert.equal(validateSignInEmail('customer@yahoo.com').valid, false);
});

test('validateAndNormalizePrcLicense enforces 7-digit Philippine PRC pharmacist license numbers', () => {
  assert.deepEqual(validateAndNormalizePrcLicense('0084512'), {
    valid: true,
    normalized: 'PRC-0084512',
    error: null,
  });
  assert.deepEqual(validateAndNormalizePrcLicense('prc-rph-0114892'), {
    valid: true,
    normalized: 'PRC-0114892',
    error: null,
  });
  assert.deepEqual(validateAndNormalizePrcLicense('PRC 0094821'), {
    valid: true,
    normalized: 'PRC-0094821',
    error: null,
  });

  // Invalid lengths or dummy values
  assert.equal(validateAndNormalizePrcLicense('123456').valid, false);
  assert.equal(validateAndNormalizePrcLicense('12345678').valid, false);
  assert.equal(validateAndNormalizePrcLicense('PRC-PENDING').valid, false);
  assert.equal(validateAndNormalizePrcLicense('0000000').valid, false);
});

test('validateAndNormalizePHPlateNumber enforces Philippine LTO motorcycle and car plate formats', () => {
  // Standard 2 letters + 5 digits motorcycle
  assert.deepEqual(validateAndNormalizePHPlateNumber('ab12345', 'Motorcycle'), {
    valid: true,
    normalized: 'AB-12345',
    error: null,
  });
  // Transitional 3+3 motorcycle formats
  assert.equal(validateAndNormalizePHPlateNumber('342-OBX', 'Motorcycle').valid, true);
  assert.equal(validateAndNormalizePHPlateNumber('ABC 123', 'Motorcycle').normalized, 'ABC-123');
  // Legacy 2+4 / 4+2 / varied 6-char LTO formats
  assert.equal(validateAndNormalizePHPlateNumber('AB1234', 'Motorcycle').valid, true);
  assert.equal(validateAndNormalizePHPlateNumber('1234AB', 'Motorcycle').valid, true);
  assert.equal(validateAndNormalizePHPlateNumber('A123BC', 'Motorcycle').valid, true);
  assert.equal(validateAndNormalizePHPlateNumber('A1234B', 'Motorcycle').valid, true);
  // 4-wheel standard
  assert.equal(validateAndNormalizePHPlateNumber('ZMB-4821', 'Car / Sedan').valid, true);

  // Invalid / placeholder / all-zero plates rejected
  assert.equal(validateAndNormalizePHPlateNumber('PENDING', 'Motorcycle').valid, false);
  assert.equal(validateAndNormalizePHPlateNumber('AB-00000', 'Motorcycle').valid, false);
  assert.equal(validateAndNormalizePHPlateNumber('12345', 'Motorcycle').valid, false);
  assert.equal(validateAndNormalizePHPlateNumber('ABCD-1234', 'Motorcycle').valid, false);
  assert.equal(validateAndNormalizePHPlateNumber('AB-12345', 'Car / Sedan').valid, false);
});

test('validatePersonName accepts letters/spaces only and rejects digits or special characters', () => {
  assert.deepEqual(validatePersonName('  Juan   Carlos ', 'First Name'), {
    valid: true,
    normalized: 'Juan Carlos',
    error: null,
  });
  assert.equal(validatePersonName('Peña', 'Last Name').valid, true);
  assert.equal(validatePersonName('Dela Cruz', 'Last Name').valid, true);

  assert.equal(validatePersonName('Juan123', 'First Name').valid, false);
  assert.equal(validatePersonName('Juan@', 'First Name').valid, false);
  assert.equal(validatePersonName('Maria.Santos', 'First Name').valid, false);
  assert.equal(validatePersonName('Dela-Cruz', 'Last Name').valid, false);
  assert.equal(validatePersonName('12345', 'First Name').valid, false);
  assert.equal(validatePersonName('A', 'First Name').valid, false);
});

test('validatePasswordStrength enforces 8+ chars, uppercase, lowercase, number, and special character', () => {
  assert.equal(validatePasswordStrength('').valid, false);
  assert.equal(validatePasswordStrength('Ab1!xyz').valid, false); // < 8 chars
  assert.equal(validatePasswordStrength('12345678').valid, false); // numbers only
  assert.equal(validatePasswordStrength('StrongPass99').valid, false); // missing special char
  assert.equal(validatePasswordStrength('strongpass99!').valid, false); // missing uppercase
  assert.equal(validatePasswordStrength('STRONGPASS99!').valid, false); // missing lowercase
  assert.equal(validatePasswordStrength('StrongPass!').valid, false); // missing number
  assert.equal(validatePasswordStrength('Strong Pass99').valid, false); // space is not a special char

  assert.equal(validatePasswordStrength('MedEx@2026').valid, true);
  assert.equal(validatePasswordStrength('Care#99Ph!').valid, true);

  const partial = getPasswordRequirementChecks('medex2026');
  assert.equal(partial.minLength, true);
  assert.equal(partial.hasLowercase, true);
  assert.equal(partial.hasUppercase, false);
  assert.equal(partial.hasNumber, true);
  assert.equal(partial.hasSpecial, false);
});

test('getApprovedStorefrontMerchantIds resolves approved merchants accurately across all RLS viewer roles', () => {
  const merchants = [
    { merchant_id: 201, user_id: 201 }, // Approved pharmacy A
    { merchant_id: 202, user_id: 202 }, // Approved pharmacy B (e.g., Jeo Ong Pharmacy)
    { merchant_id: 204, user_id: 204 }, // Pending pharmacy
  ];

  // 1. Guest (unauthenticated): server-side MySQL returns only approved merchant_profiles (201, 202) and empty users []
  const guestApproved = getApprovedStorefrontMerchantIds(merchants.slice(0, 2), []);
  assert.deepEqual([...guestApproved], [201, 202]);

  // 2. Resident / Rider: users contains only their own resident row (user_id 101)
  const residentApproved = getApprovedStorefrontMerchantIds(merchants.slice(0, 2), [
    { user_id: 101, role: 'resident', status: 'approved' },
  ]);
  assert.deepEqual([...residentApproved], [201, 202]);

  // 3. Pending Merchant viewing storefront: RLS returns approved stores + self (204), users contains only self (pending)
  const pendingMerchantView = getApprovedStorefrontMerchantIds(merchants, [
    { user_id: 204, role: 'merchant', status: 'pending' },
  ]);
  assert.deepEqual([...pendingMerchantView], [201, 202]);

  // 4. Approved Merchant viewing storefront: users contains only self (approved)
  const approvedMerchantView = getApprovedStorefrontMerchantIds(merchants.slice(0, 2), [
    { user_id: 202, role: 'merchant', status: 'approved' },
  ]);
  assert.deepEqual([...approvedMerchantView], [201, 202]);

  // 5. Admin / Local preview: users contains all accounts; only approved merchants pass
  const adminView = getApprovedStorefrontMerchantIds(merchants, [
    { user_id: 201, role: 'merchant', status: 'approved' },
    { user_id: 202, role: 'merchant', status: 'approved' },
    { user_id: 204, role: 'merchant', status: 'pending' },
    { user_id: 401, role: 'admin', status: 'approved' },
  ]);
  assert.deepEqual([...adminView], [201, 202]);

  // 6. Suspended merchant whose user row is visible is excluded
  const suspendedView = getApprovedStorefrontMerchantIds(
    [{ merchant_id: 205, user_id: 205 }],
    [{ user_id: 205, role: 'merchant', status: 'suspended' }]
  );
  assert.equal(suspendedView.size, 0);
});

test('hasActiveStorefrontFilters accurately distinguishes default storefront vs filtered state', () => {
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 'all',
      stockFilter: 'all',
      searchQuery: '',
    }),
    false
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 'all',
      stockFilter: 'all',
      searchQuery: '   ',
    }),
    false
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 1,
      selectedMerchantId: 'all',
      stockFilter: 'all',
      searchQuery: '',
    }),
    true
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 202,
      stockFilter: 'all',
      searchQuery: '',
    }),
    true
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 'all',
      stockFilter: 'otc',
      searchQuery: '',
    }),
    true
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 'all',
      stockFilter: 'all',
      searchQuery: 'biogesic',
    }),
    true
  );
  assert.equal(
    hasActiveStorefrontFilters({
      selectedCategory: 'all',
      selectedMerchantId: 'all',
      stockFilter: 'all',
      sortBy: 'price_asc',
      searchQuery: '',
    }),
    true
  );
});

test('formatMerchantStatusLabel maps merchant statuses to Pending, Verified, Rejected, Suspended', () => {
  assert.equal(formatMerchantStatusLabel('pending'), 'Pending');
  assert.equal(formatMerchantStatusLabel('approved'), 'Verified');
  assert.equal(formatMerchantStatusLabel('rejected'), 'Rejected');
  assert.equal(formatMerchantStatusLabel('suspended'), 'Suspended');
});

test('validateVerificationDocumentFile accepts JPG/PNG/WEBP/PDF up to 10 MB and rejects invalid files', () => {
  assert.equal(
    validateVerificationDocumentFile({ name: 'permit.pdf', type: 'application/pdf', size: 1024 * 500 }).valid,
    true
  );
  assert.equal(
    validateVerificationDocumentFile({ name: 'gov_id.png', type: 'image/png', size: 1024 * 250 }).valid,
    true
  );
  assert.equal(
    validateVerificationDocumentFile({ name: 'doc.exe', type: 'application/octet-stream', size: 1024 }).valid,
    false
  );
  assert.equal(
    validateVerificationDocumentFile({ name: 'huge.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }).valid,
    false
  );
});

test('haversineDistanceKm calculates realistic Olongapo City distances', () => {
  assert.equal(haversineDistanceKm(14.8355, 120.2842, 14.8355, 120.2842), 0);
  const km = haversineDistanceKm(14.8315, 120.2835, 14.8442, 120.2738);
  assert.ok(km > 1.2 && km < 2.5, `Expected ~1.7 km, got ${km}`);
});

test('sortAndFilterProducts supports price, name, nearest pharmacy, stock filters, and excludes archived items', () => {
  const mkProd = (overrides: Partial<Product>): Product => ({
    product_id: 1,
    merchant_id: 201,
    category_id: 1,
    name: 'Biogesic 500mg',
    description: 'Fever relief',
    image_path: '/img.png',
    unit: '10 tablets',
    purchase_limit: 2,
    is_listed: true,
    is_archived: false,
    requires_prescription: false,
    regular_price: 55,
    stock_quantity: 20,
    low_stock_threshold: 10,
    updated_at: '2026-11-24T00:00:00Z',
    ...overrides,
  });

  const products: Product[] = [
    mkProd({ product_id: 1, merchant_id: 201, name: 'Zinc Plus', regular_price: 180, stock_quantity: 5, low_stock_threshold: 10 }),
    mkProd({ product_id: 2, merchant_id: 202, name: 'Amoxicillin 500mg', regular_price: 95, stock_quantity: 0, requires_prescription: true }),
    mkProd({ product_id: 3, merchant_id: 203, name: 'Biogesic 500mg', regular_price: 45, stock_quantity: 40 }),
    mkProd({ product_id: 4, merchant_id: 201, name: 'Archived Med', regular_price: 10, stock_quantity: 100, is_archived: true }),
  ];
  const approvedMerchantIds = new Set([201, 202, 203]);
  const merchantDistanceKmById = new Map([
    [201, 3.2],
    [202, 0.8],
    [203, 1.5],
  ]);

  const byPriceAsc = sortAndFilterProducts(products, {
    approvedMerchantIds,
    sortBy: 'price_asc',
  });
  assert.deepEqual(
    byPriceAsc.map((p) => p.product_id),
    [3, 2, 1]
  );

  const byPriceDesc = sortAndFilterProducts(products, {
    approvedMerchantIds,
    sortBy: 'price_desc',
  });
  assert.deepEqual(
    byPriceDesc.map((p) => p.product_id),
    [1, 2, 3]
  );

  const byNameAsc = sortAndFilterProducts(products, {
    approvedMerchantIds,
    sortBy: 'name_asc',
  });
  assert.deepEqual(
    byNameAsc.map((p) => p.product_id),
    [2, 3, 1]
  );

  const byNameDesc = sortAndFilterProducts(products, {
    approvedMerchantIds,
    sortBy: 'name_desc',
  });
  assert.deepEqual(
    byNameDesc.map((p) => p.product_id),
    [1, 3, 2]
  );

  const byNearest = sortAndFilterProducts(products, {
    approvedMerchantIds,
    sortBy: 'nearest',
    merchantDistanceKmById,
  });
  assert.deepEqual(
    byNearest.map((p) => p.product_id),
    [2, 3, 1]
  );

  const lowStockOnly = sortAndFilterProducts(products, {
    approvedMerchantIds,
    stockFilter: 'low_stock',
  });
  assert.deepEqual(
    lowStockOnly.map((p) => p.product_id),
    [1]
  );

  const outOfStockOnly = sortAndFilterProducts(products, {
    approvedMerchantIds,
    stockFilter: 'out_of_stock',
  });
  assert.deepEqual(
    outOfStockOnly.map((p) => p.product_id),
    [2]
  );
});

test('getLowestStockProducts returns top 10 lowest-stock non-archived products ascending', () => {
  const products: Product[] = Array.from({ length: 13 }, (_, idx) => ({
    product_id: idx + 1,
    merchant_id: 201,
    category_id: 1,
    name: `Medicine ${idx + 1}`,
    description: 'Desc',
    image_path: '/img.png',
    unit: 'box',
    purchase_limit: 2,
    is_listed: true,
    is_archived: idx === 0,
    requires_prescription: false,
    regular_price: 50,
    stock_quantity: idx === 0 ? 0 : 15 - idx,
    low_stock_threshold: 10,
    updated_at: '2026-11-24T00:00:00Z',
  }));

  const lowest = getLowestStockProducts(products, 10);
  assert.equal(lowest.length, 10);
  assert.equal(lowest.some((p) => p.is_archived), false);
  assert.equal(lowest[0].stock_quantity, 3);
  assert.equal(lowest[9].stock_quantity, 12);
});

test('validateRiderVerificationDocs enforces both driver license ID and vehicle registration document', () => {
  assert.equal(validateRiderVerificationDocs({}).valid, false);
  assert.equal(
    validateRiderVerificationDocs({
      driver_license_url: 'data:image/png;base64,abc',
      vehicle_registration_url: '',
    }).valid,
    false
  );
  assert.equal(
    validateRiderVerificationDocs({
      driver_license_url: '',
      vehicle_registration_url: 'data:application/pdf;base64,xyz',
    }).valid,
    false
  );
  assert.equal(
    validateRiderVerificationDocs({
      driver_license_url: 'data:image/png;base64,abc',
      vehicle_registration_url: 'data:image/png;base64,def',
    }).valid,
    true
  );
});

test('computePharmacyRatingBreakdown & buildPharmacyStorefrontReviews compute star counts and preserve anonymous identity', () => {
  const reviews: PharmacyReview[] = [
    {
      review_id: 1,
      order_id: 101,
      resident_id: 10,
      merchant_id: 201,
      rating: 5,
      tags: ['Well packed', 'Fast preparation'],
      comment: 'Very quick preparation.',
      is_anonymous: true,
      status: 'visible',
      idempotency_key: 'rev-1',
      created_at: '2026-11-24T08:00:00Z',
      updated_at: '2026-11-24T08:00:00Z',
    },
    {
      review_id: 2,
      order_id: 102,
      resident_id: 11,
      merchant_id: 201,
      rating: 4,
      tags: ['Well packed'],
      comment: 'Polite pharmacist.',
      is_anonymous: false,
      reviewer_display_name: 'Maria S.',
      status: 'visible',
      merchant_reply: 'Thank you for visiting our branch!',
      replied_at: '2026-11-24T10:00:00Z',
      idempotency_key: 'rev-2',
      created_at: '2026-11-24T09:00:00Z',
      updated_at: '2026-11-24T10:00:00Z',
    },
    {
      review_id: 3,
      order_id: 103,
      resident_id: 12,
      merchant_id: 201,
      rating: 1,
      tags: ['Wrong item'],
      comment: 'Hidden spam review',
      is_anonymous: true,
      status: 'hidden',
      idempotency_key: 'rev-3',
      created_at: '2026-11-24T11:00:00Z',
      updated_at: '2026-11-24T11:00:00Z',
    },
  ];

  const breakdown = computePharmacyRatingBreakdown(reviews, 201);
  assert.equal(breakdown.count, 2);
  assert.equal(breakdown.average, 4.5);
  assert.equal(breakdown.anonymousCount, 1);
  assert.equal(breakdown.namedCount, 1);
  assert.equal(breakdown.countsByStar[5], 1);
  assert.equal(breakdown.countsByStar[4], 1);
  assert.equal(breakdown.countsByStar[1], 0);
  assert.deepEqual(breakdown.topTags[0], { tag: 'Well packed', count: 2 });

  const users = [
    { user_id: 10, first_name: 'Hidden', last_name: 'Person' },
    { user_id: 11, first_name: 'Maria', last_name: 'Santos' },
  ];

  const allEntries = buildPharmacyStorefrontReviews(reviews, users, 201);
  assert.equal(allEntries.length, 2);
  // Newest first (review_id 2 before review_id 1)
  assert.equal(allEntries[0].reviewerName, 'Maria S.');
  assert.equal(allEntries[0].isAnonymous, false);
  assert.equal(allEntries[1].reviewerName, 'Verified Resident (Anonymous)');
  assert.equal(allEntries[1].isAnonymous, true);

  const anonOnly = buildPharmacyStorefrontReviews(reviews, users, 201, { anonymity: 'anonymous' });
  assert.equal(anonOnly.length, 1);
  assert.equal(anonOnly[0].review.review_id, 1);

  const repliedOnly = buildPharmacyStorefrontReviews(reviews, users, 201, { withReplyOnly: true });
  assert.equal(repliedOnly.length, 1);
  assert.equal(repliedOnly[0].review.review_id, 2);
});

test('buildPharmacyWeeklySchedule returns 7 Manila-timezone rows with today highlighted', () => {
  // 2026-11-25T10:00:00Z = 18:00 Asia/Manila (Wednesday = day 3)
  const now = new Date('2026-11-25T10:00:00Z');
  const rows = buildPharmacyWeeklySchedule(
    [
      { hours_id: 1, merchant_id: 201, day_of_week: 0, opens_at: '09:00', closes_at: '18:00', is_closed: true },
      { hours_id: 2, merchant_id: 201, day_of_week: 3, opens_at: '07:00', closes_at: '22:00', is_closed: false },
    ],
    false,
    false,
    now
  );
  assert.equal(rows.length, 7);
  assert.equal(rows[0].isClosed, true);
  assert.equal(rows[0].hoursLabel, 'Closed');
  assert.equal(rows[3].isToday, true);
  assert.equal(rows[3].hoursLabel, '07:00 – 22:00');
});

test('isSafeImageOrDocUrl and isSafeHttpsUrl block dangerous schemes and SVG/HTML payloads', () => {
  assert.equal(isSafeImageOrDocUrl('/uploads/products/med-1.png'), true);
  assert.equal(isSafeImageOrDocUrl('/assets/products/paracetamol.jpg'), true);
  assert.equal(isSafeImageOrDocUrl('/api/uploads/prescriptions/rx-1.pdf'), true);
  assert.equal(isSafeImageOrDocUrl('https://cdn.example.com/med.webp'), true);
  assert.equal(isSafeImageOrDocUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImageOrDocUrl('data:application/pdf;base64,JVBERi0='), true);

  assert.equal(isSafeImageOrDocUrl('javascript:alert(1)'), false);
  assert.equal(isSafeImageOrDocUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeImageOrDocUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeImageOrDocUrl('data:image/svg+xml;base64,PHN2Zy8+'), false);
  assert.equal(isSafeImageOrDocUrl('/uploads/../etc/passwd'), false);
  assert.equal(isSafeImageOrDocUrl('http://insecure.example.com/pic.png'), false);

  assert.equal(isSafeHttpsUrl('https://checkout.paymongo.com/cs_123'), true);
  assert.equal(isSafeHttpsUrl('http://checkout.paymongo.com/cs_123'), false);
  assert.equal(isSafeHttpsUrl('javascript:window.alert(1)'), false);
});

test('canTransitionOrderStatus enforces role and prescription lifecycle guards', () => {
  // Resident cannot skip to preparing/delivered
  assert.equal(canTransitionOrderStatus('placed', 'preparing', 'resident').allowed, false);
  assert.equal(canTransitionOrderStatus('placed', 'cancelled', 'resident').allowed, true);
  assert.equal(canTransitionOrderStatus('ready_for_pickup', 'cancelled', 'resident').allowed, false);

  // Merchant Rx gate
  assert.equal(
    canTransitionOrderStatus('awaiting_prescription_review', 'pending', 'merchant').allowed,
    true
  );
  assert.equal(
    canTransitionOrderStatus('placed', 'preparing', 'merchant', {
      prescriptionStatus: 'pending_review',
    }).allowed,
    false
  );
  assert.equal(
    canTransitionOrderStatus('placed', 'preparing', 'merchant', {
      prescriptionStatus: 'approved',
    }).allowed,
    true
  );

  // Rider requires assignment
  assert.equal(
    canTransitionOrderStatus('ready_for_pickup', 'out_for_delivery', 'rider', {
      isAssignedRider: false,
    }).allowed,
    false
  );
  assert.equal(
    canTransitionOrderStatus('ready_for_pickup', 'out_for_delivery', 'rider', {
      isAssignedRider: true,
    }).allowed,
    true
  );

  // Terminal states locked
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled', 'admin').allowed, false);
  assert.equal(canTransitionOrderStatus('cancelled', 'placed', 'admin').allowed, false);
});

test('validateReportStatusTransition blocks escalated edits by store owners and allows CS resolution', () => {
  assert.equal(
    validateReportStatusTransition('escalated', 'resolved', 'merchant', { isStoreOwner: true }).allowed,
    false
  );
  assert.equal(
    validateReportStatusTransition('open', 'acknowledged', 'merchant', { isStoreOwner: true }).allowed,
    true
  );
  assert.equal(
    validateReportStatusTransition('escalated', 'resolved', 'customer_service', {
      canManageCustomerService: true,
    }).allowed,
    true
  );
  assert.equal(validateReportStatusTransition('open', 'invalid_state', 'admin').allowed, false);
});

test('validateMedicineImageFile rejects SVG uploads to mitigate stored XSS', () => {
  const svgFile = { name: 'icon.svg', type: 'image/svg+xml', size: 512 };
  const pngFile = { name: 'photo.png', type: 'image/png', size: 2048 };
  assert.equal(validateMedicineImageFile(svgFile).valid, false);
  assert.equal(validateMedicineImageFile(pngFile).valid, true);
});




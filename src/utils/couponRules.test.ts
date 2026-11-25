import test from 'node:test';
import assert from 'node:assert/strict';
import type { Coupon } from '../types/medex';
import {
  canCustomerClaimCoupon,
  canEscalateProblemReportToCS,
  canTransitionReturnRefundStatus,
  validateAndCalculateCouponDiscount,
} from './couponRules';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    coupon_id: 1,
    code: 'MEDEX20',
    title: '20% Off Care',
    description: '20% off capped at 100 PHP',
    discount_type: 'percentage',
    discount_value: 20,
    max_discount_amount: 100,
    min_purchase_amount: 200,
    usage_limit_total: 50,
    usage_limit_per_user: 1,
    times_used: 0,
    starts_at: '2025-01-01T00:00:00.000Z',
    expires_at: '2030-12-31T23:59:59.000Z',
    is_active: true,
    target_segment: 'all',
    applicable_merchant_ids: [],
    applicable_product_ids: [],
    eligible_resident_ids: [],
    created_by_id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('percentage coupon computes capped discount accurately', () => {
  const res = validateAndCalculateCouponDiscount({
    coupon: makeCoupon(),
    residentId: 201,
    merchantId: 10,
    cartItems: [{ product_id: 501, quantity: 2, unit_price: 400 }],
    subtotal: 800,
    residentPreviousOrdersCount: 1,
    residentCouponUsageCount: 0,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(res.valid, true);
  assert.equal(res.discountAmount, 100);
  assert.equal(res.finalDiscountedSubtotal, 700);
});

test('fixed discount coupon rejects below min purchase, expired, or store mismatch', () => {
  const fixed = makeCoupon({
    code: 'FLAT75',
    discount_type: 'fixed',
    discount_value: 75,
    max_discount_amount: null,
    min_purchase_amount: 300,
    applicable_merchant_ids: [10],
  });

  const tooLow = validateAndCalculateCouponDiscount({
    coupon: fixed,
    residentId: 201,
    merchantId: 10,
    cartItems: [{ product_id: 501, quantity: 1, unit_price: 250 }],
    subtotal: 250,
    residentPreviousOrdersCount: 0,
    residentCouponUsageCount: 0,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(tooLow.valid, false);
  assert.equal(tooLow.discountAmount, 0);

  const wrongMerchant = validateAndCalculateCouponDiscount({
    coupon: fixed,
    residentId: 201,
    merchantId: 99,
    cartItems: [{ product_id: 501, quantity: 1, unit_price: 400 }],
    subtotal: 400,
    residentPreviousOrdersCount: 0,
    residentCouponUsageCount: 0,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(wrongMerchant.valid, false);

  const expired = validateAndCalculateCouponDiscount({
    coupon: makeCoupon({ expires_at: '2026-01-01T00:00:00.000Z' }),
    residentId: 201,
    merchantId: 10,
    cartItems: [{ product_id: 501, quantity: 1, unit_price: 400 }],
    subtotal: 400,
    residentPreviousOrdersCount: 0,
    residentCouponUsageCount: 0,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(expired.valid, false);
});

test('claiming coupons prevents duplicates and respects customer segments', () => {
  const newOnly = makeCoupon({ target_segment: 'new_customer' });
  const repeatDenied = canCustomerClaimCoupon({
    coupon: newOnly,
    residentId: 201,
    existingClaims: [],
    residentPreviousOrdersCount: 2,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(repeatDenied.ok, false);

  const duplicateClaim = canCustomerClaimCoupon({
    coupon: makeCoupon(),
    residentId: 201,
    existingClaims: [
      {
        claim_id: 1,
        coupon_id: 1,
        resident_id: 201,
        status: 'claimed',
        claimed_at: '2026-05-01T00:00:00.000Z',
      },
    ],
    residentPreviousOrdersCount: 1,
    now: new Date('2026-06-01T12:00:00.000Z'),
  });
  assert.equal(duplicateClaim.ok, false);
});

test('return/refund workflow enforces store first-line handling and CS dispute resolution', () => {
  assert.equal(canTransitionReturnRefundStatus('requested', 'store_approved', 'merchant'), true);
  assert.equal(canTransitionReturnRefundStatus('requested', 'store_rejected', 'merchant'), true);
  assert.equal(canTransitionReturnRefundStatus('requested', 'cs_resolved', 'merchant'), false);
  assert.equal(canTransitionReturnRefundStatus('store_rejected', 'escalated', 'resident'), true);
  assert.equal(canTransitionReturnRefundStatus('escalated', 'cs_resolved', 'customer_service'), true);
  assert.equal(canTransitionReturnRefundStatus('cs_resolved', 'store_rejected', 'merchant'), false);
});

test('complaint escalation enforces owner & open-status checks', () => {
  assert.equal(
    canEscalateProblemReportToCS({ user_id: 50, status: 'open' }, 50, 'resident').ok,
    true
  );
  assert.equal(
    canEscalateProblemReportToCS({ user_id: 50, status: 'open' }, 51, 'resident').ok,
    false
  );
  assert.equal(
    canEscalateProblemReportToCS({ user_id: 50, status: 'resolved' }, 50, 'resident').ok,
    false
  );
});

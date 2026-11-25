import type {
  Coupon,
  CustomerCoupon,
  Order,
  ProblemReport,
  ReturnRefundRequest,
  ReturnRefundStatus,
  UserRole,
} from '../types/medex';

export interface CouponValidationInput {
  coupon: Coupon;
  residentId: number;
  merchantId: number;
  cartItems: Array<{ product_id: number; quantity: number; unit_price: number }>;
  subtotal: number;
  customerClaim?: CustomerCoupon | null;
  residentPreviousOrdersCount: number;
  residentCouponUsageCount: number;
  now?: Date;
}

export interface CouponValidationResult {
  valid: boolean;
  discountAmount: number;
  finalDiscountedSubtotal: number;
  reason: string | null;
}

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function validateAndCalculateCouponDiscount(
  input: CouponValidationInput
): CouponValidationResult {
  const { coupon, merchantId, cartItems, subtotal } = input;
  const now = input.now ?? new Date();
  const safeSubtotal = Math.max(0, Number(subtotal.toFixed(2)));

  if (!coupon.is_active) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This coupon is currently inactive.',
    };
  }

  const startsMs = new Date(coupon.starts_at).getTime();
  if (Number.isFinite(startsMs) && now.getTime() < startsMs) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This promotion has not started yet.',
    };
  }

  const expiresMs = new Date(coupon.expires_at).getTime();
  if (Number.isFinite(expiresMs) && now.getTime() > expiresMs) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This coupon has expired.',
    };
  }

  if (coupon.usage_limit_total !== null && coupon.times_used >= coupon.usage_limit_total) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This coupon has reached its maximum total redemptions.',
    };
  }

  if (input.residentCouponUsageCount >= Math.max(1, coupon.usage_limit_per_user)) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: `You have already reached the per-customer limit (${coupon.usage_limit_per_user}) for this coupon.`,
    };
  }

  if (input.customerClaim && input.customerClaim.status === 'expired') {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'Your claimed voucher has expired.',
    };
  }

  if (coupon.target_segment === 'new_customer' && input.residentPreviousOrdersCount > 0) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This promo is exclusive to first-time MedEx customers.',
    };
  }

  if (coupon.target_segment === 'repeat_customer' && input.residentPreviousOrdersCount === 0) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This promo requires at least one previous completed order.',
    };
  }

  if (
    coupon.target_segment === 'selected_customers' &&
    coupon.eligible_resident_ids.length > 0 &&
    !coupon.eligible_resident_ids.includes(input.residentId)
  ) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'Your account is not eligible for this targeted promo.',
    };
  }

  if (
    coupon.applicable_merchant_ids.length > 0 &&
    !coupon.applicable_merchant_ids.includes(merchantId)
  ) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'This coupon is not valid for the selected pharmacy store.',
    };
  }

  const eligibleItems =
    coupon.applicable_product_ids.length > 0
      ? cartItems.filter((item) => coupon.applicable_product_ids.includes(item.product_id))
      : cartItems;

  if (eligibleItems.length === 0) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: 'None of the items in your cart qualify for this coupon.',
    };
  }

  const eligibleSubtotal = Number(
    eligibleItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0).toFixed(2)
  );

  if (safeSubtotal < coupon.min_purchase_amount) {
    return {
      valid: false,
      discountAmount: 0,
      finalDiscountedSubtotal: safeSubtotal,
      reason: `Minimum spend of ₱${coupon.min_purchase_amount.toFixed(2)} is required.`,
    };
  }

  let rawDiscount = 0;
  if (coupon.discount_type === 'percentage') {
    rawDiscount = (eligibleSubtotal * coupon.discount_value) / 100;
    if (coupon.max_discount_amount !== null && coupon.max_discount_amount > 0) {
      rawDiscount = Math.min(rawDiscount, coupon.max_discount_amount);
    }
  } else {
    rawDiscount = coupon.discount_value;
  }

  const boundedDiscount = Number(Math.max(0, Math.min(rawDiscount, eligibleSubtotal, safeSubtotal)).toFixed(2));
  const finalSubtotal = Number(Math.max(0, safeSubtotal - boundedDiscount).toFixed(2));

  return {
    valid: true,
    discountAmount: boundedDiscount,
    finalDiscountedSubtotal: finalSubtotal,
    reason: null,
  };
}

export function canCustomerClaimCoupon(input: {
  coupon: Coupon;
  residentId: number;
  existingClaims: CustomerCoupon[];
  residentPreviousOrdersCount: number;
  now?: Date;
}): { ok: boolean; error: string | null } {
  const { coupon, residentId, existingClaims, residentPreviousOrdersCount } = input;
  const now = input.now ?? new Date();
  if (!coupon.is_active) {
    return { ok: false, error: 'This coupon is no longer active.' };
  }
  const expiresMs = new Date(coupon.expires_at).getTime();
  if (Number.isFinite(expiresMs) && now.getTime() > expiresMs) {
    return { ok: false, error: 'This coupon has already expired.' };
  }
  if (coupon.usage_limit_total !== null && coupon.times_used >= coupon.usage_limit_total) {
    return { ok: false, error: 'All redemptions for this coupon have been claimed.' };
  }
  if (
    coupon.target_segment === 'selected_customers' &&
    coupon.eligible_resident_ids.length > 0 &&
    !coupon.eligible_resident_ids.includes(residentId)
  ) {
    return { ok: false, error: 'This coupon is restricted to selected customer accounts.' };
  }
  if (coupon.target_segment === 'new_customer' && residentPreviousOrdersCount > 0) {
    return { ok: false, error: 'Only new customers can claim this welcome promo.' };
  }
  if (coupon.target_segment === 'repeat_customer' && residentPreviousOrdersCount === 0) {
    return { ok: false, error: 'Complete an order first to unlock this repeat-customer promo.' };
  }
  const activeClaim = existingClaims.find(
    (c) => c.coupon_id === coupon.coupon_id && c.resident_id === residentId && c.status === 'claimed'
  );
  if (activeClaim) {
    return { ok: false, error: 'You have already claimed this coupon.' };
  }
  const usedCount = existingClaims.filter(
    (c) => c.coupon_id === coupon.coupon_id && c.resident_id === residentId && c.status === 'used'
  ).length;
  if (usedCount >= Math.max(1, coupon.usage_limit_per_user)) {
    return { ok: false, error: 'You have reached the maximum claim/usage limit for this coupon.' };
  }
  return { ok: true, error: null };
}

export function buildUniqueReturnRefCode(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RET-${yy}${mm}${dd}-${suffix}`;
}

export function canRequestReturnRefund(
  order: Pick<Order, 'status' | 'resident_id' | 'total_amount'>,
  residentId: number,
  existingReturns: Pick<ReturnRefundRequest, 'order_id' | 'status'>[]
): { ok: boolean; error: string | null } {
  if (order.resident_id !== residentId) {
    return { ok: false, error: 'You can only request a return/refund for your own order.' };
  }
  if (order.status !== 'delivered') {
    return { ok: false, error: 'Return or refund requests are only available after delivery.' };
  }
  const openExisting = existingReturns.find(
    (r) =>
      r.order_id === (order as unknown as { order_id: number }).order_id &&
      r.status !== 'cs_dismissed'
  );
  if (openExisting) {
    return { ok: false, error: 'A return/refund request already exists for this order.' };
  }
  return { ok: true, error: null };
}

export function canTransitionReturnRefundStatus(
  current: ReturnRefundStatus,
  next: ReturnRefundStatus,
  actorRole: UserRole
): boolean {
  if (current === next) return false;
  if (current === 'refunded' || current === 'cs_resolved' || current === 'cs_dismissed') {
    return false;
  }

  // Store / Merchant handles first-line response
  if (actorRole === 'merchant') {
    if (current === 'requested') {
      return next === 'store_approved' || next === 'store_rejected' || next === 'refunded';
    }
    if (current === 'store_approved') {
      return next === 'refunded';
    }
    return false;
  }

  // Customer can escalate if store rejected or has not resolved
  if (actorRole === 'resident') {
    if (next === 'escalated') {
      return current === 'requested' || current === 'store_rejected' || current === 'store_approved';
    }
    return false;
  }

  // Customer Service or Global Admin resolves escalated disputes or provides final oversight
  if (actorRole === 'customer_service' || actorRole === 'admin') {
    if (current === 'escalated') {
      return next === 'cs_resolved' || next === 'cs_dismissed' || next === 'refunded';
    }
    if (current === 'requested' || current === 'store_rejected' || current === 'store_approved') {
      return next === 'cs_resolved' || next === 'cs_dismissed' || next === 'refunded';
    }
    return false;
  }

  return false;
}

export function canEscalateProblemReportToCS(
  report: Pick<ProblemReport, 'user_id' | 'status'>,
  actorUserId: number,
  actorRole: UserRole
): { ok: boolean; error: string | null } {
  if (actorRole !== 'resident' && actorRole !== 'admin') {
    return { ok: false, error: 'Only the reporting customer or Admin can escalate a complaint.' };
  }
  if (actorRole === 'resident' && report.user_id !== actorUserId) {
    return { ok: false, error: 'You can only escalate your own problem report.' };
  }
  if (report.status === 'resolved' || report.status === 'dismissed') {
    return { ok: false, error: 'Closed reports cannot be escalated.' };
  }
  if (report.status === 'escalated') {
    return { ok: false, error: 'This complaint is already escalated to Customer Service.' };
  }
  return { ok: true, error: null };
}

import type {
  AccountStatus,
  Address,
  AlertVerification,
  AuditLogEntry,
  Barangay,
  Coupon,
  CouponDiscountType,
  CouponRedemptionLog,
  CouponTargetSegment,
  CustomerCoupon,
  DeliveryRating,
  DeliveryRecord,
  DeliveryStatus,
  EmergencyAlert,
  EmergencyAlertStatus,
  EmergencyContact,
  EmergencyHandoffMode,
  FeedbackCategory,
  FeedbackSource,
  HouseholdFlags,
  InventoryMovement,
  InventoryMovementType,
  MerchantHourRow,
  MerchantProfile,
  NotificationItem,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentMethodType,
  PaymentRecord,
  PaymentStatus,
  PharmacyReview,
  PrescriptionRecord,
  PrescriptionStatus,
  ProblemReport,
  ProblemReportStatus,
  ProblemReportStatusHistoryEntry,
  Product,
  ProductCategory,
  ProductCategoryName,
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

export type DbRow = Record<string, unknown>;

export function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseJsonNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((n) => Number.isFinite(n))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function sanitizeStorageSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'file'
  );
}

export function resolveProductImageFallback(
  rawImagePath: string | null | undefined,
  productId: number,
  categoryId: number,
  fallbacks?: {
    byProductId?: Record<number, string>;
    byCategoryId?: Record<number, string>;
    defaultImage?: string;
  }
): string {
  if (rawImagePath && rawImagePath.trim()) {
    return rawImagePath.trim();
  }
  if (fallbacks?.byProductId?.[productId]) {
    return fallbacks.byProductId[productId];
  }
  if (fallbacks?.byCategoryId?.[categoryId]) {
    return fallbacks.byCategoryId[categoryId];
  }
  return fallbacks?.defaultImage || '';
}

export function parsePermissionOverrides(value: unknown): UserPermissionOverrides | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const grant = parseJsonStringArray(raw.grant);
  const revoke = parseJsonStringArray(raw.revoke);
  if (grant.length === 0 && revoke.length === 0) return { grant: [], revoke: [] };
  return { grant, revoke };
}

export function mapDbUserToUserAccount(row: DbRow): UserAccount {
  return {
    user_id: Number(row.user_id),
    role: (row.role as UserRole) || 'resident',
    phone_number: String(row.phone_number || ''),
    email: String(row.email || ''),
    first_name: String(row.first_name || ''),
    last_name: String(row.last_name || ''),
    date_of_birth: String(row.date_of_birth || '1990-01-01').slice(0, 10),
    status: (row.status as AccountStatus) || 'pending',
    status_reason: row.status_reason ? String(row.status_reason) : undefined,
    policy_accepted_at: row.policy_accepted_at ? String(row.policy_accepted_at) : undefined,
    policy_version: row.policy_version ? String(row.policy_version) : undefined,
    created_by_admin_id:
      row.created_by_admin_id !== null && row.created_by_admin_id !== undefined
        ? Number(row.created_by_admin_id)
        : null,
    department_label: row.department_label ? String(row.department_label) : undefined,
    permission_overrides: parsePermissionOverrides(row.permission_overrides),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbBarangay(row: DbRow): Barangay {
  return {
    barangay_id: Number(row.barangay_id),
    name: String(row.name || ''),
    city: String(row.city || 'Olongapo City'),
    province: String(row.province || 'Zambales'),
    region: String(row.region || 'Region III'),
  };
}

export function mapDbAddress(row: DbRow): Address {
  return {
    address_id: Number(row.address_id),
    user_id: Number(row.user_id),
    barangay_id: Number(row.barangay_id),
    recipient_name: String(row.recipient_name || ''),
    recipient_phone: String(row.recipient_phone || ''),
    street: String(row.street || ''),
    landmark: row.landmark ? String(row.landmark) : undefined,
    delivery_instructions: row.delivery_instructions ? String(row.delivery_instructions) : undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    is_primary: Boolean(row.is_primary),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbHouseholdFlags(row: DbRow): HouseholdFlags {
  return {
    user_id: Number(row.user_id),
    has_senior: Boolean(row.has_senior),
    has_pwd: Boolean(row.has_pwd),
    has_young_child: Boolean(row.has_young_child),
    has_pregnant_member: Boolean(row.has_pregnant_member),
  };
}

export function mapDbEmergencyContact(row: DbRow): EmergencyContact {
  return {
    contact_id: Number(row.contact_id),
    user_id: Number(row.user_id),
    contact_name: String(row.contact_name || ''),
    relationship: String(row.relationship || ''),
    phone_number: String(row.phone_number || ''),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbProductCategory(row: DbRow): ProductCategory {
  return {
    category_id: Number(row.category_id),
    name: String(row.name) as ProductCategoryName,
  };
}

export function mapDbMerchantProfile(row: DbRow): MerchantProfile {
  return {
    merchant_id: Number(row.merchant_id),
    user_id: Number(row.user_id),
    shop_name: String(row.shop_name || ''),
    shop_address_id: Number(row.shop_address_id),
    is_pharmacist: Boolean(row.is_pharmacist ?? true),
    pharmacist_name: String(row.pharmacist_name || ''),
    pharmacist_license_no: String(row.pharmacist_license_no || ''),
    is_24_hours: Boolean(row.is_24_hours),
    is_temporarily_closed: Boolean(row.is_temporarily_closed),
    contact_no: String(row.contact_no || ''),
    business_permit_name: row.business_permit_name ? String(row.business_permit_name) : undefined,
    business_permit_url: row.business_permit_url ? String(row.business_permit_url) : undefined,
    government_id_name: row.government_id_name ? String(row.government_id_name) : undefined,
    government_id_url: row.government_id_url ? String(row.government_id_url) : undefined,
    documents_verified_at: row.documents_verified_at ? String(row.documents_verified_at) : undefined,
    documents_verified_by:
      row.documents_verified_by !== null && row.documents_verified_by !== undefined
        ? Number(row.documents_verified_by)
        : undefined,
  };
}

export function mapDbMerchantHours(row: DbRow): MerchantHourRow {
  return {
    hours_id: Number(row.hours_id),
    merchant_id: Number(row.merchant_id),
    day_of_week: Number(row.day_of_week),
    opens_at: String(row.opens_at || '08:00'),
    closes_at: String(row.closes_at || '20:00'),
    is_closed: Boolean(row.is_closed),
  };
}

export function mapDbProduct(
  row: DbRow,
  fallbacks?: Parameters<typeof resolveProductImageFallback>[3]
): Product {
  const productId = Number(row.product_id);
  const categoryId = Number(row.category_id);
  return {
    product_id: productId,
    merchant_id: Number(row.merchant_id),
    category_id: categoryId,
    name: String(row.name || ''),
    dosage_strength: row.dosage_strength ? String(row.dosage_strength) : undefined,
    description: String(row.description || ''),
    image_path: resolveProductImageFallback(
      row.image_path ? String(row.image_path) : '',
      productId,
      categoryId,
      fallbacks
    ),
    unit: String(row.unit || ''),
    purchase_limit: Number(row.purchase_limit ?? 5),
    is_listed: Boolean(row.is_listed ?? true),
    is_archived: Boolean(row.is_archived ?? false),
    archived_at: row.archived_at ? String(row.archived_at) : undefined,
    requires_prescription: Boolean(row.requires_prescription),
    regular_price: Number(row.regular_price ?? 0),
    stock_quantity: Number(row.stock_quantity ?? 0),
    low_stock_threshold: Number(row.low_stock_threshold ?? 10),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

export function mapDbRiderProfile(row: DbRow): RiderProfile {
  const isOnline = Boolean(row.is_online);
  return {
    rider_id: Number(row.rider_id),
    user_id: Number(row.user_id),
    vehicle_type: String(row.vehicle_type || 'Motorcycle'),
    plate_number: String(row.plate_number || ''),
    is_online: isOnline,
    operational_status:
      (row.operational_status as RiderOperationalStatus) ||
      (isOnline ? 'available' : 'inactive'),
    rating: Number(row.rating ?? 5),
    total_deliveries: Number(row.total_deliveries ?? 0),
    driver_license_name: row.driver_license_name ? String(row.driver_license_name) : undefined,
    driver_license_url: row.driver_license_url ? String(row.driver_license_url) : undefined,
    vehicle_registration_name: row.vehicle_registration_name
      ? String(row.vehicle_registration_name)
      : undefined,
    vehicle_registration_url: row.vehicle_registration_url
      ? String(row.vehicle_registration_url)
      : undefined,
    documents_verified_at: row.documents_verified_at ? String(row.documents_verified_at) : undefined,
    documents_verified_by:
      row.documents_verified_by !== null && row.documents_verified_by !== undefined
        ? Number(row.documents_verified_by)
        : undefined,
  };
}

export function mapDbEmergencyAlert(
  row: DbRow,
  verificationsByAlertId: Map<number, AlertVerification>
): EmergencyAlert {
  const alertId = Number(row.alert_id);
  return {
    alert_id: alertId,
    reference_code: String(row.reference_code || ''),
    idempotency_key: String(row.idempotency_key || ''),
    user_id: Number(row.user_id),
    category: '911_general',
    handoff_mode: row.handoff_mode
      ? (String(row.handoff_mode) as EmergencyHandoffMode)
      : undefined,
    address_id: Number(row.address_id),
    address_snapshot: String(row.address_snapshot || ''),
    barangay_name: String(row.barangay_name || ''),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: (row.status as EmergencyAlertStatus) || 'submitted',
    created_at: String(row.created_at || new Date().toISOString()),
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : undefined,
    verification: verificationsByAlertId.get(alertId),
  };
}

export function mapDbAlertVerification(row: DbRow): AlertVerification {
  return {
    verification_id: Number(row.verification_id),
    alert_id: Number(row.alert_id),
    decision: (row.decision as VerificationDecision) || 'genuine',
    verified_at: String(row.verified_at || new Date().toISOString()),
    verified_by_id: Number(row.verified_by_id),
    verified_by_name: String(row.verified_by_name || 'Admin'),
    notes: String(row.notes || ''),
  };
}

export function mapDbDeliveryRating(row: DbRow): DeliveryRating {
  return {
    rating_id: Number(row.rating_id),
    delivery_id: Number(row.delivery_id),
    order_id: Number(row.order_id),
    resident_id:
      row.resident_id !== null && row.resident_id !== undefined ? Number(row.resident_id) : 0,
    rider_id: Number(row.rider_id),
    stars: Number(row.stars ?? 5),
    tags: parseJsonStringArray(row.tags),
    comment: String(row.comment || ''),
    is_anonymous: Boolean(row.is_anonymous),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbOrderBundleToOrder(bundle: {
  orderRow: DbRow;
  items: DbRow[];
  history: DbRow[];
  prescription?: DbRow;
  payment?: DbRow;
  delivery?: DbRow;
  rating?: DeliveryRating;
}): Order {
  const o = bundle.orderRow;
  const orderId = Number(o.order_id);

  const items: OrderItem[] = bundle.items.map((it) => ({
    order_item_id: Number(it.order_item_id),
    order_id: Number(it.order_id),
    product_id: Number(it.product_id),
    merchant_id: Number(it.merchant_id),
    product_name: String(it.product_name || ''),
    unit: String(it.unit || ''),
    requires_prescription: Boolean(it.requires_prescription),
    unit_price: Number(it.unit_price ?? 0),
    quantity: Number(it.quantity ?? 1),
  }));

  const status_history: OrderStatusHistoryEntry[] = bundle.history
    .map((h) => ({
      history_id: Number(h.history_id),
      order_id: Number(h.order_id),
      status: String(h.status) as OrderStatus,
      note: h.note ? String(h.note) : undefined,
      created_at: String(h.created_at || new Date().toISOString()),
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const prescription: PrescriptionRecord | undefined = bundle.prescription
    ? {
        prescription_id: Number(bundle.prescription.prescription_id),
        order_id: orderId,
        resident_id: Number(bundle.prescription.resident_id),
        merchant_id: Number(bundle.prescription.merchant_id),
        patient_name: String(bundle.prescription.patient_name || ''),
        doctor_name: String(bundle.prescription.doctor_name || ''),
        license_no: String(bundle.prescription.license_no || ''),
        date_issued: String(bundle.prescription.date_issued || '').slice(0, 10),
        valid_until: bundle.prescription.valid_until
          ? String(bundle.prescription.valid_until).slice(0, 10)
          : undefined,
        file_name: String(bundle.prescription.file_name || ''),
        file_type: (bundle.prescription.file_type as 'jpg' | 'png' | 'pdf') || 'png',
        file_preview_url: String(bundle.prescription.file_preview_url || ''),
        status: (bundle.prescription.status as PrescriptionStatus) || 'pending_review',
        reject_reason: bundle.prescription.reject_reason
          ? String(bundle.prescription.reject_reason)
          : undefined,
        remarks: bundle.prescription.remarks ? String(bundle.prescription.remarks) : undefined,
        reviewed_by: bundle.prescription.reviewed_by
          ? String(bundle.prescription.reviewed_by)
          : undefined,
        reviewed_at: bundle.prescription.reviewed_at
          ? String(bundle.prescription.reviewed_at)
          : undefined,
        created_at: String(bundle.prescription.created_at || new Date().toISOString()),
      }
    : undefined;

  const p = bundle.payment;
  const payment: PaymentRecord = p
    ? {
        payment_id: Number(p.payment_id),
        order_id: orderId,
        method: (p.method as PaymentMethodType) || 'COD',
        idempotency_key: String(p.idempotency_key || `pay-${orderId}`),
        receipt_number: String(p.receipt_number || `RCP-2026-${orderId}`),
        amount: Number(p.amount ?? o.total_amount ?? 0),
        amount_collected:
          p.amount_collected !== null && p.amount_collected !== undefined
            ? Number(p.amount_collected)
            : null,
        is_flagged: Boolean(p.is_flagged),
        failure_reason: p.failure_reason ? String(p.failure_reason) : undefined,
        status: (p.status as PaymentStatus) || 'pending',
        gateway_reference: p.gateway_reference ? String(p.gateway_reference) : undefined,
        is_simulated_sandbox: Boolean(p.is_simulated_sandbox),
        paid_at: p.paid_at ? String(p.paid_at) : undefined,
        created_at: String(p.created_at || new Date().toISOString()),
      }
    : {
        payment_id: orderId + 2000,
        order_id: orderId,
        method: 'COD',
        idempotency_key: `pay-${orderId}`,
        receipt_number: `RCP-2026-${orderId}`,
        amount: Number(o.total_amount ?? 0),
        amount_collected: null,
        is_flagged: false,
        status: 'pending',
        is_simulated_sandbox: false,
        created_at: String(o.placed_at || new Date().toISOString()),
      };

  const d = bundle.delivery;
  const delivery: DeliveryRecord | undefined = d
    ? {
        delivery_id: Number(d.delivery_id),
        order_id: orderId,
        rider_id: d.rider_id !== null && d.rider_id !== undefined ? Number(d.rider_id) : null,
        pickup_merchant_id: Number(d.pickup_merchant_id),
        status: (d.status as DeliveryStatus) || 'requested',
        failure_reason: d.failure_reason ? String(d.failure_reason) : undefined,
        assigned_at: d.assigned_at ? String(d.assigned_at) : undefined,
        picked_up_at: d.picked_up_at ? String(d.picked_up_at) : undefined,
        delivered_at: d.delivered_at ? String(d.delivered_at) : undefined,
        requested_at: String(d.requested_at || new Date().toISOString()),
        confirmation_code: String(d.confirmation_code || '0000'),
        code_attempts: Number(d.code_attempts ?? 0),
        is_flagged_for_admin: Boolean(d.is_flagged_for_admin),
        rider_lat: d.rider_lat !== null && d.rider_lat !== undefined ? Number(d.rider_lat) : undefined,
        rider_lng: d.rider_lng !== null && d.rider_lng !== undefined ? Number(d.rider_lng) : undefined,
        declined_by_rider_ids: parseJsonNumberArray(d.declined_by_rider_ids),
      }
    : undefined;

  return {
    order_id: orderId,
    order_code: String(o.order_code || `MDX-ORD-${orderId}`),
    idempotency_key: String(o.idempotency_key || `ord-${orderId}`),
    resident_id: Number(o.resident_id),
    merchant_id: Number(o.merchant_id),
    alert_id: o.alert_id !== null && o.alert_id !== undefined ? Number(o.alert_id) : null,
    address_id: Number(o.address_id),
    delivery_address_snapshot: String(o.delivery_address_snapshot || ''),
    recipient_name: String(o.recipient_name || ''),
    recipient_phone: String(o.recipient_phone || ''),
    rider_note: o.rider_note ? String(o.rider_note) : undefined,
    subtotal: Number(o.subtotal ?? 0),
    delivery_fee: Number(o.delivery_fee ?? 0),
    coupon_id:
      o.coupon_id !== null && o.coupon_id !== undefined ? Number(o.coupon_id) : null,
    coupon_code: o.coupon_code ? String(o.coupon_code) : null,
    discount_amount:
      o.discount_amount !== null && o.discount_amount !== undefined
        ? Number(o.discount_amount)
        : 0,
    total_amount: Number(o.total_amount ?? 0),
    status: (o.status as OrderStatus) || 'placed',
    cancel_reason: o.cancel_reason ? String(o.cancel_reason) : undefined,
    placed_at: String(o.placed_at || new Date().toISOString()),
    items,
    status_history,
    prescription,
    payment,
    delivery,
    rating: bundle.rating,
  };
}

export function mapDbFeedbackCategory(row: DbRow): FeedbackCategory {
  return {
    category_id: Number(row.category_id),
    applies_to: (row.applies_to as FeedbackSource) || 'app',
    code: String(row.code || ''),
    label: String(row.label || ''),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function mapDbPharmacyReview(row: DbRow): PharmacyReview {
  return {
    review_id: Number(row.review_id),
    order_id: Number(row.order_id),
    resident_id:
      row.resident_id !== null && row.resident_id !== undefined ? Number(row.resident_id) : 0,
    merchant_id: Number(row.merchant_id),
    rating: Number(row.rating ?? 5),
    tags: parseJsonStringArray(row.tags),
    comment: String(row.comment || ''),
    is_anonymous: Boolean(row.is_anonymous),
    reviewer_display_name: row.reviewer_display_name
      ? String(row.reviewer_display_name)
      : undefined,
    status: (row.status as 'visible' | 'hidden') || 'visible',
    moderation_reason: row.moderation_reason ? String(row.moderation_reason) : undefined,
    moderated_by:
      row.moderated_by !== null && row.moderated_by !== undefined
        ? Number(row.moderated_by)
        : undefined,
    moderated_at: row.moderated_at ? String(row.moderated_at) : undefined,
    merchant_reply: row.merchant_reply ? String(row.merchant_reply) : undefined,
    replied_at: row.replied_at ? String(row.replied_at) : undefined,
    idempotency_key: String(row.idempotency_key || `rev-${row.review_id}`),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

export function mapDbProblemReportBundle(
  row: DbRow,
  historyRows: DbRow[]
): ProblemReport {
  const status_history: ProblemReportStatusHistoryEntry[] = historyRows
    .map((h) => ({
      history_id: Number(h.history_id),
      report_id: Number(h.report_id),
      status: (h.status as ProblemReportStatus) || 'open',
      changed_by_id: Number(h.changed_by_id),
      changed_by_name: String(h.changed_by_name || ''),
      changed_by_role: (h.changed_by_role as UserRole) || 'resident',
      note: h.note ? String(h.note) : undefined,
      created_at: String(h.created_at || new Date().toISOString()),
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return {
    report_id: Number(row.report_id),
    reference_code: String(row.reference_code || ''),
    idempotency_key: String(row.idempotency_key || ''),
    user_id: Number(row.user_id),
    source: (row.source as FeedbackSource) || 'app',
    order_id: row.order_id !== null && row.order_id !== undefined ? Number(row.order_id) : null,
    merchant_id:
      row.merchant_id !== null && row.merchant_id !== undefined ? Number(row.merchant_id) : null,
    product_id: row.product_id !== null && row.product_id !== undefined ? Number(row.product_id) : null,
    search_id: row.search_id ? String(row.search_id) : null,
    category_code: String(row.category_code || ''),
    category_label: String(row.category_label || ''),
    category_tag: row.category_tag ? String(row.category_tag) : undefined,
    description: String(row.description || ''),
    is_anonymous: Boolean(row.is_anonymous),
    status: (row.status as ProblemReportStatus) || 'open',
    admin_notes: row.admin_notes ? String(row.admin_notes) : undefined,
    cs_notes: row.cs_notes ? String(row.cs_notes) : undefined,
    resolution_note: row.resolution_note ? String(row.resolution_note) : undefined,
    escalated_at: row.escalated_at ? String(row.escalated_at) : undefined,
    escalated_by_id:
      row.escalated_by_id !== null && row.escalated_by_id !== undefined
        ? Number(row.escalated_by_id)
        : undefined,
    escalated_reason: row.escalated_reason ? String(row.escalated_reason) : undefined,
    store_responded_at: row.store_responded_at ? String(row.store_responded_at) : undefined,
    resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
    status_history,
  };
}

export function mapDbRiderEarning(row: DbRow): RiderEarning {
  return {
    earning_id: Number(row.earning_id),
    rider_id: Number(row.rider_id),
    delivery_id: Number(row.delivery_id),
    order_code: String(row.order_code || ''),
    amount: Number(row.amount ?? 0),
    payout_status: (row.payout_status as 'pending' | 'paid') || 'pending',
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbNotification(row: DbRow): NotificationItem {
  return {
    notification_id: Number(row.notification_id),
    user_id: Number(row.user_id),
    title: String(row.title || ''),
    message: String(row.message || ''),
    notification_type:
      (row.notification_type as NotificationItem['notification_type']) || 'System',
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbAuditLog(row: DbRow): AuditLogEntry {
  return {
    log_id: Number(row.log_id),
    user_id: Number(row.user_id),
    actor_name: String(row.actor_name || ''),
    action: String(row.action || ''),
    entity: String(row.entity || ''),
    entity_id: String(row.entity_id || ''),
    before_after: String(row.before_after || ''),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbCoupon(row: DbRow): Coupon {
  return {
    coupon_id: Number(row.coupon_id),
    code: String(row.code || '').toUpperCase(),
    title: String(row.title || ''),
    description: String(row.description || ''),
    discount_type: (row.discount_type as CouponDiscountType) || 'fixed',
    discount_value: Number(row.discount_value ?? 0),
    max_discount_amount:
      row.max_discount_amount !== null && row.max_discount_amount !== undefined
        ? Number(row.max_discount_amount)
        : null,
    min_purchase_amount: Number(row.min_purchase_amount ?? 0),
    usage_limit_total:
      row.usage_limit_total !== null && row.usage_limit_total !== undefined
        ? Number(row.usage_limit_total)
        : null,
    usage_limit_per_user: Number(row.usage_limit_per_user ?? 1),
    times_used: Number(row.times_used ?? 0),
    starts_at: String(row.starts_at || new Date().toISOString()),
    expires_at: String(row.expires_at || new Date().toISOString()),
    is_active: Boolean(row.is_active ?? true),
    target_segment: (row.target_segment as CouponTargetSegment) || 'all',
    applicable_merchant_ids: parseJsonNumberArray(row.applicable_merchant_ids),
    applicable_product_ids: parseJsonNumberArray(row.applicable_product_ids),
    eligible_resident_ids: parseJsonNumberArray(row.eligible_resident_ids),
    created_by_id: Number(row.created_by_id ?? 1),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

export function mapDbCustomerCoupon(row: DbRow): CustomerCoupon {
  return {
    claim_id: Number(row.claim_id),
    coupon_id: Number(row.coupon_id),
    resident_id: Number(row.resident_id),
    status: (row.status as CustomerCoupon['status']) || 'claimed',
    claimed_at: String(row.claimed_at || new Date().toISOString()),
    used_at: row.used_at ? String(row.used_at) : undefined,
    order_id:
      row.order_id !== null && row.order_id !== undefined ? Number(row.order_id) : null,
  };
}

export function mapDbCouponRedemption(row: DbRow): CouponRedemptionLog {
  return {
    redemption_id: Number(row.redemption_id),
    coupon_id:
      row.coupon_id !== null && row.coupon_id !== undefined ? Number(row.coupon_id) : null,
    coupon_code: String(row.coupon_code || ''),
    resident_id: Number(row.resident_id),
    order_id:
      row.order_id !== null && row.order_id !== undefined ? Number(row.order_id) : null,
    discount_amount: Number(row.discount_amount ?? 0),
    status: (row.status as CouponRedemptionLog['status']) || 'redeemed',
    failure_reason: row.failure_reason ? String(row.failure_reason) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbInventoryMovement(row: DbRow): InventoryMovement {
  return {
    movement_id: Number(row.movement_id),
    product_id: Number(row.product_id),
    merchant_id: Number(row.merchant_id),
    product_name: String(row.product_name || ''),
    actor_id: Number(row.actor_id),
    actor_name: String(row.actor_name || ''),
    actor_role: (row.actor_role as UserRole) || 'merchant',
    movement_type: (row.movement_type as InventoryMovementType) || 'manual_adjustment',
    quantity_delta: Number(row.quantity_delta ?? 0),
    stock_before: Number(row.stock_before ?? 0),
    stock_after: Number(row.stock_after ?? 0),
    reference_order_id:
      row.reference_order_id !== null && row.reference_order_id !== undefined
        ? Number(row.reference_order_id)
        : null,
    note: row.note ? String(row.note) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function mapDbReturnRefundRequest(row: DbRow): ReturnRefundRequest {
  return {
    return_id: Number(row.return_id),
    reference_code: String(row.reference_code || ''),
    order_id: Number(row.order_id),
    resident_id: Number(row.resident_id),
    merchant_id: Number(row.merchant_id),
    reason_code: (row.reason_code as ReturnRefundReason) || 'other',
    description: String(row.description || ''),
    requested_refund_amount: Number(row.requested_refund_amount ?? 0),
    approved_refund_amount:
      row.approved_refund_amount !== null && row.approved_refund_amount !== undefined
        ? Number(row.approved_refund_amount)
        : null,
    status: (row.status as ReturnRefundStatus) || 'requested',
    store_response_note: row.store_response_note ? String(row.store_response_note) : undefined,
    store_responded_by:
      row.store_responded_by !== null && row.store_responded_by !== undefined
        ? Number(row.store_responded_by)
        : null,
    store_responded_at: row.store_responded_at ? String(row.store_responded_at) : undefined,
    escalated_at: row.escalated_at ? String(row.escalated_at) : undefined,
    escalation_reason: row.escalation_reason ? String(row.escalation_reason) : undefined,
    cs_notes: row.cs_notes ? String(row.cs_notes) : undefined,
    cs_resolution_note: row.cs_resolution_note ? String(row.cs_resolution_note) : undefined,
    cs_resolved_by:
      row.cs_resolved_by !== null && row.cs_resolved_by !== undefined
        ? Number(row.cs_resolved_by)
        : null,
    cs_resolved_at: row.cs_resolved_at ? String(row.cs_resolved_at) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

export type UserRole =
  | 'resident'
  | 'merchant'
  | 'rider'
  | 'admin'
  | 'delivery_manager'
  | 'coupon_handler'
  | 'inventory_manager'
  | 'customer_service';

export type PublicRegisterRole = 'resident' | 'merchant' | 'rider';

export type InternalAdminRole =
  | 'admin'
  | 'delivery_manager'
  | 'coupon_handler'
  | 'inventory_manager'
  | 'customer_service';

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface UserPermissionOverrides {
  grant?: string[];
  revoke?: string[];
}

export interface UserAccount {
  user_id: number;
  role: UserRole;
  phone_number: string; // normalized +639XXXXXXXXX
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string; // YYYY-MM-DD
  status: AccountStatus;
  status_reason?: string;
  policy_accepted_at?: string;
  policy_version?: string;
  created_by_admin_id?: number | null;
  department_label?: string;
  permission_overrides?: UserPermissionOverrides;
  created_at: string;
}

export interface Barangay {
  barangay_id: number;
  name: string;
  city: string;
  province: string;
  region: string;
}

export interface Address {
  address_id: number;
  user_id: number;
  barangay_id: number;
  recipient_name: string;
  recipient_phone: string;
  street: string;
  landmark?: string;
  delivery_instructions?: string;
  latitude: number;
  longitude: number;
  is_primary: boolean;
  created_at: string;
}

export interface HouseholdFlags {
  user_id: number;
  has_senior: boolean;
  has_pwd: boolean;
  has_young_child: boolean;
  has_pregnant_member: boolean;
}

export interface EmergencyContact {
  contact_id: number;
  user_id: number;
  contact_name: string;
  relationship: string;
  phone_number: string;
  created_at: string;
}

export type EmergencyCategoryCode = '911_general';

export type EmergencyHandoffMode = 'mobile_dialer' | 'desktop_qr';

export type EmergencyAlertStatus =
  | 'queued_offline'
  | 'submitted'
  | 'received'
  | 'verified'
  | 'resolved'
  | 'cancelled'
  | 'escalated';

export type VerificationDecision = 'genuine' | 'false_alarm' | 'accidental_press';

export interface AlertVerification {
  verification_id: number;
  alert_id: number;
  decision: VerificationDecision;
  verified_at: string;
  verified_by_id: number;
  verified_by_name: string;
  notes: string;
}

export interface EmergencyAlert {
  alert_id: number;
  reference_code: string;
  idempotency_key: string;
  user_id: number;
  category: EmergencyCategoryCode;
  handoff_mode?: EmergencyHandoffMode;
  address_id: number;
  address_snapshot: string;
  barangay_name: string;
  latitude: number;
  longitude: number;
  status: EmergencyAlertStatus;
  created_at: string;
  cancelled_at?: string;
  verification?: AlertVerification;
}

export type ProductCategoryName =
  | 'Medicines'
  | 'First Aid'
  | 'Hygiene'
  | 'Baby Care'
  | 'Masks & PPE'
  | 'Equipment';

export interface ProductCategory {
  category_id: number;
  name: ProductCategoryName;
}

export interface MerchantHourRow {
  hours_id: number;
  merchant_id: number;
  day_of_week: number; // 0 = Sun ... 6 = Sat
  opens_at: string; // HH:MM
  closes_at: string; // HH:MM (up to 24:00)
  is_closed: boolean;
}

export interface MerchantProfile {
  merchant_id: number;
  user_id: number;
  shop_name: string;
  shop_address_id: number;
  is_pharmacist: boolean;
  pharmacist_name: string;
  pharmacist_license_no: string;
  is_24_hours: boolean;
  is_temporarily_closed: boolean;
  contact_no: string;
  business_permit_name?: string;
  business_permit_url?: string;
  government_id_name?: string;
  government_id_url?: string;
  documents_verified_at?: string;
  documents_verified_by?: number;
}

export interface Product {
  product_id: number;
  merchant_id: number;
  category_id: number;
  name: string;
  dosage_strength?: string;
  description: string;
  image_path: string;
  unit: string;
  purchase_limit: number;
  is_listed: boolean;
  is_archived?: boolean;
  archived_at?: string;
  requires_prescription: boolean;
  regular_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  updated_at: string;
}

export type ProductSortOption =
  | 'featured'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc'
  | 'nearest';

export type ProductStockFilter =
  | 'all'
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  | 'otc'
  | 'rx';

export type AvailabilityStatus = 'Available' | 'Low Stock' | 'Out of Stock';

export type OrderStatus =
  | 'awaiting_prescription_review'
  | 'pending'
  | 'placed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethodType = 'GCash' | 'COD';
export type PaymentStatus = 'pending' | 'paid' | 'collected' | 'failed';

export type PrescriptionStatus = 'pending_review' | 'approved' | 'rejected';

export const PRESCRIPTION_REJECTION_REASONS = [
  'Image is unclear or unreadable',
  'Required details are missing or incomplete',
  'Prescription has expired',
  'Patient name does not match the order',
  'Doctor or license number cannot be verified',
  'Prescription does not cover the medicine ordered',
  'Other',
] as const;

export interface PrescriptionRecord {
  prescription_id: number;
  order_id: number;
  resident_id: number;
  merchant_id: number;
  patient_name: string;
  doctor_name: string;
  license_no: string;
  date_issued: string;
  valid_until?: string;
  file_name: string;
  file_type: 'jpg' | 'png' | 'pdf';
  file_preview_url: string;
  status: PrescriptionStatus;
  reject_reason?: string;
  remarks?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface OrderItem {
  order_item_id: number;
  order_id: number;
  product_id: number;
  merchant_id: number;
  product_name: string;
  unit: string;
  requires_prescription: boolean;
  unit_price: number;
  quantity: number;
}

export interface OrderStatusHistoryEntry {
  history_id: number;
  order_id: number;
  status: OrderStatus;
  note?: string;
  created_at: string;
}

export interface PaymentRecord {
  payment_id: number;
  order_id: number;
  method: PaymentMethodType;
  idempotency_key: string;
  receipt_number: string;
  amount: number;
  amount_collected: number | null;
  is_flagged: boolean;
  failure_reason?: string;
  status: PaymentStatus;
  gateway_reference?: string;
  is_simulated_sandbox: boolean;
  paid_at?: string;
  created_at: string;
}

export type DeliveryStatus =
  | 'requested'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'not_home'
  | 'failed';

export type RiderOperationalStatus =
  | 'active'
  | 'available'
  | 'assigned'
  | 'on_delivery'
  | 'suspended'
  | 'inactive';

export interface RiderProfile {
  rider_id: number;
  user_id: number;
  vehicle_type: string;
  plate_number: string;
  is_online: boolean;
  operational_status?: RiderOperationalStatus;
  rating: number;
  total_deliveries: number;
  driver_license_name?: string;
  driver_license_url?: string;
  vehicle_registration_name?: string;
  vehicle_registration_url?: string;
  documents_verified_at?: string;
  documents_verified_by?: number;
}

export interface DeliveryRecord {
  delivery_id: number;
  order_id: number;
  rider_id: number | null;
  pickup_merchant_id: number;
  status: DeliveryStatus;
  failure_reason?: string;
  assigned_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  requested_at: string;
  confirmation_code: string; // 4 digits; hidden on rider UI
  code_attempts: number;
  is_flagged_for_admin: boolean;
  rider_lat?: number;
  rider_lng?: number;
  declined_by_rider_ids: number[];
}

export interface RiderEarning {
  earning_id: number;
  rider_id: number;
  delivery_id: number;
  order_code: string;
  amount: number;
  payout_status: 'pending' | 'paid';
  created_at: string;
}

export interface DeliveryRating {
  rating_id: number;
  delivery_id: number;
  order_id: number;
  resident_id: number;
  rider_id: number;
  stars: number;
  tags: string[];
  comment: string;
  is_anonymous: boolean;
  created_at: string;
}

export type FeedbackSource = 'order' | 'locator' | 'app';

export interface FeedbackCategory {
  category_id: number;
  applies_to: FeedbackSource;
  code: string;
  label: string;
  is_active: boolean;
}

export interface PharmacyReview {
  review_id: number;
  order_id: number;
  resident_id: number;
  merchant_id: number;
  rating: number;
  tags: string[];
  comment: string;
  is_anonymous: boolean;
  reviewer_display_name?: string;
  status: 'visible' | 'hidden';
  moderation_reason?: string;
  moderated_by?: number;
  moderated_at?: string;
  merchant_reply?: string;
  replied_at?: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export type ProblemReportStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved' | 'dismissed';

export interface ProblemReportStatusHistoryEntry {
  history_id: number;
  report_id: number;
  status: ProblemReportStatus;
  changed_by_id: number;
  changed_by_name: string;
  changed_by_role: UserRole;
  note?: string;
  created_at: string;
}

export interface ProblemReport {
  report_id: number;
  reference_code: string;
  idempotency_key: string;
  user_id: number;
  source: FeedbackSource;
  order_id: number | null;
  merchant_id: number | null;
  product_id: number | null;
  search_id?: string | null;
  category_code: string;
  category_label: string;
  category_tag?: string;
  description: string;
  is_anonymous: boolean;
  status: ProblemReportStatus;
  admin_notes?: string;
  cs_notes?: string;
  resolution_note?: string;
  escalated_at?: string;
  escalated_by_id?: number;
  escalated_reason?: string;
  store_responded_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  status_history: ProblemReportStatusHistoryEntry[];
}

export interface Order {
  order_id: number;
  order_code: string;
  idempotency_key: string;
  resident_id: number;
  merchant_id: number;
  alert_id: number | null;
  address_id: number;
  delivery_address_snapshot: string;
  recipient_name: string;
  recipient_phone: string;
  rider_note?: string;
  subtotal: number;
  delivery_fee: number;
  coupon_id?: number | null;
  coupon_code?: string | null;
  discount_amount?: number;
  total_amount: number;
  status: OrderStatus;
  cancel_reason?: string;
  placed_at: string;
  items: OrderItem[];
  status_history: OrderStatusHistoryEntry[];
  prescription?: PrescriptionRecord;
  payment: PaymentRecord;
  delivery?: DeliveryRecord;
  rating?: DeliveryRating;
}

export interface CartItem {
  product_id: number;
  quantity: number;
}

export interface Cart {
  merchant_id: number | null;
  items: CartItem[];
}

export interface NotificationItem {
  notification_id: number;
  user_id: number;
  title: string;
  message: string;
  notification_type:
    | 'Order'
    | 'Payment'
    | 'Delivery'
    | 'Verification'
    | 'Prescription'
    | 'Feedback'
    | 'System'
    | 'Alert';
  is_read: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  log_id: number;
  user_id: number;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: number | string;
  before_after: string;
  created_at: string;
}

export type CouponDiscountType = 'percentage' | 'fixed';
export type CouponTargetSegment = 'all' | 'new_customer' | 'repeat_customer' | 'selected_customers';

export interface Coupon {
  coupon_id: number;
  code: string;
  title: string;
  description: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_purchase_amount: number;
  usage_limit_total: number | null;
  usage_limit_per_user: number;
  times_used: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  target_segment: CouponTargetSegment;
  applicable_merchant_ids: number[];
  applicable_product_ids: number[];
  eligible_resident_ids: number[];
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerCoupon {
  claim_id: number;
  coupon_id: number;
  resident_id: number;
  status: 'claimed' | 'used' | 'expired';
  claimed_at: string;
  used_at?: string;
  order_id?: number | null;
}

export interface CouponRedemptionLog {
  redemption_id: number;
  coupon_id: number | null;
  coupon_code: string;
  resident_id: number;
  order_id: number | null;
  discount_amount: number;
  status: 'redeemed' | 'failed';
  failure_reason?: string;
  created_at: string;
}

export type InventoryMovementType =
  | 'restock'
  | 'sale_deduction'
  | 'cancel_restock'
  | 'return_restock'
  | 'manual_adjustment'
  | 'initial_stock';

export interface InventoryMovement {
  movement_id: number;
  product_id: number;
  merchant_id: number;
  product_name: string;
  actor_id: number;
  actor_name: string;
  actor_role: UserRole;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  reference_order_id?: number | null;
  note?: string;
  created_at: string;
}

export type ReturnRefundStatus =
  | 'requested'
  | 'store_approved'
  | 'store_rejected'
  | 'refunded'
  | 'escalated'
  | 'cs_resolved'
  | 'cs_dismissed';

export type ReturnRefundReason =
  | 'wrong_item'
  | 'damaged_item'
  | 'expired_product'
  | 'missing_item'
  | 'quality_issue'
  | 'other';

export interface ReturnRefundRequest {
  return_id: number;
  reference_code: string;
  order_id: number;
  resident_id: number;
  merchant_id: number;
  reason_code: ReturnRefundReason;
  description: string;
  requested_refund_amount: number;
  approved_refund_amount?: number | null;
  status: ReturnRefundStatus;
  store_response_note?: string;
  store_responded_by?: number | null;
  store_responded_at?: string;
  escalated_at?: string;
  escalation_reason?: string;
  cs_notes?: string;
  cs_resolution_note?: string;
  cs_resolved_by?: number | null;
  cs_resolved_at?: string;
  created_at: string;
  updated_at: string;
}


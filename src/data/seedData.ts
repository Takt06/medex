import heroPharmacyImg from '../assets/images/medex_hero_pharmacy_1794584230508.jpg';
import medicinesPackImg from '../assets/images/medex_medicines_pack_1794584230532.jpg';
import firstAidKitImg from '../assets/images/medex_first_aid_kit_1794584231501.jpg';
import babyHygieneImg from '../assets/images/medex_baby_hygiene_1794584231696.jpg';
import type {
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
  ReturnRefundRequest,
  RiderEarning,
  RiderProfile,
  UserAccount,
} from '../types/medex';

export const HERO_PHARMACY_IMAGE = heroPharmacyImg;
export const CATEGORY_MEDICINES_IMAGE = medicinesPackImg;
export const CATEGORY_FIRST_AID_IMAGE = firstAidKitImg;
export const CATEGORY_HYGIENE_IMAGE = babyHygieneImg;

export const DEFAULT_CATEGORY_IMAGES: Record<number, string> = {
  1: medicinesPackImg,
  2: firstAidKitImg,
  3: babyHygieneImg,
  4: babyHygieneImg,
  5: firstAidKitImg,
  6: babyHygieneImg,
};

// Focused initial coverage: Olongapo City, Zambales (Region III - Central Luzon)
export const SEED_BARANGAYS: Barangay[] = [
  { barangay_id: 1, name: 'East Bajac-Bajac', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
  { barangay_id: 2, name: 'West Bajac-Bajac', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
  { barangay_id: 3, name: 'Pag-asa', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
  { barangay_id: 4, name: 'East Tapinac', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
  { barangay_id: 5, name: 'Barretto', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
  { barangay_id: 6, name: 'Kalaklan', city: 'Olongapo City', province: 'Zambales', region: 'Region III' },
];

// Only the Admin account is built in; Customers, Merchants, and Riders register fresh via Sign Up.
export const SEED_USERS: UserAccount[] = [
  {
    user_id: 1,
    role: 'admin',
    phone_number: '+639175550401',
    email: 'admin@medex.ph',
    first_name: 'Nadia',
    last_name: 'Villanueva',
    date_of_birth: '1984-01-25',
    status: 'approved',
    created_at: '2026-09-01T00:00:00Z',
  },
];

export const SEED_PRODUCT_CATEGORIES: ProductCategory[] = [
  { category_id: 1, name: 'Medicines' },
  { category_id: 2, name: 'First Aid' },
  { category_id: 3, name: 'Hygiene' },
  { category_id: 4, name: 'Baby Care' },
  { category_id: 5, name: 'Masks & PPE' },
  { category_id: 6, name: 'Equipment' },
];

export const SEED_FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  // Order-scoped categories
  { category_id: 1, applies_to: 'order', code: 'wrong_item', label: 'Wrong item received', is_active: true },
  { category_id: 2, applies_to: 'order', code: 'missing_item', label: 'Missing item in package', is_active: true },
  { category_id: 3, applies_to: 'order', code: 'damaged_item', label: 'Damaged or tampered item', is_active: true },
  { category_id: 4, applies_to: 'order', code: 'late_order', label: 'Significant order delay', is_active: true },
  // Locator-scoped categories
  { category_id: 5, applies_to: 'locator', code: 'wrong_stock', label: 'Out of stock / wrong stock', is_active: true },
  { category_id: 6, applies_to: 'locator', code: 'wrong_price', label: 'Displayed price was inaccurate', is_active: true },
  { category_id: 7, applies_to: 'locator', code: 'wrong_open_status', label: 'Pharmacy was actually closed', is_active: true },
  { category_id: 8, applies_to: 'locator', code: 'wrong_location', label: 'Map pin or address mismatch', is_active: true },
  // App-scoped categories
  { category_id: 9, applies_to: 'app', code: 'app_issue', label: 'App bug or display issue', is_active: true },
  { category_id: 10, applies_to: 'app', code: 'suggestion', label: 'Feature suggestion', is_active: true },
  { category_id: 11, applies_to: 'app', code: 'other', label: 'Other general concern', is_active: true },
];

// Clean-slate user-generated tables (populated live as real Customers, Merchants, and Riders sign up)
export const SEED_ADDRESSES: Address[] = [];
export const SEED_HOUSEHOLD_FLAGS: HouseholdFlags[] = [];
export const SEED_EMERGENCY_CONTACTS: EmergencyContact[] = [];
export const SEED_MERCHANT_PROFILES: MerchantProfile[] = [];
export const SEED_MERCHANT_HOURS: MerchantHourRow[] = [];
export const SEED_PRODUCTS: Product[] = [];
export const SEED_RIDER_PROFILES: RiderProfile[] = [];
export const SEED_ALERTS: EmergencyAlert[] = [];
export const SEED_ORDERS: Order[] = [];
export const SEED_PHARMACY_REVIEWS: PharmacyReview[] = [];
export const SEED_PROBLEM_REPORTS: ProblemReport[] = [];
export const SEED_RIDER_RATINGS: DeliveryRating[] = [];
export const SEED_RIDER_EARNINGS: RiderEarning[] = [];
export const SEED_NOTIFICATIONS: NotificationItem[] = [];
export const SEED_AUDIT_LOGS: AuditLogEntry[] = [];
export const SEED_COUPONS: Coupon[] = [];
export const SEED_CUSTOMER_COUPONS: CustomerCoupon[] = [];
export const SEED_COUPON_REDEMPTIONS: CouponRedemptionLog[] = [];
export const SEED_INVENTORY_MOVEMENTS: InventoryMovement[] = [];
export const SEED_RETURN_REQUESTS: ReturnRefundRequest[] = [];

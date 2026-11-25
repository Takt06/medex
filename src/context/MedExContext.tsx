import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  SEED_ADDRESSES,
  SEED_ALERTS,
  SEED_AUDIT_LOGS,
  SEED_BARANGAYS,
  SEED_COUPONS,
  SEED_COUPON_REDEMPTIONS,
  SEED_CUSTOMER_COUPONS,
  SEED_EMERGENCY_CONTACTS,
  SEED_FEEDBACK_CATEGORIES,
  SEED_HOUSEHOLD_FLAGS,
  SEED_INVENTORY_MOVEMENTS,
  SEED_MERCHANT_HOURS,
  SEED_MERCHANT_PROFILES,
  SEED_NOTIFICATIONS,
  SEED_ORDERS,
  SEED_PHARMACY_REVIEWS,
  SEED_PROBLEM_REPORTS,
  SEED_PRODUCTS,
  SEED_PRODUCT_CATEGORIES,
  SEED_RETURN_REQUESTS,
  SEED_RIDER_EARNINGS,
  SEED_RIDER_PROFILES,
  SEED_RIDER_RATINGS,
  SEED_USERS,
} from '../data/seedData';
import type {
  AccountStatus,
  Address,
  AuditLogEntry,
  Barangay,
  Cart,
  Coupon,
  CouponRedemptionLog,
  CustomerCoupon,
  DeliveryRating,
  EmergencyAlert,
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
  OrderStatus,
  PaymentMethodType,
  PharmacyReview,
  ProblemReport,
  ProblemReportStatus,
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
  buildUniqueEmergencyRefCode,
  buildUniqueOrderCode,
  buildUniqueReceiptNumber,
  buildUniqueReportReferenceCode,
  canEditPharmacyReview,
  canTransitionReportStatus,
  computeRiderRatingStats,
  findDuplicateOpenReport,
  formatReviewerDisplayName,
  getBarangayCenterCoords,
  getMerchantOpenStatus,
  isAtLeast18,
  isCodAmountMismatch,
  isDuplicateEmergencyAlert,
  isSafeImageOrDocUrl,
  isStrictGmailAddress,
  isWithin7DayWindow,
  normalizePHPhoneNumber,
  validateAndNormalizePHPlateNumber,
  validateAndNormalizePrcLicense,
  validateCartItemLimit,
  validateCommentPrivacy,
  validateOlongapoCoordinates,
  validatePasswordStrength,
  validatePersonName,
  validateRegularPrice,
  validateRiderRatingInput,
  validateRiderVerificationDocs,
  validateSignInEmail,
  validateSignupEmail,
  validateStoreReviewInput,
} from '../utils/medexRules';
import {
  canAdminCreateRole,
  canRegisterRolePublicly,
  hasPermission,
  INTERNAL_ADMIN_ROLES,
  ROLE_DISPLAY_NAMES,
  type RbacPermission,
} from '../utils/rbac';
import {
  buildUniqueReturnRefCode,
  canCustomerClaimCoupon,
  canEscalateProblemReportToCS,
  canRequestReturnRefund,
  canTransitionReturnRefundStatus,
  normalizeCouponCode,
  validateAndCalculateCouponDiscount,
} from '../utils/couponRules';
import { fetchGcashSessionStatus, sendEmergencyDispatchLog } from '../utils/apiClient';
import {
  applyAddressRealtimeEvent,
  applyMerchantHourRealtimeEvent,
  applyMerchantProfileRealtimeEvent,
  applyProductRealtimeEvent,
  applyUserRealtimeEvent,
  reconcilePersistedProduct,
  validateOperatingHoursRange,
  type RealtimeTableDelta,
} from '../utils/realtimeReducers';
import {
  assignRiderToDeliveryInDb,
  claimAdminPasswordInDb,
  claimCouponInDb,
  completeMerchantProfileInDb,
  completeRiderProfileInDb,
  createInternalAccountInDb,
  createReturnRequestInDb,
  deleteCouponInDb,
  escalateReportInDb,
  escalateReturnInDb,
  fetchMySqlBootstrapStatus,
  hydrateInventoryAndMerchantStateFromMySql,
  hydrateMedExStateFromMySql,
  isMySqlBackendActive,
  notifyApprovedAdminsInDb,
  PRODUCT_IMAGE_FALLBACKS,
  resolveReturnCsInDb,
  respondReturnMerchantInDb,
  saveCouponInDb,
  signInMySqlAccount,
  signOutMySqlAccount,
  signUpMySqlAccount,
  subscribeToMedExRealtime,
  syncAccountStatusToDb,
  syncAlertVerificationToDb,
  syncBarangayToDb,
  syncCancelOrderToDb,
  syncDeleteAddressToDb,
  syncDeleteEmergencyContactToDb,
  syncDeleteProductToDb,
  syncDeliveryRatingToDb,
  syncDeliveryUpsertToDb,
  syncEmergencyAlertToDb,
  syncHouseholdFlagsToDb,
  syncMerchantFlagsToDb,
  syncMerchantHoursToDb,
  syncNotificationsReadToDb,
  syncOrderPlacementToDb,
  syncOrderStatusUpdateToDb,
  syncPaymentUpdateToDb,
  syncPharmacyReviewToDb,
  syncPrescriptionReuploadToDb,
  syncPrescriptionReviewToDb,
  syncProblemReportCreationToDb,
  syncProblemReportStatusUpdateToDb,
  syncProductToDb,
  syncRestoreProductToDb,
  syncReturnFailedDeliveryToDb,
  syncRiderEarningToDb,
  syncRiderOnlineToDb,
  syncRiderVehicleToDb,
  syncSaveAddressToDb,
  syncSaveEmergencyContactToDb,
  syncSetPrimaryAddressToDb,
  syncUserProfileToDb,
  syncUserRoleToDb,
  updateRiderOperationalStatusInDb,
  updateUserPermissionsInDb,
  validateCouponOnServer,
  verifyDeliveryCodeInDb,
} from '../utils/apiSync';
import { POLICY_VERSION } from '../data/policiesData';

const STORAGE_KEY = 'medex_pwa_state_v4_olongapo_clean';
const THEME_STORAGE_KEY = 'medex_theme';

export type ThemeMode = 'light' | 'dark';

export interface DraftRxProof {
  patient_name: string;
  doctor_name: string;
  license_no: string;
  date_issued: string;
  valid_until?: string;
  file_name: string;
  file_type: 'jpg' | 'png' | 'pdf';
  file_preview_url: string;
}

export type ActiveTab =
  | 'customer_home'
  | 'locator'
  | 'store'
  | 'coupons'
  | 'emergency'
  | 'orders'
  | 'feedback'
  | 'account'
  | 'merchant_dashboard'
  | 'rider_dashboard'
  | 'admin_dashboard'
  | 'delivery_management_dashboard'
  | 'coupon_handler_dashboard'
  | 'inventory_management_dashboard'
  | 'customer_service_dashboard';

interface PersistedState {
  currentUserId: number | null;
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
  cartsByUser: Record<number, Cart>;
}

function defaultTabForRole(role: UserRole): ActiveTab {
  if (role === 'merchant') return 'merchant_dashboard';
  if (role === 'rider') return 'rider_dashboard';
  if (role === 'admin') return 'admin_dashboard';
  if (role === 'delivery_manager') return 'delivery_management_dashboard';
  if (role === 'coupon_handler') return 'coupon_handler_dashboard';
  if (role === 'inventory_manager') return 'inventory_management_dashboard';
  if (role === 'customer_service') return 'customer_service_dashboard';
  return 'customer_home';
}

const GUEST_USER: UserAccount = {
  user_id: 0,
  role: 'resident',
  phone_number: '+639000000000',
  email: 'guest@medex.ph',
  first_name: 'Olongapo',
  last_name: 'Resident',
  date_of_birth: '1995-01-01',
  status: 'approved',
  created_at: new Date(0).toISOString(),
};

function getInitialState(): PersistedState {
  const defaults: PersistedState = {
    currentUserId: null,
    users: SEED_USERS,
    barangays: SEED_BARANGAYS,
    addresses: SEED_ADDRESSES,
    householdFlags: SEED_HOUSEHOLD_FLAGS,
    emergencyContacts: SEED_EMERGENCY_CONTACTS,
    categories: SEED_PRODUCT_CATEGORIES,
    merchants: SEED_MERCHANT_PROFILES,
    merchantHours: SEED_MERCHANT_HOURS,
    products: SEED_PRODUCTS,
    riderProfiles: SEED_RIDER_PROFILES,
    alerts: SEED_ALERTS,
    orders: SEED_ORDERS,
    riderEarnings: SEED_RIDER_EARNINGS,
    riderRatings: SEED_RIDER_RATINGS,
    feedbackCategories: SEED_FEEDBACK_CATEGORIES,
    pharmacyReviews: SEED_PHARMACY_REVIEWS,
    problemReports: SEED_PROBLEM_REPORTS,
    notifications: SEED_NOTIFICATIONS,
    auditLogs: SEED_AUDIT_LOGS,
    coupons: SEED_COUPONS,
    customerCoupons: SEED_CUSTOMER_COUPONS,
    couponRedemptions: SEED_COUPON_REDEMPTIONS,
    inventoryMovements: SEED_INVENTORY_MOVEMENTS,
    returnRequests: SEED_RETURN_REQUESTS,
    cartsByUser: {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        ...defaults,
        ...parsed,
        coupons: Array.isArray(parsed.coupons) ? parsed.coupons : SEED_COUPONS,
        customerCoupons: Array.isArray(parsed.customerCoupons)
          ? parsed.customerCoupons
          : SEED_CUSTOMER_COUPONS,
        couponRedemptions: Array.isArray(parsed.couponRedemptions)
          ? parsed.couponRedemptions
          : SEED_COUPON_REDEMPTIONS,
        inventoryMovements: Array.isArray(parsed.inventoryMovements)
          ? parsed.inventoryMovements
          : SEED_INVENTORY_MOVEMENTS,
        returnRequests: Array.isArray(parsed.returnRequests)
          ? parsed.returnRequests
          : SEED_RETURN_REQUESTS,
      };
    }
  } catch {
    // ignore corrupted cache
  }
  return defaults;
}

interface RegisterInput {
  role: PublicRegisterRole;
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  phone_number: string;
  date_of_birth: string;
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
  barangay_id?: number;
  street?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  policy_accepted?: boolean;
  policy_version?: string;
}

interface CheckoutInput {
  address_id: number;
  recipient_name: string;
  recipient_phone: string;
  rider_note: string;
  payment_method: PaymentMethodType;
  coupon_code?: string;
  simulateGcashFail?: boolean;
  deferGcashToGateway?: boolean;
  prescription?: {
    patient_name: string;
    doctor_name: string;
    license_no: string;
    date_issued: string;
    valid_until?: string;
    file_name: string;
    file_type: 'jpg' | 'png' | 'pdf';
    file_preview_url: string;
  };
  idempotency_key: string;
}

interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface PendingCartIntent {
  productId: number;
  quantity: number;
  openCheckout?: boolean;
}

interface MedExContextValue {
  state: PersistedState;
  currentUser: UserAccount;
  isLoggedIn: boolean;
  theme: ThemeMode;
  toggleTheme: () => void;
  draftRxProof: DraftRxProof | null;
  setDraftRxProof: (proof: DraftRxProof | null) => void;
  pendingCartIntent: PendingCartIntent | null;
  setPendingCartIntent: (intent: PendingCartIntent | null) => void;
  postAuthNotice: string | null;
  clearPostAuthNotice: () => void;
  openCartAfterLogin: boolean;
  setOpenCartAfterLogin: (open: boolean) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  locatorSearchDraft: string;
  setLocatorSearchDraft: (q: string) => void;
  merchantInventoryFocusProductId: number | null;
  setMerchantInventoryFocusProductId: (id: number | null) => void;
  isOnline: boolean;
  setSimulatedOffline: (offline: boolean | null) => void;
  simulatedOffline: boolean | null;
  activeCart: Cart;
  unreadNotificationCount: number;
  switchAccount: (userId: number) => void;
  loginByEmail: (email: string) => ActionResult<UserAccount>;
  loginWithCredentials: (email: string, password?: string) => Promise<ActionResult<UserAccount>>;
  logout: () => void;
  registerAccount: (input: RegisterInput) => ActionResult<UserAccount>;
  registerWithCredentials: (
    input: RegisterInput & { password?: string }
  ) => Promise<ActionResult<UserAccount> & { requiresEmailConfirmation?: boolean }>;
  claimAdminPassword: (email: string, password: string) => Promise<ActionResult<UserAccount>>;
  databaseConnected: boolean;
  adminNeedsPasswordSetup: boolean;
  updateUserProfile: (first: string, last: string, phone: string) => ActionResult;
  saveAddress: (addr: Omit<Address, 'address_id' | 'user_id' | 'created_at'> & { address_id?: number }) => ActionResult;
  deleteAddress: (addressId: number) => void;
  setPrimaryAddress: (addressId: number) => void;
  updateHouseholdFlags: (flags: Omit<HouseholdFlags, 'user_id'>) => void;
  saveEmergencyContact: (c: Omit<EmergencyContact, 'contact_id' | 'user_id' | 'created_at'> & { contact_id?: number }) => ActionResult;
  deleteEmergencyContact: (contactId: number) => void;
  addToCart: (productId: number, quantity: number, replaceCart?: boolean) => ActionResult<{ conflictMerchantName?: string }>;
  updateCartQuantity: (productId: number, quantity: number) => ActionResult;
  clearCart: () => void;
  placeOrder: (input: CheckoutInput) => Promise<ActionResult<Order>>;
  cancelOrder: (orderId: number, reason: string) => ActionResult;
  reuploadPrescription: (
    orderId: number,
    rx: NonNullable<CheckoutInput['prescription']>
  ) => ActionResult;
  retryGcashPayment: (
    orderId: number,
    shouldSucceed: boolean,
    gcashMobile?: string,
    serverGatewayReference?: string,
    isLiveGateway?: boolean,
    backendDbSynced?: boolean
  ) => ActionResult;
  switchPaymentToCod: (orderId: number) => ActionResult;
  submitEmergencyAlert: (
    status: 'submitted' | 'cancelled' | 'queued_offline',
    idempotencyKey: string,
    handoffMode?: EmergencyHandoffMode
  ) => ActionResult<EmergencyAlert>;
  syncOfflineQueuedAlerts: () => number;
  // Merchant actions
  saveProduct: (
    prod: Omit<Product, 'product_id' | 'merchant_id' | 'updated_at'> & { product_id?: number }
  ) => Promise<ActionResult<Product>>;
  deleteProduct: (
    productId: number
  ) => Promise<ActionResult<{ archived?: boolean; unlistedInstead?: boolean }>>;
  restoreProduct: (productId: number) => Promise<ActionResult<Product>>;
  toggleMerchantTempClosed: (merchantId: number, closed: boolean) => Promise<ActionResult>;
  toggleMerchant24Hours: (merchantId: number, is24h: boolean) => Promise<ActionResult>;
  updateMerchantHours: (
    merchantId: number,
    schedule: Array<{
      day_of_week: number;
      opens_at: string;
      closes_at: string;
      is_closed: boolean;
    }>
  ) => Promise<ActionResult>;
  updateMerchantStoreLocation: (input: {
    shop_name?: string;
    contact_no?: string;
    barangay_id: number;
    street: string;
    landmark?: string;
    latitude: number;
    longitude: number;
  }) => ActionResult;
  completeMerchantProfile: (input: {
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
  }) => Promise<ActionResult>;
  completeRiderProfile: (input: {
    vehicle_type: string;
    plate_number: string;
    driver_license_name?: string;
    driver_license_url?: string;
    vehicle_registration_name?: string;
    vehicle_registration_url?: string;
  }) => Promise<ActionResult>;
  reviewPrescription: (
    orderId: number,
    decision: 'approved' | 'rejected',
    rejectReason?: string,
    remarks?: string
  ) => ActionResult;
  advanceMerchantOrderStatus: (orderId: number, nextStatus: 'preparing' | 'ready_for_pickup') => ActionResult;
  // Rider & Delivery Rating actions
  toggleRiderOnline: (online: boolean) => void;
  respondToDeliveryRequest: (deliveryId: number, accept: boolean) => ActionResult;
  confirmRiderPickup: (deliveryId: number) => ActionResult;
  recordCodCollection: (deliveryId: number, collectedAmount: number) => ActionResult;
  submitDeliveryCode: (
    deliveryId: number,
    code: string
  ) => Promise<ActionResult<{ attempts: number; flagged: boolean }>>;
  markDeliveryNotHome: (deliveryId: number, note: string) => ActionResult;
  retryNotHomeDelivery: (deliveryId: number) => ActionResult;
  returnNotHomeOrderToPharmacy: (orderId: number, reason?: string) => ActionResult;
  rateDelivery: (
    orderId: number,
    stars: number,
    tags?: string[],
    comment?: string,
    isAnonymous?: boolean
  ) => ActionResult<DeliveryRating>;
  // Module 9: Customer Feedback & Problem Reports
  submitPharmacyReview: (input: {
    order_id: number;
    rating: number;
    tags: string[];
    comment: string;
    is_anonymous: boolean;
    idempotency_key: string;
  }) => ActionResult<PharmacyReview>;
  editPharmacyReview: (input: {
    review_id: number;
    rating: number;
    tags: string[];
    comment: string;
    is_anonymous: boolean;
  }) => ActionResult<PharmacyReview>;
  replyToPharmacyReview: (reviewId: number, replyText: string) => ActionResult;
  moderatePharmacyReview: (
    reviewId: number,
    status: 'visible' | 'hidden',
    reason: string
  ) => ActionResult;
  submitProblemReport: (input: {
    source: FeedbackSource;
    order_id: number | null;
    merchant_id: number | null;
    product_id: number | null;
    search_id?: string | null;
    category_code: string;
    description: string;
    is_anonymous: boolean;
    idempotency_key: string;
  }) => ActionResult<ProblemReport>;
  updateProblemReportStatus: (
    reportId: number,
    nextStatus: ProblemReportStatus,
    note: string,
    adminNotes?: string,
    csNotes?: string,
    categoryTag?: string
  ) => ActionResult;
  escalateProblemReport: (reportId: number, reason: string) => Promise<ActionResult>;
  // RBAC & Internal Department Accounts (Global Admin)
  hasCurrentPermission: (perm: RbacPermission) => boolean;
  createInternalStaffAccount: (input: {
    role: 'delivery_manager' | 'coupon_handler' | 'inventory_manager' | 'customer_service';
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    password: string;
    date_of_birth: string;
    department_label?: string;
    grant_permissions?: string[];
  }) => Promise<ActionResult<UserAccount>>;
  updateUserPermissions: (
    userId: number,
    overrides: UserPermissionOverrides
  ) => Promise<ActionResult>;
  // Delivery Management & Rider Fleet
  assignRiderToDelivery: (orderId: number, riderId: number) => Promise<ActionResult>;
  updateRiderOperationalStatus: (
    riderId: number,
    operationalStatus: RiderOperationalStatus,
    reason?: string
  ) => Promise<ActionResult>;
  // Coupon Handler & Customer Coupons
  saveCoupon: (
    coupon: Omit<Coupon, 'coupon_id' | 'times_used' | 'created_by_id' | 'created_at' | 'updated_at'> & {
      coupon_id?: number;
    }
  ) => Promise<ActionResult<Coupon>>;
  deleteCoupon: (couponId: number) => Promise<ActionResult>;
  claimCoupon: (couponId: number) => Promise<ActionResult<CustomerCoupon>>;
  previewValidateCoupon: (input: {
    code: string;
    merchant_id: number;
    items: Array<{ product_id: number; quantity: number }>;
  }) => Promise<ActionResult<{ coupon: Coupon; discountAmount: number; finalDiscountedSubtotal: number }>>;
  // Return & Refund Workflow
  requestReturnRefund: (input: {
    order_id: number;
    reason_code: ReturnRefundReason;
    description: string;
    requested_refund_amount: number;
  }) => Promise<ActionResult<ReturnRefundRequest>>;
  respondReturnAsMerchant: (
    returnId: number,
    input: { status: ReturnRefundStatus; responseNote?: string; approvedAmount?: number }
  ) => Promise<ActionResult<ReturnRefundRequest>>;
  escalateReturnRefund: (
    returnId: number,
    reason: string
  ) => Promise<ActionResult<ReturnRefundRequest>>;
  resolveReturnAsCS: (
    returnId: number,
    input: {
      status: ReturnRefundStatus;
      csNotes?: string;
      resolutionNote?: string;
      approvedAmount?: number;
    }
  ) => Promise<ActionResult<ReturnRefundRequest>>;
  // Admin actions
  updateAccountStatus: (
    userId: number,
    status: AccountStatus,
    reason?: string,
    documentsVerified?: boolean
  ) => void;
  updateUserRole: (userId: number, role: UserRole) => void;
  verifyEmergencyAlert: (alertId: number, decision: VerificationDecision, notes: string) => ActionResult;
  addBarangay: (name: string, city: string, province: string, region: string) => ActionResult;
  updateRiderVehicle: (riderId: number, vehicleType: string, plateNumber: string) => ActionResult;
  markNotificationsRead: () => void;
  resetDemoData: () => void;
}

const MedExContext = createContext<MedExContextValue | null>(null);

export const MedExProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PersistedState>(getInitialState);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage read errors
    }
    return 'light';
  });
  const [draftRxProof, setDraftRxProof] = useState<DraftRxProof | null>(null);
  const [pendingCartIntent, setPendingCartIntent] = useState<PendingCartIntent | null>(null);
  const [postAuthNotice, setPostAuthNotice] = useState<string | null>(null);
  const [openCartAfterLogin, setOpenCartAfterLogin] = useState(false);
  const clearPostAuthNotice = () => setPostAuthNotice(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const initial = getInitialState();
    const initialUser = initial.users.find((u) => u.user_id === initial.currentUserId);
    return initialUser ? defaultTabForRole(initialUser.role) : 'customer_home';
  });
  const [locatorSearchDraft, setLocatorSearchDraft] = useState('');
  const [merchantInventoryFocusProductId, setMerchantInventoryFocusProductId] = useState<number | null>(null);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean | null>(null);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [adminNeedsPasswordSetup, setAdminNeedsPasswordSetup] = useState(false);

  const isOnline = simulatedOffline === null ? browserOnline : !simulatedOffline;
  const isLoggedIn = state.currentUserId !== null;

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (databaseConnected || isMySqlBackendActive()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state, databaseConnected]);

  const applyDbSnapshot = (snapshot: Awaited<ReturnType<typeof hydrateMedExStateFromMySql>>) => {
    if (!snapshot) return;
    setState((prev) => ({
      ...prev,
      currentUserId:
        snapshot.currentAuthUserId !== undefined ? snapshot.currentAuthUserId : prev.currentUserId,
      users: snapshot.users ?? prev.users,
      barangays: snapshot.barangays ?? prev.barangays,
      addresses: snapshot.addresses ?? prev.addresses,
      householdFlags: snapshot.householdFlags ?? prev.householdFlags,
      emergencyContacts: snapshot.emergencyContacts ?? prev.emergencyContacts,
      categories: snapshot.categories ?? prev.categories,
      merchants: snapshot.merchants ?? prev.merchants,
      merchantHours: snapshot.merchantHours ?? prev.merchantHours,
      products: snapshot.products ?? prev.products,
      riderProfiles: snapshot.riderProfiles ?? prev.riderProfiles,
      alerts: snapshot.alerts ?? prev.alerts,
      orders: snapshot.orders ?? prev.orders,
      riderEarnings: snapshot.riderEarnings ?? prev.riderEarnings,
      riderRatings: snapshot.riderRatings ?? prev.riderRatings,
      feedbackCategories: snapshot.feedbackCategories ?? prev.feedbackCategories,
      pharmacyReviews: snapshot.pharmacyReviews ?? prev.pharmacyReviews,
      problemReports: snapshot.problemReports ?? prev.problemReports,
      notifications: snapshot.notifications ?? prev.notifications,
      auditLogs: snapshot.auditLogs ?? prev.auditLogs,
      coupons: snapshot.coupons ?? prev.coupons,
      customerCoupons: snapshot.customerCoupons ?? prev.customerCoupons,
      couponRedemptions: snapshot.couponRedemptions ?? prev.couponRedemptions,
      inventoryMovements: snapshot.inventoryMovements ?? prev.inventoryMovements,
      returnRequests: snapshot.returnRequests ?? prev.returnRequests,
    }));
  };

  useEffect(() => {
    let active = true;
    let fullInFlight = false;
    let fullQueued = false;
    let fastInFlight = false;
    let fastQueued = false;
    let unsubRealtime: () => void = () => {};
    let listenersAttached = false;

    const applyInventoryOrMerchantDelta = (delta: RealtimeTableDelta) => {
      if (!active) return;
      setState((prev) => {
        switch (delta.table) {
          case 'products': {
            const nextProducts = applyProductRealtimeEvent(
              prev.products,
              delta.eventType,
              delta.newRow,
              delta.oldRow,
              PRODUCT_IMAGE_FALLBACKS
            );
            return nextProducts === prev.products ? prev : { ...prev, products: nextProducts };
          }
          case 'merchant_profiles': {
            const nextMerchants = applyMerchantProfileRealtimeEvent(
              prev.merchants,
              delta.eventType,
              delta.newRow,
              delta.oldRow
            );
            return nextMerchants === prev.merchants ? prev : { ...prev, merchants: nextMerchants };
          }
          case 'merchant_hours': {
            const nextHours = applyMerchantHourRealtimeEvent(
              prev.merchantHours,
              delta.eventType,
              delta.newRow,
              delta.oldRow
            );
            return nextHours === prev.merchantHours ? prev : { ...prev, merchantHours: nextHours };
          }
          case 'users': {
            const nextUsers = applyUserRealtimeEvent(
              prev.users,
              delta.eventType,
              delta.newRow,
              delta.oldRow
            );
            return nextUsers === prev.users ? prev : { ...prev, users: nextUsers };
          }
          case 'addresses': {
            const nextAddresses = applyAddressRealtimeEvent(
              prev.addresses,
              delta.eventType,
              delta.newRow,
              delta.oldRow
            );
            return nextAddresses === prev.addresses ? prev : { ...prev, addresses: nextAddresses };
          }
          default:
            return prev;
        }
      });
    };

    const refreshInventoryAndMerchants = async () => {
      if (!isMySqlBackendActive()) return;
      if (fastInFlight) {
        fastQueued = true;
        return;
      }
      fastInFlight = true;
      try {
        do {
          fastQueued = false;
          const slice = await hydrateInventoryAndMerchantStateFromMySql();
          if (active && slice) {
            applyDbSnapshot(slice);
          }
        } while (active && fastQueued);
      } finally {
        fastInFlight = false;
      }
    };

    const refreshFull = async () => {
      if (!isMySqlBackendActive()) return;
      if (fullInFlight) {
        fullQueued = true;
        return;
      }
      fullInFlight = true;
      try {
        do {
          fullQueued = false;
          const snap = await hydrateMedExStateFromMySql();
          if (active && snap) {
            applyDbSnapshot(snap);
          }
        } while (active && fullQueued);
      } finally {
        fullInFlight = false;
      }
    };

    const handleVisibleOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void refreshInventoryAndMerchants();
      }
    };
    const handleOnline = () => {
      void refreshFull();
    };

    void (async () => {
      const bootstrap = await fetchMySqlBootstrapStatus();
      if (!active) return;
      setDatabaseConnected(bootstrap.mysqlConnected);
      setAdminNeedsPasswordSetup(bootstrap.adminNeedsPasswordSetup);

      if (!bootstrap.mysqlConnected) return;

      unsubRealtime = subscribeToMedExRealtime({
        onInventoryOrMerchantDelta: applyInventoryOrMerchantDelta,
        onInventoryOrMerchantSyncNeeded: () => {
          void refreshInventoryAndMerchants();
        },
        onFullSyncNeeded: () => {
          void refreshFull();
        },
      });

      window.addEventListener('focus', handleVisibleOrFocus);
      window.addEventListener('online', handleOnline);
      document.addEventListener('visibilitychange', handleVisibleOrFocus);
      listenersAttached = true;

      void refreshFull();
    })();

    return () => {
      active = false;
      if (listenersAttached) {
        window.removeEventListener('focus', handleVisibleOrFocus);
        window.removeEventListener('online', handleOnline);
        document.removeEventListener('visibilitychange', handleVisibleOrFocus);
      }
      unsubRealtime();
    };
  }, []);

  // Verify PayMongo GCash Checkout redirect returns on page load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gcashStatus = params.get('gcash_status');
    const orderIdRaw = params.get('order_id');
    const sessionId = params.get('gcash_session');
    if (!gcashStatus || !orderIdRaw) return;

    const orderId = Number(orderIdRaw);
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    if (!Number.isFinite(orderId)) return;

    if (gcashStatus === 'cancelled') {
      setActiveTab('orders');
      setPostAuthNotice('GCash checkout was cancelled. You can retry payment or switch to COD in Orders.');
      return;
    }

    if (gcashStatus === 'success' && sessionId) {
      void fetchGcashSessionStatus(sessionId).then((res) => {
        if (!res.ok || !res.session) return;
        if (res.session.status === 'paid') {
          retryGcashPayment(
            orderId,
            true,
            res.session.gcashMobile,
            res.session.gatewayReference,
            res.session.mode === 'paymongo_live',
            Boolean(res.dbSynced)
          );
          setActiveTab('orders');
          setPostAuthNotice('GCash payment verified via PayMongo! Your order is now sent to the pharmacy.');
        } else if (res.session.status === 'failed') {
          retryGcashPayment(
            orderId,
            false,
            undefined,
            undefined,
            res.session.mode === 'paymongo_live',
            Boolean(res.dbSynced)
          );
          setActiveTab('orders');
          setPostAuthNotice('GCash payment was not completed. Please retry or switch to COD.');
        }
      });
    }
  }, []);

  const currentUser = useMemo(
    () => state.users.find((u) => u.user_id === state.currentUserId) || state.users[0] || GUEST_USER,
    [state.users, state.currentUserId]
  );

  const activeCart: Cart = useMemo(
    () => state.cartsByUser[currentUser.user_id] || { merchant_id: null, items: [] },
    [state.cartsByUser, currentUser.user_id]
  );

  const unreadNotificationCount = useMemo(
    () => state.notifications.filter((n) => n.user_id === currentUser.user_id && !n.is_read).length,
    [state.notifications, currentUser.user_id]
  );

  const appendAudit = (
    prev: PersistedState,
    action: string,
    entity: string,
    entity_id: number | string,
    before_after: string
  ): AuditLogEntry[] => {
    const actorId = prev.currentUserId ?? GUEST_USER.user_id;
    const actor = prev.users.find((u) => u.user_id === actorId);
    const nextId = Math.max(0, ...prev.auditLogs.map((l) => l.log_id)) + 1;
    return [
      {
        log_id: nextId,
        user_id: actorId,
        actor_name: actor ? `${actor.first_name} ${actor.last_name}` : 'System',
        action,
        entity,
        entity_id,
        before_after,
        created_at: new Date().toISOString(),
      },
      ...prev.auditLogs,
    ];
  };

  const pushNotification = (
    list: NotificationItem[],
    user_id: number,
    title: string,
    message: string,
    notification_type: NotificationItem['notification_type']
  ): NotificationItem[] => {
    const nextId = Math.max(0, ...list.map((n) => n.notification_id)) + 1;
    return [
      {
        notification_id: nextId,
        user_id,
        title,
        message,
        notification_type,
        is_read: false,
        created_at: new Date().toISOString(),
      },
      ...list,
    ];
  };

  const pushAdminNotifications = (
    list: NotificationItem[],
    users: UserAccount[],
    title: string,
    message: string,
    notification_type: NotificationItem['notification_type']
  ): NotificationItem[] => {
    const admins = users.filter((u) => u.role === 'admin' && u.status === 'approved');
    let next = list;
    for (const adm of admins) {
      next = pushNotification(next, adm.user_id, title, message, notification_type);
    }
    return next;
  };

  const applyIntentToCarts = (
    prev: PersistedState,
    userId: number,
    intent: PendingCartIntent | null
  ): { cartsByUser: Record<number, Cart>; addedProductName: string | null } => {
    if (!intent) return { cartsByUser: prev.cartsByUser, addedProductName: null };
    const product = prev.products.find((p) => p.product_id === intent.productId);
    if (!product || product.stock_quantity <= 0) {
      return { cartsByUser: prev.cartsByUser, addedProductName: null };
    }
    const existingCart = prev.cartsByUser[userId] || { merchant_id: null, items: [] };
    const canAppendSameMerchant =
      existingCart.merchant_id === null ||
      existingCart.merchant_id === product.merchant_id ||
      existingCart.items.length === 0;
    const baseItems = canAppendSameMerchant ? existingCart.items : [];
    const existingItem = baseItems.find((i) => i.product_id === product.product_id);
    const limitCheck = validateCartItemLimit({
      requestedQuantity: (existingItem?.quantity || 0) + intent.quantity,
      stockQuantity: product.stock_quantity,
      purchaseLimit: product.purchase_limit,
      productName: product.name,
    });
    const nextQty = Math.min(limitCheck.maxAllowed, (existingItem?.quantity || 0) + intent.quantity);
    if (nextQty <= 0) {
      return { cartsByUser: prev.cartsByUser, addedProductName: null };
    }
    const nextItems = existingItem
      ? baseItems.map((i) => (i.product_id === product.product_id ? { ...i, quantity: nextQty } : i))
      : [...baseItems, { product_id: product.product_id, quantity: nextQty }];

    return {
      cartsByUser: {
        ...prev.cartsByUser,
        [userId]: {
          merchant_id: product.merchant_id,
          items: nextItems,
        },
      },
      addedProductName: product.name,
    };
  };

  const switchAccount = (userId: number) => {
    const target = state.users.find((u) => u.user_id === userId);
    if (!target) return;
    setState((prev) => ({ ...prev, currentUserId: userId }));
    setActiveTab(defaultTabForRole(target.role));
  };

  const logout = () => {
    void signOutMySqlAccount();
    setPendingCartIntent(null);
    setPostAuthNotice(null);
    setOpenCartAfterLogin(false);
    setState((prev) => ({ ...prev, currentUserId: null }));
    setActiveTab('customer_home');
    if (isMySqlBackendActive()) {
      void hydrateMedExStateFromMySql().then((snap) => {
        if (snap) applyDbSnapshot(snap);
      });
    }
  };

  const finalizeSignedInUser = (found: UserAccount) => {
    const activeIntent = found.role === 'resident' ? pendingCartIntent : null;
    const queuedProduct = activeIntent
      ? state.products.find((p) => p.product_id === activeIntent.productId)
      : null;

    setState((prev) => {
      const exists = prev.users.some((u) => u.user_id === found.user_id);
      const users = exists
        ? prev.users.map((u) => (u.user_id === found.user_id ? found : u))
        : [...prev.users, found];
      const { cartsByUser } = applyIntentToCarts(prev, found.user_id, activeIntent);
      return { ...prev, users, currentUserId: found.user_id, cartsByUser };
    });

    if (activeIntent && queuedProduct) {
      setPendingCartIntent(null);
      setActiveTab('store');
      setPostAuthNotice(`Signed in! Added ${queuedProduct.name} to your Olongapo cart.`);
      if (activeIntent.openCheckout) {
        setOpenCartAfterLogin(true);
      }
    } else {
      setPendingCartIntent(null);
      setActiveTab(defaultTabForRole(found.role));
    }
  };

  const loginByEmail = (email: string): ActionResult<UserAccount> => {
    const normalized = email.trim().toLowerCase();
    const internalRolesSet = new Set<string>(INTERNAL_ADMIN_ROLES);
    const knownAdminEmails = state.users
      .filter((u) => internalRolesSet.has(u.role))
      .map((u) => u.email.toLowerCase());
    const found = state.users.find((u) => u.email.toLowerCase() === normalized);
    const foundIsInternal = found ? internalRolesSet.has(found.role) : false;
    const emailCheck = validateSignInEmail(normalized, {
      isAdminAccount: foundIsInternal,
      knownAdminEmails,
    });
    if (!emailCheck.valid) {
      return {
        ok: false,
        error:
          emailCheck.error ||
          'Only @gmail.com accounts can sign in (non-Gmail access is restricted to MedEx staff accounts).',
      };
    }
    if (!found) {
      return { ok: false, error: 'No account found with that email address.' };
    }
    if (!foundIsInternal && !isStrictGmailAddress(found.email)) {
      return {
        ok: false,
        error: 'Only @gmail.com accounts can sign in (non-Gmail access is restricted to MedEx staff accounts).',
      };
    }
    if (found.status === 'suspended') {
      return {
        ok: false,
        error: `Account suspended${found.status_reason ? `: ${found.status_reason}` : '.'}`,
      };
    }
    finalizeSignedInUser(found);
    return { ok: true, data: found };
  };

  const loginWithCredentials: MedExContextValue['loginWithCredentials'] = async (
    email,
    password
  ) => {
    if (!isMySqlBackendActive()) {
      return loginByEmail(email);
    }
    if (!password?.trim()) {
      return { ok: false, error: 'Password is required to sign in.' };
    }
    const authRes = await signInMySqlAccount(email, password);
    if (!authRes.ok || !authRes.user) {
      return { ok: false, error: authRes.error || 'Invalid email or password.' };
    }
    const snap = await hydrateMedExStateFromMySql();
    if (snap) {
      applyDbSnapshot(snap);
    }
    finalizeSignedInUser(authRes.user);
    return { ok: true, data: authRes.user };
  };

  const claimAdminPassword: MedExContextValue['claimAdminPassword'] = async (email, password) => {
    if (!isMySqlBackendActive()) {
      return { ok: false, error: 'MySQL database is not connected.' };
    }
    const res = await claimAdminPasswordInDb(email, password);
    if (!res.ok || !res.user) {
      return { ok: false, error: res.error || 'Could not initialize Admin password.' };
    }
    setAdminNeedsPasswordSetup(false);
    const snap = await hydrateMedExStateFromMySql();
    if (snap) {
      applyDbSnapshot(snap);
    }
    finalizeSignedInUser(res.user);
    return { ok: true, data: res.user };
  };

  const registerAccount = (input: RegisterInput): ActionResult<UserAccount> => {
    if (!canRegisterRolePublicly(input.role)) {
      return {
        ok: false,
        error:
          'Public sign-up is strictly limited to Customer, Store/Merchant, and Delivery Rider accounts.',
      };
    }
    const firstNameCheck = validatePersonName(input.first_name, 'First Name');
    if (!firstNameCheck.valid) {
      return { ok: false, error: firstNameCheck.error || 'First Name must contain letters only.' };
    }
    const lastNameCheck = validatePersonName(input.last_name, 'Last Name');
    if (!lastNameCheck.valid) {
      return { ok: false, error: lastNameCheck.error || 'Last Name must contain letters only.' };
    }
    if (input.password !== undefined) {
      const pwCheck = validatePasswordStrength(input.password);
      if (!pwCheck.valid) {
        return {
          ok: false,
          error:
            pwCheck.error ||
            'Password must include at least 8 characters, uppercase, lowercase, number, and special character.',
        };
      }
    }
    const emailCheck = validateSignupEmail(input.email);
    if (!emailCheck.valid) {
      return {
        ok: false,
        error: emailCheck.error || 'Only valid @gmail.com email addresses are accepted for sign up.',
      };
    }
    const normalizedPhone = normalizePHPhoneNumber(input.phone_number);
    if (!normalizedPhone) {
      return { ok: false, error: 'Enter a valid Philippine mobile number (e.g., 09171234567 or +639171234567).' };
    }
    if (!isAtLeast18(input.date_of_birth)) {
      return { ok: false, error: 'Residents and partners must be at least 18 years old to register.' };
    }
    if (input.policy_accepted !== true) {
      return {
        ok: false,
        error: 'You must review and acknowledge the MedEx Platform Policies before registering.',
      };
    }
    const emailExists = state.users.some(
      (u) => u.email.toLowerCase() === emailCheck.normalized
    );
    const phoneExists = state.users.some((u) => u.phone_number === normalizedPhone);
    if (emailExists || phoneExists) {
      return {
        ok: false,
        error: 'Email/Phone Number is already registered. Account is already existing.',
      };
    }
    let normalizedPrc = '';
    let normalizedRph = '';
    if (input.role === 'merchant') {
      if (!input.shop_name?.trim()) {
        return { ok: false, error: 'Please enter your pharmacy store name.' };
      }
      const rphCheck = validatePersonName(input.pharmacist_name || '', 'Licensed Pharmacist Name');
      if (!rphCheck.valid) {
        return { ok: false, error: rphCheck.error || 'Licensed Pharmacist Name must contain letters only.' };
      }
      normalizedRph = rphCheck.normalized;
      const prcCheck = validateAndNormalizePrcLicense(input.pharmacist_license_no || '');
      if (!prcCheck.valid) {
        return { ok: false, error: prcCheck.error || 'Enter a valid 7-digit PRC License No.' };
      }
      normalizedPrc = prcCheck.normalized;
      const prcExists = state.merchants.some(
        (m) => m.pharmacist_license_no.toUpperCase() === normalizedPrc.toUpperCase()
      );
      if (prcExists) {
        return { ok: false, error: 'PRC License Number is already registered to another pharmacy.' };
      }
      if (!input.business_permit_url?.trim()) {
        return {
          ok: false,
          error: 'Please upload a valid Business Permit document for merchant verification.',
        };
      }
      if (!input.government_id_url?.trim()) {
        return {
          ok: false,
          error: 'Please upload a valid Government-Issued ID document for merchant verification.',
        };
      }
      if (!input.barangay_id || !input.street?.trim()) {
        return { ok: false, error: 'Please enter your pharmacy street address and Olongapo barangay.' };
      }
    }
    let normalizedPlate = '';
    if (input.role === 'rider') {
      if (!input.vehicle_type?.trim()) {
        return { ok: false, error: 'Please select your vehicle type.' };
      }
      const plateCheck = validateAndNormalizePHPlateNumber(
        input.plate_number || '',
        input.vehicle_type
      );
      if (!plateCheck.valid) {
        return { ok: false, error: plateCheck.error || 'Enter a valid Philippine LTO plate number.' };
      }
      normalizedPlate = plateCheck.normalized;
      const plateExists = state.riderProfiles.some(
        (r) => r.plate_number.toUpperCase() === normalizedPlate.toUpperCase()
      );
      if (plateExists) {
        return { ok: false, error: 'LTO Plate Number is already registered to another rider.' };
      }
      const riderDocsCheck = validateRiderVerificationDocs({
        driver_license_url: input.driver_license_url,
        vehicle_registration_url: input.vehicle_registration_url,
      });
      if (!riderDocsCheck.valid) {
        return {
          ok: false,
          error:
            riderDocsCheck.error ||
            "Please upload a valid Driver's License ID and Vehicle Registration Document.",
        };
      }
    }
    if (input.role === 'resident' && (!input.barangay_id || !input.street?.trim())) {
      return { ok: false, error: 'Please enter your house number and street address.' };
    }

    const fallbackCoords = getBarangayCenterCoords(input.barangay_id, state.barangays);
    let resolvedLat = fallbackCoords.lat;
    let resolvedLng = fallbackCoords.lng;
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      const check = validateOlongapoCoordinates(input.latitude, input.longitude);
      if (!check.valid) {
        return { ok: false, error: check.error || 'Invalid map pin coordinates.' };
      }
      resolvedLat = check.lat;
      resolvedLng = check.lng;
    }

    const nextUserId = Math.max(400, ...state.users.map((u) => u.user_id)) + 1;
    const status: AccountStatus = input.role === 'resident' ? 'approved' : 'pending';
    const nowIso = new Date().toISOString();
    const newUser: UserAccount = {
      user_id: nextUserId,
      role: input.role,
      phone_number: normalizedPhone,
      email: emailCheck.normalized,
      first_name: firstNameCheck.normalized,
      last_name: lastNameCheck.normalized,
      date_of_birth: input.date_of_birth,
      status,
      policy_accepted_at: nowIso,
      policy_version: input.policy_version || POLICY_VERSION,
      created_at: nowIso,
    };

    setState((prev) => {
      let addresses = prev.addresses;
      let merchants = prev.merchants;
      let merchantHours = prev.merchantHours;
      let riderProfiles = prev.riderProfiles;
      const householdFlags =
        input.role === 'resident'
          ? [
              ...prev.householdFlags,
              {
                user_id: nextUserId,
                has_senior: false,
                has_pwd: false,
                has_young_child: false,
                has_pregnant_member: false,
              },
            ]
          : prev.householdFlags;

      const nextAddrId = Math.max(0, ...prev.addresses.map((a) => a.address_id)) + 1;
      const resolvedShopName = input.shop_name?.trim() || `${lastNameCheck.normalized} Pharmacy`;
      let createdAddrId: number | null = null;
      if (input.barangay_id && input.street?.trim()) {
        createdAddrId = nextAddrId;
        addresses = [
          ...prev.addresses,
          {
            address_id: nextAddrId,
            user_id: nextUserId,
            barangay_id: input.barangay_id,
            recipient_name:
              input.role === 'merchant'
                ? resolvedShopName
                : `${firstNameCheck.normalized} ${lastNameCheck.normalized}`,
            recipient_phone: normalizedPhone,
            street: input.street.trim(),
            landmark: input.landmark?.trim() || undefined,
            latitude: resolvedLat,
            longitude: resolvedLng,
            is_primary: true,
            created_at: nowIso,
          },
        ];
      }

      if (input.role === 'merchant') {
        merchants = [
          ...prev.merchants,
          {
            merchant_id: nextUserId,
            user_id: nextUserId,
            shop_name: resolvedShopName,
            shop_address_id: createdAddrId ?? nextAddrId,
            is_pharmacist: true,
            pharmacist_name: normalizedRph || `${firstNameCheck.normalized} ${lastNameCheck.normalized}`,
            pharmacist_license_no: normalizedPrc,
            is_24_hours: false,
            is_temporarily_closed: false,
            contact_no: normalizedPhone,
            business_permit_name: input.business_permit_name?.trim() || 'business-permit',
            business_permit_url: input.business_permit_url?.trim(),
            government_id_name: input.government_id_name?.trim() || 'government-id',
            government_id_url: input.government_id_url?.trim(),
          },
        ];
        const baseHoursId = Math.max(0, ...prev.merchantHours.map((h) => h.hours_id)) + 1;
        merchantHours = [
          ...prev.merchantHours,
          ...[0, 1, 2, 3, 4, 5, 6].map((day, idx) => ({
            hours_id: baseHoursId + idx,
            merchant_id: nextUserId,
            day_of_week: day,
            opens_at: '08:00',
            closes_at: '20:00',
            is_closed: false,
          })),
        ];
      }

      if (input.role === 'rider') {
        riderProfiles = [
          ...prev.riderProfiles,
          {
            rider_id: nextUserId,
            user_id: nextUserId,
            vehicle_type: input.vehicle_type?.trim() || 'Motorcycle',
            plate_number: normalizedPlate,
            is_online: false,
            rating: 5.0,
            total_deliveries: 0,
            driver_license_name: input.driver_license_name?.trim() || 'driver-license',
            driver_license_url: input.driver_license_url?.trim(),
            vehicle_registration_name:
              input.vehicle_registration_name?.trim() || 'vehicle-registration',
            vehicle_registration_url: input.vehicle_registration_url?.trim(),
          },
        ];
      }

      const notifications = pushAdminNotifications(
        prev.notifications,
        prev.users,
        `New ${input.role} registration`,
        `${newUser.first_name} ${newUser.last_name} registered (${status})${
          input.role === 'merchant'
            ? ' with Business Permit & Gov ID attached.'
            : input.role === 'rider'
              ? " with Driver's License ID & Vehicle Registration attached."
              : '.'
        }`,
        'System'
      );

      const { cartsByUser } = applyIntentToCarts(
        prev,
        nextUserId,
        input.role === 'resident' ? pendingCartIntent : null
      );

      return {
        ...prev,
        currentUserId: nextUserId,
        users: [...prev.users, newUser],
        addresses,
        householdFlags,
        merchants,
        merchantHours,
        riderProfiles,
        notifications,
        cartsByUser,
      };
    });

    const activeIntent = input.role === 'resident' ? pendingCartIntent : null;
    const queuedProduct = activeIntent
      ? state.products.find((p) => p.product_id === activeIntent.productId)
      : null;

    if (activeIntent && queuedProduct) {
      setPendingCartIntent(null);
      setActiveTab('store');
      setPostAuthNotice(`Welcome to MedEx! Added ${queuedProduct.name} to your Olongapo cart.`);
      if (activeIntent.openCheckout) {
        setOpenCartAfterLogin(true);
      }
    } else {
      setPendingCartIntent(null);
      setActiveTab(defaultTabForRole(input.role));
    }
    return { ok: true, data: newUser };
  };

  const registerWithCredentials: MedExContextValue['registerWithCredentials'] = async (input) => {
    if (!canRegisterRolePublicly(input.role)) {
      return {
        ok: false,
        error:
          'Public sign-up is strictly limited to Customer, Store/Merchant, and Delivery Rider accounts.',
      };
    }
    const firstNameCheck = validatePersonName(input.first_name, 'First Name');
    if (!firstNameCheck.valid) {
      return { ok: false, error: firstNameCheck.error || 'First Name must contain letters only.' };
    }
    const lastNameCheck = validatePersonName(input.last_name, 'Last Name');
    if (!lastNameCheck.valid) {
      return { ok: false, error: lastNameCheck.error || 'Last Name must contain letters only.' };
    }
    const passwordCheck = validatePasswordStrength(input.password || '');
    if (!passwordCheck.valid) {
      return {
        ok: false,
        error:
          passwordCheck.error ||
          'Password must include at least 8 characters, uppercase, lowercase, number, and special character.',
      };
    }
    const emailCheck = validateSignupEmail(input.email);
    if (!emailCheck.valid) {
      return {
        ok: false,
        error: emailCheck.error || 'Only valid @gmail.com email addresses are accepted for sign up.',
      };
    }
    if (input.policy_accepted !== true) {
      return {
        ok: false,
        error: 'You must review and acknowledge the MedEx Platform Policies before registering.',
      };
    }
    if (!isMySqlBackendActive()) {
      return registerAccount({
        ...input,
        first_name: firstNameCheck.normalized,
        last_name: lastNameCheck.normalized,
        email: emailCheck.normalized,
      });
    }
    const normalizedPhone = normalizePHPhoneNumber(input.phone_number);
    if (!normalizedPhone) {
      return { ok: false, error: 'Enter a valid Philippine mobile number (e.g., 09171234567 or +639171234567).' };
    }
    if (!isAtLeast18(input.date_of_birth)) {
      return { ok: false, error: 'Residents and partners must be at least 18 years old to register.' };
    }
    let normalizedPrc: string | undefined;
    let normalizedRph: string | undefined;
    if (input.role === 'merchant') {
      if (!input.shop_name?.trim()) {
        return { ok: false, error: 'Please enter your pharmacy store name.' };
      }
      const rphCheck = validatePersonName(input.pharmacist_name || '', 'Licensed Pharmacist Name');
      if (!rphCheck.valid) {
        return { ok: false, error: rphCheck.error || 'Licensed Pharmacist Name must contain letters only.' };
      }
      normalizedRph = rphCheck.normalized;
      const prcCheck = validateAndNormalizePrcLicense(input.pharmacist_license_no || '');
      if (!prcCheck.valid) {
        return { ok: false, error: prcCheck.error || 'Enter a valid 7-digit PRC License No.' };
      }
      normalizedPrc = prcCheck.normalized;
      if (!input.business_permit_url?.trim()) {
        return {
          ok: false,
          error: 'Please upload a valid Business Permit document for merchant verification.',
        };
      }
      if (!input.government_id_url?.trim()) {
        return {
          ok: false,
          error: 'Please upload a valid Government-Issued ID document for merchant verification.',
        };
      }
      if (!input.barangay_id || !input.street?.trim()) {
        return { ok: false, error: 'Please enter your pharmacy street address and Olongapo barangay.' };
      }
    }
    let normalizedPlate: string | undefined;
    if (input.role === 'rider') {
      if (!input.vehicle_type?.trim()) {
        return { ok: false, error: 'Please select your vehicle type.' };
      }
      const plateCheck = validateAndNormalizePHPlateNumber(
        input.plate_number || '',
        input.vehicle_type
      );
      if (!plateCheck.valid) {
        return { ok: false, error: plateCheck.error || 'Enter a valid Philippine LTO plate number.' };
      }
      normalizedPlate = plateCheck.normalized;
      const riderDocsCheck = validateRiderVerificationDocs({
        driver_license_url: input.driver_license_url,
        vehicle_registration_url: input.vehicle_registration_url,
      });
      if (!riderDocsCheck.valid) {
        return {
          ok: false,
          error:
            riderDocsCheck.error ||
            "Please upload a valid Driver's License ID and Vehicle Registration Document.",
        };
      }
    }
    if (input.role === 'resident' && (!input.barangay_id || !input.street?.trim())) {
      return { ok: false, error: 'Please enter your house number and street address.' };
    }

    const fallbackCoords = getBarangayCenterCoords(input.barangay_id, state.barangays);
    let resolvedLat = fallbackCoords.lat;
    let resolvedLng = fallbackCoords.lng;
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      const check = validateOlongapoCoordinates(input.latitude, input.longitude);
      if (!check.valid) {
        return { ok: false, error: check.error || 'Invalid map pin coordinates.' };
      }
      resolvedLat = check.lat;
      resolvedLng = check.lng;
    }

    const res = await signUpMySqlAccount(input.password!, {
      role: input.role,
      first_name: firstNameCheck.normalized,
      last_name: lastNameCheck.normalized,
      email: emailCheck.normalized,
      phone_number: normalizedPhone,
      date_of_birth: input.date_of_birth,
      barangay_id: input.barangay_id,
      street: input.street?.trim(),
      landmark: input.landmark?.trim(),
      latitude: resolvedLat,
      longitude: resolvedLng,
      shop_name: input.shop_name?.trim(),
      pharmacist_name: normalizedRph,
      pharmacist_license_no: normalizedPrc,
      business_permit_name: input.business_permit_name?.trim(),
      business_permit_url: input.business_permit_url?.trim(),
      government_id_name: input.government_id_name?.trim(),
      government_id_url: input.government_id_url?.trim(),
      vehicle_type: input.vehicle_type?.trim(),
      plate_number: normalizedPlate,
      driver_license_name: input.driver_license_name?.trim(),
      driver_license_url: input.driver_license_url?.trim(),
      vehicle_registration_name: input.vehicle_registration_name?.trim(),
      vehicle_registration_url: input.vehicle_registration_url?.trim(),
      policy_accepted: true,
      policy_version: input.policy_version || POLICY_VERSION,
    });

    if (!res.ok) {
      return { ok: false, error: res.error || 'Registration failed.' };
    }
    if (res.user) {
      const snap = await hydrateMedExStateFromMySql();
      if (snap) {
        applyDbSnapshot(snap);
      }
      finalizeSignedInUser(res.user);
      return { ok: true, data: res.user };
    }
    return { ok: false, error: 'Could not finalize registration.' };
  };

  const updateUserProfile = (first: string, last: string, phone: string): ActionResult => {
    const firstCheck = validatePersonName(first, 'First Name');
    if (!firstCheck.valid) {
      return { ok: false, error: firstCheck.error || 'First Name must contain letters only.' };
    }
    const lastCheck = validatePersonName(last, 'Last Name');
    if (!lastCheck.valid) {
      return { ok: false, error: lastCheck.error || 'Last Name must contain letters only.' };
    }
    const normalized = normalizePHPhoneNumber(phone);
    if (!normalized) return { ok: false, error: 'Invalid Philippine phone number.' };
    const duplicate = state.users.some(
      (u) => u.user_id !== currentUser.user_id && u.phone_number === normalized
    );
    if (duplicate) return { ok: false, error: 'Phone number already used by another account.' };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.user_id === currentUser.user_id
          ? {
              ...u,
              first_name: firstCheck.normalized,
              last_name: lastCheck.normalized,
              phone_number: normalized,
            }
          : u
      ),
    }));
    syncUserProfileToDb(currentUser.user_id, firstCheck.normalized, lastCheck.normalized, normalized);
    return { ok: true };
  };

  const saveAddress: MedExContextValue['saveAddress'] = (addr) => {
    const normalized = normalizePHPhoneNumber(addr.recipient_phone);
    if (!normalized) return { ok: false, error: 'Invalid recipient phone number.' };
    if (!addr.street.trim()) return { ok: false, error: 'Street or house number is required.' };

    const userAddresses = state.addresses.filter((a) => a.user_id === currentUser.user_id);
    const shouldBePrimary = addr.is_primary || userAddresses.length === 0;
    const isNew = !addr.address_id;
    const nextId =
      addr.address_id ||
      (isMySqlBackendActive()
        ? -Date.now()
        : Math.max(0, ...state.addresses.map((a) => a.address_id)) + 1);
    const existingTarget = addr.address_id
      ? state.addresses.find((a) => a.address_id === addr.address_id)
      : undefined;
    const savedAddress: Address = existingTarget
      ? { ...existingTarget, ...addr, recipient_phone: normalized, is_primary: shouldBePrimary }
      : {
          ...addr,
          address_id: nextId,
          user_id: currentUser.user_id,
          recipient_phone: normalized,
          is_primary: shouldBePrimary,
          created_at: new Date().toISOString(),
        };

    setState((prev) => {
      let updated = prev.addresses.map((a) =>
        a.user_id === currentUser.user_id && shouldBePrimary ? { ...a, is_primary: false } : a
      );

      if (addr.address_id) {
        updated = updated.map((a) => (a.address_id === addr.address_id ? savedAddress : a));
      } else {
        updated = [...updated, savedAddress];
      }
      return { ...prev, addresses: updated };
    });
    void syncSaveAddressToDb(savedAddress, isNew).then((res) => {
      if (res.ok && res.address) {
        const persisted = res.address;
        setState((prev) => ({
          ...prev,
          addresses: prev.addresses.map((a) => (a.address_id === savedAddress.address_id ? persisted : a)),
        }));
      }
    });
    return { ok: true };
  };

  const deleteAddress = (addressId: number) => {
    setState((prev) => {
      const remaining = prev.addresses.filter((a) => a.address_id !== addressId);
      const userAddrs = remaining.filter((a) => a.user_id === currentUser.user_id);
      if (userAddrs.length > 0 && !userAddrs.some((a) => a.is_primary)) {
        const firstId = userAddrs[0].address_id;
        syncSetPrimaryAddressToDb(currentUser.user_id, firstId);
        return {
          ...prev,
          addresses: remaining.map((a) => (a.address_id === firstId ? { ...a, is_primary: true } : a)),
        };
      }
      return { ...prev, addresses: remaining };
    });
    syncDeleteAddressToDb(addressId);
  };

  const setPrimaryAddress = (addressId: number) => {
    setState((prev) => ({
      ...prev,
      addresses: prev.addresses.map((a) =>
        a.user_id === currentUser.user_id ? { ...a, is_primary: a.address_id === addressId } : a
      ),
    }));
    syncSetPrimaryAddressToDb(currentUser.user_id, addressId);
  };

  const updateHouseholdFlags = (flags: Omit<HouseholdFlags, 'user_id'>) => {
    setState((prev) => {
      const exists = prev.householdFlags.some((f) => f.user_id === currentUser.user_id);
      const next = exists
        ? prev.householdFlags.map((f) =>
            f.user_id === currentUser.user_id ? { user_id: currentUser.user_id, ...flags } : f
          )
        : [...prev.householdFlags, { user_id: currentUser.user_id, ...flags }];
      return { ...prev, householdFlags: next };
    });
    syncHouseholdFlagsToDb({ user_id: currentUser.user_id, ...flags });
  };

  const saveEmergencyContact: MedExContextValue['saveEmergencyContact'] = (contact) => {
    const normalized = normalizePHPhoneNumber(contact.phone_number);
    if (!normalized) return { ok: false, error: 'Invalid emergency contact phone number.' };
    if (!contact.contact_name.trim() || !contact.relationship.trim()) {
      return { ok: false, error: 'Contact name and relationship are required.' };
    }
    const isNew = !contact.contact_id;
    const existingContact = contact.contact_id
      ? state.emergencyContacts.find((c) => c.contact_id === contact.contact_id)
      : undefined;
    const tempId = isMySqlBackendActive()
      ? -Date.now()
      : Math.max(0, ...state.emergencyContacts.map((c) => c.contact_id)) + 1;
    const savedContact: EmergencyContact = existingContact
      ? { ...existingContact, ...contact, phone_number: normalized }
      : {
          ...contact,
          contact_id: tempId,
          user_id: currentUser.user_id,
          phone_number: normalized,
          created_at: new Date().toISOString(),
        };

    setState((prev) => {
      if (contact.contact_id) {
        return {
          ...prev,
          emergencyContacts: prev.emergencyContacts.map((c) =>
            c.contact_id === contact.contact_id ? savedContact : c
          ),
        };
      }
      return {
        ...prev,
        emergencyContacts: [...prev.emergencyContacts, savedContact],
      };
    });
    void syncSaveEmergencyContactToDb(savedContact, isNew).then((res) => {
      if (res.ok && res.contact) {
        const persisted = res.contact;
        setState((prev) => ({
          ...prev,
          emergencyContacts: prev.emergencyContacts.map((c) =>
            c.contact_id === savedContact.contact_id ? persisted : c
          ),
        }));
      }
    });
    return { ok: true };
  };

  const deleteEmergencyContact = (contactId: number) => {
    setState((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((c) => c.contact_id !== contactId),
    }));
    syncDeleteEmergencyContactToDb(contactId);
  };

  const addToCart: MedExContextValue['addToCart'] = (productId, quantity, replaceCart = false) => {
    const product = state.products.find((p) => p.product_id === productId);
    if (!product) return { ok: false, error: 'Product not found.' };
    if (product.stock_quantity <= 0) return { ok: false, error: 'This product is out of stock.' };

    const existingCart = activeCart;
    if (
      !replaceCart &&
      existingCart.merchant_id !== null &&
      existingCart.merchant_id !== product.merchant_id &&
      existingCart.items.length > 0
    ) {
      const otherMerchant = state.merchants.find((m) => m.merchant_id === existingCart.merchant_id);
      return {
        ok: false,
        error: 'Your cart contains items from another pharmacy.',
        data: { conflictMerchantName: otherMerchant?.shop_name || 'another pharmacy' },
      };
    }

    const baseItems = replaceCart ? [] : existingCart.items;
    const existingItem = baseItems.find((i) => i.product_id === productId);
    const desiredQty = (existingItem?.quantity || 0) + quantity;

    const limitCheck = validateCartItemLimit({
      requestedQuantity: desiredQty,
      stockQuantity: product.stock_quantity,
      purchaseLimit: product.purchase_limit,
      productName: product.name,
    });
    if (!limitCheck.valid) {
      return { ok: false, error: limitCheck.error || 'Requested quantity exceeds limit.' };
    }

    const updatedItems = existingItem
      ? baseItems.map((i) => (i.product_id === productId ? { ...i, quantity: desiredQty } : i))
      : [...baseItems, { product_id: productId, quantity: desiredQty }];

    setState((prev) => ({
      ...prev,
      cartsByUser: {
        ...prev.cartsByUser,
        [currentUser.user_id]: {
          merchant_id: product.merchant_id,
          items: updatedItems,
        },
      },
    }));
    return { ok: true };
  };

  const updateCartQuantity = (productId: number, quantity: number): ActionResult => {
    if (quantity <= 0) {
      setState((prev) => {
        const cart = prev.cartsByUser[currentUser.user_id] || { merchant_id: null, items: [] };
        const nextItems = cart.items.filter((i) => i.product_id !== productId);
        return {
          ...prev,
          cartsByUser: {
            ...prev.cartsByUser,
            [currentUser.user_id]: {
              merchant_id: nextItems.length > 0 ? cart.merchant_id : null,
              items: nextItems,
            },
          },
        };
      });
      return { ok: true };
    }
    const product = state.products.find((p) => p.product_id === productId);
    if (!product) return { ok: false, error: 'Product not found.' };
    const limitCheck = validateCartItemLimit({
      requestedQuantity: quantity,
      stockQuantity: product.stock_quantity,
      purchaseLimit: product.purchase_limit,
      productName: product.name,
    });
    if (!limitCheck.valid) {
      return { ok: false, error: limitCheck.error || 'Requested quantity exceeds limit.' };
    }
    setState((prev) => {
      const cart = prev.cartsByUser[currentUser.user_id] || { merchant_id: null, items: [] };
      return {
        ...prev,
        cartsByUser: {
          ...prev.cartsByUser,
          [currentUser.user_id]: {
            ...cart,
            items: cart.items.map((i) => (i.product_id === productId ? { ...i, quantity } : i)),
          },
        },
      };
    });
    return { ok: true };
  };

  const clearCart = () => {
    setState((prev) => ({
      ...prev,
      cartsByUser: {
        ...prev.cartsByUser,
        [currentUser.user_id]: { merchant_id: null, items: [] },
      },
    }));
  };

  const placeOrder: MedExContextValue['placeOrder'] = async (input) => {
    const existingByKey = state.orders.find((o) => o.idempotency_key === input.idempotency_key);
    if (existingByKey) {
      return { ok: true, data: existingByKey };
    }
    if (activeCart.items.length === 0 || !activeCart.merchant_id) {
      return { ok: false, error: 'Your cart is empty.' };
    }
    const addr = state.addresses.find((a) => a.address_id === input.address_id);
    if (!addr) return { ok: false, error: 'Please select a valid delivery address.' };
    const normalizedPhone = normalizePHPhoneNumber(input.recipient_phone);
    if (!normalizedPhone) return { ok: false, error: 'Enter a valid recipient mobile number.' };

    const merchant = state.merchants.find((m) => m.merchant_id === activeCart.merchant_id);
    if (!merchant) return { ok: false, error: 'Merchant not found.' };

    const itemsWithProducts = activeCart.items.map((ci) => {
      const product = state.products.find((p) => p.product_id === ci.product_id);
      return { ci, product };
    });

    for (const { ci, product } of itemsWithProducts) {
      if (!product || !product.is_listed || product.is_archived) {
        return { ok: false, error: 'An item in your cart is no longer available.' };
      }
      const limitCheck = validateCartItemLimit({
        requestedQuantity: ci.quantity,
        stockQuantity: product.stock_quantity,
        purchaseLimit: product.purchase_limit,
        productName: product.name,
      });
      if (!limitCheck.valid) {
        return { ok: false, error: limitCheck.error || `${product.name} stock or limit exceeded.` };
      }
    }

    const hasRx = itemsWithProducts.some(({ product }) => product!.requires_prescription);
    if (hasRx && !input.prescription) {
      return { ok: false, error: 'Prescription details and file upload are required for Rx items.' };
    }

    const nextOrderId = Math.max(5000, ...state.orders.map((o) => o.order_id)) + 1;
    const orderCode = buildUniqueOrderCode();
    const receiptNumber = buildUniqueReceiptNumber();
    const orderItems = itemsWithProducts.map(({ ci, product }, idx) => ({
      order_item_id: nextOrderId * 10 + idx + 1,
      order_id: nextOrderId,
      product_id: product!.product_id,
      merchant_id: merchant.merchant_id,
      product_name: product!.name,
      unit: product!.unit,
      requires_prescription: product!.requires_prescription,
      unit_price: product!.regular_price,
      quantity: ci.quantity,
    }));

    const subtotal = Number(
      orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0).toFixed(2)
    );
    const deliveryFee = 45.0;

    // Coupon validation & discount calculation
    const normalizedCouponCode = input.coupon_code ? normalizeCouponCode(input.coupon_code) : '';
    let appliedCoupon: Coupon | null = null;
    let discountAmount = 0;
    if (normalizedCouponCode) {
      const matchedCoupon = state.coupons.find(
        (c) => c.code.toUpperCase() === normalizedCouponCode
      );
      if (!matchedCoupon) {
        if (!isMySqlBackendActive()) {
          const failLog: CouponRedemptionLog = {
            redemption_id: Math.max(0, ...state.couponRedemptions.map((r) => r.redemption_id)) + 1,
            coupon_id: null,
            coupon_code: normalizedCouponCode,
            resident_id: currentUser.user_id,
            order_id: null,
            discount_amount: 0,
            status: 'failed',
            failure_reason: 'Coupon code not found',
            created_at: new Date().toISOString(),
          };
          setState((prev) => ({
            ...prev,
            couponRedemptions: [failLog, ...prev.couponRedemptions],
          }));
        }
        return { ok: false, error: `Coupon code "${normalizedCouponCode}" is invalid.` };
      }

      if (!isMySqlBackendActive()) {
        const prevOrdersCount = state.orders.filter(
          (o) => o.resident_id === currentUser.user_id && o.status !== 'cancelled'
        ).length;
        const userUsageCount = state.couponRedemptions.filter(
          (r) =>
            r.coupon_id === matchedCoupon.coupon_id &&
            r.resident_id === currentUser.user_id &&
            r.status === 'redeemed'
        ).length;
        const claim = state.customerCoupons.find(
          (cc) => cc.coupon_id === matchedCoupon.coupon_id && cc.resident_id === currentUser.user_id
        );
        const check = validateAndCalculateCouponDiscount({
          coupon: matchedCoupon,
          residentId: currentUser.user_id,
          merchantId: merchant.merchant_id,
          cartItems: orderItems.map((oi) => ({
            product_id: oi.product_id,
            quantity: oi.quantity,
            unit_price: oi.unit_price,
          })),
          subtotal,
          customerClaim: claim ?? null,
          residentPreviousOrdersCount: prevOrdersCount,
          residentCouponUsageCount: userUsageCount,
        });
        if (!check.valid) {
          const failLog: CouponRedemptionLog = {
            redemption_id: Math.max(0, ...state.couponRedemptions.map((r) => r.redemption_id)) + 1,
            coupon_id: matchedCoupon.coupon_id,
            coupon_code: matchedCoupon.code,
            resident_id: currentUser.user_id,
            order_id: null,
            discount_amount: 0,
            status: 'failed',
            failure_reason: check.reason || 'Ineligible',
            created_at: new Date().toISOString(),
          };
          setState((prev) => ({
            ...prev,
            couponRedemptions: [failLog, ...prev.couponRedemptions],
          }));
          return { ok: false, error: check.reason || 'Coupon is not eligible for this order.' };
        }
        appliedCoupon = matchedCoupon;
        discountAmount = check.discountAmount;
      } else {
        // Server will re-validate authoritatively in SQL transaction; send normalized code
        const serverCheck = await validateCouponOnServer({
          code: normalizedCouponCode,
          merchant_id: merchant.merchant_id,
          items: orderItems.map((oi) => ({ product_id: oi.product_id, quantity: oi.quantity })),
        });
        if (!serverCheck.ok || !serverCheck.coupon) {
          return { ok: false, error: serverCheck.error || 'Coupon is not eligible for this order.' };
        }
        appliedCoupon = serverCheck.coupon;
        discountAmount = Number(serverCheck.discountAmount ?? 0);
      }
    }

    const totalAmount = Number((Math.max(0, subtotal - discountAmount) + deliveryFee).toFixed(2));

    const merchantHours = state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id);
    const openStatus = getMerchantOpenStatus(merchant, merchantHours);

    let initialStatus: OrderStatus = 'placed';
    if (hasRx) {
      initialStatus = 'awaiting_prescription_review';
    } else if (!openStatus.isOpen) {
      initialStatus = 'pending';
    }

    const deferGcash = input.payment_method === 'GCash' && !hasRx && input.deferGcashToGateway;
    const gcashFailed = input.payment_method === 'GCash' && !hasRx && !deferGcash && input.simulateGcashFail;
    const paymentStatus =
      input.payment_method === 'COD' || hasRx || deferGcash
        ? 'pending'
        : gcashFailed
          ? 'failed'
          : 'paid';

    if (gcashFailed || deferGcash) {
      initialStatus = 'pending';
    }

    const brgy = state.barangays.find((b) => b.barangay_id === addr.barangay_id);
    const nowIso = new Date().toISOString();

    const draftOrder: Order = {
      order_id: nextOrderId,
      order_code: orderCode,
      idempotency_key: input.idempotency_key,
      resident_id: currentUser.user_id,
      merchant_id: merchant.merchant_id,
      alert_id: null,
      address_id: addr.address_id,
      delivery_address_snapshot: `${addr.street}${brgy ? `, Brgy. ${brgy.name}, ${brgy.city}` : ''}`,
      recipient_name: input.recipient_name.trim(),
      recipient_phone: normalizedPhone,
      rider_note: input.rider_note.trim() || undefined,
      subtotal,
      delivery_fee: deliveryFee,
      coupon_id: appliedCoupon?.coupon_id ?? null,
      coupon_code: appliedCoupon?.code ?? null,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      status: initialStatus,
      placed_at: nowIso,
      items: orderItems,
      status_history: [
        {
          history_id: 1,
          order_id: nextOrderId,
          status: initialStatus,
          note: hasRx
            ? 'Awaiting pharmacist prescription review'
            : deferGcash
              ? 'Awaiting GCash sandbox authorization'
              : !openStatus.isOpen
                ? `Pharmacy closed (${openStatus.nextOpeningText}); order queued as pending`
                : gcashFailed
                  ? 'GCash payment failed; awaiting retry or COD switch'
                  : 'Order confirmed',
          created_at: nowIso,
        },
      ],
      prescription:
        hasRx && input.prescription
          ? {
              prescription_id: nextOrderId + 100,
              order_id: nextOrderId,
              resident_id: currentUser.user_id,
              merchant_id: merchant.merchant_id,
              patient_name: input.prescription.patient_name,
              doctor_name: input.prescription.doctor_name,
              license_no: input.prescription.license_no,
              date_issued: input.prescription.date_issued,
              valid_until: input.prescription.valid_until || undefined,
              file_name: input.prescription.file_name,
              file_type: input.prescription.file_type,
              file_preview_url: input.prescription.file_preview_url,
              status: 'pending_review',
              created_at: nowIso,
            }
          : undefined,
      payment: {
        payment_id: nextOrderId + 2000,
        order_id: nextOrderId,
        method: input.payment_method,
        idempotency_key: `pay-${input.idempotency_key}`,
        receipt_number: receiptNumber,
        amount: totalAmount,
        amount_collected: null,
        is_flagged: false,
        failure_reason: gcashFailed ? 'PayMongo sandbox declined simulated charge' : undefined,
        status: paymentStatus,
        gateway_reference:
          paymentStatus === 'paid' ? `PM-SANDBOX-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : undefined,
        is_simulated_sandbox: input.payment_method === 'GCash',
        paid_at: paymentStatus === 'paid' ? nowIso : undefined,
        created_at: nowIso,
      },
    };

    let finalOrder = draftOrder;
    if (isMySqlBackendActive()) {
      const dbRes = await syncOrderPlacementToDb(draftOrder);
      if (!dbRes.ok || !dbRes.order) {
        return { ok: false, error: dbRes.error || 'Could not persist order to database.' };
      }
      finalOrder = dbRes.order;
    }

    setState((prev) => {
      const lowStockTriggered: Product[] = [];
      const saleMovements: InventoryMovement[] = [];
      let nextMovementId = Math.max(0, ...prev.inventoryMovements.map((m) => m.movement_id)) + 1;
      const actorFullName = `${currentUser.first_name} ${currentUser.last_name}`.trim();

      const updatedProducts = prev.products.map((p) => {
        const ordered = finalOrder.items.find((oi) => oi.product_id === p.product_id);
        if (!ordered) return p;
        const nextStock = Math.max(0, p.stock_quantity - ordered.quantity);
        const nextProd = { ...p, stock_quantity: nextStock, updated_at: nowIso };
        if (nextStock <= p.low_stock_threshold) {
          lowStockTriggered.push(nextProd);
        }
        if (!isMySqlBackendActive()) {
          saleMovements.push({
            movement_id: nextMovementId++,
            product_id: p.product_id,
            merchant_id: p.merchant_id,
            product_name: p.name,
            actor_id: currentUser.user_id,
            actor_name: actorFullName,
            actor_role: currentUser.role,
            movement_type: 'sale_deduction',
            quantity_delta: -ordered.quantity,
            stock_before: p.stock_quantity,
            stock_after: nextStock,
            reference_order_id: finalOrder.order_id,
            note: `Order ${finalOrder.order_code}`,
            created_at: nowIso,
          });
        }
        return nextProd;
      });
      let notifications = pushNotification(
        prev.notifications,
        merchant.user_id,
        `New order ${finalOrder.order_code}`,
        hasRx ? 'Prescription verification required before preparation.' : 'New medicine order received.',
        hasRx ? 'Prescription' : 'Order'
      );
      for (const lp of lowStockTriggered) {
        notifications = pushNotification(
          notifications,
          merchant.user_id,
          lp.stock_quantity <= 0 ? `Out of stock: ${lp.name}` : `Low stock alert: ${lp.name}`,
          `Order ${finalOrder.order_code} reduced ${lp.name} to ${lp.stock_quantity} unit(s) (threshold: ${lp.low_stock_threshold}).`,
          'System'
        );
      }
      notifications = pushNotification(
        notifications,
        currentUser.user_id,
        `Order ${finalOrder.order_code} placed`,
        `Total: ₱${finalOrder.total_amount.toFixed(2)} via ${input.payment_method}${
          finalOrder.discount_amount && finalOrder.discount_amount > 0
            ? ` (Saved ₱${finalOrder.discount_amount.toFixed(2)} with ${finalOrder.coupon_code})`
            : ''
        }.`,
        'Order'
      );

      let nextCoupons = prev.coupons;
      let nextCustomerCoupons = prev.customerCoupons;
      let nextCouponRedemptions = prev.couponRedemptions;
      if (appliedCoupon && finalOrder.discount_amount && finalOrder.discount_amount > 0) {
        nextCoupons = prev.coupons.map((c) =>
          c.coupon_id === appliedCoupon!.coupon_id
            ? { ...c, times_used: c.times_used + 1, updated_at: nowIso }
            : c
        );
        const existingClaim = prev.customerCoupons.find(
          (cc) =>
            cc.coupon_id === appliedCoupon!.coupon_id &&
            cc.resident_id === currentUser.user_id
        );
        nextCustomerCoupons = existingClaim
          ? prev.customerCoupons.map((cc) =>
              cc.claim_id === existingClaim.claim_id
                ? { ...cc, status: 'used' as const, used_at: nowIso, order_id: finalOrder.order_id }
                : cc
            )
          : [
              {
                claim_id: Math.max(0, ...prev.customerCoupons.map((cc) => cc.claim_id)) + 1,
                coupon_id: appliedCoupon.coupon_id,
                resident_id: currentUser.user_id,
                status: 'used' as const,
                claimed_at: nowIso,
                used_at: nowIso,
                order_id: finalOrder.order_id,
              },
              ...prev.customerCoupons,
            ];
        nextCouponRedemptions = [
          {
            redemption_id: Math.max(0, ...prev.couponRedemptions.map((r) => r.redemption_id)) + 1,
            coupon_id: appliedCoupon.coupon_id,
            coupon_code: appliedCoupon.code,
            resident_id: currentUser.user_id,
            order_id: finalOrder.order_id,
            discount_amount: finalOrder.discount_amount,
            status: 'redeemed',
            created_at: nowIso,
          },
          ...prev.couponRedemptions,
        ];
      }

      return {
        ...prev,
        products: updatedProducts,
        orders: [finalOrder, ...prev.orders],
        notifications,
        coupons: nextCoupons,
        customerCoupons: nextCustomerCoupons,
        couponRedemptions: nextCouponRedemptions,
        inventoryMovements:
          saleMovements.length > 0
            ? [...saleMovements, ...prev.inventoryMovements]
            : prev.inventoryMovements,
        cartsByUser: {
          ...prev.cartsByUser,
          [currentUser.user_id]: { merchant_id: null, items: [] },
        },
      };
    });

    return { ok: true, data: finalOrder };
  };

  const cancelOrder = (orderId: number, reason: string): ActionResult => {
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (['ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.status)) {
      return { ok: false, error: 'Order can no longer be cancelled after preparation/pickup.' };
    }
    const nowIso = new Date().toISOString();
    const cancelReason = reason.trim() || 'Cancelled by resident';
    const noteText = reason.trim() || 'Cancelled by resident; reserved stock released';
    setState((prev) => {
      const restockMovements: InventoryMovement[] = [];
      let nextMovementId = Math.max(0, ...prev.inventoryMovements.map((m) => m.movement_id)) + 1;
      const actorFullName = `${currentUser.first_name} ${currentUser.last_name}`.trim();
      const restoredProducts = prev.products.map((p) => {
        const item = order.items.find((i) => i.product_id === p.product_id);
        if (!item) return p;
        const nextStock = p.stock_quantity + item.quantity;
        if (!isMySqlBackendActive()) {
          restockMovements.push({
            movement_id: nextMovementId++,
            product_id: p.product_id,
            merchant_id: p.merchant_id,
            product_name: p.name,
            actor_id: currentUser.user_id,
            actor_name: actorFullName,
            actor_role: currentUser.role,
            movement_type: 'cancel_restock',
            quantity_delta: item.quantity,
            stock_before: p.stock_quantity,
            stock_after: nextStock,
            reference_order_id: order.order_id,
            note: `Order ${order.order_code} cancelled`,
            created_at: nowIso,
          });
        }
        return { ...p, stock_quantity: nextStock, updated_at: nowIso };
      });
      return {
        ...prev,
        products: restoredProducts,
        inventoryMovements:
          restockMovements.length > 0
            ? [...restockMovements, ...prev.inventoryMovements]
            : prev.inventoryMovements,
        orders: prev.orders.map((o) =>
          o.order_id === orderId
            ? {
                ...o,
                status: 'cancelled',
                cancel_reason: cancelReason,
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: orderId,
                    status: 'cancelled',
                    note: noteText,
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });
    void syncCancelOrderToDb(orderId, noteText);
    return { ok: true };
  };

  const reuploadPrescription = (
    orderId: number,
    rx: NonNullable<CheckoutInput['prescription']>
  ): ActionResult => {
    const existingOrder = state.orders.find((o) => o.order_id === orderId);
    if (!existingOrder) return { ok: false, error: 'Order not found.' };
    const nowIso = new Date().toISOString();
    const nextRx: NonNullable<Order['prescription']> = {
      prescription_id: (existingOrder.prescription?.prescription_id || 900) + 1,
      order_id: orderId,
      resident_id: existingOrder.resident_id,
      merchant_id: existingOrder.merchant_id,
      ...rx,
      status: 'pending_review',
      created_at: nowIso,
    };
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.order_id === orderId
          ? {
              ...o,
              status: 'awaiting_prescription_review',
              prescription: nextRx,
              status_history: [
                ...o.status_history,
                {
                  history_id: o.status_history.length + 1,
                  order_id: orderId,
                  status: 'awaiting_prescription_review',
                  note: 'New prescription document uploaded by resident',
                  created_at: nowIso,
                },
              ],
            }
          : o
      ),
    }));
    syncPrescriptionReuploadToDb(orderId, nextRx);
    return { ok: true };
  };

  const retryGcashPayment = (
    orderId: number,
    shouldSucceed: boolean,
    gcashMobile?: string,
    serverGatewayReference?: string,
    isLiveGateway = false,
    backendDbSynced = false
  ): ActionResult => {
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.prescription && order.prescription.status !== 'approved') {
      return { ok: false, error: 'GCash cannot be charged before pharmacist approves the prescription.' };
    }
    const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
    const merchantHours = merchant
      ? state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id)
      : [];
    const openStatus = merchant
      ? getMerchantOpenStatus(merchant, merchantHours)
      : { isOpen: true, label: 'Open', nextOpeningText: '' };

    const nowIso = new Date().toISOString();
    const resolvedGatewayRef =
      serverGatewayReference || `PM-GCASH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const nextOrderStatus: OrderStatus = shouldSucceed
      ? order.status === 'pending'
        ? openStatus.isOpen
          ? 'placed'
          : 'pending'
        : order.status
      : 'pending';
    const nextPayment = {
      ...order.payment,
      status: shouldSucceed ? ('paid' as const) : ('failed' as const),
      is_simulated_sandbox: !isLiveGateway,
      failure_reason: shouldSucceed
        ? undefined
        : 'PayMongo sandbox declined GCash authorization',
      gateway_reference: shouldSucceed ? resolvedGatewayRef : undefined,
      paid_at: shouldSucceed ? nowIso : undefined,
    };
    const historyNote = shouldSucceed
      ? isLiveGateway
        ? `GCash payment verified via PayMongo API (${resolvedGatewayRef})`
        : gcashMobile
          ? `GCash payment authorized via PayMongo backend sandbox (${gcashMobile})`
          : 'GCash payment authorized via PayMongo backend sandbox'
      : 'GCash authorization declined in PayMongo sandbox';

    setState((prev) => {
      const updatedOrders = prev.orders.map((o) => {
        if (o.order_id !== orderId) return o;
        return {
          ...o,
          status: nextOrderStatus,
          payment: nextPayment,
          status_history: [
            ...o.status_history,
            {
              history_id: o.status_history.length + 1,
              order_id: orderId,
              status: nextOrderStatus,
              note: historyNote,
              created_at: nowIso,
            },
          ],
        };
      });

      const notifications =
        shouldSucceed && merchant
          ? pushNotification(
              prev.notifications,
              merchant.user_id,
              `GCash paid for ${order.order_code}`,
              `Customer authorized ₱${order.total_amount.toFixed(2)} via GCash. Ready for pharmacy preparation.`,
              'Order'
            )
          : prev.notifications;

      return { ...prev, orders: updatedOrders, notifications };
    });
    if (!backendDbSynced) {
      void syncPaymentUpdateToDb(orderId, nextPayment);
      void syncOrderStatusUpdateToDb(orderId, nextOrderStatus, historyNote);
    }
    return { ok: true };
  };

  const switchPaymentToCod = (orderId: number): ActionResult => {
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    const nowIso = new Date().toISOString();
    const nextStatus: OrderStatus =
      order.prescription?.status === 'pending_review' ? 'awaiting_prescription_review' : 'placed';
    const nextPayment = {
      ...order.payment,
      method: 'COD' as const,
      status: 'pending' as const,
      failure_reason: undefined,
      is_simulated_sandbox: false,
    };
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.order_id === orderId
          ? {
              ...o,
              status: nextStatus,
              payment: nextPayment,
              status_history: [
                ...o.status_history,
                {
                  history_id: o.status_history.length + 1,
                  order_id: orderId,
                  status: nextStatus,
                  note: 'Switched payment method to Cash on Delivery',
                  created_at: nowIso,
                },
              ],
            }
          : o
      ),
    }));
    syncPaymentUpdateToDb(orderId, nextPayment);
    syncOrderStatusUpdateToDb(orderId, nextStatus, 'Switched payment method to Cash on Delivery');
    return { ok: true };
  };

  const submitEmergencyAlert: MedExContextValue['submitEmergencyAlert'] = (
    status,
    idempotencyKey,
    handoffMode = 'desktop_qr'
  ) => {
    const existing = state.alerts.find((a) => a.idempotency_key === idempotencyKey);
    if (existing) return { ok: true, data: existing };

    const primaryAddr = state.addresses.find((a) => a.user_id === currentUser.user_id && a.is_primary);
    if (!primaryAddr) {
      return { ok: false, error: 'Please add a primary address before sending an emergency alert.' };
    }

    if (status !== 'cancelled') {
      const dup = isDuplicateEmergencyAlert(state.alerts, currentUser.user_id);
      if (dup) {
        return {
          ok: false,
          error: `An active 911 Emergency alert (${dup.reference_code}) was already recorded within the last 60 seconds.`,
        };
      }
    }

    const brgy = state.barangays.find((b) => b.barangay_id === primaryAddr.barangay_id);
    const nextId = isMySqlBackendActive()
      ? -Date.now()
      : Math.max(0, ...state.alerts.map((a) => a.alert_id)) + 1;
    const nowIso = new Date().toISOString();
    const alert: EmergencyAlert = {
      alert_id: nextId,
      reference_code: buildUniqueEmergencyRefCode(),
      idempotency_key: idempotencyKey,
      user_id: currentUser.user_id,
      category: '911_general',
      handoff_mode: handoffMode,
      address_id: primaryAddr.address_id,
      address_snapshot: `${primaryAddr.street}${brgy ? `, Brgy. ${brgy.name}, ${brgy.city}` : ''}`,
      barangay_name: brgy?.name || 'Unknown',
      latitude: primaryAddr.latitude,
      longitude: primaryAddr.longitude,
      status,
      created_at: nowIso,
      cancelled_at: status === 'cancelled' ? nowIso : undefined,
    };

    setState((prev) => ({
      ...prev,
      alerts: [alert, ...prev.alerts],
      notifications:
        status === 'submitted'
          ? pushAdminNotifications(
              prev.notifications,
              prev.users,
              'New 911 Emergency SOS Alert',
              `${currentUser.first_name} ${currentUser.last_name} (${alert.reference_code}) triggered 911 SOS from Brgy. ${alert.barangay_name}.`,
              'Alert'
            )
          : prev.notifications,
    }));

    void syncEmergencyAlertToDb(alert, true).then((res) => {
      if (res.ok && res.alertId && res.alertId !== alert.alert_id) {
        setState((prev) => ({
          ...prev,
          alerts: prev.alerts.map((a) =>
            a.idempotency_key === alert.idempotency_key ? { ...a, alert_id: res.alertId! } : a
          ),
        }));
      }
    });
    if (status === 'submitted') {
      void sendEmergencyDispatchLog({
        referenceCode: alert.reference_code,
        idempotencyKey: alert.idempotency_key,
        userId: alert.user_id,
        handoffMode,
        barangayName: alert.barangay_name,
        addressSnapshot: alert.address_snapshot,
        latitude: alert.latitude,
        longitude: alert.longitude,
      });
    }

    return { ok: true, data: alert };
  };

  const syncOfflineQueuedAlerts = (): number => {
    const queued = state.alerts.filter((a) => a.status === 'queued_offline');
    if (queued.length === 0) return 0;
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.status === 'queued_offline' ? { ...a, status: 'submitted' } : a
      ),
      notifications: pushAdminNotifications(
        prev.notifications,
        prev.users,
        'Offline emergency alerts synced',
        `${queued.length} queued alert(s) transmitted after connectivity restored.`,
        'Alert'
      ),
    }));
    queued.forEach((a) => void syncEmergencyAlertToDb({ ...a, status: 'submitted' }, a.alert_id <= 0));
    void notifyApprovedAdminsInDb(
      'Offline emergency alerts synced',
      `${queued.length} queued alert(s) transmitted after connectivity restored.`,
      'Alert'
    );
    return queued.length;
  };

  const saveProduct: MedExContextValue['saveProduct'] = async (prod) => {
    if (currentUser.role === 'merchant' && currentUser.status !== 'approved') {
      return { ok: false, error: 'Your merchant account must be approved before managing products.' };
    }
    const pricingCheck = validateRegularPrice(prod.regular_price);
    if (!pricingCheck.valid) {
      return { ok: false, error: pricingCheck.error || 'Invalid pricing.' };
    }
    if (prod.stock_quantity < 0) {
      return { ok: false, error: 'Stock quantity cannot be negative.' };
    }
    const cleanImagePath = String(prod.image_path || '').trim();
    if (cleanImagePath && !isSafeImageOrDocUrl(cleanImagePath)) {
      return { ok: false, error: 'Please provide a valid and safe medicine image upload or HTTPS/preset URL.' };
    }

    const isNew = !prod.product_id;
    const nowIso = new Date().toISOString();
    const existingProduct = prod.product_id
      ? state.products.find((p) => p.product_id === prod.product_id) ?? null
      : null;
    const targetProductId =
      prod.product_id ||
      (isMySqlBackendActive()
        ? -Date.now()
        : Math.max(0, ...state.products.map((p) => p.product_id)) + 1);
    const savedProduct: Product = {
      ...prod,
      product_id: targetProductId,
      merchant_id: existingProduct ? existingProduct.merchant_id : currentUser.user_id,
      updated_at: nowIso,
    };

    setState((prev) => {
      if (prod.product_id) {
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.product_id === prod.product_id ? savedProduct : p
          ),
        };
      }
      return {
        ...prev,
        products: [...prev.products, savedProduct],
      };
    });

    const res = await syncProductToDb(
      savedProduct,
      prod.image_path.startsWith('data:') ? prod.image_path : undefined,
      isNew
    );

    if (!res.ok) {
      setState((prev) => ({
        ...prev,
        products: existingProduct
          ? prev.products.map((p) =>
              p.product_id === existingProduct.product_id ? existingProduct : p
            )
          : prev.products.filter((p) => p.product_id !== savedProduct.product_id),
      }));
      return {
        ok: false,
        error: res.error || 'Could not save medicine to the database. Please try again.',
      };
    }

    const persisted = res.product ?? savedProduct;
    setState((prev) => {
      let notifications = prev.notifications;
      let inventoryMovements = prev.inventoryMovements;
      if (
        !isMySqlBackendActive() &&
        !persisted.is_archived &&
        persisted.stock_quantity <= persisted.low_stock_threshold
      ) {
        notifications = pushNotification(
          prev.notifications,
          persisted.merchant_id,
          persisted.stock_quantity <= 0
            ? `Out of stock: ${persisted.name}`
            : `Low stock alert: ${persisted.name}`,
          `${persisted.name} currently has ${persisted.stock_quantity} unit(s) remaining (alert threshold: ${persisted.low_stock_threshold}).`,
          'System'
        );
      }
      if (!isMySqlBackendActive()) {
        const prevStock = existingProduct ? existingProduct.stock_quantity : 0;
        const delta = persisted.stock_quantity - prevStock;
        if (isNew || delta !== 0) {
          const nextMoveId = Math.max(0, ...prev.inventoryMovements.map((m) => m.movement_id)) + 1;
          const mType: InventoryMovementType = isNew
            ? 'initial_stock'
            : delta > 0
              ? 'restock'
              : 'manual_adjustment';
          inventoryMovements = [
            {
              movement_id: nextMoveId,
              product_id: persisted.product_id,
              merchant_id: persisted.merchant_id,
              product_name: persisted.name,
              actor_id: currentUser.user_id,
              actor_name: `${currentUser.first_name} ${currentUser.last_name}`.trim(),
              actor_role: currentUser.role,
              movement_type: mType,
              quantity_delta: isNew ? persisted.stock_quantity : delta,
              stock_before: prevStock,
              stock_after: persisted.stock_quantity,
              note: isNew ? 'Initial product stock' : 'Merchant inventory update',
              created_at: nowIso,
            },
            ...prev.inventoryMovements,
          ];
        }
      }
      return {
        ...prev,
        products: reconcilePersistedProduct(prev.products, savedProduct.product_id, persisted),
        notifications,
        inventoryMovements,
      };
    });
    return { ok: true, data: persisted };
  };

  // Archive historical product record instead of permanently deleting it
  const deleteProduct: MedExContextValue['deleteProduct'] = async (productId) => {
    if (currentUser.role === 'merchant' && currentUser.status !== 'approved') {
      return { ok: false, error: 'Your merchant account must be approved before managing products.' };
    }
    const target = state.products.find((p) => p.product_id === productId);
    if (!target) {
      return { ok: false, error: 'Medicine not found.' };
    }
    if (currentUser.role !== 'admin' && target.merchant_id !== currentUser.user_id) {
      return { ok: false, error: 'You can only archive medicines belonging to your pharmacy.' };
    }

    const nowIso = new Date().toISOString();
    const archivedDraft: Product = {
      ...target,
      is_archived: true,
      is_listed: false,
      archived_at: nowIso,
      updated_at: nowIso,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.product_id === productId ? archivedDraft : p)),
      auditLogs: appendAudit(
        prev,
        'ARCHIVE_PRODUCT',
        'products',
        productId,
        `Archived ${target.name} (preserved for historical order records)`
      ),
    }));

    const res = await syncDeleteProductToDb(productId);
    if (!res.ok) {
      setState((prev) => ({
        ...prev,
        products: reconcilePersistedProduct(prev.products, target.product_id, target),
      }));
      return { ok: false, error: res.error || 'Could not archive medicine.' };
    }

    const persisted = res.product ?? archivedDraft;
    setState((prev) => ({
      ...prev,
      products: reconcilePersistedProduct(prev.products, persisted.product_id, persisted),
    }));
    return { ok: true, data: { archived: true, unlistedInstead: true } };
  };

  const restoreProduct: MedExContextValue['restoreProduct'] = async (productId) => {
    if (currentUser.role === 'merchant' && currentUser.status !== 'approved') {
      return { ok: false, error: 'Your merchant account must be approved before managing products.' };
    }
    const target = state.products.find((p) => p.product_id === productId);
    if (!target) {
      return { ok: false, error: 'Medicine not found.' };
    }
    if (currentUser.role !== 'admin' && target.merchant_id !== currentUser.user_id) {
      return { ok: false, error: 'You can only restore medicines belonging to your pharmacy.' };
    }

    const nowIso = new Date().toISOString();
    const restoredDraft: Product = {
      ...target,
      is_archived: false,
      archived_at: undefined,
      is_listed: true,
      updated_at: nowIso,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.product_id === productId ? restoredDraft : p)),
      auditLogs: appendAudit(
        prev,
        'RESTORE_PRODUCT',
        'products',
        productId,
        `Restored archived product ${target.name} to active catalog`
      ),
    }));

    const res = await syncRestoreProductToDb(productId);
    if (!res.ok) {
      setState((prev) => ({
        ...prev,
        products: reconcilePersistedProduct(prev.products, target.product_id, target),
      }));
      return { ok: false, error: res.error || 'Could not restore archived medicine.' };
    }

    const persisted = res.product ?? restoredDraft;
    setState((prev) => ({
      ...prev,
      products: reconcilePersistedProduct(prev.products, persisted.product_id, persisted),
    }));
    return { ok: true, data: persisted };
  };

  const toggleMerchantTempClosed: MedExContextValue['toggleMerchantTempClosed'] = async (
    merchantId,
    closed
  ) => {
    if (currentUser.role !== 'admin' && currentUser.user_id !== merchantId) {
      return { ok: false, error: 'Only the pharmacy owner or an admin can update store status.' };
    }
    const prevMerchant = state.merchants.find((m) => m.merchant_id === merchantId);
    setState((prev) => ({
      ...prev,
      merchants: prev.merchants.map((m) =>
        m.merchant_id === merchantId ? { ...m, is_temporarily_closed: closed } : m
      ),
    }));
    const res = await syncMerchantFlagsToDb(merchantId, { is_temporarily_closed: closed });
    if (!res.ok) {
      if (prevMerchant) {
        setState((prev) => ({
          ...prev,
          merchants: prev.merchants.map((m) =>
            m.merchant_id === merchantId ? prevMerchant : m
          ),
        }));
      }
      const slice = await hydrateInventoryAndMerchantStateFromMySql();
      if (slice) applyDbSnapshot(slice);
      return { ok: false, error: res.error || 'Could not update temporary closure status.' };
    }
    return { ok: true };
  };

  const toggleMerchant24Hours: MedExContextValue['toggleMerchant24Hours'] = async (
    merchantId,
    is24h
  ) => {
    if (currentUser.role !== 'admin' && currentUser.user_id !== merchantId) {
      return { ok: false, error: 'Only the pharmacy owner or an admin can update store hours.' };
    }
    const prevMerchant = state.merchants.find((m) => m.merchant_id === merchantId);
    setState((prev) => ({
      ...prev,
      merchants: prev.merchants.map((m) =>
        m.merchant_id === merchantId ? { ...m, is_24_hours: is24h } : m
      ),
    }));
    const res = await syncMerchantFlagsToDb(merchantId, { is_24_hours: is24h });
    if (!res.ok) {
      if (prevMerchant) {
        setState((prev) => ({
          ...prev,
          merchants: prev.merchants.map((m) =>
            m.merchant_id === merchantId ? prevMerchant : m
          ),
        }));
      }
      const slice = await hydrateInventoryAndMerchantStateFromMySql();
      if (slice) applyDbSnapshot(slice);
      return { ok: false, error: res.error || 'Could not update 24-hour status.' };
    }
    return { ok: true };
  };

  const updateMerchantHours: MedExContextValue['updateMerchantHours'] = async (
    merchantId,
    schedule
  ) => {
    if (currentUser.role !== 'admin' && currentUser.user_id !== merchantId) {
      return { ok: false, error: 'Only the pharmacy owner or an admin can edit operating hours.' };
    }
    for (const dayRow of schedule) {
      const check = validateOperatingHoursRange(
        dayRow.opens_at,
        dayRow.closes_at,
        dayRow.is_closed
      );
      if (!check.valid) {
        return { ok: false, error: check.error || 'Invalid operating hours range.' };
      }
    }

    const previousHours = state.merchantHours.filter((h) => h.merchant_id === merchantId);
    const optimisticRows: MerchantHourRow[] = schedule.map((item) => {
      const existing = previousHours.find((h) => h.day_of_week === item.day_of_week);
      return {
        hours_id: existing?.hours_id ?? -(merchantId * 10 + item.day_of_week + 1),
        merchant_id: merchantId,
        day_of_week: item.day_of_week,
        opens_at: item.opens_at,
        closes_at: item.closes_at,
        is_closed: item.is_closed,
      };
    });

    setState((prev) => ({
      ...prev,
      merchantHours: [
        ...prev.merchantHours.filter((h) => h.merchant_id !== merchantId),
        ...optimisticRows,
      ],
    }));

    const res = await syncMerchantHoursToDb(merchantId, schedule);
    if (!res.ok) {
      setState((prev) => ({
        ...prev,
        merchantHours: [
          ...prev.merchantHours.filter((h) => h.merchant_id !== merchantId),
          ...previousHours,
        ],
      }));
      const slice = await hydrateInventoryAndMerchantStateFromMySql();
      if (slice) applyDbSnapshot(slice);
      return { ok: false, error: res.error || 'Could not save operating hours.' };
    }

    if (res.hours && res.hours.length > 0) {
      const persistedHours = res.hours;
      setState((prev) => ({
        ...prev,
        merchantHours: [
          ...prev.merchantHours.filter((h) => h.merchant_id !== merchantId),
          ...persistedHours,
        ],
      }));
    }
    return { ok: true };
  };

  const updateMerchantStoreLocation: MedExContextValue['updateMerchantStoreLocation'] = (input) => {
    const merchant = state.merchants.find((m) => m.user_id === currentUser.user_id);
    if (!merchant) {
      return { ok: false, error: 'Merchant store profile not found.' };
    }
    if (!input.street.trim()) {
      return { ok: false, error: 'Store street address is required.' };
    }
    const coordCheck = validateOlongapoCoordinates(input.latitude, input.longitude);
    if (!coordCheck.valid) {
      return { ok: false, error: coordCheck.error || 'Invalid store map coordinates.' };
    }
    let normalizedContact = merchant.contact_no;
    if (input.contact_no && input.contact_no.trim()) {
      const parsed = normalizePHPhoneNumber(input.contact_no);
      if (!parsed) {
        return { ok: false, error: 'Enter a valid Philippine mobile number for the pharmacy.' };
      }
      normalizedContact = parsed;
    }

    const updatedShopName = input.shop_name?.trim() || merchant.shop_name;
    const existingAddr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
    const hasOwnExistingAddr = Boolean(existingAddr && existingAddr.user_id === currentUser.user_id);
    const targetAddrId = hasOwnExistingAddr
      ? existingAddr!.address_id
      : isMySqlBackendActive()
        ? -Date.now()
        : Math.max(0, ...state.addresses.map((a) => a.address_id)) + 1;

    const addrRecord: Address = hasOwnExistingAddr
      ? {
          ...existingAddr!,
          barangay_id: input.barangay_id,
          recipient_name: updatedShopName,
          recipient_phone: normalizedContact,
          street: input.street.trim(),
          landmark: input.landmark?.trim() || undefined,
          latitude: coordCheck.lat,
          longitude: coordCheck.lng,
        }
      : {
          address_id: targetAddrId,
          user_id: currentUser.user_id,
          barangay_id: input.barangay_id,
          recipient_name: updatedShopName,
          recipient_phone: normalizedContact,
          street: input.street.trim(),
          landmark: input.landmark?.trim() || undefined,
          latitude: coordCheck.lat,
          longitude: coordCheck.lng,
          is_primary: true,
          created_at: new Date().toISOString(),
        };

    setState((prev) => ({
      ...prev,
      addresses: hasOwnExistingAddr
        ? prev.addresses.map((a) => (a.address_id === targetAddrId ? addrRecord : a))
        : [...prev.addresses, addrRecord],
      merchants: prev.merchants.map((m) =>
        m.merchant_id === merchant.merchant_id
          ? {
              ...m,
              shop_name: updatedShopName,
              shop_address_id: targetAddrId,
              contact_no: normalizedContact,
            }
          : m
      ),
      auditLogs: appendAudit(
        prev,
        'UPDATE_MERCHANT_LOCATION',
        'merchants',
        merchant.merchant_id,
        `${updatedShopName} (${input.street.trim()} @ ${coordCheck.lat}, ${coordCheck.lng})`
      ),
    }));

    void syncSaveAddressToDb(addrRecord, !hasOwnExistingAddr).then((res) => {
      const resolvedAddrId = res.address?.address_id || addrRecord.address_id;
      if (res.ok && res.address) {
        const persistedAddr = res.address;
        setState((prev) => ({
          ...prev,
          addresses: prev.addresses.map((a) => (a.address_id === addrRecord.address_id ? persistedAddr : a)),
          merchants: prev.merchants.map((m) =>
            m.merchant_id === merchant.merchant_id
              ? { ...m, shop_address_id: persistedAddr.address_id }
              : m
          ),
        }));
      }
      void syncMerchantFlagsToDb(merchant.merchant_id, {
        shop_name: updatedShopName,
        contact_no: normalizedContact,
        ...(resolvedAddrId > 0 ? { shop_address_id: resolvedAddrId } : {}),
      });
    });

    return { ok: true };
  };

  const completeMerchantProfile: MedExContextValue['completeMerchantProfile'] = async (input) => {
    if (currentUser.role !== 'merchant' || currentUser.user_id <= 0) {
      return { ok: false, error: 'Merchant account required.' };
    }
    if (!input.shop_name.trim() || !input.pharmacist_name.trim() || !input.pharmacist_license_no.trim()) {
      return { ok: false, error: 'Pharmacy name, pharmacist name, and PRC license number are required.' };
    }
    const rphCheck = validatePersonName(input.pharmacist_name, 'Licensed Pharmacist Name');
    if (!rphCheck.valid) {
      return { ok: false, error: rphCheck.error || 'Licensed Pharmacist Name must contain letters only.' };
    }
    const prcCheck = validateAndNormalizePrcLicense(input.pharmacist_license_no);
    if (!prcCheck.valid) {
      return { ok: false, error: prcCheck.error || 'Enter a valid 7-digit PRC License No.' };
    }
    if (!input.street.trim()) {
      return { ok: false, error: 'Pharmacy street address is required.' };
    }
    const normalizedContact = normalizePHPhoneNumber(input.contact_no);
    if (!normalizedContact) {
      return { ok: false, error: 'Enter a valid Philippine contact number (+639XXXXXXXXX).' };
    }
    const coordCheck = validateOlongapoCoordinates(input.latitude, input.longitude);
    if (!coordCheck.valid) {
      return { ok: false, error: coordCheck.error || 'Please place the pin inside Olongapo City.' };
    }

    const existingAddr = state.addresses.find((a) => a.user_id === currentUser.user_id);

    if (isMySqlBackendActive()) {
      const res = await completeMerchantProfileInDb({
        userId: currentUser.user_id,
        existingAddressId: existingAddr?.address_id,
        shop_name: input.shop_name.trim(),
        pharmacist_name: rphCheck.normalized,
        pharmacist_license_no: prcCheck.normalized,
        contact_no: normalizedContact,
        barangay_id: input.barangay_id,
        street: input.street.trim(),
        landmark: input.landmark?.trim(),
        latitude: coordCheck.lat,
        longitude: coordCheck.lng,
        business_permit_name: input.business_permit_name?.trim(),
        business_permit_url: input.business_permit_url?.trim(),
        government_id_name: input.government_id_name?.trim(),
        government_id_url: input.government_id_url?.trim(),
      });

      if (!res.ok || !res.merchant || !res.address) {
        return { ok: false, error: res.error || 'Could not link merchant profile.' };
      }

      setState((prev) => {
        const nextAddrs = prev.addresses.some((a) => a.address_id === res.address!.address_id)
          ? prev.addresses.map((a) => (a.address_id === res.address!.address_id ? res.address! : a))
          : [...prev.addresses, res.address!];
        const nextMerchants = prev.merchants.some((m) => m.merchant_id === res.merchant!.merchant_id)
          ? prev.merchants.map((m) => (m.merchant_id === res.merchant!.merchant_id ? res.merchant! : m))
          : [...prev.merchants, res.merchant!];
        const remainingHours = prev.merchantHours.filter((h) => h.merchant_id !== res.merchant!.merchant_id);
        return {
          ...prev,
          addresses: nextAddrs,
          merchants: nextMerchants,
          merchantHours: [...remainingHours, ...(res.hours || [])],
        };
      });
      return { ok: true };
    }

    const existingMerchant = state.merchants.find((m) => m.merchant_id === currentUser.user_id);
    const addrId = existingAddr?.address_id || Math.max(0, ...state.addresses.map((a) => a.address_id)) + 1;
    const newAddr: Address = {
      address_id: addrId,
      user_id: currentUser.user_id,
      barangay_id: input.barangay_id,
      recipient_name: input.shop_name.trim(),
      recipient_phone: normalizedContact,
      street: input.street.trim(),
      landmark: input.landmark?.trim() || undefined,
      latitude: coordCheck.lat,
      longitude: coordCheck.lng,
      is_primary: true,
      created_at: new Date().toISOString(),
    };
    const newMerchant: MerchantProfile = {
      merchant_id: currentUser.user_id,
      user_id: currentUser.user_id,
      shop_name: input.shop_name.trim(),
      shop_address_id: addrId,
      is_pharmacist: true,
      pharmacist_name: rphCheck.normalized,
      pharmacist_license_no: prcCheck.normalized,
      is_24_hours: existingMerchant?.is_24_hours ?? false,
      is_temporarily_closed: existingMerchant?.is_temporarily_closed ?? false,
      contact_no: normalizedContact,
      business_permit_name: input.business_permit_name?.trim() || existingMerchant?.business_permit_name,
      business_permit_url: input.business_permit_url?.trim() || existingMerchant?.business_permit_url,
      government_id_name: input.government_id_name?.trim() || existingMerchant?.government_id_name,
      government_id_url: input.government_id_url?.trim() || existingMerchant?.government_id_url,
      documents_verified_at: existingMerchant?.documents_verified_at,
      documents_verified_by: existingMerchant?.documents_verified_by,
    };
    const baseHoursId = Math.max(0, ...state.merchantHours.map((h) => h.hours_id)) + 1;
    const newHours: MerchantHourRow[] = [0, 1, 2, 3, 4, 5, 6].map((day, idx) => ({
      hours_id: baseHoursId + idx,
      merchant_id: currentUser.user_id,
      day_of_week: day,
      opens_at: '08:00',
      closes_at: '20:00',
      is_closed: false,
    }));

    setState((prev) => ({
      ...prev,
      addresses: existingAddr
        ? prev.addresses.map((a) => (a.address_id === addrId ? newAddr : a))
        : [...prev.addresses, newAddr],
      merchants: [...prev.merchants.filter((m) => m.merchant_id !== currentUser.user_id), newMerchant],
      merchantHours: [...prev.merchantHours.filter((h) => h.merchant_id !== currentUser.user_id), ...newHours],
    }));
    return { ok: true };
  };

  const completeRiderProfile: MedExContextValue['completeRiderProfile'] = async (input) => {
    if (currentUser.role !== 'rider' || currentUser.user_id <= 0) {
      return { ok: false, error: 'Rider account required.' };
    }
    if (!input.vehicle_type.trim() || !input.plate_number.trim()) {
      return { ok: false, error: 'Vehicle type and plate number are required.' };
    }
    const plateCheck = validateAndNormalizePHPlateNumber(input.plate_number, input.vehicle_type);
    if (!plateCheck.valid) {
      return { ok: false, error: plateCheck.error || 'Valid Philippine LTO plate number is required.' };
    }

    if (isMySqlBackendActive()) {
      const res = await completeRiderProfileInDb({
        userId: currentUser.user_id,
        vehicle_type: input.vehicle_type.trim(),
        plate_number: plateCheck.normalized,
        driver_license_name: input.driver_license_name?.trim(),
        driver_license_url: input.driver_license_url?.trim(),
        vehicle_registration_name: input.vehicle_registration_name?.trim(),
        vehicle_registration_url: input.vehicle_registration_url?.trim(),
      });
      if (!res.ok || !res.riderProfile) {
        return { ok: false, error: res.error || 'Could not save rider profile.' };
      }
      setState((prev) => ({
        ...prev,
        riderProfiles: [
          ...prev.riderProfiles.filter((r) => r.user_id !== currentUser.user_id),
          res.riderProfile!,
        ],
      }));
      return { ok: true };
    }

    const newProfile: RiderProfile = {
      rider_id: currentUser.user_id,
      user_id: currentUser.user_id,
      vehicle_type: input.vehicle_type.trim(),
      plate_number: plateCheck.normalized,
      is_online: false,
      rating: 5.0,
      total_deliveries: 0,
      driver_license_name: input.driver_license_name?.trim(),
      driver_license_url: input.driver_license_url?.trim(),
      vehicle_registration_name: input.vehicle_registration_name?.trim(),
      vehicle_registration_url: input.vehicle_registration_url?.trim(),
    };
    setState((prev) => ({
      ...prev,
      riderProfiles: [
        ...prev.riderProfiles.filter((r) => r.user_id !== currentUser.user_id),
        newProfile,
      ],
    }));
    return { ok: true };
  };

  const reviewPrescription: MedExContextValue['reviewPrescription'] = (
    orderId,
    decision,
    rejectReason,
    remarks
  ) => {
    if (decision === 'rejected' && !rejectReason) {
      return { ok: false, error: 'Please select a rejection reason.' };
    }
    if (rejectReason === 'Other' && !remarks?.trim()) {
      return { ok: false, error: 'Remarks are required when selecting "Other".' };
    }

    const nowIso = new Date().toISOString();
    const reviewerName = `${currentUser.first_name} ${currentUser.last_name}`;
    const targetOrder = state.orders.find((o) => o.order_id === orderId);

    setState((prev) => {
      let residentIdToNotify = 0;
      let orderCode = '';
      let approvedNeedsGcash = false;

      const updatedOrders = prev.orders.map((o) => {
        if (o.order_id !== orderId || !o.prescription) return o;
        residentIdToNotify = o.resident_id;
        orderCode = o.order_code;

        if (decision === 'approved') {
          const needsGcashPay = o.payment.method === 'GCash' && o.payment.status === 'pending';
          if (needsGcashPay) {
            approvedNeedsGcash = true;
          }
          const nextStatus: OrderStatus = needsGcashPay ? 'pending' : 'placed';
          return {
            ...o,
            status: nextStatus,
            prescription: {
              ...o.prescription,
              status: 'approved' as const,
              reviewed_by: reviewerName,
              reviewed_at: nowIso,
            },
            status_history: [
              ...o.status_history,
              {
                history_id: o.status_history.length + 1,
                order_id: orderId,
                status: nextStatus,
                note: needsGcashPay
                  ? `Prescription approved by ${reviewerName} — awaiting customer GCash payment`
                  : `Prescription approved by ${reviewerName}`,
                created_at: nowIso,
              },
            ],
          };
        }

        return {
          ...o,
          status: 'awaiting_prescription_review' as const,
          prescription: {
            ...o.prescription,
            status: 'rejected' as const,
            reject_reason: rejectReason,
            remarks: remarks?.trim() || undefined,
            reviewed_by: reviewerName,
            reviewed_at: nowIso,
          },
          status_history: [
            ...o.status_history,
            {
              history_id: o.status_history.length + 1,
              order_id: orderId,
              status: 'awaiting_prescription_review' as const,
              note: `Prescription rejected: ${rejectReason}`,
              created_at: nowIso,
            },
          ],
        };
      });

      const notifications = residentIdToNotify
        ? pushNotification(
            prev.notifications,
            residentIdToNotify,
            decision === 'approved'
              ? approvedNeedsGcash
                ? `Prescription approved — Pay via GCash (${orderCode})`
                : `Prescription approved (${orderCode})`
              : `Prescription requires re-upload (${orderCode})`,
            decision === 'approved'
              ? approvedNeedsGcash
                ? `Your pharmacist approved ${orderCode}. Open Orders and click "Pay via GCash" to complete payment.`
                : 'Your pharmacy has approved your prescription and is preparing your order.'
              : `Reason: ${rejectReason}${remarks ? ` — ${remarks}` : ''}`,
            'Prescription'
          )
        : prev.notifications;

      return { ...prev, orders: updatedOrders, notifications };
    });

    if (targetOrder?.prescription) {
      const needsGcashPay =
        decision === 'approved' &&
        targetOrder.payment.method === 'GCash' &&
        targetOrder.payment.status === 'pending';
      const nextOrderStatus: OrderStatus =
        decision === 'approved'
          ? needsGcashPay
            ? 'pending'
            : 'placed'
          : 'awaiting_prescription_review';
      syncPrescriptionReviewToDb(orderId, decision, reviewerName, rejectReason, remarks);
      syncOrderStatusUpdateToDb(
        orderId,
        nextOrderStatus,
        decision === 'approved'
          ? `Prescription approved by ${reviewerName}`
          : `Prescription rejected: ${rejectReason}`
      );
    }

    return { ok: true };
  };

  const advanceMerchantOrderStatus = (
    orderId: number,
    nextStatus: 'preparing' | 'ready_for_pickup'
  ): ActionResult => {
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.prescription && order.prescription.status !== 'approved') {
      return { ok: false, error: 'Prescription must be approved before preparing this order.' };
    }
    if (nextStatus === 'preparing' && order.payment.method === 'GCash' && order.payment.status !== 'paid') {
      return {
        ok: false,
        error: 'Awaiting customer GCash payment before preparation can begin.',
      };
    }
    const nowIso = new Date().toISOString();
    const createdDelivery =
      nextStatus === 'ready_for_pickup' && !order.delivery
        ? {
            delivery_id: isMySqlBackendActive() ? -Date.now() : order.order_id + 3000,
            order_id: order.order_id,
            rider_id: null,
            pickup_merchant_id: order.merchant_id,
            status: 'requested' as const,
            requested_at: nowIso,
            confirmation_code: String(Math.floor(1000 + Math.random() * 9000)),
            code_attempts: 0,
            is_flagged_for_admin: false,
            declined_by_rider_ids: [],
          }
        : order.delivery;

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.order_id !== orderId) return o;
        return {
          ...o,
          status: nextStatus,
          delivery: createdDelivery,
          status_history: [
            ...o.status_history,
            {
              history_id: o.status_history.length + 1,
              order_id: orderId,
              status: nextStatus,
              created_at: nowIso,
            },
          ],
        };
      }),
    }));
    void syncOrderStatusUpdateToDb(orderId, nextStatus);
    if (createdDelivery) {
      const isNewDelivery = !order.delivery;
      void syncDeliveryUpsertToDb(
        { ...order, status: nextStatus, delivery: createdDelivery },
        isNewDelivery
      ).then((res) => {
        if (res.ok && res.deliveryId && res.deliveryId !== createdDelivery.delivery_id) {
          setState((prev) => ({
            ...prev,
            orders: prev.orders.map((o) =>
              o.order_id === orderId && o.delivery
                ? { ...o, delivery: { ...o.delivery, delivery_id: res.deliveryId! } }
                : o
            ),
          }));
        }
      });
    }
    return { ok: true };
  };

  const toggleRiderOnline = (online: boolean) => {
    const profile = state.riderProfiles.find((r) => r.user_id === currentUser.user_id);
    if (online && (currentUser.status === 'suspended' || profile?.operational_status === 'suspended')) {
      return;
    }
    setState((prev) => ({
      ...prev,
      riderProfiles: prev.riderProfiles.map((r) =>
        r.user_id === currentUser.user_id
          ? {
              ...r,
              is_online: online,
              operational_status: online
                ? r.operational_status === 'assigned' || r.operational_status === 'on_delivery'
                  ? r.operational_status
                  : 'available'
                : 'inactive',
            }
          : r
      ),
    }));
    syncRiderOnlineToDb(currentUser.user_id, online);
  };

  const respondToDeliveryRequest = (deliveryId: number, accept: boolean): ActionResult => {
    const riderProfile = state.riderProfiles.find((r) => r.user_id === currentUser.user_id);
    if (currentUser.status !== 'approved') {
      return { ok: false, error: 'Your rider account must be approved to accept deliveries.' };
    }
    if (riderProfile?.operational_status === 'suspended') {
      return {
        ok: false,
        error: 'Your rider dispatch availability is suspended by Delivery Management.',
      };
    }
    const nowIso = new Date().toISOString();
    const targetOrder = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    setState((prev) => {
      const updatedOrders = prev.orders.map((o) => {
        if (!o.delivery || o.delivery.delivery_id !== deliveryId) return o;
        if (accept) {
          return {
            ...o,
            delivery: {
              ...o.delivery,
              rider_id: currentUser.user_id,
              status: 'assigned' as const,
              assigned_at: nowIso,
              rider_lat: 14.833,
              rider_lng: 120.283,
            },
          };
        }
        return {
          ...o,
          delivery: {
            ...o.delivery,
            declined_by_rider_ids: [...o.delivery.declined_by_rider_ids, currentUser.user_id],
          },
        };
      });
      return { ...prev, orders: updatedOrders };
    });
    if (targetOrder?.delivery) {
      const nextDelivery = accept
        ? {
            ...targetOrder.delivery,
            rider_id: currentUser.user_id,
            status: 'assigned' as const,
            assigned_at: nowIso,
            rider_lat: 14.833,
            rider_lng: 120.283,
          }
        : {
            ...targetOrder.delivery,
            declined_by_rider_ids: [...targetOrder.delivery.declined_by_rider_ids, currentUser.user_id],
          };
      syncDeliveryUpsertToDb({ ...targetOrder, delivery: nextDelivery });
    }
    return { ok: true };
  };

  const confirmRiderPickup = (deliveryId: number): ActionResult => {
    const nowIso = new Date().toISOString();
    const targetOrder = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    setState((prev) => {
      let notifications = prev.notifications;
      if (targetOrder) {
        notifications = pushNotification(
          notifications,
          targetOrder.resident_id,
          `Order ${targetOrder.order_code} Out for Delivery`,
          'Your courier has picked up your medicines from the pharmacy and is on the way.',
          'Delivery'
        );
        notifications = pushNotification(
          notifications,
          targetOrder.merchant_id,
          `Order ${targetOrder.order_code} Picked Up`,
          'Assigned courier confirmed pharmacy pickup and is en route to the customer.',
          'Delivery'
        );
      }
      return {
        ...prev,
        notifications,
        orders: prev.orders.map((o) =>
          o.delivery?.delivery_id === deliveryId
            ? {
                ...o,
                status: 'out_for_delivery',
                delivery: {
                  ...o.delivery,
                  status: 'picked_up',
                  picked_up_at: nowIso,
                  rider_lat: 14.8342,
                  rider_lng: 120.2834,
                },
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: o.order_id,
                    status: 'out_for_delivery',
                    note: 'Rider picked up order from pharmacy',
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });
    if (targetOrder?.delivery) {
      syncOrderStatusUpdateToDb(
        targetOrder.order_id,
        'out_for_delivery',
        'Rider picked up order from pharmacy'
      );
      syncDeliveryUpsertToDb({
        ...targetOrder,
        delivery: {
          ...targetOrder.delivery,
          status: 'picked_up',
          picked_up_at: nowIso,
          rider_lat: 14.8342,
          rider_lng: 120.2834,
        },
      });
    }
    return { ok: true };
  };

  const recordCodCollection = (deliveryId: number, collectedAmount: number): ActionResult => {
    if (Number.isNaN(collectedAmount) || collectedAmount < 0) {
      return { ok: false, error: 'Enter a valid collected cash amount.' };
    }
    const nowIso = new Date().toISOString();
    const targetOrder = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    setState((prev) => {
      let notifications = prev.notifications;
      const updatedOrders = prev.orders.map((o) => {
        if (o.delivery?.delivery_id !== deliveryId) return o;
        const mismatch = isCodAmountMismatch(o.total_amount, collectedAmount);
        if (mismatch) {
          notifications = pushAdminNotifications(
            notifications,
            prev.users,
            `COD Mismatch Flagged (${o.order_code})`,
            `Order due: ₱${o.total_amount.toFixed(2)}, Rider reported: ₱${collectedAmount.toFixed(2)}.`,
            'Payment'
          );
        }
        return {
          ...o,
          payment: {
            ...o.payment,
            amount_collected: collectedAmount,
            is_flagged: mismatch,
            status: 'collected' as const,
            paid_at: nowIso,
          },
        };
      });
      return { ...prev, orders: updatedOrders, notifications };
    });
    if (targetOrder) {
      const mismatch = isCodAmountMismatch(targetOrder.total_amount, collectedAmount);
      if (mismatch) {
        void notifyApprovedAdminsInDb(
          `COD Mismatch Flagged (${targetOrder.order_code})`,
          `Order due: ₱${targetOrder.total_amount.toFixed(2)}, Rider reported: ₱${collectedAmount.toFixed(2)}.`,
          'Payment'
        );
      }
      syncPaymentUpdateToDb(targetOrder.order_id, {
        ...targetOrder.payment,
        amount_collected: collectedAmount,
        is_flagged: mismatch,
        status: 'collected',
        paid_at: nowIso,
      });
    }
    return { ok: true };
  };

  const submitDeliveryCode: MedExContextValue['submitDeliveryCode'] = async (deliveryId, code) => {
    const order = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    if (!order || !order.delivery) return { ok: false, error: 'Delivery not found.' };
    if (order.payment.method === 'COD' && order.payment.status !== 'collected') {
      return { ok: false, error: 'Record COD cash collection before entering the 4-digit code.' };
    }

    const nowIso = new Date().toISOString();
    const cleanedCode = code.trim();

    if (isMySqlBackendActive()) {
      const serverRes = await verifyDeliveryCodeInDb(order.order_id, cleanedCode);
      if (!serverRes.ok) {
        const nextAttempts =
          typeof serverRes.attempts === 'number'
            ? serverRes.attempts
            : order.delivery.code_attempts + 1;
        const flagged = Boolean(serverRes.flagged) || nextAttempts >= 3;
        setState((prev) => ({
          ...prev,
          orders: prev.orders.map((o) =>
            o.delivery?.delivery_id === deliveryId && o.delivery
              ? {
                  ...o,
                  delivery: {
                    ...o.delivery,
                    code_attempts: nextAttempts,
                    is_flagged_for_admin: flagged || o.delivery.is_flagged_for_admin,
                  },
                }
              : o
          ),
        }));
        return {
          ok: false,
          error:
            serverRes.error ||
            (flagged
              ? 'Incorrect code (3rd attempt). Delivery flagged for Admin review.'
              : `Incorrect 4-digit code. Attempt ${nextAttempts} of 3.`),
          data: { attempts: nextAttempts, flagged },
        };
      }
    } else if (cleanedCode !== order.delivery.confirmation_code) {
      const nextAttempts = order.delivery.code_attempts + 1;
      const flagged = nextAttempts >= 3;
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.delivery?.delivery_id === deliveryId && o.delivery
            ? {
                ...o,
                delivery: {
                  ...o.delivery,
                  code_attempts: nextAttempts,
                  is_flagged_for_admin: flagged || o.delivery.is_flagged_for_admin,
                },
              }
            : o
        ),
        notifications: flagged
          ? pushAdminNotifications(
              prev.notifications,
              prev.users,
              `3 Failed Delivery Code Attempts (${order.order_code})`,
              'Rider entered wrong confirmation code 3 times. Flagged for admin review.',
              'Delivery'
            )
          : prev.notifications,
      }));
      return {
        ok: false,
        error: flagged
          ? 'Incorrect code (3rd attempt). Delivery flagged for Admin review.'
          : `Incorrect 4-digit code. Attempt ${nextAttempts} of 3.`,
        data: { attempts: nextAttempts, flagged },
      };
    }

    // Valid code -> complete delivery and create exactly one earning
    const alreadyEarned = state.riderEarnings.some((e) => e.delivery_id === deliveryId);
    const createdEarning: RiderEarning = {
      earning_id: Math.max(0, ...state.riderEarnings.map((e) => e.earning_id)) + 1,
      rider_id: order.delivery.rider_id || currentUser.user_id,
      delivery_id: deliveryId,
      order_code: order.order_code,
      amount: order.delivery_fee,
      payout_status: 'pending',
      created_at: nowIso,
    };

    setState((prev) => {
      const riderEarnings = alreadyEarned ? prev.riderEarnings : [createdEarning, ...prev.riderEarnings];

      const riderProfiles = prev.riderProfiles.map((r) =>
        r.user_id === (order.delivery!.rider_id || currentUser.user_id)
          ? { ...r, total_deliveries: r.total_deliveries + 1 }
          : r
      );

      return {
        ...prev,
        riderEarnings,
        riderProfiles,
        orders: prev.orders.map((o) =>
          o.delivery?.delivery_id === deliveryId && o.delivery
            ? {
                ...o,
                status: 'delivered',
                delivery: {
                  ...o.delivery,
                  status: 'delivered',
                  delivered_at: nowIso,
                },
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: o.order_id,
                    status: 'delivered',
                    note: 'Confirmed via 4-digit resident code',
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });

    return { ok: true, data: { attempts: order.delivery.code_attempts, flagged: false } };
  };

  const markDeliveryNotHome = (deliveryId: number, note: string): ActionResult => {
    const targetOrder = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    if (!targetOrder || !targetOrder.delivery) {
      return { ok: false, error: 'Delivery record not found.' };
    }
    if (targetOrder.delivery.status !== 'picked_up') {
      return { ok: false, error: 'Only orders currently out for delivery can be marked Not Home.' };
    }
    const nowIso = new Date().toISOString();
    const reason = note.trim() || 'Resident not home upon arrival';
    setState((prev) => {
      let notifications = pushNotification(
        prev.notifications,
        targetOrder.resident_id,
        `Delivery Attempt Failed (${targetOrder.order_code})`,
        `Your rider marked you Not Home (${reason}). The rider can retry delivery or return the medicines to the pharmacy.`,
        'Delivery'
      );
      notifications = pushNotification(
        notifications,
        targetOrder.merchant_id,
        `Customer Not Home (${targetOrder.order_code})`,
        `Rider reported an unsuccessful delivery attempt (${reason}). You can confirm return & restock once medicines come back.`,
        'Delivery'
      );
      return {
        ...prev,
        notifications,
        orders: prev.orders.map((o) =>
          o.delivery?.delivery_id === deliveryId && o.delivery
            ? {
                ...o,
                delivery: {
                  ...o.delivery,
                  status: 'not_home',
                  failure_reason: reason,
                },
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: o.order_id,
                    status: o.status,
                    note: `Customer Not Home: ${reason}`,
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });
    syncDeliveryUpsertToDb({
      ...targetOrder,
      delivery: { ...targetOrder.delivery, status: 'not_home', failure_reason: reason },
    });
    return { ok: true };
  };

  const retryNotHomeDelivery = (deliveryId: number): ActionResult => {
    const targetOrder = state.orders.find((o) => o.delivery?.delivery_id === deliveryId);
    if (!targetOrder || !targetOrder.delivery) {
      return { ok: false, error: 'Delivery record not found.' };
    }
    if (targetOrder.delivery.status !== 'not_home') {
      return { ok: false, error: 'Only Customer Not Home deliveries can be retried.' };
    }
    const nowIso = new Date().toISOString();
    setState((prev) => {
      let notifications = pushNotification(
        prev.notifications,
        targetOrder.resident_id,
        `Delivery Retry In Progress (${targetOrder.order_code})`,
        'Your courier is retrying delivery now. Please have your 4-digit confirmation PIN ready.',
        'Delivery'
      );
      notifications = pushNotification(
        notifications,
        targetOrder.merchant_id,
        `Delivery Retry Started (${targetOrder.order_code})`,
        'Courier resumed drop-off attempt for this order.',
        'Delivery'
      );
      return {
        ...prev,
        notifications,
        orders: prev.orders.map((o) =>
          o.delivery?.delivery_id === deliveryId && o.delivery
            ? {
                ...o,
                status: 'out_for_delivery',
                delivery: {
                  ...o.delivery,
                  status: 'picked_up',
                  failure_reason: undefined,
                },
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: o.order_id,
                    status: 'out_for_delivery',
                    note: 'Rider retrying delivery attempt',
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });
    syncOrderStatusUpdateToDb(
      targetOrder.order_id,
      'out_for_delivery',
      'Rider retrying delivery attempt'
    );
    syncDeliveryUpsertToDb({
      ...targetOrder,
      delivery: {
        ...targetOrder.delivery,
        status: 'picked_up',
        failure_reason: undefined,
      },
    });
    return { ok: true };
  };

  const returnNotHomeOrderToPharmacy = (orderId: number, reason?: string): ActionResult => {
    const targetOrder = state.orders.find((o) => o.order_id === orderId);
    if (!targetOrder || !targetOrder.delivery) {
      return { ok: false, error: 'Order delivery record not found.' };
    }
    if (targetOrder.status === 'delivered' || targetOrder.status === 'cancelled') {
      return { ok: false, error: 'Order is already finalized.' };
    }
    if (targetOrder.delivery.status !== 'not_home') {
      return {
        ok: false,
        error: 'Order must be marked Customer Not Home before returning to the pharmacy.',
      };
    }

    const nowIso = new Date().toISOString();
    const finalReason =
      reason?.trim() ||
      targetOrder.delivery.failure_reason ||
      'Customer not home — undelivered medicines returned to pharmacy and stock restored';

    setState((prev) => {
      const returnMovements: InventoryMovement[] = [];
      let nextMoveId = Math.max(0, ...prev.inventoryMovements.map((m) => m.movement_id)) + 1;
      const actorFullName = `${currentUser.first_name} ${currentUser.last_name}`.trim();
      const restoredProducts = prev.products.map((p) => {
        const item = targetOrder.items.find((i) => i.product_id === p.product_id);
        if (!item) return p;
        const nextStock = p.stock_quantity + item.quantity;
        if (!isMySqlBackendActive()) {
          returnMovements.push({
            movement_id: nextMoveId++,
            product_id: p.product_id,
            merchant_id: p.merchant_id,
            product_name: p.name,
            actor_id: currentUser.user_id,
            actor_name: actorFullName,
            actor_role: currentUser.role,
            movement_type: 'return_restock',
            quantity_delta: item.quantity,
            stock_before: p.stock_quantity,
            stock_after: nextStock,
            reference_order_id: targetOrder.order_id,
            note: `Failed delivery return for ${targetOrder.order_code}`,
            created_at: nowIso,
          });
        }
        return { ...p, stock_quantity: nextStock, updated_at: nowIso };
      });
      let notifications = pushNotification(
        prev.notifications,
        targetOrder.resident_id,
        `Order ${targetOrder.order_code} Returned to Pharmacy`,
        `${finalReason}. Please place a new order when someone is available to receive it.`,
        'Delivery'
      );
      notifications = pushNotification(
        notifications,
        targetOrder.merchant_id,
        `Returned Order ${targetOrder.order_code} — Stock Restored`,
        `${finalReason}. Medicine quantities have been automatically returned to your inventory.`,
        'Order'
      );
      return {
        ...prev,
        products: restoredProducts,
        inventoryMovements:
          returnMovements.length > 0
            ? [...returnMovements, ...prev.inventoryMovements]
            : prev.inventoryMovements,
        notifications,
        orders: prev.orders.map((o) =>
          o.order_id === orderId && o.delivery
            ? {
                ...o,
                status: 'cancelled',
                cancel_reason: finalReason,
                delivery: {
                  ...o.delivery,
                  status: 'failed',
                  failure_reason: finalReason,
                },
                status_history: [
                  ...o.status_history,
                  {
                    history_id: o.status_history.length + 1,
                    order_id: o.order_id,
                    status: 'cancelled',
                    note: `Returned to Pharmacy: ${finalReason}`,
                    created_at: nowIso,
                  },
                ],
              }
            : o
        ),
      };
    });

    void syncReturnFailedDeliveryToDb(orderId, finalReason);
    return { ok: true };
  };

  const rateDelivery: MedExContextValue['rateDelivery'] = (
    orderId,
    stars,
    tags = [],
    comment = '',
    isAnonymous = true
  ) => {
    const validation = validateRiderRatingInput({ stars, comment });
    if (!validation.valid) {
      return { ok: false, error: validation.error || 'Invalid rider rating.' };
    }
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order || !order.delivery || !order.delivery.rider_id || order.status !== 'delivered') {
      return { ok: false, error: 'Completed delivery required to rate rider.' };
    }
    if (order.rating || state.riderRatings.some((r) => r.order_id === orderId)) {
      return { ok: false, error: 'You already rated this delivery.' };
    }

    const nowIso = new Date().toISOString();
    const riderId = order.delivery.rider_id;
    const sanitizedComment = comment.trim();
    const nextRatingId = Math.max(0, ...state.riderRatings.map((r) => r.rating_id)) + 1;
    const newRating: DeliveryRating = {
      rating_id: nextRatingId,
      delivery_id: order.delivery.delivery_id,
      order_id: orderId,
      resident_id: order.resident_id,
      rider_id: riderId,
      stars,
      tags,
      comment: sanitizedComment,
      is_anonymous: isAnonymous,
      created_at: nowIso,
    };

    setState((prev) => {
      const nextRiderRatings = [newRating, ...prev.riderRatings];
      const stats = computeRiderRatingStats(nextRiderRatings, riderId);
      const updatedOrders = prev.orders.map((o) =>
        o.order_id === orderId ? { ...o, rating: newRating } : o
      );

      const residentAccount = prev.users.find((u) => u.user_id === order.resident_id);
      const maskedName = formatReviewerDisplayName(residentAccount, isAnonymous);

      const notifications = pushNotification(
        prev.notifications,
        riderId,
        `New ${stars}-Star Delivery Rating`,
        `${maskedName} rated order ${order.order_code} (${stars}/5 stars).`,
        'Feedback'
      );

      return {
        ...prev,
        orders: updatedOrders,
        riderRatings: nextRiderRatings,
        riderProfiles: prev.riderProfiles.map((r) =>
          r.user_id === riderId ? { ...r, rating: stats.average } : r
        ),
        notifications,
      };
    });
    syncDeliveryRatingToDb(newRating);
    return { ok: true, data: newRating };
  };

  const submitPharmacyReview: MedExContextValue['submitPharmacyReview'] = (input) => {
    const existingKey = state.pharmacyReviews.find(
      (r) => r.idempotency_key === input.idempotency_key
    );
    if (existingKey) return { ok: true, data: existingKey };

    const order = state.orders.find((o) => o.order_id === input.order_id);
    if (!order || order.resident_id !== currentUser.user_id) {
      return { ok: false, error: 'Order not found.' };
    }
    if (order.status !== 'delivered') {
      return { ok: false, error: 'Only delivered orders can be reviewed.' };
    }
    const windowCheck = isWithin7DayWindow(
      order.delivery?.delivered_at || order.placed_at
    );
    if (!windowCheck.allowed) {
      return {
        ok: false,
        error: 'The 7-day review window for this order has closed.',
      };
    }
    if (state.pharmacyReviews.some((r) => r.order_id === input.order_id)) {
      return { ok: false, error: 'You have already submitted a store review for this order.' };
    }

    const validation = validateStoreReviewInput({
      stars: input.rating,
      tags: input.tags,
      comment: input.comment,
    });
    if (!validation.valid) {
      return { ok: false, error: validation.error || 'Invalid review input.' };
    }

    const nowIso = new Date().toISOString();
    const nextReviewId = isMySqlBackendActive()
      ? -Date.now()
      : Math.max(0, ...state.pharmacyReviews.map((r) => r.review_id)) + 1;
    const newReview: PharmacyReview = {
      review_id: nextReviewId,
      order_id: order.order_id,
      resident_id: currentUser.user_id,
      merchant_id: order.merchant_id,
      rating: input.rating,
      tags: input.tags,
      comment: input.comment.trim(),
      is_anonymous: input.is_anonymous,
      status: 'visible',
      idempotency_key: input.idempotency_key,
      created_at: nowIso,
      updated_at: nowIso,
    };

    setState((prev) => {
      const merchant = prev.merchants.find((m) => m.merchant_id === order.merchant_id);
      const maskedName = formatReviewerDisplayName(currentUser, input.is_anonymous);
      const notifications = merchant
        ? pushNotification(
            prev.notifications,
            merchant.user_id,
            `New ${input.rating}-Star Store Review`,
            `${maskedName} reviewed order ${order.order_code}.`,
            'Feedback'
          )
        : prev.notifications;
      return {
        ...prev,
        pharmacyReviews: [newReview, ...prev.pharmacyReviews],
        notifications,
      };
    });

    void syncPharmacyReviewToDb(newReview, true).then((res) => {
      if (res.ok && res.review) {
        const persisted = res.review;
        setState((prev) => ({
          ...prev,
          pharmacyReviews: prev.pharmacyReviews.map((r) =>
            r.order_id === newReview.order_id ? persisted : r
          ),
        }));
      }
    });
    return { ok: true, data: newReview };
  };

  const editPharmacyReview: MedExContextValue['editPharmacyReview'] = (input) => {
    const existing = state.pharmacyReviews.find((r) => r.review_id === input.review_id);
    if (!existing || existing.resident_id !== currentUser.user_id) {
      return { ok: false, error: 'Review not found.' };
    }
    if (!canEditPharmacyReview(existing.created_at)) {
      return { ok: false, error: 'Reviews can only be edited within 24 hours of submission.' };
    }
    const validation = validateStoreReviewInput({
      stars: input.rating,
      tags: input.tags,
      comment: input.comment,
    });
    if (!validation.valid) {
      return { ok: false, error: validation.error || 'Invalid review update.' };
    }

    const nowIso = new Date().toISOString();
    const updatedReview: PharmacyReview = {
      ...existing,
      rating: input.rating,
      tags: input.tags,
      comment: input.comment.trim(),
      is_anonymous: input.is_anonymous,
      updated_at: nowIso,
    };

    setState((prev) => ({
      ...prev,
      pharmacyReviews: prev.pharmacyReviews.map((r) =>
        r.review_id === input.review_id ? updatedReview : r
      ),
    }));

    syncPharmacyReviewToDb(updatedReview);
    return { ok: true, data: updatedReview };
  };

  const replyToPharmacyReview: MedExContextValue['replyToPharmacyReview'] = (
    reviewId,
    replyText
  ) => {
    const existing = state.pharmacyReviews.find((r) => r.review_id === reviewId);
    if (!existing) return { ok: false, error: 'Review not found.' };
    if (currentUser.role === 'merchant' && existing.merchant_id !== currentUser.user_id) {
      return { ok: false, error: 'You can only reply to reviews for your own pharmacy.' };
    }
    if (existing.merchant_reply) {
      return { ok: false, error: 'Only one pharmacy reply is allowed per review.' };
    }
    const check = validateCommentPrivacy(replyText, 500);
    if (!check.valid || !check.sanitized) {
      return { ok: false, error: check.error || 'Reply text cannot be empty.' };
    }

    const nowIso = new Date().toISOString();
    const updatedReview: PharmacyReview = {
      ...existing,
      merchant_reply: check.sanitized,
      replied_at: nowIso,
      updated_at: nowIso,
    };
    setState((prev) => {
      const merchant = prev.merchants.find((m) => m.merchant_id === existing.merchant_id);
      const notifications = pushNotification(
        prev.notifications,
        existing.resident_id,
        'Pharmacy replied to your review',
        `${merchant?.shop_name || 'Pharmacy'} posted a reply on your store review.`,
        'Feedback'
      );
      return {
        ...prev,
        pharmacyReviews: prev.pharmacyReviews.map((r) =>
          r.review_id === reviewId ? updatedReview : r
        ),
        notifications,
      };
    });
    syncPharmacyReviewToDb(updatedReview);
    return { ok: true };
  };

  const moderatePharmacyReview: MedExContextValue['moderatePharmacyReview'] = (
    reviewId,
    status,
    reason
  ) => {
    if (!hasPermission(currentUser, 'feedback:moderate')) {
      return { ok: false, error: 'Customer Service or Admin permission required to moderate store reviews.' };
    }
    if (!reason.trim()) {
      return { ok: false, error: 'A moderation reason is required.' };
    }
    const target = state.pharmacyReviews.find((r) => r.review_id === reviewId);
    if (!target) return { ok: false, error: 'Review not found.' };

    const nowIso = new Date().toISOString();
    const moderatedReview: PharmacyReview = {
      ...target,
      status,
      moderation_reason: reason.trim(),
      moderated_by: currentUser.user_id,
      moderated_at: nowIso,
      updated_at: nowIso,
    };
    setState((prev) => ({
      ...prev,
      pharmacyReviews: prev.pharmacyReviews.map((r) =>
        r.review_id === reviewId ? moderatedReview : r
      ),
      auditLogs: appendAudit(
        prev,
        status === 'hidden' ? 'HIDE_PHARMACY_REVIEW' : 'UNHIDE_PHARMACY_REVIEW',
        'pharmacy_reviews',
        reviewId,
        `status: ${target.status} -> ${status} (${reason.trim()})`
      ),
    }));
    syncPharmacyReviewToDb(moderatedReview);
    return { ok: true };
  };

  const submitProblemReport: MedExContextValue['submitProblemReport'] = (input) => {
    const existingByKey = state.problemReports.find(
      (r) => r.idempotency_key === input.idempotency_key
    );
    if (existingByKey) return { ok: true, data: existingByKey };

    if (input.source === 'order' && input.order_id !== null) {
      const order = state.orders.find((o) => o.order_id === input.order_id);
      if (!order) return { ok: false, error: 'Order not found.' };
      if (order.status === 'delivered') {
        const w = isWithin7DayWindow(order.delivery?.delivered_at || order.placed_at);
        if (!w.allowed) {
          return {
            ok: false,
            error: 'Order problem reporting is closed past 7 days after delivery.',
          };
        }
      }
    }

    const cat = state.feedbackCategories.find(
      (c) => c.is_active && c.applies_to === input.source && c.code === input.category_code
    );
    if (!cat) {
      return { ok: false, error: 'Select a valid problem category for this report.' };
    }

    const descCheck = validateCommentPrivacy(input.description, 1000);
    if (!descCheck.valid || !descCheck.sanitized) {
      return {
        ok: false,
        error: descCheck.error || 'Please describe the issue before submitting.',
      };
    }

    const dup = findDuplicateOpenReport(state.problemReports, {
      user_id: currentUser.user_id,
      source: input.source,
      order_id: input.order_id,
      merchant_id: input.merchant_id,
      product_id: input.product_id,
      category_code: input.category_code,
    });
    if (dup) {
      return {
        ok: false,
        error: `You already have an open report (${dup.reference_code}, status: ${dup.status}) for this issue.`,
        data: dup,
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextReportId = isMySqlBackendActive()
      ? -Date.now()
      : Math.max(0, ...state.problemReports.map((r) => r.report_id)) + 1;
    const referenceCode = buildUniqueReportReferenceCode(now);
    const maskedName = formatReviewerDisplayName(currentUser, input.is_anonymous);

    const newReport: ProblemReport = {
      report_id: nextReportId,
      reference_code: referenceCode,
      idempotency_key: input.idempotency_key,
      user_id: currentUser.user_id,
      source: input.source,
      order_id: input.order_id,
      merchant_id: input.merchant_id,
      product_id: input.product_id,
      search_id: input.search_id ?? null,
      category_code: cat.code,
      category_label: cat.label,
      description: descCheck.sanitized,
      is_anonymous: input.is_anonymous,
      status: 'open',
      created_at: nowIso,
      updated_at: nowIso,
      status_history: [
        {
          history_id: Date.now(),
          report_id: nextReportId,
          status: 'open',
          changed_by_id: currentUser.user_id,
          changed_by_name: maskedName,
          changed_by_role: currentUser.role,
          note: `Submitted via ${input.source}`,
          created_at: nowIso,
        },
      ],
    };

    setState((prev) => {
      let notifications = prev.notifications;
      if (input.merchant_id) {
        const merchant = prev.merchants.find((m) => m.merchant_id === input.merchant_id);
        if (merchant) {
          notifications = pushNotification(
            notifications,
            merchant.user_id,
            `New Problem Report ${referenceCode}`,
            `${maskedName} reported "${cat.label}".`,
            'Feedback'
          );
        }
      }
      if (input.source === 'app') {
        notifications = pushAdminNotifications(
          notifications,
          prev.users,
          `New App Feedback ${referenceCode}`,
          `${cat.label} submitted by ${maskedName}.`,
          'Feedback'
        );
      }
      return {
        ...prev,
        problemReports: [newReport, ...prev.problemReports],
        notifications,
      };
    });

    void syncProblemReportCreationToDb(newReport).then((res) => {
      if (res.ok && res.reportId && res.reportId !== newReport.report_id) {
        setState((prev) => ({
          ...prev,
          problemReports: prev.problemReports.map((r) =>
            r.idempotency_key === newReport.idempotency_key ? { ...r, report_id: res.reportId! } : r
          ),
        }));
      }
    });
    return { ok: true, data: newReport };
  };

  const updateProblemReportStatus: MedExContextValue['updateProblemReportStatus'] = (
    reportId,
    nextStatus,
    note,
    adminNotes,
    csNotes,
    categoryTag
  ) => {
    const existing = state.problemReports.find((r) => r.report_id === reportId);
    if (!existing) return { ok: false, error: 'Problem report not found.' };

    const isStoreOwner =
      currentUser.role === 'merchant' && existing.merchant_id === currentUser.user_id;
    const hasCsAccess = hasPermission(currentUser, 'complaints:manage_cs');
    if (currentUser.role === 'merchant' && !isStoreOwner) {
      return { ok: false, error: 'You can only update reports belonging to your pharmacy.' };
    }
    if (!isStoreOwner && !hasCsAccess && currentUser.role !== 'admin') {
      return { ok: false, error: 'Customer Service or Store ownership permission required.' };
    }
    if (!canTransitionReportStatus(existing.status, nextStatus, currentUser.role)) {
      return {
        ok: false,
        error: `Transition from ${existing.status} to ${nextStatus} is not permitted.`,
      };
    }
    if ((nextStatus === 'resolved' || nextStatus === 'dismissed') && !note.trim()) {
      return { ok: false, error: 'A resolution note is required when resolving or dismissing.' };
    }

    const nowIso = new Date().toISOString();
    const actorName = `${currentUser.first_name} ${currentUser.last_name}`;
    const isTerminal = nextStatus === 'resolved' || nextStatus === 'dismissed';

    setState((prev) => {
      const updatedReports = prev.problemReports.map((r) => {
        if (r.report_id !== reportId) return r;
        return {
          ...r,
          status: nextStatus,
          resolution_note: isTerminal ? note.trim() : r.resolution_note,
          resolved_at: isTerminal ? nowIso : r.resolved_at,
          admin_notes: adminNotes !== undefined ? adminNotes : r.admin_notes,
          cs_notes: csNotes !== undefined ? csNotes : r.cs_notes,
          category_tag: categoryTag !== undefined ? categoryTag : r.category_tag,
          store_responded_at:
            isStoreOwner && !r.store_responded_at ? nowIso : r.store_responded_at,
          updated_at: nowIso,
          status_history: [
            ...r.status_history,
            {
              history_id: Date.now() + r.status_history.length,
              report_id: reportId,
              status: nextStatus,
              changed_by_id: currentUser.user_id,
              changed_by_name: actorName,
              changed_by_role: currentUser.role,
              note: note.trim() || `Marked ${nextStatus}`,
              created_at: nowIso,
            },
          ],
        };
      });

      const notifications = pushNotification(
        prev.notifications,
        existing.user_id,
        `Report ${existing.reference_code} ${nextStatus}`,
        note.trim() || `Your report status updated to ${nextStatus}.`,
        'Feedback'
      );

      const auditLogs =
        currentUser.role === 'admin' || currentUser.role === 'customer_service'
          ? appendAudit(
              prev,
              'UPDATE_PROBLEM_REPORT',
              'problem_reports',
              reportId,
              `${existing.reference_code}: ${existing.status} -> ${nextStatus}${note.trim() ? ` (${note.trim()})` : ''}`
            )
          : prev.auditLogs;

      return {
        ...prev,
        problemReports: updatedReports,
        notifications,
        auditLogs,
      };
    });

    void syncProblemReportStatusUpdateToDb({
      reportId,
      status: nextStatus,
      resolutionNote: isTerminal ? note.trim() : existing.resolution_note,
      resolvedAt: isTerminal ? nowIso : existing.resolved_at,
      adminNotes: adminNotes !== undefined ? adminNotes : existing.admin_notes,
      csNotes: csNotes !== undefined ? csNotes : existing.cs_notes,
      categoryTag: categoryTag !== undefined ? categoryTag : existing.category_tag,
      updatedAt: nowIso,
      changedById: currentUser.user_id,
      changedByName: actorName,
      changedByRole: currentUser.role,
      note: note.trim() || `Marked ${nextStatus}`,
    });

    return { ok: true };
  };

  const escalateProblemReport: MedExContextValue['escalateProblemReport'] = async (
    reportId,
    reason
  ) => {
    const existing = state.problemReports.find((r) => r.report_id === reportId);
    if (!existing) return { ok: false, error: 'Problem report not found.' };
    if (!reason.trim()) {
      return { ok: false, error: 'Please explain why you are escalating this ticket to Customer Service.' };
    }
    const check = canEscalateProblemReportToCS(existing, currentUser.user_id, currentUser.role);
    if (!check.ok) {
      return { ok: false, error: check.error || 'Escalation is not permitted for this report.' };
    }
    if (isMySqlBackendActive()) {
      const res = await escalateReportInDb(reportId, reason.trim());
      if (!res.ok) return { ok: false, error: res.error || 'Could not escalate ticket.' };
    }
    const nowIso = new Date().toISOString();
    const actorName = `${currentUser.first_name} ${currentUser.last_name}`;
    setState((prev) => {
      let notifications = prev.notifications;
      const csUsers = prev.users.filter(
        (u) => (u.role === 'customer_service' || u.role === 'admin') && u.status === 'approved'
      );
      for (const u of csUsers) {
        notifications = pushNotification(
          notifications,
          u.user_id,
          `Escalated Complaint ${existing.reference_code}`,
          `Customer escalated ticket ${existing.reference_code} to Customer Service: ${reason.trim()}`,
          'Feedback'
        );
      }
      return {
        ...prev,
        problemReports: prev.problemReports.map((r) =>
          r.report_id === reportId
            ? {
                ...r,
                status: 'escalated',
                escalated_at: nowIso,
                escalated_by_id: currentUser.user_id,
                escalated_reason: reason.trim(),
                updated_at: nowIso,
                status_history: [
                  ...r.status_history,
                  {
                    history_id: Date.now() + r.status_history.length,
                    report_id: reportId,
                    status: 'escalated',
                    changed_by_id: currentUser.user_id,
                    changed_by_name: actorName,
                    changed_by_role: currentUser.role,
                    note: `Escalated to Customer Service: ${reason.trim()}`,
                    created_at: nowIso,
                  },
                ],
              }
            : r
        ),
        notifications,
      };
    });
    return { ok: true };
  };

  // --------------------------------------------------------------------------
  // RBAC, INTERNAL DEPARTMENT ACCOUNTS, DELIVERY MANAGEMENT, COUPONS & RETURNS
  // --------------------------------------------------------------------------

  const hasCurrentPermission = (perm: RbacPermission): boolean => hasPermission(currentUser, perm);

  const createInternalStaffAccount: MedExContextValue['createInternalStaffAccount'] = async (
    input
  ) => {
    if (!hasPermission(currentUser, 'internal_accounts:create') || !canAdminCreateRole(currentUser, input.role)) {
      return {
        ok: false,
        error: 'Only Global Admin can create internal department accounts.',
      };
    }
    const firstCheck = validatePersonName(input.first_name, 'First Name');
    if (!firstCheck.valid) return { ok: false, error: firstCheck.error || 'Invalid first name.' };
    const lastCheck = validatePersonName(input.last_name, 'Last Name');
    if (!lastCheck.valid) return { ok: false, error: lastCheck.error || 'Invalid last name.' };

    const cleanEmail = input.email.trim().toLowerCase();
    const emailCheck = validateSignInEmail(cleanEmail, { isAdminAccount: true });
    if (!emailCheck.valid) return { ok: false, error: emailCheck.error || 'Invalid email.' };

    const pwCheck = validatePasswordStrength(input.password);
    if (!pwCheck.valid) return { ok: false, error: pwCheck.error || 'Weak password.' };

    const phone = normalizePHPhoneNumber(input.phone_number);
    if (!phone) return { ok: false, error: 'Enter a valid Philippine mobile number.' };

    if (!isAtLeast18(input.date_of_birth)) {
      return { ok: false, error: 'Staff accounts must be at least 18 years old.' };
    }
    if (
      state.users.some(
        (u) => u.email.toLowerCase() === cleanEmail || u.phone_number === phone
      )
    ) {
      return { ok: false, error: 'Email or phone number is already registered.' };
    }

    if (isMySqlBackendActive()) {
      const dbRes = await createInternalAccountInDb({
        ...input,
        first_name: firstCheck.normalized,
        last_name: lastCheck.normalized,
        email: cleanEmail,
        phone_number: phone,
      });
      if (!dbRes.ok || !dbRes.user) {
        return { ok: false, error: dbRes.error || 'Failed to create internal account.' };
      }
      const createdUser = dbRes.user;
      setState((prev) => ({
        ...prev,
        users: [...prev.users.filter((u) => u.user_id !== createdUser.user_id), createdUser],
      }));
      return { ok: true, data: createdUser };
    }

    const nowIso = new Date().toISOString();
    const nextUserId = Math.max(400, ...state.users.map((u) => u.user_id)) + 1;
    const createdUser: UserAccount = {
      user_id: nextUserId,
      role: input.role,
      phone_number: phone,
      email: cleanEmail,
      first_name: firstCheck.normalized,
      last_name: lastCheck.normalized,
      date_of_birth: input.date_of_birth.slice(0, 10),
      status: 'approved',
      created_by_admin_id: currentUser.user_id,
      department_label: input.department_label?.trim() || ROLE_DISPLAY_NAMES[input.role],
      permission_overrides: {
        grant: input.grant_permissions ?? [],
        revoke: [],
      },
      created_at: nowIso,
    };

    setState((prev) => ({
      ...prev,
      users: [...prev.users, createdUser],
      auditLogs: appendAudit(
        prev,
        'CREATE_INTERNAL_ACCOUNT',
        'users',
        nextUserId,
        `Provisioned ${ROLE_DISPLAY_NAMES[input.role]} account for ${cleanEmail}`
      ),
    }));
    return { ok: true, data: createdUser };
  };

  const updateUserPermissions: MedExContextValue['updateUserPermissions'] = async (
    userId,
    overrides
  ) => {
    if (!hasPermission(currentUser, 'internal_accounts:manage_permissions')) {
      return { ok: false, error: 'Global Admin permission required.' };
    }
    const target = state.users.find((u) => u.user_id === userId);
    if (!target) return { ok: false, error: 'Target account not found.' };

    if (isMySqlBackendActive()) {
      const res = await updateUserPermissionsInDb(userId, overrides);
      if (!res.ok) return { ok: false, error: res.error || 'Failed to update permissions.' };
    }

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.user_id === userId
          ? {
              ...u,
              permission_overrides: {
                grant: overrides.grant ?? [],
                revoke: overrides.revoke ?? [],
              },
            }
          : u
      ),
      auditLogs: appendAudit(
        prev,
        'UPDATE_PERMISSIONS',
        'users',
        userId,
        `Updated permission overrides (+${(overrides.grant ?? []).length}/-${(overrides.revoke ?? []).length}) for ${target.email}`
      ),
    }));
    return { ok: true };
  };

  const assignRiderToDelivery: MedExContextValue['assignRiderToDelivery'] = async (
    orderId,
    riderId
  ) => {
    if (!hasPermission(currentUser, 'deliveries:assign_rider')) {
      return { ok: false, error: 'Delivery Management permission required to assign riders.' };
    }
    const order = state.orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return { ok: false, error: 'Finalized orders cannot be assigned.' };
    }
    const riderUser = state.users.find((u) => u.user_id === riderId && u.role === 'rider');
    const riderProfile = state.riderProfiles.find((r) => r.user_id === riderId);
    if (!riderUser || !riderProfile) return { ok: false, error: 'Rider profile not found.' };
    if (
      riderUser.status !== 'approved' ||
      riderProfile.operational_status === 'suspended' ||
      riderProfile.operational_status === 'inactive'
    ) {
      return {
        ok: false,
        error: 'Rider must be approved and active/available to accept a dispatch.',
      };
    }

    if (isMySqlBackendActive()) {
      const res = await assignRiderToDeliveryInDb(orderId, riderId);
      if (!res.ok) return { ok: false, error: res.error || 'Failed to assign rider.' };
    }

    const nowIso = new Date().toISOString();
    setState((prev) => {
      const notifications = pushNotification(
        prev.notifications,
        riderId,
        `Delivery Assigned: ${order.order_code}`,
        `Delivery Management assigned you to ${order.order_code}. Proceed to pharmacy pickup.`,
        'Delivery'
      );
      return {
        ...prev,
        notifications,
        riderProfiles: prev.riderProfiles.map((r) =>
          r.user_id === riderId ? { ...r, operational_status: 'assigned', is_online: true } : r
        ),
        orders: prev.orders.map((o) => {
          if (o.order_id !== orderId) return o;
          const nextDelivery = o.delivery
            ? { ...o.delivery, rider_id: riderId, status: 'assigned' as const, assigned_at: nowIso }
            : {
                delivery_id: o.order_id + 3000,
                order_id: o.order_id,
                rider_id: riderId,
                pickup_merchant_id: o.merchant_id,
                status: 'assigned' as const,
                assigned_at: nowIso,
                requested_at: nowIso,
                confirmation_code: String(Math.floor(1000 + Math.random() * 9000)),
                code_attempts: 0,
                is_flagged_for_admin: false,
                declined_by_rider_ids: [],
              };
          return { ...o, delivery: nextDelivery };
        }),
        auditLogs: appendAudit(
          prev,
          'ASSIGN_RIDER',
          'deliveries',
          orderId,
          `Assigned rider #${riderId} (${riderUser.first_name} ${riderUser.last_name}) to ${order.order_code}`
        ),
      };
    });
    return { ok: true };
  };

  const updateRiderOperationalStatus: MedExContextValue['updateRiderOperationalStatus'] = async (
    riderId,
    operationalStatus,
    reason
  ) => {
    if (!hasPermission(currentUser, 'riders:manage_operational_status')) {
      return { ok: false, error: 'Delivery Management permission required.' };
    }
    if (
      operationalStatus === 'suspended' &&
      !hasPermission(currentUser, 'riders:suspend_scoped') &&
      !hasPermission(currentUser, 'users:suspend_any')
    ) {
      return { ok: false, error: 'Permission required to suspend riders.' };
    }
    const targetRider = state.users.find((u) => u.user_id === riderId && u.role === 'rider');
    if (!targetRider) return { ok: false, error: 'Rider account not found.' };

    if (isMySqlBackendActive()) {
      const res = await updateRiderOperationalStatusInDb(riderId, operationalStatus, reason);
      if (!res.ok) return { ok: false, error: res.error || 'Could not update rider operational status.' };
    }

    const nextOnline = operationalStatus !== 'suspended' && operationalStatus !== 'inactive';
    setState((prev) => ({
      ...prev,
      riderProfiles: prev.riderProfiles.map((r) =>
        r.user_id === riderId
          ? { ...r, operational_status: operationalStatus, is_online: nextOnline }
          : r
      ),
      users: prev.users.map((u) => {
        if (u.user_id !== riderId) return u;
        if (operationalStatus === 'suspended') {
          return { ...u, status: 'suspended', status_reason: reason || 'Suspended by Delivery Management' };
        }
        if (u.status === 'suspended' && (operationalStatus === 'active' || operationalStatus === 'available')) {
          return { ...u, status: 'approved', status_reason: undefined };
        }
        return u;
      }),
      auditLogs: appendAudit(
        prev,
        'RIDER_OPERATIONAL_STATUS',
        'rider_profiles',
        riderId,
        `operational_status=${operationalStatus}${reason ? ` (${reason})` : ''}`
      ),
    }));
    return { ok: true };
  };

  const saveCoupon: MedExContextValue['saveCoupon'] = async (input) => {
    const isNew = !input.coupon_id;
    if (isNew && !hasPermission(currentUser, 'coupons:create')) {
      return { ok: false, error: 'Coupon Handler permission required to create coupons.' };
    }
    if (!isNew && !hasPermission(currentUser, 'coupons:update')) {
      return { ok: false, error: 'Coupon Handler permission required to update coupons.' };
    }
    const normalizedCode = normalizeCouponCode(input.code);
    if (!normalizedCode || normalizedCode.length < 3) {
      return { ok: false, error: 'Coupon code must be at least 3 alphanumeric characters.' };
    }
    if (input.discount_value <= 0) {
      return { ok: false, error: 'Discount value must be greater than zero.' };
    }
    if (input.discount_type === 'percentage' && input.discount_value > 100) {
      return { ok: false, error: 'Percentage discount cannot exceed 100%.' };
    }
    if (
      state.coupons.some(
        (c) => c.code.toUpperCase() === normalizedCode && c.coupon_id !== input.coupon_id
      )
    ) {
      return { ok: false, error: `Coupon code ${normalizedCode} already exists.` };
    }

    const nowIso = new Date().toISOString();
    const existing = input.coupon_id
      ? state.coupons.find((c) => c.coupon_id === input.coupon_id)
      : undefined;
    const draftCoupon: Coupon = {
      ...input,
      coupon_id:
        input.coupon_id ||
        (isMySqlBackendActive()
          ? -Date.now()
          : Math.max(0, ...state.coupons.map((c) => c.coupon_id)) + 1),
      code: normalizedCode,
      times_used: existing?.times_used ?? 0,
      created_by_id: existing?.created_by_id ?? currentUser.user_id,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    };

    if (isMySqlBackendActive()) {
      const res = await saveCouponInDb(draftCoupon, isNew);
      if (!res.ok || !res.coupon) {
        return { ok: false, error: res.error || 'Could not persist coupon.' };
      }
      const saved = res.coupon;
      setState((prev) => ({
        ...prev,
        coupons: isNew
          ? [saved, ...prev.coupons]
          : prev.coupons.map((c) => (c.coupon_id === saved.coupon_id ? saved : c)),
      }));
      return { ok: true, data: saved };
    }

    setState((prev) => ({
      ...prev,
      coupons: isNew
        ? [draftCoupon, ...prev.coupons]
        : prev.coupons.map((c) => (c.coupon_id === draftCoupon.coupon_id ? draftCoupon : c)),
      auditLogs: appendAudit(
        prev,
        isNew ? 'CREATE_COUPON' : 'UPDATE_COUPON',
        'coupons',
        draftCoupon.coupon_id,
        `${draftCoupon.code} (${draftCoupon.discount_type} ${draftCoupon.discount_value})`
      ),
    }));
    return { ok: true, data: draftCoupon };
  };

  const deleteCoupon: MedExContextValue['deleteCoupon'] = async (couponId) => {
    if (!hasPermission(currentUser, 'coupons:delete')) {
      return { ok: false, error: 'Coupon Handler permission required to delete coupons.' };
    }
    if (isMySqlBackendActive()) {
      const res = await deleteCouponInDb(couponId);
      if (!res.ok) return { ok: false, error: res.error || 'Could not delete coupon.' };
    }
    setState((prev) => ({
      ...prev,
      coupons: prev.coupons.filter((c) => c.coupon_id !== couponId),
      auditLogs: appendAudit(prev, 'DELETE_COUPON', 'coupons', couponId, `Deleted coupon #${couponId}`),
    }));
    return { ok: true };
  };

  const claimCoupon: MedExContextValue['claimCoupon'] = async (couponId) => {
    if (!hasPermission(currentUser, 'coupons:claim')) {
      return { ok: false, error: 'Only signed-in Customer accounts can claim promo coupons.' };
    }
    const coupon = state.coupons.find((c) => c.coupon_id === couponId);
    if (!coupon) return { ok: false, error: 'Coupon not found.' };

    const prevOrdersCount = state.orders.filter(
      (o) => o.resident_id === currentUser.user_id && o.status !== 'cancelled'
    ).length;
    const check = canCustomerClaimCoupon({
      coupon,
      residentId: currentUser.user_id,
      existingClaims: state.customerCoupons.filter((cc) => cc.resident_id === currentUser.user_id),
      residentPreviousOrdersCount: prevOrdersCount,
    });
    if (!check.ok) {
      return { ok: false, error: check.error || 'Not eligible to claim this coupon.' };
    }

    if (isMySqlBackendActive()) {
      const res = await claimCouponInDb(couponId);
      if (!res.ok || !res.claim) {
        return { ok: false, error: res.error || 'Could not claim coupon.' };
      }
      const savedClaim = res.claim;
      setState((prev) => ({
        ...prev,
        customerCoupons: [savedClaim, ...prev.customerCoupons],
      }));
      return { ok: true, data: savedClaim };
    }

    const nowIso = new Date().toISOString();
    const newClaim: CustomerCoupon = {
      claim_id: Math.max(0, ...state.customerCoupons.map((cc) => cc.claim_id)) + 1,
      coupon_id: couponId,
      resident_id: currentUser.user_id,
      status: 'claimed',
      claimed_at: nowIso,
    };
    setState((prev) => ({
      ...prev,
      customerCoupons: [newClaim, ...prev.customerCoupons],
    }));
    return { ok: true, data: newClaim };
  };

  const previewValidateCoupon: MedExContextValue['previewValidateCoupon'] = async (input) => {
    const code = normalizeCouponCode(input.code);
    if (!code) return { ok: false, error: 'Enter a promo code.' };

    if (isMySqlBackendActive()) {
      const res = await validateCouponOnServer({
        code,
        merchant_id: input.merchant_id,
        items: input.items,
      });
      if (!res.ok || !res.coupon) {
        return { ok: false, error: res.error || 'Coupon not valid for this cart.' };
      }
      const subtotal = input.items.reduce((sum, i) => {
        const prod = state.products.find((p) => p.product_id === i.product_id);
        return sum + (prod?.regular_price ?? 0) * i.quantity;
      }, 0);
      return {
        ok: true,
        data: {
          coupon: res.coupon,
          discountAmount: Number(res.discountAmount ?? 0),
          finalDiscountedSubtotal: Number(Math.max(0, subtotal - Number(res.discountAmount ?? 0)).toFixed(2)),
        },
      };
    }

    const coupon = state.coupons.find((c) => c.code.toUpperCase() === code);
    if (!coupon) {
      const failLog: CouponRedemptionLog = {
        redemption_id: Math.max(0, ...state.couponRedemptions.map((r) => r.redemption_id)) + 1,
        coupon_id: null,
        coupon_code: code,
        resident_id: currentUser.user_id,
        order_id: null,
        discount_amount: 0,
        status: 'failed',
        failure_reason: 'Coupon code not found',
        created_at: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        couponRedemptions: [failLog, ...prev.couponRedemptions],
      }));
      return { ok: false, error: 'Invalid or unknown coupon code.' };
    }

    const cartItems = input.items.map((i) => {
      const prod = state.products.find((p) => p.product_id === i.product_id);
      return {
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: prod?.regular_price ?? 0,
      };
    });
    const subtotal = Number(
      cartItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0).toFixed(2)
    );
    const prevOrdersCount = state.orders.filter(
      (o) => o.resident_id === currentUser.user_id && o.status !== 'cancelled'
    ).length;
    const usageCount = state.couponRedemptions.filter(
      (r) =>
        r.coupon_id === coupon.coupon_id &&
        r.resident_id === currentUser.user_id &&
        r.status === 'redeemed'
    ).length;
    const claim = state.customerCoupons.find(
      (cc) => cc.coupon_id === coupon.coupon_id && cc.resident_id === currentUser.user_id
    );
    const result = validateAndCalculateCouponDiscount({
      coupon,
      residentId: currentUser.user_id,
      merchantId: input.merchant_id,
      cartItems,
      subtotal,
      customerClaim: claim ?? null,
      residentPreviousOrdersCount: prevOrdersCount,
      residentCouponUsageCount: usageCount,
    });
    if (!result.valid) {
      const failLog: CouponRedemptionLog = {
        redemption_id: Math.max(0, ...state.couponRedemptions.map((r) => r.redemption_id)) + 1,
        coupon_id: coupon.coupon_id,
        coupon_code: coupon.code,
        resident_id: currentUser.user_id,
        order_id: null,
        discount_amount: 0,
        status: 'failed',
        failure_reason: result.reason || 'Ineligible',
        created_at: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        couponRedemptions: [failLog, ...prev.couponRedemptions],
      }));
      return { ok: false, error: result.reason || 'Coupon cannot be applied.' };
    }
    return {
      ok: true,
      data: {
        coupon,
        discountAmount: result.discountAmount,
        finalDiscountedSubtotal: result.finalDiscountedSubtotal,
      },
    };
  };

  const requestReturnRefund: MedExContextValue['requestReturnRefund'] = async (input) => {
    if (!hasPermission(currentUser, 'returns:request') && currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Customers can request a return or refund.' };
    }
    const order = state.orders.find((o) => o.order_id === input.order_id);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (!input.description.trim()) {
      return { ok: false, error: 'Please explain the issue with your delivered order.' };
    }
    const check = canRequestReturnRefund(order, currentUser.user_id, state.returnRequests);
    if (!check.ok) {
      return { ok: false, error: check.error || 'Return request cannot be filed for this order.' };
    }
    const requestedAmount = Math.min(
      order.total_amount,
      Math.max(1, Number(input.requested_refund_amount || order.total_amount))
    );

    if (isMySqlBackendActive()) {
      const res = await createReturnRequestInDb({
        ...input,
        description: input.description.trim(),
        requested_refund_amount: requestedAmount,
      });
      if (!res.ok || !res.returnRequest) {
        return { ok: false, error: res.error || 'Failed to submit return request.' };
      }
      const saved = res.returnRequest;
      setState((prev) => ({
        ...prev,
        returnRequests: [saved, ...prev.returnRequests],
      }));
      return { ok: true, data: saved };
    }

    const nowIso = new Date().toISOString();
    const newReq: ReturnRefundRequest = {
      return_id: Math.max(0, ...state.returnRequests.map((r) => r.return_id)) + 1,
      reference_code: buildUniqueReturnRefCode(),
      order_id: order.order_id,
      resident_id: currentUser.user_id,
      merchant_id: order.merchant_id,
      reason_code: input.reason_code,
      description: input.description.trim(),
      requested_refund_amount: requestedAmount,
      status: 'requested',
      created_at: nowIso,
      updated_at: nowIso,
    };
    setState((prev) => ({
      ...prev,
      returnRequests: [newReq, ...prev.returnRequests],
      notifications: pushNotification(
        prev.notifications,
        order.merchant_id,
        `Return Request ${newReq.reference_code}`,
        `Customer requested ₱${requestedAmount.toFixed(2)} return/refund for ${order.order_code}.`,
        'Order'
      ),
    }));
    return { ok: true, data: newReq };
  };

  const respondReturnAsMerchant: MedExContextValue['respondReturnAsMerchant'] = async (
    returnId,
    input
  ) => {
    const existing = state.returnRequests.find((r) => r.return_id === returnId);
    if (!existing) return { ok: false, error: 'Return request not found.' };
    const isStoreOwner =
      currentUser.role === 'merchant' &&
      existing.merchant_id === currentUser.user_id &&
      currentUser.status === 'approved';
    if (!isStoreOwner && currentUser.role !== 'admin') {
      return { ok: false, error: 'Only the assigned Store/Merchant can respond to this return.' };
    }
    if (!canTransitionReturnRefundStatus(existing.status, input.status, currentUser.role)) {
      return { ok: false, error: 'Invalid return status transition.' };
    }

    if (isMySqlBackendActive()) {
      const res = await respondReturnMerchantInDb(returnId, input);
      if (!res.ok || !res.returnRequest) {
        return { ok: false, error: res.error || 'Could not update return status.' };
      }
      const saved = res.returnRequest;
      setState((prev) => ({
        ...prev,
        returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? saved : r)),
      }));
      return { ok: true, data: saved };
    }

    const nowIso = new Date().toISOString();
    const finalAmt =
      input.approvedAmount !== undefined && Number.isFinite(input.approvedAmount)
        ? Math.min(existing.requested_refund_amount, Math.max(0, input.approvedAmount))
        : input.status === 'store_rejected'
          ? 0
          : existing.requested_refund_amount;
    const updated: ReturnRefundRequest = {
      ...existing,
      status: input.status,
      approved_refund_amount: finalAmt,
      store_response_note: input.responseNote?.trim() || '',
      store_responded_by: currentUser.user_id,
      store_responded_at: nowIso,
      updated_at: nowIso,
    };
    setState((prev) => ({
      ...prev,
      returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? updated : r)),
      notifications: pushNotification(
        prev.notifications,
        existing.resident_id,
        `Return Update: ${existing.reference_code}`,
        `Store updated your return request to ${input.status.replace('_', ' ')}.`,
        'Order'
      ),
    }));
    return { ok: true, data: updated };
  };

  const escalateReturnRefund: MedExContextValue['escalateReturnRefund'] = async (
    returnId,
    reason
  ) => {
    const existing = state.returnRequests.find((r) => r.return_id === returnId);
    if (!existing) return { ok: false, error: 'Return request not found.' };
    if (existing.resident_id !== currentUser.user_id && currentUser.role !== 'admin') {
      return { ok: false, error: 'Not authorized to escalate this return.' };
    }
    if (!reason.trim()) return { ok: false, error: 'Escalation reason is required.' };
    if (!canTransitionReturnRefundStatus(existing.status, 'escalated', currentUser.role)) {
      return { ok: false, error: 'This return request cannot be escalated in its current status.' };
    }

    if (isMySqlBackendActive()) {
      const res = await escalateReturnInDb(returnId, reason.trim());
      if (!res.ok || !res.returnRequest) {
        return { ok: false, error: res.error || 'Could not escalate return request.' };
      }
      const saved = res.returnRequest;
      setState((prev) => ({
        ...prev,
        returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? saved : r)),
      }));
      return { ok: true, data: saved };
    }

    const nowIso = new Date().toISOString();
    const updated: ReturnRefundRequest = {
      ...existing,
      status: 'escalated',
      escalated_at: nowIso,
      escalation_reason: reason.trim(),
      updated_at: nowIso,
    };
    setState((prev) => {
      let notifications = prev.notifications;
      const csUsers = prev.users.filter(
        (u) => (u.role === 'customer_service' || u.role === 'admin') && u.status === 'approved'
      );
      for (const u of csUsers) {
        notifications = pushNotification(
          notifications,
          u.user_id,
          `Escalated Return ${existing.reference_code}`,
          `Customer escalated return/refund dispute ${existing.reference_code}: ${reason.trim()}`,
          'Feedback'
        );
      }
      return {
        ...prev,
        returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? updated : r)),
        notifications,
      };
    });
    return { ok: true, data: updated };
  };

  const resolveReturnAsCS: MedExContextValue['resolveReturnAsCS'] = async (returnId, input) => {
    if (!hasPermission(currentUser, 'returns:resolve_dispute')) {
      return { ok: false, error: 'Customer Service permission required to resolve return disputes.' };
    }
    const existing = state.returnRequests.find((r) => r.return_id === returnId);
    if (!existing) return { ok: false, error: 'Return request not found.' };
    if (!canTransitionReturnRefundStatus(existing.status, input.status, currentUser.role)) {
      return { ok: false, error: 'Invalid Customer Service dispute transition.' };
    }

    if (isMySqlBackendActive()) {
      const res = await resolveReturnCsInDb(returnId, input);
      if (!res.ok || !res.returnRequest) {
        return { ok: false, error: res.error || 'Failed to resolve return dispute.' };
      }
      const saved = res.returnRequest;
      setState((prev) => ({
        ...prev,
        returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? saved : r)),
      }));
      return { ok: true, data: saved };
    }

    const nowIso = new Date().toISOString();
    const finalAmt =
      input.approvedAmount !== undefined && Number.isFinite(input.approvedAmount)
        ? Math.min(existing.requested_refund_amount, Math.max(0, input.approvedAmount))
        : input.status === 'cs_dismissed'
          ? 0
          : existing.requested_refund_amount;
    const updated: ReturnRefundRequest = {
      ...existing,
      status: input.status,
      approved_refund_amount: finalAmt,
      cs_notes: input.csNotes ?? existing.cs_notes,
      cs_resolution_note: input.resolutionNote?.trim() || '',
      cs_resolved_by: currentUser.user_id,
      cs_resolved_at: nowIso,
      updated_at: nowIso,
    };
    setState((prev) => {
      let notifications = pushNotification(
        prev.notifications,
        existing.resident_id,
        `CS Decision on ${existing.reference_code}`,
        `Customer Service updated your dispute to ${input.status.replace('_', ' ')}.`,
        'Feedback'
      );
      notifications = pushNotification(
        notifications,
        existing.merchant_id,
        `CS Decision on ${existing.reference_code}`,
        `Customer Service closed return dispute ${existing.reference_code} as ${input.status.replace('_', ' ')}.`,
        'Feedback'
      );
      return {
        ...prev,
        returnRequests: prev.returnRequests.map((r) => (r.return_id === returnId ? updated : r)),
        notifications,
        auditLogs: appendAudit(
          prev,
          'CS_RESOLVE_RETURN',
          'return_refund_requests',
          returnId,
          `${existing.reference_code}: ${existing.status} -> ${input.status} (₱${finalAmt.toFixed(2)})`
        ),
      };
    });
    return { ok: true, data: updated };
  };

  const updateAccountStatus = (
    userId: number,
    status: AccountStatus,
    reason?: string,
    documentsVerified?: boolean
  ) => {
    const nowIso = new Date().toISOString();
    setState((prev) => {
      const target = prev.users.find((u) => u.user_id === userId);
      const prevStatus = target?.status || 'unknown';
      const isApprovingMerchant = target?.role === 'merchant' && status === 'approved';
      const isApprovingRider = target?.role === 'rider' && status === 'approved';
      const statusLabel =
        (target?.role === 'merchant' || target?.role === 'rider') && status === 'approved'
          ? 'Verified'
          : status;
      const auditLogs = appendAudit(
        prev,
        `UPDATE_ACCOUNT_STATUS`,
        'users',
        userId,
        `status: ${prevStatus} -> ${statusLabel}${
          isApprovingMerchant
            ? ' (Business Permit & Gov ID verified)'
            : isApprovingRider
              ? " (Driver's License & Vehicle Registration verified)"
              : ''
        }${reason ? ` (${reason})` : ''}`
      );
      const notifications = pushNotification(
        prev.notifications,
        userId,
        `Account status updated to ${statusLabel}`,
        reason ||
          (isApprovingMerchant
            ? 'Your Business Permit and Government ID were verified by Admin. Your pharmacy is now live on MedEx.'
            : isApprovingRider
              ? "Your Driver's License and Vehicle Registration were verified by Admin. You can now go online for Olongapo dispatch."
              : `Your MedEx account is now ${statusLabel}.`),
        'Verification'
      );
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.user_id === userId ? { ...u, status, status_reason: reason } : u
        ),
        merchants: isApprovingMerchant
          ? prev.merchants.map((m) =>
              m.user_id === userId
                ? {
                    ...m,
                    documents_verified_at: nowIso,
                    documents_verified_by: currentUser.user_id,
                  }
                : m
            )
          : prev.merchants,
        riderProfiles: isApprovingRider
          ? prev.riderProfiles.map((r) =>
              r.user_id === userId
                ? {
                    ...r,
                    documents_verified_at: nowIso,
                    documents_verified_by: currentUser.user_id,
                  }
                : r
            )
          : prev.riderProfiles,
        auditLogs,
        notifications,
      };
    });
    void syncAccountStatusToDb(userId, status, reason, documentsVerified).then(async (res) => {
      if (!res.ok) {
        console.warn('[MedEx] Failed to sync account status:', res.error);
        const slice = await hydrateInventoryAndMerchantStateFromMySql();
        if (slice) applyDbSnapshot(slice);
      }
    });
  };

  const updateUserRole = (userId: number, role: UserRole) => {
    setState((prev) => {
      const target = prev.users.find((u) => u.user_id === userId);
      const auditLogs = appendAudit(
        prev,
        'CHANGE_ROLE',
        'users',
        userId,
        `role: ${target?.role} -> ${role}`
      );
      return {
        ...prev,
        users: prev.users.map((u) => (u.user_id === userId ? { ...u, role } : u)),
        auditLogs,
      };
    });
    void syncUserRoleToDb(userId, role).then(async (res) => {
      if (!res.ok) {
        console.warn('[MedEx] Failed to sync user role:', res.error);
        const slice = await hydrateInventoryAndMerchantStateFromMySql();
        if (slice) applyDbSnapshot(slice);
      }
    });
  };

  const verifyEmergencyAlert = (
    alertId: number,
    decision: VerificationDecision,
    notes: string
  ): ActionResult => {
    if (!notes.trim()) return { ok: false, error: 'Verification notes are required.' };
    const now = new Date();
    const actorId = state.currentUserId ?? currentUser.user_id;
    const actor = state.users.find((u) => u.user_id === actorId);
    const verifierName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin';

    setState((prev) => {
      const targetAlert = prev.alerts.find((a) => a.alert_id === alertId);
      const updatedAlerts = prev.alerts.map((a) =>
        a.alert_id === alertId
          ? {
              ...a,
              status: 'verified' as const,
              verification: {
                verification_id: (a.verification?.verification_id || alertId) + 100,
                alert_id: alertId,
                decision,
                verified_at: now.toISOString(),
                verified_by_id: actorId,
                verified_by_name: verifierName,
                notes: notes.trim(),
              },
            }
          : a
      );

      const auditLogs = appendAudit(
        prev,
        'VERIFY_EMERGENCY_ALERT',
        'emergency_alerts',
        alertId,
        `decision: ${targetAlert?.verification?.decision ?? 'unverified'} -> ${decision}`
      );

      const notifications = targetAlert
        ? pushNotification(
            prev.notifications,
            targetAlert.user_id,
            decision === 'genuine'
              ? 'Emergency Alert Verified'
              : 'Emergency Verification Complete',
            decision === 'genuine'
              ? `Alert ${targetAlert.reference_code} confirmed genuine and logged for Olongapo dispatch response.`
              : `Alert ${targetAlert.reference_code} marked as ${decision.replace('_', ' ')}.`,
            'Verification'
          )
        : prev.notifications;

      return { ...prev, alerts: updatedAlerts, auditLogs, notifications };
    });

    syncAlertVerificationToDb(alertId, decision, actorId, verifierName, notes.trim());
    return { ok: true };
  };

  const addBarangay = (
    name: string,
    city: string,
    province: string,
    region: string
  ): ActionResult => {
    if (!name.trim() || !city.trim() || !province.trim()) {
      return { ok: false, error: 'Barangay name, city, and province are required.' };
    }
    const nextId = Math.max(0, ...state.barangays.map((b) => b.barangay_id)) + 1;
    const newBarangay: Barangay = {
      barangay_id: nextId,
      name: name.trim(),
      city: city.trim(),
      province: province.trim(),
      region: region.trim() || 'Region III',
    };
    setState((prev) => {
      const auditLogs = appendAudit(
        prev,
        'ADD_BARANGAY',
        'barangays',
        nextId,
        `Added Brgy. ${name.trim()}, ${city.trim()}`
      );
      return {
        ...prev,
        barangays: [...prev.barangays, newBarangay],
        auditLogs,
      };
    });
    syncBarangayToDb(newBarangay);
    return { ok: true };
  };

  const updateRiderVehicle = (
    riderId: number,
    vehicleType: string,
    plateNumber: string
  ): ActionResult => {
    const cleanType = vehicleType.trim();
    if (!cleanType) {
      return { ok: false, error: 'Vehicle type is required.' };
    }
    const plateCheck = validateAndNormalizePHPlateNumber(plateNumber, cleanType);
    if (!plateCheck.valid) {
      return { ok: false, error: plateCheck.error || 'Invalid Philippine LTO plate number.' };
    }
    setState((prev) => ({
      ...prev,
      riderProfiles: prev.riderProfiles.map((r) =>
        r.rider_id === riderId
          ? { ...r, vehicle_type: cleanType, plate_number: plateCheck.normalized }
          : r
      ),
      auditLogs: appendAudit(
        prev,
        'UPDATE_RIDER_VEHICLE',
        'rider_profiles',
        riderId,
        `${cleanType} (${plateCheck.normalized})`
      ),
    }));
    syncRiderVehicleToDb(riderId, cleanType, plateCheck.normalized);
    return { ok: true };
  };

  const markNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.user_id === currentUser.user_id ? { ...n, is_read: true } : n
      ),
    }));
    syncNotificationsReadToDb(currentUser.user_id);
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(getInitialState());
    setActiveTab('customer_home');
  };

  const value: MedExContextValue = {
    state,
    currentUser,
    isLoggedIn,
    theme,
    toggleTheme,
    draftRxProof,
    setDraftRxProof,
    pendingCartIntent,
    setPendingCartIntent,
    postAuthNotice,
    clearPostAuthNotice,
    openCartAfterLogin,
    setOpenCartAfterLogin,
    activeTab,
    setActiveTab,
    locatorSearchDraft,
    setLocatorSearchDraft,
    merchantInventoryFocusProductId,
    setMerchantInventoryFocusProductId,
    isOnline,
    setSimulatedOffline,
    simulatedOffline,
    activeCart,
    unreadNotificationCount,
    switchAccount,
    loginByEmail,
    loginWithCredentials,
    logout,
    registerAccount,
    registerWithCredentials,
    claimAdminPassword,
    databaseConnected,
    adminNeedsPasswordSetup,
    updateUserProfile,
    saveAddress,
    deleteAddress,
    setPrimaryAddress,
    updateHouseholdFlags,
    saveEmergencyContact,
    deleteEmergencyContact,
    addToCart,
    updateCartQuantity,
    clearCart,
    placeOrder,
    cancelOrder,
    reuploadPrescription,
    retryGcashPayment,
    switchPaymentToCod,
    submitEmergencyAlert,
    syncOfflineQueuedAlerts,
    saveProduct,
    deleteProduct,
    restoreProduct,
    toggleMerchantTempClosed,
    toggleMerchant24Hours,
    updateMerchantHours,
    updateMerchantStoreLocation,
    completeMerchantProfile,
    completeRiderProfile,
    reviewPrescription,
    advanceMerchantOrderStatus,
    toggleRiderOnline,
    respondToDeliveryRequest,
    confirmRiderPickup,
    recordCodCollection,
    submitDeliveryCode,
    markDeliveryNotHome,
    retryNotHomeDelivery,
    returnNotHomeOrderToPharmacy,
    rateDelivery,
    submitPharmacyReview,
    editPharmacyReview,
    replyToPharmacyReview,
    moderatePharmacyReview,
    submitProblemReport,
    updateProblemReportStatus,
    escalateProblemReport,
    hasCurrentPermission,
    createInternalStaffAccount,
    updateUserPermissions,
    assignRiderToDelivery,
    updateRiderOperationalStatus,
    saveCoupon,
    deleteCoupon,
    claimCoupon,
    previewValidateCoupon,
    requestReturnRefund,
    respondReturnAsMerchant,
    escalateReturnRefund,
    resolveReturnAsCS,
    updateAccountStatus,
    updateUserRole,
    verifyEmergencyAlert,
    addBarangay,
    updateRiderVehicle,
    markNotificationsRead,
    resetDemoData,
  };

  return <MedExContext.Provider value={value}>{children}</MedExContext.Provider>;
};

export function useMedEx(): MedExContextValue {
  const ctx = useContext(MedExContext);
  if (!ctx) throw new Error('useMedEx must be used inside MedExProvider');
  return ctx;
}

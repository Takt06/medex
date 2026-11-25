import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Flag,
  MapPin,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Star,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type {
  AccountStatus,
  ProblemReportStatus,
  Product,
  UserRole,
  VerificationDecision,
} from '../../types/medex';
import {
  computeRiderRatingStats,
  formatEmergencyCategoryLabel,
  formatMerchantStatusLabel,
  formatPHP,
  formatReviewerDisplayName,
  getAvailabilityStatus,
  getLowestStockProducts,
  getMerchantOpenStatus,
  hasRepeatEmergencyMisuse,
  isReportOver48Hours,
  isSafeImageOrDocUrl,
} from '../../utils/medexRules';
import { fetchProtectedDocumentBlobUrl } from '../../utils/apiSync';
import {
  INTERNAL_ADMIN_ROLES,
  INTERNAL_DEPARTMENT_ROLES,
  PERMISSION_CATALOG,
  ROLE_DISPLAY_NAMES,
  getEffectivePermissions,
  type RbacPermission,
} from '../../utils/rbac';
import type { AdminSection } from '../layout/RoleDashboards';

interface AdminPortalViewProps {
  activeSection?: AdminSection;
  onChangeSection?: (section: AdminSection) => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  activeSection,
  onChangeSection,
}) => {
  const {
    state,
    currentUser,
    updateAccountStatus,
    updateUserRole,
    verifyEmergencyAlert,
    addBarangay,
    updateRiderVehicle,
    reviewPrescription,
    moderatePharmacyReview,
    updateProblemReportStatus,
    createInternalStaffAccount,
    updateUserPermissions,
    saveProduct,
    deleteProduct,
    restoreProduct,
    toggleMerchant24Hours,
    toggleMerchantTempClosed,
  } = useMedEx();

  const [internalSubTab, setInternalSubTab] = useState<AdminSection>('alerts');
  const subTab = activeSection ?? internalSubTab;
  const setSubTab = (next: AdminSection) => {
    setInternalSubTab(next);
    onChangeSection?.(next);
  };
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Alert verification state
  const [verifyNotes, setVerifyNotes] = useState<Record<number, string>>({});

  // User filter state
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [suspendReason, setSuspendReason] = useState('');

  // Rider vehicle edits
  const [vehicleEdits, setVehicleEdits] = useState<Record<number, { type: string; plate: string }>>({});

  // New barangay form (Olongapo City initial focus)
  const [brgyName, setBrgyName] = useState('');
  const [brgyCity, setBrgyCity] = useState('Olongapo City');
  const [brgyProv, setBrgyProv] = useState('Zambales');
  const [brgyRegion, setBrgyRegion] = useState('Region III');

  // Reports date range
  const [reportFrom, setReportFrom] = useState('2026-01-01');
  const [reportTo, setReportTo] = useState('2026-12-31');

  // Module 9 & Rider Feedback Oversight state
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<'all' | 'reviews' | 'reports' | 'riders'>('all');
  const [feedbackMerchantFilter, setFeedbackMerchantFilter] = useState<string>('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<string>('all');
  const [feedbackMinRating, setFeedbackMinRating] = useState<string>('all');
  const [moderationReasons, setModerationReasons] = useState<Record<number, string>>({});
  const [reportNotes, setReportNotes] = useState<Record<number, string>>({});
  const [reportAdminMemos, setReportAdminMemos] = useState<Record<number, string>>({});
  const [expandedReportIds, setExpandedReportIds] = useState<Record<number, boolean>>({});

  // Live Catalog & Pharmacies oversight filters
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogMerchantFilter, setCatalogMerchantFilter] = useState<string>('all');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<
    'all' | 'listed' | 'hidden' | 'low_stock' | 'archived'
  >('all');
  const [adminConfirmDeleteId, setAdminConfirmDeleteId] = useState<number | null>(null);
  const [adminMutatingProductId, setAdminMutatingProductId] = useState<number | null>(null);
  const [verifiedDocsByUserId, setVerifiedDocsByUserId] = useState<Record<number, boolean>>({});
  const [docPreviewModal, setDocPreviewModal] = useState<{
    subjectRoleLabel?: string;
    shopName: string;
    docLabel: string;
    fileName: string;
    url: string;
  } | null>(null);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string>('');
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState<string | null>(null);

  // Internal Department Staff Creation & Permission Override Modal
  const [newStaffRole, setNewStaffRole] = useState<
    'delivery_manager' | 'coupon_handler' | 'inventory_manager' | 'customer_service'
  >('delivery_manager');
  const [newStaffFirstName, setNewStaffFirstName] = useState('');
  const [newStaffLastName, setNewStaffLastName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('+639');
  const [newStaffDob, setNewStaffDob] = useState('1994-05-15');
  const [newStaffPassword, setNewStaffPassword] = useState('MedExStaff!2026');
  const [newStaffDeptLabel, setNewStaffDeptLabel] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);

  const [editingPermsUserId, setEditingPermsUserId] = useState<number | null>(null);
  const [permGrantsDraft, setPermGrantsDraft] = useState<string[]>([]);
  const [permRevokesDraft, setPermRevokesDraft] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    if (!docPreviewModal) {
      setResolvedPreviewUrl('');
      setDocPreviewLoading(false);
      setDocPreviewError(null);
      return;
    }
    let cancelled = false;
    let revokeFn: (() => void) | null = null;
    if (!docPreviewModal.url.startsWith('/api/')) {
      setResolvedPreviewUrl(docPreviewModal.url);
      setDocPreviewLoading(false);
      setDocPreviewError(null);
      return;
    }
    setDocPreviewLoading(true);
    setDocPreviewError(null);
    void fetchProtectedDocumentBlobUrl(docPreviewModal.url).then((res) => {
      if (cancelled) {
        if (res.isBlob && res.objectUrl) URL.revokeObjectURL(res.objectUrl);
        return;
      }
      if (!res.objectUrl) {
        setResolvedPreviewUrl('');
        setDocPreviewError(res.error || 'Could not load document preview.');
      } else {
        if (res.isBlob) {
          revokeFn = () => URL.revokeObjectURL(res.objectUrl);
        }
        setResolvedPreviewUrl(res.objectUrl);
      }
      setDocPreviewLoading(false);
    });
    return () => {
      cancelled = true;
      if (revokeFn) revokeFn();
    };
  }, [docPreviewModal]);

  // KPI calculations
  const kpis = useMemo(() => {
    const customers = state.users.filter((u) => u.role === 'resident').length;
    const activeProducts = state.products.filter((p) => !p.is_archived);
    const medicines = activeProducts.filter((p) => p.is_listed).length;
    const archivedCount = state.products.filter((p) => Boolean(p.is_archived)).length;
    const pendingOrders = state.orders.filter(
      (o) => !['delivered', 'cancelled'].includes(o.status)
    ).length;
    const pendingRx = state.orders.filter(
      (o) => o.prescription?.status === 'pending_review'
    ).length;
    const activeRiders = state.riderProfiles.filter((r) => r.is_online).length;
    const totalSales = state.orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + o.total_amount, 0);
    const lowStock = activeProducts.filter(
      (p) => p.stock_quantity <= p.low_stock_threshold
    ).length;
    const unverifiedAlerts = state.alerts.filter(
      (a) => a.status !== 'cancelled' && !a.verification
    ).length;
    const openProblemReports = state.problemReports.filter(
      (r) => r.status === 'open' || r.status === 'acknowledged'
    ).length;
    const overdueReports = state.problemReports.filter((r) => isReportOver48Hours(r)).length;
    return {
      customers,
      activeProductsCount: activeProducts.length,
      medicines,
      archivedCount,
      pendingOrders,
      pendingRx,
      activeRiders,
      totalSales,
      lowStock,
      unverifiedAlerts,
      openProblemReports,
      overdueReports,
    };
  }, [state]);

  const feedbackSummary = useMemo(() => {
    const visibleReviews = state.pharmacyReviews.filter((r) => r.status === 'visible');
    const avgStoreRating =
      visibleReviews.length > 0
        ? Number(
            (visibleReviews.reduce((s, r) => s + r.rating, 0) / visibleReviews.length).toFixed(1)
          )
        : 0;
    const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const reviewsThisWeek = state.pharmacyReviews.filter(
      (r) => new Date(r.created_at).getTime() >= weekAgoMs
    ).length;
    const openReports = state.problemReports.filter(
      (r) => r.status === 'open' || r.status === 'acknowledged'
    ).length;
    const overdue48h = state.problemReports.filter((r) => isReportOver48Hours(r)).length;
    const openLocatorReports = state.problemReports.filter(
      (r) => r.source === 'locator' && (r.status === 'open' || r.status === 'acknowledged')
    ).length;
    const totalSkus = Math.max(1, state.products.length);
    const locatorAccuracyRate = Math.max(
      0,
      Math.round(((totalSkus - openLocatorReports) / totalSkus) * 100)
    );
    const avgRiderRating =
      state.riderRatings.length > 0
        ? Number(
            (
              state.riderRatings.reduce((s, r) => s + r.stars, 0) / state.riderRatings.length
            ).toFixed(1)
          )
        : 5.0;
    return {
      avgStoreRating,
      reviewsThisWeek,
      openReports,
      overdue48h,
      locatorAccuracyRate,
      avgRiderRating,
    };
  }, [state.pharmacyReviews, state.problemReports, state.products.length, state.riderRatings]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return state.users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone_number.includes(q)
      );
    });
  }, [state.users, userSearch, roleFilter, statusFilter]);

  const lowestStockCatalogProducts = useMemo(
    () => getLowestStockProducts(state.products, 10),
    [state.products]
  );

  const filteredCatalogProducts = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return state.products.filter((prod) => {
      if (catalogMerchantFilter !== 'all' && String(prod.merchant_id) !== catalogMerchantFilter) {
        return false;
      }
      if (catalogStatusFilter === 'archived') {
        if (!prod.is_archived) return false;
      } else {
        if (prod.is_archived) return false;
        if (catalogStatusFilter === 'listed' && !prod.is_listed) return false;
        if (catalogStatusFilter === 'hidden' && prod.is_listed) return false;
        if (catalogStatusFilter === 'low_stock' && prod.stock_quantity > prod.low_stock_threshold) {
          return false;
        }
      }
      if (!q) return true;
      const merchant = state.merchants.find((m) => m.merchant_id === prod.merchant_id);
      const category = state.categories.find((c) => c.category_id === prod.category_id);
      return (
        prod.name.toLowerCase().includes(q) ||
        (prod.dosage_strength || '').toLowerCase().includes(q) ||
        (merchant?.shop_name || '').toLowerCase().includes(q) ||
        (category?.name || '').toLowerCase().includes(q)
      );
    });
  }, [
    state.products,
    state.merchants,
    state.categories,
    catalogSearch,
    catalogMerchantFilter,
    catalogStatusFilter,
  ]);

  const handleAdminToggleListed = async (prod: Product) => {
    if (adminMutatingProductId !== null) return;
    setAdminMutatingProductId(prod.product_id);
    try {
      const nextListed = !prod.is_listed;
      const res = await saveProduct({
        product_id: prod.product_id,
        category_id: prod.category_id,
        name: prod.name,
        dosage_strength: prod.dosage_strength,
        description: prod.description,
        image_path: prod.image_path,
        unit: prod.unit,
        purchase_limit: prod.purchase_limit,
        is_listed: nextListed,
        requires_prescription: prod.requires_prescription,
        regular_price: prod.regular_price,
        stock_quantity: prod.stock_quantity,
        low_stock_threshold: prod.low_stock_threshold,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not update listing visibility.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: nextListed
          ? `${prod.name} restored to the live storefront.`
          : `${prod.name} unlisted and hidden from the live storefront.`,
      });
    } finally {
      setAdminMutatingProductId(null);
    }
  };

  const handleAdminArchiveProduct = async (prod: Product) => {
    if (adminMutatingProductId !== null) return;
    setAdminMutatingProductId(prod.product_id);
    try {
      const res = await deleteProduct(prod.product_id);
      setAdminConfirmDeleteId(null);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not archive medicine.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `${prod.name} archived across all storefronts. Historical order records are preserved.`,
      });
    } finally {
      setAdminMutatingProductId(null);
    }
  };

  const handleAdminRestoreProduct = async (prod: Product) => {
    if (adminMutatingProductId !== null) return;
    setAdminMutatingProductId(prod.product_id);
    try {
      const res = await restoreProduct(prod.product_id);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not restore archived medicine.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `${prod.name} restored to active catalog and synced live.`,
      });
    } finally {
      setAdminMutatingProductId(null);
    }
  };

  const flaggedOrders = useMemo(
    () =>
      state.orders.filter(
        (o) => o.payment.is_flagged || o.delivery?.is_flagged_for_admin
      ),
    [state.orders]
  );

  const reportOrders = useMemo(() => {
    const fromMs = new Date(`${reportFrom}T00:00:00Z`).getTime();
    const toMs = new Date(`${reportTo}T23:59:59Z`).getTime();
    return state.orders.filter((o) => {
      const t = new Date(o.placed_at).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [state.orders, reportFrom, reportTo]);

  const handleVerifyAlert = (alertId: number, decision: VerificationDecision) => {
    const note =
      verifyNotes[alertId]?.trim() ||
      (decision === 'genuine'
        ? 'Verified genuine emergency via barangay check'
        : `Marked as ${decision.replace('_', ' ')}`);
    const res = verifyEmergencyAlert(alertId, decision, note);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Verification failed.' });
      return;
    }
    setFeedback({
      type: 'success',
      text:
        decision === 'genuine'
          ? 'Alert verified genuine and logged for Olongapo emergency dispatch.'
          : `Alert marked ${decision.replace('_', ' ')}.`,
    });
  };

  const pendingApprovals = state.users.filter((u) => u.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Executive Admin Welcome Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="medex-glass-dark rounded-3xl border border-teal-400/25 bg-gradient-to-br from-slate-900/66 via-slate-900/56 to-teal-950/66 p-6 text-white relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-teal-400/18 blur-2xl"
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/35 text-teal-300 items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-300">
                <span>WELCOME BACK, {currentUser.first_name.toUpperCase()} {currentUser.last_name.toUpperCase()}</span>
                <span className="text-slate-500">·</span>
                <span>OLONGAPO GOVERNANCE</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 text-white">
                Platform Oversight, Safety &amp; Feedback
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Verify emergency SOS alerts, approve partner pharmacies and riders, oversee store &amp; rider ratings, and audit Olongapo operations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 shrink-0 text-center">
            <button
              type="button"
              onClick={() => setSubTab('alerts')}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2 transition-colors"
            >
              <span className="block font-display text-lg font-bold text-white tabular-nums">
                {kpis.unverifiedAlerts}
              </span>
              <span className="block text-[10px] font-medium text-teal-300 whitespace-nowrap">
                Alerts Queue
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('users')}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2 transition-colors"
            >
              <span className="block font-display text-lg font-bold text-white tabular-nums">
                {pendingApprovals}
              </span>
              <span className="block text-[10px] font-medium text-amber-300 whitespace-nowrap">
                Approvals
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('orders')}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2 transition-colors"
            >
              <span className="block font-display text-lg font-bold text-white tabular-nums">
                {kpis.activeRiders}
              </span>
              <span className="block text-[10px] font-medium text-emerald-300 whitespace-nowrap">
                Online Riders
              </span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Sales', value: formatPHP(kpis.totalSales) },
          { label: 'Active Orders', value: String(kpis.pendingOrders) },
          { label: 'Pending Rx Reviews', value: String(kpis.pendingRx) },
          { label: 'Unverified Alerts', value: String(kpis.unverifiedAlerts) },
          { label: 'Residents', value: String(kpis.customers) },
          { label: 'Listed Medicines', value: String(kpis.medicines) },
          { label: 'Low / Out Stock', value: String(kpis.lowStock) },
          { label: 'Online Riders', value: String(kpis.activeRiders) },
        ].map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: idx * 0.025 }}
            className="medex-glass rounded-2xl border p-4"
          >
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{kpi.label}</p>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {kpi.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
        {(
          [
            ['alerts', `Emergency Verification (${kpis.unverifiedAlerts} pending)`],
            ['users', `Users & Approvals (${pendingApprovals} pending)`],
            ['internal_roles', `Internal Roles & Access (${state.users.filter((u) => (INTERNAL_ADMIN_ROLES as readonly string[]).includes(u.role)).length})`],
            ['catalog', `Catalog & Pharmacies (${state.products.length})`],
            ['zones', 'Olongapo Zones'],
            ['orders', `Orders & Flags (${flaggedOrders.length} flagged)`],
            ['feedback', `Feedback & Ratings (${kpis.openProblemReports} open)`],
            ['reports', 'Reports & Audit Logs'],
          ] as const
        ).map(([id, label]) => (
          <motion.button
            key={id}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setSubTab(id)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors min-h-[38px] whitespace-nowrap ${
              subTab === id
                ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-sm'
                : 'medex-glass border text-slate-700 dark:text-slate-200 hover:border-teal-300 dark:hover:border-teal-700'
            }`}
          >
            {label}
          </motion.button>
        ))}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200'
              : 'border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SUBTAB: EMERGENCY VERIFICATION */}
      {subTab === 'alerts' && (
        <div className="space-y-4">
          {state.alerts.map((alert) => {
            const resident = state.users.find((u) => u.user_id === alert.user_id);
            const repeatMisuse = hasRepeatEmergencyMisuse(state.alerts, alert.user_id);
            return (
              <div
                key={alert.alert_id}
                className="medex-glass rounded-2xl border p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {alert.reference_code}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold uppercase text-red-700 dark:text-red-400">
                      {formatEmergencyCategoryLabel(alert.category)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase">
                      {alert.status}
                    </span>
                    {alert.handoff_mode && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {alert.handoff_mode === 'mobile_dialer' ? 'Mobile Dialer' : 'Desktop QR'}
                        </span>
                      </>
                    )}
                    {repeatMisuse && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          Repeat Misuse Flag (3+ in 30d)
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {resident ? `${resident.first_name} ${resident.last_name}` : 'Resident'} —{' '}
                  {alert.address_snapshot}
                </p>

                {alert.verification ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      Decision: {alert.verification.decision.toUpperCase()} · Verified by{' '}
                      {alert.verification.verified_by_name}
                    </p>
                    <p>{alert.verification.notes}</p>
                  </div>
                ) : alert.status === 'cancelled' ? (
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Cancelled by resident.
                  </p>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label
                        htmlFor={`vnote-${alert.alert_id}`}
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Verification Notes
                      </label>
                      <input
                        id={`vnote-${alert.alert_id}`}
                        type="text"
                        placeholder="e.g., Confirmed emergency response at barangay address"
                        value={verifyNotes[alert.alert_id] || ''}
                        onChange={(e) =>
                          setVerifyNotes((prev) => ({
                            ...prev,
                            [alert.alert_id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyAlert(alert.alert_id, 'genuine')}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                      >
                        Verify Genuine Emergency
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyAlert(alert.alert_id, 'accidental_press')}
                        className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 whitespace-nowrap"
                      >
                        Mark Accidental Press
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyAlert(alert.alert_id, 'false_alarm')}
                        className="rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 whitespace-nowrap"
                      >
                        Mark False Alarm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUBTAB: USERS & APPROVALS */}
      {subTab === 'users' && (
        <div className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, email, or +63 phone..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
            >
              <option value="all">All Roles</option>
              <option value="resident">Customer</option>
              <option value="merchant">Store / Merchant</option>
              <option value="rider">Delivery Rider</option>
              <option value="admin">Global Admin</option>
              <option value="delivery_manager">Delivery Management</option>
              <option value="coupon_handler">Coupon Handler</option>
              <option value="inventory_manager">Inventory Management</option>
              <option value="customer_service">Customer Service</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Verification</option>
              <option value="approved">Verified / Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const merchant = state.merchants.find((m) => m.user_id === u.user_id);
              const merchantHours = merchant
                ? state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id)
                : [];
              const merchantOpenStatus = merchant
                ? getMerchantOpenStatus(merchant, merchantHours)
                : null;
              const merchantSkus = merchant
                ? state.products.filter((p) => p.merchant_id === merchant.merchant_id && !p.is_archived)
                : [];
              const listedSkuCount = merchantSkus.filter((p) => p.is_listed).length;
              const rider = state.riderProfiles.find((r) => r.user_id === u.user_id);
              const vEdit = vehicleEdits[u.user_id] || {
                type: rider?.vehicle_type || 'Motorcycle',
                plate: rider?.plate_number || '',
              };
              const isMerchantWithDocsGate = u.role === 'merchant' && u.status !== 'approved';
              const isRiderWithDocsGate = u.role === 'rider' && u.status !== 'approved';
              const requiresDocsGate = isMerchantWithDocsGate || isRiderWithDocsGate;
              const hasPermit = Boolean(merchant?.business_permit_url);
              const hasGovId = Boolean(merchant?.government_id_url);
              const hasDriverLicense = Boolean(rider?.driver_license_url);
              const hasVehicleReg = Boolean(rider?.vehicle_registration_url);
              const docsVerifiedChecked = Boolean(verifiedDocsByUserId[u.user_id]);
              const statusDisplayLabel =
                u.role === 'merchant' || u.role === 'rider'
                  ? formatMerchantStatusLabel(u.status)
                  : u.status;

              return (
                <div
                  key={u.user_id}
                  className="medex-glass rounded-2xl border p-4 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {u.first_name} {u.last_name}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="uppercase font-semibold text-teal-700 dark:text-teal-400">
                          {u.role}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span
                          className={`uppercase font-semibold ${
                            u.status === 'approved'
                              ? 'text-teal-700 dark:text-teal-400'
                              : u.status === 'pending'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {statusDisplayLabel}
                        </span>
                        {merchantOpenStatus && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span
                              className={`font-semibold ${
                                merchantOpenStatus.isOpen
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {merchantOpenStatus.label}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                        {u.email} · {u.phone_number}
                        {merchant
                          ? ` · Pharmacy: ${merchant.shop_name} (${merchant.pharmacist_license_no}) · ${listedSkuCount}/${merchantSkus.length} SKUs listed`
                          : ''}
                        {rider ? ` · Vehicle: ${rider.vehicle_type} (${rider.plate_number})` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={u.role}
                        aria-label={`Role for ${u.first_name}`}
                        onChange={(e) => updateUserRole(u.user_id, e.target.value as UserRole)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                      >
                        <option value="resident">Customer</option>
                        <option value="merchant">Store / Merchant</option>
                        <option value="rider">Delivery Rider</option>
                        <option value="admin">Global Admin</option>
                        <option value="delivery_manager">Delivery Management</option>
                        <option value="coupon_handler">Coupon Handler</option>
                        <option value="inventory_manager">Inventory Management</option>
                        <option value="customer_service">Customer Service</option>
                      </select>

                      {u.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={requiresDocsGate && !docsVerifiedChecked}
                          onClick={() => {
                            if (requiresDocsGate && !docsVerifiedChecked) {
                              setFeedback({
                                type: 'error',
                                text:
                                  u.role === 'rider'
                                    ? "Review and confirm the rider's Driver's License ID and Vehicle Registration Document before approving."
                                    : 'Review and confirm the merchant Business Permit and Government-Issued ID before approving.',
                              });
                              return;
                            }
                            updateAccountStatus(
                              u.user_id,
                              'approved',
                              undefined,
                              u.role === 'merchant' || u.role === 'rider' ? true : undefined
                            );
                            setFeedback({
                              type: 'success',
                              text:
                                u.role === 'merchant'
                                  ? `${merchant?.shop_name || u.first_name} verified and approved live on the storefront.`
                                  : u.role === 'rider'
                                    ? `${u.first_name} ${u.last_name} verified and approved for Olongapo dispatch.`
                                    : `${u.first_name} ${u.last_name} approved.`,
                            });
                          }}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {u.role === 'merchant' || u.role === 'rider'
                            ? 'Verify & Approve'
                            : 'Approve'}
                        </button>
                      )}
                      {u.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateAccountStatus(
                              u.user_id,
                              'rejected',
                              suspendReason || 'Incomplete or invalid verification documents'
                            )
                          }
                          className="rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap"
                        >
                          Reject
                        </button>
                      )}
                      {u.status === 'approved' && u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateAccountStatus(
                              u.user_id,
                              'suspended',
                              suspendReason || 'Suspended by Admin review'
                            )
                          }
                          className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap"
                        >
                          Suspend
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateAccountStatus(
                              u.user_id,
                              'approved',
                              undefined,
                              u.role === 'merchant' || u.role === 'rider' ? true : undefined
                            )
                          }
                          className="rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/50 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 whitespace-nowrap"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>

                  {merchant && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            Seller Verification Docs:
                          </span>
                          {hasPermit ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDocPreviewModal({
                                  shopName: merchant.shop_name,
                                  docLabel: 'Business Permit',
                                  fileName: merchant.business_permit_name || 'business_permit',
                                  url: merchant.business_permit_url!,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Inspect Permit ({merchant.business_permit_name || 'File'})</span>
                            </button>
                          ) : (
                            <span className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                              Missing Business Permit
                            </span>
                          )}

                          {hasGovId ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDocPreviewModal({
                                  shopName: merchant.shop_name,
                                  docLabel: 'Government-Issued ID',
                                  fileName: merchant.government_id_name || 'government_id',
                                  url: merchant.government_id_url!,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Inspect Gov ID ({merchant.government_id_name || 'File'})</span>
                            </button>
                          ) : (
                            <span className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                              Missing Government ID
                            </span>
                          )}
                        </div>

                        {merchant.documents_verified_at && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            Verified on {new Date(merchant.documents_verified_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {isMerchantWithDocsGate && (
                        <label className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/35 px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={docsVerifiedChecked}
                            onChange={(e) =>
                              setVerifiedDocsByUserId((prev) => ({
                                ...prev,
                                [u.user_id]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                          />
                          <span className="text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed">
                            I have reviewed and verified this seller&apos;s{' '}
                            <strong>Business Permit</strong> and{' '}
                            <strong>Government-Issued ID</strong> before approving{' '}
                            <strong>{merchant.shop_name}</strong>.
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  {rider && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Rider Vehicle:</span>
                        <input
                          type="text"
                          value={vEdit.type}
                          onChange={(e) =>
                            setVehicleEdits((prev) => ({
                              ...prev,
                              [u.user_id]: { ...vEdit, type: e.target.value },
                            }))
                          }
                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs w-32"
                        />
                        <input
                          type="text"
                          value={vEdit.plate}
                          onChange={(e) =>
                            setVehicleEdits((prev) => ({
                              ...prev,
                              [u.user_id]: { ...vEdit, plate: e.target.value },
                            }))
                          }
                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs font-mono w-28"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = updateRiderVehicle(rider.rider_id, vEdit.type, vEdit.plate);
                            if (!res.ok) {
                              setFeedback({
                                type: 'error',
                                text: res.error || 'Invalid Philippine LTO plate number.',
                              });
                              return;
                            }
                            setFeedback({ type: 'success', text: 'Rider vehicle details updated.' });
                          }}
                          className="rounded bg-slate-900 dark:bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-700 whitespace-nowrap"
                        >
                          Update Vehicle
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            Rider Verification Docs:
                          </span>
                          {hasDriverLicense ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDocPreviewModal({
                                  subjectRoleLabel: 'Rider Verification Document',
                                  shopName: `${u.first_name} ${u.last_name} (${rider.plate_number})`,
                                  docLabel: "Driver's License / ID",
                                  fileName: rider.driver_license_name || 'driver_license',
                                  url: rider.driver_license_url!,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>
                                Inspect Driver&apos;s License ({rider.driver_license_name || 'File'})
                              </span>
                            </button>
                          ) : (
                            <span className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                              Missing Driver&apos;s License
                            </span>
                          )}

                          {hasVehicleReg ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDocPreviewModal({
                                  subjectRoleLabel: 'Rider Verification Document',
                                  shopName: `${u.first_name} ${u.last_name} (${rider.plate_number})`,
                                  docLabel: 'Vehicle Registration (LTO OR/CR)',
                                  fileName: rider.vehicle_registration_name || 'vehicle_registration',
                                  url: rider.vehicle_registration_url!,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>
                                Inspect Vehicle Reg ({rider.vehicle_registration_name || 'File'})
                              </span>
                            </button>
                          ) : (
                            <span className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                              Missing Vehicle Registration
                            </span>
                          )}
                        </div>

                        {rider.documents_verified_at && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            Verified on {new Date(rider.documents_verified_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {isRiderWithDocsGate && (
                        <label className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/35 px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={docsVerifiedChecked}
                            onChange={(e) =>
                              setVerifiedDocsByUserId((prev) => ({
                                ...prev,
                                [u.user_id]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                          />
                          <span className="text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed">
                            I have reviewed and verified this rider&apos;s{' '}
                            <strong>Driver&apos;s License ID</strong> and{' '}
                            <strong>Vehicle Registration Document (LTO OR/CR)</strong> before
                            approving <strong>{u.first_name} {u.last_name}</strong>.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBTAB: LIVE CATALOG & PHARMACIES */}
      {subTab === 'catalog' && (
        <div className="space-y-6">
          {/* Live Partner Pharmacy Operational Status */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Store className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Partner Pharmacies Status ({state.merchants.length})</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Store open/24h/closed flags and approvals sync live across every storefront.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.merchants.map((merchant) => {
                const owner = state.users.find((u) => u.user_id === merchant.user_id);
                const mHours = state.merchantHours.filter(
                  (h) => h.merchant_id === merchant.merchant_id
                );
                const openStatus = getMerchantOpenStatus(merchant, mHours);
                const mProducts = state.products.filter(
                  (p) => p.merchant_id === merchant.merchant_id
                );
                const listedCount = mProducts.filter((p) => p.is_listed).length;
                const addr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
                const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);

                return (
                  <div
                    key={merchant.merchant_id}
                    className="medex-glass rounded-2xl border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                            {merchant.shop_name}
                          </span>
                          <span
                            className={`uppercase font-semibold ${
                              owner?.status === 'approved'
                                ? 'text-teal-700 dark:text-teal-400'
                                : owner?.status === 'pending'
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {formatMerchantStatusLabel(owner?.status || 'approved')}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span
                            className={`font-semibold ${
                              openStatus.isOpen
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {openStatus.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                          RPh {merchant.pharmacist_name} ({merchant.pharmacist_license_no})
                          {brgy ? ` · Brgy. ${brgy.name}` : ''} · {listedCount}/{mProducts.length}{' '}
                          SKUs listed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCatalogMerchantFilter(String(merchant.merchant_id))}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        Filter SKUs
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-200 font-medium">
                        <input
                          type="checkbox"
                          checked={merchant.is_24_hours}
                          onChange={async (e) => {
                            const next = e.target.checked;
                            const res = await toggleMerchant24Hours(merchant.merchant_id, next);
                            if (!res.ok) {
                              setFeedback({
                                type: 'error',
                                text: res.error || 'Could not update 24-hour status.',
                              });
                            } else {
                              setFeedback({
                                type: 'success',
                                text: `${merchant.shop_name} 24-hour mode ${next ? 'enabled' : 'disabled'}.`,
                              });
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                        />
                        <span>Open 24 Hours</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-200 font-medium">
                        <input
                          type="checkbox"
                          checked={merchant.is_temporarily_closed}
                          onChange={async (e) => {
                            const next = e.target.checked;
                            const res = await toggleMerchantTempClosed(merchant.merchant_id, next);
                            if (!res.ok) {
                              setFeedback({
                                type: 'error',
                                text: res.error || 'Could not update closure status.',
                              });
                            } else {
                              setFeedback({
                                type: 'success',
                                text: `${merchant.shop_name} ${next ? 'marked Temporarily Closed' : 'reopened live'}.`,
                              });
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-600 accent-red-600"
                        />
                        <span>Temporarily Closed</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 10 Lowest Stock Products (Network-Wide) */}
          {lowestStockCatalogProducts.length > 0 && (
            <div className="medex-glass rounded-2xl border border-amber-200/80 dark:border-amber-800/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Top {lowestStockCatalogProducts.length} Lowest Stock Products (Network-Wide)</span>
                </h2>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Sorted by lowest active stock count across all Olongapo pharmacies
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {lowestStockCatalogProducts.map((prod) => {
                  const m = state.merchants.find((x) => x.merchant_id === prod.merchant_id);
                  const isAlert = prod.stock_quantity <= prod.low_stock_threshold;
                  return (
                    <div
                      key={`admin-low-${prod.product_id}`}
                      className={`rounded-xl border px-3 py-2 text-xs space-y-1 ${
                        prod.stock_quantity <= 0
                          ? 'border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/35'
                          : isAlert
                            ? 'border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30'
                            : 'border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/60'
                      }`}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {prod.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {m?.shop_name || `Merchant #${prod.merchant_id}`}
                      </p>
                      <p
                        className={`font-mono font-bold tabular-nums ${
                          prod.stock_quantity <= 0
                            ? 'text-red-700 dark:text-red-400'
                            : isAlert
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-teal-700 dark:text-teal-400'
                        }`}
                      >
                        {prod.stock_quantity} left (min {prod.low_stock_threshold})
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Medicine Inventory Across All Pharmacies */}
          <div className="space-y-3">
            <div className="medex-glass rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search medicine, dosage, category, or pharmacy..."
                  aria-label="Search live medicine catalog"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <select
                value={catalogMerchantFilter}
                onChange={(e) => setCatalogMerchantFilter(e.target.value)}
                aria-label="Filter catalog by pharmacy"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              >
                <option value="all">All Pharmacies</option>
                {state.merchants.map((m) => (
                  <option key={m.merchant_id} value={String(m.merchant_id)}>
                    {m.shop_name}
                  </option>
                ))}
              </select>
              <select
                value={catalogStatusFilter}
                onChange={(e) =>
                  setCatalogStatusFilter(
                    e.target.value as 'all' | 'listed' | 'hidden' | 'low_stock' | 'archived'
                  )
                }
                aria-label="Filter catalog by listing status"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              >
                <option value="all">Active Listings ({kpis.activeProductsCount})</option>
                <option value="listed">Listed ({kpis.medicines})</option>
                <option value="hidden">Hidden ({kpis.activeProductsCount - kpis.medicines})</option>
                <option value="low_stock">Low / Out Stock ({kpis.lowStock})</option>
                <option value="archived">Archived ({kpis.archivedCount})</option>
              </select>
            </div>

            {filteredCatalogProducts.length === 0 ? (
              <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                No medicines match your current catalog filters.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredCatalogProducts.map((prod) => {
                  const merchant = state.merchants.find((m) => m.merchant_id === prod.merchant_id);
                  const category = state.categories.find((c) => c.category_id === prod.category_id);
                  const avail = getAvailabilityStatus(
                    prod.stock_quantity,
                    prod.low_stock_threshold
                  );
                  const isBusy = adminMutatingProductId === prod.product_id;

                  return (
                    <div
                      key={prod.product_id}
                      className="medex-glass rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                          src={prod.image_path}
                          alt={prod.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {prod.name}
                            </span>
                            {prod.requires_prescription && (
                              <span className="font-semibold text-red-700 dark:text-red-400">
                                Rx
                              </span>
                            )}
                            <span className="text-slate-400">·</span>
                            <span
                              className={`font-semibold ${
                                prod.is_archived
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : !prod.is_listed
                                    ? 'text-slate-500 dark:text-slate-400'
                                    : avail === 'Available'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : avail === 'Low Stock'
                                        ? 'text-amber-700 dark:text-amber-300'
                                        : 'text-red-700 dark:text-red-400'
                              }`}
                            >
                              {prod.is_archived ? 'Archived' : prod.is_listed ? avail : 'Hidden'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 tabular-nums">
                            {merchant?.shop_name || `Merchant #${prod.merchant_id}`} ·{' '}
                            {category?.name || 'Catalog'} · {prod.unit} ·{' '}
                            <strong className="text-slate-900 dark:text-slate-100">
                              {formatPHP(prod.regular_price)}
                            </strong>{' '}
                            · Stock: {prod.stock_quantity} (Low ≤ {prod.low_stock_threshold})
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {prod.is_archived ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdminRestoreProduct(prod)}
                            aria-label={`Restore ${prod.name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60 whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Restoring...' : 'Restore'}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAdminToggleListed(prod)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              {prod.is_listed ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Hide</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>List</span>
                                </>
                              )}
                            </button>

                            {adminConfirmDeleteId === prod.product_id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleAdminArchiveProduct(prod)}
                                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 whitespace-nowrap"
                                >
                                  {isBusy ? 'Archiving...' : 'Confirm Archive'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminConfirmDeleteId(null)}
                                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setAdminConfirmDeleteId(prod.product_id)}
                                aria-label={`Archive ${prod.name}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-60 whitespace-nowrap"
                              >
                                <Archive className="w-3.5 h-3.5" />
                                <span>Archive</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: OLONGAPO ZONES (BARANGAY DIRECTORY) */}
      {subTab === 'zones' && (
        <div className="max-w-3xl">
          <div className="medex-glass rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Olongapo City Barangay Directory ({state.barangays.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-72 overflow-y-auto">
              {state.barangays.map((b) => (
                <div key={b.barangay_id} className="py-2 flex justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Brgy. {b.name}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {b.city}, {b.province} ({b.region})
                  </span>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const res = addBarangay(brgyName, brgyCity, brgyProv, brgyRegion);
                if (!res.ok) setFeedback({ type: 'error', text: res.error || 'Failed.' });
                else {
                  setBrgyName('');
                  setFeedback({ type: 'success', text: 'Barangay added to directory.' });
                }
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3.5 space-y-2.5"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Add Covered Barangay
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Barangay Name"
                  value={brgyName}
                  onChange={(e) => setBrgyName(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={brgyCity}
                  onChange={(e) => setBrgyCity(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Province"
                  value={brgyProv}
                  onChange={(e) => setBrgyProv(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Region (e.g., Region III)"
                  value={brgyRegion}
                  onChange={(e) => setBrgyRegion(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Add Barangay
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBTAB: ORDERS & FLAGS */}
      {subTab === 'orders' && (
        <div className="space-y-3">
          {state.orders.map((o) => {
            const merchant = state.merchants.find((m) => m.merchant_id === o.merchant_id);
            return (
              <div
                key={o.order_id}
                className="medex-glass rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {o.order_code}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold uppercase text-teal-700 dark:text-teal-400">
                      {o.status.replace(/_/g, ' ')}
                    </span>
                    {o.payment.is_flagged && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          COD MISMATCH (Due {formatPHP(o.total_amount)}, Collected{' '}
                          {formatPHP(o.payment.amount_collected || 0)})
                        </span>
                      </>
                    )}
                    {o.delivery?.is_flagged_for_admin && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          3 FAILED CONFIRMATION CODE ATTEMPTS
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {merchant?.shop_name} → {o.recipient_name} ({formatPHP(o.total_amount)})
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Payment: {o.payment.method} ({o.payment.status}) · Address:{' '}
                    {o.delivery_address_snapshot}
                  </p>
                </div>

                {o.prescription?.status === 'pending_review' && (
                  <button
                    type="button"
                    onClick={() => {
                      reviewPrescription(o.order_id, 'approved');
                      setFeedback({
                        type: 'success',
                        text: `Backup Admin Rx approval completed for ${o.order_code}.`,
                      });
                    }}
                    className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-700 shrink-0 whitespace-nowrap"
                  >
                    Backup Approve Rx
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUBTAB: FEEDBACK & RATINGS OVERSIGHT (MODULE 9 + RIDER RATINGS) */}
      {subTab === 'feedback' && (
        <div className="space-y-6">
          {/* 6 KPI Summary Cards (Module 9 Spec) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Avg Store Rating
              </p>
              <p className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1 inline-flex items-center gap-1 tabular-nums">
                <span>{feedbackSummary.avgStoreRating > 0 ? feedbackSummary.avgStoreRating.toFixed(1) : '—'}</span>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Reviews This Week
              </p>
              <p className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {feedbackSummary.reviewsThisWeek}
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Open Reports
              </p>
              <p className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {feedbackSummary.openReports}
              </p>
            </div>
            <div
              className={`medex-glass rounded-2xl border p-4 ${
                feedbackSummary.overdue48h > 0
                  ? 'border-red-300 dark:border-red-800 bg-red-50/70 dark:bg-red-950/35'
                  : ''
              }`}
            >
              <p className="text-[11px] font-medium text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reports &gt; 48h
              </p>
              <p className="font-display text-xl font-bold text-red-700 dark:text-red-400 mt-1 tabular-nums">
                {feedbackSummary.overdue48h}
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Locator Accuracy
              </p>
              <p className="font-display text-xl font-bold text-teal-700 dark:text-teal-400 mt-1 tabular-nums">
                {feedbackSummary.locatorAccuracyRate}%
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Avg Rider Rating
              </p>
              <p className="font-display text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 inline-flex items-center gap-1 tabular-nums">
                <span>{feedbackSummary.avgRiderRating.toFixed(1)}</span>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="medex-glass rounded-2xl border p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <select
              aria-label="Filter feedback view"
              value={feedbackTypeFilter}
              onChange={(e) =>
                setFeedbackTypeFilter(
                  e.target.value as 'all' | 'reviews' | 'reports' | 'riders'
                )
              }
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Feedback &amp; Ratings</option>
              <option value="reports">Problem Reports Only</option>
              <option value="reviews">Store Reviews Only</option>
              <option value="riders">Rider Ratings Oversight Only</option>
            </select>

            <select
              aria-label="Filter by pharmacy"
              value={feedbackMerchantFilter}
              onChange={(e) => setFeedbackMerchantFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Pharmacies</option>
              {state.merchants.map((m) => (
                <option key={m.merchant_id} value={String(m.merchant_id)}>
                  {m.shop_name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by report status"
              value={feedbackStatusFilter}
              onChange={(e) => setFeedbackStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Report Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="escalated">Escalated to CS</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <select
              aria-label="Filter by rating score"
              value={feedbackMinRating}
              onChange={(e) => setFeedbackMinRating(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Star Ratings</option>
              <option value="low">Low Ratings (1–2 ★)</option>
              <option value="3plus">3 ★ and Above</option>
              <option value="5">5 ★ Only</option>
            </select>
          </div>

          {/* 1. Problem Reports Monitoring */}
          {(feedbackTypeFilter === 'all' || feedbackTypeFilter === 'reports') && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-600 dark:text-red-400" />
                Problem Reports Monitoring
              </h2>

              {state.problemReports
                .filter((r) =>
                  feedbackMerchantFilter === 'all'
                    ? true
                    : String(r.merchant_id) === feedbackMerchantFilter
                )
                .filter((r) =>
                  feedbackStatusFilter === 'all' ? true : r.status === feedbackStatusFilter
                )
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((report) => {
                  const over48 = isReportOver48Hours(report);
                  const merchant = report.merchant_id
                    ? state.merchants.find((m) => m.merchant_id === report.merchant_id)
                    : null;
                  const product = report.product_id
                    ? state.products.find((p) => p.product_id === report.product_id)
                    : null;
                  const resident = state.users.find((u) => u.user_id === report.user_id);
                  const isTerminal =
                    report.status === 'resolved' || report.status === 'dismissed';
                  const expanded = Boolean(expandedReportIds[report.report_id]);

                  return (
                    <div
                      key={report.report_id}
                      className={`medex-glass rounded-2xl border p-5 space-y-3 ${
                        over48 ? 'border-red-300 dark:border-red-800/80' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {report.reference_code}
                          </span>
                          {over48 && (
                            <span className="rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                              OVER 48H
                            </span>
                          )}
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold uppercase text-slate-700 dark:text-slate-200">
                            {report.source}
                          </span>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            {report.category_label}
                          </span>
                        </div>
                        <span className="font-bold uppercase text-slate-700 dark:text-slate-200">
                          {report.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-1">
                        <span>
                          Customer Identity:{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {formatReviewerDisplayName(resident, report.is_anonymous)}
                          </strong>
                        </span>
                        {merchant && <span>Pharmacy: {merchant.shop_name}</span>}
                        {product && <span>Medicine: {product.name}</span>}
                        <span className="tabular-nums">
                          Opened {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 dark:text-slate-100">
                        {report.description}
                      </p>

                      {report.escalated_reason && (
                        <p className="text-xs text-purple-900 dark:text-purple-200 bg-purple-50/70 dark:bg-purple-950/35 rounded-lg p-2.5">
                          <strong>Escalated to CS:</strong> {report.escalated_reason}
                        </p>
                      )}

                      {report.cs_notes && (
                        <p className="text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 rounded-lg p-2.5">
                          <strong>CS Internal Notes:</strong> {report.cs_notes}
                        </p>
                      )}

                      {report.resolution_note && (
                        <p className="text-xs text-teal-800 dark:text-teal-300 bg-teal-50/70 dark:bg-teal-950/35 rounded-lg p-2.5">
                          <strong>Resolution Note:</strong> {report.resolution_note}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReportIds((prev) => ({
                              ...prev,
                              [report.report_id]: !expanded,
                            }))
                          }
                          className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          {expanded
                            ? 'Hide Status Timeline'
                            : `View Timeline (${report.status_history.length})`}
                        </button>
                      </div>

                      {expanded && (
                        <ol className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-3 space-y-1.5 text-xs">
                          {report.status_history.map((h) => (
                            <li key={h.history_id} className="text-slate-700 dark:text-slate-300">
                              <strong className="uppercase">{h.status}</strong> by {h.changed_by_name} (
                              {h.changed_by_role}) ·{' '}
                              <span className="tabular-nums">
                                {new Date(h.created_at).toLocaleString()}
                              </span>
                              {h.note ? ` — "${h.note}"` : ''}
                            </li>
                          ))}
                        </ol>
                      )}

                      {!isTerminal && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={reportNotes[report.report_id] || ''}
                              onChange={(e) =>
                                setReportNotes((prev) => ({
                                  ...prev,
                                  [report.report_id]: e.target.value,
                                }))
                              }
                              placeholder="Resolution / action note (required for Resolve/Dismiss)..."
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                            <input
                              type="text"
                              value={
                                reportAdminMemos[report.report_id] ??
                                report.admin_notes ??
                                ''
                              }
                              onChange={(e) =>
                                setReportAdminMemos((prev) => ({
                                  ...prev,
                                  [report.report_id]: e.target.value,
                                }))
                              }
                              placeholder="Internal admin investigation notes..."
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {(
                              [
                                report.status === 'open'
                                  ? (['acknowledged', 'Acknowledge'] as const)
                                  : null,
                                ['resolved', 'Resolve'] as const,
                                ['dismissed', 'Dismiss'] as const,
                              ].filter(Boolean) as Array<readonly [ProblemReportStatus, string]>
                            ).map(([targetStatus, label]) => (
                              <button
                                key={targetStatus}
                                type="button"
                                onClick={() => {
                                  const note =
                                    reportNotes[report.report_id]?.trim() ||
                                    (targetStatus === 'acknowledged'
                                      ? 'Acknowledged by Admin Operations'
                                      : '');
                                  const res = updateProblemReportStatus(
                                    report.report_id,
                                    targetStatus,
                                    note,
                                    reportAdminMemos[report.report_id]
                                  );
                                  if (!res.ok) {
                                    setFeedback({
                                      type: 'error',
                                      text: res.error || 'Could not update status.',
                                    });
                                  } else {
                                    setReportNotes((prev) => ({ ...prev, [report.report_id]: '' }));
                                    setFeedback({
                                      type: 'success',
                                      text: `${report.reference_code} marked ${targetStatus}.`,
                                    });
                                  }
                                }}
                                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                                  targetStatus === 'resolved'
                                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                                    : targetStatus === 'dismissed'
                                      ? 'border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100'
                                      : 'border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </section>
          )}

          {/* 2. Store Reviews Moderation */}
          {(feedbackTypeFilter === 'all' || feedbackTypeFilter === 'reviews') && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Store Reviews Moderation
              </h2>

              {state.pharmacyReviews
                .filter((r) =>
                  feedbackMerchantFilter === 'all'
                    ? true
                    : String(r.merchant_id) === feedbackMerchantFilter
                )
                .filter((r) => {
                  if (feedbackMinRating === 'low') return r.rating <= 2;
                  if (feedbackMinRating === '3plus') return r.rating >= 3;
                  if (feedbackMinRating === '5') return r.rating === 5;
                  return true;
                })
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((review) => {
                  const merchant = state.merchants.find((m) => m.merchant_id === review.merchant_id);
                  const resident = state.users.find((u) => u.user_id === review.resident_id);
                  const reasonVal = moderationReasons[review.review_id] || '';
                  const isHidden = review.status === 'hidden';
                  return (
                    <div
                      key={review.review_id}
                      className={`medex-glass rounded-2xl border p-5 space-y-3 ${
                        isHidden ? 'opacity-80 border-red-200 dark:border-red-900/60' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                            {merchant?.shop_name || 'Pharmacy'}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                            <EyeOff className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            {formatReviewerDisplayName(resident, review.is_anonymous)}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 font-bold uppercase ${
                              isHidden
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                : 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                            }`}
                          >
                            {review.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= review.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {review.comment && (
                        <p className="text-sm text-slate-800 dark:text-slate-100">
                          &ldquo;{review.comment}&rdquo;
                        </p>
                      )}

                      {review.moderation_reason && (
                        <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                          <strong>Moderation Log:</strong> {review.moderation_reason}
                        </p>
                      )}

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={reasonVal}
                          onChange={(e) =>
                            setModerationReasons((prev) => ({
                              ...prev,
                              [review.review_id]: e.target.value,
                            }))
                          }
                          placeholder={`Required moderation reason to ${
                            isHidden ? 'restore visibility' : 'hide review'
                          }...`}
                          aria-label={`Moderation reason for review ${review.review_id}`}
                          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextStatus = isHidden ? 'visible' : 'hidden';
                            const r = moderatePharmacyReview(review.review_id, nextStatus, reasonVal);
                            if (!r.ok) {
                              setFeedback({
                                type: 'error',
                                text: r.error || 'Please enter a moderation reason.',
                              });
                            } else {
                              setModerationReasons((prev) => ({ ...prev, [review.review_id]: '' }));
                              setFeedback({
                                type: 'success',
                                text: `Review #${review.review_id} marked ${nextStatus} and pharmacy average updated.`,
                              });
                            }
                          }}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                            isHidden
                              ? 'bg-teal-600 text-white hover:bg-teal-700'
                              : 'border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100'
                          }`}
                        >
                          {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {isHidden ? 'Unhide Review' : 'Hide Review'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </section>
          )}

          {/* 3. Rider Ratings Oversight */}
          {(feedbackTypeFilter === 'all' || feedbackTypeFilter === 'riders') && (
            <section className="space-y-4">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Rider Ratings Oversight
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {state.riderProfiles.map((rp) => {
                  const riderUser = state.users.find((u) => u.user_id === rp.user_id);
                  const stats = computeRiderRatingStats(state.riderRatings, rp.user_id);
                  return (
                    <div
                      key={rp.rider_id}
                      className="medex-glass rounded-2xl border p-4 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          {riderUser ? `${riderUser.first_name} ${riderUser.last_name}` : `Rider #${rp.rider_id}`}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {rp.vehicle_type} · {rp.plate_number} · {rp.total_deliveries} trips
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-lg font-bold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 tabular-nums">
                          <span>{(stats.count > 0 ? stats.average : rp.rating).toFixed(1)}</span>
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {stats.count} rating{stats.count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2.5">
                {state.riderRatings
                  .filter((r) => {
                    if (feedbackMinRating === 'low') return r.stars <= 2;
                    if (feedbackMinRating === '3plus') return r.stars >= 3;
                    if (feedbackMinRating === '5') return r.stars === 5;
                    return true;
                  })
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((rating) => {
                    const riderUser = state.users.find((u) => u.user_id === rating.rider_id);
                    const resident = state.users.find((u) => u.user_id === rating.resident_id);
                    const order = state.orders.find((o) => o.order_id === rating.order_id);
                    return (
                      <div
                        key={rating.rating_id}
                        className="medex-glass rounded-2xl border p-4 space-y-1.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {riderUser
                                ? `${riderUser.first_name} ${riderUser.last_name}`
                                : `Rider #${rating.rider_id}`}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-300">
                              From {formatReviewerDisplayName(resident, rating.is_anonymous)}
                            </span>
                            {order && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  {order.order_code}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= rating.stars
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300 dark:text-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        {rating.tags.length > 0 && (
                          <p className="text-slate-600 dark:text-slate-300">
                            Tags: {rating.tags.join(' · ')}
                          </p>
                        )}
                        {rating.comment && (
                          <p className="text-sm text-slate-800 dark:text-slate-100">
                            &ldquo;{rating.comment}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* SUBTAB: REPORTS & AUDIT LOGS */}
      {subTab === 'reports' && (
        <div className="space-y-6">
          <div className="medex-glass rounded-2xl border p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Date-Range Operational Report
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="date"
                  value={reportFrom}
                  aria-label="Report start date"
                  onChange={(e) => setReportFrom(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5"
                />
                <span>to</span>
                <input
                  type="date"
                  value={reportTo}
                  aria-label="Report end date"
                  onChange={(e) => setReportTo(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3">
                <p className="font-medium text-slate-700 dark:text-slate-300">Orders in Range</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {reportOrders.length}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3">
                <p className="font-medium text-slate-700 dark:text-slate-300">Sales Volume</p>
                <p className="text-lg font-bold text-teal-700 dark:text-teal-400 tabular-nums mt-0.5">
                  {formatPHP(
                    reportOrders
                      .filter((o) => o.status !== 'cancelled')
                      .reduce((s, o) => s + o.total_amount, 0)
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3">
                <p className="font-medium text-slate-700 dark:text-slate-300">Completed Deliveries</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {reportOrders.filter((o) => o.status === 'delivered').length}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3">
                <p className="font-medium text-slate-700 dark:text-slate-300">Open Problem Reports</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {kpis.openProblemReports}
                </p>
              </div>
            </div>
          </div>

          <div className="medex-glass rounded-2xl border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Append-Only Audit Logs ({state.auditLogs.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto">
              {state.auditLogs.map((log) => (
                <div key={log.log_id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {log.action}
                    </span>
                    <span className="text-slate-400"> · </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {log.actor_name} ({log.entity} #{log.entity_id})
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{log.before_after}</p>
                  </div>
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB: INTERNAL ROLES & ACCESS */}
      {subTab === 'internal_roles' && (
        <div className="space-y-6">
          {/* Create Internal Department Account */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (creatingStaff) return;
              setCreatingStaff(true);
              try {
                const res = await createInternalStaffAccount({
                  role: newStaffRole,
                  first_name: newStaffFirstName,
                  last_name: newStaffLastName,
                  email: newStaffEmail,
                  phone_number: newStaffPhone,
                  date_of_birth: newStaffDob,
                  password: newStaffPassword,
                  department_label: newStaffDeptLabel || undefined,
                });
                if (!res.ok) {
                  setFeedback({
                    type: 'error',
                    text: res.error || 'Could not create internal staff account.',
                  });
                } else {
                  setFeedback({
                    type: 'success',
                    text: `Provisioned ${ROLE_DISPLAY_NAMES[newStaffRole]} account for ${newStaffFirstName} ${newStaffLastName} (${newStaffEmail}).`,
                  });
                  setNewStaffFirstName('');
                  setNewStaffLastName('');
                  setNewStaffEmail('');
                  setNewStaffDeptLabel('');
                }
              } finally {
                setCreatingStaff(false);
              }
            }}
            className="medex-glass rounded-2xl border p-5 space-y-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Provision Internal Department Staff Account (Admin Only)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Public Sign Up is strictly limited to Customer, Store/Merchant, and Delivery Rider. Only Global Admin can create internal administrative roles.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label
                  htmlFor="staff-role"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Department Role *
                </label>
                <select
                  id="staff-role"
                  value={newStaffRole}
                  onChange={(e) =>
                    setNewStaffRole(
                      e.target.value as
                        | 'delivery_manager'
                        | 'coupon_handler'
                        | 'inventory_manager'
                        | 'customer_service'
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  {INTERNAL_DEPARTMENT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_DISPLAY_NAMES[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="staff-fn"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  First Name *
                </label>
                <input
                  id="staff-fn"
                  type="text"
                  required
                  value={newStaffFirstName}
                  onChange={(e) => setNewStaffFirstName(e.target.value)}
                  placeholder="e.g., Marco"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-ln"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Last Name *
                </label>
                <input
                  id="staff-ln"
                  type="text"
                  required
                  value={newStaffLastName}
                  onChange={(e) => setNewStaffLastName(e.target.value)}
                  placeholder="e.g., Santos"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-dept"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Department Unit (Optional)
                </label>
                <input
                  id="staff-dept"
                  type="text"
                  value={newStaffDeptLabel}
                  onChange={(e) => setNewStaffDeptLabel(e.target.value)}
                  placeholder="e.g., Subic Bay Dispatch Desk"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-email"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Official Email (@medex.ph) *
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="staff.name@medex.ph"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-phone"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Mobile Number (+63) *
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  required
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="+639171234567"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-dob"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Date of Birth *
                </label>
                <input
                  id="staff-dob"
                  type="date"
                  required
                  value={newStaffDob}
                  onChange={(e) => setNewStaffDob(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-pass"
                  className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Temporary Password *
                </label>
                <input
                  id="staff-pass"
                  type="password"
                  required
                  minLength={8}
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creatingStaff}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {creatingStaff ? 'Creating Staff Account...' : 'Create Internal Staff Account'}
              </button>
            </div>
          </form>

          {/* Internal Staff Directory */}
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Internal Administrative Staff &amp; Permission Overrides
            </h2>
            {state.users
              .filter((u) => (INTERNAL_ADMIN_ROLES as readonly string[]).includes(u.role))
              .map((staff) => {
                const effectiveSet = getEffectivePermissions(staff.role, staff.permission_overrides);
                const grantCount = staff.permission_overrides?.grant?.length || 0;
                const revokeCount = staff.permission_overrides?.revoke?.length || 0;
                return (
                  <div
                    key={staff.user_id}
                    className="medex-glass rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          {staff.first_name} {staff.last_name}
                        </span>
                        <span className="rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 font-semibold text-teal-800 dark:text-teal-300">
                          {ROLE_DISPLAY_NAMES[staff.role]}
                        </span>
                        {staff.department_label && (
                          <span className="text-slate-600 dark:text-slate-300">
                            · {staff.department_label}
                          </span>
                        )}
                        <span
                          className={`uppercase font-bold ${
                            staff.status === 'approved'
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          · {staff.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        {staff.email} · {staff.phone_number} · {effectiveSet.size} active permission(s)
                        {(grantCount > 0 || revokeCount > 0) &&
                          ` (${grantCount} granted, ${revokeCount} revoked overrides)`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {staff.role !== 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPermsUserId(staff.user_id);
                              setPermGrantsDraft(staff.permission_overrides?.grant || []);
                              setPermRevokesDraft(staff.permission_overrides?.revoke || []);
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            Edit Permissions
                          </button>
                          {staff.status === 'approved' ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateAccountStatus(
                                  staff.user_id,
                                  'suspended',
                                  'Suspended by Global Admin'
                                )
                              }
                              className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateAccountStatus(staff.user_id, 'approved')}
                              className="rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/50 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300"
                            >
                              Reactivate
                            </button>
                          )}
                        </>
                      )}
                      {staff.role === 'admin' && (
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Full Global Root Access
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Role Hierarchy & Permission Matrix */}
          <div className="medex-glass rounded-2xl border p-5 space-y-3 overflow-x-auto">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Role Hierarchy &amp; Department Permission Matrix
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Global Admin retains full system control above the four specialized internal departments.
              </p>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Permission</th>
                  <th className="py-2 px-2 font-semibold">Module</th>
                  {INTERNAL_ADMIN_ROLES.map((r) => (
                    <th key={r} className="py-2 px-2 font-semibold text-center whitespace-nowrap">
                      {ROLE_DISPLAY_NAMES[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {PERMISSION_CATALOG.map((item) => (
                  <tr key={item.code}>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {item.label}
                    </td>
                    <td className="py-2 px-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {item.module}
                    </td>
                    {INTERNAL_ADMIN_ROLES.map((r) => {
                      const has = getEffectivePermissions(r).has(item.code);
                      return (
                        <td key={r} className="py-2 px-2 text-center">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              has
                                ? 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          >
                            {has ? 'YES' : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Staff Permissions Modal */}
      {editingPermsUserId !== null &&
        (() => {
          const targetUser = state.users.find((u) => u.user_id === editingPermsUserId);
          if (!targetUser) return null;
          const baseSet = getEffectivePermissions(targetUser.role, null);

          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-perms-title"
              className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3
                      id="edit-perms-title"
                      className="font-display text-base font-bold text-slate-900 dark:text-white"
                    >
                      Permission Overrides · {targetUser.first_name} {targetUser.last_name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Base Role: {ROLE_DISPLAY_NAMES[targetUser.role]} ({targetUser.email})
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close permissions modal"
                    onClick={() => setEditingPermsUserId(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {PERMISSION_CATALOG.map((item) => {
                    const isBase = baseSet.has(item.code);
                    const isGranted = permGrantsDraft.includes(item.code);
                    const isRevoked = permRevokesDraft.includes(item.code);
                    const effective = (isBase && !isRevoked) || isGranted;

                    return (
                      <div
                        key={item.code}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {item.label}{' '}
                            <span className="font-normal text-slate-500 dark:text-slate-400">
                              ({item.module})
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            {item.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              effective
                                ? 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {effective ? 'Allowed' : 'Denied'}
                          </span>
                          {!isBase && (
                            <button
                              type="button"
                              onClick={() =>
                                setPermGrantsDraft((prev) =>
                                  prev.includes(item.code)
                                    ? prev.filter((x) => x !== item.code)
                                    : [...prev, item.code]
                                )
                              }
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                                isGranted
                                  ? 'border-teal-600 bg-teal-600 text-white'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {isGranted ? 'Granted' : '+ Grant'}
                            </button>
                          )}
                          {isBase && (
                            <button
                              type="button"
                              onClick={() =>
                                setPermRevokesDraft((prev) =>
                                  prev.includes(item.code)
                                    ? prev.filter((x) => x !== item.code)
                                    : [...prev, item.code]
                                )
                              }
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                                isRevoked
                                  ? 'border-red-600 bg-red-600 text-white'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {isRevoked ? 'Revoked' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingPermsUserId(null)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingPerms}
                    onClick={async () => {
                      setSavingPerms(true);
                      try {
                        const res = await updateUserPermissions(targetUser.user_id, {
                          grant: permGrantsDraft,
                          revoke: permRevokesDraft,
                        });
                        if (!res.ok) {
                          setFeedback({
                            type: 'error',
                            text: res.error || 'Could not update permission overrides.',
                          });
                        } else {
                          setEditingPermsUserId(null);
                          setFeedback({
                            type: 'success',
                            text: `Saved RBAC permission overrides for ${targetUser.first_name} ${targetUser.last_name}.`,
                          });
                        }
                      } finally {
                        setSavingPerms(false);
                      }
                    }}
                    className="rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {savingPerms ? 'Saving...' : 'Save Permission Overrides'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Partner Verification Document Inspection Modal */}
      {docPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-doc-preview-title"
        >
          <div className="w-full max-w-2xl rounded-3xl medex-glass border overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  {docPreviewModal.subjectRoleLabel || 'Merchant Verification Document'} ·{' '}
                  {docPreviewModal.shopName}
                </p>
                <h3
                  id="admin-doc-preview-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-white"
                >
                  {docPreviewModal.docLabel} — {docPreviewModal.fileName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDocPreviewModal(null)}
                aria-label="Close document preview"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col items-center justify-center gap-3">
              {docPreviewLoading ? (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Loading verification document...
                </p>
              ) : docPreviewError ? (
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  {docPreviewError}
                </p>
              ) : !isSafeImageOrDocUrl(resolvedPreviewUrl || docPreviewModal.url) ? (
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  Blocked unsafe or unsupported document URL.
                </p>
              ) : docPreviewModal.fileName.toLowerCase().endsWith('.pdf') ||
                docPreviewModal.url.startsWith('data:application/pdf') ? (
                <div className="w-full space-y-3 text-center">
                  <FileText className="w-10 h-10 mx-auto text-teal-600 dark:text-teal-400" />
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    PDF Verification Document: <strong>{docPreviewModal.fileName}</strong>
                  </p>
                  <a
                    href={resolvedPreviewUrl || docPreviewModal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open PDF Document</span>
                  </a>
                </div>
              ) : (
                <img
                  src={resolvedPreviewUrl || docPreviewModal.url}
                  alt={`${docPreviewModal.shopName} ${docPreviewModal.docLabel}`}
                  className="max-h-[65vh] w-auto object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
                />
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200/70 dark:border-slate-700/70 flex justify-end">
              <button
                type="button"
                onClick={() => setDocPreviewModal(null)}
                className="rounded-xl bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500"
              >
                Done Inspecting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

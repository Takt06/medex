import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  Flag,
  ImagePlus,
  Link2,
  MessageSquare,
  Package,
  Plus,
  Reply,
  RotateCcw,
  ShieldAlert,
  Star,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { MerchantSection } from '../layout/RoleDashboards';
import {
  PRESCRIPTION_REJECTION_REASONS,
  type Product,
} from '../../types/medex';
import {
  computePharmacyRatingSummary,
  formatMerchantStatusLabel,
  formatPHP,
  formatReviewerDisplayName,
  getAvailabilityStatus,
  getBarangayCenterCoords,
  getLowestStockProducts,
  getMerchantOpenStatus,
  isSafeImageOrDocUrl,
  validateRegularPrice,
} from '../../utils/medexRules';
import { readAndOptimizeMedicineImage } from '../../utils/imageUpload';
import {
  CATEGORY_FIRST_AID_IMAGE,
  CATEGORY_HYGIENE_IMAGE,
  CATEGORY_MEDICINES_IMAGE,
  HERO_PHARMACY_IMAGE,
} from '../../data/seedData';
import { LocationPinPicker } from '../common/LocationPinPicker';

const PRODUCT_IMAGE_PRESETS = [
  { label: 'Medicines', path: CATEGORY_MEDICINES_IMAGE },
  { label: 'First Aid', path: CATEGORY_FIRST_AID_IMAGE },
  { label: 'Hygiene', path: CATEGORY_HYGIENE_IMAGE },
  { label: 'Pharmacy', path: HERO_PHARMACY_IMAGE },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface MerchantPortalViewProps {
  activeSection?: MerchantSection;
  onChangeSection?: (section: MerchantSection) => void;
}

export const MerchantPortalView: React.FC<MerchantPortalViewProps> = ({
  activeSection,
  onChangeSection,
}) => {
  const {
    state,
    currentUser,
    saveProduct,
    deleteProduct,
    restoreProduct,
    toggleMerchantTempClosed,
    toggleMerchant24Hours,
    updateMerchantHours,
    reviewPrescription,
    advanceMerchantOrderStatus,
    returnNotHomeOrderToPharmacy,
    merchantInventoryFocusProductId,
    setMerchantInventoryFocusProductId,
    replyToPharmacyReview,
    updateProblemReportStatus,
    respondReturnAsMerchant,
    completeMerchantProfile,
    setActiveTab,
  } = useMedEx();

  const [internalSubTab, setInternalSubTab] = useState<MerchantSection>('orders');
  const subTab = activeSection ?? internalSubTab;
  const setSubTab = (next: MerchantSection) => {
    setInternalSubTab(next);
    onChangeSection?.(next);
  };
  const [rxFilter, setRxFilter] = useState<'pending_review' | 'approved' | 'rejected'>('pending_review');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Feedback Inbox local state
  const [feedbackInboxTab, setFeedbackInboxTab] = useState<'reviews' | 'reports' | 'returns'>('reviews');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [reportActionNotes, setReportActionNotes] = useState<Record<number, string>>({});
  const [returnReplyNotes, setReturnReplyNotes] = useState<Record<number, string>>({});

  // Full-size Rx preview modal
  const [previewImage, setPreviewImage] = useState<{
    title: string;
    url: string;
    fileType?: 'jpg' | 'png' | 'pdf';
  } | null>(null);

  // Reject Rx modal
  const [rejectingOrderId, setRejectingOrderId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(PRESCRIPTION_REJECTION_REASONS[0]);
  const [rejectRemarks, setRejectRemarks] = useState('');

  // Product editor modal
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSaving, setProductSaving] = useState(false);
  const [inventoryView, setInventoryView] = useState<'active' | 'archived'>('active');
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<number | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [restoringProductId, setRestoringProductId] = useState<number | null>(null);
  const [uploadedPhotoName, setUploadedPhotoName] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<
    Array<{ day_of_week: number; opens_at: string; closes_at: string; is_closed: boolean }>
  >([]);
  const [hoursDirty, setHoursDirty] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);

  // Store profile onboarding/linking state when approved merchant has no linked store record yet
  const defaultBrgyId = state.barangays[0]?.barangay_id || 1;
  const defaultCenter = getBarangayCenterCoords(defaultBrgyId, state.barangays);
  const [setupShopName, setSetupShopName] = useState(
    `${currentUser.first_name} ${currentUser.last_name} Pharmacy`
  );
  const [setupPharmacistName, setSetupPharmacistName] = useState(
    `${currentUser.first_name} ${currentUser.last_name}`
  );
  const [setupLicenseNo, setSetupLicenseNo] = useState('');
  const [setupContactNo, setSetupContactNo] = useState(currentUser.phone_number || '+63');
  const [setupBrgyId, setSetupBrgyId] = useState(defaultBrgyId);
  const [setupStreet, setSetupStreet] = useState('');
  const [setupLandmark, setSetupLandmark] = useState('');
  const [setupLat, setSetupLat] = useState(defaultCenter.lat);
  const [setupLng, setSetupLng] = useState(defaultCenter.lng);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const merchant = useMemo(
    () => state.merchants.find((m) => m.user_id === currentUser.user_id),
    [state.merchants, currentUser.user_id]
  );

  const merchantHours = useMemo(
    () =>
      merchant
        ? state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id)
        : [],
    [state.merchantHours, merchant]
  );

  const openStatus = useMemo(
    () => (merchant ? getMerchantOpenStatus(merchant, merchantHours) : null),
    [merchant, merchantHours]
  );

  useEffect(() => {
    if (!merchant || hoursDirty) return;
    setHoursDraft(
      DAY_NAMES.map((_, idx) => {
        const existing = merchantHours.find((h) => h.day_of_week === idx);
        return {
          day_of_week: idx,
          opens_at: existing?.opens_at || '08:00',
          closes_at: existing?.closes_at || '20:00',
          is_closed: existing?.is_closed ?? false,
        };
      })
    );
  }, [merchant, merchantHours, hoursDirty]);

  const merchantProducts = useMemo(
    () =>
      merchant
        ? state.products.filter((p) => p.merchant_id === merchant.merchant_id)
        : [],
    [state.products, merchant]
  );

  const activeMerchantProducts = useMemo(
    () => merchantProducts.filter((p) => !p.is_archived),
    [merchantProducts]
  );

  const archivedMerchantProducts = useMemo(
    () => merchantProducts.filter((p) => Boolean(p.is_archived)),
    [merchantProducts]
  );

  const lowestStockProducts = useMemo(
    () => getLowestStockProducts(activeMerchantProducts, 10),
    [activeMerchantProducts]
  );

  const displayedMerchantProducts =
    inventoryView === 'archived' ? archivedMerchantProducts : activeMerchantProducts;

  const merchantOrders = useMemo(
    () =>
      merchant
        ? state.orders
            .filter((o) => o.merchant_id === merchant.merchant_id)
            .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())
        : [],
    [state.orders, merchant]
  );

  const rxOrders = useMemo(
    () => merchantOrders.filter((o) => o.prescription && o.prescription.status === rxFilter),
    [merchantOrders, rxFilter]
  );

  const merchantReviews = useMemo(
    () =>
      merchant
        ? state.pharmacyReviews
            .filter((r) => r.merchant_id === merchant.merchant_id && r.status === 'visible')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [state.pharmacyReviews, merchant]
  );

  const merchantReports = useMemo(
    () =>
      merchant
        ? state.problemReports
            .filter((r) => r.merchant_id === merchant.merchant_id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [state.problemReports, merchant]
  );

  const ratingSummary = useMemo(
    () =>
      merchant
        ? computePharmacyRatingSummary(state.pharmacyReviews, merchant.merchant_id)
        : { average: 0, count: 0 },
    [state.pharmacyReviews, merchant]
  );

  const merchantReturns = useMemo(
    () =>
      merchant
        ? state.returnRequests
            .filter((r) => r.merchant_id === merchant.merchant_id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [state.returnRequests, merchant]
  );

  const openReportsCount = merchantReports.filter(
    (r) => r.status === 'open' || r.status === 'acknowledged'
  ).length;
  const pendingReturnsCount = merchantReturns.filter((r) => r.status === 'requested').length;
  const storeGrossRevenue = useMemo(
    () =>
      merchantOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.subtotal - (o.discount_amount || 0), 0),
    [merchantOrders]
  );
  const completedDeliveriesCount = merchantOrders.filter((o) => o.status === 'delivered').length;

  // Account Approval Gate
  if (currentUser.status !== 'approved') {
    const pendingAddr = merchant
      ? state.addresses.find((a) => a.address_id === merchant.shop_address_id)
      : null;
    const pendingBrgy = pendingAddr
      ? state.barangays.find((b) => b.barangay_id === pendingAddr.barangay_id)
      : null;
    const merchantStatusLabel = formatMerchantStatusLabel(currentUser.status);
    return (
      <div className="max-w-xl mx-auto medex-glass rounded-2xl border p-8 text-center space-y-4 mt-6">
        <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Pharmacy Verification Status: {merchantStatusLabel}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {currentUser.status === 'pending'
            ? 'Your pharmacy registration, Business Permit, Government-Issued ID, and PRC credentials are awaiting Admin review before you can list medicines or fulfill orders.'
            : `Access restricted (${merchantStatusLabel})${currentUser.status_reason ? `: ${currentUser.status_reason}` : '.'}`}
        </p>
        {merchant && (
          <div className="rounded-xl medex-glass-subtle border p-4 text-left text-xs space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-white">{merchant.shop_name}</p>
            {pendingAddr && (
              <>
                <p className="text-slate-600 dark:text-slate-300">
                  {pendingAddr.street}
                  {pendingBrgy ? `, Brgy. ${pendingBrgy.name}, ${pendingBrgy.city}` : ''}
                </p>
                {pendingAddr.landmark && (
                  <p className="text-slate-500 dark:text-slate-400">Landmark: {pendingAddr.landmark}</p>
                )}
                <p className="font-mono text-[11px] text-teal-700 dark:text-teal-400 tabular-nums">
                  Map Pin: {pendingAddr.latitude.toFixed(5)}, {pendingAddr.longitude.toFixed(5)} ·{' '}
                  {merchant.pharmacist_license_no}
                </p>
              </>
            )}
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                <FileCheck2 className="w-3 h-3" />
                Business Permit: {merchant.business_permit_name || 'Pending Upload'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                <FileCheck2 className="w-3 h-3" />
                Government ID: {merchant.government_id_name || 'Pending Upload'}
              </span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Review Store Address &amp; Map Pin
        </button>
      </div>
    );
  }

  if (!merchant || !openStatus) {
    const handleCompleteStoreSetup = async (e: React.FormEvent) => {
      e.preventDefault();
      if (setupSaving) return;
      setSetupError(null);
      setSetupSaving(true);
      try {
        const res = await completeMerchantProfile({
          shop_name: setupShopName,
          pharmacist_name: setupPharmacistName,
          pharmacist_license_no: setupLicenseNo,
          contact_no: setupContactNo,
          barangay_id: setupBrgyId,
          street: setupStreet,
          landmark: setupLandmark || undefined,
          latitude: setupLat,
          longitude: setupLng,
        });
        if (!res.ok) {
          setSetupError(res.error || 'Could not link pharmacy store profile.');
          return;
        }
        setFeedback({
          type: 'success',
          text: 'Pharmacy store profile linked and Olongapo City hours initialized.',
        });
      } finally {
        setSetupSaving(false);
      }
    };

    return (
      <div className="max-w-3xl mx-auto medex-glass rounded-3xl border p-6 sm:p-8 space-y-5 mt-2">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-600/15 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Account Approved · Final Store Setup
            </p>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Complete &amp; Link Your Pharmacy Store Profile
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Your merchant account is approved. Enter your pharmacy store details and pin your
              Olongapo storefront location to unlock Inventory, Orders, and Rx Verification.
            </p>
          </div>
        </div>

        {setupError && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-900 dark:text-red-200">
            {setupError}
          </div>
        )}

        <form onSubmit={handleCompleteStoreSetup} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="setup-shop-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Pharmacy / Store Name *
              </label>
              <input
                id="setup-shop-name"
                type="text"
                required
                value={setupShopName}
                onChange={(e) => setSetupShopName(e.target.value)}
                placeholder="e.g., Olongapo Care Pharmacy"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="setup-contact-no"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Store Contact Number (+63) *
              </label>
              <input
                id="setup-contact-no"
                type="tel"
                required
                value={setupContactNo}
                onChange={(e) => setSetupContactNo(e.target.value)}
                placeholder="+639171234567"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="setup-pharmacist-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Licensed Pharmacist Name *
              </label>
              <input
                id="setup-pharmacist-name"
                type="text"
                required
                placeholder="Letters only (e.g., Maria Santos)"
                value={setupPharmacistName}
                onChange={(e) => setSetupPharmacistName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="setup-license-no"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                PRC Pharmacist License No. (7 digits) *
              </label>
              <input
                id="setup-license-no"
                type="text"
                required
                value={setupLicenseNo}
                onChange={(e) => setSetupLicenseNo(e.target.value)}
                placeholder="e.g., 0084512 or PRC-0084512"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="setup-brgy"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Olongapo Barangay *
              </label>
              <select
                id="setup-brgy"
                value={setupBrgyId}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  setSetupBrgyId(nextId);
                  const center = getBarangayCenterCoords(nextId, state.barangays);
                  setSetupLat(center.lat);
                  setSetupLng(center.lng);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                {state.barangays.map((b) => (
                  <option key={b.barangay_id} value={b.barangay_id}>
                    Brgy. {b.name}, {b.city}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="setup-landmark"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Nearby Landmark
              </label>
              <input
                id="setup-landmark"
                type="text"
                value={setupLandmark}
                onChange={(e) => setSetupLandmark(e.target.value)}
                placeholder="Across Barangay Hall / Rizal Ave."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="setup-street"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Street / Building Address *
            </label>
            <input
              id="setup-street"
              type="text"
              required
              value={setupStreet}
              onChange={(e) => setSetupStreet(e.target.value)}
              placeholder="e.g., #42 Rizal Avenue, West Bajac-Bajac"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <LocationPinPicker
            latitude={setupLat}
            longitude={setupLng}
            barangayName={state.barangays.find((b) => b.barangay_id === setupBrgyId)?.name}
            onChangeCoords={(lat, lng) => {
              setSetupLat(lat);
              setSetupLng(lng);
            }}
            onResetToBarangayCenter={() => {
              const center = getBarangayCenterCoords(setupBrgyId, state.barangays);
              setSetupLat(center.lat);
              setSetupLng(center.lng);
            }}
            heightClass="h-52"
            title="Pin Storefront on Olongapo Map"
            helperText="Click the map to place your pharmacy marker accurately for residents and riders."
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={setupSaving}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {setupSaving ? 'Linking Store Profile...' : 'Save & Link Store Profile'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const openProductEditor = (prod?: Product) => {
    setPhotoUploadError(null);
    setUploadedPhotoName(null);
    if (prod) {
      setEditingProduct({ ...prod });
    } else {
      setEditingProduct({
        category_id: state.categories[0]?.category_id || 1,
        name: '',
        dosage_strength: '',
        description: '',
        image_path: PRODUCT_IMAGE_PRESETS[0]?.path || '',
        unit: '10 tablets',
        purchase_limit: 2,
        is_listed: true,
        requires_prescription: false,
        regular_price: 100,
        stock_quantity: 50,
        low_stock_threshold: 10,
      });
    }
  };

  const handleMedicinePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoUploadError(null);
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    const res = await readAndOptimizeMedicineImage(file);
    if (!res.ok) {
      setPhotoUploadError(res.error);
      return;
    }
    setUploadedPhotoName(res.fileName);
    setEditingProduct((prev) => (prev ? { ...prev, image_path: res.dataUrl } : prev));
    e.target.value = '';
  };

  const editPricingValidation = editingProduct
    ? validateRegularPrice(Number(editingProduct.regular_price || 0))
    : { valid: true, error: null };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || productSaving) return;
    const rawImg = String(editingProduct.image_path || PRODUCT_IMAGE_PRESETS[0]?.path || '').trim();
    if (rawImg && !isSafeImageOrDocUrl(rawImg)) {
      setFeedback({
        type: 'error',
        text: 'Please upload a JPG/PNG/WEBP image or provide a valid HTTPS/preset image URL.',
      });
      return;
    }
    setProductSaving(true);
    try {
      const res = await saveProduct({
        product_id: editingProduct.product_id,
        category_id: Number(editingProduct.category_id || 1),
        name: String(editingProduct.name || '').trim(),
        dosage_strength: editingProduct.dosage_strength?.trim() || undefined,
        description: String(editingProduct.description || '').trim(),
        image_path: rawImg,
        unit: String(editingProduct.unit || 'unit').trim(),
        purchase_limit: Number(editingProduct.purchase_limit || 1),
        is_listed: editingProduct.is_listed ?? true,
        requires_prescription: editingProduct.requires_prescription ?? false,
        regular_price: Number(editingProduct.regular_price || 0),
        stock_quantity: Number(editingProduct.stock_quantity || 0),
        low_stock_threshold: Number(editingProduct.low_stock_threshold || 10),
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not save product.' });
        return;
      }
      setEditingProduct(null);
      setFeedback({
        type: 'success',
        text: editingProduct.product_id
          ? 'Medicine updated and synced live to the storefront.'
          : 'New medicine added and published live to the storefront.',
      });
    } finally {
      setProductSaving(false);
    }
  };

  const handleArchiveProduct = async (prod: Product) => {
    if (deletingProductId !== null) return;
    setDeletingProductId(prod.product_id);
    try {
      const res = await deleteProduct(prod.product_id);
      setConfirmDeleteProductId(null);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not archive medicine.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `${prod.name} archived and hidden from the live storefront. Historical order records are preserved.`,
      });
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleRestoreProduct = async (prod: Product) => {
    if (restoringProductId !== null) return;
    setRestoringProductId(prod.product_id);
    try {
      const res = await restoreProduct(prod.product_id);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not restore archived medicine.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `${prod.name} restored to active inventory and synced live to the storefront.`,
      });
    } finally {
      setRestoringProductId(null);
    }
  };

  const handleToggleProductListed = async (prod: Product) => {
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
        ? `${prod.name} is now visible on the storefront.`
        : `${prod.name} hidden from the storefront.`,
    });
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingOrderId) return;
    const res = reviewPrescription(rejectingOrderId, 'rejected', rejectReason, rejectRemarks);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Please provide rejection details.' });
      return;
    }
    setRejectingOrderId(null);
    setRejectRemarks('');
    setFeedback({ type: 'success', text: 'Prescription rejected and resident notified.' });
  };

  const pendingRxCount = merchantOrders.filter(
    (o) => o.prescription?.status === 'pending_review'
  ).length;
  const activeOrdersCount = merchantOrders.filter((o) =>
    ['placed', 'preparing', 'ready_for_pickup'].includes(o.status)
  ).length;

  const lowStockCount = merchantProducts.filter(
    (p) => p.stock_quantity <= p.low_stock_threshold
  ).length;
  const merchantAddr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
  const merchantBrgy = state.barangays.find((b) => b.barangay_id === merchantAddr?.barangay_id);

  return (
    <div className="space-y-6">
      {/* Welcome Merchant Hero & Store Controls */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="medex-glass rounded-3xl border bg-gradient-to-br from-emerald-500/18 via-white/25 to-teal-500/16 dark:from-emerald-500/20 dark:via-slate-900/45 dark:to-teal-500/16 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 w-60 h-60 rounded-full bg-emerald-400/15 dark:bg-emerald-400/15 blur-2xl"
        />
        <div className="relative flex items-start gap-3.5">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white items-center justify-center shadow-md shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span>WELCOME BACK, {merchant.pharmacist_name.toUpperCase()}</span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span>OLONGAPO MERCHANT</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
              {merchant.shop_name}
            </h1>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
              {merchantAddr?.street}
              {merchantBrgy ? `, Brgy. ${merchantBrgy.name}` : ''} · License{' '}
              <span className="font-mono">{merchant.pharmacist_license_no}</span> ·{' '}
              <span
                className={
                  openStatus.isOpen
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-red-700 dark:text-red-400 font-semibold'
                }
              >
                {openStatus.label}
              </span>
            </p>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-3 text-xs shrink-0">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-xl medex-glass-subtle border px-3.5 py-2 hover:bg-white/90 dark:hover:bg-slate-800 transition-colors">
            <input
              type="checkbox"
              checked={merchant.is_24_hours}
              onChange={async (e) => {
                const next = e.target.checked;
                const res = await toggleMerchant24Hours(merchant.merchant_id, next);
                if (!res.ok) {
                  setFeedback({ type: 'error', text: res.error || 'Could not update 24-hour status.' });
                } else {
                  setFeedback({
                    type: 'success',
                    text: next
                      ? `${merchant.shop_name} is now set to Open 24 Hours on the live storefront.`
                      : `${merchant.shop_name} returned to scheduled operating hours.`,
                  });
                }
              }}
              className="rounded border-slate-300 dark:border-slate-600 accent-teal-600"
            />
            <span className="font-semibold text-slate-800 dark:text-slate-200">Open 24 Hours</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-xl medex-glass-subtle border px-3.5 py-2 hover:bg-white/90 dark:hover:bg-slate-800 transition-colors">
            <input
              type="checkbox"
              checked={merchant.is_temporarily_closed}
              onChange={async (e) => {
                const next = e.target.checked;
                const res = await toggleMerchantTempClosed(merchant.merchant_id, next);
                if (!res.ok) {
                  setFeedback({ type: 'error', text: res.error || 'Could not update temporary closure status.' });
                } else {
                  setFeedback({
                    type: 'success',
                    text: next
                      ? `${merchant.shop_name} marked Temporarily Closed across the storefront.`
                      : `${merchant.shop_name} reopened live on the storefront.`,
                  });
                }
              }}
              className="rounded border-slate-300 dark:border-slate-600 accent-red-600"
            />
            <span className="font-semibold text-slate-800 dark:text-slate-200">Temporarily Closed</span>
          </label>
        </div>
      </motion.div>

      {/* Store KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Orders', value: String(activeOrdersCount), tab: 'orders' as const },
          { label: 'Pending Rx Reviews', value: String(pendingRxCount), tab: 'rx' as const },
          { label: 'Catalog SKUs', value: String(merchantProducts.length), tab: 'inventory' as const },
          { label: 'Low / Out Stock', value: String(lowStockCount), tab: 'inventory' as const },
        ].map((kpi) => (
          <motion.button
            key={kpi.label}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setSubTab(kpi.tab)}
            className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
          >
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{kpi.label}</p>
            <p className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {kpi.value}
            </p>
          </motion.button>
        ))}
      </div>

      {/* Store Performance Analytics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="medex-glass-subtle rounded-xl border px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Net Medicine Revenue</p>
          <p className="font-display text-lg font-bold text-teal-700 dark:text-teal-400 tabular-nums mt-0.5">
            {formatPHP(storeGrossRevenue)}
          </p>
        </div>
        <div className="medex-glass-subtle rounded-xl border px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Completed Deliveries</p>
          <p className="font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {completedDeliveriesCount}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubTab('feedback');
            setFeedbackInboxTab('reviews');
          }}
          className="medex-glass-subtle rounded-xl border px-4 py-3 text-left hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
        >
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Store Rating</p>
          <p className="font-display text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
            {ratingSummary.count > 0 ? `${ratingSummary.average.toFixed(1)} ★ (${ratingSummary.count})` : 'No ratings'}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            setSubTab('feedback');
            setFeedbackInboxTab('returns');
          }}
          className="medex-glass-subtle rounded-xl border px-4 py-3 text-left hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
        >
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Return Requests</p>
          <p className="font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {pendingReturnsCount} pending / {merchantReturns.length} total
          </p>
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
        {(
          [
            ['orders', `Incoming Orders (${activeOrdersCount})`],
            ['rx', `Prescription Review (${pendingRxCount} pending)`],
            ['inventory', `Inventory & Stock (${merchantProducts.length})`],
            ['hours', 'Operating Hours'],
            ['feedback', `Feedback Inbox (${openReportsCount} open)`],
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

      {/* SUBTAB: INCOMING ORDERS */}
      {subTab === 'orders' && (
        <div className="space-y-3">
          {merchantOrders.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-700 dark:text-slate-300">
              No orders assigned to this pharmacy yet.
            </div>
          ) : (
            merchantOrders.map((order) => {
              const awaitingGcashPay =
                order.status !== 'cancelled' &&
                order.payment.method === 'GCash' &&
                order.payment.status !== 'paid' &&
                (!order.prescription || order.prescription.status === 'approved');
              return (
              <div
                key={order.order_id}
                className="medex-glass rounded-2xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {order.order_code}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span
                      className={`font-semibold uppercase ${
                        order.delivery?.status === 'not_home'
                          ? 'text-amber-700 dark:text-amber-300'
                          : order.delivery?.status === 'failed' || order.status === 'cancelled'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-teal-700 dark:text-teal-400'
                      }`}
                    >
                      {order.delivery?.status === 'not_home'
                        ? 'CUSTOMER NOT HOME (DELIVERY UNSUCCESSFUL)'
                        : order.delivery?.status === 'failed'
                          ? 'RETURNED TO PHARMACY · RESTOCKED'
                          : order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                      {order.payment.method} ({order.payment.status})
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {order.recipient_name} · {order.delivery_address_snapshot}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')} — Total{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatPHP(order.total_amount)}
                    </span>
                  </p>
                  {order.delivery?.status === 'not_home' && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/50 px-3 py-2 text-xs text-amber-950 dark:text-amber-200 mt-1">
                      <strong>Rider Alert:</strong> Customer was not home (
                      {order.delivery.failure_reason || 'No answer at drop-off'}). Rider may retry delivery or return medicines to your counter.
                    </div>
                  )}
                  {order.delivery?.status === 'failed' && (
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Undelivered package returned ({order.delivery.failure_reason || 'Customer not home'}). Stock restored to inventory.
                    </p>
                  )}
                  {order.prescription && order.prescription.status !== 'approved' && (
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Rx Status: {order.prescription.status.replace('_', ' ')} (must approve Rx first)
                    </p>
                  )}
                  {awaitingGcashPay && (
                    <p className="text-xs font-semibold text-[#007DFE] dark:text-blue-400">
                      {order.prescription?.status === 'approved'
                        ? 'Rx Approved · Awaiting Customer GCash Payment'
                        : 'Awaiting Customer GCash Authorization'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {order.delivery?.status === 'not_home' && order.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = returnNotHomeOrderToPharmacy(
                          order.order_id,
                          order.delivery?.failure_reason || 'Returned to pharmacy counter — stock restored'
                        );
                        if (!r.ok) {
                          setFeedback({ type: 'error', text: r.error || 'Could not confirm return.' });
                        } else {
                          setFeedback({
                            type: 'success',
                            text: `${order.order_code} marked Returned to Pharmacy and product stock restored.`,
                          });
                        }
                      }}
                      className="rounded-lg border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 px-3.5 py-2 text-xs font-semibold text-amber-950 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 whitespace-nowrap"
                    >
                      Confirm Return &amp; Restock
                    </button>
                  )}
                  {order.status === 'awaiting_prescription_review' && (
                    <button
                      type="button"
                      onClick={() => setSubTab('rx')}
                      className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 whitespace-nowrap"
                    >
                      Review Rx Document
                    </button>
                  )}
                  {awaitingGcashPay && (
                    <span className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-3.5 py-2 text-xs font-semibold text-blue-800 dark:text-blue-200 whitespace-nowrap">
                      Awaiting Customer GCash
                    </span>
                  )}
                  {order.status === 'placed' && !awaitingGcashPay && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = advanceMerchantOrderStatus(order.order_id, 'preparing');
                        if (!r.ok) setFeedback({ type: 'error', text: r.error || 'Cannot advance.' });
                        else setFeedback({ type: 'success', text: `${order.order_code} marked Preparing.` });
                      }}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px] whitespace-nowrap"
                    >
                      Start Preparing
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = advanceMerchantOrderStatus(order.order_id, 'ready_for_pickup');
                        if (!r.ok) setFeedback({ type: 'error', text: r.error || 'Cannot advance.' });
                        else
                          setFeedback({
                            type: 'success',
                            text: `${order.order_code} ready for rider pickup (delivery request dispatched).`,
                          });
                      }}
                      className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white min-h-[38px] whitespace-nowrap"
                    >
                      Mark Ready for Pickup
                    </button>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB: PRESCRIPTION REVIEW */}
      {subTab === 'rx' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['pending_review', 'Pending Review'],
                ['approved', 'Approved'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([statusKey, label]) => (
              <button
                key={statusKey}
                type="button"
                onClick={() => setRxFilter(statusKey)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold border whitespace-nowrap ${
                  rxFilter === statusKey
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label} (
                {merchantOrders.filter((o) => o.prescription?.status === statusKey).length})
              </button>
            ))}
          </div>

          {rxOrders.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-700 dark:text-slate-300">
              No prescriptions in "{rxFilter.replace('_', ' ')}".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rxOrders.map((order) => {
                const rx = order.prescription!;
                return (
                  <div
                    key={order.order_id}
                    className="medex-glass rounded-2xl border p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {order.order_code}
                      </span>
                      <span className="font-semibold uppercase text-slate-600 dark:text-slate-300">
                        {rx.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 overflow-hidden">
                      {rx.file_type === 'pdf' ? (
                        <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-300">
                          <FileCheck2 className="w-7 h-7 mx-auto text-teal-700 dark:text-teal-400 mb-1" />
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {rx.file_name}
                          </p>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                            PDF Prescription Document
                          </p>
                        </div>
                      ) : (
                        <img
                          src={rx.file_preview_url}
                          alt={`Prescription for ${order.order_code}`}
                          className="w-full h-44 object-contain bg-slate-100 dark:bg-slate-950/70"
                        />
                      )}
                    </div>

                    <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Patient:</span>{' '}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {rx.patient_name}
                        </span>
                      </p>
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Physician:</span>{' '}
                        {rx.doctor_name} (<span className="font-mono">{rx.license_no}</span>)
                      </p>
                      <p className="tabular-nums">
                        <span className="text-slate-400 dark:text-slate-500">Issued:</span>{' '}
                        {rx.date_issued}
                        {rx.valid_until ? ` · Valid until: ${rx.valid_until}` : ''}
                      </p>
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Items:</span>{' '}
                        {order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
                      </p>
                      {rx.reject_reason && (
                        <p className="text-red-700 dark:text-red-400 font-semibold pt-1">
                          Rejected: {rx.reject_reason}
                          {rx.remarks ? ` — ${rx.remarks}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            title: `${order.order_code} — ${rx.file_name}`,
                            url: rx.file_preview_url,
                            fileType: rx.file_type,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Open Full Size</span>
                      </button>

                      {rx.status === 'pending_review' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingOrderId(order.order_id);
                              setRejectReason(PRESCRIPTION_REJECTION_REASONS[0]);
                              setRejectRemarks('');
                            }}
                            className="rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 whitespace-nowrap"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const needsGcash =
                                order.payment.method === 'GCash' && order.payment.status === 'pending';
                              const r = reviewPrescription(order.order_id, 'approved');
                              if (r.ok) {
                                setFeedback({
                                  type: 'success',
                                  text: needsGcash
                                    ? `Prescription approved for ${order.order_code}. Customer notified to pay via GCash before preparation begins.`
                                    : `Prescription approved for ${order.order_code}. Order moved to Placed.`,
                                });
                              }
                            }}
                            className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                          >
                            Approve Rx
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: INVENTORY & STOCK */}
      {subTab === 'inventory' && (
        <div className="space-y-4">
          {merchantInventoryFocusProductId !== null && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Focused from Locator Problem Report — update real-time stock or listing details for{' '}
                <strong>
                  {merchantProducts.find((p) => p.product_id === merchantInventoryFocusProductId)
                    ?.name || `Product #${merchantInventoryFocusProductId}`}
                </strong>
                .
              </p>
              <div className="flex items-center gap-2">
                {(() => {
                  const target = merchantProducts.find(
                    (p) => p.product_id === merchantInventoryFocusProductId
                  );
                  return target ? (
                    <button
                      type="button"
                      onClick={() => openProductEditor(target)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Edit Stock Now
                    </button>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setMerchantInventoryFocusProductId(null)}
                  className="text-xs font-semibold underline text-amber-800 dark:text-amber-300"
                >
                  Clear Highlight
                </button>
              </div>
            </div>
          )}

          {/* Top 10 Lowest Stock Products Alert Panel */}
          {lowestStockProducts.length > 0 && (
            <div className="medex-glass rounded-2xl border border-amber-200/80 dark:border-amber-800/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Top {lowestStockProducts.length} Lowest Stock Products
                  </h2>
                </div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Auto-updated on orders &amp; cancellations · Low-stock alerts trigger notifications
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {lowestStockProducts.map((prod) => {
                  const avail = getAvailabilityStatus(
                    prod.stock_quantity,
                    prod.low_stock_threshold
                  );
                  const isAlert = prod.stock_quantity <= prod.low_stock_threshold;
                  return (
                    <div
                      key={`low-${prod.product_id}`}
                      className={`rounded-xl border px-3 py-2 flex flex-col justify-between gap-1.5 text-xs ${
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
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            prod.stock_quantity <= 0
                              ? 'text-red-700 dark:text-red-400'
                              : isAlert
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-teal-700 dark:text-teal-400'
                          }`}
                        >
                          {prod.stock_quantity} left
                        </span>
                        <button
                          type="button"
                          onClick={() => openProductEditor(prod)}
                          className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                        >
                          {avail === 'Available' ? 'Adjust' : 'Restock'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 medex-glass-subtle border rounded-xl">
                <button
                  type="button"
                  onClick={() => setInventoryView('active')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    inventoryView === 'active'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Active Inventory ({activeMerchantProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInventoryView('archived')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    inventoryView === 'archived'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archived ({archivedMerchantProducts.length})</span>
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 hidden md:block">
                Removed items are archived to preserve order history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openProductEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px] whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Medicine / Item</span>
            </button>
          </div>

          {displayedMerchantProducts.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              {inventoryView === 'archived'
                ? 'No archived products yet. Archived items preserve past order history and can be restored anytime.'
                : 'No active medicines listed yet. Click "Add Medicine / Item" to publish your pharmacy catalog.'}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedMerchantProducts.map((prod) => {
              const cat = state.categories.find((c) => c.category_id === prod.category_id);
              const avail = getAvailabilityStatus(prod.stock_quantity, prod.low_stock_threshold);
              const isFocused = merchantInventoryFocusProductId === prod.product_id;
              return (
                <div
                  key={prod.product_id}
                  className={`medex-glass medex-card-hover rounded-2xl border p-4 flex gap-4 justify-between ${
                    isFocused ? 'ring-2 ring-amber-500 border-amber-400 dark:border-amber-500' : ''
                  }`}
                >
                  <img
                    src={prod.image_path}
                    alt={prod.name}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                          {prod.name}
                        </h3>
                        {prod.is_archived ? (
                          <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                            Archived
                          </span>
                        ) : !prod.is_listed ? (
                          <span className="shrink-0 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                            Hidden
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {prod.is_archived ? (
                          <button
                            type="button"
                            disabled={restoringProductId === prod.product_id}
                            aria-label={`Restore ${prod.name}`}
                            onClick={() => void handleRestoreProduct(prod)}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>
                              {restoringProductId === prod.product_id ? 'Restoring...' : 'Restore'}
                            </span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={`Edit ${prod.name}`}
                              onClick={() => openProductEditor(prod)}
                              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`${prod.is_listed ? 'Hide' : 'Show'} ${prod.name}`}
                              onClick={() => void handleToggleProductListed(prod)}
                              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline"
                            >
                              {prod.is_listed ? 'Hide' : 'List'}
                            </button>
                            <button
                              type="button"
                              aria-label={`Archive ${prod.name}`}
                              onClick={() => setConfirmDeleteProductId(prod.product_id)}
                              className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {cat?.name} · {prod.unit}
                      {prod.requires_prescription ? ' · Rx Required' : ''}
                    </p>
                    <p className="text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                      Unit Price: <span className="font-semibold">{formatPHP(prod.regular_price)}</span>
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      Stock:{' '}
                      <span
                        className={
                          avail === 'Out of Stock'
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : avail === 'Low Stock'
                              ? 'text-amber-700 dark:text-amber-300 font-semibold'
                              : 'text-teal-700 dark:text-teal-400 font-semibold'
                        }
                      >
                        {prod.stock_quantity} ({avail})
                      </span>{' '}
                      · Limit {prod.purchase_limit} / order
                    </p>
                    {confirmDeleteProductId === prod.product_id && !prod.is_archived && (
                      <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-amber-800 dark:text-amber-300">
                          Archive item? (Preserves order history)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProductId(null)}
                            className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={deletingProductId === prod.product_id}
                            onClick={() => void handleArchiveProduct(prod)}
                            className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {deletingProductId === prod.product_id ? 'Archiving...' : 'Confirm Archive'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* SUBTAB: STORE HOURS */}
      {subTab === 'hours' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (hoursSaving) return;
            setHoursSaving(true);
            try {
              const res = await updateMerchantHours(merchant.merchant_id, hoursDraft);
              if (!res.ok) {
                setFeedback({ type: 'error', text: res.error || 'Could not save operating hours.' });
                return;
              }
              setHoursDirty(false);
              setFeedback({
                type: 'success',
                text: 'Weekly operating hours saved and updated live on the storefront & pharmacy locator.',
              });
            } finally {
              setHoursSaving(false);
            }
          }}
          className="medex-glass rounded-2xl border overflow-hidden"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Weekly Operating Hours (Asia/Manila)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {merchant.is_24_hours
                    ? '24-Hour mode is currently ON — uncheck Open 24 Hours above to use custom daily schedules.'
                    : 'Update opening and closing times below. Changes appear live across the storefront and admin console.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHoursDirty(true);
                  setHoursDraft(
                    DAY_NAMES.map((_, idx) => ({
                      day_of_week: idx,
                      opens_at: '08:00',
                      closes_at: '20:00',
                      is_closed: false,
                    }))
                  );
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Apply 08:00–20:00 Daily
              </button>
              <button
                type="submit"
                disabled={hoursSaving}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {hoursSaving ? 'Saving Hours...' : 'Save Operating Hours'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {DAY_NAMES.map((dayName, idx) => {
              const row = hoursDraft.find((h) => h.day_of_week === idx) ?? {
                day_of_week: idx,
                opens_at: '08:00',
                closes_at: '20:00',
                is_closed: false,
              };
              const updateDay = (
                patch: Partial<{ opens_at: string; closes_at: string; is_closed: boolean }>
              ) => {
                setHoursDirty(true);
                setHoursDraft((prev) =>
                  prev.map((d) => (d.day_of_week === idx ? { ...d, ...patch } : d))
                );
              };

              return (
                <div
                  key={dayName}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center justify-between sm:justify-start gap-4 min-w-[180px]">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{dayName}</span>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.is_closed}
                        disabled={merchant.is_24_hours}
                        onChange={(e) => updateDay({ is_closed: e.target.checked })}
                        aria-label={`${dayName} closed`}
                        className="rounded border-slate-300 dark:border-slate-600 accent-red-600"
                      />
                      <span>Closed</span>
                    </label>
                  </div>

                  {merchant.is_24_hours ? (
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                      Open 24 Hours (Override Active)
                    </span>
                  ) : row.is_closed ? (
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Store closed on {dayName}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      <input
                        type="time"
                        value={row.opens_at}
                        aria-label={`${dayName} opens at`}
                        onChange={(e) => updateDay({ opens_at: e.target.value })}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <span className="text-slate-400">to</span>
                      <input
                        type="time"
                        value={row.closes_at}
                        aria-label={`${dayName} closes at`}
                        onChange={(e) => updateDay({ closes_at: e.target.value })}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </form>
      )}

      {/* SUBTAB: FEEDBACK INBOX (MODULE 9) */}
      {subTab === 'feedback' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Store Rating Average
              </p>
              <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1 inline-flex items-center gap-1.5 tabular-nums">
                <span>{ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '—'}</span>
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                From {ratingSummary.count} visible review{ratingSummary.count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Open / Acknowledged Reports
              </p>
              <p className="font-display text-2xl font-bold text-red-700 dark:text-red-400 mt-1 tabular-nums">
                {openReportsCount}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Scoped strictly to {merchant.shop_name}
              </p>
            </div>
            <div className="medex-glass rounded-2xl border p-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Resident Privacy Shield
              </p>
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-1.5 flex items-center gap-1">
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
                Reviewer Identities Masked
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Customer phone, email, and home street are never shown.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFeedbackInboxTab('reviews')}
              className={`rounded-xl px-4 py-2 text-xs font-semibold border transition-colors ${
                feedbackInboxTab === 'reviews'
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'medex-glass border text-slate-700 dark:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
              Store Reviews ({merchantReviews.length})
            </button>
            <button
              type="button"
              onClick={() => setFeedbackInboxTab('reports')}
              className={`rounded-xl px-4 py-2 text-xs font-semibold border transition-colors ${
                feedbackInboxTab === 'reports'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'medex-glass border text-slate-700 dark:text-slate-200'
              }`}
            >
              <Flag className="w-3.5 h-3.5 inline mr-1.5" />
              Problem Reports ({merchantReports.length})
            </button>
            <button
              type="button"
              onClick={() => setFeedbackInboxTab('returns')}
              className={`rounded-xl px-4 py-2 text-xs font-semibold border transition-colors ${
                feedbackInboxTab === 'returns'
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'medex-glass border text-slate-700 dark:text-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" />
              Return Requests ({merchantReturns.length})
            </button>
          </div>

          {feedbackInboxTab === 'reviews' && (
            <div className="space-y-3">
              {merchantReviews.length === 0 ? (
                <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                  No customer reviews for {merchant.shop_name} yet.
                </div>
              ) : (
                merchantReviews.map((review) => {
                  const resident = state.users.find((u) => u.user_id === review.resident_id);
                  const order = state.orders.find((o) => o.order_id === review.order_id);
                  const draft = replyDrafts[review.review_id] || '';
                  return (
                    <div
                      key={review.review_id}
                      className="medex-glass rounded-2xl border p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1">
                            {review.is_anonymous && (
                              <EyeOff className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            )}
                            {formatReviewerDisplayName(resident, review.is_anonymous)}
                          </span>
                          {order && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono text-slate-500 dark:text-slate-400">
                                {order.order_code}
                              </span>
                            </>
                          )}
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {new Date(review.created_at).toLocaleString()}
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

                      {review.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {review.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {review.comment && (
                        <p className="text-sm text-slate-800 dark:text-slate-100">
                          &ldquo;{review.comment}&rdquo;
                        </p>
                      )}

                      {review.merchant_reply ? (
                        <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/75 dark:bg-teal-950/35 p-3 text-xs text-teal-900 dark:text-teal-200">
                          <p className="font-semibold">
                            Your Pharmacy Reply (1/1 Posted)
                            {review.replied_at && (
                              <span className="font-normal text-teal-700 dark:text-teal-400 ml-1.5 tabular-nums">
                                · {new Date(review.replied_at).toLocaleString()}
                              </span>
                            )}
                          </p>
                          <p className="mt-1">{review.merchant_reply}</p>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            maxLength={500}
                            value={draft}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [review.review_id]: e.target.value,
                              }))
                            }
                            placeholder="Write one polite public pharmacy reply (max 500 chars)..."
                            aria-label={`Reply to review ${review.review_id}`}
                            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const r = replyToPharmacyReview(review.review_id, draft);
                              if (!r.ok) {
                                setFeedback({
                                  type: 'error',
                                  text: r.error || 'Could not post reply.',
                                });
                              } else {
                                setReplyDrafts((prev) => ({ ...prev, [review.review_id]: '' }));
                                setFeedback({
                                  type: 'success',
                                  text: 'Pharmacy reply posted and customer notified.',
                                });
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                          >
                            <Reply className="w-3.5 h-3.5" />
                            Post Reply
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {feedbackInboxTab === 'reports' && (
            <div className="space-y-3">
              {merchantReports.length === 0 ? (
                <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                  No problem reports assigned to {merchant.shop_name}.
                </div>
              ) : (
                merchantReports.map((report) => {
                  const reporter = state.users.find((u) => u.user_id === report.user_id);
                  const product = report.product_id
                    ? state.products.find((p) => p.product_id === report.product_id)
                    : null;
                  const order = report.order_id
                    ? state.orders.find((o) => o.order_id === report.order_id)
                    : null;
                  const noteVal = reportActionNotes[report.report_id] || '';
                  const isTerminal =
                    report.status === 'resolved' || report.status === 'dismissed';

                  return (
                    <div
                      key={report.report_id}
                      className="medex-glass rounded-2xl border p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {report.reference_code}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold uppercase text-slate-700 dark:text-slate-200">
                            {report.source}
                          </span>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            {report.category_label}
                          </span>
                        </div>
                        <span
                          className={`rounded-md px-2 py-0.5 font-bold uppercase ${
                            report.status === 'resolved'
                              ? 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                              : report.status === 'acknowledged'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                : report.status === 'dismissed'
                                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                        <span>
                          Reporter:{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {formatReviewerDisplayName(reporter, report.is_anonymous)}
                          </strong>
                        </span>
                        {product && <span>Medicine: {product.name}</span>}
                        {order && <span className="font-mono">Order: {order.order_code}</span>}
                        <span className="tabular-nums">
                          {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 dark:text-slate-100">
                        {report.description}
                      </p>

                      {report.resolution_note && (
                        <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/35 p-3 text-xs text-teal-900 dark:text-teal-200">
                          <strong>Resolution Note:</strong> {report.resolution_note}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        {report.source === 'locator' && report.product_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setMerchantInventoryFocusProductId(report.product_id!);
                              setSubTab('inventory');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 whitespace-nowrap"
                          >
                            <span>Update Stock</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {!isTerminal && (
                          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                            <input
                              type="text"
                              value={noteVal}
                              onChange={(e) =>
                                setReportActionNotes((prev) => ({
                                  ...prev,
                                  [report.report_id]: e.target.value,
                                }))
                              }
                              placeholder="Resolution / action note..."
                              aria-label={`Action note for ${report.reference_code}`}
                              className="flex-1 min-w-[180px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                            {report.status === 'open' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const r = updateProblemReportStatus(
                                    report.report_id,
                                    'acknowledged',
                                    noteVal.trim() || 'Acknowledged by pharmacy pharmacist'
                                  );
                                  if (!r.ok)
                                    setFeedback({ type: 'error', text: r.error || 'Failed.' });
                                  else
                                    setFeedback({
                                      type: 'success',
                                      text: `${report.reference_code} marked Acknowledged.`,
                                    });
                                }}
                                className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 whitespace-nowrap"
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const r = updateProblemReportStatus(
                                  report.report_id,
                                  'resolved',
                                  noteVal
                                );
                                if (!r.ok) {
                                  setFeedback({
                                    type: 'error',
                                    text: r.error || 'Please enter a resolution note first.',
                                  });
                                } else {
                                  setReportActionNotes((prev) => ({
                                    ...prev,
                                    [report.report_id]: '',
                                  }));
                                  setFeedback({
                                    type: 'success',
                                    text: `${report.reference_code} resolved and resident notified.`,
                                  });
                                }
                              }}
                              className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {feedbackInboxTab === 'returns' && (
            <div className="space-y-3">
              {merchantReturns.length === 0 ? (
                <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                  No return or refund requests submitted for {merchant.shop_name}.
                </div>
              ) : (
                merchantReturns.map((ret) => {
                  const customer = state.users.find((u) => u.user_id === ret.resident_id);
                  const order = state.orders.find((o) => o.order_id === ret.order_id);
                  const noteDraft = returnReplyNotes[ret.return_id] || '';
                  const canStoreRespond = ret.status === 'requested' || ret.status === 'store_approved';

                  return (
                    <div
                      key={ret.return_id}
                      className="medex-glass rounded-2xl border p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {ret.reference_code}
                          </span>
                          {order && (
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              · {order.order_code}
                            </span>
                          )}
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold uppercase text-slate-700 dark:text-slate-200">
                            {ret.reason_code.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 font-bold uppercase text-slate-800 dark:text-slate-200">
                          {ret.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Customer:{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {customer ? `${customer.first_name} ${customer.last_name}` : 'Resident'}
                          </strong>
                        </span>
                        <span className="tabular-nums">
                          Requested Refund:{' '}
                          <strong className="text-teal-700 dark:text-teal-400">
                            {formatPHP(ret.requested_refund_amount)}
                          </strong>
                        </span>
                        <span className="tabular-nums">
                          Submitted {new Date(ret.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 dark:text-slate-100">{ret.description}</p>

                      {ret.store_response_note && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-700 dark:text-slate-200">
                          <strong>Store Response:</strong> {ret.store_response_note}
                        </div>
                      )}

                      {ret.cs_resolution_note && (
                        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/35 p-3 text-xs text-purple-900 dark:text-purple-200">
                          <strong>Customer Service Final Ruling:</strong> {ret.cs_resolution_note}
                        </div>
                      )}

                      {canStoreRespond && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) =>
                              setReturnReplyNotes((prev) => ({
                                ...prev,
                                [ret.return_id]: e.target.value,
                              }))
                            }
                            placeholder="Store response note (e.g., Replacement/refund verified)..."
                            aria-label={`Response note for ${ret.reference_code}`}
                            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                          {ret.status === 'requested' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await respondReturnAsMerchant(ret.return_id, {
                                    status: 'store_approved',
                                    responseNote:
                                      noteDraft.trim() || 'Return approved by pharmacy.',
                                    approvedAmount: ret.requested_refund_amount,
                                  });
                                  if (!res.ok) {
                                    setFeedback({ type: 'error', text: res.error || 'Failed.' });
                                  } else {
                                    setFeedback({
                                      type: 'success',
                                      text: `${ret.reference_code} approved by store.`,
                                    });
                                  }
                                }}
                                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                              >
                                Approve Return
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await respondReturnAsMerchant(ret.return_id, {
                                    status: 'store_rejected',
                                    responseNote:
                                      noteDraft.trim() || 'Rejected after store batch inspection.',
                                  });
                                  if (!res.ok) {
                                    setFeedback({ type: 'error', text: res.error || 'Failed.' });
                                  } else {
                                    setFeedback({
                                      type: 'success',
                                      text: `${ret.reference_code} rejected. Customer may escalate to CS if disputed.`,
                                    });
                                  }
                                }}
                                className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {ret.status === 'store_approved' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await respondReturnAsMerchant(ret.return_id, {
                                  status: 'refunded',
                                  responseNote:
                                    noteDraft.trim() || 'Refund processed by pharmacy.',
                                  approvedAmount:
                                    ret.approved_refund_amount ?? ret.requested_refund_amount,
                                });
                                if (!res.ok) {
                                  setFeedback({ type: 'error', text: res.error || 'Failed.' });
                                } else {
                                  setFeedback({
                                    type: 'success',
                                    text: `${ret.reference_code} marked Refunded.`,
                                  });
                                }
                              }}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap"
                            >
                              Mark Refunded
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Full-size Rx Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rx-fullsize-title"
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3
                id="rx-fullsize-title"
                className="font-display text-base font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                {previewImage.title}
              </h3>
              <button
                type="button"
                aria-label="Close prescription preview"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewImage.fileType === 'pdf' ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-10 text-center space-y-2">
                <FileCheck2 className="w-12 h-12 mx-auto text-teal-700 dark:text-teal-400" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {previewImage.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  PDF prescription document attached by customer and queued for PRC pharmacist review.
                </p>
              </div>
            ) : (
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="w-full max-h-[70vh] object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
              />
            )}
          </div>
        </div>
      )}

      {/* Reject Rx Modal */}
      {rejectingOrderId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-rx-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRejectSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="reject-rx-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Reject Prescription
            </h3>
            <div>
              <label
                htmlFor="rx-rej-reason"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Standard Rejection Reason *
              </label>
              <select
                id="rx-rej-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              >
                {PRESCRIPTION_REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="rx-rej-remarks"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Pharmacist Remarks {rejectReason === 'Other' ? '*' : '(optional)'}
              </label>
              <textarea
                id="rx-rej-remarks"
                rows={3}
                required={rejectReason === 'Other'}
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
                placeholder="Explain what the resident should correct on re-upload"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingOrderId(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {editingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prod-editor-title"
          className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSaveProduct}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-xl w-full p-5 space-y-3.5 max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3
                id="prod-editor-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {editingProduct.product_id ? 'Edit Product & Pricing' : 'Add Medicine / Item'}
              </h3>
              <button
                type="button"
                aria-label="Close product editor"
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="prod-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Product Name *
                </label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-cat"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Category *
                </label>
                <select
                  id="prod-cat"
                  value={editingProduct.category_id || 1}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, category_id: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  {state.categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="prod-unit"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Unit / Pack Size *
                </label>
                <input
                  id="prod-unit"
                  type="text"
                  required
                  value={editingProduct.unit || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-reg"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Unit Price (₱) *
                </label>
                <input
                  id="prod-reg"
                  type="number"
                  step="0.01"
                  required
                  value={editingProduct.regular_price ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, regular_price: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-stock"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Stock Quantity *
                </label>
                <input
                  id="prod-stock"
                  type="number"
                  min={0}
                  required
                  value={editingProduct.stock_quantity ?? 0}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      stock_quantity: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-limit"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Purchase Limit / Order *
                </label>
                <input
                  id="prod-limit"
                  type="number"
                  min={1}
                  required
                  value={editingProduct.purchase_limit ?? 2}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      purchase_limit: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="prod-desc"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Description *
                </label>
                <textarea
                  id="prod-desc"
                  rows={2}
                  required
                  value={editingProduct.description || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <ImagePlus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>Medicine Product Photo</span>
                    </p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      Attach a real photo of the medicine box/bottle, paste a link, or pick a quick preset.
                    </p>
                  </div>
                  {uploadedPhotoName && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300">
                      <CheckCircle2 className="w-3 h-3" />
                      {uploadedPhotoName}
                    </span>
                  )}
                </div>

                {photoUploadError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
                  >
                    {photoUploadError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="relative h-24 w-24 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                    {editingProduct.image_path ? (
                      <img
                        src={editingProduct.image_path}
                        alt={editingProduct.name || 'Medicine photo preview'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="w-7 h-7 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="prod-photo-upload"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer transition-colors shadow-xs whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Attach Medicine Photo</span>
                      </label>
                      <input
                        id="prod-photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleMedicinePhotoChange}
                        className="sr-only"
                      />

                      {editingProduct.image_path &&
                        editingProduct.image_path !== (PRODUCT_IMAGE_PRESETS[0]?.path || '') && (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedPhotoName(null);
                              setPhotoUploadError(null);
                              setEditingProduct({
                                ...editingProduct,
                                image_path: PRODUCT_IMAGE_PRESETS[0]?.path || '',
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Reset to Default</span>
                          </button>
                        )}
                    </div>

                    <div className="relative">
                      <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="prod-img-url"
                        type="text"
                        placeholder="Or paste custom photo URL (https://...)"
                        value={
                          editingProduct.image_path?.startsWith('data:')
                            ? ''
                            : editingProduct.image_path || ''
                        }
                        onChange={(e) => {
                          setUploadedPhotoName(null);
                          setEditingProduct({ ...editingProduct, image_path: e.target.value });
                        }}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Or pick a quick preset thumbnail:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PRODUCT_IMAGE_PRESETS.map((preset) => {
                      const active = editingProduct.image_path === preset.path;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setUploadedPhotoName(null);
                            setPhotoUploadError(null);
                            setEditingProduct({ ...editingProduct, image_path: preset.path });
                          }}
                          className={`flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors ${
                            active
                              ? 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <img
                            src={preset.path}
                            alt={preset.label}
                            className="h-8 w-8 rounded object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                          <span className="text-[11px] font-medium leading-tight line-clamp-2">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.requires_prescription ?? false}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      requires_prescription: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                />
                <span>Requires Prescription (Rx)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.is_listed ?? true}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, is_listed: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                />
                <span>Listed in Storefront</span>
              </label>
            </div>

            {!editPricingValidation.valid && (
              <div className="rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-800 dark:text-red-300">
                {editPricingValidation.error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!editPricingValidation.valid || productSaving}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {productSaving ? 'Saving...' : 'Save Medicine'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

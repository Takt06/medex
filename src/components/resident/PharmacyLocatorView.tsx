import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  Flag,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { HERO_PHARMACY_IMAGE } from '../../data/seedData';
import { useMedEx } from '../../context/MedExContext';
import type { Product } from '../../types/medex';
import {
  OLONGAPO_DEFAULT_CENTER,
  computePharmacyRatingSummary,
  formatPHP,
  getApprovedStorefrontMerchantIds,
  getAvailabilityStatus,
  getMerchantOpenStatus,
  haversineDistanceKm,
} from '../../utils/medexRules';
import { buildOlongapoSampleRxSvg, readPrescriptionFile } from '../../utils/sampleRx';
import { LeafletMap, type MapMarker } from '../common/LeafletMap';
import { ReportProblemModal } from '../feedback/FeedbackAndRatingModals';
import { PharmacyStorefrontPanel } from './PharmacyStorefrontPanel';

interface PharmacyLocatorViewProps {
  onOpenCart: () => void;
}

export const PharmacyLocatorView: React.FC<PharmacyLocatorViewProps> = ({ onOpenCart }) => {
  const {
    state,
    currentUser,
    draftRxProof,
    setDraftRxProof,
    addToCart,
    setActiveTab,
    locatorSearchDraft,
    setLocatorSearchDraft,
  } = useMedEx();

  const [searchQuery, setSearchQuery] = useState(
    locatorSearchDraft === '__ALL__' ? '' : locatorSearchDraft || 'Paracetamol 500mg'
  );
  const [selectedAvailability, setSelectedAvailability] = useState<'all' | 'in_stock'>('all');
  const [selectedBarangayId, setSelectedBarangayId] = useState<number | 'all'>('all');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const setSelectedProduct = (prod: Product | null) =>
    setSelectedProductId(prod ? prod.product_id : null);
  const [visitPharmacyId, setVisitPharmacyId] = useState<number | null>(null);
  const [storefrontMerchantId, setStorefrontMerchantId] = useState<number | null>(null);
  const [storefrontNotice, setStorefrontNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rxError, setRxError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    merchantId: number;
    productId: number | null;
    searchId: string | null;
  } | null>(null);

  const [doctorName, setDoctorName] = useState(draftRxProof?.doctor_name || '');
  const [licenseNo, setLicenseNo] = useState(draftRxProof?.license_no || '');
  const [rxFileName, setRxFileName] = useState(draftRxProof?.file_name || '');
  const [rxFileType, setRxFileType] = useState<'jpg' | 'png' | 'pdf'>(draftRxProof?.file_type || 'png');
  const [rxPreviewUrl, setRxPreviewUrl] = useState(draftRxProof?.file_preview_url || '');

  const [conflictPrompt, setConflictPrompt] = useState<{
    productId: number;
    otherMerchantName: string;
  } | null>(null);

  useEffect(() => {
    if (locatorSearchDraft) {
      setSearchQuery(locatorSearchDraft === '__ALL__' ? '' : locatorSearchDraft);
      setLocatorSearchDraft('');
    }
  }, [locatorSearchDraft, setLocatorSearchDraft]);

  const approvedMerchantIds = useMemo(
    () => getApprovedStorefrontMerchantIds(state.merchants, state.users),
    [state.merchants, state.users]
  );

  const userOrigin = useMemo(() => {
    const userAddrs = state.addresses.filter((a) => a.user_id === currentUser.user_id);
    const primary = userAddrs.find((a) => a.is_primary) || userAddrs[0];
    if (primary && Number.isFinite(primary.latitude) && Number.isFinite(primary.longitude)) {
      return { lat: primary.latitude, lng: primary.longitude };
    }
    return OLONGAPO_DEFAULT_CENTER;
  }, [state.addresses, currentUser.user_id]);

  const merchantDistanceKmById = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of state.merchants) {
      const addr = state.addresses.find((a) => a.address_id === m.shop_address_id);
      if (addr && Number.isFinite(addr.latitude) && Number.isFinite(addr.longitude)) {
        map.set(
          m.merchant_id,
          haversineDistanceKm(userOrigin.lat, userOrigin.lng, addr.latitude, addr.longitude)
        );
      }
    }
    return map;
  }, [state.merchants, state.addresses, userOrigin]);

  const selectedProduct = useMemo(
    () =>
      selectedProductId === null
        ? null
        : state.products.find(
            (p) =>
              p.product_id === selectedProductId &&
              p.is_listed &&
              !p.is_archived &&
              approvedMerchantIds.has(p.merchant_id)
          ) ?? null,
    [selectedProductId, state.products, approvedMerchantIds]
  );

  useEffect(() => {
    if (selectedProductId !== null) {
      setRxError(null);
      setDoctorName(draftRxProof?.doctor_name || '');
      setLicenseNo(draftRxProof?.license_no || '');
      setRxFileName(draftRxProof?.file_name || '');
      setRxFileType(draftRxProof?.file_type || 'png');
      setRxPreviewUrl(draftRxProof?.file_preview_url || '');
    }
  }, [selectedProductId, draftRxProof]);

  const locatorResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.products
      .filter((p) => p.is_listed && !p.is_archived && approvedMerchantIds.has(p.merchant_id))
      .filter((p) => {
        if (!q) return true;
        const cat = state.categories.find((c) => c.category_id === p.category_id)?.name || '';
        return (
          p.name.toLowerCase().includes(q) ||
          (p.dosage_strength || '').toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        );
      })
      .map((product) => {
        const merchant = state.merchants.find((m) => m.merchant_id === product.merchant_id)!;
        const addr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
        const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
        const hours = state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id);
        const openStatus = getMerchantOpenStatus(merchant, hours);
        const availability = getAvailabilityStatus(
          product.stock_quantity,
          product.low_stock_threshold
        );
        const ratingSummary = computePharmacyRatingSummary(
          state.pharmacyReviews,
          merchant.merchant_id
        );
        const category = state.categories.find((c) => c.category_id === product.category_id);

        return {
          product,
          merchant,
          addr,
          brgy,
          openStatus,
          availability,
          ratingSummary,
          categoryName: category?.name || 'Medicines',
        };
      })
      .filter((row) =>
        selectedAvailability === 'in_stock' ? row.availability !== 'Out of Stock' : true
      )
      .filter((row) =>
        selectedBarangayId === 'all' ? true : row.addr?.barangay_id === selectedBarangayId
      )
      .sort((a, b) => {
        const scoreA =
          (a.availability === 'Available' ? 4 : a.availability === 'Low Stock' ? 2 : 0) +
          (a.openStatus.isOpen ? 1 : 0);
        const scoreB =
          (b.availability === 'Available' ? 4 : b.availability === 'Low Stock' ? 2 : 0) +
          (b.openStatus.isOpen ? 1 : 0);
        return scoreB - scoreA;
      });
  }, [
    searchQuery,
    selectedAvailability,
    selectedBarangayId,
    state.products,
    state.merchants,
    state.addresses,
    state.barangays,
    state.merchantHours,
    state.categories,
    state.pharmacyReviews,
    approvedMerchantIds,
  ]);

  const approvedStoresList = useMemo(() => {
    return state.merchants
      .filter((m) => approvedMerchantIds.has(m.merchant_id))
      .map((merchant) => {
        const addr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
        const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
        const hours = state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id);
        const openStatus = getMerchantOpenStatus(merchant, hours);
        const ratingSummary = computePharmacyRatingSummary(
          state.pharmacyReviews,
          merchant.merchant_id
        );
        const listedCount = state.products.filter(
          (p) => p.merchant_id === merchant.merchant_id && p.is_listed && !p.is_archived
        ).length;
        return { merchant, addr, brgy, openStatus, ratingSummary, listedCount };
      })
      .filter((s) =>
        selectedBarangayId === 'all' ? true : s.addr?.barangay_id === selectedBarangayId
      );
  }, [
    state.merchants,
    state.addresses,
    state.barangays,
    state.merchantHours,
    state.pharmacyReviews,
    state.products,
    approvedMerchantIds,
    selectedBarangayId,
  ]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const seen = new Set<number>();
    const list: MapMarker[] = [];
    locatorResults.forEach((r) => {
      if (!r.addr || seen.has(r.merchant.merchant_id)) return;
      seen.add(r.merchant.merchant_id);
      list.push({
        id: `m-${r.merchant.merchant_id}`,
        lat: r.addr.latitude,
        lng: r.addr.longitude,
        title: r.merchant.shop_name,
        subtitle: `${r.openStatus.label} · ${r.availability} · ${formatPHP(r.product.regular_price)}`,
        variant: r.openStatus.isOpen ? 'pharmacy_open' : 'pharmacy_closed',
      });
    });

    // When showing all medicines (blank search), also pin approved pharmacies with 0 listed products yet
    if (searchQuery.trim() === '' && selectedAvailability === 'all') {
      approvedStoresList.forEach((s) => {
        if (!s.addr || seen.has(s.merchant.merchant_id)) return;
        seen.add(s.merchant.merchant_id);
        list.push({
          id: `m-${s.merchant.merchant_id}`,
          lat: s.addr.latitude,
          lng: s.addr.longitude,
          title: s.merchant.shop_name,
          subtitle: `${s.openStatus.label} · Store Pin Active (${s.listedCount} items)`,
          variant: s.openStatus.isOpen ? 'pharmacy_open' : 'pharmacy_closed',
        });
      });
    }

    return list;
  }, [locatorResults, approvedStoresList, searchQuery, selectedAvailability]);

  const handleModalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setRxError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await readPrescriptionFile(file);
    if (!res.ok) {
      setRxError(res.error);
      return;
    }
    setRxFileName(res.fileName);
    setRxFileType(res.fileType);
    setRxPreviewUrl(res.previewUrl);
  };

  const handleUseSampleRx = (productName: string) => {
    setRxError(null);
    const fullName = `${currentUser.first_name} ${currentUser.last_name}`;
    setDoctorName('Dr. Josefa Navarro, MD');
    setLicenseNo('PRC-0114892');
    setRxFileName('olongapo_rx_navarro.png');
    setRxFileType('png');
    setRxPreviewUrl(buildOlongapoSampleRxSvg(fullName, productName));
  };

  const handleBuyOnline = (product: Product, replaceCart = false) => {
    setFeedback(null);
    if (selectedProduct && selectedProduct.product_id === product.product_id && product.requires_prescription && rxFileName && rxPreviewUrl) {
      setDraftRxProof({
        patient_name: `${currentUser.first_name} ${currentUser.last_name}`,
        doctor_name: doctorName.trim() || 'Dr. Josefa Navarro, MD',
        license_no: licenseNo.trim() || 'PRC-0114892',
        date_issued: new Date().toISOString().slice(0, 10),
        file_name: rxFileName,
        file_type: rxFileType,
        file_preview_url: rxPreviewUrl,
      });
    }
    const res = addToCart(product.product_id, 1, replaceCart);
    if (!res.ok) {
      if (res.data?.conflictMerchantName) {
        setConflictPrompt({
          productId: product.product_id,
          otherMerchantName: res.data.conflictMerchantName,
        });
        return;
      }
      setFeedback(res.error || 'Could not add item to cart.');
      return;
    }
    setSelectedProduct(null);
    setConflictPrompt(null);
    onOpenCart();
  };

  const openPharmacyStorefront = (merchantId: number) => {
    setSelectedMarkerId(`m-${merchantId}`);
    setVisitPharmacyId(merchantId);
    setStorefrontNotice(null);
    setStorefrontMerchantId(merchantId);
  };

  const handleAddToCartFromStorefront = (product: Product, openCartImmediately = false) => {
    if (openCartImmediately) {
      handleBuyOnline(product, false);
      return;
    }
    setStorefrontNotice(null);
    const res = addToCart(product.product_id, 1, false);
    if (!res.ok) {
      if (res.data?.conflictMerchantName) {
        setConflictPrompt({
          productId: product.product_id,
          otherMerchantName: res.data.conflictMerchantName,
        });
        return;
      }
      setStorefrontNotice(res.error || 'Could not add item to cart.');
      return;
    }
    setStorefrontNotice(`Added 1x ${product.name} to your cart.`);
  };

  const quickQueries = ['Paracetamol 500mg', 'Amoxicillin 500mg', 'First Aid', 'ORS', 'KN95'];

  const visitRow = useMemo(() => {
    if (!visitPharmacyId) return null;
    const matchedResult = locatorResults.find((r) => r.merchant.merchant_id === visitPharmacyId);
    if (matchedResult) return matchedResult;
    const storeOnly = approvedStoresList.find((s) => s.merchant.merchant_id === visitPharmacyId);
    if (!storeOnly) return null;
    return {
      ...storeOnly,
      product: null,
    };
  }, [visitPharmacyId, locatorResults, approvedStoresList]);

  return (
    <div className="space-y-8">
      {/* Split Hero & Instant Medicine Search */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="medex-glass rounded-3xl border overflow-hidden"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Olongapo City Pharmacy Locator &amp; Live Medicine Availability</span>
              </p>
              <h1
                className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Find available medicines across Olongapo City pharmacies before you travel
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                Covering Olongapo City barangays—compare live stock status, operating hours, and
                prices across registered pharmacies, then buy online for delivery or visit directly.
              </p>
            </div>

            {/* Search Input */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search medicines"
                  placeholder="Search medicine (e.g. Paracetamol 500mg, Amoxicillin)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-teal-600"
                />
              </div>
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('store')}
                className="medex-btn-lift rounded-xl bg-teal-600 px-5 py-3 text-sm font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
              >
                Browse Full Store
              </motion.button>
            </div>

            {/* Quick Search Filters + Barangay Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Common searches:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedAvailability('all');
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  searchQuery.trim() === ''
                    ? 'bg-slate-900 dark:bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All Pharmacies
              </button>
              {quickQueries.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setSearchQuery(term)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    searchQuery.toLowerCase() === term.toLowerCase()
                      ? 'bg-slate-900 dark:bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {term}
                </button>
              ))}
              <select
                aria-label="Filter by Olongapo City Barangay"
                value={selectedBarangayId}
                onChange={(e) =>
                  setSelectedBarangayId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="ml-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-100"
              >
                <option value="all">All Olongapo Barangays</option>
                {state.barangays.map((b) => (
                  <option key={b.barangay_id} value={b.barangay_id}>
                    Brgy. {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[220px] bg-slate-100 dark:bg-slate-800">
            <img
              src={HERO_PHARMACY_IMAGE}
              alt="Participating MedEx Olongapo community pharmacy counter"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </motion.section>

      {feedback && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          {feedback}
        </div>
      )}

      {/* Results + Map Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Participating Pharmacies (
                {locatorResults.length +
                  (searchQuery.trim() === '' && selectedAvailability === 'all'
                    ? approvedStoresList.filter((s) => s.listedCount === 0).length
                    : 0)}
                )
              </h2>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Availability reflects each pharmacy&apos;s latest recorded inventory.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setSelectedAvailability('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  selectedAvailability === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All Results
              </button>
              <button
                type="button"
                onClick={() => setSelectedAvailability('in_stock')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  selectedAvailability === 'in_stock'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                In Stock Only
              </button>
            </div>
          </div>

          {locatorResults.length === 0 &&
          !(searchQuery.trim() === '' && selectedAvailability === 'all' && approvedStoresList.length > 0) ? (
            <div className="medex-glass rounded-2xl border p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                No matching medicines found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Try clearing filters or searching another medicine name.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedAvailability('all');
                }}
                className="rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-teal-500"
              >
                Show All Pharmacies &amp; Medicines
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {searchQuery.trim() === '' &&
                selectedAvailability === 'all' &&
                approvedStoresList
                  .filter((s) => s.listedCount === 0)
                  .map(({ merchant, addr, brgy, openStatus, ratingSummary }) => (
                    <article
                      key={`store-${merchant.merchant_id}`}
                      className="medex-glass rounded-2xl border p-5 hover:border-teal-300 dark:hover:border-teal-700"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-teal-700 dark:text-teal-400">
                              Approved Partner Pharmacy
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Store Pin Active</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                              {merchant.shop_name}
                            </h3>
                            {ratingSummary.count > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              {addr?.street}, Brgy. {brgy?.name || 'Olongapo City'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              <strong
                                className={
                                  openStatus.isOpen
                                    ? 'text-teal-700 dark:text-teal-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }
                              >
                                {openStatus.label}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMarkerId(`m-${merchant.merchant_id}`);
                              setVisitPharmacyId(merchant.merchant_id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Pin on Map
                          </button>
                          <button
                            type="button"
                            onClick={() => openPharmacyStorefront(merchant.merchant_id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                          >
                            <Store className="w-3.5 h-3.5" />
                            Visit Pharmacy
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
              {locatorResults.map(
                ({ product, merchant, addr, brgy, openStatus, availability, ratingSummary, categoryName }, idx) => {
                  const isOut = availability === 'Out of Stock';
                  const availTextColor =
                    availability === 'Available'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : availability === 'Low Stock'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400';

                  return (
                    <motion.article
                      key={product.product_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.2) }}
                      whileHover={{ y: -2 }}
                      className="medex-card-hover medex-glass rounded-2xl border p-5 hover:border-teal-300 dark:hover:border-teal-700"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>{categoryName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{product.dosage_strength || product.unit}</span>
                            {product.requires_prescription && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                  {draftRxProof ? 'Rx Proof Ready' : 'Doctor Rx Proof Required'}
                                </span>
                              </>
                            )}
                          </div>

                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                            {product.name}
                          </h3>

                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                            <span>{merchant.shop_name}</span>
                            {ratingSummary.count > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              {addr?.street}, Brgy. {brgy?.name || 'Olongapo City'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              <strong className={openStatus.isOpen ? 'text-teal-700 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'}>
                                {openStatus.label}
                              </strong>
                              {!openStatus.isOpen && ` (${openStatus.nextOpeningText})`}
                            </span>
                          </div>
                        </div>

                        <div className="sm:text-right shrink-0 space-y-1">
                          <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                            {formatPHP(product.regular_price)}
                          </div>
                          <div className={`text-xs font-semibold ${availTextColor}`}>
                            {availability} ({product.stock_quantity} left)
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(product)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[38px]"
                          >
                            {product.requires_prescription ? 'Details & Rx Proof' : 'Medicine Details'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPharmacyStorefront(merchant.merchant_id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-3 py-2 text-xs font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 min-h-[38px]"
                          >
                            <Store className="w-3.5 h-3.5" />
                            Visit Pharmacy
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({
                                merchantId: merchant.merchant_id,
                                productId: product.product_id,
                                searchId: searchQuery.trim()
                                  ? `loc-${searchQuery.trim().toLowerCase().replace(/\s+/g, '-')}`
                                  : null,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-700 dark:hover:text-red-400 min-h-[38px]"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            Report Wrong Info
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isOut}
                          onClick={() => handleBuyOnline(product)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors min-h-[38px] ${
                            isOut
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                              : 'bg-teal-600 text-white hover:bg-teal-700'
                          }`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          {isOut ? 'Out of Stock' : 'Buy Online'}
                        </button>
                      </div>
                    </motion.article>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* Sticky Leaflet Map Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
          <div className="medex-glass rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Olongapo Pharmacy Map View
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Teal: Open · Gray: Closed
              </span>
            </div>
            <LeafletMap
              markers={mapMarkers}
              selectedMarkerId={selectedMarkerId}
              onSelectMarker={(id) => {
                setSelectedMarkerId(id);
                const mId = Number(id.replace('m-', ''));
                if (!Number.isNaN(mId)) setVisitPharmacyId(mId);
              }}
              heightClass="h-80 lg:h-[420px]"
              ariaLabel="Participating Pharmacies OpenStreetMap"
            />
            {visitRow && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {visitRow.merchant.shop_name}
                    </span>
                    {visitRow.ratingSummary.count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {visitRow.ratingSummary.average.toFixed(1)} ({visitRow.ratingSummary.count})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisitPharmacyId(null)}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {visitRow.addr?.street}, Brgy. {visitRow.brgy?.name}, {visitRow.brgy?.city}
                </p>
                {visitRow.addr?.landmark && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Landmark: {visitRow.addr.landmark}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                    Contact: <span className="font-mono">{visitRow.merchant.contact_no}</span> ·{' '}
                    {visitRow.openStatus.label}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setReportTarget({
                        merchantId: visitRow.merchant.merchant_id,
                        productId: visitRow.product?.product_id ?? null,
                        searchId: searchQuery.trim()
                          ? `loc-${searchQuery.trim().toLowerCase().replace(/\s+/g, '-')}`
                          : null,
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
                  >
                    <Flag className="w-3 h-3" />
                    Report Store Info Issue
                  </button>
                </div>
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Browse full catalog, star ratings &amp; anonymous reviews
                  </span>
                  <button
                    type="button"
                    onClick={() => openPharmacyStorefront(visitRow.merchant.merchant_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap shrink-0"
                  >
                    <Store className="w-3.5 h-3.5" />
                    Visit Pharmacy Storefront
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Visit Pharmacy E-Commerce Storefront Drawer */}
      <AnimatePresence>
        {storefrontMerchantId !== null && (
          <PharmacyStorefrontPanel
            merchantId={storefrontMerchantId}
            distanceKm={merchantDistanceKmById.get(storefrontMerchantId)}
            onClose={() => setStorefrontMerchantId(null)}
            onPinOnMap={(mId) => {
              setSelectedMarkerId(`m-${mId}`);
              setVisitPharmacyId(mId);
            }}
            onSelectProductDetails={(prod) => setSelectedProduct(prod)}
            onAddToCart={handleAddToCartFromStorefront}
            onOpenCart={onOpenCart}
            onReportStore={(mId) =>
              setReportTarget({
                merchantId: mId,
                productId: null,
                searchId: searchQuery.trim()
                  ? `loc-${searchQuery.trim().toLowerCase().replace(/\s+/g, '-')}`
                  : null,
              })
            }
            storeNotice={storefrontNotice}
            onClearStoreNotice={() => setStorefrontNotice(null)}
            hasNestedModalOpen={
              selectedProduct !== null || conflictPrompt !== null || reportTarget !== null
            }
          />
        )}
      </AnimatePresence>

      {/* Medicine Details & Rx Proof Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              <div className="relative h-44 bg-slate-100 dark:bg-slate-800 shrink-0">
                <img
                  src={selectedProduct.image_path}
                  alt={selectedProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  aria-label="Close medicine details"
                  className="absolute top-3 right-3 rounded-lg bg-white/90 dark:bg-slate-900/90 p-2 text-slate-700 dark:text-slate-200 hover:bg-white shadow-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {state.categories.find((c) => c.category_id === selectedProduct.category_id)?.name}{' '}
                    · {selectedProduct.unit}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {selectedProduct.name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                    {selectedProduct.description}
                  </p>
                </div>

                {selectedProduct.requires_prescription && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                          Doctor&apos;s Prescription Proof (Controlled Medicine)
                        </p>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                          Upload your doctor&apos;s prescription photo to confirm buyer legitimacy.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseSampleRx(selectedProduct.name)}
                        className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        Use Sample Olongapo Rx
                      </button>
                    </div>

                    {rxError && (
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">{rxError}</p>
                    )}

                    {rxPreviewUrl ? (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-teal-700 dark:text-teal-400 truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{rxFileName}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setRxFileName('');
                              setRxPreviewUrl('');
                              setDraftRxProof(null);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                        {rxFileType !== 'pdf' && (
                          <img
                            src={rxPreviewUrl}
                            alt="Prescription proof preview"
                            className="w-full max-h-36 object-contain rounded-md bg-slate-50 dark:bg-slate-800"
                          />
                        )}
                      </div>
                    ) : (
                      <label className="block rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 p-3 text-center cursor-pointer transition-colors">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleModalFileUpload}
                          className="sr-only"
                        />
                        <Upload className="w-4 h-4 mx-auto text-teal-700 dark:text-teal-400 mb-1" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block">
                          Upload Prescription Photo or PDF
                        </span>
                      </label>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={doctorName}
                        onChange={(e) => setDoctorName(e.target.value)}
                        placeholder="Prescribing Doctor"
                        aria-label="Prescribing Doctor"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={licenseNo}
                        onChange={(e) => setLicenseNo(e.target.value)}
                        placeholder="PRC License No."
                        aria-label="PRC License Number"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-100 dark:border-slate-800 py-3">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Standard Unit Price</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                      {formatPHP(selectedProduct.regular_price)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">
                      Purchase Allowance
                    </span>
                    <span className="font-mono text-sm font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                      Max {selectedProduct.purchase_limit} per order
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const prod = selectedProduct;
                      setSelectedProduct(null);
                      setReportTarget({
                        merchantId: prod.merchant_id,
                        productId: prod.product_id,
                        searchId: searchQuery.trim()
                          ? `loc-${searchQuery.trim().toLowerCase().replace(/\s+/g, '-')}`
                          : null,
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Report Wrong Info
                  </button>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={selectedProduct.stock_quantity <= 0}
                      onClick={() => handleBuyOnline(selectedProduct)}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400"
                    >
                      {selectedProduct.requires_prescription && rxPreviewUrl
                        ? 'Attach Proof & Buy Online'
                        : 'Buy Online'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single-Merchant Cart Conflict Prompt */}
      {conflictPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Start a new cart?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your cart currently holds items from <strong>{conflictPrompt.otherMerchantName}</strong>.
              Orders belong to one pharmacy at a time.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflictPrompt(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                Keep Current Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  const prod = state.products.find((p) => p.product_id === conflictPrompt.productId);
                  if (prod) handleBuyOnline(prod, true);
                }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
              >
                Replace Cart
              </button>
            </div>
          </div>
        </div>
      )}
      <ReportProblemModal
        open={reportTarget !== null}
        source="locator"
        merchantId={reportTarget?.merchantId ?? null}
        productId={reportTarget?.productId ?? null}
        searchId={reportTarget?.searchId ?? null}
        onClose={() => setReportTarget(null)}
        onOpenMyFeedback={() => setActiveTab('feedback')}
      />
    </div>
  );
};

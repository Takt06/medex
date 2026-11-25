import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileCheck2,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Product, ProductSortOption, ProductStockFilter } from '../../types/medex';
import {
  OLONGAPO_DEFAULT_CENTER,
  computePharmacyRatingSummary,
  formatPHP,
  getApprovedStorefrontMerchantIds,
  getAvailabilityStatus,
  getMerchantOpenStatus,
  haversineDistanceKm,
  sortAndFilterProducts,
} from '../../utils/medexRules';
import { buildOlongapoSampleRxSvg, readPrescriptionFile } from '../../utils/sampleRx';

interface StoreViewProps {
  onOpenCart: () => void;
}

export const StoreView: React.FC<StoreViewProps> = ({ onOpenCart }) => {
  const {
    state,
    currentUser,
    draftRxProof,
    setDraftRxProof,
    postAuthNotice,
    clearPostAuthNotice,
    addToCart,
  } = useMedEx();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>('all');
  const [sortBy, setSortBy] = useState<ProductSortOption>('featured');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailProductId, setDetailProductId] = useState<number | null>(null);
  const setDetailProduct = (prod: Product | null) =>
    setDetailProductId(prod ? prod.product_id : null);
  const [detailQty, setDetailQty] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [rxError, setRxError] = useState<string | null>(null);

  useEffect(() => {
    if (postAuthNotice) {
      setNotice(postAuthNotice);
      clearPostAuthNotice();
    }
  }, [postAuthNotice, clearPostAuthNotice]);

  // Local Rx draft editor inside Product Details modal
  const [doctorName, setDoctorName] = useState(draftRxProof?.doctor_name || '');
  const [licenseNo, setLicenseNo] = useState(draftRxProof?.license_no || '');
  const [rxFileName, setRxFileName] = useState(draftRxProof?.file_name || '');
  const [rxFileType, setRxFileType] = useState<'jpg' | 'png' | 'pdf'>(draftRxProof?.file_type || 'png');
  const [rxPreviewUrl, setRxPreviewUrl] = useState(draftRxProof?.file_preview_url || '');

  const [conflictPrompt, setConflictPrompt] = useState<{
    productId: number;
    qty: number;
    otherMerchantName: string;
  } | null>(null);

  const approvedMerchantIds = useMemo(
    () => getApprovedStorefrontMerchantIds(state.merchants, state.users),
    [state.merchants, state.users]
  );

  const detailProduct = useMemo(
    () =>
      detailProductId === null
        ? null
        : state.products.find(
            (p) =>
              p.product_id === detailProductId &&
              p.is_listed &&
              !p.is_archived &&
              approvedMerchantIds.has(p.merchant_id)
          ) ?? null,
    [detailProductId, state.products, approvedMerchantIds]
  );

  useEffect(() => {
    if (detailProductId !== null) {
      setRxError(null);
      setDoctorName(draftRxProof?.doctor_name || '');
      setLicenseNo(draftRxProof?.license_no || '');
      setRxFileName(draftRxProof?.file_name || '');
      setRxFileType(draftRxProof?.file_type || 'png');
      setRxPreviewUrl(draftRxProof?.file_preview_url || '');
    }
  }, [detailProductId, draftRxProof]);

  const approvedMerchants = useMemo(
    () => state.merchants.filter((m) => approvedMerchantIds.has(m.merchant_id)),
    [state.merchants, approvedMerchantIds]
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

  const merchantNameById = useMemo(
    () => new Map(state.merchants.map((m) => [m.merchant_id, m.shop_name])),
    [state.merchants]
  );

  const categoryNameById = useMemo(
    () => new Map(state.categories.map((c) => [c.category_id, c.name])),
    [state.categories]
  );

  const visibleProducts = useMemo(
    () =>
      sortAndFilterProducts(state.products, {
        approvedMerchantIds,
        selectedCategory: selectedCategoryId,
        selectedMerchantId,
        stockFilter,
        sortBy,
        searchQuery,
        merchantDistanceKmById,
        merchantNameById,
        categoryNameById,
      }),
    [
      state.products,
      approvedMerchantIds,
      selectedCategoryId,
      selectedMerchantId,
      stockFilter,
      sortBy,
      searchQuery,
      merchantDistanceKmById,
      merchantNameById,
      categoryNameById,
    ]
  );

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

  const persistDraftRxIfPresent = () => {
    if (rxFileName && rxPreviewUrl) {
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
  };

  const handleAdd = (product: Product, qty: number, replace = false, openCheckoutAfter = false) => {
    setNotice(null);
    if (detailProduct && detailProduct.product_id === product.product_id && product.requires_prescription) {
      persistDraftRxIfPresent();
    }
    const res = addToCart(product.product_id, qty, replace);
    if (!res.ok) {
      if (res.data?.conflictMerchantName) {
        setConflictPrompt({
          productId: product.product_id,
          qty,
          otherMerchantName: res.data.conflictMerchantName,
        });
        return;
      }
      setNotice(res.error || 'Cannot add item.');
      return;
    }
    setConflictPrompt(null);
    setDetailProduct(null);
    setNotice(
      product.requires_prescription && (rxFileName || draftRxProof)
        ? `Added ${qty}x ${product.name} with prescription proof attached.`
        : `Added ${qty}x ${product.name} to cart.`
    );
    if (openCheckoutAfter) {
      onOpenCart();
    }
  };

  return (
    <div className="space-y-6">
      {/* Store Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            MedEx Pharmacy Store
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Browse verified Olongapo City pharmacies anytime. Controlled medicines display clear
            doctor prescription proof requirements.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCart}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-teal-500 whitespace-nowrap shrink-0 self-start"
        >
          <ShoppingBag className="w-4 h-4" />
          Review Cart
        </button>
      </div>

      {/* Category Tabs, Search, Stock Availability & Sort Controls */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 medex-glass-subtle border rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedCategoryId === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Categories
            </button>
            {state.categories.map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.category_id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  selectedCategoryId === cat.category_id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine or pharmacy..."
              aria-label="Search store medicines"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 medex-glass-subtle border rounded-xl px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="store-merchant-filter"
                className="text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Pharmacy:
              </label>
              <select
                id="store-merchant-filter"
                value={selectedMerchantId}
                onChange={(e) =>
                  setSelectedMerchantId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Verified Pharmacies</option>
                {approvedMerchants.map((m) => (
                  <option key={m.merchant_id} value={m.merchant_id}>
                    {m.shop_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label
                htmlFor="store-stock-filter"
                className="text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Stock:
              </label>
              <select
                id="store-stock-filter"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as ProductStockFilter)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Availability</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="otc">OTC Only</option>
                <option value="rx">Rx Required</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="store-sort-select"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Sort:</span>
            </label>
            <select
              id="store-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ProductSortOption)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
            >
              <option value="featured">Featured</option>
              <option value="price_asc">Price: Lowest to Highest</option>
              <option value="price_desc">Price: Highest to Lowest</option>
              <option value="name_asc">Product Name: A–Z</option>
              <option value="name_desc">Product Name: Z–A</option>
              <option value="nearest">Nearest Pharmacy</option>
            </select>
          </div>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 px-4 py-2.5 text-xs font-medium text-teal-900 dark:text-teal-100 flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={onOpenCart}
            className="font-semibold underline ml-3 whitespace-nowrap"
          >
            Open Cart
          </button>
        </div>
      )}

      {/* 3-Column Product Grid */}
      {visibleProducts.length === 0 ? (
        <div className="medex-glass rounded-2xl border p-10 text-center space-y-3">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            No medicines match your current filters.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Adjust your category, pharmacy, stock availability, or search term to explore available items.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryId('all');
              setSelectedMerchantId('all');
              setStockFilter('all');
              setSortBy('featured');
              setSearchQuery('');
            }}
            className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            Reset Store Filters
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleProducts.map((product, idx) => {
          const merchant = state.merchants.find((m) => m.merchant_id === product.merchant_id)!;
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
          const catName =
            state.categories.find((c) => c.category_id === product.category_id)?.name || 'Medicines';
          const isOut = product.stock_quantity <= 0;

          return (
            <motion.article
              key={product.product_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.22) }}
              whileHover={{ y: -3 }}
              className="medex-card-hover medex-glass rounded-2xl border overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <img
                  src={product.image_path}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{catName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{merchant.shop_name}</span>
                    </div>
                    {ratingSummary.count > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                      </span>
                    )}
                  </div>

                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {product.name}
                  </h2>

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span
                      className={`font-semibold ${
                        availability === 'Available'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : availability === 'Low Stock'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {availability} ({product.stock_quantity})
                    </span>
                    {merchantDistanceKmById.has(product.merchant_id) && (
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 tabular-nums">
                        <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                        {merchantDistanceKmById.get(product.merchant_id)!.toFixed(1)} km away
                      </span>
                    )}
                    {!openStatus.isOpen && (
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 font-medium">
                        <Clock className="w-3 h-3" />
                        Closed ({openStatus.nextOpeningText})
                      </span>
                    )}
                  </div>

                  {product.requires_prescription && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/40 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                        <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                        {draftRxProof ? 'Rx Proof Ready' : 'Doctor Rx Proof Required'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailProduct(product);
                          setDetailQty(1);
                        }}
                        className="font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                      >
                        {draftRxProof ? 'View Proof' : 'Attach Proof'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatPHP(product.regular_price)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {product.unit} · Limit {product.purchase_limit}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailProduct(product);
                        setDetailQty(1);
                      }}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      disabled={isOut}
                      onClick={() => handleAdd(product, 1)}
                      aria-label={`Add ${product.name} to cart`}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
      )}

      {/* Product Details + Optional Pre-Attach Rx Proof Modal */}
      <AnimatePresence>
        {detailProduct && (
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
              className="w-full max-w-lg medex-glass rounded-2xl border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              <div className="relative h-44 bg-slate-100 dark:bg-slate-800 shrink-0">
                <img
                  src={detailProduct.image_path}
                  alt={detailProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setDetailProduct(null)}
                  aria-label="Close product details"
                  className="absolute top-3 right-3 rounded-lg bg-white/90 dark:bg-slate-900/90 p-2 text-slate-700 dark:text-slate-200 shadow-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {detailProduct.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {detailProduct.unit}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                    {detailProduct.description}
                  </p>
                </div>

                {detailProduct.requires_prescription && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                          Doctor&apos;s Prescription Proof (Controlled Medicine)
                        </p>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                          Attach a clear photo or PDF of your doctor&apos;s prescription to verify
                          legitimacy before pharmacist preparation.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseSampleRx(detailProduct.name)}
                        className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        Use Sample Olongapo Rx
                      </button>
                    </div>

                    {rxError && (
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                        {rxError}
                      </p>
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
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          JPG, PNG, or PDF (max 10 MB)
                        </span>
                      </label>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={doctorName}
                        onChange={(e) => setDoctorName(e.target.value)}
                        placeholder="Prescribing Doctor (e.g., Dr. Navarro)"
                        aria-label="Prescribing Doctor"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={licenseNo}
                        onChange={(e) => setLicenseNo(e.target.value)}
                        placeholder="PRC License No. (e.g., PRC-0114892)"
                        aria-label="PRC License Number"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-y border-slate-100 dark:border-slate-800 py-3">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Unit Price · Max {Math.max(1, detailProduct.purchase_limit || 1)} per order (
                      {detailProduct.stock_quantity} in stock)
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatPHP(detailProduct.regular_price)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      -
                    </button>
                    <span className="font-mono text-sm w-6 text-center text-slate-900 dark:text-white">
                      {detailQty}
                    </span>
                    <button
                      type="button"
                      disabled={
                        detailQty >=
                        Math.min(
                          detailProduct.stock_quantity,
                          Math.max(1, detailProduct.purchase_limit || 1)
                        )
                      }
                      onClick={() =>
                        setDetailQty((q) =>
                          Math.min(
                            detailProduct.stock_quantity,
                            Math.max(1, detailProduct.purchase_limit || 1),
                            q + 1
                          )
                        )
                      }
                      aria-label="Increase quantity"
                      className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={detailProduct.stock_quantity <= 0}
                    onClick={() => handleAdd(detailProduct, detailQty, false, false)}
                    className="flex-1 rounded-lg border border-teal-600 dark:border-teal-500 py-2.5 px-4 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/60 disabled:opacity-40"
                  >
                    {detailProduct.stock_quantity <= 0 ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                  <button
                    type="button"
                    disabled={detailProduct.stock_quantity <= 0}
                    onClick={() => handleAdd(detailProduct, detailQty, false, true)}
                    className="flex-1 rounded-lg bg-teal-600 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400"
                  >
                    {detailProduct.requires_prescription && rxPreviewUrl
                      ? 'Attach Proof & Checkout'
                      : 'Proceed to Checkout'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              Your cart already holds items from <strong>{conflictPrompt.otherMerchantName}</strong>.
              Replace it with this pharmacy&apos;s item?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflictPrompt(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const prod = state.products.find((p) => p.product_id === conflictPrompt.productId);
                  if (prod) handleAdd(prod, conflictPrompt.qty, true);
                }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
              >
                Start New Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

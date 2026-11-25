import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpDown,
  Award,
  CheckCircle2,
  Clock,
  EyeOff,
  FileCheck2,
  Flag,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  UserCheck,
  X,
} from 'lucide-react';
import { DEFAULT_CATEGORY_IMAGES, HERO_PHARMACY_IMAGE } from '../../data/seedData';
import { useMedEx } from '../../context/MedExContext';
import type { Product, ProductSortOption, ProductStockFilter } from '../../types/medex';
import {
  buildPharmacyStorefrontReviews,
  buildPharmacyWeeklySchedule,
  computePharmacyRatingBreakdown,
  formatPHP,
  getAvailabilityStatus,
  getMerchantOpenStatus,
  sortAndFilterProducts,
} from '../../utils/medexRules';

type StorefrontTab = 'products' | 'reviews' | 'info';
type ReviewAnonymityFilter = 'all' | 'anonymous' | 'named';

interface PharmacyStorefrontPanelProps {
  merchantId: number | null;
  distanceKm?: number;
  onClose: () => void;
  onPinOnMap: (merchantId: number) => void;
  onSelectProductDetails: (product: Product) => void;
  onAddToCart: (product: Product, openCartImmediately?: boolean) => void;
  onOpenCart: () => void;
  onReportStore: (merchantId: number) => void;
  storeNotice?: string | null;
  onClearStoreNotice?: () => void;
  hasNestedModalOpen?: boolean;
}

export const PharmacyStorefrontPanel: React.FC<PharmacyStorefrontPanelProps> = ({
  merchantId,
  distanceKm,
  onClose,
  onPinOnMap,
  onSelectProductDetails,
  onAddToCart,
  onOpenCart,
  onReportStore,
  storeNotice,
  onClearStoreNotice,
  hasNestedModalOpen = false,
}) => {
  const { state, currentUser, activeCart, draftRxProof } = useMedEx();

  const [activeTab, setActiveTab] = useState<StorefrontTab>('products');
  const [storeSearch, setStoreSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>('all');
  const [sortBy, setSortBy] = useState<ProductSortOption>('featured');

  const [anonymityFilter, setAnonymityFilter] = useState<ReviewAnonymityFilter>('all');
  const [starFilter, setStarFilter] = useState<'all' | 1 | 2 | 3 | 4 | 5>('all');
  const [withReplyOnly, setWithReplyOnly] = useState(false);

  // Reset store-local filters when switching pharmacies
  useEffect(() => {
    if (merchantId === null) return;
    setActiveTab('products');
    setStoreSearch('');
    setSelectedCategoryId('all');
    setStockFilter('all');
    setSortBy('featured');
    setAnonymityFilter('all');
    setStarFilter('all');
    setWithReplyOnly(false);
  }, [merchantId]);

  useEffect(() => {
    if (merchantId === null || hasNestedModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [merchantId, hasNestedModalOpen, onClose]);

  const merchant = useMemo(
    () =>
      merchantId === null
        ? null
        : state.merchants.find((m) => m.merchant_id === merchantId) ?? null,
    [merchantId, state.merchants]
  );

  const addr = useMemo(
    () =>
      merchant
        ? state.addresses.find((a) => a.address_id === merchant.shop_address_id) ?? null
        : null,
    [merchant, state.addresses]
  );

  const barangay = useMemo(
    () =>
      addr
        ? state.barangays.find((b) => b.barangay_id === addr.barangay_id) ?? null
        : null,
    [addr, state.barangays]
  );

  const merchantHours = useMemo(
    () =>
      merchant
        ? state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id)
        : [],
    [merchant, state.merchantHours]
  );

  const openStatus = useMemo(
    () =>
      merchant
        ? getMerchantOpenStatus(merchant, merchantHours)
        : { isOpen: false, label: 'Closed', nextOpeningText: '' },
    [merchant, merchantHours]
  );

  const weeklySchedule = useMemo(
    () =>
      merchant
        ? buildPharmacyWeeklySchedule(
            merchantHours,
            merchant.is_24_hours,
            merchant.is_temporarily_closed
          )
        : [],
    [merchant, merchantHours]
  );

  const allStoreProducts = useMemo(() => {
    if (!merchant) return [];
    return state.products.filter(
      (p) => p.merchant_id === merchant.merchant_id && p.is_listed && !p.is_archived
    );
  }, [merchant, state.products]);

  const inStockCount = useMemo(
    () => allStoreProducts.filter((p) => p.stock_quantity > 0).length,
    [allStoreProducts]
  );

  const availableCategories = useMemo(() => {
    const idsWithItems = new Set(allStoreProducts.map((p) => p.category_id));
    return state.categories.filter((c) => idsWithItems.has(c.category_id));
  }, [allStoreProducts, state.categories]);

  const categoryNameById = useMemo(
    () => new Map(state.categories.map((c) => [c.category_id, c.name])),
    [state.categories]
  );

  const approvedMerchantSet = useMemo(
    () => (merchant ? new Set([merchant.merchant_id]) : new Set<number>()),
    [merchant]
  );

  const filteredProducts = useMemo(() => {
    if (!merchant) return [];
    return sortAndFilterProducts(state.products, {
      approvedMerchantIds: approvedMerchantSet,
      selectedMerchantId: merchant.merchant_id,
      selectedCategory: selectedCategoryId,
      stockFilter,
      sortBy,
      searchQuery: storeSearch,
      categoryNameById,
    });
  }, [
    merchant,
    state.products,
    approvedMerchantSet,
    selectedCategoryId,
    stockFilter,
    sortBy,
    storeSearch,
    categoryNameById,
  ]);

  const ratingBreakdown = useMemo(
    () =>
      merchant
        ? computePharmacyRatingBreakdown(state.pharmacyReviews, merchant.merchant_id)
        : {
            average: 0,
            count: 0,
            anonymousCount: 0,
            namedCount: 0,
            countsByStar: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            topTags: [],
          },
    [merchant, state.pharmacyReviews]
  );

  const reviewEntries = useMemo(
    () =>
      merchant
        ? buildPharmacyStorefrontReviews(
            state.pharmacyReviews,
            state.users,
            merchant.merchant_id,
            {
              anonymity: anonymityFilter,
              starFilter,
              withReplyOnly,
            }
          )
        : [],
    [merchant, state.pharmacyReviews, state.users, anonymityFilter, starFilter, withReplyOnly]
  );

  if (merchantId === null || !merchant) return null;

  const isResident = currentUser.role === 'resident';
  const totalCartUnits = activeCart.items.reduce((sum, item) => sum + item.quantity, 0);
  const cartQuantityByProduct = new Map(activeCart.items.map((i) => [i.product_id, i.quantity]));

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="storefront-panel-title"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-4xl bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Utility Bar */}
        <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[38px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Map</span>
            <span className="sm:hidden">Back</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                onPinOnMap(merchant.merchant_id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[38px]"
            >
              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span className="hidden sm:inline">View Pin on Map</span>
              <span className="sm:hidden">Map Pin</span>
            </button>

            <button
              type="button"
              onClick={() => onReportStore(merchant.merchant_id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-700 dark:hover:text-red-400 min-h-[38px]"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Report Store Info</span>
              <span className="sm:hidden">Report</span>
            </button>

            {isResident && (
              <button
                type="button"
                onClick={onOpenCart}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px] tabular-nums"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Cart ({totalCartUnits})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close pharmacy storefront"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white min-h-[38px] min-w-[38px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Storefront Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Storefront Hero Section */}
          <section className="relative border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70">
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-8 p-5 sm:p-6 space-y-3">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Olongapo Pharmacy
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span
                    className={`font-semibold ${
                      openStatus.isOpen
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {openStatus.label}
                  </span>
                  {!openStatus.isOpen && openStatus.nextOpeningText && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {openStatus.nextOpeningText}
                      </span>
                    </>
                  )}
                  {distanceKm !== undefined && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {distanceKm.toFixed(1)} km away
                      </span>
                    </>
                  )}
                </div>

                <div>
                  <h2
                    id="storefront-panel-title"
                    className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight"
                  >
                    {merchant.shop_name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      {addr?.street || 'Olongapo City'}, Brgy. {barangay?.name || 'Olongapo'},{' '}
                      {barangay?.city || 'Olongapo City'}
                    </span>
                    {addr?.landmark && (
                      <>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Landmark: {addr.landmark}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {/* Pharmacist + Contact + Quick Rating Summary */}
                <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>
                      RPh {merchant.pharmacist_name}{' '}
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        ({merchant.pharmacist_license_no})
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono">{merchant.contact_no}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reviews')}
                    className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 hover:underline tabular-nums"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {ratingBreakdown.count > 0 ? (
                      <span>
                        {ratingBreakdown.average.toFixed(1)} ({ratingBreakdown.count}{' '}
                        {ratingBreakdown.count === 1 ? 'review' : 'reviews'}
                        {ratingBreakdown.anonymousCount > 0
                          ? ` · ${ratingBreakdown.anonymousCount} anonymous`
                          : ''}
                        )
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">No ratings yet</span>
                    )}
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 relative min-h-[140px] md:min-h-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <img
                  src={HERO_PHARMACY_IMAGE}
                  alt={`${merchant.shop_name} storefront counter`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Storefront Section Tabs */}
            <div
              className="px-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-1 overflow-x-auto"
              role="tablist"
              aria-label="Pharmacy storefront sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'products'}
                onClick={() => setActiveTab('products')}
                className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'products'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  Store Products ({allStoreProducts.length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'reviews'}
                onClick={() => setActiveTab('reviews')}
                className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'reviews'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  Ratings &amp; Reviews ({ratingBreakdown.count})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'info'}
                onClick={() => setActiveTab('info')}
                className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'info'
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Store Hours &amp; Info</span>
              </button>
            </div>
          </section>

          {/* Notice Banner (e.g. Added to cart inside Storefront) */}
          {storeNotice && (
            <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-teal-900 dark:text-teal-100">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                {storeNotice}
              </span>
              <div className="flex items-center gap-3">
                {isResident && (
                  <button
                    type="button"
                    onClick={onOpenCart}
                    className="font-semibold text-teal-700 dark:text-teal-300 underline whitespace-nowrap"
                  >
                    Open Cart &amp; Checkout →
                  </button>
                )}
                {onClearStoreNotice && (
                  <button
                    type="button"
                    onClick={onClearStoreNotice}
                    className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: PRODUCTS CATALOG */}
          {activeTab === 'products' && (
            <div className="p-4 sm:p-6 space-y-5">
              {/* Store Filter Toolbar */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder={`Search products inside ${merchant.shop_name}...`}
                      aria-label={`Search products inside ${merchant.shop_name}`}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter pharmacy stock"
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value as ProductStockFilter)}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100"
                    >
                      <option value="all">All Stock ({allStoreProducts.length})</option>
                      <option value="in_stock">In Stock ({inStockCount})</option>
                      <option value="low_stock">Low Stock</option>
                      <option value="otc">OTC Only</option>
                      <option value="rx">Rx Required</option>
                    </select>

                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2">
                      <ArrowUpDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <select
                        aria-label="Sort store products"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as ProductSortOption)}
                        className="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                      >
                        <option value="featured">Featured</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="name_asc">Name: A–Z</option>
                        <option value="name_desc">Name: Z–A</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Category Filter Tabs */}
                {availableCategories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId('all')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedCategoryId === 'all'
                          ? 'bg-slate-900 dark:bg-teal-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      All Categories
                    </button>
                    {availableCategories.map((cat) => (
                      <button
                        key={cat.category_id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.category_id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedCategoryId === cat.category_id
                            ? 'bg-slate-900 dark:bg-teal-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-10 text-center space-y-3">
                  <Store className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {allStoreProducts.length === 0
                      ? 'This pharmacy has not listed any products yet.'
                      : 'No products in this pharmacy match your current filters.'}
                  </p>
                  {allStoreProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStoreSearch('');
                        setSelectedCategoryId('all');
                        setStockFilter('all');
                        setSortBy('featured');
                      }}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      Reset Store Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => {
                    const availability = getAvailabilityStatus(
                      product.stock_quantity,
                      product.low_stock_threshold
                    );
                    const catName =
                      categoryNameById.get(product.category_id) || 'Medicines';
                    const isOut = product.stock_quantity <= 0;
                    const qtyInCart = cartQuantityByProduct.get(product.product_id) || 0;

                    return (
                      <article
                        key={product.product_id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                      >
                        <div>
                          <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <img
                              src={product.image_path || DEFAULT_CATEGORY_IMAGES[product.category_id] || HERO_PHARMACY_IMAGE}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const fallback =
                                  DEFAULT_CATEGORY_IMAGES[product.category_id] || HERO_PHARMACY_IMAGE;
                                if (e.currentTarget.src !== fallback) {
                                  e.currentTarget.src = fallback;
                                }
                              }}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="p-4 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{catName}</span>
                              {product.dosage_strength && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{product.dosage_strength}</span>
                                </>
                              )}
                              {product.requires_prescription && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                                    <FileCheck2 className="w-3 h-3" />
                                    {draftRxProof ? 'Rx Ready' : 'Rx Required'}
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug">
                              {product.name}
                            </h3>

                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                              {product.description}
                            </p>

                            <div className="pt-1 flex items-center justify-between gap-2 text-xs">
                              <span
                                className={`font-semibold tabular-nums ${
                                  availability === 'Available'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : availability === 'Low Stock'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-red-700 dark:text-red-400'
                                }`}
                              >
                                {availability} ({product.stock_quantity})
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                Max {product.purchase_limit}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                              {formatPHP(product.regular_price)}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              per {product.unit}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectProductDetails(product)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[38px]"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              disabled={isOut || !isResident}
                              onClick={() => onAddToCart(product, false)}
                              title={
                                !isResident
                                  ? 'Online ordering is available for Customer accounts'
                                  : undefined
                              }
                              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors min-h-[38px] tabular-nums ${
                                isOut || !isResident
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                  : 'bg-teal-600 text-white hover:bg-teal-700'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>
                                {isOut
                                  ? 'Out of Stock'
                                  : qtyInCart > 0
                                    ? `In Cart (${qtyInCart})`
                                    : 'Add to Cart'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RATINGS & ANONYMOUS / VERIFIED REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Rating Overview Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Store Rating
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {ratingBreakdown.count > 0 ? ratingBreakdown.average.toFixed(1) : '—'}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                      / 5.0
                    </span>
                  </div>
                  <div className="flex items-center gap-1" aria-label={`Average rating ${ratingBreakdown.average} out of 5`}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          ratingBreakdown.count > 0 && s <= Math.round(ratingBreakdown.average)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {ratingBreakdown.count} verified{' '}
                    {ratingBreakdown.count === 1 ? 'review' : 'reviews'} ·{' '}
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {ratingBreakdown.anonymousCount} anonymous
                    </span>
                  </p>
                </div>

                {/* 5-to-1 Star Distribution Bars */}
                <div className="md:col-span-8 space-y-2">
                  {([5, 4, 3, 2, 1] as const).map((star) => {
                    const starCount = ratingBreakdown.countsByStar[star];
                    const pct =
                      ratingBreakdown.count > 0
                        ? Math.round((starCount / ratingBreakdown.count) * 100)
                        : 0;
                    const isSelected = starFilter === star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setStarFilter(isSelected ? 'all' : star)}
                        className={`w-full flex items-center gap-3 rounded-lg px-2 py-1 text-xs transition-colors ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/50 ring-1 ring-teal-500/40'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <span className="w-10 text-left font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 tabular-nums">
                          {star}
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-16 text-right font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                          {starCount} ({pct}%)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Top Customer Highlight Tags */}
              {ratingBreakdown.topTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <Award className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    Common Customer Highlights:
                  </span>
                  {ratingBreakdown.topTags.map((t, i) => (
                    <React.Fragment key={t.tag}>
                      {i > 0 && (
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                          ·
                        </span>
                      )}
                      <span className="tabular-nums">
                        {t.tag} ({t.count})
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Anonymity & Rating Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAnonymityFilter('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums ${
                      anonymityFilter === 'all'
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    All Reviews ({ratingBreakdown.count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnonymityFilter('anonymous')}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums ${
                      anonymityFilter === 'anonymous'
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>Anonymous ({ratingBreakdown.anonymousCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnonymityFilter('named')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums ${
                      anonymityFilter === 'named'
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    Named ({ratingBreakdown.namedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithReplyOnly((prev) => !prev)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      withReplyOnly
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    With Pharmacy Reply
                  </button>
                </div>

                {starFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setStarFilter('all')}
                    className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    Clear {starFilter}★ filter
                  </button>
                )}
              </div>

              {/* Reviews Feed */}
              {reviewEntries.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-10 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {ratingBreakdown.count === 0
                      ? 'No customer reviews for this pharmacy yet'
                      : 'No reviews match the selected filter'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {ratingBreakdown.count === 0
                      ? 'Verified customers can rate this pharmacy after order delivery — including anonymous ratings that protect their personal identity.'
                      : 'Try clearing the star, anonymity, or reply filter to read all verified customer reviews.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewEntries.map(({ review, reviewerName, isAnonymous }) => (
                    <article
                      key={review.review_id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                              {isAnonymous && (
                                <EyeOff className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              )}
                              {reviewerName}
                            </span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                              ·
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              Verified Order Buyer
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div
                              className="flex items-center gap-0.5"
                              aria-label={`${review.rating} out of 5 stars`}
                            >
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3.5 h-3.5 ${
                                    s <= review.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-300 dark:text-slate-600'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                              {review.rating}.0
                            </span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                              ·
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {new Date(review.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {review.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-teal-800 dark:text-teal-300 font-medium">
                          {review.tags.map((tag, idx) => (
                            <React.Fragment key={tag}>
                              {idx > 0 && (
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                  ·
                                </span>
                              )}
                              <span>{tag}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {review.comment ? (
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                          &ldquo;{review.comment}&rdquo;
                        </p>
                      ) : (
                        <p className="text-xs italic text-slate-400 dark:text-slate-500">
                          Rated with tags only.
                        </p>
                      )}

                      {review.merchant_reply && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-1">
                          <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                            Pharmacy Response ·{' '}
                            {review.replied_at
                              ? new Date(review.replied_at).toLocaleDateString()
                              : ''}
                          </p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            {review.merchant_reply}
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STORE HOURS & BRANCH DETAILS */}
          {activeTab === 'info' && (
            <div className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>Operating Schedule (Asia/Manila)</span>
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {weeklySchedule.map((row) => (
                      <div
                        key={row.dayOfWeek}
                        className={`py-2 flex items-center justify-between gap-2 ${
                          row.isToday
                            ? 'font-semibold text-teal-700 dark:text-teal-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>
                          {row.dayName}
                          {row.isToday ? ' (Today)' : ''}
                        </span>
                        <span
                          className={`font-mono tabular-nums ${
                            row.isClosed ? 'text-slate-400 dark:text-slate-500' : ''
                          }`}
                        >
                          {row.hoursLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>Pharmacy &amp; Pharmacist Credentials</span>
                  </h3>
                  <dl className="space-y-3 text-xs">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Branch Address</dt>
                      <dd className="font-medium text-slate-900 dark:text-white mt-0.5">
                        {addr?.street || 'Olongapo City'}, Brgy. {barangay?.name || 'Olongapo'},{' '}
                        {barangay?.city || 'Olongapo City'}
                      </dd>
                    </div>
                    {addr?.landmark && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Landmark</dt>
                        <dd className="font-medium text-slate-900 dark:text-white mt-0.5">
                          {addr.landmark}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Supervising Pharmacist</dt>
                      <dd className="font-medium text-slate-900 dark:text-white mt-0.5">
                        {merchant.pharmacist_name} ·{' '}
                        <span className="font-mono">{merchant.pharmacist_license_no}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Branch Hotline</dt>
                      <dd className="font-mono font-medium text-slate-900 dark:text-white mt-0.5">
                        {merchant.contact_no}
                      </dd>
                    </div>
                  </dl>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onPinOnMap(merchant.merchant_id);
                        onClose();
                      }}
                      className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500"
                    >
                      Show Location on Map
                    </button>
                    <button
                      type="button"
                      onClick={() => onReportStore(merchant.merchant_id)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Report Store Info Issue
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  );
};

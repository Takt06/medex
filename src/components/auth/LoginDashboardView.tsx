import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  HeartPulse,
  MapPin,
  Pause,
  Pill,
  Play,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Product, ProductSortOption, ProductStockFilter, PublicRegisterRole } from '../../types/medex';
import {
  OLONGAPO_DEFAULT_CENTER,
  computePharmacyRatingSummary,
  formatPHP,
  getApprovedStorefrontMerchantIds,
  getAvailabilityStatus,
  getMerchantOpenStatus,
  hasActiveStorefrontFilters,
  haversineDistanceKm,
  sortAndFilterProducts,
  wrapSlideIndex,
} from '../../utils/medexRules';
import heroPharmacyBannerImg from '../../assets/images/medex_hero_pharmacy_1794584230508.jpg';
import medicinesPackBannerImg from '../../assets/images/medex_medicines_pack_1794584230532.jpg';
import firstAidBannerImg from '../../assets/images/medex_first_aid_kit_1794584231501.jpg';
import babyHygieneBannerImg from '../../assets/images/medex_baby_hygiene_1794584231696.jpg';
import { MedExLogo } from '../common/MedExLogo';
import { OfflineIndicator, PWAInstallButton } from '../common/PWAControls';
import { PoliciesModal } from '../common/PoliciesModal';
import { ThemeToggle } from '../common/ThemeToggle';
import { AuthModal } from './AuthModal';

interface PromoBanner {
  id: string;
  style: 'artwork' | 'editorial';
  eyebrow: string;
  headline: string;
  subcopy?: string;
  ctaLabel?: string;
  badge: string;
  image: string;
  action: 'featured' | 'baby_care' | 'medicines' | 'first_aid' | 'vitamins';
}

const PROMO_BANNERS: PromoBanner[] = [
  {
    id: 'doorstep-medicine-delivery',
    style: 'artwork',
    eyebrow: 'DOORSTEP DELIVERY',
    headline: 'Your Medicine At Your Doorstep — Order Online & Get Medicines Delivered',
    badge: 'CONVENIENT DELIVERY',
    image: '/assets/aistudio/Banner4_ffd6d92b.png',
    action: 'featured',
  },
  {
    id: 'baby-care-deals',
    style: 'artwork',
    eyebrow: 'BABY CARE ESSENTIALS',
    headline: 'Baby Care For Your Little Ones — Gentle Essentials at MedEx',
    badge: 'BABY CARE',
    image: '/assets/aistudio/Banner2_4d94dab9.png',
    action: 'baby_care',
  },
  {
    id: 'healthy-deals-vitamins',
    style: 'artwork',
    eyebrow: 'HEALTHY DEALS',
    headline: 'Stay Healthy Every Day — Buy 2 Vitamins & Get 10% OFF',
    badge: '10% OFF VITAMINS',
    image: '/assets/aistudio/Banner3_3482f328.png',
    action: 'vitamins',
  },
  {
    id: 'first-aid-emergency-picks',
    style: 'artwork',
    eyebrow: 'FIRST AID PICKS',
    headline: 'Ready for Every Emergency — Get 10% OFF Selected First Aid Essentials',
    badge: 'EMERGENCY READY',
    image: '/assets/aistudio/Banner1_0720192f.png',
    action: 'first_aid',
  },
  {
    id: 'olongapo-pharmacy-network',
    style: 'editorial',
    eyebrow: '24/7 OLONGAPO PHARMACY NETWORK',
    headline: 'Trusted PRC-Licensed Pharmacies Across Olongapo City',
    subcopy:
      'Compare live medicine stocks, verify doctor prescriptions securely, and get express doorstep delivery.',
    ctaLabel: 'Browse Medicines',
    badge: 'VERIFIED PHARMACIES',
    image: heroPharmacyBannerImg,
    action: 'featured',
  },
  {
    id: 'everyday-relief-medicines',
    style: 'editorial',
    eyebrow: 'OTC & PRESCRIPTION MEDICINES',
    headline: 'Everyday Relief & Maintenance Meds Ready to Dispatch',
    subcopy:
      'Order fever, cold, and maintenance medicines directly from approved neighborhood pharmacies.',
    ctaLabel: 'Shop Medicines',
    badge: 'LIVE STOCK',
    image: medicinesPackBannerImg,
    action: 'medicines',
  },
  {
    id: 'household-first-aid-essentials',
    style: 'editorial',
    eyebrow: 'EMERGENCY & FIRST AID CARE',
    headline: 'Keep Every Olongapo Home Ready for First Aid Care',
    subcopy:
      'Antiseptics, sterile dressings, bandages, and thermometer kits delivered quickly to your barangay.',
    ctaLabel: 'Explore First Aid',
    badge: 'HOME CARE',
    image: firstAidBannerImg,
    action: 'first_aid',
  },
  {
    id: 'family-baby-hygiene',
    style: 'editorial',
    eyebrow: 'FAMILY & BABY CARE',
    headline: 'Gentle Personal Hygiene & Baby Care Essentials',
    subcopy:
      'Daily wellness, sanitation, and infant care stocked fresh by verified Olongapo partner branches.',
    ctaLabel: 'Shop Baby & Hygiene',
    badge: 'FAMILY CARE',
    image: babyHygieneBannerImg,
    action: 'baby_care',
  },
];

const CATEGORY_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Pill,
  2: HeartPulse,
  3: Sparkles,
  4: HeartPulse,
  5: ShieldCheck,
  6: Stethoscope,
};

export const LoginDashboardView: React.FC = () => {
  const {
    state,
    setPendingCartIntent,
  } = useMedEx();

  const productsSectionRef = useRef<HTMLElement | null>(null);
  const branchesSectionRef = useRef<HTMLElement | null>(null);

  // Storefront search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | 'all' | 'rx' | 'featured'>('all');
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>('all');
  const [sortBy, setSortBy] = useState<ProductSortOption>('featured');
  const [policiesOpen, setPoliciesOpen] = useState(false);

  // Promotional Carousel state
  const [bannerIndex, setBannerIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  // Product preview modal (live-derived from state.products for real-time updates)
  const [detailProductId, setDetailProductId] = useState<number | null>(null);
  const setDetailProduct = (prod: Product | null) =>
    setDetailProductId(prod ? prod.product_id : null);
  const [detailQty, setDetailQty] = useState(1);

  // Auth Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('register');
  const [authDefaultRole, setAuthDefaultRole] = useState<PublicRegisterRole>('resident');
  const [authIntentMessage, setAuthIntentMessage] = useState<string | null>(null);

  useEffect(() => {
    if (carouselPaused) return;
    const timer = window.setInterval(() => {
      setBannerIndex((prev) => wrapSlideIndex(prev, 1, PROMO_BANNERS.length));
    }, 5500);
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

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

  const activeMerchants = useMemo(
    () => state.merchants.filter((m) => approvedMerchantIds.has(m.merchant_id)),
    [state.merchants, approvedMerchantIds]
  );

  const merchantDistanceKmById = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of state.merchants) {
      const addr = state.addresses.find((a) => a.address_id === m.shop_address_id);
      if (addr && Number.isFinite(addr.latitude) && Number.isFinite(addr.longitude)) {
        map.set(
          m.merchant_id,
          haversineDistanceKm(
            OLONGAPO_DEFAULT_CENTER.lat,
            OLONGAPO_DEFAULT_CENTER.lng,
            addr.latitude,
            addr.longitude
          )
        );
      }
    }
    return map;
  }, [state.merchants, state.addresses]);

  const merchantNameById = useMemo(
    () => new Map(state.merchants.map((m) => [m.merchant_id, m.shop_name])),
    [state.merchants]
  );

  const categoryNameById = useMemo(
    () => new Map(state.categories.map((c) => [c.category_id, c.name])),
    [state.categories]
  );

  const filtersAreActive = useMemo(
    () =>
      hasActiveStorefrontFilters({
        selectedCategory,
        selectedMerchantId,
        stockFilter,
        sortBy,
        searchQuery,
      }),
    [selectedCategory, selectedMerchantId, stockFilter, sortBy, searchQuery]
  );

  const showcaseProducts = useMemo(
    () =>
      sortAndFilterProducts(state.products, {
        approvedMerchantIds,
        selectedCategory,
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
      selectedCategory,
      selectedMerchantId,
      stockFilter,
      sortBy,
      searchQuery,
      merchantDistanceKmById,
      merchantNameById,
      categoryNameById,
    ]
  );

  const openAuthPrompt = (
    mode: 'signin' | 'register',
    message: string | null = null,
    role: PublicRegisterRole = 'resident'
  ) => {
    setAuthMode(mode);
    setAuthDefaultRole(role);
    setAuthIntentMessage(message);
    setAuthModalOpen(true);
  };

  const handleGuestPurchaseAttempt = (
    product: Product,
    qty = 1,
    openCheckout = false
  ) => {
    setPendingCartIntent({ productId: product.product_id, quantity: qty, openCheckout });
    setDetailProduct(null);
    openAuthPrompt(
      'register',
      `Create a free Olongapo MedEx account (or sign in) to add ${product.name} to your cart and complete your order.`,
      'resident'
    );
  };

  const handleGuestCartClick = () => {
    setPendingCartIntent(null);
    openAuthPrompt(
      'register',
      'Sign up or sign in to view your cart, attach doctor prescriptions, and check out for Olongapo delivery.',
      'resident'
    );
  };

  const scrollToProducts = () => {
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const findCategoryIdByKeywords = (keywords: string[], fallbackId: number): number => {
    const match = state.categories.find((c) =>
      keywords.some((kw) => c.name.toLowerCase().includes(kw))
    );
    return match ? match.category_id : fallbackId;
  };

  const handleBannerCta = (action: PromoBanner['action']) => {
    setSelectedMerchantId('all');
    if (action === 'baby_care') {
      setSelectedCategory(findCategoryIdByKeywords(['baby', 'hygiene', 'personal'], 4));
      setStockFilter('all');
    } else if (action === 'vitamins') {
      setSelectedCategory(findCategoryIdByKeywords(['vitamin', 'supplement'], 3));
      setStockFilter('all');
    } else if (action === 'medicines') {
      setSelectedCategory(findCategoryIdByKeywords(['medicine', 'otc', 'rx'], 1));
      setStockFilter('all');
    } else if (action === 'first_aid') {
      setSelectedCategory(findCategoryIdByKeywords(['first aid', 'emergency'], 2));
      setStockFilter('all');
    } else {
      setSelectedCategory('featured');
      setStockFilter('in_stock');
    }
    scrollToProducts();
  };

  const currentBanner = PROMO_BANNERS[bannerIndex];

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-28 -left-24 w-96 h-96 rounded-full bg-teal-400/12 dark:bg-teal-500/15 blur-3xl"
      />
      <OfflineIndicator />

      {/* Top Storefront E-Commerce Header */}
      <header className="sticky top-0 z-30 medex-glass-dark text-white border-b border-white/12 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
          {/* Left: Brand + Olongapo Location Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl bg-white/92 dark:bg-slate-900/78 backdrop-blur-md border border-white/45 dark:border-white/15 px-2.5 py-1 flex items-center shadow-xs">
              <MedExLogo size={26} showWordmark />
            </div>
            <div className="hidden xl:flex flex-col text-[11px] leading-tight text-slate-300 border-l border-white/15 pl-3">
              <span className="text-slate-400">Delivering to</span>
              <span className="font-semibold text-white inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-teal-400" />
                Olongapo City, Zambales
              </span>
            </div>
          </div>

          {/* Center: Prominent Storefront Product Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scrollToProducts();
            }}
            className="order-3 lg:order-2 w-full lg:flex-1 lg:max-w-xl flex items-center rounded-xl bg-white/88 dark:bg-slate-900/68 backdrop-blur-xl border border-white/40 dark:border-white/16 overflow-hidden shadow-xs focus-within:ring-2 focus-within:ring-teal-400"
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicines, vitamins, first aid, Rx products..."
              aria-label="Search medicines and pharmacy products"
              className="flex-1 bg-transparent px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear product search"
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label="Search products"
              className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 flex items-center justify-center transition-colors shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Right: Theme, PWA Install, Sign In / Sign Up & Cart */}
          <div className="order-2 lg:order-3 flex items-center gap-2 shrink-0">
            <ThemeToggle darkSurface />

            <div className="hidden sm:block">
              <PWAInstallButton darkSurface />
            </div>

            <button
              type="button"
              onClick={() => openAuthPrompt('signin', null, 'resident')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/18 bg-white/10 hover:bg-white/18 backdrop-blur-md px-3 py-1.5 text-left transition-colors min-h-[40px]"
            >
              <User className="w-4 h-4 text-teal-400 shrink-0" />
              <div className="leading-tight hidden sm:block">
                <p className="text-[10px] text-slate-300">Hello, Sign in</p>
                <p className="text-xs font-semibold text-white whitespace-nowrap">Account &amp; Orders</p>
              </div>
              <span className="sm:hidden text-xs font-semibold whitespace-nowrap">Sign In</span>
            </button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={handleGuestCartClick}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors shadow-xs whitespace-nowrap min-h-[40px]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Cart (0)</span>
            </motion.button>
          </div>
        </div>

        {/* Secondary Category Navigation Bar (Southstar-style quick links) */}
        <nav
          aria-label="Storefront categories"
          className="medex-glass-header border-t border-white/45 dark:border-white/10 text-slate-800 dark:text-slate-100"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedMerchantId('all');
                setStockFilter('all');
                scrollToProducts();
              }}
              className={`rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'all' && selectedMerchantId === 'all'
                  ? 'bg-teal-600 text-white'
                  : 'hover:bg-teal-100/80 dark:hover:bg-slate-800'
              }`}
            >
              All Products
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('featured');
                scrollToProducts();
              }}
              className={`rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
                selectedCategory === 'featured'
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-800 dark:text-teal-300 hover:bg-teal-100/80 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Featured Picks
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('rx');
                scrollToProducts();
              }}
              className={`rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
                selectedCategory === 'rx'
                  ? 'bg-teal-600 text-white'
                  : 'hover:bg-teal-100/80 dark:hover:bg-slate-800'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Rx Prescriptions
            </button>
            {state.categories.map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.category_id);
                  scrollToProducts();
                }}
                className={`rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.category_id
                    ? 'bg-teal-600 text-white'
                    : 'hover:bg-teal-100/80 dark:hover:bg-slate-800'
                }`}
              >
                {cat.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                branchesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="rounded-lg px-3 py-1.5 hover:bg-teal-100/80 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1"
            >
              <Store className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              Olongapo Branches
            </button>
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* 3 Service Callout Cards Strip (Tinted Liquid Glass Action Highlights) */}
        <section aria-label="MedEx services" className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              setSelectedCategory('rx');
              scrollToProducts();
            }}
            className="medex-glass-amber medex-card-hover rounded-2xl border px-4 py-3.5 flex items-center justify-center gap-3 text-slate-950 dark:text-amber-50"
          >
            <span className="h-9 w-9 rounded-xl bg-white/55 dark:bg-amber-400/15 border border-white/70 dark:border-amber-300/25 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-4.5 h-4.5 text-amber-900 dark:text-amber-300" />
            </span>
            <div className="text-left">
              <p className="font-display text-sm font-bold">Doctor Rx Verification</p>
              <p className="text-[11px] text-slate-800/85 dark:text-amber-100/80">Attach prescription proof safely at checkout</p>
            </div>
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() =>
              branchesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="medex-glass-rose medex-card-hover rounded-2xl border px-4 py-3.5 flex items-center justify-center gap-3 text-slate-950 dark:text-rose-50"
          >
            <span className="h-9 w-9 rounded-xl bg-white/55 dark:bg-rose-400/15 border border-white/70 dark:border-rose-300/25 flex items-center justify-center shrink-0">
              <Truck className="w-4.5 h-4.5 text-rose-900 dark:text-rose-300" />
            </span>
            <div className="text-left">
              <p className="font-display text-sm font-bold">Olongapo Express Rider</p>
              <p className="text-[11px] text-slate-800/85 dark:text-rose-100/80">Live dispatch across 6 Olongapo barangays</p>
            </div>
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() =>
              branchesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="medex-glass-sky medex-card-hover rounded-2xl border px-4 py-3.5 flex items-center justify-center gap-3 text-slate-950 dark:text-sky-50"
          >
            <span className="h-9 w-9 rounded-xl bg-white/55 dark:bg-sky-400/15 border border-white/70 dark:border-sky-300/25 flex items-center justify-center shrink-0">
              <Star className="w-4.5 h-4.5 text-sky-900 dark:text-sky-300" />
            </span>
            <div className="text-left">
              <p className="font-display text-sm font-bold">Verified Store &amp; Rider Ratings</p>
              <p className="text-[11px] text-slate-800/85 dark:text-sky-100/80">Anonymous community reviews &amp; 1–5 ★ courier scores</p>
            </div>
          </motion.button>
        </section>

        {/* Promotional & Sales Banner Carousel */}
        <section
          aria-label="Promotional sales banners"
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
          className="space-y-3"
        >
          <div className="group relative rounded-3xl overflow-hidden shadow-lg medex-glass border border-white/80 dark:border-slate-700/80 p-1.5 sm:p-2">
            <div className="relative rounded-2xl overflow-hidden aspect-[8/3] w-full bg-slate-100 dark:bg-slate-900">
              <AnimatePresence mode="wait">
                <motion.button
                  key={currentBanner.id}
                  type="button"
                  onClick={() => handleBannerCta(currentBanner.action)}
                  aria-label={currentBanner.headline}
                  initial={{ opacity: 0.85, scale: 1.01 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.85, scale: 0.99 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="relative block w-full h-full text-left focus:outline-2 focus:outline-teal-600 cursor-pointer"
                >
                  <img
                    src={currentBanner.image}
                    alt={currentBanner.headline}
                    className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.015] dark:brightness-95 dark:contrast-[1.03]"
                  />
                  {currentBanner.style === 'editorial' ? (
                    <>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-slate-950/15"
                      />
                      <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 md:px-14 max-w-2xl space-y-2 sm:space-y-3">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-teal-500/90 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-white shadow-xs">
                          {currentBanner.eyebrow}
                        </span>
                        <h2 className="font-display text-lg sm:text-2xl md:text-3xl font-bold text-white leading-tight drop-shadow-xs">
                          {currentBanner.headline}
                        </h2>
                        {currentBanner.subcopy && (
                          <p className="hidden sm:block text-xs md:text-sm text-slate-200 leading-relaxed max-w-xl">
                            {currentBanner.subcopy}
                          </p>
                        )}
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-white text-slate-950 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold shadow-md">
                          <span>{currentBanner.ctaLabel || 'Explore Now'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-slate-950/10 dark:ring-white/15 bg-gradient-to-t from-slate-950/20 via-transparent to-transparent opacity-60 dark:opacity-80"
                    />
                  )}
                </motion.button>
              </AnimatePresence>

              {/* Left / Right Arrow Overlay Controls */}
              <button
                type="button"
                aria-label="Previous promotional banner"
                onClick={() => setBannerIndex((prev) => wrapSlideIndex(prev, -1, PROMO_BANNERS.length))}
                className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-slate-950/45 hover:bg-slate-950/75 text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-md"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Next promotional banner"
                onClick={() => setBannerIndex((prev) => wrapSlideIndex(prev, 1, PROMO_BANNERS.length))}
                className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-slate-950/45 hover:bg-slate-950/75 text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-md"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Southstar-style Carousel Pagination Dots + Play/Pause Bar */}
          <div className="flex items-center justify-center gap-3 text-slate-600 dark:text-slate-400">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setBannerIndex((prev) => wrapSlideIndex(prev, -1, PROMO_BANNERS.length))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 sm:hidden"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {PROMO_BANNERS.map((banner, idx) => {
                const active = idx === bannerIndex;
                return (
                  <button
                    key={banner.id}
                    type="button"
                    aria-label={`Show banner ${idx + 1}: ${banner.eyebrow}`}
                    onClick={() => setBannerIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      active
                        ? 'w-7 bg-teal-600 dark:bg-teal-400'
                        : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                    }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setBannerIndex((prev) => wrapSlideIndex(prev, 1, PROMO_BANNERS.length))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 sm:hidden"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              aria-label={carouselPaused ? 'Play banner rotation' : 'Pause banner rotation'}
              onClick={() => setCarouselPaused((prev) => !prev)}
              className="medex-glass-subtle inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105"
            >
              {carouselPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{carouselPaused ? 'Play' : 'Pause'}</span>
            </button>
          </div>
        </section>

        {/* Shop by Category Cards (Liquid Glass Category Shelf) */}
        <section aria-label="Medicine categories" className="space-y-3">
          <div className="medex-glass rounded-2xl border px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Categories
            </h2>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Browse Olongapo City pharmacy catalog
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {state.categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.category_id] || Pill;
              const count = state.products.filter(
                (p) =>
                  p.is_listed &&
                  !p.is_archived &&
                  approvedMerchantIds.has(p.merchant_id) &&
                  p.category_id === cat.category_id
              ).length;
              const active = selectedCategory === cat.category_id;
              return (
                <motion.button
                  key={cat.category_id}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedCategory(active ? 'all' : cat.category_id);
                    scrollToProducts();
                  }}
                  className={`rounded-2xl border p-4 text-center flex flex-col items-center gap-2 transition-all medex-card-hover ${
                    active
                      ? 'medex-glass border-teal-500 ring-2 ring-teal-500/25 text-teal-800 dark:text-teal-300'
                      : 'medex-glass hover:border-teal-400/70 dark:hover:border-teal-500/60'
                  }`}
                >
                  <div className="h-11 w-11 rounded-xl medex-glass-subtle border flex items-center justify-center text-teal-700 dark:text-teal-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-display text-xs font-bold text-slate-900 dark:text-white">
                      {cat.name}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                      {count} {count === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Showcase Medicines & Wellness Product Grid */}
        <section
          ref={productsSectionRef}
          aria-label="Featured pharmacy products"
          className="space-y-4 scroll-mt-28"
        >
          <div className="medex-glass rounded-2xl border px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Featured Medicines &amp; Pharmacy Picks
              </h2>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Showing {showcaseProducts.length} products in Olongapo City · Sign up to add items &amp; order
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span className="sr-only">Filter by Stock Availability</span>
                <select
                  aria-label="Filter by stock availability"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as ProductStockFilter)}
                  className="medex-glass-subtle rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
                >
                  <option value="all">Stock: All</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="otc">OTC Only</option>
                  <option value="rx">Rx Required</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="sr-only">Sort products</span>
                <select
                  aria-label="Sort products"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ProductSortOption)}
                  className="medex-glass-subtle rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
                >
                  <option value="featured">Sort: Featured</option>
                  <option value="price_asc">Price: Lowest to Highest</option>
                  <option value="price_desc">Price: Highest to Lowest</option>
                  <option value="name_asc">Product Name: A–Z</option>
                  <option value="name_desc">Product Name: Z–A</option>
                  <option value="nearest">Nearest Pharmacy</option>
                </select>
              </label>

              {filtersAreActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedMerchantId('all');
                    setStockFilter('all');
                    setSortBy('featured');
                    setSearchQuery('');
                  }}
                  className="rounded-xl bg-slate-900 dark:bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 whitespace-nowrap"
                >
                  See all products
                </button>
              )}
            </div>
          </div>

          {showcaseProducts.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-10 text-center space-y-3">
              {filtersAreActive ? (
                <>
                  <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                    No medicines match your current filter.
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Clear your search text, branch selection, or category filter to view all available Olongapo pharmacy items.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setSelectedMerchantId('all');
                      setStockFilter('all');
                      setSortBy('featured');
                      setSearchQuery('');
                    }}
                    className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    Reset Storefront Filters
                  </button>
                </>
              ) : (
                <>
                  <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                    No medicines are listed on the storefront yet.
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 max-w-xl mx-auto">
                    As soon as an approved Olongapo City pharmacy lists medicines in their inventory, they appear here automatically in real time.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {showcaseProducts.map((product) => {
                const merchant = state.merchants.find((m) => m.merchant_id === product.merchant_id);
                const addr = state.addresses.find((a) => a.address_id === merchant?.shop_address_id);
                const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
                const category = state.categories.find((c) => c.category_id === product.category_id);
                const avail = getAvailabilityStatus(product.stock_quantity, product.low_stock_threshold);
                const outOfStock = avail === 'Out of Stock';
                const ratingSummary = merchant
                  ? computePharmacyRatingSummary(state.pharmacyReviews, merchant.merchant_id)
                  : { average: 0, count: 0 };

                return (
                  <motion.article
                    key={product.product_id}
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.16 }}
                    className="medex-glass medex-card-hover rounded-2xl border overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-44 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <img
                          src={product.image_path}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold shadow-xs ${
                              avail === 'Available'
                                ? 'bg-teal-600 text-white'
                                : avail === 'Low Stock'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-red-600 text-white'
                            }`}
                          >
                            {avail}
                          </span>
                          {product.requires_prescription && (
                            <span className="rounded-md bg-slate-900/90 text-white px-2 py-0.5 text-[10px] font-bold shadow-xs">
                              Rx Required
                            </span>
                          )}
                        </div>
                        {ratingSummary.count > 0 && (
                          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-slate-950/80 text-white px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 tabular-nums">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {ratingSummary.average.toFixed(1)}
                          </span>
                        )}
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="truncate font-medium">
                            {merchant?.shop_name || 'Olongapo Pharmacy'}
                          </span>
                          <span className="shrink-0">{category?.name}</span>
                        </div>

                        <div>
                          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-1">
                            {product.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                            {product.dosage_strength ? `${product.dosage_strength} · ` : ''}
                            {product.unit}
                            {brgy ? ` · ${brgy.name}` : ''}
                            {merchantDistanceKmById.has(product.merchant_id)
                              ? ` · ${merchantDistanceKmById.get(product.merchant_id)!.toFixed(1)} km`
                              : ''}
                          </p>
                        </div>

                        <div className="pt-1 flex items-baseline justify-between gap-2">
                          <div>
                            <p className="font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                              {formatPHP(product.regular_price)}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              Max {product.purchase_limit} per order
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {product.stock_quantity} left
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailProduct(product);
                          setDetailQty(1);
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                      >
                        Details
                      </button>
                      <motion.button
                        type="button"
                        disabled={outOfStock}
                        whileTap={outOfStock ? undefined : { scale: 0.97 }}
                        onClick={() => handleGuestPurchaseAttempt(product, 1, false)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
                      </motion.button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>

        {/* Active Olongapo City Pharmacy Branches */}
        <section
          ref={branchesSectionRef}
          aria-label="Olongapo City pharmacy branches"
          className="medex-glass rounded-2xl border p-5 sm:p-6 space-y-4 scroll-mt-28"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Active Olongapo City Pharmacy Branches
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Click any verified branch to inspect medicines available at that store
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-teal-800 dark:text-teal-300 font-semibold">
              <MapPin className="w-3.5 h-3.5" />
              Olongapo City · 14.8315° N, 120.2835° E
            </span>
          </div>

          {activeMerchants.length === 0 ? (
            <div className="medex-glass-subtle rounded-xl border border-dashed p-6 text-center space-y-2.5">
              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                No verified partner pharmacies listed yet
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 max-w-md mx-auto">
                Register a new Pharmacy Store account and have it approved by Admin to appear live on the Olongapo storefront.
              </p>
              <button
                type="button"
                onClick={() =>
                  openAuthPrompt(
                    'register',
                    'Register your Olongapo pharmacy branch for Admin verification.',
                    'merchant'
                  )
                }
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                Register Pharmacy Store
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {activeMerchants.map((merchant) => {
                const addr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
                const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
                const hours = state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id);
                const openStatus = getMerchantOpenStatus(merchant, hours);
                const itemCount = state.products.filter(
                  (p) =>
                    p.merchant_id === merchant.merchant_id &&
                    p.is_listed &&
                    !p.is_archived &&
                    p.stock_quantity > 0
                ).length;
                const selected = selectedMerchantId === merchant.merchant_id;
                const ratingSummary = computePharmacyRatingSummary(
                  state.pharmacyReviews,
                  merchant.merchant_id
                );

                return (
                  <button
                    key={merchant.merchant_id}
                    type="button"
                    onClick={() => {
                      setSelectedMerchantId(selected ? 'all' : merchant.merchant_id);
                      scrollToProducts();
                    }}
                    className={`medex-glass-subtle medex-card-hover rounded-xl border p-4 text-left space-y-2 transition-all ${
                      selected
                        ? 'border-teal-500 ring-2 ring-teal-500/25'
                        : 'hover:border-teal-400/70 dark:hover:border-teal-500/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span
                        className={`font-semibold ${
                          openStatus.isOpen
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {openStatus.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {ratingSummary.count > 0 && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                          </span>
                        )}
                        <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                          {itemCount} SKUs
                        </span>
                      </div>
                    </div>
                    <p className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {merchant.shop_name}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span>
                        {addr?.street}
                        {brgy ? ` · Brgy. ${brgy.name}` : ''}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Storefront Footer with Partner Onboarding */}
      <footer className="medex-glass-header border-t border-white/50 dark:border-white/10 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-700 dark:text-slate-300">
          <div className="space-y-1">
            <p className="font-display font-bold text-slate-900 dark:text-white">
              MedEx Olongapo City Online Pharmacy &amp; Urgent Care Network
            </p>
            <p>
              Licensed pharmacist verification for Rx items · 18+ account registration · Asia/Manila (UTC+8)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPoliciesOpen(true)}
              className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>MedEx Policies</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openAuthPrompt(
                  'register',
                  'Register your Olongapo pharmacy branch or rider profile for Admin verification.',
                  'merchant'
                )
              }
              className="medex-glass-subtle rounded-xl border px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105 whitespace-nowrap"
            >
              Partner With Us
            </button>
            <button
              type="button"
              onClick={() => openAuthPrompt('signin', null, 'resident')}
              className="rounded-xl bg-slate-900 dark:bg-teal-600 px-3.5 py-1.5 font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 whitespace-nowrap"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>

      {/* Public Product Detail Modal */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-detail-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg rounded-3xl medex-glass border shadow-2xl overflow-hidden my-8"
          >
            <div className="relative h-52 bg-slate-100 dark:bg-slate-800">
              <img
                src={detailProduct.image_path}
                alt={detailProduct.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label="Close product details"
                onClick={() => setDetailProduct(null)}
                className="absolute top-3 right-3 rounded-full bg-slate-950/60 hover:bg-slate-950/80 p-2 text-white"
              >
                <X className="w-4 h-4" />
              </button>
              {detailProduct.requires_prescription && (
                <span className="absolute bottom-3 left-3 rounded-md bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-white">
                  Doctor&apos;s Prescription (Rx) Required
                </span>
              )}
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {state.merchants.find((m) => m.merchant_id === detailProduct.merchant_id)?.shop_name}
                </p>
                <h3
                  id="public-detail-title"
                  className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5"
                >
                  {detailProduct.name}{' '}
                  {detailProduct.dosage_strength && (
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                      ({detailProduct.dosage_strength})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Unit: {detailProduct.unit} · Stock: {detailProduct.stock_quantity} available
                </p>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {detailProduct.description}
              </p>

              {detailProduct.requires_prescription && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <FileCheck2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Controlled medicine: You will be able to attach your doctor&apos;s prescription photo or PDF during checkout after signing up.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Standard Store Price</p>
                  <p className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatPHP(detailProduct.regular_price)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                    Purchase Limit
                  </p>
                  <p className="font-display text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                    Up to {detailProduct.purchase_limit} per order
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    -
                  </button>
                  <span className="px-3.5 text-sm font-semibold tabular-nums">{detailQty}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDetailQty((q) => Math.min(Math.max(1, detailProduct.stock_quantity), q + 1))
                    }
                    className="px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-1 justify-end">
                  <button
                    type="button"
                    disabled={detailProduct.stock_quantity <= 0}
                    onClick={() => handleGuestPurchaseAttempt(detailProduct, detailQty, true)}
                    className="rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    {detailProduct.stock_quantity <= 0
                      ? 'Out of Stock'
                      : 'Sign Up / Buy Now'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Auth Modal for Guest -> Sign Up / Sign In Flow */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultMode={authMode}
        defaultRole={authDefaultRole}
        intentMessage={authIntentMessage}
      />

      <PoliciesModal
        open={policiesOpen}
        onClose={() => setPoliciesOpen(false)}
      />
    </div>
  );
};

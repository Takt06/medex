import React from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Clock,
  FileCheck2,
  Headphones,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { useMedEx, type ActiveTab } from '../../context/MedExContext';
import { getMerchantOpenStatus } from '../../utils/medexRules';
import { INTERNAL_ADMIN_ROLES } from '../../utils/rbac';
import { MedExLogo } from '../common/MedExLogo';
import { OfflineIndicator, PWAInstallButton } from '../common/PWAControls';
import { ThemeToggle } from '../common/ThemeToggle';
import { FloatingMobileNav, type FloatingMobileNavItem } from './FloatingMobileNav';

export type MerchantSection = 'orders' | 'rx' | 'inventory' | 'hours' | 'feedback';
export type RiderSection = 'dispatch' | 'earnings' | 'ratings';
export type AdminSection =
  | 'alerts'
  | 'users'
  | 'internal_roles'
  | 'catalog'
  | 'zones'
  | 'orders'
  | 'feedback'
  | 'reports';
export type DeliveryManagementSection = 'deliveries' | 'riders' | 'analytics';
export type CouponHandlerSection = 'campaigns' | 'redemptions' | 'analytics';
export type InventoryManagementSection = 'stores' | 'movements' | 'analytics';
export type CustomerServiceSection = 'complaints' | 'returns' | 'reviews' | 'analytics';

interface CustomerDashboardShellProps {
  onOpenCart: () => void;
  children: React.ReactNode;
}

export const CustomerDashboardShell: React.FC<CustomerDashboardShellProps> = ({
  onOpenCart,
  children,
}) => {
  const {
    state,
    currentUser,
    activeTab,
    setActiveTab,
    activeCart,
    unreadNotificationCount,
    logout,
  } = useMedEx();

  const cartCount = activeCart.items.reduce((sum, item) => sum + item.quantity, 0);
  const primaryAddr = state.addresses.find(
    (a) => a.user_id === currentUser.user_id && a.is_primary
  );
  const primaryBrgy = state.barangays.find((b) => b.barangay_id === primaryAddr?.barangay_id);

  const navLinks: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'customer_home', label: 'Home', icon: Home },
    { id: 'locator', label: 'Locator', icon: MapPin },
    { id: 'store', label: 'Store', icon: Store },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'emergency', label: 'Emergency', icon: AlertTriangle },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
    { id: 'account', label: 'Account', icon: User },
  ];

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-32 -left-24 w-96 h-96 rounded-full bg-teal-400/12 dark:bg-teal-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-1/3 -right-28 w-80 h-80 rounded-full bg-sky-400/10 dark:bg-cyan-500/12 blur-3xl"
      />
      <OfflineIndicator />

      {/* Strict 3-zone Customer Top Bar */}
      <header className="sticky top-0 z-30 medex-glass-header border-b border-white/55 dark:border-white/12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('customer_home')}
            className="text-left focus-visible:outline-2 focus-visible:outline-teal-600 rounded-md whitespace-nowrap shrink-0"
            aria-label="Customer Home"
          >
            <MedExLogo size={28} showWordmark />
          </button>

          <nav aria-label="Customer Navigation" className="hidden md:flex items-center gap-4 lg:gap-5 text-sm font-medium">
            {navLinks.map((link) => {
              const active = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`relative py-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {link.label}
                  {active && (
                    <motion.span
                      layoutId="customer-nav-underline"
                      transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                      className="absolute left-0 right-0 -bottom-[1px] h-0.5 bg-teal-600 dark:bg-teal-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onOpenCart}
              className="medex-btn-lift inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Cart ({cartCount})</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* Slim Customer Context Utility Strip */}
      <div className="medex-glass-subtle border-b border-white/45 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {currentUser.first_name} {currentUser.last_name}
            </span>
            <span className="text-slate-400 dark:text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-teal-800 dark:text-teal-300 font-medium">
              <MapPin className="w-3.5 h-3.5" />
              {primaryBrgy ? `Brgy. ${primaryBrgy.name}, ` : ''}Olongapo City
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[34px]"
            >
              <Bell className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              <span className="tabular-nums">{unreadNotificationCount} Notices</span>
            </button>
            <PWAInstallButton />
            <button
              type="button"
              onClick={logout}
              className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[34px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12">
        {children}
      </main>

      <footer className="hidden md:block border-t border-white/50 dark:border-slate-800/70 medex-glass-header py-4 text-xs text-slate-700 dark:text-slate-300 font-medium">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <span>MedEx Customer Portal · Olongapo City, Zambales</span>
          <span>Region III Initial Coverage · Asia/Manila (UTC+8)</span>
        </div>
      </footer>

      {/* Floating Mobile Capsule Navigation (5 slots max, Emergency emphasized center, More drawer) */}
      <FloatingMobileNav
        ariaLabel="Customer Mobile Navigation"
        breakpoint="md"
        items={[
          {
            id: 'customer_home',
            label: 'Home',
            icon: Home,
            active: activeTab === 'customer_home',
            onSelect: () => setActiveTab('customer_home'),
          },
          {
            id: 'locator',
            label: 'Pharmacy Locator',
            icon: MapPin,
            active: activeTab === 'locator',
            onSelect: () => setActiveTab('locator'),
          },
          {
            id: 'emergency',
            label: 'Emergency SOS',
            icon: AlertTriangle,
            featured: true,
            tone: 'emergency',
            active: activeTab === 'emergency',
            onSelect: () => setActiveTab('emergency'),
          },
          {
            id: 'orders',
            label: 'My Orders',
            icon: Package,
            active: activeTab === 'orders',
            onSelect: () => setActiveTab('orders'),
          },
          {
            id: 'store',
            label: 'Medicine Store',
            icon: Store,
            active: activeTab === 'store',
            onSelect: () => setActiveTab('store'),
          },
          {
            id: 'coupons',
            label: 'Promo Coupons',
            icon: Ticket,
            active: activeTab === 'coupons',
            onSelect: () => setActiveTab('coupons'),
          },
          {
            id: 'feedback',
            label: 'Feedback & Ratings',
            icon: MessageSquare,
            active: activeTab === 'feedback',
            onSelect: () => setActiveTab('feedback'),
          },
          {
            id: 'account',
            label: 'Account & Notices',
            icon: User,
            badge: unreadNotificationCount,
            active: activeTab === 'account',
            onSelect: () => setActiveTab('account'),
          },
        ]}
      />
    </div>
  );
};

interface MerchantDashboardShellProps {
  section: MerchantSection;
  onSelectSection: (section: MerchantSection) => void;
  children: React.ReactNode;
}

export const MerchantDashboardShell: React.FC<MerchantDashboardShellProps> = ({
  section,
  onSelectSection,
  children,
}) => {
  const {
    state,
    currentUser,
    activeTab,
    setActiveTab,
    unreadNotificationCount,
    logout,
  } = useMedEx();

  const merchant = state.merchants.find((m) => m.user_id === currentUser.user_id);
  const hours = merchant
    ? state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id)
    : [];
  const openStatus = merchant ? getMerchantOpenStatus(merchant, hours) : null;

  const merchantOpenReportsCount = merchant
    ? state.problemReports.filter(
        (r) =>
          r.merchant_id === merchant.merchant_id &&
          (r.status === 'open' || r.status === 'acknowledged')
      ).length
    : 0;
  const merchantUnrepliedReviewsCount = merchant
    ? state.pharmacyReviews.filter(
        (r) =>
          r.merchant_id === merchant.merchant_id &&
          r.status === 'visible' &&
          !r.merchant_reply
      ).length
    : 0;
  const merchantFeedbackBadge = merchantOpenReportsCount + merchantUnrepliedReviewsCount;

  const sidebarItems: Array<{
    id: MerchantSection;
    label: string;
    badge?: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'orders', label: 'Incoming Orders', icon: Package },
    { id: 'rx', label: 'Rx Verification', icon: FileCheck2 },
    { id: 'inventory', label: 'Inventory & Stock', icon: Store },
    { id: 'feedback', label: 'Feedback Inbox', badge: merchantFeedbackBadge, icon: MessageSquare },
    { id: 'hours', label: 'Operating Hours', icon: Clock },
  ];

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-28 right-0 w-96 h-96 rounded-full bg-emerald-400/12 dark:bg-emerald-500/14 blur-3xl"
      />
      <OfflineIndicator />

      <div className="flex-1 flex relative">
        {/* Merchant Store Dedicated Frosted Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col medex-glass border-r border-white/55 dark:border-white/12 sticky top-0 h-screen">
          <div className="p-5 border-b border-white/45 dark:border-white/10 space-y-3">
            <MedExLogo size={28} showWordmark />
            <div className="rounded-xl medex-glass-subtle border p-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Merchant Store Portal
              </p>
              <p className="font-display text-xs font-bold text-slate-900 dark:text-white leading-snug">
                {merchant?.shop_name || 'Pharmacy Partner'}
              </p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                Olongapo City ·{' '}
                <span
                  className={
                    openStatus?.isOpen
                      ? 'text-teal-700 dark:text-teal-400 font-semibold'
                      : currentUser.status === 'approved' && !openStatus
                        ? 'text-amber-700 dark:text-amber-400 font-semibold'
                        : 'text-red-700 dark:text-red-400 font-semibold'
                  }
                >
                  {openStatus?.label ||
                    (currentUser.status === 'approved' ? 'Setup Needed' : 'Pending Approval')}
                </span>
              </p>
            </div>
          </div>

          <nav aria-label="Merchant Store Navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isSelected = activeTab === 'merchant_dashboard' && section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab('merchant_dashboard');
                    onSelectSection(item.id);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-teal-500/16 dark:bg-teal-400/18 text-teal-900 dark:text-teal-200 border border-teal-500/40 dark:border-teal-400/35 shadow-xs'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-md bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-300 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-white/45 dark:border-white/10 space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('locator')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'locator'
                    ? 'bg-teal-500/16 dark:bg-teal-400/18 text-teal-900 dark:text-teal-200 border border-teal-500/40 dark:border-teal-400/35 shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white border border-transparent'
                }`}
              >
                <MapPin className="w-4 h-4 shrink-0" />
                <span>Public Olongapo Map</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'account'
                    ? 'bg-teal-500/16 dark:bg-teal-400/18 text-teal-900 dark:text-teal-200 border border-teal-500/40 dark:border-teal-400/35 shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white border border-transparent'
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span>Store Profile ({unreadNotificationCount})</span>
              </button>
            </div>
          </nav>

          <div className="p-4 border-t border-white/45 dark:border-white/10">
            <button
              type="button"
              onClick={logout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Merchant Content Column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 medex-glass-header border-b border-white/55 dark:border-white/12 h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden">
                <MedExLogo size={26} showWordmark={false} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                  {merchant?.shop_name || 'Merchant Store Dashboard'}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  {currentUser.first_name} {currentUser.last_name} · {merchant?.pharmacist_license_no} · Olongapo City
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle />
              <PWAInstallButton />
              <button
                type="button"
                onClick={logout}
                className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[36px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-12">
            {children}
          </main>
        </div>
      </div>

      {/* Floating Merchant Capsule Nav (5 slots + More drawer) */}
      <FloatingMobileNav
        ariaLabel="Merchant Mobile Navigation"
        breakpoint="lg"
        items={[
          {
            id: 'orders',
            label: 'Incoming Orders',
            icon: Package,
            active: activeTab === 'merchant_dashboard' && section === 'orders',
            onSelect: () => {
              setActiveTab('merchant_dashboard');
              onSelectSection('orders');
            },
          },
          {
            id: 'rx',
            label: 'Rx Verification',
            icon: FileCheck2,
            active: activeTab === 'merchant_dashboard' && section === 'rx',
            onSelect: () => {
              setActiveTab('merchant_dashboard');
              onSelectSection('rx');
            },
          },
          {
            id: 'inventory',
            label: 'Inventory & Stock',
            icon: Store,
            featured: true,
            tone: 'primary',
            active: activeTab === 'merchant_dashboard' && section === 'inventory',
            onSelect: () => {
              setActiveTab('merchant_dashboard');
              onSelectSection('inventory');
            },
          },
          {
            id: 'feedback',
            label: 'Feedback Inbox',
            icon: MessageSquare,
            badge: merchantFeedbackBadge,
            active: activeTab === 'merchant_dashboard' && section === 'feedback',
            onSelect: () => {
              setActiveTab('merchant_dashboard');
              onSelectSection('feedback');
            },
          },
          {
            id: 'hours',
            label: 'Operating Hours',
            icon: Clock,
            active: activeTab === 'merchant_dashboard' && section === 'hours',
            onSelect: () => {
              setActiveTab('merchant_dashboard');
              onSelectSection('hours');
            },
          },
          {
            id: 'locator',
            label: 'Public Olongapo Map',
            icon: MapPin,
            active: activeTab === 'locator',
            onSelect: () => setActiveTab('locator'),
          },
          {
            id: 'account',
            label: 'Store Profile & Notices',
            icon: User,
            badge: unreadNotificationCount,
            active: activeTab === 'account',
            onSelect: () => setActiveTab('account'),
          },
        ]}
      />
    </div>
  );
};

interface RiderDashboardShellProps {
  section: RiderSection;
  onSelectSection: (section: RiderSection) => void;
  children: React.ReactNode;
}

export const RiderDashboardShell: React.FC<RiderDashboardShellProps> = ({
  section,
  onSelectSection,
  children,
}) => {
  const {
    state,
    currentUser,
    activeTab,
    setActiveTab,
    logout,
  } = useMedEx();

  const riderProfile = state.riderProfiles.find((r) => r.user_id === currentUser.user_id);

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-28 -right-24 w-96 h-96 rounded-full bg-sky-400/14 dark:bg-sky-500/14 blur-3xl"
      />
      <OfflineIndicator />

      <header className="sticky top-0 z-30 medex-glass-header border-b border-white/55 dark:border-white/12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MedExLogo size={28} showWordmark />
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 border-l border-white/50 dark:border-white/15 pl-3 whitespace-nowrap">
              <Truck className="w-3.5 h-3.5" />
              Rider Dispatch · Olongapo City
            </span>
          </div>

          <nav aria-label="Rider Navigation" className="hidden md:flex items-center gap-2 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setActiveTab('rider_dashboard');
                onSelectSection('dispatch');
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'rider_dashboard' && section === 'dispatch'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10'
              }`}
            >
              Active Dispatch
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('rider_dashboard');
                onSelectSection('earnings');
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'rider_dashboard' && section === 'earnings'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10'
              }`}
            >
              Earnings Ledger
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('rider_dashboard');
                onSelectSection('ratings');
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'rider_dashboard' && section === 'ratings'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10'
              }`}
            >
              My Ratings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'account'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10'
              }`}
            >
              Rider Profile
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[38px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="medex-glass-subtle border-b border-white/45 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>
            Courier:{' '}
            <strong className="text-slate-900 dark:text-white">
              {currentUser.first_name} {currentUser.last_name}
            </strong>{' '}
            · {riderProfile?.vehicle_type || 'Motorcycle'} ({riderProfile?.plate_number || 'Olongapo'})
          </span>
          <span className="font-medium text-teal-700 dark:text-teal-400">
            Service Zone: Olongapo City Barangays
          </span>
        </div>
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12">
        {children}
      </main>

      <FloatingMobileNav
        ariaLabel="Rider Mobile Navigation"
        breakpoint="md"
        items={[
          {
            id: 'dispatch',
            label: 'Active Dispatch',
            icon: Truck,
            featured: true,
            tone: 'primary',
            active: activeTab === 'rider_dashboard' && section === 'dispatch',
            onSelect: () => {
              setActiveTab('rider_dashboard');
              onSelectSection('dispatch');
            },
          },
          {
            id: 'earnings',
            label: 'Earnings Ledger',
            icon: Wallet,
            active: activeTab === 'rider_dashboard' && section === 'earnings',
            onSelect: () => {
              setActiveTab('rider_dashboard');
              onSelectSection('earnings');
            },
          },
          {
            id: 'ratings',
            label: 'My Ratings',
            icon: Star,
            active: activeTab === 'rider_dashboard' && section === 'ratings',
            onSelect: () => {
              setActiveTab('rider_dashboard');
              onSelectSection('ratings');
            },
          },
          {
            id: 'account',
            label: 'Rider Profile',
            icon: User,
            active: activeTab === 'account',
            onSelect: () => setActiveTab('account'),
          },
        ]}
      />
    </div>
  );
};

interface AdminDashboardShellProps {
  section: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  children: React.ReactNode;
}

export const AdminDashboardShell: React.FC<AdminDashboardShellProps> = ({
  section,
  onSelectSection,
  children,
}) => {
  const {
    state,
    currentUser,
    activeTab,
    setActiveTab,
    logout,
  } = useMedEx();

  const pendingApprovals = state.users.filter((u) => u.status === 'pending').length;
  const unverifiedAlerts = state.alerts.filter(
    (a) => a.status !== 'cancelled' && !a.verification
  ).length;
  const flaggedCount = state.orders.filter(
    (o) => o.payment.is_flagged || o.delivery?.is_flagged_for_admin
  ).length;

  const openReportsCount = state.problemReports.filter(
    (r) => r.status === 'open' || r.status === 'acknowledged' || r.status === 'escalated'
  ).length;
  const internalStaffCount = state.users.filter((u) =>
    INTERNAL_ADMIN_ROLES.includes(u.role as (typeof INTERNAL_ADMIN_ROLES)[number])
  ).length;

  const navItems: Array<{
    id: AdminSection;
    label: string;
    badge?: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'alerts', label: 'Emergency Verification', badge: unverifiedAlerts, icon: ShieldAlert },
    { id: 'users', label: 'Users & Approvals', badge: pendingApprovals, icon: Users },
    { id: 'internal_roles', label: 'Internal Roles & Access', badge: internalStaffCount, icon: KeyRound },
    { id: 'catalog', label: 'Catalog & Pharmacies', badge: state.products.length, icon: Store },
    { id: 'zones', label: 'Olongapo Zones', icon: MapPin },
    { id: 'orders', label: 'Orders & Flags', badge: flaggedCount, icon: Package },
    { id: 'feedback', label: 'Feedback & Ratings', badge: openReportsCount, icon: MessageSquare },
    { id: 'reports', label: 'Audit Logs & Reports', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-32 right-10 w-96 h-96 rounded-full bg-teal-500/12 dark:bg-teal-500/18 blur-3xl"
      />
      <OfflineIndicator />

      <div className="flex-1 flex relative">
        {/* Dark Frosted Enterprise Admin Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col medex-glass-dark border-r border-white/12 text-slate-100 sticky top-0 h-screen">
          <div className="p-5 border-b border-white/10 space-y-2">
            <MedExLogo size={28} showWordmark darkSurface />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 pt-1">
              Olongapo Operations Admin
            </p>
          </div>

          <nav aria-label="Admin Console Navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === 'admin_dashboard' && section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab('admin_dashboard');
                    onSelectSection(item.id);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    selected
                      ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('locator')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'locator'
                    ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Public Olongapo Locator</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'account'
                    ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span>Admin Account</span>
              </button>
            </div>
          </nav>

          <div className="p-4 border-t border-white/10">
            <button
              type="button"
              onClick={logout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/10 hover:bg-white/18 backdrop-blur-md px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.22)] transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Admin Workspace Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 medex-glass-header border-b border-white/55 dark:border-white/12 h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden">
                <MedExLogo size={26} showWordmark={false} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                  <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>MedEx Governance Console · Olongapo City</span>
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  Administrator: {currentUser.first_name} {currentUser.last_name} ({currentUser.email})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle />
              <PWAInstallButton />
              <button
                type="button"
                onClick={logout}
                className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[36px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-12">
            {children}
          </main>
        </div>
      </div>

      {/* Floating Admin Capsule Nav (5 slots + More drawer) */}
      <FloatingMobileNav
        ariaLabel="Admin Mobile Navigation"
        breakpoint="lg"
        items={[
          {
            id: 'users',
            label: 'Users & Approvals',
            icon: Users,
            badge: pendingApprovals,
            active: activeTab === 'admin_dashboard' && section === 'users',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('users');
            },
          },
          {
            id: 'catalog',
            label: 'Catalog & Pharmacies',
            icon: Store,
            badge: state.products.length,
            active: activeTab === 'admin_dashboard' && section === 'catalog',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('catalog');
            },
          },
          {
            id: 'alerts',
            label: 'Emergency Verification',
            icon: ShieldAlert,
            badge: unverifiedAlerts,
            featured: true,
            tone: 'emergency',
            active: activeTab === 'admin_dashboard' && section === 'alerts',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('alerts');
            },
          },
          {
            id: 'orders',
            label: 'Orders & Flags',
            icon: Package,
            badge: flaggedCount,
            active: activeTab === 'admin_dashboard' && section === 'orders',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('orders');
            },
          },
          {
            id: 'internal_roles',
            label: 'Internal Roles & Access',
            icon: KeyRound,
            badge: internalStaffCount,
            active: activeTab === 'admin_dashboard' && section === 'internal_roles',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('internal_roles');
            },
          },
          {
            id: 'zones',
            label: 'Olongapo Zones',
            icon: MapPin,
            active: activeTab === 'admin_dashboard' && section === 'zones',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('zones');
            },
          },
          {
            id: 'feedback',
            label: 'Feedback & Ratings',
            icon: MessageSquare,
            badge: openReportsCount,
            active: activeTab === 'admin_dashboard' && section === 'feedback',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('feedback');
            },
          },
          {
            id: 'reports',
            label: 'Audit Logs & Reports',
            icon: TrendingUp,
            active: activeTab === 'admin_dashboard' && section === 'reports',
            onSelect: () => {
              setActiveTab('admin_dashboard');
              onSelectSection('reports');
            },
          },
          {
            id: 'locator',
            label: 'Public Olongapo Locator',
            icon: LayoutDashboard,
            active: activeTab === 'locator',
            onSelect: () => setActiveTab('locator'),
          },
          {
            id: 'account',
            label: 'Admin Account',
            icon: User,
            active: activeTab === 'account',
            onSelect: () => setActiveTab('account'),
          },
        ]}
      />
    </div>
  );
};

interface DepartmentShellItem<T extends string> {
  id: T;
  label: string;
  mobileLabel: string;
  badge?: number;
  icon: React.ComponentType<{ className?: string }>;
}

interface DepartmentShellProps<T extends string> {
  dashboardTab: ActiveTab;
  section: T;
  onSelectSection: (section: T) => void;
  departmentTitle: string;
  departmentSubtitle: string;
  consoleHeading: string;
  navItems: Array<DepartmentShellItem<T>>;
  children: React.ReactNode;
}

function DepartmentDashboardShellBase<T extends string>({
  dashboardTab,
  section,
  onSelectSection,
  departmentTitle,
  departmentSubtitle,
  consoleHeading,
  navItems,
  children,
}: DepartmentShellProps<T>) {
  const { currentUser, activeTab, setActiveTab, unreadNotificationCount, logout } = useMedEx();

  return (
    <div className="min-h-screen medex-ambient-canvas text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-32 right-10 w-96 h-96 rounded-full bg-teal-500/12 dark:bg-teal-500/18 blur-3xl"
      />
      <OfflineIndicator />

      <div className="flex-1 flex relative">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col medex-glass-dark border-r border-white/12 text-slate-100 sticky top-0 h-screen">
          <div className="p-5 border-b border-white/10 space-y-2">
            <MedExLogo size={28} showWordmark darkSurface />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 pt-1">
              {departmentTitle}
            </p>
            <p className="text-[11px] text-slate-300 leading-snug">{departmentSubtitle}</p>
          </div>

          <nav aria-label={`${departmentTitle} Navigation`} className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === dashboardTab && section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(dashboardTab);
                    onSelectSection(item.id);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    selected
                      ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('locator')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'locator'
                    ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Public Olongapo Locator</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  activeTab === 'account'
                    ? 'bg-teal-500/85 text-white border border-teal-300/35 shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span>Staff Account ({unreadNotificationCount})</span>
              </button>
            </div>
          </nav>

          <div className="p-4 border-t border-white/10">
            <button
              type="button"
              onClick={logout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/10 hover:bg-white/18 backdrop-blur-md px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.22)] transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 medex-glass-header border-b border-white/55 dark:border-white/12 h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden">
                <MedExLogo size={26} showWordmark={false} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                  <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate">{consoleHeading}</span>
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  {departmentTitle}: {currentUser.first_name} {currentUser.last_name} ({currentUser.email})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle />
              <PWAInstallButton />
              <button
                type="button"
                onClick={logout}
                className="medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:brightness-105 whitespace-nowrap min-h-[36px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-12">
            {children}
          </main>
        </div>
      </div>

      <FloatingMobileNav
        ariaLabel={`${departmentTitle} Mobile Navigation`}
        breakpoint="lg"
        items={[
          ...navItems.map(
            (item, idx): FloatingMobileNavItem => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              badge: item.badge,
              featured: idx === 0,
              tone: 'primary',
              active: activeTab === dashboardTab && section === item.id,
              onSelect: () => {
                setActiveTab(dashboardTab);
                onSelectSection(item.id);
              },
            })
          ),
          {
            id: 'locator',
            label: 'Public Olongapo Locator',
            icon: LayoutDashboard,
            active: activeTab === 'locator',
            onSelect: () => setActiveTab('locator'),
          },
          {
            id: 'account',
            label: 'Staff Account',
            icon: User,
            badge: unreadNotificationCount,
            active: activeTab === 'account',
            onSelect: () => setActiveTab('account'),
          },
        ]}
      />
    </div>
  );
}

export const DeliveryManagementDashboardShell: React.FC<{
  section: DeliveryManagementSection;
  onSelectSection: (section: DeliveryManagementSection) => void;
  children: React.ReactNode;
}> = ({ section, onSelectSection, children }) => {
  const { state } = useMedEx();
  const activeDeliveriesCount = state.orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;
  const activeRidersCount = state.users.filter(
    (u) => u.role === 'rider' && u.status === 'approved'
  ).length;

  return (
    <DepartmentDashboardShellBase
      dashboardTab="delivery_management_dashboard"
      section={section}
      onSelectSection={onSelectSection}
      departmentTitle="Delivery Management"
      departmentSubtitle="Dispatch Monitoring, Rider Assignment & Fleet Status"
      consoleHeading="MedEx Delivery Operations Console · Olongapo City"
      navItems={[
        { id: 'deliveries', label: 'Active & Shipped Deliveries', mobileLabel: 'Deliveries', badge: activeDeliveriesCount, icon: Package },
        { id: 'riders', label: 'Rider Fleet & Status', mobileLabel: 'Riders', badge: activeRidersCount, icon: Truck },
        { id: 'analytics', label: 'Delivery Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
      ]}
    >
      {children}
    </DepartmentDashboardShellBase>
  );
};

export const CouponHandlerDashboardShell: React.FC<{
  section: CouponHandlerSection;
  onSelectSection: (section: CouponHandlerSection) => void;
  children: React.ReactNode;
}> = ({ section, onSelectSection, children }) => {
  const { state } = useMedEx();
  const activeCoupons = state.coupons.filter((c) => c.is_active).length;

  return (
    <DepartmentDashboardShellBase
      dashboardTab="coupon_handler_dashboard"
      section={section}
      onSelectSection={onSelectSection}
      departmentTitle="Coupon Handler"
      departmentSubtitle="Promo Rules, Store/User Targeting & Redemption Audits"
      consoleHeading="MedEx Promotional Governance Console · Olongapo City"
      navItems={[
        { id: 'campaigns', label: 'Coupons & Campaigns', mobileLabel: 'Coupons', badge: activeCoupons, icon: Ticket },
        { id: 'redemptions', label: 'Redemption Audit Log', mobileLabel: 'Audits', badge: state.couponRedemptions.length, icon: FileCheck2 },
        { id: 'analytics', label: 'Promo Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
      ]}
    >
      {children}
    </DepartmentDashboardShellBase>
  );
};

export const InventoryManagementDashboardShell: React.FC<{
  section: InventoryManagementSection;
  onSelectSection: (section: InventoryManagementSection) => void;
  children: React.ReactNode;
}> = ({ section, onSelectSection, children }) => {
  const { state } = useMedEx();
  const lowOrOutCount = state.products.filter(
    (p) => !p.is_archived && p.stock_quantity <= p.low_stock_threshold
  ).length;

  return (
    <DepartmentDashboardShellBase
      dashboardTab="inventory_management_dashboard"
      section={section}
      onSelectSection={onSelectSection}
      departmentTitle="Inventory Management"
      departmentSubtitle="Stores → Products → Stock Levels & Restocking Alerts"
      consoleHeading="MedEx Inventory Oversight Console · Olongapo City"
      navItems={[
        { id: 'stores', label: 'Stores & Stock Levels', mobileLabel: 'Stores', badge: lowOrOutCount, icon: Boxes },
        { id: 'movements', label: 'Inventory Movements', mobileLabel: 'Movements', badge: state.inventoryMovements.length, icon: TrendingUp },
        { id: 'analytics', label: 'Stock Health Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
      ]}
    >
      {children}
    </DepartmentDashboardShellBase>
  );
};

export const CustomerServiceDashboardShell: React.FC<{
  section: CustomerServiceSection;
  onSelectSection: (section: CustomerServiceSection) => void;
  children: React.ReactNode;
}> = ({ section, onSelectSection, children }) => {
  const { state } = useMedEx();
  const openTickets = state.problemReports.filter(
    (r) => r.status === 'open' || r.status === 'acknowledged' || r.status === 'escalated'
  ).length;
  const pendingReturns = state.returnRequests.filter(
    (r) => r.status === 'requested' || r.status === 'escalated' || r.status === 'store_rejected'
  ).length;

  return (
    <DepartmentDashboardShellBase
      dashboardTab="customer_service_dashboard"
      section={section}
      onSelectSection={onSelectSection}
      departmentTitle="Customer Service"
      departmentSubtitle="Complaints, Store Escalations, Return Disputes & Reviews"
      consoleHeading="MedEx Customer Care & Escalations · Olongapo City"
      navItems={[
        { id: 'complaints', label: 'Complaints & Escalations', mobileLabel: 'Tickets', badge: openTickets, icon: Headphones },
        { id: 'returns', label: 'Return & Refund Disputes', mobileLabel: 'Returns', badge: pendingReturns, icon: RotateCcw },
        { id: 'reviews', label: 'Reviews Moderation', mobileLabel: 'Reviews', icon: MessageSquare },
        { id: 'analytics', label: 'Support Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
      ]}
    >
      {children}
    </DepartmentDashboardShellBase>
  );
};

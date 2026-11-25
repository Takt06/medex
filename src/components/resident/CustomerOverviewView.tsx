import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  FileCheck2,
  KeyRound,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  Star,
  Store,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import {
  computePharmacyRatingSummary,
  formatPHP,
  getApprovedStorefrontMerchantIds,
  getMerchantOpenStatus,
} from '../../utils/medexRules';

interface CustomerOverviewViewProps {
  onOpenCart: () => void;
}

export const CustomerOverviewView: React.FC<CustomerOverviewViewProps> = ({ onOpenCart }) => {
  const {
    state,
    currentUser,
    activeCart,
    unreadNotificationCount,
    draftRxProof,
    setActiveTab,
    setLocatorSearchDraft,
  } = useMedEx();

  const [quickQuery, setQuickQuery] = useState('');

  const primaryAddress = useMemo(() => {
    const mine = state.addresses.filter((a) => a.user_id === currentUser.user_id);
    return mine.find((a) => a.is_primary) || mine[0] || null;
  }, [state.addresses, currentUser.user_id]);

  const primaryBrgy = state.barangays.find((b) => b.barangay_id === primaryAddress?.barangay_id);

  const myOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.resident_id === currentUser.user_id)
        .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()),
    [state.orders, currentUser.user_id]
  );

  const activeOrders = useMemo(
    () => myOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status)),
    [myOrders]
  );

  const latestPinOrder = useMemo(
    () => activeOrders.find((o) => o.delivery?.confirmation_code),
    [activeOrders]
  );

  const approvedPharmacies = useMemo(() => {
    const approvedIds = getApprovedStorefrontMerchantIds(state.merchants, state.users);
    return state.merchants
      .filter((m) => approvedIds.has(m.merchant_id))
      .map((merchant) => {
        const addr = state.addresses.find((a) => a.address_id === merchant.shop_address_id);
        const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
        const hours = state.merchantHours.filter((h) => h.merchant_id === merchant.merchant_id);
        const openStatus = getMerchantOpenStatus(merchant, hours);
        const inStockCount = state.products.filter(
          (p) => p.merchant_id === merchant.merchant_id && p.is_listed && p.stock_quantity > 0
        ).length;
        return { merchant, addr, brgy, openStatus, inStockCount };
      });
  }, [state]);

  const openPharmaciesCount = approvedPharmacies.filter((p) => p.openStatus.isOpen).length;
  const cartItemsCount = activeCart.items.reduce((s, i) => s + i.quantity, 0);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLocatorSearchDraft(quickQuery.trim() || 'Paracetamol 500mg');
    setActiveTab('locator');
  };

  return (
    <div className="space-y-6">
      {/* Customer Welcome & Instant Olongapo Search Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="medex-glass rounded-3xl border bg-gradient-to-br from-teal-500/18 via-white/25 to-sky-500/16 dark:from-teal-500/20 dark:via-slate-900/45 dark:to-sky-500/16 p-6 sm:p-7 space-y-5 relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-teal-400/15 dark:bg-teal-400/15 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-14 -bottom-16 w-52 h-52 rounded-full bg-sky-400/12 dark:bg-sky-500/12 blur-2xl"
        />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white font-display font-bold text-base items-center justify-center shadow-md shrink-0">
              {currentUser.first_name[0]}
              {currentUser.last_name[0]}
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300">
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  CUSTOMER HOME · {primaryBrgy ? `Brgy. ${primaryBrgy.name}, ` : ''}
                  {primaryBrgy?.city || 'Olongapo City'}
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Welcome back, {currentUser.first_name}
              </h1>
              <p className="text-sm text-slate-700 dark:text-slate-300 max-w-2xl">
                Search live Olongapo City pharmacy stock, upload doctor prescriptions for controlled
                medicines, track handoff PINs, and share verified pharmacy &amp; rider feedback.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('emergency')}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200/90 dark:border-red-800/70 bg-red-50/85 dark:bg-red-950/60 backdrop-blur-md px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 transition-colors min-h-[40px] whitespace-nowrap"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Emergency SOS</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('locator')}
              className="medex-btn-lift inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors min-h-[40px] whitespace-nowrap"
            >
              <span>Open Olongapo Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>

        <form onSubmit={handleQuickSearch} className="relative flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Search Olongapo pharmacies for Paracetamol 500mg, Amoxicillin, ORS..."
              aria-label="Quick search Olongapo medicines"
              className="w-full rounded-xl border border-white/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/75 backdrop-blur-md pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-2 focus:outline-teal-600"
            />
          </div>
          <motion.button
            type="submit"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-slate-900 dark:bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-teal-400 whitespace-nowrap shrink-0"
          >
            Find Stock
          </motion.button>
        </form>
      </motion.section>

      {/* Pre-attached Rx Proof Strip or Quick Controlled-Medicine Info */}
      {draftRxProof ? (
        <div className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-teal-900 dark:text-teal-200">
            <FileCheck2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
            <span>
              <strong>Doctor&apos;s Rx Proof Ready:</strong> {draftRxProof.file_name} ({draftRxProof.doctor_name})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className="text-xs font-semibold text-teal-800 dark:text-teal-300 hover:underline whitespace-nowrap"
          >
            Order Rx Medicines →
          </button>
        </div>
      ) : null}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setActiveTab('orders')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>Active Orders</span>
            <span className="w-7 h-7 rounded-lg bg-teal-500/12 dark:bg-teal-400/15 flex items-center justify-center">
              <Package className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {activeOrders.length}
          </p>
          <p className="text-[11px] text-teal-700 dark:text-teal-400 font-medium mt-1">
            View status &amp; Rx →
          </p>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setActiveTab('orders')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>Handoff PIN</span>
            <span className="w-7 h-7 rounded-lg bg-teal-500/12 dark:bg-teal-400/15 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </span>
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums tracking-wider">
            {latestPinOrder?.delivery?.confirmation_code || '—'}
          </p>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1 truncate">
            {latestPinOrder ? latestPinOrder.order_code : 'No rider handoff active'}
          </p>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setActiveTab('locator')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>Olongapo Pharmacies</span>
            <span className="w-7 h-7 rounded-lg bg-teal-500/12 dark:bg-teal-400/15 flex items-center justify-center">
              <Store className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {openPharmaciesCount} / {approvedPharmacies.length}
          </p>
          <p className="text-[11px] text-teal-700 dark:text-teal-400 font-medium mt-1">
            Open right now →
          </p>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => (cartItemsCount > 0 ? onOpenCart() : setActiveTab('account'))}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>{cartItemsCount > 0 ? 'Cart Items' : 'Unread Notices'}</span>
            <span className="w-7 h-7 rounded-lg bg-teal-500/12 dark:bg-teal-400/15 flex items-center justify-center">
              {cartItemsCount > 0 ? (
                <ShoppingBag className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              ) : (
                <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              )}
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            {cartItemsCount > 0 ? cartItemsCount : unreadNotificationCount}
          </p>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1">
            {cartItemsCount > 0 ? 'Ready for checkout' : 'Account alerts & updates'}
          </p>
        </motion.button>
      </div>

      {/* Main Split: Active Orders Snapshot + Participating Olongapo Pharmacies */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 medex-glass rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Your Recent &amp; Active Orders
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Live pharmacist Rx review and rider updates
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              View All Orders →
            </button>
          </div>

          {myOrders.length === 0 ? (
            <div className="rounded-xl medex-glass-subtle border p-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No orders placed yet
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('store')}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Browse Olongapo Store
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myOrders.slice(0, 3).map((order) => {
                const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
                return (
                  <div
                    key={order.order_id}
                    className="rounded-xl medex-glass-subtle border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {order.order_code}
                        </span>
                        <span className="text-slate-400 dark:text-slate-600">·</span>
                        <span className="font-semibold uppercase text-teal-700 dark:text-teal-400">
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {merchant?.shop_name}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')} ·{' '}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatPHP(order.total_amount)}
                        </span>
                      </p>
                    </div>
                    {order.delivery?.confirmation_code && (
                      <div className="rounded-lg bg-white/85 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-center shrink-0">
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                          Handoff PIN
                        </span>
                        <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400 tracking-widest">
                          {order.delivery.confirmation_code}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 medex-glass rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Olongapo City Partner Pharmacies
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live coverage across Olongapo City partner barangays
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              Browse Store →
            </button>
          </div>

          <div className="space-y-3">
            {approvedPharmacies.map(({ merchant, addr, brgy, openStatus, inStockCount }) => {
              const ratingSummary = computePharmacyRatingSummary(
                state.pharmacyReviews,
                merchant.merchant_id
              );
              return (
                <div
                  key={merchant.merchant_id}
                  className="rounded-xl medex-glass-subtle border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          openStatus.isOpen
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {openStatus.label}
                      </span>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {inStockCount} items in stock
                      </span>
                      {ratingSummary.count > 0 && (
                        <>
                          <span className="text-slate-400 dark:text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                            {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {merchant.shop_name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span>
                        {addr?.street}, Brgy. {brgy?.name}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setLocatorSearchDraft('__ALL__');
                      setActiveTab('locator');
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                  >
                    View Map &amp; Stock
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

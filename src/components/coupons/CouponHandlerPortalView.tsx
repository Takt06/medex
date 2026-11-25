import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Edit3,
  Plus,
  Search,
  Ticket,
  Trash2,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Coupon, CouponDiscountType, CouponTargetSegment } from '../../types/medex';
import { formatPHP } from '../../utils/medexRules';
import type { CouponHandlerSection } from '../layout/RoleDashboards';

interface CouponHandlerPortalViewProps {
  section: CouponHandlerSection;
}

const SEGMENT_LABELS: Record<CouponTargetSegment, string> = {
  all: 'All Customers',
  new_customer: 'New Customers (0 Prior Orders)',
  repeat_customer: 'Repeat Customers (1+ Orders)',
  selected_customers: 'Selected Customer Accounts',
};

export const CouponHandlerPortalView: React.FC<CouponHandlerPortalViewProps> = ({ section }) => {
  const { state, hasCurrentPermission, saveCoupon, deleteCoupon } = useMedEx();

  const canCreate = hasCurrentPermission('coupons:create');
  const canUpdate = hasCurrentPermission('coupons:update');
  const canDelete = hasCurrentPermission('coupons:delete');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('150');
  const [minPurchaseAmount, setMinPurchaseAmount] = useState('300');
  const [usageLimitTotal, setUsageLimitTotal] = useState('100');
  const [usageLimitPerUser, setUsageLimitPerUser] = useState('1');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = useState(() =>
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16)
  );
  const [targetSegment, setTargetSegment] = useState<CouponTargetSegment>('all');
  const [selectedMerchants, setSelectedMerchants] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedResidents, setSelectedResidents] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [redemptionFilter, setRedemptionFilter] = useState<'all' | 'redeemed' | 'failed'>('all');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const residents = useMemo(
    () => state.users.filter((u) => u.role === 'resident'),
    [state.users]
  );

  const stats = useMemo(() => {
    const activeCount = state.coupons.filter((c) => c.is_active).length;
    const redeemedLogs = state.couponRedemptions.filter((r) => r.status === 'redeemed');
    const failedLogs = state.couponRedemptions.filter((r) => r.status === 'failed');
    const totalDiscountGranted = redeemedLogs.reduce((s, r) => s + r.discount_amount, 0);
    return {
      activeCount,
      redeemedCount: redeemedLogs.length,
      failedCount: failedLogs.length,
      totalDiscountGranted,
    };
  }, [state.coupons, state.couponRedemptions]);

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue('10');
    setMaxDiscountAmount('150');
    setMinPurchaseAmount('300');
    setUsageLimitTotal('100');
    setUsageLimitPerUser('1');
    setStartsAt(new Date().toISOString().slice(0, 16));
    setExpiresAt(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
    setTargetSegment('all');
    setSelectedMerchants([]);
    setSelectedProducts([]);
    setSelectedResidents([]);
    setIsActive(true);
  };

  const loadForEdit = (c: Coupon) => {
    setEditingId(c.coupon_id);
    setCode(c.code);
    setTitle(c.title);
    setDescription(c.description);
    setDiscountType(c.discount_type);
    setDiscountValue(String(c.discount_value));
    setMaxDiscountAmount(c.max_discount_amount !== null ? String(c.max_discount_amount) : '');
    setMinPurchaseAmount(String(c.min_purchase_amount));
    setUsageLimitTotal(c.usage_limit_total !== null ? String(c.usage_limit_total) : '');
    setUsageLimitPerUser(String(c.usage_limit_per_user));
    setStartsAt(new Date(c.starts_at).toISOString().slice(0, 16));
    setExpiresAt(new Date(c.expires_at).toISOString().slice(0, 16));
    setTargetSegment(c.target_segment);
    setSelectedMerchants(c.applicable_merchant_ids);
    setSelectedProducts(c.applicable_product_ids);
    setSelectedResidents(c.eligible_resident_ids);
    setIsActive(c.is_active);
    setFeedback(null);
  };

  const toggleId = (list: number[], id: number, setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFeedback(null);
    setBusy(true);
    const res = await saveCoupon({
      coupon_id: editingId ?? undefined,
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      max_discount_amount:
        discountType === 'percentage' && maxDiscountAmount.trim() !== ''
          ? Number(maxDiscountAmount)
          : null,
      min_purchase_amount: Math.max(0, Number(minPurchaseAmount) || 0),
      usage_limit_total: usageLimitTotal.trim() !== '' ? Math.max(1, Number(usageLimitTotal)) : null,
      usage_limit_per_user: Math.max(1, Number(usageLimitPerUser) || 1),
      starts_at: new Date(startsAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      is_active: isActive,
      target_segment: targetSegment,
      applicable_merchant_ids: selectedMerchants,
      applicable_product_ids: selectedProducts,
      eligible_resident_ids: targetSegment === 'selected_customers' ? selectedResidents : [],
    });
    setBusy(false);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Could not save coupon.' });
      return;
    }
    setFeedback({
      ok: true,
      text: editingId ? `Updated coupon ${res.data?.code}.` : `Created coupon ${res.data?.code}.`,
    });
    resetForm();
  };

  const handleToggleActive = async (c: Coupon) => {
    setBusy(true);
    const res = await saveCoupon({
      ...c,
      is_active: !c.is_active,
    });
    setBusy(false);
    setFeedback(
      res.ok
        ? { ok: true, text: `${c.code} is now ${!c.is_active ? 'Active' : 'Paused'}.` }
        : { ok: false, text: res.error || 'Failed to update coupon status.' }
    );
  };

  const handleDelete = async (couponId: number, couponCode: string) => {
    setBusy(true);
    const res = await deleteCoupon(couponId);
    setBusy(false);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Failed to delete coupon.' });
      return;
    }
    if (editingId === couponId) resetForm();
    setFeedback({ ok: true, text: `Deleted coupon ${couponCode}.` });
  };

  const filteredCoupons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.coupons.filter(
      (c) =>
        !q ||
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [state.coupons, searchQuery]);

  const filteredRedemptions = useMemo(() => {
    return state.couponRedemptions.filter(
      (r) => redemptionFilter === 'all' || r.status === redemptionFilter
    );
  }, [state.couponRedemptions, redemptionFilter]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Active Campaigns
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {stats.activeCount} / {state.coupons.length}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Valid Redemptions
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {stats.redeemedCount}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Blocked / Failed Uses
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {stats.failedCount}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Discounts Granted
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatPHP(stats.totalDiscountGranted)}
          </p>
        </div>
      </section>

      {feedback && (
        <div
          role={feedback.ok ? 'status' : 'alert'}
          className={`rounded-2xl border px-4 py-3 text-xs font-medium flex items-center gap-2 ${
            feedback.ok
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100'
              : 'border-red-400/45 bg-red-500/15 text-red-950 dark:text-red-100'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {section === 'campaigns' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Create / Edit Coupon Form */}
          {(canCreate || (editingId !== null && canUpdate)) && (
            <form
              onSubmit={handleSave}
              className="xl:col-span-5 medex-glass rounded-2xl border p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>{editingId ? 'Edit Coupon Campaign' : 'Create Promo Coupon'}</span>
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline"
                  >
                    New Coupon
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Promo Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., OLONGAPO20"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Campaign Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., 20% Off Wellness"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe promo eligibility and savings..."
                  className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Value {discountType === 'percentage' ? '(%)' : '(₱)'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Max Cap (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={discountType !== 'percentage'}
                    placeholder="Optional"
                    value={maxDiscountAmount}
                    onChange={(e) => setMaxDiscountAmount(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Min Spend (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minPurchaseAmount}
                    onChange={(e) => setMinPurchaseAmount(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Total Cap
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={usageLimitTotal}
                    onChange={(e) => setUsageLimitTotal(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Per User
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={usageLimitPerUser}
                    onChange={(e) => setUsageLimitPerUser(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Starts At
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs text-slate-900 dark:text-white dark:[color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                    Expires At
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-2.5 py-2 text-xs text-slate-900 dark:text-white dark:[color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  Eligible Customer Segment
                </label>
                <select
                  value={targetSegment}
                  onChange={(e) => setTargetSegment(e.target.value as CouponTargetSegment)}
                  className="w-full rounded-xl border border-white/70 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {(Object.keys(SEGMENT_LABELS) as CouponTargetSegment[]).map((seg) => (
                    <option key={seg} value={seg}>
                      {SEGMENT_LABELS[seg]}
                    </option>
                  ))}
                </select>
              </div>

              {targetSegment === 'selected_customers' && (
                <div className="rounded-xl medex-glass-subtle border p-3 space-y-1.5 max-h-32 overflow-y-auto">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Select Eligible Customer Accounts
                  </p>
                  {residents.map((resUser) => (
                    <label key={resUser.user_id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedResidents.includes(resUser.user_id)}
                        onChange={() =>
                          toggleId(selectedResidents, resUser.user_id, setSelectedResidents)
                        }
                      />
                      <span>
                        {resUser.first_name} {resUser.last_name} ({resUser.email})
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="rounded-xl medex-glass-subtle border p-3 space-y-1.5 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Restrict to Pharmacy Stores (leave unchecked for all stores)
                </p>
                {state.merchants.map((m) => (
                  <label key={m.merchant_id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedMerchants.includes(m.merchant_id)}
                      onChange={() =>
                        toggleId(selectedMerchants, m.merchant_id, setSelectedMerchants)
                      }
                    />
                    <span>{m.shop_name}</span>
                  </label>
                ))}
              </div>

              <div className="rounded-xl medex-glass-subtle border p-3 space-y-1.5 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Restrict to Specific Products (optional)
                </p>
                {state.products
                  .filter((p) => !p.is_archived)
                  .slice(0, 40)
                  .map((p) => (
                    <label key={p.product_id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(p.product_id)}
                        onChange={() =>
                          toggleId(selectedProducts, p.product_id, setSelectedProducts)
                        }
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Campaign is Active immediately</span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 py-2.5 text-xs font-semibold text-white"
              >
                {busy ? 'Saving...' : editingId ? 'Save Coupon Changes' : 'Create Coupon'}
              </button>
            </form>
          )}

          {/* Coupon List */}
          <div className="xl:col-span-7 space-y-3">
            <div className="medex-glass rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Promotional Coupons ({filteredCoupons.length})
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Manage coupon eligibility, expiration dates, caps, and activation status.
                </p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search promo code..."
                  className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {filteredCoupons.map((c) => {
              const expired = new Date(c.expires_at).getTime() < Date.now();
              return (
                <article key={c.coupon_id} className="medex-glass rounded-2xl border p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600/15 dark:bg-teal-400/15 border border-teal-500/35 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-800 dark:text-teal-200">
                          <Ticket className="w-3.5 h-3.5" />
                          {c.code}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            !c.is_active
                              ? 'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                              : expired
                                ? 'bg-red-500/20 text-red-800 dark:text-red-200'
                                : 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                          }`}
                        >
                          {!c.is_active ? 'Paused' : expired ? 'Expired' : 'Active'}
                        </span>
                        <span className="rounded-md bg-white/60 dark:bg-slate-900/50 border border-white/50 dark:border-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          {SEGMENT_LABELS[c.target_segment]}
                        </span>
                      </div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {c.title}
                      </h3>
                      {c.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">{c.description}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-display text-base font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                        {c.discount_type === 'percentage'
                          ? `${c.discount_value}% OFF`
                          : `${formatPHP(c.discount_value)} OFF`}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                        Min {formatPHP(c.min_purchase_amount)}
                        {c.max_discount_amount ? ` · Cap ${formatPHP(c.max_discount_amount)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/45 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="tabular-nums">
                      Used: <strong>{c.times_used}</strong>
                      {c.usage_limit_total ? ` / ${c.usage_limit_total}` : ' (Unlimited)'} · Limit{' '}
                      {c.usage_limit_per_user}/user · Expires{' '}
                      {new Date(c.expires_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {canUpdate && (
                        <>
                          <button
                            type="button"
                            onClick={() => loadForEdit(c)}
                            className="inline-flex items-center gap-1 rounded-lg medex-glass-subtle border px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleActive(c)}
                            className="rounded-lg medex-glass-subtle border px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105"
                          >
                            {c.is_active ? 'Pause' : 'Activate'}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(c.coupon_id, c.code)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/35 px-2.5 py-1 text-xs font-semibold text-red-800 dark:text-red-200"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredCoupons.length === 0 && (
              <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
                No promotional coupons match your search yet. Use the form on the left to publish a new campaign.
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'redemptions' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Coupon Redemption &amp; Failed Attempt Audit Log
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Server-validated promo applications and rejected invalid checkout attempts.
              </p>
            </div>
            <div className="flex gap-2">
              {(['all', 'redeemed', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRedemptionFilter(st)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize ${
                    redemptionFilter === st
                      ? 'bg-teal-600 text-white border-teal-500'
                      : 'medex-glass-subtle text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredRedemptions.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              No coupon redemption records logged yet.
            </div>
          ) : (
            <div className="medex-glass rounded-2xl border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/50 dark:border-white/10 text-[11px] uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Order</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Reason / Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40 dark:divide-white/10">
                  {filteredRedemptions.map((log) => {
                    const user = state.users.find((u) => u.user_id === log.resident_id);
                    const order = state.orders.find((o) => o.order_id === log.order_id);
                    return (
                      <tr key={log.redemption_id}>
                        <td className="p-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                          {log.coupon_code}
                        </td>
                        <td className="p-3 text-slate-800 dark:text-slate-200">
                          {user ? `${user.first_name} ${user.last_name}` : `User #${log.resident_id}`}
                        </td>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                          {order ? order.order_code : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              log.status === 'redeemed'
                                ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                                : 'bg-red-500/20 text-red-800 dark:text-red-200'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatPHP(log.discount_amount)}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {log.failure_reason || 'Applied successfully'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {section === 'analytics' && (
        <section className="medex-glass rounded-2xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Coupon Utilization &amp; Discount Cost Analytics
            </h1>
          </div>
          <div className="space-y-3">
            {state.coupons.map((c) => {
              const cap = c.usage_limit_total || Math.max(10, c.times_used);
              const pct = Math.min(100, Math.round((c.times_used / cap) * 100));
              const cost = state.couponRedemptions
                .filter((r) => r.coupon_code === c.code && r.status === 'redeemed')
                .reduce((s, r) => s + r.discount_amount, 0);
              return (
                <div key={c.coupon_id} className="rounded-xl medex-glass-subtle border p-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {c.code} — {c.title}
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {c.times_used} uses · {formatPHP(cost)} discounted
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 dark:bg-teal-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Sparkles,
  Store,
  Ticket,
  Wallet,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import { formatPHP } from '../../utils/medexRules';

export const CustomerCouponsView: React.FC = () => {
  const { state, currentUser, setActiveTab, claimCoupon } = useMedEx();

  const [busyId, setBusyId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const myClaims = useMemo(
    () => state.customerCoupons.filter((cc) => cc.resident_id === currentUser.user_id),
    [state.customerCoupons, currentUser.user_id]
  );

  const myRedemptions = useMemo(
    () =>
      state.couponRedemptions.filter(
        (r) => r.resident_id === currentUser.user_id && r.status === 'redeemed'
      ),
    [state.couponRedemptions, currentUser.user_id]
  );

  const availablePromos = useMemo(() => {
    const now = Date.now();
    return state.coupons.filter((c) => {
      if (!c.is_active) return false;
      if (new Date(c.expires_at).getTime() < now) return false;
      if (
        c.target_segment === 'selected_customers' &&
        c.eligible_resident_ids.length > 0 &&
        !c.eligible_resident_ids.includes(currentUser.user_id)
      ) {
        return false;
      }
      return true;
    });
  }, [state.coupons, currentUser.user_id]);

  const handleClaim = async (couponId: number) => {
    setBusyId(couponId);
    setFeedback(null);
    const res = await claimCoupon(couponId);
    setBusyId(null);
    setFeedback(
      res.ok
        ? { ok: true, text: 'Coupon claimed to your MedEx wallet! Apply it during checkout.' }
        : { ok: false, text: res.error || 'Could not claim coupon.' }
    );
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setCopiedCode(code);
    }
  };

  return (
    <div className="space-y-6">
      <section className="medex-glass rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MedEx Olongapo Savings &amp; Vouchers</span>
          </p>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Available Promos &amp; My Coupon Wallet
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Claim eligible pharmacy coupons below and select them inside your Checkout modal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('store')}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
        >
          <Store className="w-4 h-4" />
          <span>Shop Medicines</span>
        </button>
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

      {/* Available Promos */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Ticket className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>Available Promotions ({availablePromos.length})</span>
        </h2>

        {availablePromos.length === 0 ? (
          <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
            No active promotions are available right now. Check back soon!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availablePromos.map((c) => {
              const claim = myClaims.find((cc) => cc.coupon_id === c.coupon_id);
              const usesByMe = myRedemptions.filter((r) => r.coupon_id === c.coupon_id).length;
              const storeNames = c.applicable_merchant_ids
                .map((id) => state.merchants.find((m) => m.merchant_id === id)?.shop_name)
                .filter(Boolean);

              return (
                <article
                  key={c.coupon_id}
                  className="medex-glass medex-card-hover rounded-2xl border p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-teal-600/15 border border-teal-500/35 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-800 dark:text-teal-200">
                          {c.code}
                        </span>
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                          {c.title}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                          {c.discount_type === 'percentage'
                            ? `${c.discount_value}% OFF`
                            : `${formatPHP(c.discount_value)} OFF`}
                        </p>
                        {c.max_discount_amount && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            Max {formatPHP(c.max_discount_amount)}
                          </p>
                        )}
                      </div>
                    </div>

                    {c.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">{c.description}</p>
                    )}

                    <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                      <p className="tabular-nums">
                        Min spend: <strong>{formatPHP(c.min_purchase_amount)}</strong> · Uses left:{' '}
                        <strong>{Math.max(0, c.usage_limit_per_user - usesByMe)}</strong> of{' '}
                        {c.usage_limit_per_user}
                      </p>
                      <p>
                        Valid stores:{' '}
                        {storeNames.length > 0 ? storeNames.join(', ') : 'All Olongapo MedEx Pharmacies'}
                      </p>
                      <p>Expires: {new Date(c.expires_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/45 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => void handleCopy(c.code)}
                      className="inline-flex items-center gap-1 rounded-xl medex-glass-subtle border px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedCode === c.code ? 'Copied!' : 'Copy Code'}</span>
                    </button>

                    {claim ? (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{claim.status === 'used' ? 'Used' : 'In Wallet'}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === c.coupon_id}
                        onClick={() => void handleClaim(c.coupon_id)}
                        className="rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        {busyId === c.coupon_id ? 'Claiming...' : 'Claim Coupon'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Claimed Coupon Wallet */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>My Claimed Coupons ({myClaims.length})</span>
        </h2>

        {myClaims.length === 0 ? (
          <div className="medex-glass-subtle rounded-2xl border p-6 text-center text-xs text-slate-600 dark:text-slate-300">
            You haven&apos;t claimed any vouchers yet. Claim a promotion above or enter any promo code directly at checkout.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myClaims.map((claim) => {
              const coupon = state.coupons.find((c) => c.coupon_id === claim.coupon_id);
              if (!coupon) return null;
              return (
                <div
                  key={claim.claim_id}
                  className="medex-glass-subtle rounded-xl border p-3.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {coupon.code}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {coupon.title}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      claim.status === 'claimed'
                        ? 'bg-teal-500/20 text-teal-800 dark:text-teal-200'
                        : claim.status === 'used'
                          ? 'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                          : 'bg-red-500/20 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

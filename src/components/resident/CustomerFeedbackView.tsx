import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  EyeOff,
  Flag,
  MessageSquare,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Order, PharmacyReview, ProblemReportStatus } from '../../types/medex';
import {
  canEditPharmacyReview,
  formatReviewerDisplayName,
} from '../../utils/medexRules';
import { RateStoreModal, ReportProblemModal } from '../feedback/FeedbackAndRatingModals';

type FeedbackTab = 'reviews' | 'reports' | 'rider_ratings';

const REPORT_STATUS_STYLE: Record<ProblemReportStatus, string> = {
  open: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  acknowledged: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  escalated: 'bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  resolved: 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  dismissed: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

export const CustomerFeedbackView: React.FC = () => {
  const { state, currentUser, setActiveTab, escalateProblemReport } = useMedEx();
  const [subTab, setSubTab] = useState<FeedbackTab>('reviews');
  const [editingReviewState, setEditingReviewState] = useState<{
    order: Order;
    review: PharmacyReview;
  } | null>(null);
  const [appReportOpen, setAppReportOpen] = useState(false);
  const [escalatingReportId, setEscalatingReportId] = useState<number | null>(null);
  const [escalateReasonDraft, setEscalateReasonDraft] = useState('');
  const [escalateFeedback, setEscalateFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const myReviews = useMemo(
    () =>
      state.pharmacyReviews
        .filter((r) => r.resident_id === currentUser.user_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.pharmacyReviews, currentUser.user_id]
  );

  const myReports = useMemo(
    () =>
      state.problemReports
        .filter((r) => r.user_id === currentUser.user_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.problemReports, currentUser.user_id]
  );

  const myRiderRatings = useMemo(
    () =>
      state.riderRatings
        .filter((r) => r.resident_id === currentUser.user_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.riderRatings, currentUser.user_id]
  );

  const isEmpty = myReviews.length === 0 && myReports.length === 0 && myRiderRatings.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            My Feedback &amp; Reports
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track pharmacy reviews, rider delivery ratings, and reported store or locator inaccuracies.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAppReportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/40 px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Report App Problem</span>
        </button>
      </div>

      {/* Privacy Notice Banner */}
      <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/75 dark:bg-teal-950/35 px-4 py-3 flex items-start gap-2.5 text-xs text-teal-900 dark:text-teal-200">
        <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
        <p>
          <strong>Privacy &amp; Anonymity Protected:</strong> Reviews and reports marked anonymous appear to pharmacies and couriers strictly as{' '}
          <span className="font-semibold">Verified Resident (Anonymous)</span>. Your phone number, email, and home address are never shared.
        </p>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'reviews'}
          onClick={() => setSubTab('reviews')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            subTab === 'reviews'
              ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
              : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Store Reviews ({myReviews.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'reports'}
          onClick={() => setSubTab('reports')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            subTab === 'reports'
              ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
              : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Problem Reports ({myReports.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'rider_ratings'}
          onClick={() => setSubTab('rider_ratings')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            subTab === 'rider_ratings'
              ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
              : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Rider Ratings ({myRiderRatings.length})</span>
        </button>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <MessageSquare className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            You haven&apos;t submitted any reviews or problem reports yet.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            After an order is delivered, you can rate the pharmacy and your courier inside Orders, or report inaccurate pharmacy info directly from the Locator.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Go to Orders</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Store Reviews Tab */}
      {subTab === 'reviews' && !isEmpty && (
        <div className="space-y-3">
          {myReviews.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No pharmacy reviews submitted yet.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                Rate a delivered order in Orders →
              </button>
            </div>
          ) : (
            myReviews.map((review) => {
              const merchant = state.merchants.find((m) => m.merchant_id === review.merchant_id);
              const order = state.orders.find((o) => o.order_id === review.order_id);
              const editable = canEditPharmacyReview(review.created_at);

              return (
                <article
                  key={review.review_id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                          {merchant?.shop_name || 'Olongapo Pharmacy'}
                        </h3>
                        {order && (
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            · {order.order_code}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        <div className="flex items-center gap-0.5 text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${s <= review.rating ? 'fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                          <EyeOff className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                          Shown as: {formatReviewerDisplayName(currentUser, review.is_anonymous)}
                        </span>
                        {review.status === 'hidden' && (
                          <span className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                            Hidden by Admin
                          </span>
                        )}
                      </div>
                    </div>

                    {order && editable && (
                      <button
                        type="button"
                        onClick={() => setEditingReviewState({ order, review })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Review (24h window)</span>
                      </button>
                    )}
                  </div>

                  {review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {review.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {review.comment && (
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  )}

                  {review.merchant_reply && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 text-xs space-y-1">
                      <p className="font-semibold text-teal-700 dark:text-teal-400">
                        Pharmacy Reply · {review.replied_at ? new Date(review.replied_at).toLocaleDateString() : ''}
                      </p>
                      <p className="text-slate-700 dark:text-slate-300">{review.merchant_reply}</p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Problem Reports Tab */}
      {subTab === 'reports' && !isEmpty && (
        <div className="space-y-3">
          {escalateFeedback && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 ${
                escalateFeedback.type === 'error'
                  ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                  : 'border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
              }`}
            >
              <span>{escalateFeedback.text}</span>
              <button
                type="button"
                onClick={() => setEscalateFeedback(null)}
                className="underline font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {myReports.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-600 dark:text-slate-400">
              No problem reports submitted yet.
            </div>
          ) : (
            myReports.map((report) => {
              const merchant = report.merchant_id
                ? state.merchants.find((m) => m.merchant_id === report.merchant_id)
                : null;
              const product = report.product_id
                ? state.products.find((p) => p.product_id === report.product_id)
                : null;
              const canEscalate = report.status === 'open' || report.status === 'acknowledged';
              const isEscalating = escalatingReportId === report.report_id;

              return (
                <article
                  key={report.report_id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {report.reference_code}
                        </span>
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:text-slate-300">
                          {report.source}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {report.category_label}
                        </span>
                        {report.category_tag && (
                          <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:text-indigo-300">
                            {report.category_tag}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {merchant ? `${merchant.shop_name}` : 'MedEx App'}
                        {product ? ` · ${product.name}` : ''} · Submitted{' '}
                        {new Date(report.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase ${REPORT_STATUS_STYLE[report.status]}`}
                    >
                      {report.status === 'escalated' ? 'Escalated to CS' : report.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300">{report.description}</p>

                  {report.escalated_reason && (
                    <div className="rounded-xl border border-purple-200 dark:border-purple-800/70 bg-purple-50/70 dark:bg-purple-950/35 p-3 text-xs text-purple-900 dark:text-purple-200">
                      <p className="font-semibold">Escalated to Customer Service</p>
                      <p className="mt-0.5">{report.escalated_reason}</p>
                    </div>
                  )}

                  {report.resolution_note && (
                    <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/40 p-3 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-teal-700 dark:text-teal-400" />
                      <div>
                        <p className="font-semibold">Resolution Note</p>
                        <p>{report.resolution_note}</p>
                      </div>
                    </div>
                  )}

                  {canEscalate && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-2">
                      {!isEscalating ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Store hasn&apos;t resolved your issue satisfactorily?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEscalatingReportId(report.report_id);
                              setEscalateReasonDraft('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60"
                          >
                            Escalate to Customer Service
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/30 p-3 space-y-2">
                          <label
                            htmlFor={`escalate-report-${report.report_id}`}
                            className="block text-xs font-semibold text-purple-900 dark:text-purple-200"
                          >
                            Reason for escalating to Customer Service *
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              id={`escalate-report-${report.report_id}`}
                              type="text"
                              value={escalateReasonDraft}
                              onChange={(e) => setEscalateReasonDraft(e.target.value)}
                              placeholder="e.g., Store did not respond within 24h or offered incomplete fix"
                              className="flex-1 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await escalateProblemReport(
                                    report.report_id,
                                    escalateReasonDraft
                                  );
                                  if (!res.ok) {
                                    setEscalateFeedback({
                                      type: 'error',
                                      text: res.error || 'Could not escalate report.',
                                    });
                                  } else {
                                    setEscalatingReportId(null);
                                    setEscalateReasonDraft('');
                                    setEscalateFeedback({
                                      type: 'success',
                                      text: `${report.reference_code} escalated to MedEx Customer Service.`,
                                    });
                                  }
                                }}
                                className="rounded-lg bg-purple-700 hover:bg-purple-800 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                              >
                                Submit Escalation
                              </button>
                              <button
                                type="button"
                                onClick={() => setEscalatingReportId(null)}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {report.status_history.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-1">
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Status Timeline
                      </p>
                      {report.status_history.map((h) => (
                        <p key={h.history_id} className="text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-semibold uppercase text-slate-800 dark:text-slate-200">
                            {h.status}
                          </span>{' '}
                          — {h.note || 'Updated'} ({new Date(h.created_at).toLocaleString()})
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Rider Ratings Tab */}
      {subTab === 'rider_ratings' && !isEmpty && (
        <div className="space-y-3">
          {myRiderRatings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-600 dark:text-slate-400">
              No rider delivery ratings submitted yet. You can rate riders on delivered orders inside the Orders tab.
            </div>
          ) : (
            myRiderRatings.map((rr) => {
              const rider = state.users.find((u) => u.user_id === rr.rider_id);
              const order = state.orders.find((o) => o.order_id === rr.order_id);
              return (
                <article
                  key={rr.rating_id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2.5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {rider ? `${rider.first_name} ${rider.last_name}` : 'MedEx Rider'}{' '}
                        {order && (
                          <span className="font-mono text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            · {order.order_code}
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${s <= rr.stars ? 'fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(rr.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300">
                      <EyeOff className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                      {formatReviewerDisplayName(currentUser, rr.is_anonymous)}
                    </span>
                  </div>

                  {rr.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rr.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {rr.comment && (
                    <p className="text-xs text-slate-700 dark:text-slate-300">&ldquo;{rr.comment}&rdquo;</p>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* 24h Edit Review Modal */}
      <RateStoreModal
        open={!!editingReviewState}
        order={editingReviewState?.order || null}
        existingReview={editingReviewState?.review || null}
        onClose={() => setEditingReviewState(null)}
      />

      {/* General App Problem Modal */}
      <ReportProblemModal
        open={appReportOpen}
        source="app"
        onClose={() => setAppReportOpen(false)}
      />
    </div>
  );
};

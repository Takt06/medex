import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Flag,
  MessageSquare,
  ShieldCheck,
  Star,
  Truck,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { FeedbackSource, Order, PharmacyReview } from '../../types/medex';
import {
  formatReviewerDisplayName,
  RIDER_PROBLEM_TAGS,
  RIDER_QUICK_TAGS,
  STORE_PROBLEM_TAGS,
  STORE_POSITIVE_TAGS,
} from '../../utils/medexRules';

interface RateStoreModalProps {
  open: boolean;
  order: Order | null;
  existingReview?: PharmacyReview | null;
  onClose: () => void;
  onOpenMyFeedback?: () => void;
}

export const RateStoreModal: React.FC<RateStoreModalProps> = ({
  open,
  order,
  existingReview,
  onClose,
  onOpenMyFeedback,
}) => {
  const { state, currentUser, submitPharmacyReview, editPharmacyReview } = useMedEx();
  const [stars, setStars] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setSubmittedSuccess(false);
    setIdempotencyKey(
      `rev-${order?.order_id || 'x'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );
    if (existingReview) {
      setStars(existingReview.rating);
      setSelectedTags(existingReview.tags);
      setComment(existingReview.comment);
      setIsAnonymous(existingReview.is_anonymous);
    } else {
      setStars(5);
      setSelectedTags([]);
      setComment('');
      setIsAnonymous(true);
    }
  }, [open, existingReview, order?.order_id]);

  if (!open || !order) return null;

  const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
  const availableTags =
    stars <= 2 ? [...STORE_PROBLEM_TAGS] : [...STORE_POSITIVE_TAGS];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = existingReview
        ? editPharmacyReview({
            review_id: existingReview.review_id,
            rating: stars,
            tags: selectedTags,
            comment,
            is_anonymous: isAnonymous,
          })
        : submitPharmacyReview({
            order_id: order.order_id,
            rating: stars,
            tags: selectedTags,
            comment,
            is_anonymous: isAnonymous,
            idempotency_key: idempotencyKey,
          });

      if (!res.ok) {
        setError(res.error || 'Could not save review.');
        return;
      }
      setSubmittedSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-store-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3
              id="rate-store-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>{existingReview ? 'Edit Your Store Review' : 'Rate Your Order'}</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {merchant?.shop_name || 'Pharmacy'} · {order.order_code}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rate store modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submittedSuccess ? (
          <div className="space-y-4 py-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {existingReview ? 'Review Updated' : 'Thank You for Your Feedback!'}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Your store rating for {merchant?.shop_name} has been saved as{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {formatReviewerDisplayName(currentUser, isAnonymous)}
                </strong>
                . Store reviews help Olongapo residents pick reliable pharmacies.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {onOpenMyFeedback && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMyFeedback();
                  }}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  View in My Feedback
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-3.5 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                How was the pharmacy preparation, accuracy, and packaging?
              </p>
              <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Pharmacy star rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Rate store ${value} star${value > 1 ? 's' : ''}`}
                    onClick={() => {
                      setStars(value);
                      setSelectedTags([]);
                    }}
                    className={`p-1.5 rounded-xl transition-transform active:scale-95 ${
                      value <= stars
                        ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                        : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                    }`}
                  >
                    <Star className={`w-7 h-7 ${value <= stars ? 'fill-amber-400' : ''}`} />
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                {stars} out of 5 stars · Independent from courier delivery rating
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Quick Tags {stars <= 2 ? '(Select at least 1 or write a short note *)' : '(Optional)'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-teal-600 bg-teal-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="store-review-comment"
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Plain-Text Review Comment
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {comment.length}/500
                </span>
              </div>
              <textarea
                id="store-review-comment"
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share packaging, price accuracy, or pharmacist service (no phone numbers, email, or home address)."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 p-3 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 accent-teal-600"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                  <strong className="inline-flex items-center gap-1 font-semibold">
                    <EyeOff className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    Post Anonymously (Recommended)
                  </strong>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Displayed to pharmacy &amp; public as:{' '}
                    <span className="font-semibold text-teal-800 dark:text-teal-300">
                      {formatReviewerDisplayName(currentUser, isAnonymous)}
                    </span>
                    . Your phone, email, and home address remain private.
                  </span>
                </span>
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 shadow-xs disabled:opacity-50"
              >
                {submitting
                  ? 'Saving...'
                  : existingReview
                    ? 'Save Updated Review'
                    : 'Submit Store Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

interface RateRiderModalProps {
  open: boolean;
  order: Order | null;
  onClose: () => void;
}

export const RateRiderModal: React.FC<RateRiderModalProps> = ({ open, order, onClose }) => {
  const { state, currentUser, rateDelivery } = useMedEx();
  const [stars, setStars] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStars(5);
    setSelectedTags([]);
    setComment('');
    setIsAnonymous(true);
    setError(null);
    setSubmitting(false);
  }, [open, order?.order_id]);

  if (!open || !order || !order.delivery?.rider_id) return null;

  const riderUser = state.users.find((u) => u.user_id === order.delivery!.rider_id);
  const riderProfile = state.riderProfiles.find((r) => r.user_id === order.delivery!.rider_id);
  const availableTags = stars <= 2 ? [...RIDER_PROBLEM_TAGS] : [...RIDER_QUICK_TAGS];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = rateDelivery(order.order_id, stars, selectedTags, comment, isAnonymous);
      if (!res.ok) {
        setError(res.error || 'Could not submit rider rating.');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-rider-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3
              id="rate-rider-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Truck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span>Rate Delivery Rider</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {riderUser ? `${riderUser.first_name} ${riderUser.last_name}` : 'Courier'} ·{' '}
              {riderProfile?.vehicle_type || 'Delivery Rider'} ({riderProfile?.plate_number || 'Verified'}) · {order.order_code}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rate rider modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-3.5 text-center space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              How was the rider&apos;s delivery speed, care, and professionalism?
            </p>
            <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Rider star rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Rate rider ${value} star${value > 1 ? 's' : ''}`}
                  onClick={() => {
                    setStars(value);
                    setSelectedTags([]);
                  }}
                  className={`p-1.5 rounded-xl transition-transform active:scale-95 ${
                    value <= stars
                      ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                      : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                  }`}
                >
                  <Star className={`w-7 h-7 ${value <= stars ? 'fill-amber-400' : ''}`} />
                </button>
              ))}
            </div>
            <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums">
              {stars} out of 5 stars · Updates rider &amp; admin performance board
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Delivery Highlights (Optional)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-amber-400'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="rider-rating-comment"
                className="text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                Note for Rider &amp; Admin Oversight (Optional)
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {comment.length}/500
              </span>
            </div>
            <textarea
              id="rider-rating-comment"
              rows={3}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share delivery experience without personal phone, email, or home street details."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 accent-teal-600"
              />
              <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                <strong className="inline-flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  Keep My Identity Anonymous
                </strong>
                <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Rider &amp; Admin see:{' '}
                  <span className="font-semibold text-teal-800 dark:text-teal-300">
                    {formatReviewerDisplayName(currentUser, isAnonymous)}
                  </span>
                </span>
              </span>
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : `Submit ${stars}-Star Rider Rating`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReportProblemModalProps {
  open: boolean;
  source: FeedbackSource;
  orderId?: number | null;
  merchantId?: number | null;
  productId?: number | null;
  searchId?: string | null;
  onClose: () => void;
  onOpenMyFeedback?: () => void;
}

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({
  open,
  source,
  orderId = null,
  merchantId = null,
  productId = null,
  searchId = null,
  onClose,
  onOpenMyFeedback,
}) => {
  const { state, currentUser, submitProblemReport } = useMedEx();
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(merchantId);
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const scopedCategories = state.feedbackCategories.filter(
    (c) => c.is_active && c.applies_to === source
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setCreatedCode(null);
    setDescription('');
    setIsAnonymous(true);
    setSelectedMerchantId(merchantId);
    setSelectedCategory(scopedCategories[0]?.code || '');
    setIdempotencyKey(
      `pr-${source}-${orderId ?? merchantId ?? 'app'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    );
  }, [open, source, orderId, merchantId, productId]);

  if (!open) return null;

  const merchant = state.merchants.find((m) => m.merchant_id === (selectedMerchantId ?? merchantId));
  const product = state.products.find((p) => p.product_id === productId);
  const order = state.orders.find((o) => o.order_id === orderId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = submitProblemReport({
        source,
        order_id: orderId,
        merchant_id: source === 'app' ? selectedMerchantId : merchantId,
        product_id: productId,
        search_id: searchId,
        category_code: selectedCategory,
        description,
        is_anonymous: isAnonymous,
        idempotency_key: idempotencyKey,
      });
      if (!res.ok) {
        setError(res.error || 'Could not submit report.');
        return;
      }
      setCreatedCode(res.data?.reference_code || 'Submitted');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-problem-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3
              id="report-problem-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Flag className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span>
                {source === 'locator'
                  ? 'Report Locator Inaccuracy'
                  : source === 'order'
                    ? 'Report Order Problem'
                    : 'Report App Problem'}
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {order ? `Order ${order.order_code} · ` : ''}
              {merchant ? merchant.shop_name : source === 'app' ? 'MedEx Platform Support' : ''}
              {product ? ` · ${product.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report problem modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdCode ? (
          <div className="space-y-4 py-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
                Reference Code: {createdCode}
              </p>
              <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Problem Report Logged
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Your report is now <span className="font-semibold">Open</span>.{' '}
                {merchant
                  ? `${merchant.shop_name} and MedEx Admin can review it without seeing your personal contact details.`
                  : 'MedEx Admin Operations will review and post status updates.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {onOpenMyFeedback && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMyFeedback();
                  }}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  Track in My Feedback
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {source === 'locator' && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/75 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  This alerts the pharmacy to verify and update their real stock or schedule in Inventory Management.
                </span>
              </div>
            )}

            {source === 'app' && (
              <div>
                <label
                  htmlFor="report-optional-merchant"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1"
                >
                  Related Pharmacy (Optional)
                </label>
                <select
                  id="report-optional-merchant"
                  value={selectedMerchantId ?? ''}
                  onChange={(e) =>
                    setSelectedMerchantId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="">General MedEx Application (All Olongapo)</option>
                  {state.merchants.map((m) => (
                    <option key={m.merchant_id} value={m.merchant_id}>
                      {m.shop_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Select Issue Category *
              </p>
              <div className="flex flex-wrap gap-1.5">
                {scopedCategories.map((cat) => {
                  const active = selectedCategory === cat.code;
                  return (
                    <button
                      key={cat.category_id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.code)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-red-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="problem-report-desc"
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Description *
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {description.length}/1000
                </span>
              </div>
              <textarea
                id="problem-report-desc"
                rows={4}
                required
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened cleanly in plain text (avoid sharing phone numbers, emails, or home addresses)."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 accent-teal-600"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                  <strong className="inline-flex items-center gap-1 font-semibold">
                    <EyeOff className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    Hide My Identity on Pharmacy Inbox (Default ON)
                  </strong>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Submitted as:{' '}
                    <span className="font-semibold text-teal-800 dark:text-teal-300">
                      {formatReviewerDisplayName(currentUser, isAnonymous)}
                    </span>
                  </span>
                </span>
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 shadow-xs disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Problem Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

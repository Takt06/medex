import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  Flag,
  KeyRound,
  MessageSquare,
  Package,
  Pencil,
  Printer,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Order, PharmacyReview, ReturnRefundReason } from '../../types/medex';
import {
  canEditPharmacyReview,
  formatPHP,
  formatReviewerDisplayName,
  isGcashWaitingForRxApproval,
  isWithin7DayWindow,
  needsResidentGcashPayment,
} from '../../utils/medexRules';
import { buildOlongapoSampleRxSvg, readPrescriptionFile } from '../../utils/sampleRx';
import { LeafletMap, type MapMarker } from '../common/LeafletMap';
import {
  RateRiderModal,
  RateStoreModal,
  ReportProblemModal,
} from '../feedback/FeedbackAndRatingModals';
import { GCashCheckoutSheet } from './GCashCheckoutSheet';

const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  awaiting_prescription_review: 'Awaiting Rx Review',
  pending: 'Pending',
  placed: 'Order Placed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const ResidentOrdersView: React.FC = () => {
  const {
    state,
    currentUser,
    cancelOrder,
    reuploadPrescription,
    retryGcashPayment,
    switchPaymentToCod,
    requestReturnRefund,
    escalateReturnRefund,
    setActiveTab,
  } = useMedEx();

  const [tabFilter, setTabFilter] = useState<'active' | 'past'>('active');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Cancel modal
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('Changed my mind');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Re-upload Rx modal
  const [reuploadOrderId, setReuploadOrderId] = useState<number | null>(null);
  const [rxDoctor, setRxDoctor] = useState('');
  const [rxLicense, setRxLicense] = useState('');
  const [rxDate, setRxDate] = useState(new Date().toISOString().slice(0, 10));
  const [rxFileName, setRxFileName] = useState('');
  const [rxFileType, setRxFileType] = useState<'jpg' | 'png' | 'pdf'>('png');
  const [rxPreviewUrl, setRxPreviewUrl] = useState('');
  const [reuploadError, setReuploadError] = useState<string | null>(null);
  const [reuploadSubmitting, setReuploadSubmitting] = useState(false);

  // Rx full-size proof preview modal
  const [previewRxOrder, setPreviewRxOrder] = useState<Order | null>(null);

  // Receipt modal
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Module 9 & Rider rating modals
  const [rateStoreTarget, setRateStoreTarget] = useState<{
    order: Order;
    existing: PharmacyReview | null;
  } | null>(null);
  const [rateRiderOrder, setRateRiderOrder] = useState<Order | null>(null);
  const [reportOrderTarget, setReportOrderTarget] = useState<Order | null>(null);
  const [gcashTargetOrder, setGcashTargetOrder] = useState<Order | null>(null);

  // Return & Refund request + CS escalation
  const [returnFormOrderId, setReturnFormOrderId] = useState<number | null>(null);
  const [returnReasonCode, setReturnReasonCode] = useState<ReturnRefundReason>('wrong_item');
  const [returnAmountDraft, setReturnAmountDraft] = useState<string>('');
  const [returnDescDraft, setReturnDescDraft] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [escalatingReturnId, setEscalatingReturnId] = useState<number | null>(null);
  const [escalateReturnReason, setEscalateReturnReason] = useState('');

  const myOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.resident_id === currentUser.user_id)
        .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()),
    [state.orders, currentUser.user_id]
  );

  const filteredOrders = useMemo(() => {
    if (tabFilter === 'active') {
      return myOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    }
    return myOrders.filter((o) => o.status === 'delivered' || o.status === 'cancelled');
  }, [myOrders, tabFilter]);

  const activeOrder = useMemo(
    () =>
      filteredOrders.find((o) => o.order_id === selectedOrderId) ||
      filteredOrders[0] ||
      myOrders[0] ||
      null,
    [filteredOrders, selectedOrderId, myOrders]
  );

  const buildMapData = (order: Order) => {
    const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
    const shopAddr = state.addresses.find((a) => a.address_id === merchant?.shop_address_id);
    const destAddr = state.addresses.find((a) => a.address_id === order.address_id);

    const markers: MapMarker[] = [];
    const routePoints: Array<[number, number]> = [];

    if (shopAddr) {
      markers.push({
        id: `shop-${order.order_id}`,
        lat: shopAddr.latitude,
        lng: shopAddr.longitude,
        title: merchant?.shop_name || 'Pharmacy',
        subtitle: 'Pickup Pharmacy',
        variant: 'pharmacy_open',
      });
      routePoints.push([shopAddr.latitude, shopAddr.longitude]);
    }
    if (order.delivery?.rider_lat && order.delivery?.rider_lng) {
      markers.push({
        id: `rider-${order.order_id}`,
        lat: order.delivery.rider_lat,
        lng: order.delivery.rider_lng,
        title: 'Assigned Rider',
        subtitle: order.delivery.status.replace('_', ' '),
        variant: 'rider',
      });
      routePoints.push([order.delivery.rider_lat, order.delivery.rider_lng]);
    }
    if (destAddr) {
      markers.push({
        id: `dest-${order.order_id}`,
        lat: destAddr.latitude,
        lng: destAddr.longitude,
        title: order.recipient_name,
        subtitle: order.delivery_address_snapshot,
        variant: 'resident',
      });
      routePoints.push([destAddr.latitude, destAddr.longitude]);
    }
    return { markers, routePoints };
  };

  const handleConfirmCancel = () => {
    if (!cancellingOrderId || cancelSubmitting) return;
    setCancelSubmitting(true);
    try {
      const res = cancelOrder(cancellingOrderId, cancelReason);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Unable to cancel order.' });
      } else {
        setFeedback({
          type: 'success',
          text: 'Order cancelled and reserved stock released back to the pharmacy.',
        });
      }
      setCancellingOrderId(null);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleRxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setReuploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await readPrescriptionFile(file);
    if (!result.ok) {
      setReuploadError(result.error);
      return;
    }
    setRxFileName(result.fileName);
    setRxFileType(result.fileType);
    setRxPreviewUrl(result.previewUrl);
  };

  const handleUseSampleReupload = () => {
    setReuploadError(null);
    const fullName = `${currentUser.first_name} ${currentUser.last_name}`;
    setRxDoctor((prev) => prev || 'Dr. Josefa Navarro, MD');
    setRxLicense((prev) => prev || 'PRC-0114892');
    setRxDate(new Date().toISOString().slice(0, 10));
    setRxFileName('updated_olongapo_rx_navarro.png');
    setRxFileType('png');
    setRxPreviewUrl(buildOlongapoSampleRxSvg(fullName, 'Prescription Re-verification'));
  };

  const handleReuploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reuploadOrderId || reuploadSubmitting) return;
    setReuploadError(null);
    const targetOrder = state.orders.find((o) => o.order_id === reuploadOrderId);
    const effectiveUrl = rxPreviewUrl || targetOrder?.prescription?.file_preview_url || '';
    const effectiveName = rxFileName || targetOrder?.prescription?.file_name || 'updated_prescription.png';
    if (!effectiveUrl) {
      setReuploadError('Please attach an updated prescription photo/PDF or apply the sample Olongapo Rx.');
      return;
    }
    setReuploadSubmitting(true);
    try {
      const res = reuploadPrescription(reuploadOrderId, {
        patient_name:
          targetOrder?.prescription?.patient_name ||
          `${currentUser.first_name} ${currentUser.last_name}`,
        doctor_name: rxDoctor,
        license_no: rxLicense,
        date_issued: rxDate,
        file_name: effectiveName,
        file_type: rxFileType,
        file_preview_url: effectiveUrl,
      });
      if (!res.ok) {
        setReuploadError(res.error || 'Failed to re-upload prescription.');
        return;
      }
      setFeedback({ type: 'success', text: 'Updated prescription proof submitted for pharmacist review.' });
      setReuploadOrderId(null);
    } finally {
      setReuploadSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            My Orders &amp; Live Delivery Tracking
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitor prescription proof reviews, payment status, 4-digit delivery handoff codes, and rider route progress.
          </p>
        </div>

        <div className="inline-flex rounded-xl medex-glass-subtle border p-1 self-start">
          <button
            type="button"
            onClick={() => setTabFilter('active')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              tabFilter === 'active'
                ? 'bg-slate-900 dark:bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Active ({myOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length})
          </button>
          <button
            type="button"
            onClick={() => setTabFilter('past')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              tabFilter === 'past'
                ? 'bg-slate-900 dark:bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Past ({myOrders.filter((o) => o.status === 'delivered' || o.status === 'cancelled').length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
              : 'border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="medex-glass rounded-2xl border p-10 text-center space-y-3">
          <Package className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
            No {tabFilter} orders yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Browse nearby pharmacies or the medicine store to place a medicine order.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('locator')}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
          >
            Open Pharmacy Locator
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Order List */}
          <div className="lg:col-span-5 space-y-3">
            {filteredOrders.map((order) => {
              const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
              const isSelected = activeOrder?.order_id === order.order_id;
              const payReady = needsResidentGcashPayment(order);
              const waitingRxPay = isGcashWaitingForRxApproval(order);
              return (
                <button
                  key={order.order_id}
                  type="button"
                  onClick={() => setSelectedOrderId(order.order_id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                    isSelected
                      ? 'medex-glass border-teal-600 bg-teal-50/55 dark:bg-teal-950/45 ring-1 ring-teal-600'
                      : 'medex-glass hover:border-teal-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {order.order_code}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        order.delivery?.status === 'not_home'
                          ? 'text-amber-700 dark:text-amber-300'
                          : order.status === 'cancelled'
                            ? 'text-slate-500 dark:text-slate-400'
                            : order.status === 'delivered'
                              ? 'text-teal-700 dark:text-teal-400'
                              : order.prescription?.status === 'rejected' ||
                                  order.payment.status === 'failed'
                                ? 'text-red-700 dark:text-red-400'
                                : payReady
                                  ? 'text-[#007DFE] dark:text-blue-400'
                                  : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {order.delivery?.status === 'not_home'
                        ? 'Customer Not Home'
                        : order.delivery?.status === 'failed'
                          ? 'Returned to Pharmacy'
                          : ORDER_STATUS_LABEL[order.status]}
                    </span>
                  </div>
                  <p className="font-display text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {merchant?.shop_name || 'Partner Pharmacy'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    {order.items.length} item(s) · {formatPHP(order.total_amount)} ·{' '}
                    {order.payment.method} ({order.payment.status})
                  </p>
                  {payReady && (
                    <p
                      className={`text-[11px] font-semibold mt-1.5 ${
                        order.payment.status === 'failed'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-[#007DFE] dark:text-blue-400'
                      }`}
                    >
                      {order.payment.status === 'failed'
                        ? 'GCash Failed — Retry Payment'
                        : order.prescription?.status === 'approved'
                          ? 'Rx Approved — Pay via GCash'
                          : 'Action Required: Pay via GCash'}
                    </p>
                  )}
                  {waitingRxPay && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-1.5">
                      GCash held until pharmacist approves Rx
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Order Detail */}
          {activeOrder && (
            <div className="lg:col-span-7 medex-glass rounded-2xl border p-5 space-y-5">
              {(() => {
                const merchant = state.merchants.find(
                  (m) => m.merchant_id === activeOrder.merchant_id
                );
                const riderUser = activeOrder.delivery?.rider_id
                  ? state.users.find((u) => u.user_id === activeOrder.delivery!.rider_id)
                  : null;
                const riderProfile = activeOrder.delivery?.rider_id
                  ? state.riderProfiles.find((r) => r.user_id === activeOrder.delivery!.rider_id)
                  : null;
                const canCancel = ![
                  'ready_for_pickup',
                  'out_for_delivery',
                  'delivered',
                  'cancelled',
                ].includes(activeOrder.status);
                const { markers, routePoints } = buildMapData(activeOrder);

                return (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                      <div>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {activeOrder.order_code}
                        </p>
                        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                          {merchant?.shop_name}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          Placed {new Date(activeOrder.placed_at).toLocaleString()} ·{' '}
                          {ORDER_STATUS_LABEL[activeOrder.status]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiptOrder(activeOrder)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[38px] whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => setCancellingOrderId(activeOrder.order_id)}
                            className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 min-h-[38px] whitespace-nowrap"
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Customer Not Home / Failed Delivery Alert */}
                    {activeOrder.delivery?.status === 'not_home' && activeOrder.status !== 'cancelled' && (
                      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-4 flex items-start gap-3 text-xs text-amber-950 dark:text-amber-100">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold">
                            Delivery Attempt Unsuccessful — Marked Not Home
                          </p>
                          <p className="leading-relaxed">
                            Rider Note:{' '}
                            <strong>
                              {activeOrder.delivery.failure_reason || 'Resident not home upon arrival'}
                            </strong>
                            . Your courier can retry delivery when you are available, or return the medicines to the pharmacy so inventory is safely restocked.
                          </p>
                        </div>
                      </div>
                    )}

                    {activeOrder.delivery?.status === 'failed' && (
                      <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3 text-xs text-red-900 dark:text-red-200">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold">
                            Order Returned to Pharmacy &amp; Cancelled
                          </p>
                          <p className="leading-relaxed">
                            {activeOrder.delivery.failure_reason ||
                              activeOrder.cancel_reason ||
                              'Undelivered medicines were returned to the pharmacy and restocked.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 4-Digit Confirmation Code Banner (Visible ONLY to Resident while active) */}
                    {activeOrder.delivery &&
                      activeOrder.status !== 'delivered' &&
                      activeOrder.status !== 'cancelled' && (
                      <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/40 p-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <KeyRound className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              Delivery Confirmation Code
                            </p>
                            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                              Share this 4-digit PIN only when the rider hands over your medicines.
                            </p>
                          </div>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 px-4 py-2 font-mono text-2xl font-bold tracking-[0.25em] text-slate-900 dark:text-white tabular-nums">
                          {activeOrder.delivery.confirmation_code}
                        </div>
                      </div>
                    )}

                    {/* Prescription Status, Proof Thumbnail & Re-upload */}
                    {activeOrder.prescription && (
                      <div
                        className={`rounded-xl border p-4 space-y-3 ${
                          activeOrder.prescription.status === 'rejected'
                            ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40'
                            : activeOrder.prescription.status === 'approved'
                              ? 'border-teal-200 dark:border-teal-800/70 bg-teal-50/50 dark:bg-teal-950/35'
                              : 'border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/35'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Prescription Proof Review:{' '}
                            <span className="uppercase text-xs">
                              {activeOrder.prescription.status.replace('_', ' ')}
                            </span>
                          </p>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {activeOrder.prescription.license_no}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                            <p>
                              Patient:{' '}
                              <strong className="text-slate-900 dark:text-white">
                                {activeOrder.prescription.patient_name}
                              </strong>
                            </p>
                            <p>
                              Prescribing Physician: {activeOrder.prescription.doctor_name}
                            </p>
                            <p className="tabular-nums text-slate-500 dark:text-slate-400">
                              Issued: {activeOrder.prescription.date_issued} · File:{' '}
                              {activeOrder.prescription.file_name}
                            </p>
                          </div>

                          {activeOrder.prescription.file_preview_url && (
                            <div className="flex items-center gap-2.5 shrink-0">
                              {activeOrder.prescription.file_type !== 'pdf' ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewRxOrder(activeOrder)}
                                  aria-label={`Inspect prescription proof for ${activeOrder.order_code}`}
                                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white overflow-hidden hover:ring-2 hover:ring-teal-500 transition-all"
                                >
                                  <img
                                    src={activeOrder.prescription.file_preview_url}
                                    alt="Attached prescription thumbnail"
                                    className="w-20 h-14 object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <FileCheck2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                  <span>PDF Proof</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setPreviewRxOrder(activeOrder)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Rx Proof</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {activeOrder.prescription.status === 'rejected' && (
                          <div className="pt-1 space-y-2 border-t border-red-200 dark:border-red-900/50">
                            <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                              Reason: {activeOrder.prescription.reject_reason}
                              {activeOrder.prescription.remarks
                                ? ` — ${activeOrder.prescription.remarks}`
                                : ''}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setReuploadError(null);
                                setReuploadOrderId(activeOrder.order_id);
                                setRxDoctor(activeOrder.prescription?.doctor_name || '');
                                setRxLicense(activeOrder.prescription?.license_no || '');
                                setRxFileName(activeOrder.prescription?.file_name || '');
                                setRxFileType(activeOrder.prescription?.file_type || 'png');
                                setRxPreviewUrl(activeOrder.prescription?.file_preview_url || '');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 whitespace-nowrap"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Re-upload Prescription Proof</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pending GCash Payment Ready Card (Rx Approved or OTC Authorization) */}
                    {needsResidentGcashPayment(activeOrder) &&
                      activeOrder.payment.status === 'pending' && (
                        <div className="rounded-xl border border-blue-300 dark:border-blue-800/80 bg-blue-50/85 dark:bg-blue-950/40 p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#007DFE] text-white flex items-center justify-center shrink-0 shadow-xs">
                              <Wallet className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                  {activeOrder.prescription?.status === 'approved'
                                    ? 'Prescription Approved — Ready to Pay via GCash'
                                    : 'Complete GCash Authorization'}
                                </p>
                                <span className="rounded-md bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                                  PayMongo Sandbox
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                                {activeOrder.prescription?.status === 'approved'
                                  ? `Verified by ${activeOrder.prescription.reviewed_by || 'Pharmacist'}. Pay ${formatPHP(activeOrder.total_amount)} via GCash now so ${merchant?.shop_name || 'the pharmacy'} can start preparing your medicines.`
                                  : `Authorize ${formatPHP(activeOrder.total_amount)} via GCash to confirm your order with ${merchant?.shop_name || 'the pharmacy'}.`}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setGcashTargetOrder(activeOrder)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#007DFE] hover:bg-[#0066E5] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors whitespace-nowrap min-h-[38px]"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>Pay {formatPHP(activeOrder.total_amount)} via GCash</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                switchPaymentToCod(activeOrder.order_id);
                                setFeedback({
                                  type: 'success',
                                  text: 'Order switched to Cash on Delivery (COD) and sent to pharmacy preparation.',
                                });
                              }}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap min-h-[38px]"
                            >
                              Switch to Cash on Delivery (COD)
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Paid GCash Confirmation Banner */}
                    {activeOrder.payment.method === 'GCash' &&
                      activeOrder.payment.status === 'paid' && (
                        <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/75 dark:bg-teal-950/35 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200">
                            <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                            <span>
                              <strong>Paid via GCash</strong> ({formatPHP(activeOrder.total_amount)})
                              {activeOrder.payment.paid_at
                                ? ` · ${new Date(activeOrder.payment.paid_at).toLocaleString()}`
                                : ''}
                            </span>
                          </div>
                          {activeOrder.payment.gateway_reference && (
                            <span className="font-mono text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                              Ref: {activeOrder.payment.gateway_reference}
                            </span>
                          )}
                        </div>
                      )}

                    {/* Failed GCash Recovery */}
                    {activeOrder.payment.status === 'failed' && activeOrder.status !== 'cancelled' && (
                      <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 space-y-3">
                        <div className="flex items-start gap-2.5 text-red-900 dark:text-red-200">
                          <CreditCard className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold">GCash Payment Failed</p>
                            <p className="text-xs mt-0.5">
                              {activeOrder.payment.failure_reason ||
                                'PayMongo sandbox charge declined. Retry GCash payment or switch to Cash on Delivery.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setGcashTargetOrder(activeOrder)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#007DFE] hover:bg-[#0066E5] px-3.5 py-2 text-xs font-bold text-white whitespace-nowrap"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Retry GCash Payment ({formatPHP(activeOrder.total_amount)})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              switchPaymentToCod(activeOrder.order_id);
                              setFeedback({
                                type: 'success',
                                text: 'Order switched to Cash on Delivery.',
                              });
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            Switch to Cash on Delivery (COD)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Live Delivery Map & Rider */}
                    {markers.length > 0 && activeOrder.status !== 'cancelled' && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Delivery Route &amp; Location
                          </h3>
                          {riderUser && riderProfile && (
                            <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                              Rider: {riderUser.first_name} {riderUser.last_name} ·{' '}
                              {riderProfile.vehicle_type} ({riderProfile.plate_number}) · ★{' '}
                              {riderProfile.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <LeafletMap
                          markers={markers}
                          routePoints={routePoints.length >= 2 ? routePoints : undefined}
                          heightClass="h-56"
                          ariaLabel={`Live tracking map for order ${activeOrder.order_code}`}
                        />
                      </div>
                    )}

                    {/* Items & Totals */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Order Items
                      </h3>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5">
                        {activeOrder.items.map((item) => (
                          <div
                            key={item.order_item_id}
                            className="py-2.5 flex items-center justify-between gap-2 text-sm"
                          >
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {item.quantity}x {item.product_name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                {formatPHP(item.unit_price)} / {item.unit}
                              </p>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                              {formatPHP(item.unit_price * item.quantity)}
                            </span>
                          </div>
                        ))}
                        <div className="py-2.5 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                          <span>Delivery Fee</span>
                          <span className="tabular-nums">{formatPHP(activeOrder.delivery_fee)}</span>
                        </div>
                        {(activeOrder.discount_amount ?? 0) > 0 && (
                          <div className="py-2.5 flex justify-between text-xs font-semibold text-teal-700 dark:text-teal-400">
                            <span>Promo Coupon ({activeOrder.coupon_code || 'Applied'})</span>
                            <span className="tabular-nums">
                              -{formatPHP(activeOrder.discount_amount || 0)}
                            </span>
                          </div>
                        )}
                        <div className="py-2.5 flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                          <span>Total ({activeOrder.payment.method})</span>
                          <span className="tabular-nums">{formatPHP(activeOrder.total_amount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Delivered Order Actions: Store Review, Rider Rating & Problem Report */}
                    {activeOrder.status === 'delivered' &&
                      (() => {
                        const existingReview =
                          state.pharmacyReviews.find(
                            (r) =>
                              r.order_id === activeOrder.order_id &&
                              r.resident_id === currentUser.user_id
                          ) || null;
                        const deliveredAt =
                          activeOrder.delivery?.delivered_at || activeOrder.placed_at;
                        const windowStatus = isWithin7DayWindow(deliveredAt);
                        const canEditReview =
                          existingReview !== null && canEditPharmacyReview(existingReview.created_at);

                        return (
                          <div className="space-y-3">
                            {/* Pharmacy Store Feedback Card (Module 9) */}
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-2.5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <MessageSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    <span>
                                      {existingReview
                                        ? `Your Store Review (${existingReview.rating}/5 ★)`
                                        : 'Rate Your Order (Pharmacy Review)'}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {existingReview
                                      ? `Posted as ${formatReviewerDisplayName(
                                          currentUser,
                                          existingReview.is_anonymous
                                        )} · Independent from rider rating`
                                      : windowStatus.allowed
                                        ? `Rate ${merchant?.shop_name || 'this pharmacy'} for accuracy & packing (${windowStatus.daysRemaining} day(s) left in 7-day window).`
                                        : '7-day post-delivery review window has closed for this order.'}
                                  </p>
                                </div>

                                {existingReview ? (
                                  <div className="flex items-center gap-2">
                                    {canEditReview && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRateStoreTarget({
                                            order: activeOrder,
                                            existing: existingReview,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Edit (24h)
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setActiveTab('feedback')}
                                      className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                                    >
                                      My Feedback →
                                    </button>
                                  </div>
                                ) : (
                                  windowStatus.allowed && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRateStoreTarget({
                                          order: activeOrder,
                                          existing: null,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                                    >
                                      <Star className="w-3.5 h-3.5" />
                                      Rate Store
                                    </button>
                                  )
                                )}
                              </div>

                              {existingReview && (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-3 space-y-1.5 text-xs">
                                  <div className="flex items-center gap-1 text-amber-500">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <Star
                                        key={s}
                                        className={`w-4 h-4 ${
                                          s <= existingReview.rating
                                            ? 'fill-amber-400 text-amber-400'
                                            : 'text-slate-300 dark:text-slate-700'
                                        }`}
                                      />
                                    ))}
                                    {existingReview.tags.length > 0 && (
                                      <span className="ml-2 text-slate-600 dark:text-slate-300">
                                        {existingReview.tags.join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                  {existingReview.comment && (
                                    <p className="text-slate-700 dark:text-slate-200">
                                      &ldquo;{existingReview.comment}&rdquo;
                                    </p>
                                  )}
                                  {existingReview.merchant_reply && (
                                    <p className="text-[11px] text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-md px-2.5 py-1.5">
                                      <strong>Pharmacy Reply:</strong> {existingReview.merchant_reply}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Rider Rating Card */}
                            {activeOrder.delivery?.rider_id && (
                              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <Truck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                      <span>
                                        {activeOrder.rating
                                          ? `Your Rider Rating: ${activeOrder.rating.stars} / 5 ★`
                                          : 'Rate Delivery Rider'}
                                      </span>
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                      {activeOrder.rating
                                        ? `Shared as ${formatReviewerDisplayName(
                                            currentUser,
                                            activeOrder.rating.is_anonymous
                                          )} with courier & admin oversight.`
                                        : 'Rate courier speed, package care, and professionalism (anonymous by default).'}
                                    </p>
                                  </div>

                                  {activeOrder.rating ? (
                                    <div className="flex items-center gap-1 text-amber-500">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <Star
                                          key={s}
                                          className={`w-4 h-4 ${
                                            s <= activeOrder.rating!.stars
                                              ? 'fill-amber-400 text-amber-400'
                                              : 'text-slate-300 dark:text-slate-700'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setRateRiderOrder(activeOrder)}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 whitespace-nowrap"
                                    >
                                      <Star className="w-3.5 h-3.5" />
                                      Rate Rider (1–5 ★)
                                    </button>
                                  )}
                                </div>

                                {activeOrder.rating &&
                                  (activeOrder.rating.tags.length > 0 ||
                                    activeOrder.rating.comment) && (
                                    <div className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200/70 dark:border-slate-800 pt-2">
                                      {activeOrder.rating.tags.length > 0 && (
                                        <p className="font-medium text-slate-700 dark:text-slate-200">
                                          Tags: {activeOrder.rating.tags.join(' · ')}
                                        </p>
                                      )}
                                      {activeOrder.rating.comment && (
                                        <p className="mt-0.5">&ldquo;{activeOrder.rating.comment}&rdquo;</p>
                                      )}
                                    </div>
                                  )}
                              </div>
                            )}

                            {/* Return / Refund Request & Customer Service Escalation */}
                            {(() => {
                              const existingReturn = state.returnRequests.find(
                                (rr) => rr.order_id === activeOrder.order_id
                              );
                              const isFormOpen = returnFormOrderId === activeOrder.order_id;
                              const canEscalateReturn =
                                existingReturn &&
                                (existingReturn.status === 'store_rejected' ||
                                  existingReturn.status === 'requested');

                              return (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <RotateCcw className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                        <span>Return / Refund Request</span>
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {existingReturn
                                          ? `Ref ${existingReturn.reference_code} · Requested ${formatPHP(existingReturn.requested_refund_amount)}`
                                          : 'Request a return or refund directly from the fulfilling pharmacy (with CS escalation if needed).'}
                                      </p>
                                    </div>
                                    {existingReturn ? (
                                      <span className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-800 dark:text-slate-200">
                                        {existingReturn.status.replace('_', ' ')}
                                      </span>
                                    ) : (
                                      windowStatus.allowed && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReturnFormOrderId(isFormOpen ? null : activeOrder.order_id);
                                            setReturnAmountDraft(String(activeOrder.subtotal));
                                            setReturnDescDraft('');
                                          }}
                                          className="rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 px-3 py-1.5 text-xs font-semibold text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/60 whitespace-nowrap"
                                        >
                                          {isFormOpen ? 'Cancel Request' : 'Request Return / Refund'}
                                        </button>
                                      )
                                    )}
                                  </div>

                                  {existingReturn && (
                                    <div className="space-y-2 text-xs">
                                      <p className="text-slate-700 dark:text-slate-300">
                                        <strong>Reason ({existingReturn.reason_code.replace('_', ' ')}):</strong>{' '}
                                        {existingReturn.description}
                                      </p>
                                      {existingReturn.store_response_note && (
                                        <p className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200">
                                          <strong>Pharmacy Response:</strong> {existingReturn.store_response_note}
                                        </p>
                                      )}
                                      {existingReturn.cs_resolution_note && (
                                        <p className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-3 py-2 text-teal-900 dark:text-teal-200">
                                          <strong>Customer Service Resolution:</strong> {existingReturn.cs_resolution_note}
                                          {typeof existingReturn.approved_refund_amount === 'number'
                                            ? ` · Approved Refund: ${formatPHP(existingReturn.approved_refund_amount)}`
                                            : ''}
                                        </p>
                                      )}
                                      {canEscalateReturn && (
                                        <div className="pt-1">
                                          {escalatingReturnId === existingReturn.return_id ? (
                                            <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/35 p-3 space-y-2">
                                              <input
                                                type="text"
                                                value={escalateReturnReason}
                                                onChange={(e) => setEscalateReturnReason(e.target.value)}
                                                placeholder="Explain why you are escalating to Customer Service..."
                                                className="w-full rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                                              />
                                              <div className="flex gap-2">
                                                <button
                                                  type="button"
                                                  onClick={async () => {
                                                    const res = await escalateReturnRefund(
                                                      existingReturn.return_id,
                                                      escalateReturnReason
                                                    );
                                                    if (!res.ok) {
                                                      setFeedback({
                                                        type: 'error',
                                                        text: res.error || 'Could not escalate return request.',
                                                      });
                                                    } else {
                                                      setEscalatingReturnId(null);
                                                      setEscalateReturnReason('');
                                                      setFeedback({
                                                        type: 'success',
                                                        text: `Return ${existingReturn.reference_code} escalated to Customer Service.`,
                                                      });
                                                    }
                                                  }}
                                                  className="rounded-lg bg-purple-700 hover:bg-purple-800 px-3 py-1.5 text-xs font-semibold text-white"
                                                >
                                                  Escalate to CS
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setEscalatingReturnId(null)}
                                                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEscalatingReturnId(existingReturn.return_id);
                                                setEscalateReturnReason('');
                                              }}
                                              className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-200 hover:bg-purple-100"
                                            >
                                              Escalate Dispute to Customer Service
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {isFormOpen && !existingReturn && (
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 space-y-3 text-xs">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                          <label
                                            htmlFor={`ret-reason-${activeOrder.order_id}`}
                                            className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                                          >
                                            Reason *
                                          </label>
                                          <select
                                            id={`ret-reason-${activeOrder.order_id}`}
                                            value={returnReasonCode}
                                            onChange={(e) =>
                                              setReturnReasonCode(e.target.value as ReturnRefundReason)
                                            }
                                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                          >
                                            <option value="wrong_item">Wrong Item Delivered</option>
                                            <option value="damaged_item">Damaged Packaging / Item</option>
                                            <option value="expired_product">Expired / Near-Expiry Medicine</option>
                                            <option value="missing_item">Missing Item from Package</option>
                                            <option value="quality_issue">Quality Issue</option>
                                            <option value="other">Other</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label
                                            htmlFor={`ret-amt-${activeOrder.order_id}`}
                                            className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                                          >
                                            Requested Refund Amount (₱) *
                                          </label>
                                          <input
                                            id={`ret-amt-${activeOrder.order_id}`}
                                            type="number"
                                            min={1}
                                            max={activeOrder.total_amount}
                                            step="0.01"
                                            value={returnAmountDraft}
                                            onChange={(e) => setReturnAmountDraft(e.target.value)}
                                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label
                                          htmlFor={`ret-desc-${activeOrder.order_id}`}
                                          className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
                                        >
                                          Details for Store Review *
                                        </label>
                                        <textarea
                                          id={`ret-desc-${activeOrder.order_id}`}
                                          rows={2}
                                          value={returnDescDraft}
                                          onChange={(e) => setReturnDescDraft(e.target.value)}
                                          placeholder="Describe affected medicine, batch/seal issue, or missing count..."
                                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          disabled={returnSubmitting}
                                          onClick={async () => {
                                            setReturnSubmitting(true);
                                            try {
                                              const res = await requestReturnRefund({
                                                order_id: activeOrder.order_id,
                                                reason_code: returnReasonCode,
                                                description: returnDescDraft,
                                                requested_refund_amount: Number(returnAmountDraft || 0),
                                              });
                                              if (!res.ok) {
                                                setFeedback({
                                                  type: 'error',
                                                  text: res.error || 'Could not submit return request.',
                                                });
                                              } else {
                                                setReturnFormOrderId(null);
                                                setFeedback({
                                                  type: 'success',
                                                  text: `Return request ${res.data?.reference_code || ''} sent to ${merchant?.shop_name || 'the store'}.`,
                                                });
                                              }
                                            } finally {
                                              setReturnSubmitting(false);
                                            }
                                          }}
                                          className="rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                        >
                                          {returnSubmitting ? 'Submitting...' : 'Submit Return Request'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Report Order Problem Strip */}
                            {windowStatus.allowed && (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200/70 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/25 px-4 py-2.5">
                                <span className="text-xs text-slate-700 dark:text-slate-300">
                                  Wrong, missing, or damaged medicine on this order?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setReportOrderTarget(activeOrder)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                                >
                                  <Flag className="w-3.5 h-3.5" />
                                  Report a Problem
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    {/* Status Timeline */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Status History
                      </h3>
                      <ol className="space-y-2 text-xs">
                        {activeOrder.status_history.map((h) => (
                          <li
                            key={h.history_id}
                            className="flex items-start gap-2.5 text-slate-600 dark:text-slate-400"
                          >
                            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {ORDER_STATUS_LABEL[h.status]}
                              </span>
                              <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                                {' '}
                                · {new Date(h.created_at).toLocaleString()}
                              </span>
                              {h.note && (
                                <p className="text-slate-600 dark:text-slate-400 mt-0.5">{h.note}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingOrderId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3
                id="cancel-order-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                Cancel Medicine Order?
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Reserved stock will be immediately restored to the pharmacy.
            </p>
            <div>
              <label
                htmlFor="cancel-reason-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Cancellation Reason
              </label>
              <input
                id="cancel-reason-input"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancellingOrderId(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={handleConfirmCancel}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-upload Rx Modal */}
      {reuploadOrderId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reupload-rx-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleReuploadSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3
                id="reupload-rx-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                Re-upload Prescription Proof
              </h3>
              <button
                type="button"
                onClick={() => setReuploadOrderId(null)}
                aria-label="Close re-upload modal"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reuploadError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-800 dark:text-red-300">
                {reuploadError}
              </div>
            )}

            <div>
              <label
                htmlFor="reup-doc"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Doctor Name *
              </label>
              <input
                id="reup-doc"
                type="text"
                required
                value={rxDoctor}
                onChange={(e) => setRxDoctor(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reup-lic"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  PRC License No. *
                </label>
                <input
                  id="reup-lic"
                  type="text"
                  required
                  value={rxLicense}
                  onChange={(e) => setRxLicense(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="reup-date"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Date Issued *
                </label>
                <input
                  id="reup-date"
                  type="date"
                  required
                  value={rxDate}
                  onChange={(e) => setRxDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Prescription File (JPG / PNG / PDF)
                </label>
                <button
                  type="button"
                  onClick={handleUseSampleReupload}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  Use Sample Olongapo Rx
                </button>
              </div>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleRxFileChange}
                className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-800 dark:file:text-slate-100"
              />
              {rxPreviewUrl && rxFileType !== 'pdf' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-2">
                  <img
                    src={rxPreviewUrl}
                    alt="Re-upload prescription preview"
                    className="w-full max-h-40 object-contain"
                  />
                </div>
              )}
              {rxFileType === 'pdf' && rxFileName && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>{rxFileName}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReuploadOrderId(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reuploadSubmitting}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {reuploadSubmitting ? 'Submitting...' : 'Submit Updated Rx'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full-size Rx Proof Modal */}
      {previewRxOrder && previewRxOrder.prescription && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resident-rx-proof-title"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3
                  id="resident-rx-proof-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-white"
                >
                  Attached Prescription Proof · {previewRxOrder.order_code}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Patient: {previewRxOrder.prescription.patient_name} · Physician:{' '}
                  {previewRxOrder.prescription.doctor_name} ({previewRxOrder.prescription.license_no})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRxOrder(null)}
                aria-label="Close prescription proof preview"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewRxOrder.prescription.file_type === 'pdf' ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-8 text-center space-y-2">
                <FileText className="w-10 h-10 mx-auto text-teal-600 dark:text-teal-400" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {previewRxOrder.prescription.file_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PDF prescription attached and submitted to pharmacist for verification.
                </p>
              </div>
            ) : (
              <img
                src={previewRxOrder.prescription.file_preview_url}
                alt={`Prescription proof for ${previewRxOrder.order_code}`}
                className="w-full max-h-[68vh] object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
              />
            )}
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3
                  id="receipt-modal-title"
                  className="font-display text-lg font-bold text-slate-900 dark:text-white"
                >
                  MedEx Official Receipt
                </h3>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {receiptOrder.payment.receipt_number} · {receiptOrder.order_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                aria-label="Close receipt modal"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <p>Recipient: {receiptOrder.recipient_name}</p>
              <p>Address: {receiptOrder.delivery_address_snapshot}</p>
              <p>
                Payment: {receiptOrder.payment.method} ({receiptOrder.payment.status.toUpperCase()})
              </p>
              {receiptOrder.payment.gateway_reference && (
                <p className="font-mono">Gateway Ref: {receiptOrder.payment.gateway_reference}</p>
              )}
            </div>
            <div className="border-t border-b border-slate-200 dark:border-slate-800 py-3 space-y-1.5 text-xs text-slate-800 dark:text-slate-200">
              {receiptOrder.items.map((i) => (
                <div key={i.order_item_id} className="flex justify-between">
                  <span>
                    {i.quantity}x {i.product_name}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatPHP(i.unit_price * i.quantity)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1">
                <span>Delivery Fee</span>
                <span className="tabular-nums">{formatPHP(receiptOrder.delivery_fee)}</span>
              </div>
              {(receiptOrder.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between font-semibold text-teal-700 dark:text-teal-400">
                  <span>Promo Coupon ({receiptOrder.coupon_code || 'Applied'})</span>
                  <span className="tabular-nums">
                    -{formatPHP(receiptOrder.discount_amount || 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 dark:text-white text-sm pt-1">
                <span>Total Amount</span>
                <span className="tabular-nums">{formatPHP(receiptOrder.total_amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <RateStoreModal
        open={rateStoreTarget !== null}
        order={rateStoreTarget?.order ?? null}
        existingReview={rateStoreTarget?.existing ?? null}
        onClose={() => setRateStoreTarget(null)}
        onOpenMyFeedback={() => setActiveTab('feedback')}
      />
      <RateRiderModal
        open={rateRiderOrder !== null}
        order={rateRiderOrder}
        onClose={() => setRateRiderOrder(null)}
      />
      <ReportProblemModal
        open={reportOrderTarget !== null}
        source="order"
        orderId={reportOrderTarget?.order_id ?? null}
        merchantId={reportOrderTarget?.merchant_id ?? null}
        productId={reportOrderTarget?.items[0]?.product_id ?? null}
        onClose={() => setReportOrderTarget(null)}
        onOpenMyFeedback={() => setActiveTab('feedback')}
      />
      <GCashCheckoutSheet
        open={gcashTargetOrder !== null}
        order={gcashTargetOrder}
        merchantName={
          state.merchants.find((m) => m.merchant_id === gcashTargetOrder?.merchant_id)?.shop_name ||
          'Partner Pharmacy'
        }
        defaultPhone={gcashTargetOrder?.recipient_phone || currentUser.phone_number}
        customerName={`${currentUser.first_name} ${currentUser.last_name}`}
        customerEmail={currentUser.email}
        onClose={() => setGcashTargetOrder(null)}
        onAuthorizeResult={(
          orderId,
          shouldSucceed,
          mobileUsed,
          serverGatewayReference,
          isLiveGateway,
          backendDbSynced
        ) => {
          const res = retryGcashPayment(
            orderId,
            shouldSucceed,
            mobileUsed,
            serverGatewayReference,
            isLiveGateway,
            backendDbSynced
          );
          if (!res.ok) {
            setFeedback({ type: 'error', text: res.error || 'GCash payment failed.' });
          } else if (shouldSucceed) {
            setFeedback({
              type: 'success',
              text: `GCash payment authorized via MedEx Backend (${serverGatewayReference || 'PayMongo'}). Your order is now sent to the pharmacy.`,
            });
          } else {
            setFeedback({
              type: 'error',
              text: 'GCash authorization declined in PayMongo sandbox. You can retry payment or switch to COD.',
            });
          }
          setGcashTargetOrder(null);
        }}
        onSwitchToCod={(orderId) => {
          switchPaymentToCod(orderId);
          setFeedback({
            type: 'success',
            text: 'Order switched to Cash on Delivery (COD).',
          });
          setGcashTargetOrder(null);
        }}
      />
    </div>
  );
};

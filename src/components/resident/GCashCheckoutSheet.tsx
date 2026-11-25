import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import type { Order } from '../../types/medex';
import {
  authorizeGcashSandboxSession,
  createGcashCheckoutSession,
  fetchBackendHealth,
  type BackendPayMongoMode,
} from '../../utils/apiClient';
import { formatPHP, isSafeHttpsUrl, normalizePHPhoneNumber } from '../../utils/medexRules';

interface GCashCheckoutSheetProps {
  open: boolean;
  order: Order | null;
  merchantName: string;
  defaultPhone: string;
  customerName?: string;
  customerEmail?: string;
  onClose: () => void;
  onAuthorizeResult: (
    orderId: number,
    shouldSucceed: boolean,
    mobileUsed: string,
    serverGatewayReference?: string,
    isLiveGateway?: boolean,
    backendDbSynced?: boolean
  ) => void;
  onSwitchToCod?: (orderId: number) => void;
}

export const GCashCheckoutSheet: React.FC<GCashCheckoutSheetProps> = ({
  open,
  order,
  merchantName,
  defaultPhone,
  customerName,
  customerEmail,
  onClose,
  onAuthorizeResult,
  onSwitchToCod,
}) => {
  const [gcashMobile, setGcashMobile] = useState(defaultPhone);
  const [mpinPreview, setMpinPreview] = useState('1234');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [backendMode, setBackendMode] = useState<BackendPayMongoMode>('sandbox');

  useEffect(() => {
    if (open) {
      setGcashMobile(defaultPhone);
      setMpinPreview('1234');
      setError(null);
      setIsProcessing(false);
      void fetchBackendHealth().then((health) => {
        if (health?.paymongoMode) {
          setBackendMode(health.paymongoMode);
        }
      });
    }
  }, [open, defaultPhone, order?.order_id]);

  if (!open || !order) return null;

  const validateBeforePay = (): string | null => {
    const normalized = normalizePHPhoneNumber(gcashMobile);
    if (!normalized) {
      setError('Enter a valid Philippine GCash mobile number (e.g., 09171234567 or +639171234567).');
      return null;
    }
    if (backendMode === 'sandbox' && !/^\d{4}$/.test(mpinPreview.trim())) {
      setError('Enter any 4-digit sandbox MPIN to simulate GCash authorization.');
      return null;
    }
    setError(null);
    return normalized;
  };

  const handlePay = async (shouldSucceed: boolean) => {
    const normalized = validateBeforePay();
    if (!normalized || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const checkoutRes = await createGcashCheckoutSession({
        orderId: order.order_id,
        orderCode: order.order_code,
        idempotencyKey: `${order.payment.idempotency_key}-${Date.now()}`,
        amount: order.total_amount,
        deliveryFee: order.delivery_fee,
        items: order.items.map((it) => ({
          name: it.product_name,
          quantity: it.quantity,
          unitPrice: it.unit_price,
        })),
        merchantName,
        customerName: customerName || order.recipient_name,
        customerEmail,
        customerPhone: normalized,
        hasPrescription: Boolean(order.prescription),
        prescriptionStatus: order.prescription?.status,
      });

      if (!checkoutRes.ok || !checkoutRes.session) {
        setError(checkoutRes.error || 'Unable to create PayMongo checkout session.');
        setIsProcessing(false);
        return;
      }

      if (checkoutRes.session.mode === 'paymongo_live' && checkoutRes.session.checkoutUrl) {
        if (!isSafeHttpsUrl(checkoutRes.session.checkoutUrl)) {
          setError('Unsafe payment gateway redirect URL blocked.');
          setIsProcessing(false);
          return;
        }
        window.location.assign(checkoutRes.session.checkoutUrl);
        return;
      }

      const authRes = await authorizeGcashSandboxSession({
        sessionId: checkoutRes.session.sessionId,
        shouldSucceed,
        gcashMobile: normalized,
      });

      if (!authRes.ok || !authRes.session) {
        setError(authRes.error || 'GCash authorization failed on backend.');
        setIsProcessing(false);
        return;
      }

      setIsProcessing(false);
      onAuthorizeResult(
        order.order_id,
        authRes.session.status === 'paid',
        normalized,
        authRes.session.gatewayReference,
        false,
        Boolean(authRes.dbSynced)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected payment error.');
      setIsProcessing(false);
    }
  };

  const isRxApprovedOrder = order.prescription?.status === 'approved';
  const isLiveMode = backendMode === 'paymongo_live';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcash-sheet-title"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Branded PayMongo × GCash Header */}
        <div className="bg-gradient-to-r from-[#007DFE] via-[#0066E5] to-[#0052CC] px-5 py-4 text-white flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {isLiveMode
                  ? 'PayMongo × GCash Live API'
                  : 'Express API · PayMongo GCash Sandbox'}
              </span>
            </div>
            <h2 id="gcash-sheet-title" className="font-display text-lg font-bold leading-tight">
              Authorize GCash Payment
            </h2>
            <p className="text-xs text-blue-100">
              {merchantName} · <span className="font-mono">{order.order_code}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            aria-label="Close GCash checkout"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Amount Summary Card */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/35 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Total Amount Payable
              </p>
              <p className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {formatPHP(order.total_amount)}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {order.items.length} item(s) + {formatPHP(order.delivery_fee)} Olongapo delivery
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#007DFE] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          {isRxApprovedOrder && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/80 dark:bg-teal-950/40 px-3.5 py-2.5 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>Pharmacist Rx Approved:</strong> Verified by{' '}
                {order.prescription?.reviewed_by || 'Pharmacist'}. Completing payment immediately sends{' '}
                {order.order_code} to preparation.
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs font-medium text-red-800 dark:text-red-300 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Wallet Credentials Preview */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="gcash-mobile-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                GCash Registered Mobile Number
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="gcash-mobile-input"
                  type="tel"
                  disabled={isProcessing}
                  value={gcashMobile}
                  onChange={(e) => setGcashMobile(e.target.value)}
                  placeholder="09171234567"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-2 focus:outline-[#007DFE] disabled:opacity-60"
                />
              </div>
            </div>

            {!isLiveMode && (
              <div>
                <label
                  htmlFor="gcash-mpin-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Sandbox 4-Digit MPIN Preview
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="gcash-mpin-input"
                    type="password"
                    maxLength={4}
                    disabled={isProcessing}
                    value={mpinPreview}
                    onChange={(e) => setMpinPreview(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2.5 text-sm font-mono tracking-[0.35em] text-slate-900 dark:text-white focus:outline-2 focus:outline-[#007DFE] disabled:opacity-60"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Connected to MedEx Express Backend API in sandbox mode. Add PAYMONGO_SECRET_KEY on the server to switch automatically to live PayMongo GCash redirects.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handlePay(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#007DFE] hover:bg-[#0066E5] px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors min-h-[46px] disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Contacting MedEx Payment API…</span>
                </>
              ) : (
                <>
                  <span>
                    {isLiveMode
                      ? `Continue to PayMongo GCash (${formatPHP(order.total_amount)})`
                      : `Authorize & Pay ${formatPHP(order.total_amount)}`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {!isLiveMode && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => void handlePay(false)}
                className="w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/35 hover:bg-amber-100/80 dark:hover:bg-amber-900/45 px-4 py-2.5 text-xs font-semibold text-amber-900 dark:text-amber-200 transition-colors disabled:opacity-60"
              >
                Simulate Declined / Failed Payment
              </button>
            )}

            {onSwitchToCod && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => onSwitchToCod(order.order_id)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-60"
              >
                Switch to Cash on Delivery (COD) instead
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


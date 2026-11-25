import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Minus,
  Plus,
  Ticket,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Coupon, Order, PaymentMethodType } from '../../types/medex';
import { POLICY_VERSION } from '../../data/policiesData';
import { formatPHP } from '../../utils/medexRules';
import { buildOlongapoSampleRxSvg, readPrescriptionFile } from '../../utils/sampleRx';
import { PoliciesModal } from '../common/PoliciesModal';
import { GCashCheckoutSheet } from './GCashCheckoutSheet';

interface CartCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  onOrderPlaced: (order: Order) => void;
}

export const CartCheckoutModal: React.FC<CartCheckoutModalProps> = ({
  open,
  onClose,
  onOrderPlaced,
}) => {
  const {
    state,
    currentUser,
    activeCart,
    draftRxProof,
    setDraftRxProof,
    updateCartQuantity,
    clearCart,
    placeOrder,
    previewValidateCoupon,
    retryGcashPayment,
    switchPaymentToCod,
    saveAddress,
    setActiveTab,
  } = useMedEx();

  const [step, setStep] = useState<'cart' | 'rx' | 'delivery' | 'payment' | 'receipt'>('cart');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [gcashSheetOpen, setGcashSheetOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delivery fields
  const userAddresses = useMemo(
    () => state.addresses.filter((a) => a.user_id === currentUser.user_id),
    [state.addresses, currentUser.user_id]
  );
  const primaryAddr = userAddresses.find((a) => a.is_primary) || userAddresses[0];

  const [selectedAddressId, setSelectedAddressId] = useState<number>(primaryAddr?.address_id || 0);
  const [recipientName, setRecipientName] = useState(
    primaryAddr?.recipient_name || `${currentUser.first_name} ${currentUser.last_name}`
  );
  const [recipientPhone, setRecipientPhone] = useState(
    primaryAddr?.recipient_phone || currentUser.phone_number
  );
  const [riderNote, setRiderNote] = useState(primaryAddr?.delivery_instructions || '');

  // Quick inline address creation if resident has none or wants new
  const [showNewAddr, setShowNewAddr] = useState(false);
  const [newStreet, setNewStreet] = useState('');
  const [newBarangayId, setNewBarangayId] = useState(state.barangays[0]?.barangay_id || 1);
  const [newLandmark, setNewLandmark] = useState('');

  // Prescription fields
  const [patientName, setPatientName] = useState(`${currentUser.first_name} ${currentUser.last_name}`);
  const [doctorName, setDoctorName] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [dateIssued, setDateIssued] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('');
  const [rxFileName, setRxFileName] = useState('');
  const [rxFileType, setRxFileType] = useState<'jpg' | 'png' | 'pdf'>('png');
  const [rxPreviewUrl, setRxPreviewUrl] = useState('');
  const [rxAttested, setRxAttested] = useState(false);

  // Payment fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('GCash');
  const [checkoutPolicyAccepted, setCheckoutPolicyAccepted] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);

  // Promo coupon fields
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ coupon: Coupon; discountAmount: number } | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      if (!placedOrder) {
        setStep('cart');
      }
      if (primaryAddr) {
        setSelectedAddressId(primaryAddr.address_id);
        setRecipientName(primaryAddr.recipient_name);
        setRecipientPhone(primaryAddr.recipient_phone);
        setRiderNote(primaryAddr.delivery_instructions || '');
      }
      if (draftRxProof) {
        setPatientName(draftRxProof.patient_name || `${currentUser.first_name} ${currentUser.last_name}`);
        setDoctorName(draftRxProof.doctor_name);
        setLicenseNo(draftRxProof.license_no);
        setDateIssued(draftRxProof.date_issued);
        setValidUntil(draftRxProof.valid_until || '');
        setRxFileName(draftRxProof.file_name);
        setRxFileType(draftRxProof.file_type);
        setRxPreviewUrl(draftRxProof.file_preview_url);
      } else {
        setPatientName(`${currentUser.first_name} ${currentUser.last_name}`);
      }
      setRxAttested(false);
      setCheckoutPolicyAccepted(false);
    } else {
      setPlacedOrder(null);
      setGcashSheetOpen(false);
      setStep('cart');
      setRxAttested(false);
      setCheckoutPolicyAccepted(false);
      setPoliciesOpen(false);
      setCouponCodeInput('');
      setAppliedCoupon(null);
      setCouponFeedback(null);
    }
  }, [open, currentUser.user_id, draftRxProof]);

  const displayOrder = useMemo(() => {
    if (!placedOrder) return null;
    return state.orders.find((o) => o.order_id === placedOrder.order_id) || placedOrder;
  }, [placedOrder, state.orders]);

  const merchant = useMemo(
    () => state.merchants.find((m) => m.merchant_id === activeCart.merchant_id) || null,
    [state.merchants, activeCart.merchant_id]
  );

  const cartLines = useMemo(() => {
    return activeCart.items
      .map((ci) => {
        const product = state.products.find((p) => p.product_id === ci.product_id);
        if (!product) return null;
        return {
          product,
          quantity: ci.quantity,
          unitPrice: product.regular_price,
          lineTotal: Number((product.regular_price * ci.quantity).toFixed(2)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [activeCart.items, state.products]);

  const hasRxItem = cartLines.some((line) => line.product.requires_prescription);
  const firstRxMedicine = cartLines.find((line) => line.product.requires_prescription)?.product.name;
  const subtotal = useMemo(
    () => Number(cartLines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2)),
    [cartLines]
  );
  const claimedActiveCoupons = useMemo(() => {
    const claimedIds = new Set(
      state.customerCoupons
        .filter((cc) => cc.resident_id === currentUser.user_id && cc.status === 'claimed')
        .map((cc) => cc.coupon_id)
    );
    return state.coupons.filter((c) => claimedIds.has(c.coupon_id) && c.is_active);
  }, [state.customerCoupons, state.coupons, currentUser.user_id]);
  const deliveryFee = cartLines.length > 0 ? 45.0 : 0;
  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const totalAmount = Number(Math.max(0, subtotal - discountAmount + deliveryFee).toFixed(2));

  if (!open) return null;

  const handleSelectAddress = (addrId: number) => {
    setSelectedAddressId(addrId);
    const found = userAddresses.find((a) => a.address_id === addrId);
    if (found) {
      setRecipientName(found.recipient_name);
      setRecipientPhone(found.recipient_phone);
      setRiderNote(found.delivery_instructions || '');
    }
  };

  const handleSaveInlineAddress = () => {
    setError(null);
    const res = saveAddress({
      barangay_id: newBarangayId,
      recipient_name: recipientName || `${currentUser.first_name} ${currentUser.last_name}`,
      recipient_phone: recipientPhone || currentUser.phone_number,
      street: newStreet,
      landmark: newLandmark || undefined,
      delivery_instructions: riderNote || undefined,
      latitude: 14.8342,
      longitude: 120.2834,
      is_primary: true,
    });
    if (!res.ok) {
      setError(res.error || 'Could not save address.');
      return;
    }
    setShowNewAddr(false);
    setNewStreet('');
    setNewLandmark('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await readPrescriptionFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRxFileName(result.fileName);
    setRxFileType(result.fileType);
    setRxPreviewUrl(result.previewUrl);
  };

  const applySampleRx = () => {
    setError(null);
    const fullName = `${currentUser.first_name} ${currentUser.last_name}`;
    setPatientName(fullName);
    setDoctorName('Dr. Josefa Navarro, MD');
    setLicenseNo('PRC-0114892');
    setDateIssued('2026-11-13');
    setValidUntil('2026-12-13');
    setRxFileName('olongapo_clinic_rx_navarro.png');
    setRxFileType('png');
    setRxPreviewUrl(buildOlongapoSampleRxSvg(fullName, firstRxMedicine || 'Amoxicillin 500mg Capsules (#14)'));
  };

  const clearRxAttachment = () => {
    setRxFileName('');
    setRxPreviewUrl('');
    setRxAttested(false);
    setDraftRxProof(null);
  };

  const goFromCart = () => {
    setError(null);
    if (cartLines.length === 0) return;
    if (hasRxItem) {
      setStep('rx');
    } else {
      setStep('delivery');
    }
  };

  const goFromRx = () => {
    setError(null);
    if (!patientName.trim() || !doctorName.trim() || !licenseNo.trim() || !dateIssued) {
      setError('Patient name, prescribing doctor, PRC license number, and date issued are required.');
      return;
    }
    if (!rxFileName || !rxPreviewUrl) {
      setError('Upload a prescription image/PDF (or use the sample Olongapo Rx) to continue.');
      return;
    }
    if (!rxAttested) {
      setError('Please confirm that this prescription is authentic and issued by a licensed physician.');
      return;
    }
    setStep('delivery');
  };

  const goFromDelivery = () => {
    setError(null);
    const effectiveAddrId = selectedAddressId || userAddresses[0]?.address_id;
    if (!effectiveAddrId) {
      setError('Please add and select a delivery address.');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim()) {
      setError('Recipient name and mobile number are required.');
      return;
    }
    setSelectedAddressId(effectiveAddrId);
    setStep('payment');
  };

  const handleApplyCoupon = async (overrideCode?: string) => {
    const code = (overrideCode ?? couponCodeInput).trim().toUpperCase();
    if (!code || !activeCart.merchant_id || applyingCoupon) {
      if (!code) setCouponFeedback({ ok: false, text: 'Enter a promo coupon code first.' });
      return;
    }
    setApplyingCoupon(true);
    setCouponFeedback(null);
    try {
      const res = await previewValidateCoupon({
        code,
        merchant_id: activeCart.merchant_id,
        items: activeCart.items,
      });
      if (!res.ok || !res.data) {
        setAppliedCoupon(null);
        setCouponFeedback({ ok: false, text: res.error || 'Coupon code is not valid for this cart.' });
        return;
      }
      setCouponCodeInput(res.data.coupon.code);
      setAppliedCoupon({ coupon: res.data.coupon, discountAmount: res.data.discountAmount });
      setCouponFeedback({
        ok: true,
        text: `${res.data.coupon.code} applied! Saving ${formatPHP(res.data.discountAmount)}.`,
      });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (placingOrder) return;
    setError(null);
    if (!checkoutPolicyAccepted) {
      setError(
        'Please acknowledge the MedEx Order, Cancellation & Prescription Policies before placing your order.'
      );
      return;
    }
    const effectiveAddrId = selectedAddressId || userAddresses[0]?.address_id;
    if (!effectiveAddrId) {
      setError('Please select a delivery address.');
      return;
    }
    const deferGcash = paymentMethod === 'GCash' && !hasRxItem;
    setPlacingOrder(true);
    try {
      const res = await placeOrder({
        address_id: effectiveAddrId,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        rider_note: riderNote,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon?.coupon.code,
        deferGcashToGateway: deferGcash,
        prescription: hasRxItem
          ? {
              patient_name: patientName.trim(),
              doctor_name: doctorName.trim(),
              license_no: licenseNo.trim(),
              date_issued: dateIssued,
              valid_until: validUntil || undefined,
              file_name: rxFileName,
              file_type: rxFileType,
              file_preview_url: rxPreviewUrl,
            }
          : undefined,
        idempotency_key: `ord-${currentUser.user_id}-${Date.now()}`,
      });

      if (!res.ok || !res.data) {
        setError(res.error || 'Could not place order.');
        return;
      }

      if (hasRxItem) {
        setDraftRxProof(null);
      }
      setPlacedOrder(res.data);
      setStep('receipt');
      if (deferGcash) {
        setGcashSheetOpen(true);
      }
      onOrderPlaced(res.data);
    } finally {
      setPlacingOrder(false);
    }
  };

  const stepLabels = hasRxItem
    ? ['Cart', '1. Prescription Proof', '2. Delivery', '3. Payment']
    : ['Cart', '1. Delivery', '2. Payment'];

  const activeStepIndex =
    step === 'cart'
      ? 0
      : step === 'rx'
        ? 1
        : step === 'delivery'
          ? hasRxItem
            ? 2
            : 1
          : step === 'payment'
            ? hasRxItem
              ? 3
              : 2
            : stepLabels.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2
              id="checkout-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white"
            >
              {step === 'receipt' && displayOrder
                ? `Order Receipt · ${displayOrder.order_code}`
                : 'Medicine Cart & Checkout'}
            </h2>
            {merchant && step !== 'receipt' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Fulfilling Pharmacy:{' '}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {merchant.shop_name}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Cart Modal"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        {step !== 'receipt' && cartLines.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            {stepLabels.map((lbl, idx) => (
              <React.Fragment key={lbl}>
                <span
                  className={
                    idx === activeStepIndex
                      ? 'font-semibold text-teal-700 dark:text-teal-400'
                      : idx < activeStepIndex
                        ? 'text-slate-700 dark:text-slate-300 font-medium'
                        : 'text-slate-400 dark:text-slate-500'
                  }
                >
                  {lbl}
                </span>
                {idx < stepLabels.length - 1 && (
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP: CART */}
          {step === 'cart' && (
            <>
              {cartLines.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Your medicine cart is empty
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Search medicines in the Pharmacy Locator or browse the Medicine Store to add items.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hasRxItem && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                      <span>
                        Prescription proof is required in the next step before pharmacist release.
                      </span>
                      {draftRxProof && (
                        <span className="font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                          Proof Ready: {draftRxProof.file_name}
                        </span>
                      )}
                    </div>
                  )}

                  {cartLines.map(({ product, quantity, unitPrice, lineTotal }) => (
                    <div
                      key={product.product_id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={product.image_path}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-50 dark:bg-slate-800"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {formatPHP(unitPrice)} / {product.unit}
                            {product.requires_prescription && ' · Rx Proof Required'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              const r = updateCartQuantity(product.product_id, quantity - 1);
                              if (!r.ok && r.error) setError(r.error);
                            }}
                            aria-label={`Decrease quantity of ${product.name}`}
                            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-h-[36px]"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const r = updateCartQuantity(product.product_id, quantity + 1);
                              if (!r.ok && r.error) setError(r.error);
                            }}
                            aria-label={`Increase quantity of ${product.name}`}
                            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-h-[36px]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                            {formatPHP(lineTotal)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(product.product_id, 0)}
                          aria-label={`Remove ${product.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatPHP(subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Standard Delivery Fee</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatPHP(deliveryFee)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-slate-900 dark:text-white">
                      <span>Total Due</span>
                      <span className="tabular-nums">{formatPHP(totalAmount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP: PRESCRIPTION UPLOAD */}
          {step === 'rx' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-semibold">Doctor's Prescription Proof Required for Controlled Items</p>
                <p>
                  Your order contains prescription-regulated medicine. Attach a clear photo or PDF
                  from a licensed physician so the pharmacist at {merchant?.shop_name} can verify legitimacy.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Accepted: JPG, PNG, camera capture, or PDF (max 10 MB)
                </span>
                <button
                  type="button"
                  onClick={applySampleRx}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                >
                  Use Sample Olongapo Rx
                </button>
              </div>

              <label className="block rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 p-4 text-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <Upload className="w-5 h-5 mx-auto text-teal-700 dark:text-teal-400 mb-1" />
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {rxFileName ? `Selected: ${rxFileName}` : 'Upload prescription photo or PDF'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click to choose file or take photo
                </p>
              </label>

              {rxPreviewUrl && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-950 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1.5 truncate">
                      <FileCheck2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{rxFileName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearRxAttachment}
                      className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                    >
                      Remove / Replace
                    </button>
                  </div>
                  {rxFileType === 'pdf' ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center text-xs text-slate-600 dark:text-slate-300">
                      <FileText className="w-6 h-6 mx-auto text-teal-600 dark:text-teal-400 mb-1" />
                      <p className="font-semibold">PDF Prescription Attached</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{rxFileName}</p>
                    </div>
                  ) : (
                    <img
                      src={rxPreviewUrl}
                      alt="Uploaded prescription preview"
                      className="w-full max-h-48 object-contain rounded-lg bg-white"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="rx-patient"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Patient Name *
                  </label>
                  <input
                    id="rx-patient"
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rx-doctor"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Prescribing Doctor *
                  </label>
                  <input
                    id="rx-doctor"
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Dr. Josefa Navarro, MD"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rx-prc"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    PRC License No. *
                  </label>
                  <input
                    id="rx-prc"
                    type="text"
                    value={licenseNo}
                    onChange={(e) => setLicenseNo(e.target.value)}
                    placeholder="PRC-0114892"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="rx-issued"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Date Issued *
                    </label>
                    <input
                      id="rx-issued"
                      type="date"
                      value={dateIssued}
                      onChange={(e) => setDateIssued(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rx-valid"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Valid Until
                    </label>
                    <input
                      id="rx-valid"
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rxAttested}
                  onChange={(e) => setRxAttested(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  I confirm this prescription is authentic, unaltered, and issued by a licensed physician for the named patient.
                </span>
              </label>
            </div>
          )}

          {/* STEP: DELIVERY DETAILS */}
          {step === 'delivery' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Saved Delivery Addresses
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewAddr(!showNewAddr)}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  {showNewAddr ? 'Cancel New Address' : '+ Add New Address'}
                </button>
              </div>

              {showNewAddr ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="new-addr-brgy"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Barangay *
                      </label>
                      <select
                        id="new-addr-brgy"
                        value={newBarangayId}
                        onChange={(e) => setNewBarangayId(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                      >
                        {state.barangays.map((b) => (
                          <option key={b.barangay_id} value={b.barangay_id}>
                            Brgy. {b.name}, {b.city}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="new-addr-street"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Street / Building / Unit *
                      </label>
                      <input
                        id="new-addr-street"
                        type="text"
                        value={newStreet}
                        onChange={(e) => setNewStreet(e.target.value)}
                        placeholder="e.g., 42 Rizal Ave, East Bajac-Bajac"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="new-addr-landmark"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Nearest Landmark
                    </label>
                    <input
                      id="new-addr-landmark"
                      type="text"
                      value={newLandmark}
                      onChange={(e) => setNewLandmark(e.target.value)}
                      placeholder="Near Barangay Hall"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveInlineAddress}
                    className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500"
                  >
                    Save &amp; Set Primary Address
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userAddresses.length === 0 ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3">
                      No saved addresses yet. Click "+ Add New Address" above to add one.
                    </p>
                  ) : (
                    userAddresses.map((addr) => {
                      const brgy = state.barangays.find((b) => b.barangay_id === addr.barangay_id);
                      const selected =
                        (selectedAddressId || primaryAddr?.address_id) === addr.address_id;
                      return (
                        <label
                          key={addr.address_id}
                          className={`block rounded-xl border p-3 cursor-pointer transition-colors ${
                            selected
                              ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/35'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="radio"
                              name="delivery-address"
                              checked={selected}
                              onChange={() => handleSelectAddress(addr.address_id)}
                              className="mt-1 accent-teal-600"
                            />
                            <div className="text-sm">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {addr.street}
                                {brgy ? `, Brgy. ${brgy.name}, ${brgy.city}` : ''}
                                {addr.is_primary ? ' · Primary' : ''}
                              </p>
                              {addr.landmark && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  Landmark: {addr.landmark}
                                </p>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="rec-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Recipient Name *
                  </label>
                  <input
                    id="rec-name"
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rec-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Recipient Mobile (+63) *
                  </label>
                  <input
                    id="rec-phone"
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="rider-note"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Rider Instructions (optional)
                </label>
                <input
                  id="rider-note"
                  type="text"
                  value={riderNote}
                  onChange={(e) => setRiderNote(e.target.value)}
                  placeholder="Call upon arrival at guardhouse"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* STEP: PAYMENT METHOD */}
          {step === 'payment' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2 text-sm">
                <p className="font-semibold text-slate-900 dark:text-white">Order Summary</p>
                {cartLines.map((l) => (
                  <div
                    key={l.product.product_id}
                    className="flex justify-between text-xs text-slate-600 dark:text-slate-400"
                  >
                    <span>
                      {l.quantity}x {l.product.name}
                    </span>
                    <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                      {formatPHP(l.lineTotal)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Delivery Fee</span>
                  <span className="tabular-nums">{formatPHP(deliveryFee)}</span>
                </div>
                {discountAmount > 0 && appliedCoupon && (
                  <div className="flex justify-between text-xs font-semibold text-teal-700 dark:text-teal-400">
                    <span>Promo Coupon ({appliedCoupon.coupon.code})</span>
                    <span className="tabular-nums">-{formatPHP(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Payable</span>
                  <span className="tabular-nums">{formatPHP(totalAmount)}</span>
                </div>
              </div>

              {/* Promo / Coupon Code Section */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="checkout-coupon-input"
                    className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"
                  >
                    <Ticket className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Promo / Coupon Code (Optional)</span>
                  </label>
                  {appliedCoupon && (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponCodeInput('');
                        setCouponFeedback(null);
                      }}
                      className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    id="checkout-coupon-input"
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter promo code (e.g., MEDEX50)"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono uppercase text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={applyingCoupon}
                    onClick={() => void handleApplyCoupon()}
                    className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap"
                  >
                    {applyingCoupon ? 'Checking...' : 'Apply'}
                  </button>
                </div>

                {claimedActiveCoupons.length > 0 && !appliedCoupon && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Your claimed coupons:
                    </span>
                    {claimedActiveCoupons.map((c) => (
                      <button
                        key={c.coupon_id}
                        type="button"
                        onClick={() => void handleApplyCoupon(c.code)}
                        className="rounded-md border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60"
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                )}

                {couponFeedback && (
                  <p
                    className={`text-xs font-medium ${
                      couponFeedback.ok
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {couponFeedback.text}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Select Payment Method
                </p>

                <label
                  className={`block rounded-xl border p-3.5 cursor-pointer transition-colors ${
                    paymentMethod === 'GCash'
                      ? 'border-[#007DFE] bg-blue-50/70 dark:bg-blue-950/35 ring-1 ring-[#007DFE]/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === 'GCash'}
                      onChange={() => setPaymentMethod('GCash')}
                      className="mt-1 accent-[#007DFE]"
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#007DFE] text-white">
                            <Wallet className="w-3.5 h-3.5" />
                          </span>
                          <span>GCash e-Wallet</span>
                        </span>
                        <span className="rounded-md bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                          PayMongo Sandbox
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {hasRxItem
                          ? 'Your GCash wallet will NOT be charged yet. After the pharmacist approves your prescription, a "Pay via GCash" button unlocks in Orders.'
                          : 'Opens the PayMongo × GCash Checkout Sheet to authorize or test declined payment.'}
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-xl border p-3.5 cursor-pointer ${
                    paymentMethod === 'COD'
                      ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/35'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === 'COD'}
                      onChange={() => setPaymentMethod('COD')}
                      className="mt-1 accent-teal-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Cash on Delivery (COD)
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Prepare exact amount ({formatPHP(totalAmount)}) for the rider upon handoff.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    id="checkout-policy-ack"
                    type="checkbox"
                    checked={checkoutPolicyAccepted}
                    onChange={(e) => setCheckoutPolicyAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    I acknowledge the{' '}
                    <strong className="font-semibold text-slate-900 dark:text-white">
                      MedEx Order, Cancellation, Refund &amp; Prescription Policies (v{POLICY_VERSION})
                    </strong>
                    , including automatic stock reservation and pharmacist verification rules. *
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setPoliciesOpen(true)}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline pl-6"
                >
                  Review MedEx Platform Policies &rarr;
                </button>
              </div>
            </div>
          )}

          {/* STEP: RECEIPT */}
          {step === 'receipt' && displayOrder && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border p-4 flex items-start gap-3 ${
                  displayOrder.payment.status === 'failed'
                    ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40'
                    : displayOrder.payment.method === 'GCash' &&
                        displayOrder.payment.status === 'pending' &&
                        !displayOrder.prescription
                      ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/35'
                      : 'border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/40'
                }`}
              >
                <CheckCircle2
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    displayOrder.payment.status === 'failed'
                      ? 'text-red-700 dark:text-red-400'
                      : displayOrder.payment.method === 'GCash' &&
                          displayOrder.payment.status === 'pending' &&
                          !displayOrder.prescription
                        ? 'text-[#007DFE] dark:text-blue-400'
                        : 'text-teal-700 dark:text-teal-400'
                  }`}
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Order {displayOrder.order_code} Recorded
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      {displayOrder.status === 'awaiting_prescription_review'
                        ? displayOrder.payment.method === 'GCash'
                          ? 'Your prescription proof has been sent to the pharmacist. Once approved, a "Pay via GCash" button will unlock in Orders.'
                          : 'Your prescription proof has been sent to the pharmacist for review.'
                        : displayOrder.payment.status === 'failed'
                          ? 'GCash authorization was declined in PayMongo sandbox. You can retry GCash checkout or switch to Cash on Delivery.'
                          : displayOrder.payment.method === 'GCash' &&
                              displayOrder.payment.status === 'pending'
                            ? 'Complete your GCash sandbox authorization so the pharmacy can begin preparing your order.'
                            : displayOrder.status === 'pending'
                              ? 'Pharmacy is currently closed; your order is queued as pending.'
                              : 'Payment confirmed and order sent to the pharmacy for preparation.'}
                    </p>
                  </div>

                  {displayOrder.payment.method === 'GCash' &&
                    !displayOrder.prescription &&
                    (displayOrder.payment.status === 'pending' ||
                      displayOrder.payment.status === 'failed') && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setGcashSheetOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#007DFE] hover:bg-[#0066E5] px-3.5 py-2 text-xs font-bold text-white transition-colors"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>
                            {displayOrder.payment.status === 'failed'
                              ? `Retry GCash Checkout (${formatPHP(displayOrder.total_amount)})`
                              : `Authorize GCash (${formatPHP(displayOrder.total_amount)})`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => switchPaymentToCod(displayOrder.order_id)}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          Switch to COD
                        </button>
                      </div>
                    )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm print:border-0">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    Official MedEx Receipt
                  </span>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {displayOrder.payment.receipt_number}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">Payment Method:</span>{' '}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {displayOrder.payment.method}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500">Payment Status:</span>{' '}
                    <span className="font-medium text-slate-900 dark:text-white uppercase">
                      {displayOrder.payment.status}
                    </span>
                  </div>
                  {displayOrder.payment.gateway_reference && (
                    <div className="col-span-2">
                      <span className="text-slate-400 dark:text-slate-500">Sandbox Reference:</span>{' '}
                      <span className="font-mono text-slate-900 dark:text-white">
                        {displayOrder.payment.gateway_reference}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs">
                  {displayOrder.items.map((item) => (
                    <div
                      key={item.order_item_id}
                      className="flex justify-between text-slate-700 dark:text-slate-300"
                    >
                      <span>
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatPHP(item.unit_price * item.quantity)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Delivery Fee</span>
                    <span className="tabular-nums">{formatPHP(displayOrder.delivery_fee)}</span>
                  </div>
                  {(displayOrder.discount_amount ?? 0) > 0 && (
                    <div className="flex justify-between font-semibold text-teal-700 dark:text-teal-400">
                      <span>Promo Discount ({displayOrder.coupon_code || 'Coupon'})</span>
                      <span className="tabular-nums">
                        -{formatPHP(displayOrder.discount_amount || 0)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white text-sm pt-1.5 border-t border-slate-200 dark:border-slate-800">
                    <span>Total</span>
                    <span className="tabular-nums">{formatPHP(displayOrder.total_amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
          {step === 'cart' && (
            <>
              <button
                type="button"
                onClick={clearCart}
                disabled={cartLines.length === 0}
                className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-40 whitespace-nowrap"
              >
                Clear Cart
              </button>
              <button
                type="button"
                onClick={goFromCart}
                disabled={cartLines.length === 0}
                className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40 min-h-[42px] whitespace-nowrap"
              >
                Proceed to Checkout
              </button>
            </>
          )}

          {step === 'rx' && (
            <>
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[40px] whitespace-nowrap"
              >
                Back to Cart
              </button>
              <button
                type="button"
                onClick={goFromRx}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 min-h-[40px] whitespace-nowrap"
              >
                Continue to Delivery
              </button>
            </>
          )}

          {step === 'delivery' && (
            <>
              <button
                type="button"
                onClick={() => setStep(hasRxItem ? 'rx' : 'cart')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[40px] whitespace-nowrap"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goFromDelivery}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 min-h-[40px] whitespace-nowrap"
              >
                Continue to Payment
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button
                type="button"
                onClick={() => setStep('delivery')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[40px] whitespace-nowrap"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={placingOrder}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white min-h-[42px] whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentMethod === 'GCash' && !hasRxItem
                    ? 'bg-[#007DFE] hover:bg-[#0066E5]'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {placingOrder
                  ? 'Placing Order...'
                  : paymentMethod === 'GCash' && !hasRxItem
                    ? `Continue to GCash Checkout (${formatPHP(totalAmount)})`
                    : `Place Order (${formatPHP(totalAmount)})`}
              </button>
            </>
          )}

          {step === 'receipt' && (
            <>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[40px] whitespace-nowrap"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('orders');
                  onClose();
                }}
                className="rounded-lg bg-slate-900 dark:bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 min-h-[40px] whitespace-nowrap"
              >
                Track in Orders
              </button>
            </>
          )}
        </div>
      </div>

      <GCashCheckoutSheet
        open={gcashSheetOpen && displayOrder !== null}
        order={displayOrder}
        merchantName={
          state.merchants.find((m) => m.merchant_id === displayOrder?.merchant_id)?.shop_name ||
          merchant?.shop_name ||
          'Partner Pharmacy'
        }
        defaultPhone={recipientPhone || currentUser.phone_number}
        customerName={`${currentUser.first_name} ${currentUser.last_name}`}
        customerEmail={currentUser.email}
        onClose={() => setGcashSheetOpen(false)}
        onAuthorizeResult={(
          orderId,
          shouldSucceed,
          mobileUsed,
          serverGatewayReference,
          isLiveGateway,
          backendDbSynced
        ) => {
          const r = retryGcashPayment(
            orderId,
            shouldSucceed,
            mobileUsed,
            serverGatewayReference,
            isLiveGateway,
            backendDbSynced
          );
          if (!r.ok && r.error) {
            setError(r.error);
          }
          setGcashSheetOpen(false);
        }}
        onSwitchToCod={(orderId) => {
          switchPaymentToCod(orderId);
          setGcashSheetOpen(false);
        }}
      />

      <PoliciesModal
        open={policiesOpen}
        onClose={() => setPoliciesOpen(false)}
        onAcknowledge={() => setCheckoutPolicyAccepted(true)}
        acknowledgeLabel="I Acknowledge Order Policies"
        acceptedAt={currentUser.policy_accepted_at}
        acceptedVersion={currentUser.policy_version}
      />
    </div>
  );
};

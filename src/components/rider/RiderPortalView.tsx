import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  EyeOff,
  KeyRound,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import {
  computeRiderRatingStats,
  formatPHP,
  formatReviewerDisplayName,
  isCodAmountMismatch,
} from '../../utils/medexRules';
import { LeafletMap, type MapMarker } from '../common/LeafletMap';
import type { RiderSection } from '../layout/RoleDashboards';

interface RiderPortalViewProps {
  activeSection?: RiderSection;
  onChangeSection?: (section: RiderSection) => void;
}

export const RiderPortalView: React.FC<RiderPortalViewProps> = ({
  activeSection = 'dispatch',
  onChangeSection,
}) => {
  const {
    state,
    currentUser,
    toggleRiderOnline,
    respondToDeliveryRequest,
    confirmRiderPickup,
    recordCodCollection,
    submitDeliveryCode,
    markDeliveryNotHome,
    retryNotHomeDelivery,
    returnNotHomeOrderToPharmacy,
    completeRiderProfile,
  } = useMedEx();

  const [codInputs, setCodInputs] = useState<Record<number, string>>({});
  const [codeInputs, setCodeInputs] = useState<Record<number, string>>({});
  const [notHomeNote, setNotHomeNote] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [setupVehicleType, setSetupVehicleType] = useState('Motorcycle');
  const [setupPlateNumber, setSetupPlateNumber] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [verifyingDeliveryId, setVerifyingDeliveryId] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const riderProfile = useMemo(
    () => state.riderProfiles.find((r) => r.user_id === currentUser.user_id),
    [state.riderProfiles, currentUser.user_id]
  );

  const incomingRequests = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.delivery &&
          o.delivery.status === 'requested' &&
          !o.delivery.declined_by_rider_ids.includes(currentUser.user_id)
      ),
    [state.orders, currentUser.user_id]
  );

  const activeDeliveries = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.delivery &&
          o.delivery.rider_id === currentUser.user_id &&
          ['assigned', 'picked_up'].includes(o.delivery.status)
      ),
    [state.orders, currentUser.user_id]
  );

  const notHomeDeliveries = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.delivery &&
          o.delivery.rider_id === currentUser.user_id &&
          o.delivery.status === 'not_home' &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered'
      ),
    [state.orders, currentUser.user_id]
  );

  const myEarnings = useMemo(
    () => state.riderEarnings.filter((e) => e.rider_id === currentUser.user_id),
    [state.riderEarnings, currentUser.user_id]
  );

  const totalEarned = useMemo(
    () => myEarnings.reduce((sum, e) => sum + e.amount, 0),
    [myEarnings]
  );

  const riderRatingStats = useMemo(
    () => computeRiderRatingStats(state.riderRatings, currentUser.user_id),
    [state.riderRatings, currentUser.user_id]
  );

  const myRiderRatings = useMemo(
    () =>
      state.riderRatings
        .filter((r) => r.rider_id === currentUser.user_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.riderRatings, currentUser.user_id]
  );

  if (currentUser.status !== 'approved') {
    return (
      <div className="max-w-xl mx-auto medex-glass rounded-2xl border p-8 text-center space-y-3 mt-6">
        <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Rider Account {currentUser.status.toUpperCase()}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {currentUser.status === 'pending'
            ? "Your rider profile, Driver's License ID, and Vehicle Registration Document are awaiting Admin review and approval before you can go online or accept deliveries."
            : `Access restricted (${currentUser.status})${currentUser.status_reason ? `: ${currentUser.status_reason}` : '.'}`}
        </p>
        {riderProfile && (riderProfile.driver_license_name || riderProfile.vehicle_registration_name) && (
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            {riderProfile.driver_license_name && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300/60 dark:border-teal-700/60 bg-teal-50/70 dark:bg-teal-950/40 px-3 py-1 text-teal-800 dark:text-teal-200 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>License ID: {riderProfile.driver_license_name}</span>
              </span>
            )}
            {riderProfile.vehicle_registration_name && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300/60 dark:border-teal-700/60 bg-teal-50/70 dark:bg-teal-950/40 px-3 py-1 text-teal-800 dark:text-teal-200 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Vehicle Reg: {riderProfile.vehicle_registration_name}</span>
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!riderProfile) {
    const handleCompleteRiderSetup = async (e: React.FormEvent) => {
      e.preventDefault();
      if (setupSaving) return;
      setSetupError(null);
      setSetupSaving(true);
      try {
        const res = await completeRiderProfile({
          vehicle_type: setupVehicleType,
          plate_number: setupPlateNumber,
        });
        if (!res.ok) {
          setSetupError(res.error || 'Could not link rider vehicle profile.');
          return;
        }
        setFeedback({
          type: 'success',
          text: 'Courier vehicle profile linked. You can now go online for Olongapo dispatch.',
        });
      } finally {
        setSetupSaving(false);
      }
    };

    return (
      <div className="max-w-lg mx-auto medex-glass rounded-3xl border p-6 sm:p-8 space-y-5 mt-2">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-600/15 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              Account Approved · Courier Setup
            </p>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Complete Courier Vehicle Profile
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Enter your delivery vehicle type and plate number to activate dispatch requests.
            </p>
          </div>
        </div>

        {setupError && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-900 dark:text-red-200">
            {setupError}
          </div>
        )}

        <form onSubmit={handleCompleteRiderSetup} className="space-y-4">
          <div>
            <label
              htmlFor="rider-setup-vehicle"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Vehicle Type *
            </label>
            <select
              id="rider-setup-vehicle"
              value={setupVehicleType}
              onChange={(e) => setSetupVehicleType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="Motorcycle">Motorcycle</option>
              <option value="E-Bike / Scooter">E-Bike / Scooter</option>
              <option value="Car / Sedan">Car / Sedan</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="rider-setup-plate"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              LTO Plate Number *
            </label>
            <input
              id="rider-setup-plate"
              type="text"
              required
              value={setupPlateNumber}
              onChange={(e) => setSetupPlateNumber(e.target.value)}
              placeholder="e.g., AB-12345 or 342-OBX"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono uppercase"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Motorcycles: 2 letters + 5 digits (AB-12345) or transitional 6-char LTO (342-OBX, ABC-123). Cars: 3 letters + 4 digits (ZMB-4821).
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={setupSaving}
              className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {setupSaving ? 'Saving Vehicle...' : 'Link Vehicle & Enter Dispatch'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Courier Hero & Online Status Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="medex-glass rounded-3xl border bg-gradient-to-br from-sky-500/18 via-white/25 to-teal-500/16 dark:from-sky-500/20 dark:via-slate-900/45 dark:to-teal-500/16 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 w-56 h-56 rounded-full bg-sky-400/15 dark:bg-sky-400/15 blur-2xl"
        />
        <div className="relative flex items-start gap-3.5">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-600 to-teal-600 text-white items-center justify-center shadow-md shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-300">
              <span>WELCOME BACK, OLONGAPO COURIER</span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span className="uppercase">
                STATUS: {(riderProfile.operational_status || (riderProfile.is_online ? 'available' : 'inactive')).replace('_', ' ')}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
              {currentUser.first_name} {currentUser.last_name}
            </h1>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 tabular-nums">
              {riderProfile.vehicle_type} · Plate {riderProfile.plate_number} ·{' '}
              <Star className="w-3.5 h-3.5 inline text-amber-500 fill-amber-500" />{' '}
              {(riderRatingStats.count > 0 ? riderRatingStats.average : riderProfile.rating).toFixed(1)}{' '}
              ({riderRatingStats.count} rating{riderRatingStats.count === 1 ? '' : 's'}) ·{' '}
              {riderProfile.total_deliveries} deliveries
            </p>
          </div>
        </div>

        <motion.button
          type="button"
          whileHover={{ y: riderProfile.operational_status === 'suspended' ? 0 : -1 }}
          whileTap={{ scale: riderProfile.operational_status === 'suspended' ? 1 : 0.97 }}
          disabled={riderProfile.operational_status === 'suspended'}
          onClick={() => toggleRiderOnline(!riderProfile.is_online)}
          className={`relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors min-h-[42px] whitespace-nowrap shrink-0 disabled:opacity-55 disabled:cursor-not-allowed ${
            riderProfile.operational_status === 'suspended'
              ? 'border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
              : riderProfile.is_online
                ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-md shadow-teal-600/20'
                : 'medex-glass-subtle border text-slate-800 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800'
          }`}
        >
          {riderProfile.is_online && riderProfile.operational_status !== 'suspended' && (
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" aria-hidden="true" />
          )}
          <span>
            {riderProfile.operational_status === 'suspended'
              ? 'Dispatch Suspended'
              : riderProfile.is_online
                ? 'Online · Accepting Requests'
                : 'Offline · Go Online'}
          </span>
        </motion.button>
      </motion.div>

      {riderProfile.operational_status === 'suspended' && (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 dark:border-red-800/80 bg-red-50/90 dark:bg-red-950/45 px-5 py-4 flex items-start gap-3 text-sm text-red-900 dark:text-red-200"
        >
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Dispatch Privileges Temporarily Suspended by Delivery Management</p>
            <p className="text-xs mt-0.5 text-red-800 dark:text-red-300">
              {currentUser.status_reason
                ? `Reason: ${currentUser.status_reason}`
                : 'Contact Delivery Management or Global Admin to reactivate your rider dispatch eligibility.'}
            </p>
          </div>
        </div>
      )}

      {/* Rider Quick KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onChangeSection?.('dispatch')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Incoming Requests</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {riderProfile.is_online ? incomingRequests.length : 0}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onChangeSection?.('dispatch')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Active Route</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {activeDeliveries.length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onChangeSection?.('earnings')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Total Earned</p>
          <p className="font-display text-2xl font-bold text-teal-700 dark:text-teal-400 mt-1 tabular-nums">
            {formatPHP(totalEarned)}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onChangeSection?.('ratings')}
          className="medex-card-hover medex-glass rounded-2xl border p-4 text-left hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
        >
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">My Star Rating</p>
          <p className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums inline-flex items-center gap-1.5">
            <span>
              {(riderRatingStats.count > 0 ? riderRatingStats.average : riderProfile.rating).toFixed(1)}
            </span>
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {riderRatingStats.count} customer rating{riderRatingStats.count === 1 ? '' : 's'}
          </p>
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200'
              : 'border-teal-200 dark:border-teal-800/70 bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeSection === 'dispatch' && (
        <>
          {/* Incoming Requests */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Incoming Delivery Requests ({riderProfile.is_online ? incomingRequests.length : 0})
            </h2>

        {!riderProfile.is_online ? (
          <div className="medex-glass rounded-xl border p-5 text-sm text-slate-700 dark:text-slate-300">
            You are currently offline. Toggle "Go Online" above to receive pharmacy pickup requests.
          </div>
        ) : incomingRequests.length === 0 ? (
          <div className="medex-glass rounded-xl border p-5 text-sm text-slate-700 dark:text-slate-300">
            No pending delivery requests right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomingRequests.map((order) => {
              const del = order.delivery!;
              const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
              const elapsedSec = Math.floor(
                (nowMs - new Date(del.requested_at).getTime()) / 1000
              );
              const remainingSec = Math.max(0, 60 - (elapsedSec % 60));

              return (
                <div
                  key={del.delivery_id}
                  className="medex-glass rounded-2xl border border-teal-300/80 dark:border-teal-700/70 p-5 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {order.order_code}
                    </span>
                    <span className="font-mono font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                      Accept window: {remainingSec}s
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Pickup: {merchant?.shop_name}
                    </p>
                    <p>Drop-off: {order.delivery_address_snapshot}</p>
                    <p className="tabular-nums">
                      Fee Earned:{' '}
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        {formatPHP(order.delivery_fee)}
                      </span>{' '}
                      · Payment: {order.payment.method} ({formatPHP(order.total_amount)})
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const res = respondToDeliveryRequest(del.delivery_id, true);
                        if (res.ok) {
                          setFeedback({
                            type: 'success',
                            text: `Accepted delivery for ${order.order_code}.`,
                          });
                        }
                      }}
                      className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px]"
                    >
                      Accept Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => respondToDeliveryRequest(del.delivery_id, false)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[38px]"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Deliveries */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Active Deliveries ({activeDeliveries.length})
        </h2>

        {activeDeliveries.length === 0 ? (
          <div className="medex-glass rounded-xl border p-5 text-sm text-slate-700 dark:text-slate-300">
            No active delivery in progress.
          </div>
        ) : (
          activeDeliveries.map((order) => {
            const del = order.delivery!;
            const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
            const shopAddr = state.addresses.find((a) => a.address_id === merchant?.shop_address_id);
            const destAddr = state.addresses.find((a) => a.address_id === order.address_id);

            const markers: MapMarker[] = [];
            const route: Array<[number, number]> = [];
            if (shopAddr) {
              markers.push({
                id: 'shop',
                lat: shopAddr.latitude,
                lng: shopAddr.longitude,
                title: merchant?.shop_name || 'Pickup Pharmacy',
                variant: 'pharmacy_open',
              });
              route.push([shopAddr.latitude, shopAddr.longitude]);
            }
            if (del.rider_lat && del.rider_lng) {
              markers.push({
                id: 'rider',
                lat: del.rider_lat,
                lng: del.rider_lng,
                title: 'Your Location',
                variant: 'rider',
              });
              route.push([del.rider_lat, del.rider_lng]);
            }
            if (destAddr) {
              markers.push({
                id: 'dest',
                lat: destAddr.latitude,
                lng: destAddr.longitude,
                title: order.recipient_name,
                subtitle: order.delivery_address_snapshot,
                variant: 'resident',
              });
              route.push([destAddr.latitude, destAddr.longitude]);
            }

            const codVal = codInputs[del.delivery_id] ?? String(order.total_amount);
            const parsedCod = Number(codVal);
            const willMismatch =
              !Number.isNaN(parsedCod) && isCodAmountMismatch(order.total_amount, parsedCod);
            const needsCodBeforeCode =
              order.payment.method === 'COD' && order.payment.status !== 'collected';

            return (
              <div
                key={del.delivery_id}
                className="medex-glass rounded-2xl border p-5 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {order.order_code}
                    </p>
                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                      {merchant?.shop_name} → {order.recipient_name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 tabular-nums">
                      <MapPin className="w-3.5 h-3.5 inline mr-1" />
                      {order.delivery_address_snapshot} · {order.recipient_phone}
                    </p>
                    {order.rider_note && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                        Note: {order.rider_note}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold uppercase text-teal-700 dark:text-teal-400">
                    {del.status.replace('_', ' ')}
                  </span>
                </div>

                {markers.length > 0 && (
                  <LeafletMap
                    markers={markers}
                    routePoints={route.length >= 2 ? route : undefined}
                    heightClass="h-52"
                    ariaLabel={`Rider route map for ${order.order_code}`}
                  />
                )}

                {del.status === 'assigned' && (
                  <button
                    type="button"
                    onClick={() => {
                      confirmRiderPickup(del.delivery_id);
                      setFeedback({
                        type: 'success',
                        text: `Order ${order.order_code} picked up and marked Out for Delivery.`,
                      });
                    }}
                    className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 min-h-[42px]"
                  >
                    Confirm Pharmacy Pickup
                  </button>
                )}

                {del.status === 'picked_up' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Mandatory COD Cash Collection */}
                    {order.payment.method === 'COD' && (
                      <div className="medex-glass-subtle rounded-xl border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Banknote className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                            COD Cash Collection
                          </span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                            Due: {formatPHP(order.total_amount)}
                          </span>
                        </div>

                        {order.payment.status === 'collected' ? (
                          <div className="text-xs text-teal-800 dark:text-teal-300 flex items-center gap-1.5 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              Recorded collected cash: {formatPHP(order.payment.amount_collected || 0)}
                              {order.payment.is_flagged ? ' (Mismatch flagged for Admin)' : ''}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label
                                htmlFor={`cod-${del.delivery_id}`}
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                              >
                                Exact Amount Collected (₱) *
                              </label>
                              <input
                                id={`cod-${del.delivery_id}`}
                                type="number"
                                step="0.01"
                                value={codVal}
                                onChange={(e) =>
                                  setCodInputs((prev) => ({
                                    ...prev,
                                    [del.delivery_id]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                              />
                            </div>
                            {willMismatch && (
                              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Amount differs from {formatPHP(order.total_amount)} — will flag Admin.
                                </span>
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const res = recordCodCollection(del.delivery_id, Number(codVal));
                                if (!res.ok) {
                                  setFeedback({ type: 'error', text: res.error || 'Failed.' });
                                } else {
                                  setFeedback({
                                    type: 'success',
                                    text: 'COD cash collection recorded. Ask resident for the 4-digit PIN.',
                                  });
                                }
                              }}
                              className="w-full rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-700"
                            >
                              Record Collected Cash
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* 4-Digit Confirmation Code Entry (PIN hidden from Rider) */}
                    <div className="medex-glass-subtle rounded-xl border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <KeyRound className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                          4-Digit Resident Confirmation PIN
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          Attempts: {del.code_attempts} / 3
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Ask the resident for their 4-digit handoff PIN shown in their Orders tab.
                      </p>

                      {del.is_flagged_for_admin && (
                        <div className="rounded-lg border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-800 dark:text-red-300">
                          Flagged for Admin Review after 3 incorrect attempts.
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="0000"
                          aria-label="4-digit resident confirmation PIN"
                          disabled={needsCodBeforeCode}
                          value={codeInputs[del.delivery_id] || ''}
                          onChange={(e) =>
                            setCodeInputs((prev) => ({
                              ...prev,
                              [del.delivery_id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                            }))
                          }
                          className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-center font-mono text-base font-bold tracking-[0.2em] disabled:opacity-40"
                        />
                        <button
                          type="button"
                          disabled={needsCodBeforeCode || verifyingDeliveryId === del.delivery_id}
                          onClick={async () => {
                            if (verifyingDeliveryId === del.delivery_id) return;
                            setVerifyingDeliveryId(del.delivery_id);
                            try {
                              const res = await submitDeliveryCode(
                                del.delivery_id,
                                codeInputs[del.delivery_id] || ''
                              );
                              if (!res.ok) {
                                setFeedback({ type: 'error', text: res.error || 'Invalid PIN.' });
                              } else {
                                setFeedback({
                                  type: 'success',
                                  text: `Delivery confirmed! ${formatPHP(order.delivery_fee)} added to earnings.`,
                                });
                              }
                            } finally {
                              setVerifyingDeliveryId(null);
                            }
                          }}
                          className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
                        >
                          {verifyingDeliveryId === del.delivery_id
                            ? 'Verifying PIN...'
                            : 'Complete Delivery'}
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Note if resident not home (e.g., No answer at gate)..."
                            value={notHomeNote[del.delivery_id] || ''}
                            onChange={(e) =>
                              setNotHomeNote((prev) => ({
                                ...prev,
                                [del.delivery_id]: e.target.value,
                              }))
                            }
                            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const res = markDeliveryNotHome(
                                del.delivery_id,
                                notHomeNote[del.delivery_id] || 'Resident not home upon arrival'
                              );
                              if (!res.ok) {
                                setFeedback({
                                  type: 'error',
                                  text: res.error || 'Could not update delivery status.',
                                });
                              } else {
                                setFeedback({
                                  type: 'error',
                                  text: `Order ${order.order_code} marked Customer Not Home. Customer & pharmacy have been notified — retry drop-off or return medicines below.`,
                                });
                              }
                            }}
                            className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 whitespace-nowrap"
                          >
                            Mark Not Home
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Alerts both the customer and pharmacy. You can then retry delivery if the customer responds, or return the medicines to the pharmacy to auto-restock inventory.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Customer Not Home — Action Needed (Retry or Return to Pharmacy) */}
      {notHomeDeliveries.length > 0 && (
        <section className="rounded-2xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/75 dark:bg-amber-950/35 backdrop-blur-md p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h2 className="font-display text-base font-bold text-amber-950 dark:text-amber-100">
                  Unsuccessful Deliveries · Customer Not Home ({notHomeDeliveries.length})
                </h2>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Retry drop-off if the resident becomes available, or return the medicines to the pharmacy so inventory is safely restored.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {notHomeDeliveries.map((order) => {
              const del = order.delivery!;
              const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
              return (
                <div
                  key={order.order_id}
                  className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-white/90 dark:bg-slate-900/85 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {order.order_code}
                      </span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900 dark:text-amber-200">
                        Customer Not Home
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {order.recipient_name} · {order.delivery_address_snapshot}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Pharmacy: <strong className="text-slate-900 dark:text-white">{merchant?.shop_name || 'Partner Pharmacy'}</strong> ·{' '}
                      {order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
                    </p>
                    <p className="text-amber-800 dark:text-amber-300 font-medium">
                      Rider Note: {del.failure_reason || 'Resident not home upon arrival'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const res = retryNotHomeDelivery(del.delivery_id);
                        if (!res.ok) {
                          setFeedback({ type: 'error', text: res.error || 'Could not retry.' });
                        } else {
                          setFeedback({
                            type: 'success',
                            text: `Resumed delivery for ${order.order_code}. Ask the resident for their 4-digit PIN upon arrival.`,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Delivery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const res = returnNotHomeOrderToPharmacy(
                          order.order_id,
                          del.failure_reason || 'Customer not home — returned to pharmacy'
                        );
                        if (!res.ok) {
                          setFeedback({ type: 'error', text: res.error || 'Could not return order.' });
                        } else {
                          setFeedback({
                            type: 'success',
                            text: `Order ${order.order_code} returned to ${merchant?.shop_name || 'pharmacy'} and medicine stock automatically restored.`,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 whitespace-nowrap"
                    >
                      <span>Return to Pharmacy (Restock)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
        </>
      )}

      {/* Earnings & Payouts */}
      {activeSection === 'earnings' && (
      <section className="medex-glass rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Earnings & Payout Ledger
            </h2>
          </div>
          <span className="font-display text-lg font-bold text-teal-700 dark:text-teal-400 tabular-nums">
            Total: {formatPHP(totalEarned)}
          </span>
        </div>

        {myEarnings.length === 0 ? (
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Complete deliveries to record earnings.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {myEarnings.map((earn) => (
              <div key={earn.earning_id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {earn.order_code}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                    {' '}
                    · {new Date(earn.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="uppercase font-semibold text-slate-600 dark:text-slate-300">
                    {earn.payout_status}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {formatPHP(earn.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* My Ratings & Anonymous Resident Feedback */}
      {activeSection === 'ratings' && (
        <section className="space-y-5">
          <div className="medex-glass rounded-2xl border p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-4 text-center md:text-left space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Courier Satisfaction
              </p>
              <div className="flex items-baseline justify-center md:justify-start gap-2">
                <span className="font-display text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {(riderRatingStats.count > 0
                    ? riderRatingStats.average
                    : riderProfile.rating
                  ).toFixed(1)}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">/ 5.0</span>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= Math.round(riderRatingStats.count > 0 ? riderRatingStats.average : riderProfile.rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300 dark:text-slate-700'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                Based on {riderRatingStats.count} verified delivery rating{riderRatingStats.count === 1 ? '' : 's'}
              </p>
            </div>

            <div className="md:col-span-8 space-y-2">
              {([5, 4, 3, 2, 1] as const).map((starLevel) => {
                const count = riderRatingStats.breakdown[starLevel];
                const pct =
                  riderRatingStats.count > 0
                    ? Math.round((count / riderRatingStats.count) * 100)
                    : 0;
                return (
                  <div key={starLevel} className="flex items-center gap-3 text-xs">
                    <span className="w-10 font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {starLevel} ★
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Customer Delivery Feedback ({myRiderRatings.length})
            </h2>
            {myRiderRatings.length === 0 ? (
              <div className="medex-glass rounded-2xl border p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                No delivery ratings yet. Complete deliveries so Olongapo customers can rate your service.
              </div>
            ) : (
              myRiderRatings.map((rating) => {
                const customer = state.users.find((u) => u.user_id === rating.resident_id);
                const order = state.orders.find((o) => o.order_id === rating.order_id);
                return (
                  <div
                    key={rating.rating_id}
                    className="medex-glass rounded-2xl border p-5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                          {rating.is_anonymous && (
                            <EyeOff className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                          )}
                          {formatReviewerDisplayName(customer, rating.is_anonymous)}
                        </span>
                        {order && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              {order.order_code}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= rating.stars
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {rating.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rating.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {rating.comment && (
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        &ldquo;{rating.comment}&rdquo;
                      </p>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Rated {new Date(rating.created_at).toLocaleString()} · Resident contact details stay private
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Search,
  ShieldAlert,
  Star,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { RiderOperationalStatus } from '../../types/medex';
import { formatPHP } from '../../utils/medexRules';
import type { DeliveryManagementSection } from '../layout/RoleDashboards';

interface DeliveryManagementPortalViewProps {
  section: DeliveryManagementSection;
}

type DeliveryFilter = 'all' | 'pending' | 'active' | 'delivered' | 'not_home' | 'failed' | 'delayed';

const RIDER_STATUS_LABELS: Record<RiderOperationalStatus, string> = {
  active: 'Active',
  available: 'Available',
  assigned: 'Assigned',
  on_delivery: 'On Delivery',
  suspended: 'Suspended',
  inactive: 'Inactive',
};

const RIDER_STATUS_BADGE: Record<RiderOperationalStatus, string> = {
  active: 'bg-teal-500/15 text-teal-800 dark:text-teal-200 border-teal-500/35',
  available: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/35',
  assigned: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/35',
  on_delivery: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 border-indigo-500/35',
  suspended: 'bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/35',
  inactive: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/35',
};

export const DeliveryManagementPortalView: React.FC<DeliveryManagementPortalViewProps> = ({
  section,
}) => {
  const {
    state,
    hasCurrentPermission,
    assignRiderToDelivery,
    updateRiderOperationalStatus,
  } = useMedEx();

  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRiderByOrder, setSelectedRiderByOrder] = useState<Record<number, number>>({});
  const [riderSearch, setRiderSearch] = useState('');
  const [suspendReasonByRider, setSuspendReasonByRider] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const canAssignRider = hasCurrentPermission('deliveries:assign_rider');
  const canManageRiders = hasCurrentPermission('riders:manage_operational_status');
  const canSuspendRiders = hasCurrentPermission('riders:suspend_scoped');

  const nowMs = Date.now();
  const isOrderDelayed = (createdAt: string, status: string) => {
    if (status === 'delivered' || status === 'cancelled') return false;
    const ageMin = (nowMs - new Date(createdAt).getTime()) / 60000;
    return ageMin > 45;
  };

  const riders = useMemo(
    () =>
      state.users
        .filter((u) => u.role === 'rider')
        .map((u) => {
          const profile = state.riderProfiles.find((r) => r.user_id === u.user_id);
          const ratings = state.riderRatings.filter((rt) => rt.rider_id === u.user_id);
          const avgRating =
            ratings.length > 0
              ? ratings.reduce((s, rt) => s + rt.stars, 0) / ratings.length
              : 0;
          const activeOrderCount = state.orders.filter(
            (o) =>
              o.delivery?.rider_id === u.user_id &&
              o.status !== 'delivered' &&
              o.status !== 'cancelled'
          ).length;
          const completedCount = state.orders.filter(
            (o) => o.delivery?.rider_id === u.user_id && o.status === 'delivered'
          ).length;

          const effectiveOpStatus: RiderOperationalStatus =
            u.status === 'suspended'
              ? 'suspended'
              : profile?.operational_status ||
                (activeOrderCount > 0
                  ? 'on_delivery'
                  : profile?.is_online
                    ? 'available'
                    : 'inactive');

          return {
            user: u,
            profile,
            avgRating,
            ratingCount: ratings.length,
            activeOrderCount,
            completedCount,
            effectiveOpStatus,
          };
        }),
    [state.users, state.riderProfiles, state.riderRatings, state.orders]
  );

  const assignableRiders = useMemo(
    () =>
      riders.filter(
        (r) =>
          r.user.status === 'approved' &&
          r.effectiveOpStatus !== 'suspended' &&
          r.effectiveOpStatus !== 'inactive'
      ),
    [riders]
  );

  const stats = useMemo(() => {
    const pendingAssign = state.orders.filter(
      (o) =>
        (o.status === 'ready_for_pickup' || o.status === 'preparing') &&
        !o.delivery?.rider_id
    ).length;
    const activeTransit = state.orders.filter(
      (o) =>
        o.status === 'out_for_delivery' ||
        o.delivery?.status === 'assigned' ||
        o.delivery?.status === 'picked_up'
    ).length;
    const delivered = state.orders.filter((o) => o.status === 'delivered').length;
    const failedOrNotHome = state.orders.filter(
      (o) =>
        o.delivery?.status === 'not_home' ||
        o.delivery?.status === 'failed' ||
        o.delivery?.is_flagged_for_admin
    ).length;
    const availableFleet = assignableRiders.length;
    return { pendingAssign, activeTransit, delivered, failedOrNotHome, availableFleet };
  }, [state.orders, assignableRiders.length]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...state.orders]
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())
      .filter((order) => {
        if (deliveryFilter === 'pending') {
          if (order.status === 'delivered' || order.status === 'cancelled') return false;
          if (order.delivery?.rider_id && order.delivery.status !== 'requested') return false;
        } else if (deliveryFilter === 'active') {
          if (
            order.status !== 'out_for_delivery' &&
            order.delivery?.status !== 'assigned' &&
            order.delivery?.status !== 'picked_up'
          ) {
            return false;
          }
        } else if (deliveryFilter === 'delivered') {
          if (order.status !== 'delivered') return false;
        } else if (deliveryFilter === 'not_home') {
          if (order.delivery?.status !== 'not_home') return false;
        } else if (deliveryFilter === 'failed') {
          if (
            order.delivery?.status !== 'failed' &&
            !order.delivery?.is_flagged_for_admin &&
            order.status !== 'cancelled'
          ) {
            return false;
          }
        } else if (deliveryFilter === 'delayed') {
          if (!isOrderDelayed(order.placed_at, order.status)) return false;
        }

        if (!q) return true;
        const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
        const resident = state.users.find((u) => u.user_id === order.resident_id);
        const rider = state.users.find((u) => u.user_id === order.delivery?.rider_id);
        return (
          order.order_code.toLowerCase().includes(q) ||
          (merchant?.shop_name || '').toLowerCase().includes(q) ||
          `${resident?.first_name || ''} ${resident?.last_name || ''}`.toLowerCase().includes(q) ||
          `${rider?.first_name || ''} ${rider?.last_name || ''}`.toLowerCase().includes(q) ||
          order.delivery_address_snapshot.toLowerCase().includes(q) ||
          order.items.some((it) => it.product_name.toLowerCase().includes(q))
        );
      });
  }, [state.orders, state.merchants, state.users, deliveryFilter, searchQuery]);

  const filteredRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter(
      (r) =>
        `${r.user.first_name} ${r.user.last_name}`.toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q) ||
        (r.profile?.plate_number || '').toLowerCase().includes(q)
    );
  }, [riders, riderSearch]);

  const analyticsByBarangay = useMemo(() => {
    const map = new Map<string, { total: number; delivered: number; failed: number }>();
    for (const o of state.orders) {
      const addr = state.addresses.find((a) => a.address_id === o.address_id);
      const brgy =
        state.barangays.find((b) => b.barangay_id === addr?.barangay_id)?.name || 'Olongapo';
      const entry = map.get(brgy) || { total: 0, delivered: 0, failed: 0 };
      entry.total += 1;
      if (o.status === 'delivered') entry.delivered += 1;
      if (
        o.status === 'cancelled' ||
        o.delivery?.status === 'failed' ||
        o.delivery?.status === 'not_home'
      ) {
        entry.failed += 1;
      }
      map.set(brgy, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [state.orders, state.addresses, state.barangays]);

  const handleAssignRider = async (orderId: number) => {
    const chosenRiderId =
      selectedRiderByOrder[orderId] ||
      assignableRiders[0]?.user.user_id ||
      0;
    if (!chosenRiderId) {
      setFeedback({ ok: false, text: 'No eligible active/available rider selected.' });
      return;
    }
    setBusyId(`assign-${orderId}`);
    setFeedback(null);
    const res = await assignRiderToDelivery(orderId, chosenRiderId);
    setBusyId(null);
    setFeedback(
      res.ok
        ? { ok: true, text: 'Rider assigned and dispatch queue updated.' }
        : { ok: false, text: res.error || 'Could not assign rider.' }
    );
  };

  const handleChangeRiderStatus = async (
    riderId: number,
    nextStatus: RiderOperationalStatus
  ) => {
    setBusyId(`rider-${riderId}`);
    setFeedback(null);
    const reason = suspendReasonByRider[riderId]?.trim();
    const res = await updateRiderOperationalStatus(riderId, nextStatus, reason || undefined);
    setBusyId(null);
    setFeedback(
      res.ok
        ? { ok: true, text: `Rider operational status updated to ${RIDER_STATUS_LABELS[nextStatus]}.` }
        : { ok: false, text: res.error || 'Could not update rider status.' }
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Unassigned Queue
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {stats.pendingAssign}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            In Transit
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums">
            {stats.activeTransit}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Delivered
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {stats.delivered}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Not Home / Flagged
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums">
            {stats.failedOrNotHome}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4 col-span-2 lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Eligible Riders
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {stats.availableFleet}
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

      {section === 'deliveries' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Active &amp; Shipped Deliveries
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Inspect shipped medicine items, track transit status, and assign or reassign riders.
              </p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Order code, item, store, rider..."
                className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'All Deliveries'],
                ['pending', 'Pending Assignment'],
                ['active', 'Out for Delivery'],
                ['delivered', 'Completed'],
                ['not_home', 'Not Home'],
                ['failed', 'Failed / Returned'],
                ['delayed', 'Delayed (>45m)'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDeliveryFilter(key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  deliveryFilter === key
                    ? 'bg-teal-600 text-white border-teal-500 shadow-xs'
                    : 'medex-glass-subtle text-slate-700 dark:text-slate-200 hover:brightness-105'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              No deliveries match the selected status or search filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const merchant = state.merchants.find((m) => m.merchant_id === order.merchant_id);
                const resident = state.users.find((u) => u.user_id === order.resident_id);
                const currentRider = state.users.find((u) => u.user_id === order.delivery?.rider_id);
                const delayed = isOrderDelayed(order.placed_at, order.status);
                const selectedRider =
                  selectedRiderByOrder[order.order_id] ??
                  order.delivery?.rider_id ??
                  assignableRiders[0]?.user.user_id ??
                  0;

                return (
                  <article
                    key={order.order_id}
                    className="medex-glass rounded-2xl border p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                            {order.order_code}
                          </span>
                          <span className="rounded-md bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:text-teal-200 uppercase">
                            {order.status.replace(/_/g, ' ')}
                          </span>
                          {order.delivery && (
                            <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:text-sky-200 uppercase">
                              Dispatch: {order.delivery.status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {delayed && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                              <Clock className="w-3 h-3" />
                              Delayed
                            </span>
                          )}
                          {order.delivery?.is_flagged_for_admin && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[11px] font-semibold text-red-900 dark:text-red-200">
                              <ShieldAlert className="w-3 h-3" />
                              Flagged PIN/Attempt
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300">
                          Store: <strong>{merchant?.shop_name || 'Pharmacy'}</strong> · Customer:{' '}
                          <strong>
                            {resident ? `${resident.first_name} ${resident.last_name}` : 'Resident'}
                          </strong>
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>{order.delivery_address_snapshot}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-display text-base font-bold text-slate-900 dark:text-white tabular-nums">
                          {formatPHP(order.total_amount)}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 uppercase">
                          {order.payment.method} · {order.payment.status}
                        </p>
                      </div>
                    </div>

                    {/* Shipped Items */}
                    <div className="rounded-xl medex-glass-subtle border p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Shipped Items ({order.items.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {order.items.map((it) => (
                          <span
                            key={it.order_item_id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/75 dark:bg-slate-900/60 border border-white/60 dark:border-white/10 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100"
                          >
                            <Package className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            <span>{it.product_name}</span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              ×{it.quantity}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Rider Assignment Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="text-xs text-slate-700 dark:text-slate-300">
                        Assigned Rider:{' '}
                        {currentRider ? (
                          <strong className="text-teal-800 dark:text-teal-300">
                            {currentRider.first_name} {currentRider.last_name} ({currentRider.phone_number})
                          </strong>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300 font-semibold">
                            Unassigned
                          </span>
                        )}
                      </div>

                      {order.status !== 'delivered' &&
                        order.status !== 'cancelled' &&
                        canAssignRider && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Select rider for ${order.order_code}`}
                              value={selectedRider}
                              onChange={(e) =>
                                setSelectedRiderByOrder((prev) => ({
                                  ...prev,
                                  [order.order_id]: Number(e.target.value),
                                }))
                              }
                              className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            >
                              {assignableRiders.length === 0 ? (
                                <option value={0}>No eligible riders online</option>
                              ) : (
                                assignableRiders.map((r) => (
                                  <option key={r.user.user_id} value={r.user.user_id}>
                                    {r.user.first_name} {r.user.last_name} ({RIDER_STATUS_LABELS[r.effectiveOpStatus]})
                                  </option>
                                ))
                              )}
                            </select>
                            <button
                              type="button"
                              disabled={busyId === `assign-${order.order_id}` || assignableRiders.length === 0}
                              onClick={() => void handleAssignRider(order.order_id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{currentRider ? 'Reassign Rider' : 'Assign Rider'}</span>
                            </button>
                          </div>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === 'riders' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Rider Fleet &amp; Operational Status
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Manage courier operational states (Active, Available, Assigned, On Delivery, Suspended, Inactive).
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={riderSearch}
                onChange={(e) => setRiderSearch(e.target.value)}
                placeholder="Search rider or plate..."
                className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRiders.map((r) => (
              <article
                key={r.user.user_id}
                className="medex-glass rounded-2xl border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {r.user.first_name} {r.user.last_name}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {r.user.email} · {r.user.phone_number}
                    </p>
                    <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                      {r.profile?.vehicle_type || 'Motorcycle'} · Plate:{' '}
                      {r.profile?.plate_number || 'Pending'}
                    </p>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${RIDER_STATUS_BADGE[r.effectiveOpStatus]}`}
                  >
                    {RIDER_STATUS_LABELS[r.effectiveOpStatus]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center rounded-xl medex-glass-subtle border p-2.5 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Active</p>
                    <p className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {r.activeOrderCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Completed</p>
                    <p className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {r.completedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Rating</p>
                    <p className="font-bold tabular-nums text-amber-700 dark:text-amber-300 inline-flex items-center justify-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {r.ratingCount > 0 ? r.avgRating.toFixed(1) : 'N/A'}
                    </p>
                  </div>
                </div>

                {r.user.status === 'pending' ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                    Pending initial Admin legal document verification before dispatch activation.
                  </p>
                ) : (
                  (canManageRiders || canSuspendRiders) && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Operational status for ${r.user.first_name}`}
                          value={r.effectiveOpStatus}
                          disabled={busyId === `rider-${r.user.user_id}`}
                          onChange={(e) =>
                            void handleChangeRiderStatus(
                              r.user.user_id,
                              e.target.value as RiderOperationalStatus
                            )
                          }
                          className="flex-1 rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                        >
                          {(['active', 'available', 'assigned', 'on_delivery', 'inactive', 'suspended'] as const).map(
                            (st) => (
                              <option
                                key={st}
                                value={st}
                                disabled={st === 'suspended' && !canSuspendRiders}
                              >
                                {RIDER_STATUS_LABELS[st]}
                              </option>
                            )
                          )}
                        </select>
                        {canSuspendRiders && r.effectiveOpStatus !== 'suspended' ? (
                          <button
                            type="button"
                            disabled={busyId === `rider-${r.user.user_id}`}
                            onClick={() => void handleChangeRiderStatus(r.user.user_id, 'suspended')}
                            className="rounded-xl bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                          >
                            Suspend
                          </button>
                        ) : (
                          canSuspendRiders && (
                            <button
                              type="button"
                              disabled={busyId === `rider-${r.user.user_id}`}
                              onClick={() => void handleChangeRiderStatus(r.user.user_id, 'available')}
                              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                            >
                              Reactivate
                            </button>
                          )
                        )}
                      </div>
                      <input
                        type="text"
                        value={suspendReasonByRider[r.user.user_id] || ''}
                        onChange={(e) =>
                          setSuspendReasonByRider((prev) => ({
                            ...prev,
                            [r.user.user_id]: e.target.value,
                          }))
                        }
                        placeholder="Optional status / suspension note..."
                        className="w-full rounded-xl border border-white/60 dark:border-white/15 bg-white/60 dark:bg-slate-950/35 px-3 py-1.5 text-[11px] text-slate-900 dark:text-white"
                      />
                    </div>
                  )
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {section === 'analytics' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Delivery Performance &amp; Barangay Breakdown
              </h1>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl medex-glass-subtle border p-4">
                <p className="text-xs text-slate-600 dark:text-slate-300">Completion Rate</p>
                <p className="font-display text-2xl font-bold text-teal-700 dark:text-teal-300 tabular-nums mt-1">
                  {state.orders.length > 0
                    ? `${Math.round((stats.delivered / state.orders.length) * 100)}%`
                    : '0%'}
                </p>
              </div>
              <div className="rounded-xl medex-glass-subtle border p-4">
                <p className="text-xs text-slate-600 dark:text-slate-300">Failed / Not-Home Rate</p>
                <p className="font-display text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums mt-1">
                  {state.orders.length > 0
                    ? `${Math.round((stats.failedOrNotHome / state.orders.length) * 100)}%`
                    : '0%'}
                </p>
              </div>
              <div className="rounded-xl medex-glass-subtle border p-4">
                <p className="text-xs text-slate-600 dark:text-slate-300">Active Approved Fleet</p>
                <p className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                  {riders.filter((r) => r.user.status === 'approved').length} Riders
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Deliveries by Olongapo Barangay
              </h2>
              {analyticsByBarangay.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No delivery orders recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {analyticsByBarangay.map(([brgy, row]) => {
                    const pct = row.total > 0 ? Math.round((row.delivered / row.total) * 100) : 0;
                    return (
                      <div key={brgy} className="rounded-xl medex-glass-subtle border p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            Brgy. {brgy}
                          </span>
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {row.delivered}/{row.total} delivered ({pct}%) · {row.failed} flagged/failed
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
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

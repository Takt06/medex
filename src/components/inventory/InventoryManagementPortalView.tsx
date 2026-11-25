import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  MapPin,
  PackageCheck,
  Search,
  Store,
  TrendingUp,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import { formatPHP, getAvailabilityStatus } from '../../utils/medexRules';
import type { InventoryManagementSection } from '../layout/RoleDashboards';

interface InventoryManagementPortalViewProps {
  section: InventoryManagementSection;
}

export const InventoryManagementPortalView: React.FC<InventoryManagementPortalViewProps> = ({
  section,
}) => {
  const { state } = useMedEx();

  const [selectedMerchantId, setSelectedMerchantId] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low_or_out' | 'out' | 'available'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [movementSearch, setMovementSearch] = useState('');

  const activeProducts = useMemo(
    () => state.products.filter((p) => !p.is_archived),
    [state.products]
  );

  const summary = useMemo(() => {
    const lowStock = activeProducts.filter(
      (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
    ).length;
    const outOfStock = activeProducts.filter((p) => p.stock_quantity <= 0).length;
    const totalUnits = activeProducts.reduce((s, p) => s + p.stock_quantity, 0);
    return {
      storesCount: state.merchants.length,
      skuCount: activeProducts.length,
      lowStock,
      outOfStock,
      totalUnits,
    };
  }, [activeProducts, state.merchants.length]);

  const merchantRows = useMemo(
    () =>
      state.merchants.map((m) => {
        const prods = activeProducts.filter((p) => p.merchant_id === m.merchant_id);
        const low = prods.filter(
          (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
        ).length;
        const out = prods.filter((p) => p.stock_quantity <= 0).length;
        const totalUnits = prods.reduce((s, p) => s + p.stock_quantity, 0);
        const owner = state.users.find((u) => u.user_id === m.user_id);
        const addr = state.addresses.find((a) => a.address_id === m.shop_address_id);
        const brgy = state.barangays.find((b) => b.barangay_id === addr?.barangay_id);
        return { merchant: m, owner, brgy, prods, low, out, totalUnits };
      }),
    [state.merchants, activeProducts, state.users, state.addresses, state.barangays]
  );

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (selectedMerchantId !== 'all' && p.merchant_id !== selectedMerchantId) return false;
      if (stockFilter === 'low_or_out' && p.stock_quantity > p.low_stock_threshold) return false;
      if (stockFilter === 'out' && p.stock_quantity > 0) return false;
      if (stockFilter === 'available' && p.stock_quantity <= p.low_stock_threshold) return false;
      if (!q) return true;
      const merchant = state.merchants.find((m) => m.merchant_id === p.merchant_id);
      return (
        p.name.toLowerCase().includes(q) ||
        (p.dosage_strength || '').toLowerCase().includes(q) ||
        (merchant?.shop_name || '').toLowerCase().includes(q)
      );
    });
  }, [activeProducts, selectedMerchantId, stockFilter, searchQuery, state.merchants]);

  const visibleMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    return state.inventoryMovements.filter((mv) => {
      if (!q) return true;
      const prod = state.products.find((p) => p.product_id === mv.product_id);
      const merchant = state.merchants.find((m) => m.merchant_id === mv.merchant_id);
      return (
        (prod?.name || mv.product_name || '').toLowerCase().includes(q) ||
        (merchant?.shop_name || '').toLowerCase().includes(q) ||
        mv.movement_type.toLowerCase().includes(q) ||
        (mv.note || '').toLowerCase().includes(q)
      );
    });
  }, [state.inventoryMovements, state.products, state.merchants, movementSearch]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Monitored Stores
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.storesCount}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Active SKUs
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {summary.skuCount} ({summary.totalUnits} units)
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Low Stock Alerts
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {summary.lowStock}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Out of Stock
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums">
            {summary.outOfStock}
          </p>
        </div>
      </section>

      {section === 'stores' && (
        <div className="space-y-5">
          {/* Hierarchy Header: Stores -> Products -> Inventory */}
          <div className="medex-glass rounded-2xl border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  <span>Inventory Management</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>Stores / Merchants</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>Products</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>Stock Levels</span>
                </div>
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  Centralized Store &amp; Medicine Inventory Oversight
                </h1>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedMerchantId('all');
                  setStockFilter(stockFilter === 'low_or_out' ? 'all' : 'low_or_out');
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap ${
                  stockFilter === 'low_or_out'
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'medex-glass-subtle text-amber-900 dark:text-amber-200 border-amber-500/40'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  Restocking Alerts ({summary.lowStock + summary.outOfStock})
                </span>
              </button>
            </div>

            {/* Store Cards Selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {merchantRows.map(({ merchant, owner, brgy, prods, low, out, totalUnits }) => {
                const selected = selectedMerchantId === merchant.merchant_id;
                return (
                  <button
                    key={merchant.merchant_id}
                    type="button"
                    onClick={() =>
                      setSelectedMerchantId(selected ? 'all' : merchant.merchant_id)
                    }
                    className={`rounded-xl border p-3.5 text-left transition-all space-y-1.5 ${
                      selected
                        ? 'bg-teal-500/15 border-teal-500 ring-1 ring-teal-500/30'
                        : 'medex-glass-subtle hover:brightness-105'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                        <Store className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span className="truncate">{merchant.shop_name}</span>
                      </span>
                      <span className="text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300">
                        {owner?.status || 'approved'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>Brgy. {brgy?.name || 'Olongapo'}</span>
                    </p>
                    <div className="flex items-center justify-between text-[11px] pt-1 tabular-nums">
                      <span className="text-slate-700 dark:text-slate-200 font-medium">
                        {prods.length} SKUs · {totalUnits} units
                      </span>
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        {low} Low · {out} Out
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Inventory Table */}
          <div className="medex-glass rounded-2xl border p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['all', 'All Stock'],
                    ['available', 'Healthy Stock'],
                    ['low_or_out', 'Low / Out of Stock'],
                    ['out', 'Out of Stock Only'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStockFilter(key)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      stockFilter === key
                        ? 'bg-teal-600 text-white border-teal-500'
                        : 'medex-glass-subtle text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter medicine or store..."
                  className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/50 dark:border-white/10 text-[11px] uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2.5">Medicine / Product</th>
                    <th className="p-2.5">Store</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Price</th>
                    <th className="p-2.5">Stock</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Storefront</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40 dark:divide-white/10">
                  {visibleProducts.map((p) => {
                    const merchant = state.merchants.find((m) => m.merchant_id === p.merchant_id);
                    const category = state.categories.find((c) => c.category_id === p.category_id);
                    const avail = getAvailabilityStatus(p.stock_quantity, p.low_stock_threshold);
                    return (
                      <tr key={p.product_id}>
                        <td className="p-2.5">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            {p.dosage_strength ? `${p.dosage_strength} · ` : ''}
                            {p.unit}
                            {p.requires_prescription ? ' · Rx' : ''}
                          </p>
                        </td>
                        <td className="p-2.5 text-slate-700 dark:text-slate-200">
                          {merchant?.shop_name || 'Store'}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          {category?.name || 'General'}
                        </td>
                        <td className="p-2.5 font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatPHP(p.regular_price)}
                        </td>
                        <td className="p-2.5 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          {p.stock_quantity}{' '}
                          <span className="font-normal text-[10px] text-slate-500">
                            (min {p.low_stock_threshold})
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                              avail === 'Available'
                                ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                                : avail === 'Low Stock'
                                  ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                                  : 'bg-red-500/20 text-red-800 dark:text-red-200'
                            }`}
                          >
                            {avail}
                          </span>
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                          {p.is_listed ? 'Listed' : 'Unlisted'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'movements' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Inventory Movement History</span>
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Audited stock additions, sales deductions, cancellation restocks, and manual store adjustments.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                placeholder="Search item, store, type..."
                className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {visibleMovements.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              No inventory movement events recorded yet.
            </div>
          ) : (
            <div className="medex-glass rounded-2xl border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/50 dark:border-white/10 text-[11px] uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Store</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Event Type</th>
                    <th className="p-3">Change</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Actor &amp; Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40 dark:divide-white/10">
                  {visibleMovements.map((mv) => {
                    const prod = state.products.find((p) => p.product_id === mv.product_id);
                    const merchant = state.merchants.find((m) => m.merchant_id === mv.merchant_id);
                    const actor = state.users.find((u) => u.user_id === mv.actor_id);
                    return (
                      <tr key={mv.movement_id}>
                        <td className="p-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {new Date(mv.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 text-slate-800 dark:text-slate-200">
                          {merchant?.shop_name || `Store #${mv.merchant_id}`}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          {prod?.name || mv.product_name || `Product #${mv.product_id}`}
                        </td>
                        <td className="p-3 font-mono text-[11px] uppercase text-teal-800 dark:text-teal-300">
                          {mv.movement_type.replace(/_/g, ' ')}
                        </td>
                        <td
                          className={`p-3 font-mono font-bold tabular-nums ${
                            mv.quantity_delta >= 0
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-red-700 dark:text-red-300'
                          }`}
                        >
                          {mv.quantity_delta >= 0 ? `+${mv.quantity_delta}` : mv.quantity_delta}
                        </td>
                        <td className="p-3 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {mv.stock_before} → {mv.stock_after}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {actor ? `${actor.first_name} ${actor.last_name}` : mv.actor_name || 'System'}
                          {mv.note ? ` · ${mv.note}` : ''}
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
              Store Stock Health Analytics
            </h1>
          </div>
          <div className="space-y-3">
            {merchantRows.map(({ merchant, prods, low, out, totalUnits }) => {
              const healthy = Math.max(0, prods.length - low - out);
              const pct = prods.length > 0 ? Math.round((healthy / prods.length) * 100) : 100;
              return (
                <div key={merchant.merchant_id} className="rounded-xl medex-glass-subtle border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-display font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      {merchant.shop_name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {healthy}/{prods.length} healthy ({pct}%) · {totalUnits} total units · {low} low · {out} out
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 dark:bg-teal-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {low + out === 0 ? (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      All active SKUs above minimum threshold
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                      <PackageCheck className="w-3.5 h-3.5" />
                      {low + out} SKU(s) require merchant restocking notice
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

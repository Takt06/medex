import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Menu, X } from 'lucide-react';
import { partitionMobileNavItems } from '../../utils/mobileNav';

export interface FloatingMobileNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  featured?: boolean;
  tone?: 'emergency' | 'primary';
  active: boolean;
  onSelect: () => void;
}

interface FloatingMobileNavProps {
  ariaLabel: string;
  items: FloatingMobileNavItem[];
  breakpoint?: 'md' | 'lg';
}

export const FloatingMobileNav: React.FC<FloatingMobileNavProps> = ({
  ariaLabel,
  items,
  breakpoint = 'md',
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { primaryItems, overflowItems, hasMore } = partitionMobileNavItems(items, 5);

  const overflowActive = overflowItems.some((item) => item.active);
  const overflowBadgeTotal = overflowItems.reduce((sum, item) => sum + (item.badge || 0), 0);
  const slotCount = primaryItems.length + (hasMore ? 1 : 0);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreOpen]);

  const hiddenDesktopClass = breakpoint === 'lg' ? 'lg:hidden' : 'md:hidden';

  return (
    <div className={hiddenDesktopClass}>
      {/* Scrim + Floating Overflow Menu triggered by the Hamburger ("More") button */}
      <AnimatePresence>
        {hasMore && moreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]"
            />

            <motion.div
              role="dialog"
              aria-label="More navigation options"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 bottom-[calc(max(0.875rem,env(safe-area-inset-bottom))+4.65rem)] z-50 mx-auto max-w-[396px] rounded-[26px] medex-glass-safe border p-2.5 shadow-2xl"
            >
              <div className="px-3 pt-1 pb-2 flex items-center justify-between border-b border-slate-900/10 dark:border-white/10">
                <span className="font-display text-xs font-bold tracking-tight text-slate-800 dark:text-slate-100">
                  More Options
                </span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close more options"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-900/8 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-1.5 space-y-1 max-h-[55vh] overflow-y-auto">
                {overflowItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        item.onSelect();
                        setMoreOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 rounded-2xl px-3.5 min-h-[46px] text-left text-xs font-semibold transition-all ${
                        item.active
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-slate-800 dark:text-slate-100 hover:bg-white/70 dark:hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            item.active
                              ? 'bg-white/20 text-white'
                              : 'bg-teal-600/10 dark:bg-teal-400/15 text-teal-800 dark:text-teal-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>

                      <span className="flex items-center gap-2 shrink-0">
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                              item.active
                                ? 'bg-white/20 text-white'
                                : 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-200'
                            }`}
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                        {item.active && <Check className="w-4 h-4 shrink-0" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Capsule Bar (not touching bottom or screen edges) */}
      <nav
        aria-label={ariaLabel}
        className="fixed inset-x-4 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[396px] h-[62px] rounded-[31px] border border-white/25 dark:border-teal-300/20 bg-gradient-to-b from-[#0b3b42]/92 via-[#072b31]/95 to-[#041e23]/96 backdrop-blur-2xl shadow-[0_18px_38px_-10px_rgba(4,24,30,0.65),inset_0_1px_0.5px_rgba(255,255,255,0.28)]"
      >
        <div
          className="grid h-full items-center px-2.5"
          style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
        >
          {primaryItems.map((item) => {
            const Icon = item.icon;
            if (item.featured) {
              const isEmergency = item.tone === 'emergency';
              return (
                <div key={item.id} className="flex items-center justify-center">
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-current={item.active ? 'page' : undefined}
                    onClick={() => {
                      setMoreOpen(false);
                      item.onSelect();
                    }}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      isEmergency
                        ? item.active
                          ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_8px_22px_-3px_rgba(244,63,94,0.75)] ring-[3px] ring-rose-200/80 scale-[1.04]'
                          : 'bg-gradient-to-br from-rose-500/95 to-red-600/95 text-white shadow-[0_8px_18px_-4px_rgba(244,63,94,0.55)] ring-2 ring-white/30 hover:scale-[1.03]'
                        : item.active
                          ? 'bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-[0_8px_22px_-3px_rgba(45,212,191,0.65)] ring-[3px] ring-teal-200/75 scale-[1.04]'
                          : 'bg-teal-500/35 text-teal-50 border border-teal-300/35 hover:bg-teal-500/50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="sr-only">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-rose-700 font-mono text-[10px] font-bold flex items-center justify-center shadow-sm tabular-nums">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={item.active ? 'page' : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  item.onSelect();
                }}
                className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-teal-300 ${
                  item.active
                    ? 'text-white'
                    : 'text-teal-100/70 hover:text-white'
                }`}
              >
                <Icon className="w-[21px] h-[21px]" />
                <span className="sr-only">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-1.5 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-teal-400 text-slate-950 font-mono text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`mt-1 w-1.5 h-1.5 rounded-full transition-opacity ${
                    item.active ? 'bg-teal-300 opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}

          {hasMore && (
            <button
              type="button"
              aria-label="More navigation options"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((prev) => !prev)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-teal-300 ${
                moreOpen || overflowActive
                  ? 'text-white'
                  : 'text-teal-100/70 hover:text-white'
              }`}
            >
              {moreOpen ? <X className="w-[21px] h-[21px]" /> : <Menu className="w-[21px] h-[21px]" />}
              <span className="sr-only">More options</span>
              {overflowBadgeTotal > 0 && !moreOpen && (
                <span className="absolute top-1.5 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-teal-400 text-slate-950 font-mono text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {overflowBadgeTotal > 99 ? '99+' : overflowBadgeTotal}
                </span>
              )}
              <span
                aria-hidden="true"
                className={`mt-1 w-1.5 h-1.5 rounded-full transition-opacity ${
                  moreOpen || overflowActive ? 'bg-teal-300 opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};

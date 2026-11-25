import React from 'react';
import {
  AlertTriangle,
  MapPin,
  Package,
  ShoppingBag,
  Store,
  Truck,
  ShieldCheck,
  User,
  Bell,
} from 'lucide-react';
import { useMedEx, type ActiveTab } from '../../context/MedExContext';
import { MedExLogo } from '../common/MedExLogo';
import { PWAInstallButton } from '../common/PWAControls';
import { FloatingMobileNav } from './FloatingMobileNav';

interface TopNavProps {
  onOpenCart: () => void;
  onOpenAuth: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onOpenCart, onOpenAuth }) => {
  const {
    currentUser,
    activeTab,
    setActiveTab,
    activeCart,
    unreadNotificationCount,
  } = useMedEx();

  const cartCount = activeCart.items.reduce((sum, item) => sum + item.quantity, 0);

  const residentLinks: Array<{ id: ActiveTab; label: string }> = [
    { id: 'locator', label: 'Locator' },
    { id: 'store', label: 'Store' },
    { id: 'emergency', label: 'Emergency' },
    { id: 'orders', label: 'Orders' },
    { id: 'account', label: 'Account' },
  ];

  const roleNavLinks = (): Array<{ id: ActiveTab; label: string }> => {
    if (currentUser.role === 'merchant') {
      return [
        { id: 'merchant_dashboard', label: 'Pharmacy Portal' },
        { id: 'locator', label: 'Public Locator' },
        { id: 'account', label: 'Account' },
      ];
    }
    if (currentUser.role === 'rider') {
      return [
        { id: 'rider_dashboard', label: 'Rider Portal' },
        { id: 'account', label: 'Account' },
      ];
    }
    if (currentUser.role === 'admin') {
      return [
        { id: 'admin_dashboard', label: 'Admin Console' },
        { id: 'locator', label: 'Locator' },
        { id: 'account', label: 'Account' },
      ];
    }
    return residentLinks;
  };

  const navLinks = roleNavLinks();

  return (
    <>
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title (single-line) */}
          <button
            type="button"
            onClick={() =>
              setActiveTab(
                currentUser.role === 'resident'
                  ? 'locator'
                  : currentUser.role === 'merchant'
                    ? 'merchant_dashboard'
                    : currentUser.role === 'rider'
                      ? 'rider_dashboard'
                      : 'admin_dashboard'
              )
            }
            className="text-left focus-visible:outline-2 focus-visible:outline-teal-600 rounded-md whitespace-nowrap shrink-0"
            aria-label="MedEx Home"
          >
            <MedExLogo size={28} showWordmark />
          </button>

          {/* Zone 2: 3–5 concise single-line nav links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {navLinks.map((link) => {
              const active = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-teal-600 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {currentUser.role === 'resident' ? (
              <button
                type="button"
                onClick={onOpenCart}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Cart ({cartCount})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <User className="w-4 h-4" />
                <span>Switch Role</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Workspace Context Bar (below top bar — PWA install, notifications) */}
      <div className="bg-slate-100 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-700 font-medium">
              {currentUser.first_name} {currentUser.last_name} — {currentUser.role.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-teal-700 font-medium hover:underline whitespace-nowrap shrink-0"
            >
              Account
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
              aria-label={`Notifications (${unreadNotificationCount} unread)`}
            >
              <Bell className="w-3.5 h-3.5 text-slate-600" />
              <span className="tabular-nums">{unreadNotificationCount} Notices</span>
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* Floating Mobile Capsule Nav */}
      <FloatingMobileNav
        ariaLabel="Mobile Navigation"
        breakpoint="md"
        items={navLinks.map((link) => {
          const Icon =
            link.id === 'locator'
              ? MapPin
              : link.id === 'store'
                ? Store
                : link.id === 'emergency'
                  ? AlertTriangle
                  : link.id === 'orders'
                    ? Package
                    : link.id === 'merchant_dashboard'
                      ? Store
                      : link.id === 'rider_dashboard'
                        ? Truck
                        : link.id === 'admin_dashboard'
                          ? ShieldCheck
                          : User;
          return {
            id: link.id,
            label: link.label,
            icon: Icon,
            featured: link.id === 'emergency',
            tone: link.id === 'emergency' ? 'emergency' : 'primary',
            active: activeTab === link.id,
            onSelect: () => setActiveTab(link.id),
          };
        })}
      />
    </>
  );
};

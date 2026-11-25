import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { LoginDashboardView } from './components/auth/LoginDashboardView';
import {
  AdminDashboardShell,
  CouponHandlerDashboardShell,
  CustomerDashboardShell,
  CustomerServiceDashboardShell,
  DeliveryManagementDashboardShell,
  InventoryManagementDashboardShell,
  MerchantDashboardShell,
  RiderDashboardShell,
  type AdminSection,
  type CouponHandlerSection,
  type CustomerServiceSection,
  type DeliveryManagementSection,
  type InventoryManagementSection,
  type MerchantSection,
  type RiderSection,
} from './components/layout/RoleDashboards';
import { AdminPortalView } from './components/admin/AdminPortalView';
import { CouponHandlerPortalView } from './components/coupons/CouponHandlerPortalView';
import { DeliveryManagementPortalView } from './components/delivery/DeliveryManagementPortalView';
import { InventoryManagementPortalView } from './components/inventory/InventoryManagementPortalView';
import { MerchantPortalView } from './components/merchant/MerchantPortalView';
import { AccountView } from './components/resident/AccountView';
import { CartCheckoutModal } from './components/resident/CartCheckoutModal';
import { CustomerCouponsView } from './components/resident/CustomerCouponsView';
import { CustomerFeedbackView } from './components/resident/CustomerFeedbackView';
import { CustomerOverviewView } from './components/resident/CustomerOverviewView';
import { EmergencyView } from './components/resident/EmergencyView';
import { PharmacyLocatorView } from './components/resident/PharmacyLocatorView';
import { ResidentOrdersView } from './components/resident/ResidentOrdersView';
import { StoreView } from './components/resident/StoreView';
import { RiderPortalView } from './components/rider/RiderPortalView';
import { CustomerServicePortalView } from './components/support/CustomerServicePortalView';
import { SplashScreen } from './components/common/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { MedExProvider, useMedEx } from './context/MedExContext';
import { shouldSkipSplash } from './utils/medexRules';

const MedExShell: React.FC = () => {
  const {
    currentUser,
    isLoggedIn,
    activeTab,
    openCartAfterLogin,
    setOpenCartAfterLogin,
  } = useMedEx();
  const [cartOpen, setCartOpen] = useState(false);
  const [merchantSection, setMerchantSection] = useState<MerchantSection>('orders');
  const [riderSection, setRiderSection] = useState<RiderSection>('dispatch');
  const [adminSection, setAdminSection] = useState<AdminSection>('alerts');
  const [deliveryMgmtSection, setDeliveryMgmtSection] =
    useState<DeliveryManagementSection>('deliveries');
  const [couponSection, setCouponSection] = useState<CouponHandlerSection>('campaigns');
  const [inventorySection, setInventorySection] = useState<InventoryManagementSection>('stores');
  const [csSection, setCsSection] = useState<CustomerServiceSection>('complaints');

  useEffect(() => {
    if (!isLoggedIn) {
      setCartOpen(false);
      setMerchantSection('orders');
      setRiderSection('dispatch');
      setAdminSection('alerts');
      setDeliveryMgmtSection('deliveries');
      setCouponSection('campaigns');
      setInventorySection('stores');
      setCsSection('complaints');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && currentUser.role === 'resident' && openCartAfterLogin) {
      setCartOpen(true);
      setOpenCartAfterLogin(false);
    }
  }, [isLoggedIn, currentUser.role, openCartAfterLogin, setOpenCartAfterLogin]);

  if (!isLoggedIn) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="login-dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <LoginDashboardView />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Separated Role Dashboards
  if (currentUser.role === 'merchant') {
    const merchantContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <MerchantPortalView
          activeSection={merchantSection}
          onChangeSection={setMerchantSection}
        />
      );

    return (
      <MerchantDashboardShell
        section={merchantSection}
        onSelectSection={setMerchantSection}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${merchantSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {merchantContent}
          </motion.div>
        </AnimatePresence>
      </MerchantDashboardShell>
    );
  }

  if (currentUser.role === 'rider') {
    const riderContent =
      activeTab === 'account' ? (
        <AccountView />
      ) : (
        <RiderPortalView activeSection={riderSection} onChangeSection={setRiderSection} />
      );

    return (
      <RiderDashboardShell section={riderSection} onSelectSection={setRiderSection}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${riderSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {riderContent}
          </motion.div>
        </AnimatePresence>
      </RiderDashboardShell>
    );
  }

  if (currentUser.role === 'admin') {
    const adminContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <AdminPortalView activeSection={adminSection} onChangeSection={setAdminSection} />
      );

    return (
      <AdminDashboardShell section={adminSection} onSelectSection={setAdminSection}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${adminSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {adminContent}
          </motion.div>
        </AnimatePresence>
      </AdminDashboardShell>
    );
  }

  if (currentUser.role === 'delivery_manager') {
    const dmContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <DeliveryManagementPortalView section={deliveryMgmtSection} />
      );

    return (
      <DeliveryManagementDashboardShell
        section={deliveryMgmtSection}
        onSelectSection={setDeliveryMgmtSection}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${deliveryMgmtSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {dmContent}
          </motion.div>
        </AnimatePresence>
      </DeliveryManagementDashboardShell>
    );
  }

  if (currentUser.role === 'coupon_handler') {
    const couponContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <CouponHandlerPortalView section={couponSection} />
      );

    return (
      <CouponHandlerDashboardShell
        section={couponSection}
        onSelectSection={setCouponSection}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${couponSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {couponContent}
          </motion.div>
        </AnimatePresence>
      </CouponHandlerDashboardShell>
    );
  }

  if (currentUser.role === 'inventory_manager') {
    const invContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <InventoryManagementPortalView section={inventorySection} />
      );

    return (
      <InventoryManagementDashboardShell
        section={inventorySection}
        onSelectSection={setInventorySection}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${inventorySection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {invContent}
          </motion.div>
        </AnimatePresence>
      </InventoryManagementDashboardShell>
    );
  }

  if (currentUser.role === 'customer_service') {
    const csContent =
      activeTab === 'locator' ? (
        <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />
      ) : activeTab === 'account' ? (
        <AccountView />
      ) : (
        <CustomerServicePortalView section={csSection} />
      );

    return (
      <CustomerServiceDashboardShell
        section={csSection}
        onSelectSection={setCsSection}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${csSection}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {csContent}
          </motion.div>
        </AnimatePresence>
      </CustomerServiceDashboardShell>
    );
  }

  // Customer / Resident Dashboard
  const renderCustomerView = () => {
    if (activeTab === 'locator') {
      return <PharmacyLocatorView onOpenCart={() => setCartOpen(true)} />;
    }
    if (activeTab === 'store') {
      return <StoreView onOpenCart={() => setCartOpen(true)} />;
    }
    if (activeTab === 'coupons') {
      return <CustomerCouponsView />;
    }
    if (activeTab === 'emergency') {
      return <EmergencyView />;
    }
    if (activeTab === 'orders') {
      return <ResidentOrdersView />;
    }
    if (activeTab === 'feedback') {
      return <CustomerFeedbackView />;
    }
    if (activeTab === 'account') {
      return <AccountView />;
    }
    return <CustomerOverviewView onOpenCart={() => setCartOpen(true)} />;
  };

  return (
    <CustomerDashboardShell onOpenCart={() => setCartOpen(true)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
        >
          {renderCustomerView()}
        </motion.div>
      </AnimatePresence>
      <CartCheckoutModal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onOrderPlaced={() => {}}
      />
    </CustomerDashboardShell>
  );
};

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !shouldSkipSplash(window.location.search);
  });

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <MedExProvider>
          <AnimatePresence mode="wait">
            {showSplash ? (
              <SplashScreen key="splash" onFinish={() => setShowSplash(false)} />
            ) : (
              <motion.div
                key="app-shell"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.28 }}
              >
                <MedExShell />
              </motion.div>
            )}
          </AnimatePresence>
        </MedExProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

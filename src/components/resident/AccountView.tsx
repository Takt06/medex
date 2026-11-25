import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, FileText, MapPin, Phone, Plus, ShieldCheck, Store, Trash2, User } from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { Address, EmergencyContact } from '../../types/medex';
import { POLICY_VERSION } from '../../data/policiesData';
import { formatMerchantStatusLabel, getBarangayCenterCoords } from '../../utils/medexRules';
import { LocationPinPicker } from '../common/LocationPinPicker';
import { PoliciesModal } from '../common/PoliciesModal';

export const AccountView: React.FC = () => {
  const {
    state,
    currentUser,
    updateUserProfile,
    saveAddress,
    deleteAddress,
    setPrimaryAddress,
    updateHouseholdFlags,
    saveEmergencyContact,
    deleteEmergencyContact,
    markNotificationsRead,
    updateMerchantStoreLocation,
    completeMerchantProfile,
  } = useMedEx();

  const [firstName, setFirstName] = useState(currentUser.first_name);
  const [lastName, setLastName] = useState(currentUser.last_name);
  const [phone, setPhone] = useState(currentUser.phone_number);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [policiesOpen, setPoliciesOpen] = useState(false);

  // Address form
  const [editingAddrId, setEditingAddrId] = useState<number | undefined>(undefined);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [addrBrgyId, setAddrBrgyId] = useState(state.barangays[0]?.barangay_id || 1);
  const [addrRecName, setAddrRecName] = useState(`${currentUser.first_name} ${currentUser.last_name}`);
  const [addrRecPhone, setAddrRecPhone] = useState(currentUser.phone_number);
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrInstructions, setAddrInstructions] = useState('');
  const [addrIsPrimary, setAddrIsPrimary] = useState(true);
  const [addrLat, setAddrLat] = useState(14.8355);
  const [addrLng, setAddrLng] = useState(120.2842);

  // Merchant Store Location form
  const myMerchant = useMemo(
    () =>
      currentUser.role === 'merchant'
        ? state.merchants.find((m) => m.user_id === currentUser.user_id) || null
        : null,
    [currentUser.role, currentUser.user_id, state.merchants]
  );
  const myMerchantAddr = useMemo(
    () =>
      myMerchant
        ? state.addresses.find((a) => a.address_id === myMerchant.shop_address_id) || null
        : null,
    [myMerchant, state.addresses]
  );

  const [storeShopName, setStoreShopName] = useState(
    myMerchant?.shop_name || `${currentUser.first_name} ${currentUser.last_name} Pharmacy`
  );
  const [storePharmacistName, setStorePharmacistName] = useState(
    myMerchant?.pharmacist_name || `${currentUser.first_name} ${currentUser.last_name}`
  );
  const [storeLicenseNo, setStoreLicenseNo] = useState(myMerchant?.pharmacist_license_no || '');
  const [storeContactNo, setStoreContactNo] = useState(myMerchant?.contact_no || currentUser.phone_number);
  const [storeBrgyId, setStoreBrgyId] = useState(myMerchantAddr?.barangay_id || state.barangays[0]?.barangay_id || 1);
  const [storeStreet, setStoreStreet] = useState(myMerchantAddr?.street || '');
  const [storeLandmark, setStoreLandmark] = useState(myMerchantAddr?.landmark || '');
  const [storeLat, setStoreLat] = useState(myMerchantAddr?.latitude || 14.8355);
  const [storeLng, setStoreLng] = useState(myMerchantAddr?.longitude || 120.2842);
  const [linkingStore, setLinkingStore] = useState(false);

  // Emergency Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | undefined>(undefined);
  const [contactName, setContactName] = useState('');
  const [contactRel, setContactRel] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => {
    setFirstName(currentUser.first_name);
    setLastName(currentUser.last_name);
    setPhone(currentUser.phone_number);
    setAddrRecName(`${currentUser.first_name} ${currentUser.last_name}`);
    setAddrRecPhone(currentUser.phone_number);
    if (myMerchant) {
      setStoreShopName(myMerchant.shop_name);
      setStoreContactNo(myMerchant.contact_no);
      const bId = myMerchantAddr?.barangay_id || state.barangays[0]?.barangay_id || 1;
      const fallback = getBarangayCenterCoords(bId, state.barangays);
      setStoreBrgyId(bId);
      setStoreStreet(myMerchantAddr?.street || '');
      setStoreLandmark(myMerchantAddr?.landmark || '');
      setStoreLat(myMerchantAddr?.latitude ?? fallback.lat);
      setStoreLng(myMerchantAddr?.longitude ?? fallback.lng);
    }
    setFeedback(null);
  }, [currentUser, myMerchant, myMerchantAddr, state.barangays]);

  const myAddresses = useMemo(
    () => state.addresses.filter((a) => a.user_id === currentUser.user_id),
    [state.addresses, currentUser.user_id]
  );

  const myFlags = useMemo(
    () =>
      state.householdFlags.find((f) => f.user_id === currentUser.user_id) || {
        user_id: currentUser.user_id,
        has_senior: false,
        has_pwd: false,
        has_young_child: false,
        has_pregnant_member: false,
      },
    [state.householdFlags, currentUser.user_id]
  );

  const myContacts = useMemo(
    () => state.emergencyContacts.filter((c) => c.user_id === currentUser.user_id),
    [state.emergencyContacts, currentUser.user_id]
  );

  const myNotifications = useMemo(
    () => state.notifications.filter((n) => n.user_id === currentUser.user_id),
    [state.notifications, currentUser.user_id]
  );

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const res = updateUserProfile(firstName, lastName, phone);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Could not update profile.' });
      return;
    }
    setFeedback({ type: 'success', text: 'Profile updated and phone number normalized.' });
  };

  const openEditAddress = (addr?: Address) => {
    if (addr) {
      setEditingAddrId(addr.address_id);
      setAddrBrgyId(addr.barangay_id);
      setAddrRecName(addr.recipient_name);
      setAddrRecPhone(addr.recipient_phone);
      setAddrStreet(addr.street);
      setAddrLandmark(addr.landmark || '');
      setAddrInstructions(addr.delivery_instructions || '');
      setAddrIsPrimary(addr.is_primary);
      setAddrLat(addr.latitude);
      setAddrLng(addr.longitude);
    } else {
      const defaultBrgyId = state.barangays[0]?.barangay_id || 1;
      const center = getBarangayCenterCoords(defaultBrgyId, state.barangays);
      setEditingAddrId(undefined);
      setAddrBrgyId(defaultBrgyId);
      setAddrRecName(`${currentUser.first_name} ${currentUser.last_name}`);
      setAddrRecPhone(currentUser.phone_number);
      setAddrStreet('');
      setAddrLandmark('');
      setAddrInstructions('');
      setAddrIsPrimary(myAddresses.length === 0);
      setAddrLat(center.lat);
      setAddrLng(center.lng);
    }
    setShowAddrForm(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveAddress({
      address_id: editingAddrId,
      barangay_id: addrBrgyId,
      recipient_name: addrRecName,
      recipient_phone: addrRecPhone,
      street: addrStreet,
      landmark: addrLandmark || undefined,
      delivery_instructions: addrInstructions || undefined,
      latitude: addrLat,
      longitude: addrLng,
      is_primary: addrIsPrimary,
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Failed to save address.' });
      return;
    }
    setShowAddrForm(false);
    setFeedback({ type: 'success', text: 'Address book updated.' });
  };

  const handleSaveStoreLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const res = updateMerchantStoreLocation({
      shop_name: storeShopName,
      contact_no: storeContactNo,
      barangay_id: storeBrgyId,
      street: storeStreet,
      landmark: storeLandmark || undefined,
      latitude: storeLat,
      longitude: storeLng,
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Could not update store location.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: 'Pharmacy store address and map pin saved. Public Olongapo Map updated.',
    });
  };

  const handleLinkMerchantStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkingStore) return;
    setLinkingStore(true);
    try {
      const res = await completeMerchantProfile({
        shop_name: storeShopName,
        pharmacist_name: storePharmacistName,
        pharmacist_license_no: storeLicenseNo,
        contact_no: storeContactNo,
        barangay_id: storeBrgyId,
        street: storeStreet,
        landmark: storeLandmark || undefined,
        latitude: storeLat,
        longitude: storeLng,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Could not link pharmacy store profile.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: 'Pharmacy store profile linked! Your Merchant Portal is now active.',
      });
    } finally {
      setLinkingStore(false);
    }
  };

  const openEditContact = (c?: EmergencyContact) => {
    if (c) {
      setEditingContactId(c.contact_id);
      setContactName(c.contact_name);
      setContactRel(c.relationship);
      setContactPhone(c.phone_number);
    } else {
      setEditingContactId(undefined);
      setContactName('');
      setContactRel('');
      setContactPhone('');
    }
    setShowContactForm(true);
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveEmergencyContact({
      contact_id: editingContactId,
      contact_name: contactName,
      relationship: contactRel,
      phone_number: contactPhone,
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Failed to save emergency contact.' });
      return;
    }
    setShowContactForm(false);
    setFeedback({ type: 'success', text: 'Emergency contact saved.' });
  };

  return (
    <div className="space-y-6">
      <div className="medex-glass rounded-3xl border bg-gradient-to-br from-teal-500/18 via-white/25 to-sky-500/14 dark:from-teal-500/20 dark:via-slate-900/45 dark:to-sky-500/14 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 w-52 h-52 rounded-full bg-teal-400/15 blur-2xl"
        />
        <div className="relative flex items-start gap-3.5">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-600 to-slate-800 text-white font-display font-bold text-base items-center justify-center shadow-md shrink-0">
            {currentUser.first_name[0]}
            {currentUser.last_name[0]}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              MedEx Account · {currentUser.role}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
              {currentUser.first_name} {currentUser.last_name}
            </h1>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              Manage profile details, household vulnerability flags, saved barangay addresses, and notifications.
            </p>
          </div>
        </div>

        <div className="relative rounded-xl medex-glass-subtle border px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0">
          Status:{' '}
          <span
            className={`font-semibold uppercase ${
              currentUser.status === 'approved'
                ? 'text-teal-700 dark:text-teal-400'
                : currentUser.status === 'pending'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400'
            }`}
          >
            {currentUser.role === 'merchant'
              ? formatMerchantStatusLabel(currentUser.status)
              : currentUser.status}
          </span>
          {currentUser.status_reason ? ` · ${currentUser.status_reason}` : ''}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-2 ${
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Profile & Household Flags */}
        <div className="lg:col-span-6 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="medex-glass rounded-2xl border p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Profile Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="prof-first"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  First Name
                </label>
                <input
                  id="prof-first"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Letters only (e.g., Juan)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-last"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Last Name
                </label>
                <input
                  id="prof-last"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Letters only (e.g., Dela Cruz)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Mobile Number (+63)
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                DOB: {currentUser.date_of_birth} · Role: {currentUser.role.toUpperCase()}
              </span>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-teal-500 min-h-[38px] whitespace-nowrap"
              >
                Save Profile
              </button>
            </div>
          </form>

          {currentUser.role === 'resident' && (
            <div className="medex-glass rounded-2xl border p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Household Vulnerability Flags
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Helps barangay responders and emergency teams prioritize urgent medical needs.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-sm">
                {(
                  [
                    ['has_senior', 'Senior Citizen (60+)'],
                    ['has_pwd', 'Person with Disability (PWD)'],
                    ['has_young_child', 'Young Child / Infant'],
                    ['has_pregnant_member', 'Pregnant Household Member'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={myFlags[key]}
                      onChange={(e) =>
                        updateHouseholdFlags({
                          ...myFlags,
                          [key]: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300 accent-teal-600"
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Platform Policies & Compliance */}
          <div className="medex-glass rounded-2xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  MedEx Platform Policies
                </h2>
              </div>
              <span className="rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                v{currentUser.policy_version || POLICY_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentUser.policy_accepted_at
                ? `Acknowledged on ${new Date(currentUser.policy_accepted_at).toLocaleString()} — covers Prescription Compliance, Merchant & Rider Verification, Orders & Refunds, and Data Privacy.`
                : 'Review the official MedEx Platform Policies governing account security, prescription validation, merchant verification, and delivery conduct.'}
            </p>
            <button
              type="button"
              onClick={() => setPoliciesOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>View MedEx Platform Policies</span>
            </button>
          </div>

          {/* Notifications */}
          <div className="medex-glass rounded-2xl border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  In-System Notifications
                </h2>
              </div>
              <button
                type="button"
                onClick={markNotificationsRead}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                Mark all read
              </button>
            </div>

            {myNotifications.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                No notifications recorded.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {myNotifications.map((n) => (
                  <div key={n.notification_id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-xs font-semibold ${
                          n.is_read
                            ? 'text-slate-700 dark:text-slate-300'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {!n.is_read && '● '}
                        {n.title}
                      </p>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {n.notification_type} · {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Store Location (Merchant) or Address Book & Emergency Contacts */}
        <div className="lg:col-span-6 space-y-6">
          {currentUser.role === 'merchant' && !myMerchant && (
            <form
              onSubmit={handleLinkMerchantStore}
              className="medex-glass rounded-2xl border p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Link Pharmacy Store Profile
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Complete your pharmacy details and Olongapo storefront map pin to link this account
                to your live Merchant Store Portal.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="acc-link-shop-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Pharmacy Store Name *
                  </label>
                  <input
                    id="acc-link-shop-name"
                    type="text"
                    required
                    value={storeShopName}
                    onChange={(e) => setStoreShopName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="acc-link-contact-no"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Store Contact (+63) *
                  </label>
                  <input
                    id="acc-link-contact-no"
                    type="tel"
                    required
                    value={storeContactNo}
                    onChange={(e) => setStoreContactNo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="acc-link-pharmacist"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Pharmacist Name *
                  </label>
                  <input
                    id="acc-link-pharmacist"
                    type="text"
                    required
                    placeholder="Letters only (e.g., Maria Santos)"
                    value={storePharmacistName}
                    onChange={(e) => setStorePharmacistName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="acc-link-license"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    PRC License No. (7 digits) *
                  </label>
                  <input
                    id="acc-link-license"
                    type="text"
                    required
                    value={storeLicenseNo}
                    onChange={(e) => setStoreLicenseNo(e.target.value)}
                    placeholder="e.g., 0084512 or PRC-0084512"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="acc-link-brgy"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Store Barangay *
                  </label>
                  <select
                    id="acc-link-brgy"
                    value={storeBrgyId}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      setStoreBrgyId(nextId);
                      const center = getBarangayCenterCoords(nextId, state.barangays);
                      setStoreLat(center.lat);
                      setStoreLng(center.lng);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
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
                    htmlFor="acc-link-landmark"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nearby Landmark
                  </label>
                  <input
                    id="acc-link-landmark"
                    type="text"
                    value={storeLandmark}
                    onChange={(e) => setStoreLandmark(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="acc-link-street"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Store Street / Building Address *
                </label>
                <input
                  id="acc-link-street"
                  type="text"
                  required
                  value={storeStreet}
                  onChange={(e) => setStoreStreet(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <LocationPinPicker
                latitude={storeLat}
                longitude={storeLng}
                barangayName={state.barangays.find((b) => b.barangay_id === storeBrgyId)?.name}
                onChangeCoords={(lat, lng) => {
                  setStoreLat(lat);
                  setStoreLng(lng);
                }}
                onResetToBarangayCenter={() => {
                  const center = getBarangayCenterCoords(storeBrgyId, state.barangays);
                  setStoreLat(center.lat);
                  setStoreLng(center.lng);
                }}
                heightClass="h-48"
                title="Pin Storefront Location"
                helperText="Click on the Olongapo map to set your pharmacy pin."
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={linkingStore}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px] whitespace-nowrap disabled:opacity-60"
                >
                  {linkingStore ? 'Linking Store...' : 'Link Store Profile'}
                </button>
              </div>
            </form>
          )}

          {currentUser.role === 'merchant' && myMerchant && (
            <form
              onSubmit={handleSaveStoreLocation}
              className="medex-glass rounded-2xl border p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Pharmacy Store Address &amp; Map Pin
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  ID #{myMerchant.merchant_id}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Set your physical Olongapo storefront address and exact map pin so residents and
                delivery riders locate your pharmacy accurately.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="store-shop-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Pharmacy Store Name *
                  </label>
                  <input
                    id="store-shop-name"
                    type="text"
                    required
                    value={storeShopName}
                    onChange={(e) => setStoreShopName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="store-contact-no"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Store Contact (+63) *
                  </label>
                  <input
                    id="store-contact-no"
                    type="tel"
                    required
                    value={storeContactNo}
                    onChange={(e) => setStoreContactNo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="store-brgy"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Store Barangay *
                  </label>
                  <select
                    id="store-brgy"
                    value={storeBrgyId}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      setStoreBrgyId(nextId);
                      const center = getBarangayCenterCoords(nextId, state.barangays);
                      setStoreLat(center.lat);
                      setStoreLng(center.lng);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
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
                    htmlFor="store-landmark"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nearby Landmark
                  </label>
                  <input
                    id="store-landmark"
                    type="text"
                    value={storeLandmark}
                    onChange={(e) => setStoreLandmark(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="store-street"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Store Street / Building Address *
                </label>
                <input
                  id="store-street"
                  type="text"
                  required
                  value={storeStreet}
                  onChange={(e) => setStoreStreet(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <LocationPinPicker
                latitude={storeLat}
                longitude={storeLng}
                barangayName={state.barangays.find((b) => b.barangay_id === storeBrgyId)?.name}
                onChangeCoords={(lat, lng) => {
                  setStoreLat(lat);
                  setStoreLng(lng);
                }}
                onResetToBarangayCenter={() => {
                  const center = getBarangayCenterCoords(storeBrgyId, state.barangays);
                  setStoreLat(center.lat);
                  setStoreLng(center.lng);
                }}
                heightClass="h-52"
                title="Adjust Store Map Pin"
                helperText="Click on the Olongapo map to reposition your pharmacy marker."
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 min-h-[38px] whitespace-nowrap"
                >
                  Save Store Location
                </button>
              </div>
            </form>
          )}

          {/* Address Book */}
          {currentUser.role !== 'merchant' && (
          <div className="medex-glass rounded-2xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Address Book
                </h2>
              </div>
              <button
                type="button"
                onClick={() => openEditAddress()}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Address</span>
              </button>
            </div>

            {showAddrForm && (
              <form
                onSubmit={handleSaveAddress}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="acc-brgy"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Barangay *
                    </label>
                    <select
                      id="acc-brgy"
                      value={addrBrgyId}
                      onChange={(e) => {
                        const nextId = Number(e.target.value);
                        setAddrBrgyId(nextId);
                        const center = getBarangayCenterCoords(nextId, state.barangays);
                        setAddrLat(center.lat);
                        setAddrLng(center.lng);
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    >
                      {state.barangays.map((b) => (
                        <option key={b.barangay_id} value={b.barangay_id}>
                          Brgy. {b.name}, {b.city} ({b.region})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="acc-street"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Street / House No. *
                    </label>
                    <input
                      id="acc-street"
                      type="text"
                      required
                      value={addrStreet}
                      onChange={(e) => setAddrStreet(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="acc-rec-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Recipient Name *
                    </label>
                    <input
                      id="acc-rec-name"
                      type="text"
                      required
                      value={addrRecName}
                      onChange={(e) => setAddrRecName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="acc-rec-phone"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Recipient Mobile *
                    </label>
                    <input
                      id="acc-rec-phone"
                      type="tel"
                      required
                      value={addrRecPhone}
                      onChange={(e) => setAddrRecPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="acc-landmark"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Landmark
                    </label>
                    <input
                      id="acc-landmark"
                      type="text"
                      value={addrLandmark}
                      onChange={(e) => setAddrLandmark(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="acc-inst"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Delivery Instructions
                    </label>
                    <input
                      id="acc-inst"
                      type="text"
                      value={addrInstructions}
                      onChange={(e) => setAddrInstructions(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={addrIsPrimary}
                    onChange={(e) => setAddrIsPrimary(e.target.checked)}
                    className="rounded border-slate-300 accent-teal-600"
                  />
                  <span>Set as primary address (used for Emergency Triggers)</span>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddrForm(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Save Address
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {myAddresses.map((addr) => {
                const brgy = state.barangays.find((b) => b.barangay_id === addr.barangay_id);
                return (
                  <div
                    key={addr.address_id}
                    className="medex-glass-subtle rounded-xl border p-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="text-xs space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {addr.street}
                        {addr.is_primary && (
                          <span className="text-teal-700 dark:text-teal-400 font-semibold">
                            {' '}
                            · Primary
                          </span>
                        )}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {brgy
                          ? `Brgy. ${brgy.name}, ${brgy.city}, ${brgy.province} (${brgy.region})`
                          : 'Barangay'}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {addr.recipient_name} · {addr.recipient_phone}
                      </p>
                      {addr.landmark && (
                        <p className="text-slate-500 dark:text-slate-400">
                          Landmark: {addr.landmark}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!addr.is_primary && (
                        <button
                          type="button"
                          onClick={() => setPrimaryAddress(addr.address_id)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <Check className="w-3 h-3 inline mr-0.5" />
                          Primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditAddress(addr)}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAddress(addr.address_id)}
                        aria-label="Delete address"
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Emergency Contacts */}
          <div className="medex-glass rounded-2xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Emergency Contacts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => openEditContact()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>

            {showContactForm && (
              <form
                onSubmit={handleSaveContact}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label
                      htmlFor="ec-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Name *
                    </label>
                    <input
                      id="ec-name"
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ec-rel"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Relationship *
                    </label>
                    <input
                      id="ec-rel"
                      type="text"
                      required
                      value={contactRel}
                      onChange={(e) => setContactRel(e.target.value)}
                      placeholder="Spouse / Sister"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ec-phone"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Phone (+63) *
                    </label>
                    <input
                      id="ec-phone"
                      type="tel"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowContactForm(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 dark:bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Save Contact
                  </button>
                </div>
              </form>
            )}

            {myContacts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No emergency contacts added yet.
              </p>
            ) : (
              <div className="space-y-2">
                {myContacts.map((c) => (
                  <div
                    key={c.contact_id}
                    className="medex-glass-subtle rounded-xl border p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {c.contact_name}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 tabular-nums">
                        {c.relationship} · {c.phone_number}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditContact(c)}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEmergencyContact(c.contact_id)}
                        aria-label={`Remove ${c.contact_name}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <PoliciesModal
        open={policiesOpen}
        onClose={() => setPoliciesOpen(false)}
        acceptedAt={currentUser.policy_accepted_at}
        acceptedVersion={currentUser.policy_version}
      />
    </div>
  );
};

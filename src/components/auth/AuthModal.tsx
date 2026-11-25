import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { PublicRegisterRole } from '../../types/medex';
import { POLICY_VERSION } from '../../data/policiesData';
import {
  getBarangayCenterCoords,
  getPasswordRequirementChecks,
  validateAndNormalizePHPlateNumber,
  validateAndNormalizePrcLicense,
  validatePasswordStrength,
  validatePersonName,
  validateRiderVerificationDocs,
  validateSignupEmail,
} from '../../utils/medexRules';
import {
  collapseInputSelection,
  isBlockedPasswordKeyCombo,
  preventProtectedClipboardEvent,
} from '../../utils/passwordFieldGuard';
import { readAndCompressVerificationDocument } from '../../utils/documentUpload';
import { LocationPinPicker } from '../common/LocationPinPicker';
import { PoliciesModal } from '../common/PoliciesModal';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'register';
  defaultRole?: PublicRegisterRole;
  intentMessage?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  defaultMode = 'signin',
  defaultRole = 'resident',
  intentMessage = null,
}) => {
  const {
    state,
    loginWithCredentials,
    registerWithCredentials,
    claimAdminPassword,
    databaseConnected,
    adminNeedsPasswordSetup,
  } = useMedEx();
  const [mode, setMode] = useState<'signin' | 'register'>(defaultMode);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminSetupPassword, setAdminSetupPassword] = useState('');
  const [showAdminSetupPassword, setShowAdminSetupPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Registration fields
  const [role, setRole] = useState<PublicRegisterRole>(defaultRole);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('1998-01-15');
  const [barangayId, setBarangayId] = useState(state.barangays[0]?.barangay_id || 1);
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const initialCoords = getBarangayCenterCoords(
    state.barangays[0]?.barangay_id || 1,
    state.barangays
  );
  const [pinLat, setPinLat] = useState(initialCoords.lat);
  const [pinLng, setPinLng] = useState(initialCoords.lng);
  const [shopName, setShopName] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [businessPermitName, setBusinessPermitName] = useState('');
  const [businessPermitUrl, setBusinessPermitUrl] = useState('');
  const [governmentIdName, setGovernmentIdName] = useState('');
  const [governmentIdUrl, setGovernmentIdUrl] = useState('');
  const [driverLicenseName, setDriverLicenseName] = useState('');
  const [driverLicenseUrl, setDriverLicenseUrl] = useState('');
  const [vehicleRegName, setVehicleRegName] = useState('');
  const [vehicleRegUrl, setVehicleRegUrl] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState<
    'permit' | 'gov_id' | 'rider_license' | 'rider_vehicle_reg' | null
  >(null);
  const [vehicleType, setVehicleType] = useState('Motorcycle');
  const [plateNumber, setPlateNumber] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policiesModalOpen, setPoliciesModalOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loginPasswordRef = useRef<HTMLInputElement | null>(null);
  const regPasswordRef = useRef<HTMLInputElement | null>(null);
  const adminSetupPasswordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (error && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  useEffect(() => {
    if (!open) return;

    const isProtectedElement = (node: EventTarget | Element | null): node is HTMLInputElement =>
      Boolean(
        node &&
          (node === loginPasswordRef.current ||
            node === regPasswordRef.current ||
            node === adminSetupPasswordRef.current)
      );

    const onDocumentClipboard = (ev: ClipboardEvent) => {
      if (isProtectedElement(ev.target) || isProtectedElement(document.activeElement)) {
        preventProtectedClipboardEvent(ev);
      }
    };

    const onDocumentSelectionChange = () => {
      if (isProtectedElement(document.activeElement)) {
        collapseInputSelection(document.activeElement);
      }
    };

    document.addEventListener('copy', onDocumentClipboard, true);
    document.addEventListener('cut', onDocumentClipboard, true);
    document.addEventListener('selectionchange', onDocumentSelectionChange);
    return () => {
      document.removeEventListener('copy', onDocumentClipboard, true);
      document.removeEventListener('cut', onDocumentClipboard, true);
      document.removeEventListener('selectionchange', onDocumentSelectionChange);
    };
  }, [open]);

  const protectedPasswordHandlers = {
    onCopy: (e: React.ClipboardEvent<HTMLInputElement>) => {
      preventProtectedClipboardEvent(e.nativeEvent);
    },
    onCut: (e: React.ClipboardEvent<HTMLInputElement>) => {
      preventProtectedClipboardEvent(e.nativeEvent);
    },
    onContextMenu: (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
    },
    onDragStart: (e: React.DragEvent<HTMLInputElement>) => {
      e.preventDefault();
    },
    onDoubleClick: (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
      collapseInputSelection(e.currentTarget);
    },
    onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
      collapseInputSelection(e.currentTarget);
    },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement>) => {
      collapseInputSelection(e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isBlockedPasswordKeyCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
        collapseInputSelection(e.currentTarget);
      }
    },
  };

  const handleBarangayChange = (nextId: number) => {
    setBarangayId(nextId);
    const center = getBarangayCenterCoords(nextId, state.barangays);
    setPinLat(center.lat);
    setPinLng(center.lng);
  };

  const handleDocFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'permit' | 'gov_id' | 'rider_license' | 'rider_vehicle_reg'
  ) => {
    setError(null);
    const file = e.target.files?.[0];
    // Reset input value immediately so re-selecting the same file always fires onChange
    e.target.value = '';
    if (!file) return;

    setUploadingDoc(target);
    try {
      const processed = await readAndCompressVerificationDocument(file);
      if (!processed.ok || !processed.dataUrl || !processed.fileName) {
        setError(processed.error || 'Invalid verification document file.');
        return;
      }
      if (target === 'permit') {
        setBusinessPermitName(processed.fileName);
        setBusinessPermitUrl(processed.dataUrl);
      } else if (target === 'gov_id') {
        setGovernmentIdName(processed.fileName);
        setGovernmentIdUrl(processed.dataUrl);
      } else if (target === 'rider_license') {
        setDriverLicenseName(processed.fileName);
        setDriverLicenseUrl(processed.dataUrl);
      } else {
        setVehicleRegName(processed.fileName);
        setVehicleRegUrl(processed.dataUrl);
      }
    } catch {
      setError('Could not process the selected document file. Please try another JPG, PNG, or PDF.');
    } finally {
      setUploadingDoc(null);
    }
  };

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setRole(defaultRole);
      setShowLoginPassword(false);
      setShowRegPassword(false);
      setShowAdminSetup(false);
      setAdminSetupPassword('');
      setShowAdminSetupPassword(false);
      setBusinessPermitName('');
      setBusinessPermitUrl('');
      setGovernmentIdName('');
      setGovernmentIdUrl('');
      setDriverLicenseName('');
      setDriverLicenseUrl('');
      setVehicleRegName('');
      setVehicleRegUrl('');
      setUploadingDoc(null);
      setPolicyAccepted(false);
      setPoliciesModalOpen(false);
      setError(null);
      setInfoMessage(null);
      setIsSubmitting(false);
    }
  }, [open, defaultMode, defaultRole]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !isSubmitting && !policiesModalOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSubmitting, policiesModalOpen, onClose]);

  if (!open) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials(loginEmail, loginPassword || undefined);
      if (!res.ok) {
        setError(res.error || 'Login failed.');
        return;
      }
      setLoginPassword('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClaimAdmin = async () => {
    if (isSubmitting) return;
    setError(null);
    setInfoMessage(null);
    const pwCheck = validatePasswordStrength(adminSetupPassword);
    if (!pwCheck.valid) {
      setError(pwCheck.error || 'Admin password must be at least 8 characters long.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await claimAdminPassword('admin@medex.ph', adminSetupPassword);
      if (!res.ok) {
        setError(res.error || 'Could not initialize Admin password.');
        return;
      }
      setAdminSetupPassword('');
      setShowAdminSetup(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setInfoMessage(null);

    const firstNameCheck = validatePersonName(firstName, 'First Name');
    if (!firstNameCheck.valid) {
      setError(firstNameCheck.error || 'First Name must contain letters only.');
      return;
    }

    const lastNameCheck = validatePersonName(lastName, 'Last Name');
    if (!lastNameCheck.valid) {
      setError(lastNameCheck.error || 'Last Name must contain letters only.');
      return;
    }

    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'Only valid @gmail.com email addresses are accepted for sign up.');
      return;
    }

    const pwCheck = validatePasswordStrength(regPassword);
    if (!pwCheck.valid) {
      setError(pwCheck.error || 'Password must be at least 8 characters long.');
      return;
    }

    if (!policyAccepted) {
      setError('Please read and acknowledge the MedEx Platform Policies before creating an account.');
      return;
    }

    let normalizedPrc = licenseNo.trim();
    let normalizedRph = pharmacistName.trim();
    if (role === 'merchant') {
      const rphCheck = validatePersonName(pharmacistName, 'Licensed Pharmacist Name');
      if (!rphCheck.valid) {
        setError(rphCheck.error || 'Licensed Pharmacist Name must contain letters only.');
        return;
      }
      normalizedRph = rphCheck.normalized;
      const prcCheck = validateAndNormalizePrcLicense(licenseNo);
      if (!prcCheck.valid) {
        setError(prcCheck.error || 'Enter a valid 7-digit PRC Pharmacist License No.');
        return;
      }
      normalizedPrc = prcCheck.normalized;
      if (!businessPermitUrl || !businessPermitName) {
        setError('Please upload a valid Business Permit (JPG, PNG, WEBP, or PDF) for Admin verification.');
        return;
      }
      if (!governmentIdUrl || !governmentIdName) {
        setError('Please upload a valid Government-Issued ID (JPG, PNG, WEBP, or PDF) for Admin verification.');
        return;
      }
    }

    let normalizedPlate = plateNumber.trim();
    if (role === 'rider') {
      const plateCheck = validateAndNormalizePHPlateNumber(plateNumber, vehicleType);
      if (!plateCheck.valid) {
        setError(plateCheck.error || 'Enter a valid Philippine LTO plate number.');
        return;
      }
      normalizedPlate = plateCheck.normalized;
      const riderDocsCheck = validateRiderVerificationDocs({
        driver_license_url: driverLicenseUrl,
        vehicle_registration_url: vehicleRegUrl,
      });
      if (!riderDocsCheck.valid) {
        setError(
          riderDocsCheck.error ||
            "Please upload a valid Driver's License ID and Vehicle Registration Document for Admin verification."
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await registerWithCredentials({
        role,
        first_name: firstNameCheck.normalized,
        last_name: lastNameCheck.normalized,
        email: emailCheck.normalized,
        password: regPassword,
        phone_number: phone,
        date_of_birth: dob,
        barangay_id: barangayId,
        street,
        landmark,
        latitude: pinLat,
        longitude: pinLng,
        shop_name: shopName,
        pharmacist_name: normalizedRph,
        pharmacist_license_no: normalizedPrc,
        business_permit_name: role === 'merchant' ? businessPermitName : undefined,
        business_permit_url: role === 'merchant' ? businessPermitUrl : undefined,
        government_id_name: role === 'merchant' ? governmentIdName : undefined,
        government_id_url: role === 'merchant' ? governmentIdUrl : undefined,
        vehicle_type: vehicleType,
        plate_number: normalizedPlate,
        driver_license_name: role === 'rider' ? driverLicenseName : undefined,
        driver_license_url: role === 'rider' ? driverLicenseUrl : undefined,
        vehicle_registration_name: role === 'rider' ? vehicleRegName : undefined,
        vehicle_registration_url: role === 'rider' ? vehicleRegUrl : undefined,
        policy_accepted: true,
        policy_version: POLICY_VERSION,
      });
      if (!res.ok) {
        setError(res.error || 'Registration failed.');
        return;
      }
      if (res.requiresEmailConfirmation) {
        setLoginEmail(emailCheck.normalized);
        setRegPassword('');
        setMode('signin');
        setInfoMessage('Account created! Sign in with your registered Gmail address and password.');
        return;
      }
      setRegPassword('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const glassInputClass =
    'w-full rounded-2xl border border-white/75 dark:border-white/16 bg-white/68 dark:bg-slate-950/42 px-4 py-2.5 text-sm text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.38)] focus:bg-white/88 dark:focus:bg-slate-950/60 focus:border-teal-500/75 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all';
  const glassWellClass =
    'rounded-2xl border border-white/65 dark:border-white/14 bg-white/32 dark:bg-white/[0.04] shadow-[0_10px_28px_-16px_rgba(8,38,56,0.18),inset_0_1px_0.5px_rgba(255,255,255,0.88)] dark:shadow-[0_12px_30px_-16px_rgba(0,0,0,0.55),inset_0_1px_0.5px_rgba(255,255,255,0.16)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/38 dark:bg-slate-950/58 backdrop-blur-md transition-colors"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !policiesModalOpen) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-h-[92vh] flex flex-col overflow-hidden rounded-[28px] border medex-glass shadow-[0_32px_80px_-16px_rgba(4,18,32,0.48)] ${
          mode === 'signin' ? 'max-w-md' : 'max-w-2xl'
        }`}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/50 dark:border-white/12 bg-white/20 dark:bg-white/[0.04]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              MedEx Olongapo City
            </p>
            <h2
              id="auth-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white"
            >
              {mode === 'signin' ? 'Sign In to Your Account' : 'Create Your MedEx Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-full border border-white/65 dark:border-white/15 bg-white/55 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-white/85 dark:hover:bg-white/20 hover:text-slate-950 dark:hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
        {intentMessage && (
          <div className="mx-6 mt-4 rounded-2xl border border-teal-500/35 bg-teal-500/14 dark:bg-teal-400/12 px-4 py-3 flex items-start gap-2.5 text-xs text-teal-950 dark:text-teal-100">
            <ShoppingBag className="w-4 h-4 text-teal-700 dark:text-teal-300 shrink-0 mt-0.5" />
            <span>{intentMessage}</span>
          </div>
        )}

        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl border medex-glass-subtle">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white/88 dark:bg-white/18 text-slate-950 dark:text-white border border-white/80 dark:border-white/22 shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Sign Up (New Account)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white/88 dark:bg-white/18 text-slate-950 dark:text-white border border-white/80 dark:border-white/22 shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Sign In (Existing)
            </button>
          </div>
        </div>

        {infoMessage && (
          <div
            role="status"
            className="mx-6 mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 dark:bg-emerald-400/15 px-3.5 py-2.5 flex items-start gap-2 text-xs font-medium text-emerald-950 dark:text-emerald-100"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 rounded-2xl border border-red-400/45 bg-red-500/15 dark:bg-red-500/18 px-3.5 py-2.5 text-xs font-medium text-red-950 dark:text-red-100"
          >
            {error}
          </div>
        )}

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="name@gmail.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/75 dark:border-white/16 bg-white/68 dark:bg-slate-950/42 backdrop-blur-md px-4 py-2.5 text-sm text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.38)] focus:bg-white/88 dark:focus:bg-slate-950/60 focus:border-teal-500/75 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all"
              />
              <p className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                Use your registered @gmail.com address (or authorized Admin / Department Staff @medex.ph account).
              </p>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
              >
                Password {databaseConnected ? '*' : '(Optional in local preview)'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  ref={loginPasswordRef}
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  required={databaseConnected}
                  autoComplete="current-password"
                  placeholder={databaseConnected ? 'Enter your password' : 'Password (optional in local preview)'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  {...protectedPasswordHandlers}
                  className="medex-password-protected w-full rounded-2xl border border-white/75 dark:border-white/16 bg-white/68 dark:bg-slate-950/42 backdrop-blur-md pl-10 pr-10 py-2.5 text-sm text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.38)] focus:bg-white/88 dark:focus:bg-slate-950/60 focus:border-teal-500/75 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? 'Hide sign in password' : 'Show sign in password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white focus:outline-2 focus:outline-teal-600 transition-colors"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                Customers, Pharmacy Merchants, Dispatch Riders, Admins, and Department Staff sign in with their registered account{databaseConnected ? ' and password.' : '.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="medex-btn-lift w-full rounded-2xl bg-gradient-to-b from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-600 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-8px_rgba(13,148,136,0.65),inset_0_1px_0.5px_rgba(255,255,255,0.42)] disabled:opacity-60 transition-all"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>

            {databaseConnected && adminNeedsPasswordSetup && (
              <div className="pt-3 border-t border-white/45 dark:border-white/12 space-y-2.5">
                {!showAdminSetup ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminSetup(true);
                      setError(null);
                    }}
                    className="w-full text-center text-xs font-semibold text-teal-800 dark:text-teal-300 hover:underline"
                  >
                    First-time MySQL Setup: Set Password for admin@medex.ph
                  </button>
                ) : (
                  <div className="rounded-2xl medex-glass-subtle border p-3.5 space-y-2.5">
                    <p className="text-xs font-semibold text-teal-900 dark:text-teal-200">
                      Initialize MySQL Admin Password (admin@medex.ph)
                    </p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      This one-time setup hashes and stores your Admin password securely in MySQL.
                    </p>
                    <div className="relative">
                      <input
                        ref={adminSetupPasswordRef}
                        type={showAdminSetupPassword ? 'text' : 'password'}
                        minLength={8}
                        placeholder="Strong password (8+ chars, Aa1!)"
                        value={adminSetupPassword}
                        onChange={(e) => setAdminSetupPassword(e.target.value)}
                        {...protectedPasswordHandlers}
                        className="medex-password-protected w-full rounded-xl border border-white/70 dark:border-white/16 bg-white/75 dark:bg-slate-950/50 pl-3 pr-10 py-2 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminSetupPassword((prev) => !prev)}
                        aria-label={showAdminSetupPassword ? 'Hide admin setup password' : 'Show admin setup password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white"
                      >
                        {showAdminSetupPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      Must include 8+ chars, uppercase (A-Z), lowercase (a-z), number (0-9), and special char (!@#$).
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleClaimAdmin}
                        className="flex-1 rounded-xl bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                      >
                        Save Admin Password &amp; Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdminSetup(false)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleRegister} className="p-6 space-y-4">
            {/* Section 1: Account Type */}
            <div className={`${glassWellClass} p-4 space-y-2.5`}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  1. Account Type
                </label>
                <span className="text-[11px] text-slate-700 dark:text-slate-300">
                  {role === 'resident' ? 'Instant access' : 'Admin verified'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['resident', 'Customer'],
                    ['merchant', 'Pharmacy Store'],
                    ['rider', 'Delivery Rider'],
                  ] as const
                ).map(([r, label]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-xl border py-2.5 px-2.5 text-xs font-semibold transition-all whitespace-nowrap ${
                      role === r
                        ? 'border-teal-500/80 bg-white/88 dark:bg-teal-400/18 text-teal-900 dark:text-teal-200 shadow-[0_6px_16px_-8px_rgba(13,148,136,0.38),inset_0_1px_0.5px_rgba(255,255,255,0.95)] ring-1 ring-teal-500/25'
                        : 'border-white/65 dark:border-white/14 bg-white/48 dark:bg-slate-950/32 text-slate-700 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                {role === 'resident'
                  ? 'Shop and order medicines immediately across Olongapo City (18+ required).'
                  : 'Pharmacies and Riders enter pending Admin verification after registration.'}
              </p>
            </div>

            {/* Section 2: Personal & Account Credentials */}
            <div className={`${glassWellClass} p-4 space-y-3.5`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                2. Personal &amp; Account Details
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-first"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    First Name *
                  </label>
                  <input
                    id="reg-first"
                    type="text"
                    required
                    placeholder="Letters only (e.g., Juan)"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={glassInputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-last"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Last Name *
                  </label>
                  <input
                    id="reg-last"
                    type="text"
                    required
                    placeholder="Letters only (e.g., Dela Cruz)"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={glassInputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Gmail Address (@gmail.com) *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    placeholder="juandelacruz@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={glassInputClass}
                  />
                  <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                    Strictly @gmail.com accounts only
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Mobile (+63 / 09) *
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    placeholder="09171234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`${glassInputClass} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      ref={regPasswordRef}
                      id="reg-password"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      aria-describedby="reg-password-rules"
                      placeholder="Create a strong password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      {...protectedPasswordHandlers}
                      className={`${glassInputClass} medex-password-protected pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      aria-label={showRegPassword ? 'Hide registration password' : 'Show registration password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white focus:outline-2 focus:outline-teal-600 transition-colors"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {(() => {
                    const checks = getPasswordRequirementChecks(regPassword);
                    const items: Array<{ key: keyof typeof checks; label: string }> = [
                      { key: 'minLength', label: '8+ chars' },
                      { key: 'hasUppercase', label: 'Uppercase (A-Z)' },
                      { key: 'hasLowercase', label: 'Lowercase (a-z)' },
                      { key: 'hasNumber', label: 'Number (0-9)' },
                      { key: 'hasSpecial', label: 'Special (!@#$)' },
                    ];
                    return (
                      <ul
                        id="reg-password-rules"
                        className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]"
                        aria-label="Password requirements"
                      >
                        {items.map((item) => {
                          const met = checks[item.key];
                          return (
                            <li
                              key={item.key}
                              className={`flex items-center gap-1.5 transition-colors ${
                                met
                                  ? 'text-emerald-700 dark:text-emerald-300 font-semibold'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <CheckCircle2
                                className={`w-3 h-3 shrink-0 ${
                                  met
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              />
                              <span>{item.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </div>
                <div>
                  <label
                    htmlFor="reg-dob"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Date of Birth (Must be 18+) *
                  </label>
                  <input
                    id="reg-dob"
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={`${glassInputClass} dark:[color-scheme:dark]`}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Role-Specific Details */}
            {role === 'resident' && (
              <div className={`${glassWellClass} p-4 space-y-3.5`}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  3. Olongapo Delivery Address
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-brgy"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Olongapo Barangay
                    </label>
                    <select
                      id="reg-brgy"
                      value={barangayId}
                      onChange={(e) => handleBarangayChange(Number(e.target.value))}
                      className={`${glassInputClass} dark:[color-scheme:dark]`}
                    >
                      {state.barangays.map((b) => (
                        <option key={b.barangay_id} value={b.barangay_id}>
                          {b.name}, {b.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-landmark"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Nearby Landmark
                    </label>
                    <input
                      id="reg-landmark"
                      type="text"
                      placeholder="e.g., Near SM City Olongapo"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className={glassInputClass}
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reg-street"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    House No. &amp; Street *
                  </label>
                  <input
                    id="reg-street"
                    type="text"
                    required
                    placeholder="e.g., 45 Rizal Ave., East Bajac-Bajac"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className={glassInputClass}
                  />
                </div>
              </div>
            )}

            {role === 'merchant' && (
              <div className={`${glassWellClass} p-4 space-y-3.5`}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  3. Pharmacy Branch &amp; Verification
                </p>
                <div>
                  <label
                    htmlFor="reg-shop"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Pharmacy Name *
                  </label>
                  <input
                    id="reg-shop"
                    type="text"
                    required
                    placeholder="e.g., Olongapo Care Pharmacy"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className={glassInputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-rph"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Licensed Pharmacist *
                    </label>
                    <input
                      id="reg-rph"
                      type="text"
                      required
                      placeholder="Letters only (e.g., Maria Santos)"
                      value={pharmacistName}
                      onChange={(e) => setPharmacistName(e.target.value)}
                      className={glassInputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-prc"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      PRC License No. (7 digits) *
                    </label>
                    <input
                      id="reg-prc"
                      type="text"
                      required
                      placeholder="e.g., 0084512 or PRC-0084512"
                      value={licenseNo}
                      onChange={(e) => setLicenseNo(e.target.value)}
                      className={`${glassInputClass} font-mono`}
                    />
                    <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                      7-digit PRC Pharmacist Registration Number
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-merchant-brgy"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Store Barangay (Olongapo) *
                    </label>
                    <select
                      id="reg-merchant-brgy"
                      value={barangayId}
                      onChange={(e) => handleBarangayChange(Number(e.target.value))}
                      className={`${glassInputClass} dark:[color-scheme:dark]`}
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
                      htmlFor="reg-merchant-landmark"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Store Landmark
                    </label>
                    <input
                      id="reg-merchant-landmark"
                      type="text"
                      placeholder="e.g., Beside Kalaklan Bridge"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className={glassInputClass}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-merchant-street"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                  >
                    Store Street / Building Address *
                  </label>
                  <input
                    id="reg-merchant-street"
                    type="text"
                    required
                    placeholder="e.g., 128 National Highway, Kalaklan"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className={glassInputClass}
                  />
                </div>

                <LocationPinPicker
                  latitude={pinLat}
                  longitude={pinLng}
                  barangayName={state.barangays.find((b) => b.barangay_id === barangayId)?.name}
                  onChangeCoords={(lat, lng) => {
                    setPinLat(lat);
                    setPinLng(lng);
                  }}
                  onResetToBarangayCenter={() => handleBarangayChange(barangayId)}
                  heightClass="h-44"
                  title="Pin Pharmacy Store on Olongapo Map"
                  helperText="Selected Barangay centers the map. Click anywhere on the map to adjust your exact store pin."
                />

                {/* Required Merchant Verification Documents */}
                <div className="rounded-2xl border border-teal-500/35 dark:border-teal-400/25 bg-teal-500/10 dark:bg-teal-400/10 p-3.5 space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Required Seller Verification Documents *
                      </p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300">
                        Admin must review and verify your Business Permit and Government-Issued ID before approving your pharmacy. (JPG, PNG, WEBP, or PDF · max 10 MB)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        Valid Business Permit *
                      </span>
                      {businessPermitUrl ? (
                        <div className="rounded-2xl border border-emerald-400/50 dark:border-emerald-500/40 bg-white/75 dark:bg-slate-950/55 p-2 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{businessPermitName}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setBusinessPermitName('');
                                setBusinessPermitUrl('');
                              }}
                              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                          {businessPermitUrl.startsWith('data:image/') ? (
                            <img
                              src={businessPermitUrl}
                              alt="Business Permit preview"
                              className="w-full h-20 object-cover rounded-xl border border-white/60 dark:border-white/12"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-xl px-2 py-1.5">
                              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>PDF attached and ready for Admin review</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label
                          htmlFor="reg-business-permit"
                          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-500/50 dark:border-teal-400/35 bg-white/68 dark:bg-slate-950/42 hover:bg-white/88 dark:hover:bg-slate-900/65 px-3 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
                        >
                          <input
                            id="reg-business-permit"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploadingDoc !== null}
                            onChange={(e) => void handleDocFileUpload(e, 'permit')}
                            className="hidden"
                          />
                          <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-300 shrink-0" />
                          <span>
                            {uploadingDoc === 'permit'
                              ? 'Processing file...'
                              : 'Upload Business Permit'}
                          </span>
                        </label>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        Government-Issued ID *
                      </span>
                      {governmentIdUrl ? (
                        <div className="rounded-2xl border border-emerald-400/50 dark:border-emerald-500/40 bg-white/75 dark:bg-slate-950/55 p-2 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{governmentIdName}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setGovernmentIdName('');
                                setGovernmentIdUrl('');
                              }}
                              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                          {governmentIdUrl.startsWith('data:image/') ? (
                            <img
                              src={governmentIdUrl}
                              alt="Government ID preview"
                              className="w-full h-20 object-cover rounded-xl border border-white/60 dark:border-white/12"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-xl px-2 py-1.5">
                              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>PDF attached and ready for Admin review</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label
                          htmlFor="reg-government-id"
                          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-500/50 dark:border-teal-400/35 bg-white/68 dark:bg-slate-950/42 hover:bg-white/88 dark:hover:bg-slate-900/65 px-3 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
                        >
                          <input
                            id="reg-government-id"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploadingDoc !== null}
                            onChange={(e) => void handleDocFileUpload(e, 'gov_id')}
                            className="hidden"
                          />
                          <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-300 shrink-0" />
                          <span>
                            {uploadingDoc === 'gov_id'
                              ? 'Processing file...'
                              : 'Upload Government ID'}
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {role === 'rider' && (
              <div className={`${glassWellClass} p-4 space-y-3.5`}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  3. Delivery Rider Vehicle &amp; Verification
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-veh"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      Vehicle Type *
                    </label>
                    <select
                      id="reg-veh"
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className={`${glassInputClass} dark:[color-scheme:dark]`}
                    >
                      <option value="Motorcycle">Motorcycle</option>
                      <option value="E-Bike / Scooter">E-Bike / Scooter</option>
                      <option value="Car / Sedan">Car / Sedan</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-plate"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5"
                    >
                      LTO Plate Number *
                    </label>
                    <input
                      id="reg-plate"
                      type="text"
                      required
                      placeholder={vehicleType.includes('Car') ? 'e.g., ZMB-4821' : 'e.g., AB-12345 or 342-OBX'}
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value)}
                      className={`${glassInputClass} font-mono uppercase`}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">
                  PH LTO plate required: Motorcycles use 2 letters + 5 digits (AB-12345) or transitional 6-char LTO formats (342-OBX, ABC-123, AB-1234). 4-wheel cars use 3 letters + 4 digits (ZMB-4821).
                </p>

                {/* Required Rider Verification Documents */}
                <div className="rounded-2xl border border-teal-500/35 dark:border-teal-400/25 bg-teal-500/10 dark:bg-teal-400/10 p-3.5 space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Required Rider Verification Documents *
                      </p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300">
                        Admin must inspect your valid Driver&apos;s License ID and Vehicle Registration Document (LTO OR/CR or proof of registration) before approving your courier account. (JPG, PNG, WEBP, or PDF · max 10 MB)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        Valid Driver&apos;s License / ID *
                      </span>
                      {driverLicenseUrl ? (
                        <div className="rounded-2xl border border-emerald-400/50 dark:border-emerald-500/40 bg-white/75 dark:bg-slate-950/55 p-2 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{driverLicenseName}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setDriverLicenseName('');
                                setDriverLicenseUrl('');
                              }}
                              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                          {driverLicenseUrl.startsWith('data:image/') ? (
                            <img
                              src={driverLicenseUrl}
                              alt="Driver's License preview"
                              className="w-full h-20 object-cover rounded-xl border border-white/60 dark:border-white/12"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-xl px-2 py-1.5">
                              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>PDF attached and ready for Admin review</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label
                          htmlFor="reg-rider-license"
                          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-500/50 dark:border-teal-400/35 bg-white/68 dark:bg-slate-950/42 hover:bg-white/88 dark:hover:bg-slate-900/65 px-3 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
                        >
                          <input
                            id="reg-rider-license"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploadingDoc !== null}
                            onChange={(e) => void handleDocFileUpload(e, 'rider_license')}
                            className="hidden"
                          />
                          <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-300 shrink-0" />
                          <span>
                            {uploadingDoc === 'rider_license'
                              ? 'Processing file...'
                              : "Upload Driver's License ID"}
                          </span>
                        </label>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        Vehicle Registration (LTO OR/CR) *
                      </span>
                      {vehicleRegUrl ? (
                        <div className="rounded-2xl border border-emerald-400/50 dark:border-emerald-500/40 bg-white/75 dark:bg-slate-950/55 p-2 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{vehicleRegName}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setVehicleRegName('');
                                setVehicleRegUrl('');
                              }}
                              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                          {vehicleRegUrl.startsWith('data:image/') ? (
                            <img
                              src={vehicleRegUrl}
                              alt="Vehicle Registration Document preview"
                              className="w-full h-20 object-cover rounded-xl border border-white/60 dark:border-white/12"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-xl px-2 py-1.5">
                              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>PDF attached and ready for Admin review</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label
                          htmlFor="reg-rider-vehicle-reg"
                          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-500/50 dark:border-teal-400/35 bg-white/68 dark:bg-slate-950/42 hover:bg-white/88 dark:hover:bg-slate-900/65 px-3 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
                        >
                          <input
                            id="reg-rider-vehicle-reg"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploadingDoc !== null}
                            onChange={(e) => void handleDocFileUpload(e, 'rider_vehicle_reg')}
                            className="hidden"
                          />
                          <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-300 shrink-0" />
                          <span>
                            {uploadingDoc === 'rider_vehicle_reg'
                              ? 'Processing file...'
                              : 'Upload Vehicle Registration'}
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`${glassWellClass} p-3.5 space-y-2`}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  id="reg-policy-ack"
                  type="checkbox"
                  checked={policyAccepted}
                  onChange={(e) => setPolicyAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 accent-teal-600"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                  I have read, understood, and agree to the{' '}
                  <strong className="font-semibold text-slate-950 dark:text-white">
                    MedEx Platform Policies (v{POLICY_VERSION})
                  </strong>{' '}
                  covering Prescription Compliance, Account Verification, Order &amp; Refund Rules, and Data Privacy. *
                </span>
              </label>
              <button
                type="button"
                onClick={() => setPoliciesModalOpen(true)}
                className="text-xs font-semibold text-teal-800 dark:text-teal-300 hover:underline pl-6"
              >
                Read MedEx Platform Policies &rarr;
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-red-400/45 bg-red-500/15 dark:bg-red-500/18 px-3.5 py-2.5 text-xs font-medium text-red-950 dark:text-red-100"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || uploadingDoc !== null}
              className="medex-btn-lift w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-600 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-8px_rgba(13,148,136,0.65),inset_0_1px_0.5px_rgba(255,255,255,0.42)] disabled:opacity-60 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating Account...' : 'Create Account & Continue'}</span>
            </button>
          </form>
        )}
        </div>
      </div>

      <PoliciesModal
        open={policiesModalOpen}
        onClose={() => setPoliciesModalOpen(false)}
        onAcknowledge={() => setPolicyAccepted(true)}
        acknowledgeLabel="I Acknowledge & Accept Policies"
      />
    </div>
  );
};

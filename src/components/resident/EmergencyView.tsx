import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Laptop,
  MapPin,
  Phone,
  PhoneCall,
  QrCode,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { EmergencyAlert, EmergencyHandoffMode } from '../../types/medex';
import {
  buildEmergencyLocationScript,
  formatEmergencyCategoryLabel,
  isMobileEmergencyDevice,
} from '../../utils/medexRules';
import { LeafletMap } from '../common/LeafletMap';

const OLONGAPO_BACKUP_HOTLINES = [
  { label: 'National Emergency', number: '911', note: 'Police · Fire · Medical Rescue' },
  { label: 'Olongapo CDRRMO Rescue', number: '(047) 224-8390', note: 'City Disaster & Ambulance Dispatch' },
  { label: 'Olongapo City PNP', number: '(047) 222-5731', note: 'Police Emergency Desk' },
  { label: 'Olongapo City Fire (BFP)', number: '(047) 222-3043', note: 'Fire & Hazmat Response' },
  { label: 'James L. Gordon Memorial Hospital', number: '(047) 602-1228', note: 'Emergency Room Triage' },
];

export const EmergencyView: React.FC = () => {
  const {
    state,
    currentUser,
    isOnline,
    submitEmergencyAlert,
    setActiveTab,
    syncOfflineQueuedAlerts,
  } = useMedEx();

  const [deviceMode, setDeviceMode] = useState<EmergencyHandoffMode>(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop_qr';
    const hasCoarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    return isMobileEmergencyDevice({
      userAgent: navigator.userAgent || '',
      hasCoarsePointer: hasCoarse,
      viewportWidth: window.innerWidth || 1280,
    })
      ? 'mobile_dialer'
      : 'desktop_qr';
  });

  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [activeHandoffAlert, setActiveHandoffAlert] = useState<EmergencyAlert | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const dialerAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const primaryAddress = useMemo(
    () => state.addresses.find((a) => a.user_id === currentUser.user_id && a.is_primary),
    [state.addresses, currentUser.user_id]
  );

  const primaryBarangay = useMemo(
    () => state.barangays.find((b) => b.barangay_id === primaryAddress?.barangay_id),
    [state.barangays, primaryAddress]
  );

  const userContacts = useMemo(
    () => state.emergencyContacts.filter((c) => c.user_id === currentUser.user_id),
    [state.emergencyContacts, currentUser.user_id]
  );

  const myAlerts = useMemo(
    () => state.alerts.filter((a) => a.user_id === currentUser.user_id),
    [state.alerts, currentUser.user_id]
  );

  // Generate local offline QR code for tel:911
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL('tel:911', {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        window.clearInterval(holdTimerRef.current);
      }
    };
  }, []);

  const stopHold = () => {
    setIsHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const triggerImmediate911Sos = () => {
    const idempotencyKey = `alert-${currentUser.user_id}-${Date.now()}`;
    const targetStatus = isOnline ? 'submitted' : 'queued_offline';
    const res = submitEmergencyAlert(targetStatus, idempotencyKey, deviceMode);

    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Could not submit 911 SOS alert.' });
      return;
    }

    if (res.data) {
      setActiveHandoffAlert(res.data);
    }

    if (deviceMode === 'mobile_dialer') {
      try {
        // Attempt native phone dialer pre-filled with 911 on mobile browsers
        if (typeof navigator !== 'undefined' && !navigator.webdriver) {
          dialerAnchorRef.current?.click();
        }
      } catch {
        // Backup Call 911 button remains visible right on screen
      }
      setFeedback({
        type: isOnline ? 'success' : 'info',
        text: isOnline
          ? `911 SOS ${res.data?.reference_code} logged! Opening Phone dialer with 911 ready.`
          : `No signal: 911 SOS ${res.data?.reference_code} queued offline. Cellular 911 call is still available below.`,
      });
    } else {
      setFeedback({
        type: isOnline ? 'success' : 'info',
        text: isOnline
          ? `911 SOS ${res.data?.reference_code} logged! Scan the QR code with your phone camera to open 911 in your Phone dialer.`
          : `No signal: 911 SOS ${res.data?.reference_code} queued offline. Scan the offline QR code with your phone to dial 911.`,
      });
    }
  };

  const startHold = () => {
    setFeedback(null);
    if (!primaryAddress) {
      setFeedback({
        type: 'error',
        text: 'No primary address found. Add a saved Olongapo address in Account before activating 911 SOS.',
      });
      return;
    }
    if (isHolding) return;
    setIsHolding(true);
    const start = Date.now();
    const durationMs = 2000; // 2-second press-and-hold; triggers immediately with zero countdown
    holdTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        stopHold();
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.([120, 60, 120]);
        }
        triggerImmediate911Sos();
      }
    }, 40);
  };

  const latestActiveAlert = activeHandoffAlert || myAlerts[0] || null;
  const queuedCount = myAlerts.filter((a) => a.status === 'queued_offline').length;

  const locationScript = useMemo(() => {
    const addrText = primaryAddress
      ? `${primaryAddress.street}${primaryBarangay ? `, Brgy. ${primaryBarangay.name}, ${primaryBarangay.city}` : ''}`
      : activeHandoffAlert?.address_snapshot || 'Olongapo City';
    return buildEmergencyLocationScript({
      callerName: `${currentUser.first_name} ${currentUser.last_name}`,
      phone: currentUser.phone_number,
      addressSnapshot: addrText,
      landmark: primaryAddress?.landmark,
      latitude: activeHandoffAlert?.latitude ?? primaryAddress?.latitude ?? 14.8315,
      longitude: activeHandoffAlert?.longitude ?? primaryAddress?.longitude ?? 120.2835,
      referenceCode: activeHandoffAlert?.reference_code,
    });
  }, [activeHandoffAlert, currentUser, primaryAddress, primaryBarangay]);

  const handleCopyLocationScript = async () => {
    try {
      await navigator.clipboard.writeText(locationScript);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setFeedback({
        type: 'info',
        text: 'Clipboard access blocked—please read the location script shown below directly to 911.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden native tel:911 anchor for mobile dialer launch */}
      <a ref={dialerAnchorRef} href="tel:911" className="hidden" aria-hidden="true" tabIndex={-1}>
        Dial 911
      </a>

      <div className="medex-glass rounded-2xl border p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            911 Emergency SOS
          </h1>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
            Press and hold for 2 seconds to trigger an immediate general 911 call handoff and log
            your Olongapo City location (no countdown delay).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Device Handoff Mode Switch */}
          <div
            role="group"
            aria-label="Emergency call handoff mode"
            className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-1 shadow-xs"
          >
            <button
              type="button"
              onClick={() => setDeviceMode('desktop_qr')}
              aria-pressed={deviceMode === 'desktop_qr'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                deviceMode === 'desktop_qr'
                  ? 'bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              Desktop QR
            </button>
            <button
              type="button"
              onClick={() => setDeviceMode('mobile_dialer')}
              aria-pressed={deviceMode === 'mobile_dialer'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                deviceMode === 'mobile_dialer'
                  ? 'bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Mobile Dialer
            </button>
          </div>

          {queuedCount > 0 && isOnline && (
            <button
              type="button"
              onClick={() => syncOfflineQueuedAlerts()}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap"
            >
              Sync {queuedCount} Queued Alert(s)
            </button>
          )}
        </div>
      </div>

      {!primaryAddress && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-900 dark:text-red-200">
            A primary residential address is required before activating the 911 emergency trigger.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className="rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white whitespace-nowrap"
          >
            Add Primary Address
          </button>
        </div>
      )}

      {userContacts.length === 0 && primaryAddress && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <span>Tip: Add at least one emergency contact in your profile before your first alert.</span>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className="font-semibold underline whitespace-nowrap"
          >
            Add Emergency Contact
          </button>
        </div>
      )}

      {feedback && (
        <div
          role="alert"
          className={`rounded-xl border p-4 text-sm ${
            feedback.type === 'error'
              ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
              : feedback.type === 'success'
                ? 'border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
                : 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Unified 911 SOS Hold Trigger + Post-Hold Device Handoff */}
        <div className="lg:col-span-6 medex-glass rounded-2xl border p-6 space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                General 911 Emergency Call
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {deviceMode === 'mobile_dialer'
                  ? 'Mobile mode: Logs SOS and opens your Phone dialer with 911 pre-filled.'
                  : 'Desktop mode: Logs SOS and reveals a scannable 911 QR code + location card.'}
              </p>
            </div>
            {activeHandoffAlert && (
              <button
                type="button"
                onClick={() => setActiveHandoffAlert(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Trigger
              </button>
            )}
          </div>

          {activeHandoffAlert ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5 border-y border-slate-200/80 dark:border-slate-800 py-5"
            >
              {deviceMode === 'desktop_qr' ? (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/35 p-4">
                    <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm border border-slate-200 text-center">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="Scan this QR code with your phone camera to dial 911"
                          className="w-40 h-40 object-contain mx-auto"
                        />
                      ) : (
                        <div className="w-40 h-40 flex items-center justify-center bg-slate-100 text-slate-600 text-xs">
                          <QrCode className="w-8 h-8" />
                        </div>
                      )}
                      <span className="mt-1.5 block font-mono text-[11px] font-bold text-slate-900">
                        tel:911
                      </span>
                    </div>

                    <div className="space-y-2.5 text-center sm:text-left">
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white uppercase tracking-wide">
                        <QrCode className="w-3.5 h-3.5" />
                        Scan to Call 911
                      </div>
                      <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        Point your phone camera at this QR code
                      </h2>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        Tap the phone banner on your smartphone to open your dialer with{' '}
                        <strong className="font-mono">911</strong> already filled in—then tap Call.
                      </p>
                      <div className="pt-1">
                        <a
                          href="tel:911"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 underline hover:opacity-85"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          Or call via paired laptop app (Phone Link / Continuity)
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Operator Read-Aloud Olongapo Location Script */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/75 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                        <MapPin className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>Read-Aloud Location Script for 911 Operator</span>
                        <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          · {activeHandoffAlert.reference_code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLocationScript}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-teal-400 whitespace-nowrap"
                      >
                        {copiedScript ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied Info
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy Location &amp; Info
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3 leading-relaxed">
                      {locationScript}
                    </pre>
                  </div>
                </div>
              ) : (
                /* Mobile Dialer Handoff Card */
                <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/85 dark:bg-red-950/45 p-4 text-center space-y-3">
                  <div className="w-11 h-11 mx-auto rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md">
                    <PhoneCall className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-mono text-[11px] font-bold text-red-700 dark:text-red-300">
                      {activeHandoffAlert.reference_code} · 911 SOS ACTIVE
                    </p>
                    <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                      Ready to Call 911
                    </h2>
                    <p className="text-xs text-slate-700 dark:text-slate-300 max-w-sm mx-auto">
                      Your phone dialer should open with <strong className="font-mono">911</strong>{' '}
                      pre-filled. If it did not open automatically, tap the button below.
                    </p>
                  </div>
                  <a
                    href="tel:911"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-red-600 hover:bg-red-700 px-6 py-3 text-sm font-bold text-white shadow-md transition-colors min-h-[46px]"
                  >
                    <Phone className="w-4 h-4" />
                    Tap to Call 911 Now
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyLocationScript}
                    className="block mx-auto text-xs font-semibold text-slate-700 dark:text-slate-300 underline"
                  >
                    {copiedScript ? 'Copied Olongapo address to clipboard' : 'Copy Olongapo address for call'}
                  </button>
                </div>
              )}

              {/* Olongapo City Backup Hotlines & Emergency Contacts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-900/55 p-3.5 space-y-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Olongapo Backup Hotlines
                  </p>
                  <ul className="space-y-1.5 text-[11px]">
                    {OLONGAPO_BACKUP_HOTLINES.map((h) => (
                      <li key={h.label} className="flex items-center justify-between gap-2">
                        <span className="text-slate-700 dark:text-slate-300 truncate">{h.label}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white shrink-0">
                          {h.number}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/70 dark:bg-slate-900/55 p-3.5 space-y-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Saved Emergency Contacts ({userContacts.length})
                  </p>
                  {userContacts.length === 0 ? (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      No personal contacts added yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-[11px]">
                      {userContacts.map((c) => (
                        <li key={c.contact_id} className="flex items-center justify-between gap-2">
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {c.contact_name} ({c.relationship})
                          </span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white shrink-0">
                            {c.phone_number}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            /* Idle: 2-Second Press-and-Hold 911 SOS Ring (Zero Countdown) */
            <div className="flex flex-col items-center justify-center py-8 border-y border-slate-100 dark:border-slate-800">
              <div className="text-center space-y-4">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="w-48 h-48 -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
                    <circle
                      cx="80"
                      cy="80"
                      r="72"
                      fill="none"
                      className="stroke-slate-200 dark:stroke-slate-700"
                      strokeWidth="10"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="72"
                      fill="none"
                      stroke="#DC2626"
                      strokeWidth="10"
                      strokeDasharray={2 * Math.PI * 72}
                      strokeDashoffset={2 * Math.PI * 72 * (1 - holdProgress / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <button
                    type="button"
                    onMouseDown={startHold}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={startHold}
                    onTouchEnd={stopHold}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isHolding) {
                        e.preventDefault();
                        startHold();
                      }
                    }}
                    onKeyUp={stopHold}
                    className="absolute w-36 h-36 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white font-display font-bold text-sm flex flex-col items-center justify-center shadow-xl transition-transform select-none cursor-pointer"
                    aria-label="Hold for 2 seconds to trigger 911 emergency SOS"
                  >
                    <AlertTriangle className="w-7 h-7 mb-1" />
                    <span>{isHolding ? 'HOLDING...' : 'HOLD 2s'}</span>
                    <span className="text-xs font-semibold opacity-95 mt-0.5">911 SOS</span>
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  {deviceMode === 'mobile_dialer'
                    ? 'Short taps are ignored to prevent accidental calls. Triggers immediately after 2 seconds—opens your Phone dialer with 911 ready.'
                    : 'Short taps are ignored to prevent accidental alerts. Triggers immediately after 2 seconds—logs your Olongapo SOS and displays the 911 QR code for your phone.'}
                </p>
              </div>
            </div>
          )}

          {primaryAddress && (
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Saved Primary Alert Address
              </div>
              <div>
                {primaryAddress.street}, Brgy. {primaryBarangay?.name}, {primaryBarangay?.city}
              </div>
              {primaryAddress.landmark && <div>Landmark: {primaryAddress.landmark}</div>}
            </div>
          )}
        </div>

        {/* Right: Verification Status, Tracking Map & Alert History */}
        <div className="lg:col-span-6 space-y-6">
          <div className="medex-glass rounded-2xl border p-6 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Emergency Dispatch Status
            </h2>
            {latestActiveAlert?.verification?.decision === 'genuine' ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-sm text-teal-800 dark:text-teal-300">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Genuine 911 Emergency Verified</p>
                    <p className="text-xs text-teal-700 dark:text-teal-400 mt-0.5">
                      Alert <span className="font-mono">{latestActiveAlert.reference_code}</span>{' '}
                      confirmed by {latestActiveAlert.verification.verified_by_name}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('locator')}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
                >
                  Locate Nearest Open Pharmacy
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Your Olongapo barangay location and saved emergency contacts are logged immediately
                once the 2-second hold completes—with no countdown delay.
              </p>
            )}
          </div>

          {latestActiveAlert && (
            <div className="medex-glass rounded-2xl border p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Latest Alert Location
                </h2>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {latestActiveAlert.reference_code}
                </span>
              </div>
              <LeafletMap
                markers={[
                  {
                    id: `alert-${latestActiveAlert.alert_id}`,
                    lat: latestActiveAlert.latitude,
                    lng: latestActiveAlert.longitude,
                    title: formatEmergencyCategoryLabel(latestActiveAlert.category),
                    subtitle: latestActiveAlert.address_snapshot,
                    variant: 'emergency',
                  },
                ]}
                heightClass="h-48"
                ariaLabel="Emergency Alert Location Map"
              />
            </div>
          )}

          {/* Alert History */}
          <div className="medex-glass rounded-2xl border p-6 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Emergency Alert History ({myAlerts.length})
            </h2>
            {myAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No emergency alerts recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {myAlerts.map((a) => (
                  <div key={a.alert_id} className="py-3 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {a.reference_code}
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {formatEmergencyCategoryLabel(a.category)} · {a.status.replace('_', ' ')}
                        {a.verification ? ` (${a.verification.decision.replace('_', ' ')})` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {a.address_snapshot}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

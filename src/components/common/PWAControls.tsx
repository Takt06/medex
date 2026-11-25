import React, { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

interface PWAInstallButtonProps {
  darkSurface?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ darkSurface = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  const btnClasses = darkSurface
    ? 'inline-flex items-center gap-1.5 rounded-xl border border-white/22 bg-white/12 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.24)] transition-all whitespace-nowrap shrink-0 min-h-[38px]'
    : 'medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105 transition-all whitespace-nowrap shrink-0 min-h-[36px]';

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={btnClasses}
      >
        <Download className={`w-3.5 h-3.5 ${darkSurface ? 'text-teal-300' : 'text-teal-700 dark:text-teal-400'}`} />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={btnClasses}
        >
          <Download className="w-3.5 h-3.5" />
          Install on iOS
        </button>
        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl medex-glass p-6 shadow-2xl border">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Install MedEx on iPhone or iPad
              </h3>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-900 dark:bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-teal-500"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={btnClasses}
      >
        <Download className="w-3.5 h-3.5" />
        Install PWA
      </button>
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl medex-glass p-6 shadow-2xl border">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Install MedEx Progressive Web App
            </h3>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Open your browser menu or address bar install icon and choose{' '}
              <strong>Install MedEx</strong> for offline emergency alert queuing and standalone launch.
            </p>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 dark:bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-teal-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const { isOnline, state, syncOfflineQueuedAlerts } = useMedEx();
  const queuedCount = state.alerts.filter((a) => a.status === 'queued_offline').length;

  if (isOnline && queuedCount === 0) return null;

  return (
    <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-center gap-3">
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            Offline Mode — Cached pharmacy catalog active. Emergency alerts will queue locally and
            transmit automatically once reconnected.
          </span>
        </>
      ) : (
        <>
          <span>
            Connection restored — {queuedCount} queued emergency alert(s) ready to send.
          </span>
          <button
            type="button"
            onClick={() => syncOfflineQueuedAlerts()}
            className="rounded-md bg-white px-2.5 py-1 text-amber-900 font-semibold hover:bg-amber-50"
          >
            Sync Now
          </button>
        </>
      )}
    </div>
  );
};

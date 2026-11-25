import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import { MedExLogo } from './MedExLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const duration = prefersReduced ? 450 : 2100;
    const timer = window.setTimeout(() => {
      onFinish();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [onFinish, prefersReduced]);

  return (
    <motion.div
      key="medex-splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 medex-ambient-canvas flex flex-col items-center justify-center p-6 overflow-hidden"
      aria-label="MedEx Loading Entrance"
    >
      {/* Ambient MedEx Teal & Sky glow orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-20 w-[28rem] h-[28rem] rounded-full bg-teal-400/28 dark:bg-teal-500/24 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-sky-400/24 dark:bg-cyan-500/18 blur-3xl"
      />

      {/* Centered Frosted Glass Emblem Card */}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative medex-glass rounded-3xl border border-teal-200/80 dark:border-teal-500/25 shadow-2xl shadow-teal-950/10 dark:shadow-black/60 px-8 py-10 sm:px-14 sm:py-12 max-w-md w-full text-center space-y-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 320,
            damping: 22,
            delay: 0.04,
          }}
          className="inline-flex items-center justify-center p-3.5 rounded-3xl bg-white/90 dark:bg-slate-950/80 border border-teal-100 dark:border-slate-700/80 shadow-xl shadow-teal-900/10"
        >
          <MedExLogo size={72} showWordmark={false} />
        </motion.div>

        <div className="space-y-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Med<span className="text-teal-600 dark:text-teal-400">Ex</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300"
          >
            Pharmacy &amp; Urgent Care Network
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, delay: 0.24 }}
            className="pt-1 flex items-center justify-center gap-3 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Olongapo City
            </span>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Verified Care
            </span>
          </motion.div>
        </div>

        {/* Sleek Animated Progress Sweep */}
        <div className="space-y-3 pt-1">
          <div className="h-1.5 w-full rounded-full bg-slate-200/90 dark:bg-slate-800/90 overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: prefersReduced ? 0.35 : 1.75,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ transformOrigin: 'left' }}
              className="h-full w-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-600"
            />
          </div>

          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            onClick={onFinish}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300 transition-colors py-1"
          >
            <span>Enter MedEx Storefront</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

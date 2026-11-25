import React from 'react';
import { motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';

interface ThemeToggleProps {
  compact?: boolean;
  darkSurface?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  compact = false,
  darkSurface = false,
}) => {
  const { theme, toggleTheme } = useMedEx();
  const isDark = theme === 'dark';

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={
        darkSurface
          ? 'inline-flex items-center gap-1.5 rounded-xl border border-white/22 bg-white/12 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.24)] transition-all whitespace-nowrap shrink-0 min-h-[38px]'
          : 'medex-glass-subtle inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:brightness-105 transition-all whitespace-nowrap shrink-0 min-h-[36px]'
      }
    >
      <motion.span
        key={theme}
        initial={{ rotate: -25, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="inline-flex items-center justify-center"
      >
        {isDark ? (
          <Sun className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Moon className={`w-3.5 h-3.5 ${darkSurface ? 'text-teal-300' : 'text-slate-700'}`} />
        )}
      </motion.span>
      {!compact && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
    </motion.button>
  );
};

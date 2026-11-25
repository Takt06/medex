import React from 'react';

interface MedExLogoProps {
  size?: number;
  showWordmark?: boolean;
  darkSurface?: boolean;
}

export const MedExLogo: React.FC<MedExLogoProps> = ({
  size = 28,
  showWordmark = true,
  darkSurface = false,
}) => {
  const iconSize = Math.max(24, size);
  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="rounded-[22%] dark:ring-1 dark:ring-slate-700"
      >
        <rect width="64" height="64" rx="14" fill="#0F172A" />
        <rect x="8" y="26" width="11" height="3.2" rx="1.6" fill="#14B8A6" />
        <rect x="11" y="34" width="8.5" height="3.2" rx="1.6" fill="#0D9488" />
        <g transform="translate(36 32) rotate(45)">
          <rect x="-17" y="-4.5" width="34" height="9" rx="4.5" fill="#FFFFFF" />
          <path d="M0 -4.5 H12.5 A4.5 4.5 0 0 1 17 0 A4.5 4.5 0 0 1 12.5 4.5 H0 Z" fill="#14B8A6" />
        </g>
        <g transform="translate(36 32) rotate(-45)">
          <rect
            x="-17"
            y="-4.5"
            width="34"
            height="9"
            rx="4.5"
            fill="#0D9488"
            stroke="#0F172A"
            strokeWidth="1.5"
          />
          <path d="M0 -4.5 H12.5 A4.5 4.5 0 0 1 17 0 A4.5 4.5 0 0 1 12.5 4.5 H0 Z" fill="#FFFFFF" />
        </g>
      </svg>
      {showWordmark && (
        <span
          className={`font-display text-lg font-bold tracking-tight ${
            darkSurface ? 'text-white' : 'text-slate-900 dark:text-white'
          }`}
        >
          MedEx
        </span>
      )}
    </span>
  );
};

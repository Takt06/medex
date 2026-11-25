import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  MEDEX_POLICY_SECTIONS,
  POLICY_LAST_UPDATED,
  POLICY_PDF_URL,
  POLICY_SUPPORT_EMAIL,
  POLICY_VERSION,
} from '../../data/policiesData';

interface PoliciesModalProps {
  open: boolean;
  onClose: () => void;
  acceptedAt?: string;
  acceptedVersion?: string;
  onAcknowledge?: () => void;
  acknowledgeLabel?: string;
}

export const PoliciesModal: React.FC<PoliciesModalProps> = ({
  open,
  onClose,
  acceptedAt,
  acceptedVersion,
  onAcknowledge,
  acknowledgeLabel = 'I Have Read & Acknowledge MedEx Policies',
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>(MEDEX_POLICY_SECTIONS[0].id);

  if (!open) return null;

  const activeSection =
    MEDEX_POLICY_SECTIONS.find((s) => s.id === activeSectionId) || MEDEX_POLICY_SECTIONS[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="medex-policies-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-3 sm:p-5 overflow-y-auto"
    >
      <div className="medex-glass w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200/70 dark:border-slate-800/80 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                MedEx Platform Policies v{POLICY_VERSION}
              </span>
              {acceptedAt && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Acknowledged {new Date(acceptedAt).toLocaleDateString()}
                  {acceptedVersion ? ` (v${acceptedVersion})` : ''}
                </span>
              )}
            </div>
            <h2
              id="medex-policies-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white"
            >
              MedEx Olongapo City — Platform Policies &amp; User Guidelines
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Updated {POLICY_LAST_UPDATED} · Applies to Residents, Partner Pharmacies, and Delivery Riders
            </p>
          </div>

          <button
            type="button"
            aria-label="Close policies dialog"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: Sidebar Navigation + Section Content */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <nav
            aria-label="Policy sections"
            className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200/70 dark:border-slate-800/80 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto bg-slate-50/50 dark:bg-slate-950/30"
          >
            {MEDEX_POLICY_SECTIONS.map((sec) => {
              const isActive = sec.id === activeSection.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`text-left rounded-xl px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap md:whitespace-normal shrink-0 flex items-center gap-2 ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {sec.number}
                  </span>
                  <span className="truncate">{sec.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Section {activeSection.number} of {MEDEX_POLICY_SECTIONS.length}
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {activeSection.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {activeSection.subtitle}
              </p>
            </div>

            <div className="space-y-3">
              {activeSection.items.map((item) => (
                <div
                  key={item.heading}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-slate-900/60 p-4 space-y-1"
                >
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.heading}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Mail className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>
                  Questions or policy support:{' '}
                  <strong className="text-slate-900 dark:text-white">{POLICY_SUPPORT_EMAIL}</strong>
                </span>
              </div>
              <a
                href={POLICY_PDF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 px-3 py-1.5 font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open Full Official PDF</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200/70 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Using MedEx confirms your acknowledgment of these policies across ordering, Rx review, and partner verification.
          </p>
          <div className="flex items-center gap-2">
            {onAcknowledge && (
              <button
                type="button"
                onClick={() => {
                  onAcknowledge();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{acknowledgeLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

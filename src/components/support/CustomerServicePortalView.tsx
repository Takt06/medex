import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Headphones,
  MessageSquare,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useMedEx } from '../../context/MedExContext';
import type { ProblemReportStatus, ReturnRefundStatus } from '../../types/medex';
import { formatPHP } from '../../utils/medexRules';
import type { CustomerServiceSection } from '../layout/RoleDashboards';

interface CustomerServicePortalViewProps {
  section: CustomerServiceSection;
}

const CATEGORY_TAGS = [
  'Product Issue',
  'Delivery Delay',
  'Store Conduct',
  'Refund Dispute',
  'App / Technical',
  'Billing / Payment',
];

export const CustomerServicePortalView: React.FC<CustomerServicePortalViewProps> = ({
  section,
}) => {
  const {
    state,
    hasCurrentPermission,
    updateProblemReportStatus,
    moderatePharmacyReview,
    resolveReturnAsCS,
  } = useMedEx();

  const canManageCS = hasCurrentPermission('complaints:manage_cs');
  const canResolveReturns = hasCurrentPermission('returns:resolve_dispute');
  const canModerateReviews = hasCurrentPermission('feedback:moderate');

  const [ticketFilter, setTicketFilter] = useState<
    'all' | 'open' | 'acknowledged' | 'escalated' | 'resolved' | 'dismissed'
  >('all');
  const [returnFilter, setReturnFilter] = useState<'all' | 'escalated' | 'open' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [noteByReport, setNoteByReport] = useState<Record<number, string>>({});
  const [csNotesByReport, setCsNotesByReport] = useState<Record<number, string>>({});
  const [tagByReport, setTagByReport] = useState<Record<number, string>>({});

  const [csReturnNotes, setCsReturnNotes] = useState<Record<number, string>>({});
  const [csReturnResolution, setCsReturnResolution] = useState<Record<number, string>>({});
  const [csApprovedAmount, setCsApprovedAmount] = useState<Record<number, string>>({});
  const [reviewModerationReason, setReviewModerationReason] = useState<Record<number, string>>({});

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const stats = useMemo(() => {
    const open = state.problemReports.filter(
      (r) => r.status === 'open' || r.status === 'acknowledged'
    ).length;
    const escalated = state.problemReports.filter((r) => r.status === 'escalated').length;
    const resolved = state.problemReports.filter((r) => r.status === 'resolved').length;
    const pendingDisputes = state.returnRequests.filter(
      (r) => r.status === 'escalated' || r.status === 'store_rejected' || r.status === 'requested'
    ).length;
    return { open, escalated, resolved, pendingDisputes };
  }, [state.problemReports, state.returnRequests]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...state.problemReports]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((r) => {
        if (ticketFilter !== 'all' && r.status !== ticketFilter) return false;
        if (!q) return true;
        const merchant = state.merchants.find((m) => m.merchant_id === r.merchant_id);
        return (
          r.reference_code.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.category_code.toLowerCase().includes(q) ||
          (merchant?.shop_name || '').toLowerCase().includes(q)
        );
      });
  }, [state.problemReports, state.merchants, ticketFilter, searchQuery]);

  const filteredReturns = useMemo(() => {
    return [...state.returnRequests]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((ret) => {
        if (returnFilter === 'escalated') return ret.status === 'escalated';
        if (returnFilter === 'open') {
          return (
            ret.status === 'requested' ||
            ret.status === 'store_rejected' ||
            ret.status === 'escalated'
          );
        }
        if (returnFilter === 'closed') {
          return (
            ret.status === 'refunded' ||
            ret.status === 'cs_resolved' ||
            ret.status === 'cs_dismissed'
          );
        }
        return true;
      });
  }, [state.returnRequests, returnFilter]);

  const handleReportTransition = (reportId: number, nextStatus: ProblemReportStatus) => {
    const report = state.problemReports.find((r) => r.report_id === reportId);
    if (!report) return;
    const replyNote = noteByReport[reportId]?.trim() || report.resolution_note || `Updated by CS to ${nextStatus}.`;
    const internalCsNotes = csNotesByReport[reportId] ?? report.cs_notes ?? '';
    const tag = tagByReport[reportId] ?? report.category_tag ?? '';
    const res = updateProblemReportStatus(
      reportId,
      nextStatus,
      replyNote,
      undefined,
      internalCsNotes,
      tag
    );
    setFeedback(
      res.ok
        ? { ok: true, text: `Ticket ${report.reference_code} marked ${nextStatus}.` }
        : { ok: false, text: res.error || 'Could not update ticket status.' }
    );
  };

  const handleReturnDecision = async (returnId: number, status: ReturnRefundStatus) => {
    const ret = state.returnRequests.find((r) => r.return_id === returnId);
    if (!ret) return;
    setBusyKey(`ret-${returnId}`);
    setFeedback(null);
    const amountRaw = csApprovedAmount[returnId];
    const approvedAmount =
      amountRaw !== undefined && amountRaw.trim() !== ''
        ? Number(amountRaw)
        : ret.requested_refund_amount;

    const res = await resolveReturnAsCS(returnId, {
      status,
      csNotes: csReturnNotes[returnId] ?? ret.cs_notes ?? undefined,
      resolutionNote:
        csReturnResolution[returnId]?.trim() ||
        (status === 'cs_resolved'
          ? 'Customer Service approved refund escalation.'
          : 'Customer Service dismissed dispute after review.'),
      approvedAmount: status === 'cs_resolved' ? approvedAmount : 0,
    });
    setBusyKey(null);
    setFeedback(
      res.ok
        ? { ok: true, text: `Return ${ret.reference_code} updated to ${status.replace(/_/g, ' ')}.` }
        : { ok: false, text: res.error || 'Failed to resolve return dispute.' }
    );
  };

  const handleModerateReview = (reviewId: number, nextStatus: 'visible' | 'hidden') => {
    const reason =
      reviewModerationReason[reviewId]?.trim() ||
      (nextStatus === 'hidden'
        ? 'Hidden by Customer Service for policy/privacy review.'
        : 'Restored by Customer Service after review.');
    const res = moderatePharmacyReview(reviewId, nextStatus, reason);
    setFeedback(
      res.ok
        ? { ok: true, text: `Review #${reviewId} set to ${nextStatus}.` }
        : { ok: false, text: res.error || 'Could not moderate review.' }
    );
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Open / Acknowledged
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {stats.open}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Escalated to CS
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums">
            {stats.escalated}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Return Disputes
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums">
            {stats.pendingDisputes}
          </p>
        </div>
        <div className="medex-glass rounded-2xl border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Resolved Tickets
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {stats.resolved}
          </p>
        </div>
      </section>

      {feedback && (
        <div
          role={feedback.ok ? 'status' : 'alert'}
          className={`rounded-2xl border px-4 py-3 text-xs font-medium flex items-center gap-2 ${
            feedback.ok
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100'
              : 'border-red-400/45 bg-red-500/15 text-red-950 dark:text-red-100'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {section === 'complaints' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Headphones className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Complaints, Store Escalations &amp; Ticket Triage</span>
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Track store first-line responses, tag complaints, add internal CS notes, and resolve escalations.
              </p>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ref code, store, keyword..."
                className="w-full rounded-xl border border-white/65 dark:border-white/15 bg-white/70 dark:bg-slate-950/45 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'escalated', 'open', 'acknowledged', 'resolved', 'dismissed'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTicketFilter(st)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize ${
                    ticketFilter === st
                      ? 'bg-teal-600 text-white border-teal-500'
                      : 'medex-glass-subtle text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>

          {filteredReports.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              No complaints or escalations match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((r) => {
                const merchant = state.merchants.find((m) => m.merchant_id === r.merchant_id);
                const resident = state.users.find((u) => u.user_id === r.user_id);
                const order = state.orders.find((o) => o.order_id === r.order_id);
                return (
                  <article key={r.report_id} className="medex-glass rounded-2xl border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {r.reference_code}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              r.status === 'escalated'
                                ? 'bg-red-500/20 text-red-800 dark:text-red-200'
                                : r.status === 'resolved'
                                  ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                            }`}
                          >
                            {r.status}
                          </span>
                          <span className="rounded-md bg-white/60 dark:bg-slate-900/50 border border-white/50 dark:border-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                            Source: {r.source} · {r.category_code}
                          </span>
                          {r.store_responded_at ? (
                            <span className="rounded-md bg-teal-500/15 text-teal-800 dark:text-teal-200 px-2 py-0.5 text-[11px] font-semibold">
                              Store Responded
                            </span>
                          ) : (
                            r.merchant_id && (
                              <span className="rounded-md bg-slate-500/15 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-[11px]">
                                Awaiting Store Response
                              </span>
                            )
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Customer:{' '}
                          {r.is_anonymous
                            ? 'Anonymous Resident'
                            : resident
                              ? `${resident.first_name} ${resident.last_name}`
                              : `User #${r.user_id}`}
                          {merchant ? ` · Store: ${merchant.shop_name}` : ''}
                          {order ? ` · Order: ${order.order_code}` : ''}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 dark:text-slate-100 rounded-xl medex-glass-subtle border p-3">
                      {r.description}
                    </p>

                    {r.escalated_reason && (
                      <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-2.5 text-xs text-red-900 dark:text-red-100">
                        <strong>Escalation Reason:</strong> {r.escalated_reason}
                      </div>
                    )}

                    {canManageCS && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                        <select
                          aria-label={`Category tag for ${r.reference_code}`}
                          value={tagByReport[r.report_id] ?? r.category_tag ?? ''}
                          onChange={(e) =>
                            setTagByReport((prev) => ({
                              ...prev,
                              [r.report_id]: e.target.value,
                            }))
                          }
                          className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="">Select CS Category Tag...</option>
                          {CATEGORY_TAGS.map((tag) => (
                            <option key={tag} value={tag}>
                              {tag}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={csNotesByReport[r.report_id] ?? r.cs_notes ?? ''}
                          onChange={(e) =>
                            setCsNotesByReport((prev) => ({
                              ...prev,
                              [r.report_id]: e.target.value,
                            }))
                          }
                          placeholder="Internal CS investigation notes..."
                          className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={noteByReport[r.report_id] ?? r.resolution_note ?? ''}
                          onChange={(e) =>
                            setNoteByReport((prev) => ({
                              ...prev,
                              [r.report_id]: e.target.value,
                            }))
                          }
                          placeholder="Customer-facing resolution / reply..."
                          className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    {canManageCS && r.status !== 'resolved' && r.status !== 'dismissed' && (
                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        {r.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => handleReportTransition(r.report_id, 'acknowledged')}
                            className="rounded-xl medex-glass-subtle border px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReportTransition(r.report_id, 'resolved')}
                          className="rounded-xl bg-teal-600 hover:bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Resolve Complaint
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportTransition(r.report_id, 'dismissed')}
                          className="rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === 'returns' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Return &amp; Refund Disputes</span>
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Review store-rejected or escalated return requests and issue final CS refund resolutions.
              </p>
            </div>
            <div className="flex gap-2">
              {(['all', 'escalated', 'open', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setReturnFilter(f)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize ${
                    returnFilter === f
                      ? 'bg-teal-600 text-white border-teal-500'
                      : 'medex-glass-subtle text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredReturns.length === 0 ? (
            <div className="medex-glass rounded-2xl border p-8 text-center text-xs text-slate-600 dark:text-slate-300">
              No return or refund requests match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReturns.map((ret) => {
                const order = state.orders.find((o) => o.order_id === ret.order_id);
                const merchant = state.merchants.find((m) => m.merchant_id === ret.merchant_id);
                const resident = state.users.find((u) => u.user_id === ret.resident_id);
                const isClosed =
                  ret.status === 'refunded' ||
                  ret.status === 'cs_resolved' ||
                  ret.status === 'cs_dismissed';
                return (
                  <article key={ret.return_id} className="medex-glass rounded-2xl border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {ret.reference_code}
                          </span>
                          <span className="rounded-md bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[11px] font-semibold uppercase text-teal-800 dark:text-teal-200">
                            {ret.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            Reason: {ret.reason_code.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300">
                          Order: <strong>{order?.order_code || `#${ret.order_id}`}</strong> · Store:{' '}
                          <strong>{merchant?.shop_name || 'Pharmacy'}</strong> · Customer:{' '}
                          <strong>
                            {resident ? `${resident.first_name} ${resident.last_name}` : 'Resident'}
                          </strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          Requested: {formatPHP(ret.requested_refund_amount)}
                        </p>
                        {ret.approved_refund_amount !== null && ret.approved_refund_amount !== undefined && (
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                            Approved: {formatPHP(ret.approved_refund_amount)}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-800 dark:text-slate-100 rounded-xl medex-glass-subtle border p-3">
                      {ret.description}
                    </p>

                    {ret.store_response_note && (
                      <div className="rounded-xl medex-glass-subtle border p-2.5 text-xs text-slate-700 dark:text-slate-200">
                        <strong>Store Response:</strong> {ret.store_response_note}
                      </div>
                    )}

                    {canResolveReturns && !isClosed && (
                      <div className="space-y-2.5 pt-1">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={`Approved ₱ (${ret.requested_refund_amount})`}
                            value={csApprovedAmount[ret.return_id] ?? String(ret.requested_refund_amount)}
                            onChange={(e) =>
                              setCsApprovedAmount((prev) => ({
                                ...prev,
                                [ret.return_id]: e.target.value,
                              }))
                            }
                            className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Internal CS dispute notes..."
                            value={csReturnNotes[ret.return_id] ?? ret.cs_notes ?? ''}
                            onChange={(e) =>
                              setCsReturnNotes((prev) => ({
                                ...prev,
                                [ret.return_id]: e.target.value,
                              }))
                            }
                            className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Final CS resolution note to customer/store..."
                            value={csReturnResolution[ret.return_id] ?? ret.cs_resolution_note ?? ''}
                            onChange={(e) =>
                              setCsReturnResolution((prev) => ({
                                ...prev,
                                [ret.return_id]: e.target.value,
                              }))
                            }
                            className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyKey === `ret-${ret.return_id}`}
                            onClick={() => void handleReturnDecision(ret.return_id, 'cs_resolved')}
                            className="rounded-xl bg-teal-600 hover:bg-teal-500 px-3.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Approve CS Refund
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `ret-${ret.return_id}`}
                            onClick={() => void handleReturnDecision(ret.return_id, 'cs_dismissed')}
                            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Dismiss Dispute
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === 'reviews' && (
        <section className="space-y-4">
          <div className="medex-glass rounded-2xl border p-4">
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>Pharmacy Reviews Moderation</span>
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Monitor customer store reviews and hide or restore reviews violating privacy or conduct rules.
            </p>
          </div>

          <div className="space-y-3">
            {state.pharmacyReviews.map((rev) => {
              const merchant = state.merchants.find((m) => m.merchant_id === rev.merchant_id);
              return (
                <article key={rev.review_id} className="medex-glass rounded-2xl border p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {merchant?.shop_name || 'Pharmacy'} · {rev.rating} ★
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        Posted {new Date(rev.created_at).toLocaleDateString()} · Status:{' '}
                        <strong className="uppercase">{rev.status}</strong>
                      </p>
                    </div>
                    {canModerateReviews && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Moderation reason..."
                          value={reviewModerationReason[rev.review_id] || ''}
                          onChange={(e) =>
                            setReviewModerationReason((prev) => ({
                              ...prev,
                              [rev.review_id]: e.target.value,
                            }))
                          }
                          className="rounded-xl border border-white/65 dark:border-white/15 bg-white/75 dark:bg-slate-950/50 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                        {rev.status === 'visible' ? (
                          <button
                            type="button"
                            onClick={() => handleModerateReview(rev.review_id, 'hidden')}
                            className="inline-flex items-center gap-1 rounded-xl bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleModerateReview(rev.review_id, 'visible')}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-100">{rev.comment}</p>
                  {rev.merchant_reply && (
                    <p className="text-[11px] text-teal-800 dark:text-teal-300 bg-teal-500/10 rounded-lg px-2.5 py-1.5">
                      Store Reply: {rev.merchant_reply}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {section === 'analytics' && (
        <section className="medex-glass rounded-2xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Customer Service SLA &amp; Resolution Analytics
            </h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl medex-glass-subtle border p-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">Complaint Resolution Rate</p>
              <p className="font-display text-2xl font-bold text-teal-700 dark:text-teal-300 tabular-nums mt-1">
                {state.problemReports.length > 0
                  ? `${Math.round((stats.resolved / state.problemReports.length) * 100)}%`
                  : '100%'}
              </p>
            </div>
            <div className="rounded-xl medex-glass-subtle border p-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">Escalation Rate</p>
              <p className="font-display text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-1">
                {state.problemReports.length > 0
                  ? `${Math.round((stats.escalated / state.problemReports.length) * 100)}%`
                  : '0%'}
              </p>
            </div>
            <div className="rounded-xl medex-glass-subtle border p-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">Total Return Cases</p>
              <p className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                {state.returnRequests.length}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

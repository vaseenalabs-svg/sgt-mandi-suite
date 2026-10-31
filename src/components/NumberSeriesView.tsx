import React, { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Hash,
  Play,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import {
  DocumentSeriesType,
  IssuedDocumentNumber,
  NumberSeriesRecord,
  PermissionKey,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY } from '../shared/math';
import { LanguageCode, t } from '../shared/i18n';

interface NumberSeriesViewProps {
  series: NumberSeriesRecord[];
  issuedNumbers: IssuedDocumentNumber[];
  activeUser: UserProfile;
  lang: LanguageCode;
  onUpdateSeries: (
    id: string,
    prefix: string,
    paddingLength: number,
    includeFyInNumber: boolean,
    reason: string
  ) => Promise<void>;
  onAllocateTestNumber: (
    docType: DocumentSeriesType,
    idempotencyKey?: string
  ) => Promise<void>;
  onCancelNumber: (formattedNumber: string, cancelReason: string) => Promise<void>;
}

export const NumberSeriesView: React.FC<NumberSeriesViewProps> = ({
  series,
  issuedNumbers,
  activeUser,
  lang,
  onUpdateSeries,
  onAllocateTestNumber,
  onCancelNumber,
}) => {
  const [editingSeries, setEditingSeries] = useState<NumberSeriesRecord | null>(null);
  const [prefixInput, setPrefixInput] = useState<string>('');
  const [paddingInput, setPaddingInput] = useState<number>(6);
  const [includeFyInput, setIncludeFyInput] = useState<boolean>(false);
  const [reasonInput, setReasonInput] = useState<string>('');

  const [selectedDocType, setSelectedDocType] = useState<DocumentSeriesType>(
    DocumentSeriesType.LOAN
  );
  const [idempotencyKeyInput, setIdempotencyKeyInput] = useState<string>('');
  const [cancelTargetNumber, setCancelTargetNumber] = useState<string>('');
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const canManage = activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS);

  const startEdit = (s: NumberSeriesRecord) => {
    setEditingSeries(s);
    setPrefixInput(s.prefix);
    setPaddingInput(s.paddingLength);
    setIncludeFyInput(s.includeFyInNumber);
    setReasonInput('');
    setStatusMessage(null);
  };

  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeries) return;
    setStatusMessage(null);
    try {
      await onUpdateSeries(
        editingSeries.id,
        prefixInput,
        paddingInput,
        includeFyInput,
        reasonInput
      );
      setEditingSeries(null);
      setStatusMessage({
        type: 'success',
        text: `Updated document number series for ${editingSeries.labelEn}.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update number series',
      });
    }
  };

  const handleAllocate = async () => {
    setStatusMessage(null);
    try {
      await onAllocateTestNumber(
        selectedDocType,
        idempotencyKeyInput.trim() ? idempotencyKeyInput.trim() : undefined
      );
      setStatusMessage({
        type: 'success',
        text: `Allocated next sequence number for ${selectedDocType}${
          idempotencyKeyInput.trim() ? ` (Idempotency Key: ${idempotencyKeyInput.trim()})` : ''
        }.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to allocate number',
      });
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      await onCancelNumber(cancelTargetNumber, cancelReasonInput);
      setStatusMessage({
        type: 'success',
        text: `Cancelled ${cancelTargetNumber}. Notice that its number remains permanently retired and will never be reused.`,
      });
      setCancelTargetNumber('');
      setCancelReasonInput('');
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to cancel number',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>SRS Section 3</span>
            <span aria-hidden="true">·</span>
            <span>Immutable Sequence Generator</span>
            <span aria-hidden="true">·</span>
            <span>Idempotent Allocation</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, 'numberSeriesTitle')}</h1>
          <p className="text-sm text-slate-600 max-w-3xl">{t(lang, 'neverReuseRule')}</p>
        </div>

        <div className="glass-subtle rounded-2xl px-4 py-3 flex items-center gap-3 shrink-0">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <div className="text-xs">
            <div className="font-semibold text-slate-900">Non-Reuse Safeguard Active</div>
            <div className="text-slate-500">Cancelled documents retain sequence & reason</div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-200 text-emerald-800'
              : 'bg-rose-500/10 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Series Table (7 cols) */}
        <div className="lg:col-span-7 glass-panel rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Hash className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-900">
                Configured Document Number Series ({series.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              FY {series[0]?.financialYear || 'Active'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                  <th className="py-3 px-4 font-medium">Document Type</th>
                  <th className="py-3 px-3 font-medium">Prefix</th>
                  <th className="py-3 px-3 font-medium text-right">Last Issued Seq</th>
                  <th className="py-3 px-4 font-medium">Next Number Preview</th>
                  <th className="py-3 px-4 font-medium text-right">Configure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {series.map((s) => (
                  <tr key={s.id} className="hover:bg-white/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {lang === 'kn' ? s.labelKn : s.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{s.docType}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">{s.prefix}</td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                      {s.currentSequence}
                    </td>
                    <td className="py-3 px-4 font-mono text-blue-600 font-semibold">
                      {s.samplePreview}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => startEdit(s)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Columns: Edit Modal + Atomic Issue & Non-Reuse Verifier */}
        <div className="lg:col-span-5 space-y-6">
          {editingSeries && (
            <form onSubmit={handleSaveSeries} className="glass-panel rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Edit Format: {editingSeries.labelEn}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingSeries(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Series Prefix
                  </label>
                  <input
                    type="text"
                    value={prefixInput}
                    onChange={(e) => setPrefixInput(e.target.value.toUpperCase())}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Zero Padding (Digits)
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    value={paddingInput}
                    onChange={(e) => setPaddingInput(Number(e.target.value))}
                    className="apple-input w-full font-mono"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFyInput}
                  onChange={(e) => setIncludeFyInput(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Include Financial Year code ({editingSeries.financialYear}) in number</span>
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Audit Reason (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Standardized prefix per owner instruction"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="apple-input w-full"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
              >
                Save Series Format
              </button>
            </form>
          )}

          {/* Atomic Sequence & Idempotency Simulator */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="border-b border-slate-200/70 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Sequence & Non-Reuse Verifier
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify idempotent issuance and prove cancelled numbers are never recycled
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Select Document Series
                </label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value as DocumentSeriesType)}
                  className="apple-input w-full"
                >
                  {series.map((s) => (
                    <option key={s.id} value={s.docType}>
                      {s.labelEn} ({s.samplePreview})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Optional Idempotency Key (Retry Protection Test)
                </label>
                <input
                  type="text"
                  placeholder="e.g., REQ-KEY-101 (same key returns existing number)"
                  value={idempotencyKeyInput}
                  onChange={(e) => setIdempotencyKeyInput(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleAllocate}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors inline-flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5" /> Allocate Next Document Number
              </button>
            </div>

            {/* Issued & Cancelled Numbers Log */}
            <div className="pt-4 border-t border-slate-200/70 space-y-3">
              <div className="text-xs font-semibold text-slate-800">
                Issued Numbers Ledger ({issuedNumbers.length})
              </div>

              {issuedNumbers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No document numbers allocated yet. Click “Allocate Next Document Number” above to
                  test.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {issuedNumbers.map((num) => (
                    <div
                      key={num.id}
                      className="glass-subtle rounded-2xl p-3 text-xs flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            {num.formattedNumber}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span
                            className={`font-medium ${
                              num.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {num.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {num.docType} · Date: {formatDateDDMMYYYY(num.transactionDate)}
                          {num.cancelReason ? ` · Reason: ${num.cancelReason}` : ''}
                        </div>
                      </div>

                      {num.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => setCancelTargetNumber(num.formattedNumber)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-rose-700 bg-rose-500/10 hover:bg-rose-500/15 transition-colors inline-flex items-center gap-1 shrink-0"
                        >
                          <Ban className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {cancelTargetNumber && (
                <form
                  onSubmit={handleCancel}
                  className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-200/80 space-y-2.5"
                >
                  <div className="text-xs font-semibold text-rose-900">
                    Cancel Issued Number: <span className="font-mono">{cancelTargetNumber}</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Cancellation reason (required by SRS Sec 3)"
                    value={cancelReasonInput}
                    onChange={(e) => setCancelReasonInput(e.target.value)}
                    className="apple-input w-full text-xs"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCancelTargetNumber('')}
                      className="px-3 py-1.5 text-xs text-slate-600"
                    >
                      Dismiss
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500"
                    >
                      Confirm Cancellation
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

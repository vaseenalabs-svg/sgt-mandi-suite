import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BookMarked,
  CheckCircle2,
  Plus,
  RotateCcw,
  Scale,
  X,
} from 'lucide-react';
import {
  AccountRecord,
  CashFlowDirection,
  JournalEntryRecord,
  JournalLineInput,
  PartyRecord,
  PermissionKey,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatPaiseToRupees, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

interface KhataBookViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  businessDate: string;
  khata: {
    accounts: AccountRecord[];
    journalEntries: JournalEntryRecord[];
    summary: {
      totalAccountingDebitPaise: number;
      totalAccountingCreditPaise: number;
      cashInPaise: number;
      cashOutPaise: number;
      bankInPaise: number;
      bankOutPaise: number;
      nonCashAdjustmentPaise: number;
    };
  };
  parties: PartyRecord[];
  onPostJournalEntry: (payload: {
    transactionDate: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    narration: string;
    lines: JournalLineInput[];
  }) => Promise<void>;
  onReverseJournalEntry: (entryId: string, reversalDate: string, reason: string) => Promise<void>;
}

export const KhataBookView: React.FC<KhataBookViewProps> = ({
  lang,
  activeUser,
  businessDate,
  khata,
  parties,
  onPostJournalEntry,
  onReverseJournalEntry,
}) => {
  const [activeTab, setActiveTab] = useState<'JOURNAL' | 'ACCOUNTS'>('JOURNAL');
  const [filterAccountCode, setFilterAccountCode] = useState<string>('ALL');
  const [isPostModalOpen, setIsPostModalOpen] = useState<boolean>(false);

  // Manual / Opening Journal Entry Form
  const [txnDate, setTxnDate] = useState(businessDate);
  const [narration, setNarration] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(`JE-MAN-${Date.now()}`);
  const [debitAccountCode, setDebitAccountCode] = useState('1001');
  const [creditAccountCode, setCreditAccountCode] = useState('3001');
  const [partyId, setPartyId] = useState<string>('');
  const [amountRupees, setAmountRupees] = useState('10000');
  const [postError, setPostError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // Controlled Reversal Modal (AT-14)
  const [reversingEntry, setReversingEntry] = useState<JournalEntryRecord | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);

  const canApproveCorrections = activeUser.permissions.includes(
    PermissionKey.APPROVE_CORRECTIONS
  );

  const filteredEntries =
    filterAccountCode === 'ALL'
      ? khata.journalEntries
      : khata.journalEntries.filter((e) =>
          e.lines.some((l) => l.accountCode === filterAccountCode)
        );

  const handleSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError(null);
    const amountPaise = rupeesToPaise(Number(amountRupees || 0));
    if (amountPaise <= 0) {
      setPostError('Amount must be greater than ₹0.');
      return;
    }

    try {
      setPosting(true);
      await onPostJournalEntry({
        transactionDate: txnDate,
        sourceType: 'MANUAL_JOURNAL',
        sourceId: `MAN-${Date.now()}`,
        idempotencyKey: idempotencyKey.trim(),
        narration: narration.trim() || 'Balanced double-entry Khata posting',
        lines: [
          {
            accountCode: debitAccountCode,
            partyId: partyId || null,
            debitPaise: amountPaise,
            creditPaise: 0,
            lineNote: narration.trim(),
          },
          {
            accountCode: creditAccountCode,
            partyId: partyId || null,
            debitPaise: 0,
            creditPaise: amountPaise,
            lineNote: narration.trim(),
          },
        ],
      });
      setIsPostModalOpen(false);
      setNarration('');
      setIdempotencyKey(`JE-MAN-${Date.now()}`);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post journal entry');
    } finally {
      setPosting(false);
    }
  };

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingEntry) return;
    setReversalError(null);
    try {
      await onReverseJournalEntry(reversingEntry.id, businessDate, reversalReason);
      setReversingEntry(null);
      setReversalReason('');
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : 'Failed to reverse entry');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="glass-panel p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            {lang === 'kn'
              ? 'ವಿಭಾಗ 10.1–10.3 · ಕೇಂದ್ರೀಯ ಖಾತೆ ಪುಸ್ತಕ ಮತ್ತು ದ್ವಿ-ನಮೂದು ಎಂಜಿನ್'
              : 'SRS SEC 10.1–10.3 · CENTRAL COMPANY KHATA BOOK & DOUBLE-ENTRY ENGINE'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {lang === 'kn'
              ? 'ಕಂಪನಿ ಖಾತೆ ಪುಸ್ತಕ (Central Khata Book)'
              : 'Company Khata Book & Chart of Accounts'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Every finalized business event posts balanced integer-paise Debits & Credits with
            source-document idempotency (<span className="font-mono">AT-13</span>) and separates
            Accounting Dr/Cr from physical Cash In/Out (<span className="font-mono">AT-16</span>).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="segmented-control">
            <button
              type="button"
              onClick={() => setActiveTab('JOURNAL')}
              className={`segmented-item text-xs ${
                activeTab === 'JOURNAL' ? 'segmented-item-active' : 'text-slate-600'
              }`}
            >
              Khata Journal ({khata.journalEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACCOUNTS')}
              className={`segmented-item text-xs ${
                activeTab === 'ACCOUNTS' ? 'segmented-item-active' : 'text-slate-600'
              }`}
            >
              Chart of Accounts ({khata.accounts.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIdempotencyKey(`JE-MAN-${Date.now()}`);
              setIsPostModalOpen(true);
            }}
            className="btn-cupertino flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>+ Post Khata Entry</span>
          </button>
        </div>
      </div>

      {/* Accounting Dr/Cr vs Physical Cash/Bank Flow Telemetry Strip (SRS Sec 10.2 & 11.2, AT-16) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Accounting Debit (Dr)
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatPaiseToRupees(khata.summary.totalAccountingDebitPaise)}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Matches Cr ({formatPaiseToRupees(khata.summary.totalAccountingCreditPaise)})</span>
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Physical Cash In (Galla)
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatPaiseToRupees(khata.summary.cashInPaise)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Actual cash receipts</div>
        </div>

        <div className="glass-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            Physical Cash Out (Galla)
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-rose-700 mt-1">
            {formatPaiseToRupees(khata.summary.cashOutPaise)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Actual cash payouts</div>
        </div>

        <div className="glass-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Bank In / Bank Out
          </div>
          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1">
            In: {formatPaiseToRupees(khata.summary.bankInPaise)}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
            Out: {formatPaiseToRupees(khata.summary.bankOutPaise)}
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Non-Cash Book Postings
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatPaiseToRupees(khata.summary.nonCashAdjustmentPaise)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Credit bills, accruals & offsets</div>
        </div>
      </div>

      {activeTab === 'ACCOUNTS' ? (
        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Structural Chart of Accounts & Live Trial Balance
              </h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-white/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Name (EN / KN)</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Total Debit (Dr)</th>
                  <th className="py-3 px-4 text-right">Total Credit (Cr)</th>
                  <th className="py-3 px-4 text-right">Net Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {khata.accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-white/60">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">{acc.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{acc.nameEn}</div>
                      <div className="text-xs text-slate-500">{acc.nameKn}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-600">
                      {acc.accountType} · {acc.subType}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {formatPaiseToRupees(acc.totalDebitPaise || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {formatPaiseToRupees(acc.totalCreditPaise || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                      {formatPaiseToRupees(acc.netBalancePaise || 0)}{' '}
                      <span className="text-xs text-slate-500">{acc.balanceDirection}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <BookMarked className="w-4 h-4 text-blue-600" />
              <span>Filter by Ledger Account:</span>
              <select
                value={filterAccountCode}
                onChange={(e) => setFilterAccountCode(e.target.value)}
                className="input-glass px-3 py-1.5 text-xs"
              >
                <option value="ALL">All Accounts ({khata.journalEntries.length} entries)</option>
                {khata.accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="glass-panel p-12 text-center">
              <ArrowLeftRight className="w-10 h-10 text-slate-400 mx-auto mb-3 stroke-[1.5]" />
              <h3 className="text-base font-semibold text-slate-800">
                No Khata Journal Entries Recorded Yet
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Every Farmer Loan, Commodity Purchase/Sale, Bank Transfer, Cheque Clearance, or
                Opening Balance automatically posts a balanced double-entry record here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`glass-panel p-4 space-y-3 ${
                    entry.status === 'REVERSED' ? 'opacity-75 border-rose-200/80' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono font-bold text-sm text-blue-700">
                        {entry.entryNo}
                      </span>
                      <span className="text-xs font-mono text-slate-600">
                        {formatDateDDMMYYYY(entry.transactionDate)}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md">
                        {entry.sourceType} · Ref: {entry.sourceId}
                      </span>
                      <span className="text-xs font-mono text-slate-600">
                        Flow: {entry.cashFlowSummary}
                      </span>
                      {entry.status === 'REVERSED' && (
                        <span className="text-xs font-semibold text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded-md">
                          REVERSED ({entry.reversalReason})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        Dr/Cr: {formatPaiseToRupees(entry.totalDebitPaise)}
                      </span>
                      {entry.status === 'POSTED' &&
                        entry.sourceType !== 'REVERSAL' &&
                        canApproveCorrections && (
                          <button
                            type="button"
                            onClick={() => {
                              setReversingEntry(entry);
                              setReversalReason('');
                              setReversalError(null);
                            }}
                            className="btn-glass px-2.5 py-1 text-xs font-medium text-rose-700 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reverse</span>
                          </button>
                        )}
                    </div>
                  </div>

                  <div className="text-xs font-medium text-slate-800">{entry.narration}</div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200/60">
                          <th className="py-1.5 px-2">Account</th>
                          <th className="py-1.5 px-2">Sub-Ledger Party</th>
                          <th className="py-1.5 px-2">Bucket</th>
                          <th className="py-1.5 px-2">Cash/Bank Tag</th>
                          <th className="py-1.5 px-2 text-right">Debit (Dr)</th>
                          <th className="py-1.5 px-2 text-right">Credit (Cr)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/40">
                        {entry.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-1.5 px-2 font-medium text-slate-900">
                              <span className="font-mono text-blue-700">{line.accountCode}</span> —{' '}
                              {line.accountNameEn}
                            </td>
                            <td className="py-1.5 px-2 text-slate-600">
                              {line.partyName
                                ? `${line.partyName} (${line.partyCode})`
                                : '—'}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                              {line.ledgerBucket}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                              {line.cashDirection}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-900">
                              {line.debitPaise > 0 ? formatPaiseToRupees(line.debitPaise) : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-emerald-700">
                              {line.creditPaise > 0 ? formatPaiseToRupees(line.creditPaise) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controlled Reversal Modal (AT-14) */}
      {reversingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-lg w-full p-6 space-y-4 border border-white/90">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase text-rose-600">
                  SRS Sec 17.3 · Controlled Accounting Reversal (AT-14)
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Reverse Journal Entry {reversingEntry.entryNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReversingEntry(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Finalized entries are never deleted. Confirming this action posts an offsetting
              reversal entry of{' '}
              <span className="font-mono font-bold text-slate-900">
                {formatPaiseToRupees(reversingEntry.totalDebitPaise)}
              </span>{' '}
              and records your audit reason.
            </p>

            {reversalError && (
              <div className="p-3 rounded-xl bg-rose-500/10 text-xs text-rose-700">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Reversal Reason *
                </label>
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g., Wrong party selected on initial voucher entry"
                  className="input-glass w-full px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReversingEntry(null)}
                  className="btn-glass px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-cupertino px-4 py-2 text-xs font-semibold"
                >
                  Confirm Offsetting Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Balanced Khata Entry Modal */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-xl w-full p-6 space-y-4 border border-white/90">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div>
                <div className="text-xs font-semibold uppercase text-blue-600">
                  Balanced Double-Entry Khata Posting (AT-13 Idempotent)
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Post Journal / Opening Capital Entry
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPostModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {postError && (
              <div className="p-3 rounded-xl bg-rose-500/10 text-xs text-rose-700">
                {postError}
              </div>
            )}

            <form onSubmit={handleSubmitJournal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Debit Account (Dr) *
                  </label>
                  <select
                    value={debitAccountCode}
                    onChange={(e) => setDebitAccountCode(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-xs"
                  >
                    {khata.accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Credit Account (Cr) *
                  </label>
                  <select
                    value={creditAccountCode}
                    onChange={(e) => setCreditAccountCode(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-xs"
                  >
                    {khata.accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Link Party Sub-Ledger (Optional)
                  </label>
                  <select
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-xs"
                  >
                    <option value="">— No Party Sub-Ledger —</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.partyCode} — {p.name} ({p.partyType})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Idempotency Key (AT-13)
                  </label>
                  <input
                    type="text"
                    value={idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Narration / Particulars *
                </label>
                <input
                  type="text"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="e.g., Owner opening cash capital introduced into Galla"
                  className="input-glass w-full px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="btn-glass px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting}
                  className="btn-cupertino px-5 py-2 text-xs font-semibold"
                >
                  {posting ? 'Posting...' : 'Post Balanced Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

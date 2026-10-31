import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  MessageSquare,
  Printer,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Wallet,
} from 'lucide-react';
import {
  BankAccountRecord,
  BuyerCollectionRecord,
  CashCreditBillRecord,
  CollectionTargetBillType,
  ComprehensiveFinancialReport,
  DalaliKharidiPattiRecord,
  DayCloseRecord,
  ExpenseAccountingClassification,
  ExpenseCommitmentCategory,
  ExpenseCommitmentRecord,
  KharidiPattiRecord,
  PartyRecord,
  PermissionKey,
  SmsOutboxRecord,
  SystemBackupSnapshot,
  UserProfile,
  ValidationIssueRecord,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

interface OperationsReportsAndDayCloseViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  businessDate: string;
  parties: PartyRecord[];
  bankAccounts: BankAccountRecord[];
  cashCreditBills: CashCreditBillRecord[];
  kharidiPattis: KharidiPattiRecord[];
  dalaliKharidiPattis: DalaliKharidiPattiRecord[];
  buyerCollections: BuyerCollectionRecord[];
  expensesCommitments: ExpenseCommitmentRecord[];
  dayCloseStatus: DayCloseRecord | null;
  dayCloses: DayCloseRecord[];
  validationIssues: ValidationIssueRecord[];
  smsOutbox: SmsOutboxRecord[];
  financialReport: ComprehensiveFinancialReport | null;
  onRecordBuyerCollection: (payload: {
    receiptDate: string;
    buyerId: string;
    targetBillType: CollectionTargetBillType;
    targetBillId: string | null;
    amountPaise: number;
    discountAllowedPaise: number;
    paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
    bankAccountId: string | null;
    referenceNo: string;
    notes: string;
  }) => Promise<void>;
  onRecordExpenseOrCommitment: (payload: {
    voucherDate: string;
    category: ExpenseCommitmentCategory;
    accountingClassification: ExpenseAccountingClassification;
    payeeName: string;
    partyId: string | null;
    amountPaise: number;
    gstAmountPaise: number;
    paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
    bankAccountId: string | null;
    referenceNo: string;
    description: string;
    isRestrictedPersonal: boolean;
  }) => Promise<void>;
  onCloseBusinessDay: (payload: {
    businessDate: string;
    physicalCashCountedPaise: number;
    notes: string;
  }) => Promise<void>;
  onReopenBusinessDay: (payload: {
    businessDate: string;
    reopenReason: string;
  }) => Promise<void>;
  onSendSms: (payload: {
    eventType: SmsOutboxRecord['eventType'];
    recipientPhone: string;
    recipientName: string;
    language: 'en' | 'kn';
    messageBody: string;
    sourceDocNo: string;
    simulateProviderFailure: boolean;
  }) => Promise<void>;
  onRetrySms: (smsId: string) => Promise<void>;
  onCreateBackup: () => Promise<SystemBackupSnapshot>;
  onVerifyBackup: (snapshot: SystemBackupSnapshot) => Promise<{
    valid: boolean;
    checksumMatches: boolean;
    trialBalanceVerified: boolean;
    verifiedTableCount: number;
    totalRecordsVerified: number;
  }>;
}

type SubTab = 'collections' | 'expenses' | 'reports' | 'dayclose_system';

export const OperationsReportsAndDayCloseView: React.FC<
  OperationsReportsAndDayCloseViewProps
> = ({
  lang,
  activeUser,
  businessDate,
  parties,
  bankAccounts,
  cashCreditBills,
  kharidiPattis,
  dalaliKharidiPattis,
  buyerCollections,
  expensesCommitments,
  dayCloseStatus,
  dayCloses,
  validationIssues,
  smsOutbox,
  financialReport,
  onRecordBuyerCollection,
  onRecordExpenseOrCommitment,
  onCloseBusinessDay,
  onReopenBusinessDay,
  onSendSms,
  onRetrySms,
  onCreateBackup,
  onVerifyBackup,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('collections');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Buyer Collection Form State
  const buyerParties = parties.filter((p) => p.partyType !== 'FARMER');
  const [colDate, setColDate] = useState(businessDate);
  const [colBuyerId, setColBuyerId] = useState('');
  const [colTargetType, setColTargetType] =
    useState<CollectionTargetBillType>('CASH_CREDIT_BILL');
  const [colTargetBillId, setColTargetBillId] = useState('');
  const [colAmountRupees, setColAmountRupees] = useState('');
  const [colDiscountRupees, setColDiscountRupees] = useState('0');
  const [colPaymentMode, setColPaymentMode] = useState<
    'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'
  >('CASH');
  const [colBankAccountId, setColBankAccountId] = useState('');
  const [colRefNo, setColRefNo] = useState('');
  const [colNotes, setColNotes] = useState('');

  // Expense / Commitment Form State
  const [expDate, setExpDate] = useState(businessDate);
  const [expCategory, setExpCategory] =
    useState<ExpenseCommitmentCategory>('OPERATING_EXPENSE');
  const [expClassification, setExpClassification] =
    useState<ExpenseAccountingClassification>('OPERATING_EXPENSE');
  const [expPayeeName, setExpPayeeName] = useState('');
  const [expAmountRupees, setExpAmountRupees] = useState('');
  const [expGstRupees, setExpGstRupees] = useState('0');
  const [expPaymentMode, setExpPaymentMode] = useState<
    'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'
  >('CASH');
  const [expBankAccountId, setExpBankAccountId] = useState('');
  const [expRefNo, setExpRefNo] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expRestrictedPersonal, setExpRestrictedPersonal] = useState(false);

  // Day Close & Reopen State
  const [closeDate, setCloseDate] = useState(businessDate);
  const [physicalCashRupees, setPhysicalCashRupees] = useState(
    dayCloseStatus ? String((dayCloseStatus.cashClosingPaise / 100).toFixed(2)) : '0'
  );
  const [closeNotes, setCloseNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  // SMS Simulator State
  const [smsPhone, setSmsPhone] = useState('9845012345');
  const [smsName, setSmsName] = useState('Ramesh Gowda');
  const [smsLang, setSmsLang] = useState<'en' | 'kn'>('kn');
  const [smsBody, setSmsBody] = useState(
    'ಶ್ರೀ ಗುರು ಟ್ರೇಡರ್ಸ್: ನಿಮ್ಮ ಪಟ್ಟಿ ಪಾವತಿ ಸಿದ್ಧವಾಗಿದೆ. ಧನ್ಯವಾದಗಳು.'
  );
  const [smsDocNo, setSmsDocNo] = useState('SGT-FP-000001');
  const [smsSimulateFail, setSmsSimulateFail] = useState(false);

  // Backup & Restore State
  const [lastBackup, setLastBackup] = useState<SystemBackupSnapshot | null>(null);
  const [backupVerification, setBackupVerification] = useState<{
    valid: boolean;
    checksumMatches: boolean;
    trialBalanceVerified: boolean;
    verifiedTableCount: number;
    totalRecordsVerified: number;
  } | null>(null);

  const canReopenDay = activeUser.permissions.includes(PermissionKey.REOPEN_CLOSED_DAY);

  const handleCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusBanner(null);
    try {
      await onRecordBuyerCollection({
        receiptDate: colDate,
        buyerId: colBuyerId,
        targetBillType: colTargetType,
        targetBillId: colTargetType === 'ON_ACCOUNT' ? null : colTargetBillId || null,
        amountPaise: rupeesToPaise(Number(colAmountRupees || 0)),
        discountAllowedPaise: rupeesToPaise(Number(colDiscountRupees || 0)),
        paymentMode: colPaymentMode,
        bankAccountId: colPaymentMode === 'CASH' ? null : colBankAccountId || null,
        referenceNo: colRefNo,
        notes: colNotes,
      });
      setColAmountRupees('');
      setColDiscountRupees('0');
      setColRefNo('');
      setColNotes('');
      setStatusBanner({
        type: 'success',
        message: 'Buyer Collection Receipt recorded and allocated to invoice & Khata Book.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record collection',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusBanner(null);
    try {
      await onRecordExpenseOrCommitment({
        voucherDate: expDate,
        category: expCategory,
        accountingClassification: expClassification,
        payeeName: expPayeeName,
        partyId: null,
        amountPaise: rupeesToPaise(Number(expAmountRupees || 0)),
        gstAmountPaise: rupeesToPaise(Number(expGstRupees || 0)),
        paymentMode: expPaymentMode,
        bankAccountId: expPaymentMode === 'CASH' ? null : expBankAccountId || null,
        referenceNo: expRefNo,
        description: expDescription,
        isRestrictedPersonal: expRestrictedPersonal,
      });
      setExpPayeeName('');
      setExpAmountRupees('');
      setExpGstRupees('0');
      setExpDescription('');
      setStatusBanner({
        type: 'success',
        message: 'Expense / Commitment Voucher issued and posted to Company Khata Book.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record expense voucher',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusBanner(null);
    try {
      await onCloseBusinessDay({
        businessDate: closeDate,
        physicalCashCountedPaise: rupeesToPaise(Number(physicalCashRupees || 0)),
        notes: closeNotes,
      });
      setStatusBanner({
        type: 'success',
        message: `Business date ${formatDateDDMMYYYY(closeDate)} is now CLOSED and locked against unapproved edits.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to close business day',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReopenDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusBanner(null);
    try {
      await onReopenBusinessDay({
        businessDate: closeDate,
        reopenReason,
      });
      setReopenReason('');
      setStatusBanner({
        type: 'success',
        message: `Business date ${formatDateDDMMYYYY(closeDate)} REOPENED with immutable audit log.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reopen day',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportTrialBalanceCsv = () => {
    if (!financialReport) return;
    const headers = ['Account Code', 'Account Name', 'Category', 'Debit (INR)', 'Credit (INR)', 'Net Balance (INR)', 'Dr/Cr'];
    const rows = financialReport.trialBalance.lines.map((l) => [
      l.accountCode,
      `"${l.accountNameEn.replace(/"/g, '""')}"`,
      l.accountType,
      (l.debitPaise / 100).toFixed(2),
      (l.creditPaise / 100).toFixed(2),
      (l.netBalancePaise / 100).toFixed(2),
      l.balanceDirection,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGT_Trial_Balance_${financialReport.asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Segmented Tab Bar */}
      <div className="glass-panel rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">
            {lang === 'kn'
              ? 'ವಸೂಲಾತಿ, ಖರ್ಚುಗಳು, ವರದಿಗಳು ಮತ್ತು ದಿನದ ಮುಕ್ತಾಯ'
              : 'Collections, Expenses, Financial Reports & Day-End Control'}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {lang === 'kn'
              ? 'ಖರೀದಿದಾರರ ವಸೂಲಾತಿ (AT-09), ಖರ್ಚು ಮತ್ತು ಚಿಟ್ ಫಂಡ್, 12 ಆರ್ಥಿಕ ವರದಿಗಳು, ದಿನದ ಮುಕ್ತಾಯ (AT-15) ಮತ್ತು ಬ್ಯಾಕಪ್ ಪರಿಶೀಲನೆ (AT-18)'
              : 'Buyer Collection Book (AT-09), Expenses & Commitments, Financial Statements & GST Registers, Day-End Lock (AT-15), SMS Outbox (AT-12) & Backup Verifier (AT-18)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('collections')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'collections'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Buyer Collection Book
          </button>
          <button
            type="button"
            onClick={() => setSubTab('expenses')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'expenses'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Expenses & Chit/Insurance
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'reports'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reports, P&L & GST Register
          </button>
          <button
            type="button"
            onClick={() => setSubTab('dayclose_system')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'dayclose_system'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Day-End Close, SMS & Backup
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`rounded-2xl p-4 text-xs font-medium flex items-center justify-between ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-800 border border-rose-500/20'
          }`}
        >
          <span>{statusBanner.message}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SUBTAB 1: BUYER COLLECTION BOOK (AT-09) */}
      {subTab === 'collections' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCollectionSubmit}
            className="lg:col-span-5 glass-panel rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Record Buyer Collection Receipt (SGT-RC-*)
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receipt Date
                </label>
                <input
                  type="date"
                  value={colDate}
                  onChange={(e) => setColDate(e.target.value)}
                  className="apple-input w-full text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Buyer / Party
                </label>
                <select
                  value={colBuyerId}
                  onChange={(e) => setColBuyerId(e.target.value)}
                  className="apple-input w-full text-xs"
                  required
                >
                  <option value="">Select Buyer...</option>
                  {buyerParties.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.partyCode} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allocate Against
                </label>
                <select
                  value={colTargetType}
                  onChange={(e) => {
                    setColTargetType(e.target.value as CollectionTargetBillType);
                    setColTargetBillId('');
                  }}
                  className="apple-input w-full text-xs"
                >
                  <option value="CASH_CREDIT_BILL">Cash / Credit Bill (SGT-CB)</option>
                  <option value="KHARIDI_PATTI">Buyer Kharidi Patti (SGT-KP)</option>
                  <option value="DALALI_KHARIDI_PATTI">Dalali Kharidi Patti (SGT-DK)</option>
                  <option value="ON_ACCOUNT">On-Account (General Credit)</option>
                </select>
              </div>

              {colTargetType !== 'ON_ACCOUNT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Unpaid / Partial Bill
                  </label>
                  <select
                    value={colTargetBillId}
                    onChange={(e) => setColTargetBillId(e.target.value)}
                    className="apple-input w-full text-xs"
                    required
                  >
                    <option value="">Choose Invoice...</option>
                    {colTargetType === 'CASH_CREDIT_BILL' &&
                      cashCreditBills
                        .filter(
                          (b) =>
                            (!colBuyerId || b.buyerId === colBuyerId) &&
                            b.status === 'FINALIZED' &&
                            b.balanceReceivablePaise > 0
                        )
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.billNo} — Due: {formatINR(b.balanceReceivablePaise)}
                          </option>
                        ))}
                    {colTargetType === 'KHARIDI_PATTI' &&
                      kharidiPattis
                        .filter(
                          (k) =>
                            (!colBuyerId || k.buyerId === colBuyerId) &&
                            k.balanceReceivablePaise > 0
                        )
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.invoiceNo} — Due: {formatINR(k.balanceReceivablePaise)}
                          </option>
                        ))}
                    {colTargetType === 'DALALI_KHARIDI_PATTI' &&
                      dalaliKharidiPattis
                        .filter(
                          (d) =>
                            (!colBuyerId || d.buyerId === colBuyerId) &&
                            d.balanceReceivablePaise > 0
                        )
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.pattiNo} — Due: {formatINR(d.balanceReceivablePaise)}
                          </option>
                        ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={colAmountRupees}
                  onChange={(e) => setColAmountRupees(e.target.value)}
                  className="apple-input w-full text-xs font-mono"
                  placeholder="e.g. 25000"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cash Discount Allowed (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={colDiscountRupees}
                  onChange={(e) => setColDiscountRupees(e.target.value)}
                  className="apple-input w-full text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={colPaymentMode}
                  onChange={(e) => setColPaymentMode(e.target.value as any)}
                  className="apple-input w-full text-xs"
                >
                  <option value="CASH">Cash (Main Galla)</option>
                  <option value="BANK_TRANSFER">NEFT / RTGS / IMPS</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              {colPaymentMode !== 'CASH' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Account
                  </label>
                  <select
                    value={colBankAccountId}
                    onChange={(e) => setColBankAccountId(e.target.value)}
                    className="apple-input w-full text-xs"
                  >
                    <option value="">Default Bank Control</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.accountLabel} ({ba.accountNumberMasked})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  UTR / Cheque / Ref No
                </label>
                <input
                  type="text"
                  value={colRefNo}
                  onChange={(e) => setColRefNo(e.target.value)}
                  className="apple-input w-full text-xs"
                  placeholder="Optional reference"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Narration / Notes
                </label>
                <input
                  type="text"
                  value={colNotes}
                  onChange={(e) => setColNotes(e.target.value)}
                  className="apple-input w-full text-xs"
                  placeholder="Part payment notes"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all"
            >
              {busy ? 'Posting Receipt...' : 'Issue Buyer Collection Receipt (SGT-RC)'}
            </button>
          </form>

          <div className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-4">
            <h2 id="collections-table-caption" className="text-base font-bold text-slate-900">
              Buyer Collection Book Register ({buyerCollections.length})
            </h2>
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="collections-table-caption"
              className="overflow-x-auto max-h-[480px] @container"
            >
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-2 border-b border-slate-200">Receipt No</th>
                    <th className="py-2 px-2 border-b border-slate-200">Date</th>
                    <th className="py-2 px-2 border-b border-slate-200">Buyer</th>
                    <th className="py-2 px-2 border-b border-slate-200">Bill Ref</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Received</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Due Before</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Due After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {buyerCollections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No buyer collection receipts recorded yet.
                      </td>
                    </tr>
                  ) : (
                    buyerCollections.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <th
                          scope="row"
                          className="sticky left-0 bg-white/95 py-2.5 px-2 font-mono font-semibold text-blue-600"
                        >
                          {c.receiptNo}
                        </th>
                        <td className="py-2.5 px-2 font-mono">
                          {formatDateDDMMYYYY(c.receiptDate)}
                        </td>
                        <td className="py-2.5 px-2 font-medium">{c.buyerName}</td>
                        <td className="py-2.5 px-2 font-mono">
                          {c.targetBillNo || 'ON_ACCOUNT'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-emerald-700">
                          {formatINR(c.amountPaise)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                          {formatINR(c.billBalanceBeforePaise)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-900">
                          {formatINR(c.billBalanceAfterPaise)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: EXPENSES, CHIT FUNDS, INSURANCE & OWNER CAPITAL/DRAWINGS */}
      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleExpenseSubmit}
            className="lg:col-span-5 glass-panel rounded-3xl p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">
              Record Expense, Chit Fund, Insurance or Capital Voucher (SGT-EX-*)
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Voucher Date
                </label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="apple-input w-full text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category (SRS Sec 13)
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => {
                    const cat = e.target.value as ExpenseCommitmentCategory;
                    setExpCategory(cat);
                    if (cat === 'CHIT_FUND') setExpClassification('ASSET_INVESTMENT');
                    else if (cat === 'OWNER_DRAWING') {
                      setExpClassification('OWNER_DRAWING');
                      setExpRestrictedPersonal(true);
                    } else if (cat === 'OWNER_CAPITAL') {
                      setExpClassification('OWNER_CAPITAL');
                    } else if (cat === 'INSURANCE_POLICY') {
                      setExpClassification('OPERATING_EXPENSE');
                      setExpRestrictedPersonal(true);
                    } else {
                      setExpClassification('OPERATING_EXPENSE');
                    }
                  }}
                  className="apple-input w-full text-xs"
                >
                  <option value="OPERATING_EXPENSE">Shop / Mandi Operating Expense</option>
                  <option value="HAMALI_LABOR">Hamali & Weighment Labor Payout</option>
                  <option value="VEHICLE_FREIGHT">Vehicle Freight & Transport</option>
                  <option value="GOVT_FORM_FEE">Govt Form / APMC / License Fee</option>
                  <option value="CHIT_FUND">Chit Fund Contribution / Commitment</option>
                  <option value="INSURANCE_POLICY">Insurance Premium Policy</option>
                  <option value="OWNER_CAPITAL">Owner Capital Infusion</option>
                  <option value="OWNER_DRAWING">Owner Personal Drawings</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Accounting Treatment (DR-12)
                </label>
                <select
                  value={expClassification}
                  onChange={(e) =>
                    setExpClassification(e.target.value as ExpenseAccountingClassification)
                  }
                  className="apple-input w-full text-xs"
                >
                  <option value="OPERATING_EXPENSE">Operating Expense (P&L Account 5002)</option>
                  <option value="ASSET_INVESTMENT">Asset / Chit Investment (Balance Sheet)</option>
                  <option value="OWNER_DRAWING">Owner Drawings (Equity Account 3002)</option>
                  <option value="OWNER_CAPITAL">Owner Capital Receipt (Equity Account 3001)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payee / Counterparty Name
                </label>
                <input
                  type="text"
                  value={expPayeeName}
                  onChange={(e) => setExpPayeeName(e.target.value)}
                  className="apple-input w-full text-xs"
                  placeholder="e.g. APMC Yard / LIC / Staff"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={expAmountRupees}
                  onChange={(e) => setExpAmountRupees(e.target.value)}
                  className="apple-input w-full text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Input GST (₹, if applicable)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expGstRupees}
                  onChange={(e) => setExpGstRupees(e.target.value)}
                  className="apple-input w-full text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={expPaymentMode}
                  onChange={(e) => setExpPaymentMode(e.target.value as any)}
                  className="apple-input w-full text-xs"
                >
                  <option value="CASH">Cash (Main Galla)</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Policy / Chit Ref
                </label>
                <input
                  type="text"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="apple-input w-full text-xs"
                  placeholder="Details for audit trail"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={expRestrictedPersonal}
                onChange={(e) => setExpRestrictedPersonal(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>
                Restrict visibility to Owner / Accountant only (Personal Insurance / Drawings)
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all"
            >
              {busy ? 'Posting Voucher...' : 'Issue Expense / Commitment Voucher (SGT-EX)'}
            </button>
          </form>

          <div className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Expenses, Chit Funds & Commitments Register ({expensesCommitments.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-2">Voucher No</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Category</th>
                    <th className="py-2 px-2">Classification</th>
                    <th className="py-2 px-2">Payee</th>
                    <th className="py-2 px-2 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {expensesCommitments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No expense or commitment vouchers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    expensesCommitments.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-2 font-mono font-semibold text-blue-600">
                          {v.voucherNo}
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          {formatDateDDMMYYYY(v.voucherDate)}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="font-medium">{v.category}</span>
                          {v.isRestrictedPersonal && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 text-[10px] font-semibold">
                              PRIVATE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600">
                          {v.accountingClassification}
                        </td>
                        <td className="py-2.5 px-2 font-medium">{v.payeeName}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold">
                          {formatINR(v.totalAmountPaise)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: COMPREHENSIVE REPORTS, TRIAL BALANCE, P&L, BALANCE SHEET & GST REGISTER */}
      {subTab === 'reports' && financialReport && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="glass-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 ${
                  financialReport.trialBalance.isBalanced
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-rose-500/10 text-rose-700'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {financialReport.trialBalance.isBalanced
                  ? 'Trial Balance Verified (Debit == Credit)'
                  : 'Trial Balance Mismatch'}
              </span>
              <span className="text-xs text-slate-600 font-mono">
                Total Debit: {formatINR(financialReport.trialBalance.totalDebitPaise)} · Total
                Credit: {formatINR(financialReport.trialBalance.totalCreditPaise)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportTrialBalanceCsv}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Export Trial Balance CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Print Financial Package
              </button>
            </div>
          </div>

          {/* P&L and Balance Sheet Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Profit & Loss Statement (Trading & Dalali Income)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Owned Commodity Sales (4001)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.profitAndLoss.commoditySalesPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Dalali Commission Income (4002)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.profitAndLoss.dalaliCommissionPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Farmer Loan Interest Income (4003)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.profitAndLoss.loanInterestIncomePaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Hamali, Weighing & Mandi Fee Recovery (4004)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.profitAndLoss.hamaliAndFeeRecoveryPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Closing SGT-Owned Inventory Valuation</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.profitAndLoss.closingInventoryValuePaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60 text-rose-700">
                  <span>Less: Commodity Purchases (5001)</span>
                  <span className="font-mono font-semibold">
                    - {formatINR(financialReport.profitAndLoss.commodityPurchasesPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60 text-rose-700">
                  <span>Less: Mandi & Operating Expenses (5002)</span>
                  <span className="font-mono font-semibold">
                    - {formatINR(financialReport.profitAndLoss.operatingExpensesPaise)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 text-sm font-bold text-slate-900">
                  <span>Net Profit / (Loss)</span>
                  <span className="font-mono text-emerald-700">
                    {formatINR(financialReport.profitAndLoss.netProfitOrLossPaise)}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Balance Sheet Summary (Assets vs Liabilities)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Cash in Hand — Main Galla (1001)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.balanceSheet.cashInHandPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Bank Control Balances (1002)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.balanceSheet.bankBalancesPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Farmer Loan Principal + Interest Receivable (1201/1202)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(
                      financialReport.balanceSheet.loanPrincipalReceivablePaise +
                        financialReport.balanceSheet.loanInterestReceivablePaise
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Buyer Trade Receivables (1102)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.balanceSheet.buyerTradeReceivablesPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>Farmer Settlement Payables (1101)</span>
                  <span className="font-mono font-semibold text-amber-700">
                    {formatINR(financialReport.balanceSheet.farmerTradePayablesPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span>GST & Statutory Tax Control (2101)</span>
                  <span className="font-mono font-semibold">
                    {formatINR(financialReport.balanceSheet.gstAndTaxPayablesPaise)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 text-sm font-bold text-slate-900">
                  <span>Total Assets</span>
                  <span className="font-mono text-blue-600">
                    {formatINR(financialReport.balanceSheet.totalAssetsPaise)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trial Balance Full Account Schedule (SRS Sec 10 & 19) */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h3 id="trial-balance-caption" className="text-base font-bold text-slate-900">
              Trial Balance & General Ledger Control Accounts ({financialReport.trialBalance.lines.length})
            </h3>
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="trial-balance-caption"
              className="overflow-x-auto max-h-[420px] @container"
            >
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs">
                  <tr className="text-slate-500">
                    <th className="py-2 px-2 border-b border-slate-200">Account Code</th>
                    <th className="py-2 px-2 border-b border-slate-200">Account Name (EN / KN)</th>
                    <th className="py-2 px-2 border-b border-slate-200">Category</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Total Debit</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Total Credit</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {financialReport.trialBalance.lines.map((line) => (
                    <tr key={line.accountId} className="hover:bg-slate-50/80">
                      <th
                        scope="row"
                        className="sticky left-0 bg-white/95 py-2 px-2 font-mono font-semibold text-blue-600"
                      >
                        {line.accountCode}
                      </th>
                      <td className="py-2 px-2">
                        <span className="font-medium text-slate-900">{line.accountNameEn}</span>
                        <span className="text-slate-500 ml-1.5">({line.accountNameKn})</span>
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-600">{line.accountType}</td>
                      <td className="py-2 px-2 text-right font-mono">
                        {formatINR(line.debitPaise)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {formatINR(line.creditPaise)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {formatINR(line.netBalancePaise)} {line.balanceDirection}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sales, Purchase, Dalali & GST Register */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h3 id="gst-register-caption" className="text-base font-bold text-slate-900">
              Sales, Purchase, Dalali & GST Tax Register ({financialReport.gstAndTaxRegister.length})
            </h3>
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="gst-register-caption"
              className="overflow-x-auto max-h-[480px] @container"
            >
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-2 border-b border-slate-200">Doc No</th>
                    <th className="py-2 px-2 border-b border-slate-200">Type</th>
                    <th className="py-2 px-2 border-b border-slate-200">Date</th>
                    <th className="py-2 px-2 border-b border-slate-200">Party</th>
                    <th className="py-2 px-2 border-b border-slate-200">GSTIN</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Bags</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Base Value</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Total GST</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">RMC / Mandi</th>
                    <th className="py-2 px-2 border-b border-slate-200 text-right">Net Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {financialReport.gstAndTaxRegister.map((row) => (
                    <tr key={`${row.documentType}-${row.id}`} className="hover:bg-slate-50/80">
                      <th
                        scope="row"
                        className="sticky left-0 bg-white/95 py-2 px-2 font-mono font-semibold text-blue-600"
                      >
                        {row.documentNo}
                      </th>
                      <td className="py-2 px-2 font-medium">{row.documentType}</td>
                      <td className="py-2 px-2 font-mono">
                        {formatDateDDMMYYYY(row.documentDate)}
                      </td>
                      <td className="py-2 px-2">{row.partyName}</td>
                      <td className="py-2 px-2 font-mono text-slate-500">
                        {row.partyGstin || 'EXEMPT'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{row.totalBags}</td>
                      <td className="py-2 px-2 text-right font-mono">
                        {formatINR(row.taxableOrBaseAmountPaise)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {formatINR(row.totalGstPaise)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {formatINR(row.mandiOrRmcFeePaise)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">
                        {formatINR(row.netDocumentAmountPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: DAY-END CLOSE (AT-15), VALIDATION ISSUES, SMS OUTBOX (AT-12) & BACKUP (AT-18) */}
      {subTab === 'dayclose_system' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Day-End Close & Reopen Control Card */}
            <div className="lg:col-span-6 glass-panel rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {dayCloseStatus?.status === 'CLOSED' ? (
                    <Lock className="w-5 h-5 text-rose-600" />
                  ) : (
                    <Unlock className="w-5 h-5 text-emerald-600" />
                  )}
                  <h2 className="text-base font-bold text-slate-900">
                    Day-End Close & Date Lock (AT-15)
                  </h2>
                </div>
                {dayCloseStatus && (
                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-bold ${
                      dayCloseStatus.status === 'CLOSED'
                        ? 'bg-rose-500/15 text-rose-700'
                        : 'bg-emerald-500/15 text-emerald-700'
                    }`}
                  >
                    Status: {dayCloseStatus.status}
                  </span>
                )}
              </div>

              {dayCloseStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100/80 p-3.5 rounded-2xl text-xs">
                  <div>
                    <div className="text-slate-500">Opening Cash</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {formatINR(dayCloseStatus.cashOpeningPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Today Cash In</div>
                    <div className="font-mono font-semibold text-emerald-700 mt-0.5">
                      +{formatINR(dayCloseStatus.cashInPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Today Cash Out</div>
                    <div className="font-mono font-semibold text-rose-700 mt-0.5">
                      -{formatINR(dayCloseStatus.cashOutPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Book Closing</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {formatINR(dayCloseStatus.cashClosingPaise)}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleCloseDay} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Business Date to Close
                    </label>
                    <input
                      type="date"
                      value={closeDate}
                      onChange={(e) => setCloseDate(e.target.value)}
                      className="apple-input w-full text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Physical Cash Counted (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={physicalCashRupees}
                      onChange={(e) => setPhysicalCashRupees(e.target.value)}
                      className="apple-input w-full text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Day-End Sign-off Notes
                  </label>
                  <input
                    type="text"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="apple-input w-full text-xs"
                    placeholder="Cashier & Owner EOD verification"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Close & Lock Business Date ({formatDateDDMMYYYY(closeDate)})
                </button>
              </form>

              {canReopenDay && (
                <form
                  onSubmit={handleReopenDay}
                  className="pt-3 border-t border-slate-200/80 space-y-3"
                >
                  <div className="text-xs font-semibold text-slate-800">
                    Authorized Day Reopen (Requires REOPEN_CLOSED_DAY Permission)
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      className="apple-input flex-1 text-xs"
                      placeholder="Mandatory audit reason to reopen closed date..."
                      required
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      Reopen Day
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Automatic Validation & Backup Integrity Verifier (AT-18) */}
            <div className="lg:col-span-6 space-y-6">
              <div className="glass-panel rounded-3xl p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Automatic Error & Mismatch Detection ({validationIssues.length})
                  </h2>
                </div>
                {validationIssues.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-800 text-xs font-medium">
                    Zero accounting mismatches, negative stock anomalies, or uncleared items detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationIssues.map((iss) => (
                      <div
                        key={iss.id}
                        className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1"
                      >
                        <div className="font-bold text-amber-900">
                          [{iss.severity}] {iss.title}
                        </div>
                        <div className="text-slate-700">{iss.description}</div>
                        <div className="text-slate-500">Action: {iss.suggestedAction}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Checksummed Backup & Restore Integrity Verifier (AT-18)
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const snap = await onCreateBackup();
                        setLastBackup(snap);
                        const ver = await onVerifyBackup(snap);
                        setBackupVerification(ver);
                        setStatusBanner({
                          type: 'success',
                          message: `Backup snapshot generated (SHA-256: ${snap.checksumSha256.slice(
                            0,
                            16
                          )}...) and verified (${ver.totalRecordsVerified} records).`,
                        });
                      } catch (err) {
                        setStatusBanner({
                          type: 'error',
                          message: err instanceof Error ? err.message : 'Backup failed',
                        });
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Generate & Verify Database Backup Snapshot
                  </button>
                </div>

                {lastBackup && backupVerification && (
                  <div className="p-3.5 rounded-2xl bg-slate-100/90 text-xs space-y-1 font-mono">
                    <div>
                      SHA-256 Checksum: {lastBackup.checksumSha256.slice(0, 28)}... (
                      {backupVerification.checksumMatches ? 'MATCHED' : 'MISMATCH'})
                    </div>
                    <div>
                      Tables Verified: {backupVerification.verifiedTableCount} · Total Rows:{' '}
                      {backupVerification.totalRecordsVerified}
                    </div>
                    <div className="text-emerald-700 font-semibold">
                      Double-Entry Integrity:{' '}
                      {backupVerification.trialBalanceVerified ? 'PASS (Dr == Cr)' : 'FAIL'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pluggable SMS Outbox Simulator (AT-12) */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Pluggable SMS Outbox Simulator & Idempotent Retry (AT-12)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={smsName}
                  onChange={(e) => setSmsName(e.target.value)}
                  className="apple-input w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  className="apple-input w-full text-xs font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bilingual Message Body (EN / ಕನ್ನಡ)
                </label>
                <input
                  type="text"
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="apple-input w-full text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={smsSimulateFail}
                    onChange={(e) => setSmsSimulateFail(e.target.checked)}
                  />
                  Simulate Gateway Failure
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onSendSms({
                        eventType: 'FARMER_PATTI',
                        recipientPhone: smsPhone,
                        recipientName: smsName,
                        language: smsLang,
                        messageBody: smsBody,
                        sourceDocNo: smsDocNo,
                        simulateProviderFailure: smsSimulateFail,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  Dispatch SMS
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-2">Recipient</th>
                    <th className="py-2 px-2">Doc Ref</th>
                    <th className="py-2 px-2">Message</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Retries</th>
                    <th className="py-2 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {smsOutbox.map((sms) => (
                    <tr key={sms.id}>
                      <td className="py-2 px-2 font-medium">
                        {sms.recipientName} ({sms.recipientPhone})
                      </td>
                      <td className="py-2 px-2 font-mono">{sms.sourceDocNo}</td>
                      <td className="py-2 px-2 max-w-md truncate">{sms.messageBody}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                            sms.status === 'SENT'
                              ? 'bg-emerald-500/15 text-emerald-800'
                              : 'bg-rose-500/15 text-rose-800'
                          }`}
                        >
                          {sms.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono">{sms.retryCount}</td>
                      <td className="py-2 px-2 text-right">
                        {sms.status === 'FAILED' && (
                          <button
                            type="button"
                            onClick={() => onRetrySms(sms.id)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry (No Re-Post)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

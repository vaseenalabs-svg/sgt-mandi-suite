import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Coins,
  FileCheck2,
  FileSpreadsheet,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  BankAccountRecord,
  BankStatementLineRecord,
  ChequeDirection,
  ChequeRecord,
  ChequeStatus,
  LoanPaymentMode,
  LoanRecord,
  LoanTransactionRecord,
  PartyRecord,
  PermissionKey,
  RepaymentAllocationOrder,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

interface CashBankAndLoansViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  businessDate: string;
  bankAccounts: BankAccountRecord[];
  cheques: ChequeRecord[];
  loans: LoanRecord[];
  loanTransactions: LoanTransactionRecord[];
  parties: PartyRecord[];
  cashInHandBalancePaise: number;
  onCreateBankAccount: (payload: {
    bankName: string;
    branchName: string;
    accountLabel: string;
    accountType: 'SAVINGS' | 'CURRENT' | 'OD_CC';
    accountNumber: string;
    ifscCode: string;
    openingBalancePaise: number;
    openingBalanceType: 'DR' | 'CR';
    openingDate: string;
  }) => Promise<void>;
  onRecordInternalTransfer: (payload: {
    transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK';
    transactionDate: string;
    amountPaise: number;
    fromBankAccountId?: string | null;
    toBankAccountId?: string | null;
    referenceNo?: string;
    narration?: string;
  }) => Promise<void>;
  onCreateCheque: (payload: {
    chequeNo: string;
    chequeDate: string;
    direction: ChequeDirection;
    bankAccountId: string;
    partyId: string | null;
    partyName: string;
    amountPaise: number;
    purpose: string;
  }) => Promise<void>;
  onUpdateChequeStatus: (
    chequeId: string,
    payload: {
      newStatus: ChequeStatus;
      actionDate: string;
      reason?: string;
    }
  ) => Promise<void>;
  onAddStatementLines: (
    bankAccountId: string,
    lines: Array<{
      valueDate: string;
      description: string;
      referenceNo?: string;
      debitPaise: number;
      creditPaise: number;
    }>
  ) => Promise<BankStatementLineRecord[]>;
  onFetchStatementLines: (bankAccountId: string) => Promise<BankStatementLineRecord[]>;
  onReconcileBankStatement: (bankAccountId: string) => Promise<{
    matchedCount: number;
    unmatchedStatementLinesCount: number;
    unmatchedBookLinesCount: number;
    bookBalancePaise: number;
    reconciledStatementBalancePaise: number;
    differencePaise: number;
  }>;
  onDisburseFarmerLoan: (payload: {
    farmerId: string;
    disbursementDate: string;
    principalPaise: number;
    paymentMode: LoanPaymentMode;
    bankAccountId?: string | null;
    bankReference?: string;
    interestRateBps?: number;
    notes?: string;
  }) => Promise<void>;
  onRecordLoanRepayment: (
    loanId: string,
    payload: {
      repaymentDate: string;
      amountPaise: number;
      paymentMode: LoanPaymentMode;
      bankAccountId?: string | null;
      referenceNo?: string;
      allocationOverride?: RepaymentAllocationOrder;
      notes?: string;
    }
  ) => Promise<void>;
}

type SubTab = 'LOANS' | 'BANKS_TRANSFERS' | 'CHEQUES' | 'RECONCILIATION';

export const CashBankAndLoansView: React.FC<CashBankAndLoansViewProps> = ({
  lang,
  activeUser,
  businessDate,
  bankAccounts,
  cheques,
  loans,
  loanTransactions,
  parties,
  cashInHandBalancePaise,
  onCreateBankAccount,
  onRecordInternalTransfer,
  onCreateCheque,
  onUpdateChequeStatus,
  onAddStatementLines,
  onFetchStatementLines,
  onReconcileBankStatement,
  onDisburseFarmerLoan,
  onRecordLoanRepayment,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('LOANS');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const farmers = parties.filter((p) => p.partyType === 'FARMER' && p.status === 'ACTIVE');

  // --- Farmer Loan Disbursement State (AT-02, AT-03) ---
  const [showLoanForm, setShowLoanForm] = useState<boolean>(false);
  const [loanFarmerId, setLoanFarmerId] = useState<string>(farmers[0]?.id || '');
  const [loanDate, setLoanDate] = useState<string>(businessDate);
  const [loanPrincipalRupees, setLoanPrincipalRupees] = useState<string>('');
  const [loanRatePercent, setLoanRatePercent] = useState<string>('0');
  const [loanPaymentMode, setLoanPaymentMode] = useState<LoanPaymentMode>('CASH');
  const [loanBankAccountId, setLoanBankAccountId] = useState<string>(bankAccounts[0]?.id || '');
  const [loanRefNo, setLoanRefNo] = useState<string>('');
  const [loanNotes, setLoanNotes] = useState<string>('');

  // --- Loan Repayment Modal State ---
  const [repayingLoan, setRepayingLoan] = useState<LoanRecord | null>(null);
  const [repayDate, setRepayDate] = useState<string>(businessDate);
  const [repayAmountRupees, setRepayAmountRupees] = useState<string>('');
  const [repayMode, setRepayMode] = useState<LoanPaymentMode>('CASH');
  const [repayBankAccountId, setRepayBankAccountId] = useState<string>(bankAccounts[0]?.id || '');
  const [repayAllocationRule, setRepayAllocationRule] = useState<RepaymentAllocationOrder>(
    RepaymentAllocationOrder.PRINCIPAL_FIRST
  );
  const [repayRefNo, setRepayRefNo] = useState<string>('');
  const [repayNotes, setRepayNotes] = useState<string>('');

  // --- Loan Schedule Inspection State ---
  const [inspectedLoan, setInspectedLoan] = useState<LoanRecord | null>(null);

  // --- Bank Account Creation & Internal Transfer State (AT-10) ---
  const [showBankForm, setShowBankForm] = useState<boolean>(false);
  const [bankName, setBankName] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');
  const [accountLabel, setAccountLabel] = useState<string>('');
  const [bankAccNo, setBankAccNo] = useState<string>('');
  const [bankIfsc, setBankIfsc] = useState<string>('');
  const [bankAccType, setBankAccType] = useState<'CURRENT' | 'SAVINGS' | 'OD_CC'>('CURRENT');
  const [bankOpeningRupees, setBankOpeningRupees] = useState<string>('0');
  const [bankOpeningDate, setBankOpeningDate] = useState<string>(businessDate);

  const [showTransferForm, setShowTransferForm] = useState<boolean>(false);
  const [transferType, setTransferType] = useState<
    'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK'
  >('CASH_TO_BANK');
  const [transferDate, setTransferDate] = useState<string>(businessDate);
  const [fromBankId, setFromBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [toBankId, setToBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [transferAmountRupees, setTransferAmountRupees] = useState<string>('');
  const [transferRefNo, setTransferRefNo] = useState<string>('');
  const [transferNarration, setTransferNarration] = useState<string>('');

  // --- Cheque Register State (DR-11) ---
  const [showChequeForm, setShowChequeForm] = useState<boolean>(false);
  const [chqNo, setChqNo] = useState<string>('');
  const [chqDate, setChqDate] = useState<string>(businessDate);
  const [chqDirection, setChqDirection] = useState<ChequeDirection>('RECEIVED');
  const [chqPartyId, setChqPartyId] = useState<string>(parties[0]?.id || '');
  const [chqBankId, setChqBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [chqAmountRupees, setChqAmountRupees] = useState<string>('');
  const [chqPurpose, setChqPurpose] = useState<string>('');

  // --- Bank Reconciliation State (AT-17) ---
  const [reconBankId, setReconBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [statementLines, setStatementLines] = useState<BankStatementLineRecord[]>([]);
  const [stmtDate, setStmtDate] = useState<string>(businessDate);
  const [stmtDesc, setStmtDesc] = useState<string>('');
  const [stmtRef, setStmtRef] = useState<string>('');
  const [stmtDrRupees, setStmtDrRupees] = useState<string>('0');
  const [stmtCrRupees, setStmtCrRupees] = useState<string>('0');
  const [reconSummary, setReconSummary] = useState<{
    matchedCount: number;
    unmatchedStatementLinesCount: number;
    unmatchedBookLinesCount: number;
  } | null>(null);

  const canDisburseLoans = activeUser.permissions.includes(PermissionKey.MANAGE_LOANS);
  const canPostReceipts = activeUser.permissions.includes(PermissionKey.MANAGE_CASH_BANK);

  const totalBankBalancePaise = bankAccounts.reduce((s, b) => s + b.currentBookBalancePaise, 0);
  const totalOutstandingLoanPrincipalPaise = loans
    .filter((l) => l.status === 'ACTIVE')
    .reduce((s, l) => s + l.principalOutstandingPaise, 0);
  const pendingChequesCount = cheques.filter((c) => c.status === 'PENDING').length;

  const handleDisburseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onDisburseFarmerLoan({
        farmerId: loanFarmerId || farmers[0]?.id || '',
        disbursementDate: loanDate,
        principalPaise: rupeesToPaise(loanPrincipalRupees || '0'),
        paymentMode: loanPaymentMode,
        bankAccountId:
          loanPaymentMode !== 'CASH' ? loanBankAccountId || bankAccounts[0]?.id : null,
        bankReference: loanRefNo.trim() || undefined,
        interestRateBps: Math.round(Number(loanRatePercent || 0) * 100),
        notes: loanNotes.trim() || 'Farmer crop advance disbursement',
      });
      setShowLoanForm(false);
      setLoanPrincipalRupees('');
      setLoanRefNo('');
      setLoanNotes('');
      setFeedback({
        type: 'success',
        message:
          'Farmer loan disbursed atomically: Loan voucher issued, Farmer Loan Principal Ledger debited, and Cash/Bank credited.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to disburse farmer loan',
      });
    }
  };

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingLoan) return;
    setFeedback(null);
    try {
      await onRecordLoanRepayment(repayingLoan.id, {
        repaymentDate: repayDate,
        amountPaise: rupeesToPaise(repayAmountRupees || '0'),
        paymentMode: repayMode,
        bankAccountId: repayMode !== 'CASH' ? repayBankAccountId || bankAccounts[0]?.id : null,
        referenceNo: repayRefNo.trim() || undefined,
        allocationOverride: repayAllocationRule,
        notes: repayNotes.trim() || `Repayment against ${repayingLoan.loanNo}`,
      });
      setRepayingLoan(null);
      setRepayAmountRupees('');
      setRepayRefNo('');
      setRepayNotes('');
      setFeedback({
        type: 'success',
        message: `Repayment recorded against ${repayingLoan.loanNo} using ${repayAllocationRule} rule.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record loan repayment',
      });
    }
  };

  const handleCreateBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onCreateBankAccount({
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountLabel: accountLabel.trim() || `${bankName.trim()} (${branchName.trim()})`,
        accountType: bankAccType,
        accountNumber: bankAccNo.trim(),
        ifscCode: bankIfsc.trim(),
        openingBalancePaise: rupeesToPaise(bankOpeningRupees || '0'),
        openingBalanceType: 'DR',
        openingDate: bankOpeningDate,
      });
      setShowBankForm(false);
      setBankName('');
      setBranchName('');
      setAccountLabel('');
      setBankAccNo('');
      setBankIfsc('');
      setBankOpeningRupees('0');
      setFeedback({
        type: 'success',
        message: 'Bank account registered and linked to the Central Khata Book.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create bank account',
      });
    }
  };

  const handleInternalTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onRecordInternalTransfer({
        transferType,
        transactionDate: transferDate,
        amountPaise: rupeesToPaise(transferAmountRupees || '0'),
        fromBankAccountId:
          transferType === 'BANK_TO_CASH' || transferType === 'BANK_TO_BANK'
            ? fromBankId || bankAccounts[0]?.id
            : null,
        toBankAccountId:
          transferType === 'CASH_TO_BANK' || transferType === 'BANK_TO_BANK'
            ? toBankId || bankAccounts[0]?.id
            : null,
        referenceNo: transferRefNo.trim(),
        narration: transferNarration.trim() || 'Internal Cash/Bank Contra Transfer (AT-10)',
      });
      setShowTransferForm(false);
      setTransferAmountRupees('');
      setTransferRefNo('');
      setTransferNarration('');
      setFeedback({
        type: 'success',
        message:
          'Internal Cash/Bank transfer posted atomically (AT-10) with zero false income or expense creation.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record internal transfer',
      });
    }
  };

  const handleCreateChequeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const targetParty = parties.find((p) => p.id === (chqPartyId || parties[0]?.id));
      await onCreateCheque({
        chequeNo: chqNo.trim(),
        chequeDate: chqDate,
        direction: chqDirection,
        bankAccountId: chqBankId || bankAccounts[0]?.id || '',
        partyId: targetParty?.id || null,
        partyName: targetParty?.name || 'Counterparty',
        amountPaise: rupeesToPaise(chqAmountRupees || '0'),
        purpose: chqPurpose.trim(),
      });
      setShowChequeForm(false);
      setChqNo('');
      setChqAmountRupees('');
      setChqPurpose('');
      setFeedback({
        type: 'success',
        message:
          'Cheque registered in PENDING state (DR-11: excluded from cleared bank balance until cleared).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to register cheque',
      });
    }
  };

  const handleChequeLifecycleAction = async (cheque: ChequeRecord, newStatus: ChequeStatus) => {
    setFeedback(null);
    try {
      await onUpdateChequeStatus(cheque.id, {
        newStatus,
        actionDate: businessDate,
        reason: newStatus === 'BOUNCED' ? 'Dishonoured by bank on presentation' : undefined,
      });
      setFeedback({
        type: 'success',
        message: `Cheque #${cheque.chequeNo} transitioned to ${newStatus} and synced with Central Khata Book.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update cheque status',
      });
    }
  };

  const handleLoadStatement = async (bankId: string) => {
    setReconBankId(bankId);
    if (!bankId) return;
    const rows = await onFetchStatementLines(bankId);
    setStatementLines(rows);
  };

  const handleAddStatementRow = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBankId = reconBankId || bankAccounts[0]?.id || '';
    if (!targetBankId) return;
    setFeedback(null);
    try {
      const updated = await onAddStatementLines(targetBankId, [
        {
          valueDate: stmtDate,
          description: stmtDesc.trim(),
          referenceNo: stmtRef.trim() || undefined,
          debitPaise: rupeesToPaise(stmtDrRupees || '0'),
          creditPaise: rupeesToPaise(stmtCrRupees || '0'),
        },
      ]);
      setStatementLines(updated);
      setStmtDesc('');
      setStmtRef('');
      setStmtDrRupees('0');
      setStmtCrRupees('0');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add statement row',
      });
    }
  };

  const handleRunReconciliation = async () => {
    const targetBankId = reconBankId || bankAccounts[0]?.id || '';
    if (!targetBankId) return;
    setFeedback(null);
    try {
      const res: any = await onReconcileBankStatement(targetBankId);
      const updated = await onFetchStatementLines(targetBankId);
      setStatementLines(updated);
      setReconSummary({
        matchedCount: res.matchedCount ?? 0,
        unmatchedStatementLinesCount:
          res.unmatchedStatementLinesCount ?? res.unmatchedStatementLines?.length ?? 0,
        unmatchedBookLinesCount:
          res.unmatchedBookLinesCount ?? res.unmatchedBookLines?.length ?? 0,
      });
      setFeedback({
        type: 'success',
        message: `Reconciliation complete (AT-17): ${res.matchedCount} matched. Unmatched book records preserved intact.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Reconciliation failed',
      });
    }
  };

  const inspectedLoanTransactions = inspectedLoan
    ? loanTransactions.filter((t) => t.loanId === inspectedLoan.id)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>SRS Sections 4, 12 & 13</span>
            <span aria-hidden="true">·</span>
            <span>AT-02, AT-03, AT-10, AT-17 & DR-11</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'kn'
              ? 'ರೈತರ ಸಾಲ, ನಗದು ಮತ್ತು ಬ್ಯಾಂಕ್ ಖಾತೆ ನಿರ್ವಹಣೆ'
              : 'Farmer Loans, Cash Book & Multi-Bank Treasury'}
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Disburse Farmer Crop Advances via Cash or Bank Transfer, allocate repayments
            (Principal-First default), manage internal Cash/Bank Contra transfers, track Cheque
            clearance, and reconcile bank statements.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('LOANS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'LOANS'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Farmer Loans ({loans.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('BANKS_TRANSFERS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'BANKS_TRANSFERS'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cash & Bank ({bankAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('CHEQUES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'CHEQUES'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cheques ({cheques.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('RECONCILIATION');
              if (bankAccounts[0]?.id) {
                handleLoadStatement(bankAccounts[0].id);
              }
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              subTab === 'RECONCILIATION'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reconciliation (AT-17)
          </button>
        </div>
      </div>

      {/* 4-Column Treasury & Loan KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">Cash in Hand (1001 Galla)</div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatINR(cashInHandBalancePaise)}
          </div>
          <div className="text-xs text-slate-500">Live physical cash ledger balance</div>
        </div>
        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">Cleared Bank Balances</div>
          <div className="text-2xl font-bold font-mono text-blue-600">
            {formatINR(totalBankBalancePaise)}
          </div>
          <div className="text-xs text-slate-500">
            Across {bankAccounts.length} registered bank accounts
          </div>
        </div>
        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">Active Farmer Loan Principal</div>
          <div className="text-2xl font-bold font-mono text-amber-700">
            {formatINR(totalOutstandingLoanPrincipalPaise)}
          </div>
          <div className="text-xs text-slate-500">
            {loans.filter((l) => l.status === 'ACTIVE').length} active advances
          </div>
        </div>
        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">Uncleared Pending Cheques</div>
          <div className="text-2xl font-bold font-mono text-slate-900">{pendingChequesCount}</div>
          <div className="text-xs text-slate-500">Excluded from cleared cash (DR-11)</div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-200 text-emerald-800'
              : 'bg-rose-500/10 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* SUB-TAB 1: FARMER LOANS & REPAYMENTS (AT-02, AT-03) */}
      {subTab === 'LOANS' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Farmer Loan / Advance Register (SRS Section 4)
              </h2>
              <p className="text-xs text-slate-500">
                Every loan requires a registered Farmer ID (`SGT-FM-*`) and posts atomically to the
                Central Khata Book.
              </p>
            </div>
            <button
              type="button"
              disabled={!canDisburseLoans}
              onClick={() => {
                if (!loanFarmerId && farmers[0]?.id) setLoanFarmerId(farmers[0].id);
                setShowLoanForm(!showLoanForm);
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Disburse Farmer Loan (AT-02 / AT-03)
            </button>
          </div>

          {showLoanForm && (
            <form
              onSubmit={handleDisburseSubmit}
              className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Registered Farmer (Required)
                  </label>
                  <select
                    required
                    value={loanFarmerId}
                    onChange={(e) => setLoanFarmerId(e.target.value)}
                    className="apple-input w-full"
                  >
                    <option value="">Select Registered Farmer...</option>
                    {farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.partyCode} — {f.name} ({f.village})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Disbursement Date
                  </label>
                  <input
                    type="date"
                    required
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Principal Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    placeholder="e.g. 25000"
                    value={loanPrincipalRupees}
                    onChange={(e) => setLoanPrincipalRupees(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Payment Mode (AT-02 / AT-03)
                  </label>
                  <select
                    value={loanPaymentMode}
                    onChange={(e) => setLoanPaymentMode(e.target.value as LoanPaymentMode)}
                    className="apple-input w-full"
                  >
                    <option value="CASH">Cash Disbursement (AT-02)</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT (AT-03)</option>
                    <option value="UPI">UPI Instant Transfer (AT-03)</option>
                    <option value="CHEQUE">Cheque Disbursement</option>
                  </select>
                </div>

                {loanPaymentMode !== 'CASH' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Source Bank Account
                    </label>
                    <select
                      required
                      value={loanBankAccountId}
                      onChange={(e) => setLoanBankAccountId(e.target.value)}
                      className="apple-input w-full"
                    >
                      <option value="">Select Bank Account...</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} — {b.accountNumberMasked}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Annual Interest Rate (%) [DR-01]
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={loanRatePercent}
                    onChange={(e) => setLoanRatePercent(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    UTR / Cheque / Voucher Ref
                  </label>
                  <input
                    type="text"
                    placeholder="Required for Bank/UPI"
                    value={loanRefNo}
                    onChange={(e) => setLoanRefNo(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Narration / Crop Season Note
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Kharif seeds & fertilizer advance"
                    value={loanNotes}
                    onChange={(e) => setLoanNotes(e.target.value)}
                    className="apple-input w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLoanForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                >
                  Issue Loan Voucher & Post Khata
                </button>
              </div>
            </form>
          )}

          <div className="glass-panel rounded-3xl overflow-hidden">
            {loans.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Coins className="w-8 h-8 text-blue-600 mx-auto opacity-80" />
                <div className="text-sm font-semibold text-slate-800">
                  No Farmer Loans Disbursed Yet
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Register a farmer in the Farmers & Parties tab first, then click “Disburse Farmer
                  Loan” above.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                    <th className="py-3 px-4 font-medium">Loan Voucher & Date</th>
                    <th className="py-3 px-3 font-medium">Farmer</th>
                    <th className="py-3 px-3 font-medium">Mode & Rate</th>
                    <th className="py-3 px-3 font-medium text-right">Principal Disbursed</th>
                    <th className="py-3 px-3 font-medium text-right">Outstanding Principal</th>
                    <th className="py-3 px-3 font-medium text-right">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {loans.map((ln) => (
                    <tr key={ln.id} className="hover:bg-white/60">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-blue-600">{ln.loanNo}</div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(ln.disbursementDate)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{ln.farmerName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{ln.farmerCode}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div>{ln.paymentMode}</div>
                        <div className="text-slate-500">
                          {(ln.interestRateBps / 100).toFixed(2)}% ({ln.interestMethod})
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">
                        {formatINR(ln.principalPaise)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-700">
                        {formatINR(ln.principalOutstandingPaise)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        <span
                          className={
                            ln.status === 'CLOSED' ? 'text-emerald-700' : 'text-blue-600'
                          }
                        >
                          {ln.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-3">
                          {ln.status === 'ACTIVE' && canPostReceipts && (
                            <button
                              type="button"
                              onClick={() => {
                                setRepayingLoan(ln);
                                setRepayAmountRupees(
                                  String(ln.principalOutstandingPaise / 100)
                                );
                              }}
                              className="text-emerald-700 hover:text-emerald-900 font-semibold"
                            >
                              Record Repayment
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setInspectedLoan(ln)}
                            className="text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            Schedule
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CASH & BANK ACCOUNTS + INTERNAL TRANSFERS (AT-10) */}
      {subTab === 'BANKS_TRANSFERS' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Registered Bank Accounts & Contra Cash/Bank Transfers (AT-10)
              </h2>
              <p className="text-xs text-slate-500">
                Internal transfers between Cash in Hand and Bank Accounts adjust asset balances
                only and never inflate trading revenue or expenses.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowBankForm(!showBankForm)}
                className="px-4 py-2.5 rounded-xl bg-white/85 border border-slate-200/80 text-xs font-semibold text-slate-800 hover:bg-white inline-flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Add Bank Account
              </button>
              <button
                type="button"
                onClick={() => setShowTransferForm(!showTransferForm)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 inline-flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Internal Cash/Bank Transfer (AT-10)
              </button>
            </div>
          </div>

          {showBankForm && (
            <form
              onSubmit={handleCreateBankSubmit}
              className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80"
            >
              <h3 className="text-sm font-semibold text-slate-900">
                Register Company Bank Account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. State Bank of India"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="apple-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                  <input
                    type="text"
                    required
                    placeholder="APMC Yard Branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="apple-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Full account number"
                    value={bankAccNo}
                    onChange={(e) => setBankAccNo(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    required
                    placeholder="SBIN0001234"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Account Type
                  </label>
                  <select
                    value={bankAccType}
                    onChange={(e) =>
                      setBankAccType(e.target.value as 'CURRENT' | 'SAVINGS' | 'OD_CC')
                    }
                    className="apple-input w-full"
                  >
                    <option value="CURRENT">Current Account</option>
                    <option value="SAVINGS">Savings Account</option>
                    <option value="OD_CC">Overdraft / Cash Credit (OD/CC)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bankOpeningRupees}
                    onChange={(e) => setBankOpeningRupees(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Opening Date
                  </label>
                  <input
                    type="date"
                    value={bankOpeningDate}
                    onChange={(e) => setBankOpeningDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Save Bank Account
                  </button>
                </div>
              </div>
            </form>
          )}

          {showTransferForm && (
            <form
              onSubmit={handleInternalTransferSubmit}
              className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80"
            >
              <h3 className="text-sm font-semibold text-slate-900">
                Internal Cash / Bank Contra Transfer (AT-10)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Transfer Direction
                  </label>
                  <select
                    value={transferType}
                    onChange={(e) =>
                      setTransferType(
                        e.target.value as 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK'
                      )
                    }
                    className="apple-input w-full"
                  >
                    <option value="CASH_TO_BANK">Cash Deposit to Bank</option>
                    <option value="BANK_TO_CASH">Cash Withdrawal from Bank</option>
                    <option value="BANK_TO_BANK">Bank-to-Bank Transfer</option>
                  </select>
                </div>

                {(transferType === 'BANK_TO_CASH' || transferType === 'BANK_TO_BANK') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      From Bank Account
                    </label>
                    <select
                      value={fromBankId}
                      onChange={(e) => setFromBankId(e.target.value)}
                      className="apple-input w-full"
                    >
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} ({b.accountNumberMasked})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(transferType === 'CASH_TO_BANK' || transferType === 'BANK_TO_BANK') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      To Bank Account
                    </label>
                    <select
                      value={toBankId}
                      onChange={(e) => setToBankId(e.target.value)}
                      className="apple-input w-full"
                    >
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} ({b.accountNumberMasked})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={transferAmountRupees}
                    onChange={(e) => setTransferAmountRupees(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Execute Contra Transfer
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {bankAccounts.map((b) => (
              <div key={b.id} className="glass-panel rounded-3xl p-6 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>{b.ifscCode}</span>
                  <span>{b.accountType}</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{b.bankName}</h3>
                  <div className="text-xs text-slate-500">
                    {b.branchName} · <span className="font-mono">{b.accountNumberMasked}</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-200/60 flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">Cleared Book Balance</span>
                  <span className="text-xl font-bold font-mono text-blue-600">
                    {formatINR(b.currentBookBalancePaise)} {b.currentBookBalanceType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CHEQUE REGISTER & LIFECYCLE (DR-11) */}
      {subTab === 'CHEQUES' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Cheque Lifecycle Register (SRS Section 12.3 & DR-11)
              </h2>
              <p className="text-xs text-slate-500">
                PENDING cheques do not inflate cleared bank balances. Clearing posts a Khata entry;
                Bouncing reverses it with an audit trail.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowChequeForm(!showChequeForm)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 inline-flex items-center gap-1.5"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Register Cheque
            </button>
          </div>

          {showChequeForm && (
            <form
              onSubmit={handleCreateChequeSubmit}
              className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="6-digit cheque no"
                    value={chqNo}
                    onChange={(e) => setChqNo(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Cheque Date
                  </label>
                  <input
                    type="date"
                    required
                    value={chqDate}
                    onChange={(e) => setChqDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Direction</label>
                  <select
                    value={chqDirection}
                    onChange={(e) => setChqDirection(e.target.value as ChequeDirection)}
                    className="apple-input w-full"
                  >
                    <option value="RECEIVED">Received from Buyer / Farmer</option>
                    <option value="ISSUED">Issued by SGT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Party</label>
                  <select
                    required
                    value={chqPartyId}
                    onChange={(e) => setChqPartyId(e.target.value)}
                    className="apple-input w-full"
                  >
                    <option value="">Select Party...</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.partyCode} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bank Account
                  </label>
                  <select
                    required
                    value={chqBankId}
                    onChange={(e) => setChqBankId(e.target.value)}
                    className="apple-input w-full"
                  >
                    <option value="">Select Bank Account...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} ({b.accountNumberMasked})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={chqAmountRupees}
                    onChange={(e) => setChqAmountRupees(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Purpose</label>
                  <input
                    type="text"
                    required
                    placeholder="Bill collection / Crop settlement"
                    value={chqPurpose}
                    onChange={(e) => setChqPurpose(e.target.value)}
                    className="apple-input w-full"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Save Pending Cheque
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="glass-panel rounded-3xl overflow-hidden">
            {cheques.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No cheques registered yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                    <th className="py-3 px-4 font-medium">Cheque # & Date</th>
                    <th className="py-3 px-3 font-medium">Direction & Party</th>
                    <th className="py-3 px-3 font-medium">Bank Account</th>
                    <th className="py-3 px-3 font-medium text-right">Amount</th>
                    <th className="py-3 px-3 font-medium text-right">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {cheques.map((c) => (
                    <tr key={c.id} className="hover:bg-white/60">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">#{c.chequeNo}</div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(c.chequeDate)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{c.partyName}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.direction} · {c.purpose}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700">{c.bankAccountLabel}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {formatINR(c.amountPaise)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        <span
                          className={
                            c.status === 'CLEARED'
                              ? 'text-emerald-700'
                              : c.status === 'BOUNCED'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {c.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleChequeLifecycleAction(c, 'CLEARED')}
                                className="text-emerald-700 hover:text-emerald-900 font-semibold"
                              >
                                Mark Cleared
                              </button>
                              <button
                                type="button"
                                onClick={() => handleChequeLifecycleAction(c, 'BOUNCED')}
                                className="text-rose-600 hover:text-rose-800 font-semibold"
                              >
                                Bounce
                              </button>
                            </>
                          )}
                          {c.status === 'CLEARED' && (
                            <button
                              type="button"
                              onClick={() => handleChequeLifecycleAction(c, 'BOUNCED')}
                              className="text-rose-600 hover:text-rose-800 font-semibold"
                            >
                              Dishonour / Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: BANK STATEMENT RECONCILIATION (AT-17) */}
      {subTab === 'RECONCILIATION' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Bank Statement Import & Auto-Reconciliation (SRS Section 12.4 & AT-17)
                </h2>
                <p className="text-xs text-slate-500">
                  Matches bank statement rows against SGT Book Journal Lines by amount and reference
                  without deleting unmatched book records.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={reconBankId}
                  onChange={(e) => handleLoadStatement(e.target.value)}
                  className="apple-input text-xs"
                >
                  <option value="">Select Bank Account...</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} ({b.accountNumberMasked})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRunReconciliation}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Run Auto-Match (AT-17)
                </button>
              </div>
            </div>

            {reconSummary && (
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/70 text-xs">
                  <div className="text-emerald-700 font-medium">Matched Statement Rows</div>
                  <div className="text-lg font-bold font-mono text-emerald-900">
                    {reconSummary.matchedCount}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-xs">
                  <div className="text-amber-700 font-medium">Unmatched Statement Rows</div>
                  <div className="text-lg font-bold font-mono text-amber-900">
                    {reconSummary.unmatchedStatementLinesCount}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/70 text-xs">
                  <div className="text-blue-700 font-medium">
                    Unmatched SGT Book Entries (Preserved)
                  </div>
                  <div className="text-lg font-bold font-mono text-blue-900">
                    {reconSummary.unmatchedBookLinesCount}
                  </div>
                </div>
              </div>
            )}

            <form
              onSubmit={handleAddStatementRow}
              className="grid grid-cols-1 sm:grid-cols-6 gap-3 pt-3 border-t border-slate-200/60"
            >
              <input
                type="date"
                required
                value={stmtDate}
                onChange={(e) => setStmtDate(e.target.value)}
                className="apple-input text-xs font-mono"
              />
              <input
                type="text"
                required
                placeholder="Statement Description"
                value={stmtDesc}
                onChange={(e) => setStmtDesc(e.target.value)}
                className="apple-input text-xs sm:col-span-2"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Withdrawal / Dr (₹)"
                value={stmtDrRupees}
                onChange={(e) => setStmtDrRupees(e.target.value)}
                className="apple-input text-xs font-mono"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Deposit / Cr (₹)"
                value={stmtCrRupees}
                onChange={(e) => setStmtCrRupees(e.target.value)}
                className="apple-input text-xs font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                + Add Statement Row
              </button>
            </form>
          </div>

          <div className="glass-panel rounded-3xl overflow-hidden">
            {statementLines.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <FileSpreadsheet className="w-7 h-7 text-blue-600 mx-auto mb-2 opacity-80" />
                No statement rows imported for the selected bank account yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                    <th className="py-3 px-4 font-medium">Value Date</th>
                    <th className="py-3 px-3 font-medium">Description</th>
                    <th className="py-3 px-3 font-medium text-right">Withdrawal (Dr)</th>
                    <th className="py-3 px-3 font-medium text-right">Deposit (Cr)</th>
                    <th className="py-3 px-4 font-medium text-right">Reconciliation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {statementLines.map((st) => (
                    <tr key={st.id} className="hover:bg-white/60">
                      <td className="py-3 px-4 font-mono">{formatDateDDMMYYYY(st.valueDate)}</td>
                      <td className="py-3 px-3 text-slate-800">{st.description}</td>
                      <td className="py-3 px-3 text-right font-mono text-rose-700">
                        {st.debitPaise > 0 ? formatINR(st.debitPaise) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-700">
                        {st.creditPaise > 0 ? formatINR(st.creditPaise) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        <span
                          className={
                            st.status === 'MATCHED' ? 'text-emerald-700' : 'text-amber-700'
                          }
                        >
                          {st.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {repayingLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRepaySubmit}
            className="glass-panel rounded-3xl max-w-md w-full p-6 space-y-4 border border-white"
          >
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Record Loan Repayment: {repayingLoan.loanNo}
                </h3>
                <p className="text-xs text-slate-500">
                  Farmer: {repayingLoan.farmerName} · Principal Due:{' '}
                  {formatINR(repayingLoan.principalOutstandingPaise)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepayingLoan(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Repayment Amount (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={repayAmountRupees}
                  onChange={(e) => setRepayAmountRupees(e.target.value)}
                  className="apple-input w-full font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Allocation Policy (DR-01)
                </label>
                <select
                  value={repayAllocationRule}
                  onChange={(e) =>
                    setRepayAllocationRule(e.target.value as RepaymentAllocationOrder)
                  }
                  className="apple-input w-full"
                >
                  <option value={RepaymentAllocationOrder.PRINCIPAL_FIRST}>
                    Principal-First Recovery (Default DR-01)
                  </option>
                  <option value={RepaymentAllocationOrder.INTEREST_FIRST}>
                    Interest-First Recovery
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Receipt Mode
                </label>
                <select
                  value={repayMode}
                  onChange={(e) => setRepayMode(e.target.value as LoanPaymentMode)}
                  className="apple-input w-full"
                >
                  <option value="CASH">Cash Receipt</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI Receipt</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Narration</label>
                <input
                  type="text"
                  placeholder="Optional repayment note"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  className="apple-input w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRepayingLoan(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
              >
                Post Repayment & Update Khata
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loan Schedule & Transactions Modal */}
      {inspectedLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl max-w-2xl w-full p-6 space-y-4 border border-white max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Loan Ledger History: {inspectedLoan.loanNo}
                </h3>
                <p className="text-xs text-slate-500">
                  {inspectedLoan.farmerName} ({inspectedLoan.farmerCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLoan(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/70 text-slate-500">
                  <th className="py-2 px-3">Date & Type</th>
                  <th className="py-2 px-3 text-right">Total Amount</th>
                  <th className="py-2 px-3 text-right">Principal Portion</th>
                  <th className="py-2 px-3 text-right">Interest Portion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {inspectedLoanTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{tx.txnType}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {formatDateDDMMYYYY(tx.transactionDate)} · {tx.paymentMode} ({tx.txnNo})
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {formatINR(tx.totalAmountPaise)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-600">
                      {formatINR(tx.principalComponentPaise)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {formatINR(tx.interestComponentPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

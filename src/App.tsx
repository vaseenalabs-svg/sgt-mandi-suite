/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import {
  AccountRecord,
  AuditLogEntry,
  BankAccountRecord,
  BankStatementLineRecord,
  CashCreditBillRecord,
  ChequeDirection,
  ChequeRecord,
  ChequeStatus,
  CommodityStockStatus,
  CompanySettings,
  DalaliKharidiPattiRecord,
  DalaliVikriPattiRecord,
  DocumentSeriesType,
  DuplicateWarningItem,
  FarmerDirectSettlementReceipt,
  FarmerPattiRecord,
  IssuedDocumentNumber,
  JournalEntryRecord,
  JournalLineInput,
  KharidiPattiRecord,
  LoanPaymentMode,
  LoanRecord,
  LoanTransactionRecord,
  NumberSeriesRecord,
  PartyLedgerStatement,
  PartyRecord,
  PermissionKey,
  RepaymentAllocationOrder,
  StockMovementDirection,
  StockMovementRecord,
  StockOwnershipType,
  UserProfile,
  BuyerCollectionRecord,
  ComprehensiveFinancialReport,
  DayCloseRecord,
  ExpenseCommitmentRecord,
  SmsOutboxRecord,
  SystemBackupSnapshot,
  ValidationIssueRecord,
} from './shared/types';
import { formatDateDDMMYYYY } from './shared/math';
import { LanguageCode, t } from './shared/i18n';
import { CompanySettingsView } from './components/CompanySettingsView';
import { NumberSeriesView } from './components/NumberSeriesView';
import { RolesAndPrivacyView } from './components/RolesAndPrivacyView';
import { AuditTrailView } from './components/AuditTrailView';
import { StockStatusView } from './components/StockStatusView';
import { PartiesAndFarmersView } from './components/PartiesAndFarmersView';
import { KhataBookView } from './components/KhataBookView';
import { CashBankAndLoansView } from './components/CashBankAndLoansView';
import { PattiAndBillingView } from './components/PattiAndBillingView';
import { OperationsReportsAndDayCloseView } from './components/OperationsReportsAndDayCloseView';
import { DashboardView } from './components/DashboardView';
import { FloatingCalculator } from './components/FloatingCalculator';
import { FloatingQuickActionMenu } from './components/FloatingQuickActionMenu';
import { LoginPage } from './components/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LogOut, KeyRound, CheckCircle2, AlertCircle, User, ChevronDown } from 'lucide-react';

type ActiveSection =
  | 'dashboard'
  | 'stock'
  | 'pattis'
  | 'parties'
  | 'khata'
  | 'loans_bank'
  | 'operations_reports'
  | 'foundation'
  | 'numbering'
  | 'roles'
  | 'audit';

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [lang, setLang] = useState<LanguageCode>('en');
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [businessDate] = useState<string>(getTodayIST());

  // Authentication & Session State
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem('sgt_session_token');
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [showInAppChangePassword, setShowInAppChangePassword] = useState<boolean>(false);
  const [inAppCurrPassword, setInAppCurrPassword] = useState('');
  const [inAppNewPassword, setInAppNewPassword] = useState('');
  const [inAppConfirmPassword, setInAppConfirmPassword] = useState('');
  const [inAppChangeErr, setInAppChangeErr] = useState<string | null>(null);
  const [inAppChangeSuccess, setInAppChangeSuccess] = useState(false);
  const [inAppChangeLoading, setInAppChangeLoading] = useState(false);

  const [activeUserId, setActiveUserId] = useState<string>('USR-ADMIN-ROHIT');
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [policyVersions, setPolicyVersions] = useState<any[]>([]);
  const [series, setSeries] = useState<NumberSeriesRecord[]>([]);
  const [issuedNumbers, setIssuedNumbers] = useState<IssuedDocumentNumber[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [kycSample, setKycSample] = useState<any>(null);
  const [stockStatuses, setStockStatuses] = useState<CommodityStockStatus[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRecord[]>([]);

  // Chunk 2, 3 & 4 State
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [khata, setKhata] = useState<{
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
  }>({
    accounts: [],
    journalEntries: [],
    summary: {
      totalAccountingDebitPaise: 0,
      totalAccountingCreditPaise: 0,
      cashInPaise: 0,
      cashOutPaise: 0,
      bankInPaise: 0,
      bankOutPaise: 0,
      nonCashAdjustmentPaise: 0,
    },
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loanTransactions, setLoanTransactions] = useState<LoanTransactionRecord[]>([]);
  const [farmerPattis, setFarmerPattis] = useState<FarmerPattiRecord[]>([]);
  const [kharidiPattis, setKharidiPattis] = useState<KharidiPattiRecord[]>([]);
  const [dalaliVikriPattis, setDalaliVikriPattis] = useState<DalaliVikriPattiRecord[]>([]);
  const [dalaliKharidiPattis, setDalaliKharidiPattis] = useState<DalaliKharidiPattiRecord[]>([]);
  const [cashCreditBills, setCashCreditBills] = useState<CashCreditBillRecord[]>([]);
  const [buyerCollections, setBuyerCollections] = useState<BuyerCollectionRecord[]>([]);
  const [expensesCommitments, setExpensesCommitments] = useState<ExpenseCommitmentRecord[]>([]);
  const [dayCloseStatus, setDayCloseStatus] = useState<DayCloseRecord | null>(null);
  const [dayCloses, setDayCloses] = useState<DayCloseRecord[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssueRecord[]>([]);
  const [smsOutbox, setSmsOutbox] = useState<SmsOutboxRecord[]>([]);
  const [financialReport, setFinancialReport] = useState<ComprehensiveFinancialReport | null>(
    null
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const apiFetch = async (url: string, options: RequestInit = {}, overrideUserId?: string) => {
    const uid = overrideUserId ?? activeUserId;
    const currentToken = sessionToken || localStorage.getItem('sgt_session_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-sgt-user-id': uid,
      ...(currentToken ? { 'x-sgt-session-token': currentToken } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };
    const res = await fetch(url, {
      ...options,
      headers,
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setIsAuthenticated(false);
        setSessionToken(null);
        localStorage.removeItem('sgt_session_token');
      }
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
  };

  const loadBootstrap = async (uid?: string, tokenOverride?: string) => {
    try {
      setError(null);
      const usedToken = tokenOverride ?? sessionToken ?? localStorage.getItem('sgt_session_token');
      if (!usedToken) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      const data = await apiFetch('/api/bootstrap', {}, uid);
      setActiveUser(data.activeUser);
      if (data.activeUser?.id) {
        setActiveUserId(data.activeUser.id);
      }
      setIsAuthenticated(true);
      setUsers(data.users || []);
      setSettings(data.settings);
      setPolicyVersions(data.policyVersions);
      setSeries(data.series);
      setIssuedNumbers(data.issuedNumbers);
      setAuditLogs(data.auditLogs);
      setKycSample(data.kycSample);
      setStockStatuses(data.stockStatuses || []);
      setStockMovements(data.stockMovements || []);
      setParties(data.parties || []);
      if (data.khata) {
        setKhata(data.khata);
      }
      setBankAccounts(data.bankAccounts || []);
      setCheques(data.cheques || []);
      setLoans(data.loans || []);
      setLoanTransactions(data.loanTransactions || []);
      setFarmerPattis(data.farmerPattis || []);
      setKharidiPattis(data.kharidiPattis || []);
      setDalaliVikriPattis(data.dalaliVikriPattis || []);
      setDalaliKharidiPattis(data.dalaliKharidiPattis || []);
      setCashCreditBills(data.cashCreditBills || []);
      setBuyerCollections(data.buyerCollections || []);
      setExpensesCommitments(data.expensesCommitments || []);
      setDayCloseStatus(data.dayCloseStatus || null);
      setDayCloses(data.dayCloses || []);
      setValidationIssues(data.validationIssues || []);
      setSmsOutbox(data.smsOutbox || []);
      setFinancialReport(data.financialReport || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SGT workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('sgt_session_token');
    if (saved) {
      setSessionToken(saved);
      loadBootstrap(undefined, saved);
    } else {
      setLoading(false);
      setIsAuthenticated(false);
    }
  }, []);

  const handleLoginSuccess = async (user: UserProfile, token: string) => {
    setSessionToken(token);
    localStorage.setItem('sgt_session_token', token);
    setActiveUserId(user.id);
    setActiveUser(user);
    setIsAuthenticated(true);
    await loadBootstrap(user.id, token);
  };

  const handleLogout = async () => {
    try {
      if (sessionToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'x-sgt-session-token': sessionToken },
        });
      }
    } catch {
      // Ignore network logout error
    } finally {
      setSessionToken(null);
      setIsAuthenticated(false);
      setActiveUser(null);
      localStorage.removeItem('sgt_session_token');
    }
  };

  const handleInAppPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setInAppChangeErr(null);
    if (inAppNewPassword.length < 6) {
      setInAppChangeErr('New password must be at least 6 characters.');
      return;
    }
    if (inAppNewPassword !== inAppConfirmPassword) {
      setInAppChangeErr('New passwords do not match.');
      return;
    }
    try {
      setInAppChangeLoading(true);
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: activeUserId,
          currentPassword: inAppCurrPassword,
          newPassword: inAppNewPassword,
        }),
      });
      setInAppChangeSuccess(true);
      setTimeout(() => {
        setShowInAppChangePassword(false);
        setInAppChangeSuccess(false);
        setInAppCurrPassword('');
        setInAppNewPassword('');
        setInAppConfirmPassword('');
      }, 1500);
    } catch (err) {
      setInAppChangeErr(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setInAppChangeLoading(false);
    }
  };

  const handleSelectActiveUser = async (newUserId: string) => {
    setActiveUserId(newUserId);
    await loadBootstrap(newUserId);
  };

  const handleCreateUser = async (payload: {
    username: string;
    password: string;
    fullName: string;
    role: UserProfile['role'];
    canViewSensitiveKyc: boolean;
  }) => {
    const data = await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const nextUserId = data.user?.id || activeUserId;
    setActiveUserId(nextUserId);
    await loadBootstrap(nextUserId);
  };

  const handleSaveSettings = async (
    updates: Partial<CompanySettings>,
    expectedVersion: number,
    reason: string
  ) => {
    const data = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ updates, expectedVersion, reason }),
    });
    setSettings(data.settings);
    setPolicyVersions(data.policyVersions);
    const logsData = await apiFetch('/api/audit-logs');
    setAuditLogs(logsData.auditLogs);
  };

  const handleUpdateSeries = async (
    id: string,
    prefix: string,
    paddingLength: number,
    includeFyInNumber: boolean,
    reason: string
  ) => {
    await apiFetch(`/api/numbering/series/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ prefix, paddingLength, includeFyInNumber, reason }),
    });
    await loadBootstrap();
  };

  const handleAllocateTestNumber = async (
    docType: DocumentSeriesType,
    idempotencyKey?: string
  ) => {
    await apiFetch('/api/numbering/allocate', {
      method: 'POST',
      body: JSON.stringify({
        docType,
        transactionDate: businessDate,
        referenceEntityId: `ALLOC-${docType}-${Date.now()}`,
        idempotencyKey,
      }),
    });
    await loadBootstrap();
  };

  const handleCancelNumber = async (formattedNumber: string, cancelReason: string) => {
    await apiFetch('/api/numbering/cancel', {
      method: 'POST',
      body: JSON.stringify({ formattedNumber, cancelReason }),
    });
    await loadBootstrap();
  };

  const handleToggleUnmaskKyc = async (
    unmask: boolean,
    customFields?: {
      farmerName?: string;
      bankAccountNo?: string;
      idProofNo?: string;
    }
  ) => {
    const params = new URLSearchParams({
      unmask: unmask ? 'true' : 'false',
    });
    if (customFields?.farmerName) params.set('farmerName', customFields.farmerName);
    if (customFields?.bankAccountNo) params.set('bankAccountNo', customFields.bankAccountNo);
    if (customFields?.idProofNo) params.set('idProofNo', customFields.idProofNo);

    const data = await apiFetch(`/api/kyc-preview?${params.toString()}`);
    setKycSample(data.kycSample);
    const logsData = await apiFetch('/api/audit-logs');
    setAuditLogs(logsData.auditLogs);
  };

  const handleUpdateUserPermissions = async (
    targetUserId: string,
    permissions: PermissionKey[],
    canViewSensitiveKyc: boolean,
    reason: string
  ) => {
    await apiFetch(`/api/users/${targetUserId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, canViewSensitiveKyc, reason }),
    });
    await loadBootstrap();
  };

  const handleFilterAuditLogs = async (entityType: string, search: string) => {
    const query = new URLSearchParams({ entityType, search }).toString();
    const data = await apiFetch(`/api/audit-logs?${query}`);
    setAuditLogs(data.auditLogs);
  };

  // --- Chunk 4 Stock & Commodity Handlers ---
  const handleRecordStockMovement = async (payload: {
    commodityId: string;
    transactionDate: string;
    direction: StockMovementDirection;
    ownershipType: StockOwnershipType;
    bags: number;
    weightGrams: number;
    ratePerQuintalPaise: number;
    partyId?: string;
    partyName: string;
    settlementMode?: 'CREDIT' | 'CASH' | 'BANK';
    referenceBillNo?: string;
    reason: string;
  }) => {
    const data = await apiFetch('/api/stock/movements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStockStatuses(data.stockStatuses);
    setStockMovements(data.stockMovements);
    await loadBootstrap();
  };

  const handleSeedStandardCommodities = async () => {
    await apiFetch('/api/stock/commodities/seed-standard', {
      method: 'POST',
    });
    await loadBootstrap();
  };

  const handleCreateCommodity = async (payload: {
    code: string;
    nameEn: string;
    nameKn: string;
    gradeVariety: string;
    hsnCode: string;
    referenceBagWeightKg: number | null;
    lowStockThresholdQuintals: number;
    standardRatePerQuintalPaise: number;
    gstApplicableDefault?: boolean;
    cgstRateBps?: number;
    sgstRateBps?: number;
    openingQuantityQuintals?: number;
    openingRatePerQuintalPaise?: number;
    godownLocation?: string;
    openingDate?: string;
  }) => {
    const data = await apiFetch('/api/stock/commodities', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStockStatuses(data.stockStatuses);
    if (data.stockMovements) {
      setStockMovements(data.stockMovements);
    }
    await loadBootstrap();
  };

  const handleUpdateCommodity = async (
    commodityId: string,
    payload: {
      nameEn?: string;
      nameKn?: string;
      gradeVariety?: string;
      hsnCode?: string;
      referenceBagWeightKg?: number | null;
      lowStockThresholdQuintals?: number;
      standardRatePerQuintalPaise?: number;
      status?: 'ACTIVE' | 'INACTIVE';
      reason: string;
    }
  ) => {
    const data = await apiFetch(`/api/stock/commodities/${commodityId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setStockStatuses(data.stockStatuses);
    await loadBootstrap();
  };

  // --- Chunk 2 Party & Khata Handlers ---
  const handleCheckPartyDuplicates = async (
    payload: Record<string, unknown>
  ): Promise<DuplicateWarningItem[]> => {
    const data = await apiFetch('/api/parties/check-duplicates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.warnings || [];
  };

  const handleRegisterParty = async (payload: Record<string, unknown>) => {
    const data = await apiFetch('/api/parties', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return {
      party: data.party as PartyRecord,
      duplicateWarnings: (data.duplicateWarnings || []) as DuplicateWarningItem[],
    };
  };

  const handleUpdateParty = async (partyId: string, payload: Record<string, unknown>) => {
    await apiFetch(`/api/parties/${partyId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleDeleteParty = async (partyId: string, reason: string) => {
    await apiFetch(`/api/parties/${partyId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    await loadBootstrap();
  };

  const handleInspectPartyKyc = async (partyId: string, unmask: boolean) => {
    const data = await apiFetch(`/api/parties/${partyId}?unmask=${unmask ? 'true' : 'false'}`);
    await loadBootstrap();
    return data.party as PartyRecord;
  };

  const handleLoadPartyLedger = async (
    partyId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<PartyLedgerStatement> => {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    const data = await apiFetch(`/api/parties/${partyId}/ledger?${params.toString()}`);
    return data.statement as PartyLedgerStatement;
  };

  const handlePostJournalEntry = async (payload: {
    transactionDate: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    narration: string;
    lines: JournalLineInput[];
  }) => {
    await apiFetch('/api/khata/entries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleReverseJournalEntry = async (
    entryId: string,
    reversalDate: string,
    reason: string
  ) => {
    await apiFetch(`/api/khata/entries/${entryId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reversalDate, reason }),
    });
    await loadBootstrap();
  };

  // --- Chunk 3 Cash, Bank, Cheque & Loan Handlers ---
  const handleCreateBankAccount = async (payload: {
    bankName: string;
    branchName: string;
    accountLabel: string;
    accountType: 'SAVINGS' | 'CURRENT' | 'OD_CC';
    accountNumber: string;
    ifscCode: string;
    openingBalancePaise: number;
    openingBalanceType: 'DR' | 'CR';
    openingDate: string;
  }) => {
    await apiFetch('/api/banks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleRecordInternalTransfer = async (payload: {
    transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK';
    transactionDate: string;
    amountPaise: number;
    fromBankAccountId?: string | null;
    toBankAccountId?: string | null;
    referenceNo?: string;
    narration?: string;
  }) => {
    await apiFetch('/api/banks/transfers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleCreateCheque = async (payload: {
    chequeNo: string;
    chequeDate: string;
    direction: ChequeDirection;
    bankAccountId: string;
    partyId: string | null;
    partyName: string;
    amountPaise: number;
    purpose: string;
  }) => {
    await apiFetch('/api/cheques', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleUpdateChequeStatus = async (
    chequeId: string,
    payload: {
      newStatus: ChequeStatus;
      actionDate: string;
      reason?: string;
    }
  ) => {
    await apiFetch(`/api/cheques/${chequeId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleAddStatementLines = async (
    bankAccountId: string,
    lines: Array<{
      valueDate: string;
      description: string;
      referenceNo?: string;
      debitPaise: number;
      creditPaise: number;
    }>
  ): Promise<BankStatementLineRecord[]> => {
    const data = await apiFetch(`/api/banks/${bankAccountId}/statement-lines`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    });
    return data.statementLines || [];
  };

  const handleFetchStatementLines = async (
    bankAccountId: string
  ): Promise<BankStatementLineRecord[]> => {
    const data = await apiFetch(`/api/banks/${bankAccountId}/statement-lines`);
    return data.statementLines || [];
  };

  const handleReconcileBankStatement = async (bankAccountId: string) => {
    const data = await apiFetch(`/api/banks/${bankAccountId}/reconcile`, {
      method: 'POST',
    });
    await loadBootstrap();
    return data.reconciliation;
  };

  const handleDisburseFarmerLoan = async (payload: {
    farmerId: string;
    disbursementDate: string;
    principalPaise: number;
    paymentMode: LoanPaymentMode;
    bankAccountId?: string | null;
    bankReference?: string;
    interestRateBps?: number;
    notes?: string;
  }) => {
    await apiFetch('/api/loans', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleRecordLoanRepayment = async (
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
  ) => {
    await apiFetch(`/api/loans/${loanId}/repayments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  // --- Chunk 5 Farmer Patti & Kharidi Patti Handlers ---
  const handleCreateFarmerPatti = async (
    payload: Record<string, unknown>
  ): Promise<FarmerPattiRecord> => {
    const data = await apiFetch('/api/pattis/farmer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.farmerPatti as FarmerPattiRecord;
  };

  const handleDirectSettleFarmerPattis = async (payload: {
    farmerId: string;
    pattiIds: string[];
    settlementDate?: string;
    settlementAmountPaise?: number;
    paymentMode: 'CASH' | 'BANK';
    bankAccountId?: string | null;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<FarmerDirectSettlementReceipt> => {
    const data = await apiFetch('/api/pattis/farmer/direct-settlement', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.receipt as FarmerDirectSettlementReceipt;
  };

  const handleCreateKharidiPatti = async (
    payload: Record<string, unknown>
  ): Promise<KharidiPattiRecord> => {
    const data = await apiFetch('/api/pattis/kharidi', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.kharidiPatti as KharidiPattiRecord;
  };

  // --- Chunk 6 Dalali Pattis & Cash/Credit Bill Handlers ---
  const handleCreateDalaliVikriPatti = async (
    payload: Record<string, unknown>
  ): Promise<DalaliVikriPattiRecord> => {
    const data = await apiFetch('/api/pattis/dalali-vikri', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.dalaliVikriPatti as DalaliVikriPattiRecord;
  };

  const handleCreateDalaliKharidiPatti = async (
    payload: Record<string, unknown>
  ): Promise<DalaliKharidiPattiRecord> => {
    const data = await apiFetch('/api/pattis/dalali-kharidi', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.dalaliKharidiPatti as DalaliKharidiPattiRecord;
  };

  const handleCreateCashCreditBill = async (
    payload: Record<string, unknown>
  ): Promise<CashCreditBillRecord> => {
    const data = await apiFetch('/api/bills/cash-credit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.cashCreditBill as CashCreditBillRecord;
  };

  const handleReverseCashCreditBill = async (
    billId: string,
    payload: { reversalDate: string; reason: string }
  ): Promise<CashCreditBillRecord> => {
    const data = await apiFetch(`/api/bills/cash-credit/${billId}/reverse`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
    return data.cashCreditBill as CashCreditBillRecord;
  };

  // Chunk 7, 8 & 9 Handlers
  const handleRecordBuyerCollection = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleRecordExpenseOrCommitment = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleCloseBusinessDay = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/day-close', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleReopenBusinessDay = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/day-close/reopen', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleSendSms = async (payload: Record<string, unknown>) => {
    await apiFetch('/api/sms/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadBootstrap();
  };

  const handleRetrySms = async (smsId: string) => {
    await apiFetch(`/api/sms/${smsId}/retry`, {
      method: 'POST',
    });
    await loadBootstrap();
  };

  const handleCreateBackup = async (): Promise<SystemBackupSnapshot> => {
    const data = await apiFetch('/api/system/backup', {
      method: 'POST',
    });
    await loadBootstrap();
    return data.snapshot as SystemBackupSnapshot;
  };

  const handleVerifyBackup = async (snapshot: SystemBackupSnapshot) => {
    const data = await apiFetch('/api/system/verify-backup', {
      method: 'POST',
      body: JSON.stringify({ snapshot }),
    });
    return data.verification;
  };

  const cashInHandAccount = khata.accounts.find((a) => a.code === '1001');
  const cashInHandBalancePaise = cashInHandAccount
    ? (cashInHandAccount.totalDebitPaise || 0) - (cashInHandAccount.totalCreditPaise || 0)
    : 0;

  if (!isAuthenticated && !loading) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between gap-6 shadow-xs no-print">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-emerald-800 whitespace-nowrap shrink-0 font-display"
        >
          {t(lang, 'brandName')}
        </a>

        <nav
          className="flex items-center gap-5 text-xs font-medium text-slate-600 overflow-x-auto no-scrollbar py-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            type="button"
            onClick={() => setActiveSection('dashboard')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'dashboard'
                ? 'text-emerald-700 border-emerald-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' : 'Dashboard'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('stock')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'stock'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {t(lang, 'navStockStatus')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('pattis')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'pattis'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ಪಟ್ಟಿ ಮತ್ತು ಬಿಲ್ಲಿಂಗ್' : 'Pattis & Billing'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('parties')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'parties'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ರೈತರು ಮತ್ತು ಪಾರ್ಟಿಗಳು' : 'Farmers & Parties'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('loans_bank')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'loans_bank'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ಸಾಲ ಮತ್ತು ಬ್ಯಾಂಕ್' : 'Loans, Cash & Bank'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('khata')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'khata'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ಖಾತಾ ಪುಸ್ತಕ' : 'Khata Book'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('operations_reports')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'operations_reports'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {lang === 'kn' ? 'ವಸೂಲಾತಿ, ವರದಿ ಮತ್ತು ದಿನದ ಮುಕ್ತಾಯ' : 'Collections, Reports & Day-Close'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('foundation')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'foundation'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {t(lang, 'navFoundation')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('numbering')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'numbering'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {t(lang, 'navNumberSeries')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('roles')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'roles'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {t(lang, 'navRolesAccess')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('audit')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'audit'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            {t(lang, 'navAuditTrail')}
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-all shadow-xs inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Calculator className="w-4 h-4" />
            {t(lang, 'openCalculator')}
          </button>

          <button
            type="button"
            onClick={() => setShowInAppChangePassword(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white/80 hover:bg-white rounded-xl border border-slate-200 shadow-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            title="Change Admin Password"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Password</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50/80 hover:bg-red-100 rounded-xl border border-red-200/80 shadow-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            title="Log Out of System"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Secondary Workspace Toolbar */}
      <div className="max-w-7xl w-full mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 bg-white/60 backdrop-blur-xs no-print">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{t(lang, 'brandTagline')}</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            {t(lang, 'businessDate')}:{' '}
            <strong className="font-mono text-slate-900">{formatDateDDMMYYYY(businessDate)}</strong>
          </span>
          {activeUser && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                {t(lang, 'activeRole')}:{' '}
                <strong className="text-blue-600">{activeUser.fullName}</strong>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {users.length > 0 && (
            <div className="inline-flex items-center gap-2 h-9 px-3 bg-white rounded-xl border border-slate-300 shadow-xs hover:border-slate-400 transition-colors">
              <User className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Role:</span>
              <div className="relative inline-flex items-center">
                <select
                  aria-label="Switch Active User Role"
                  value={activeUserId}
                  onChange={(e) => handleSelectActiveUser(e.target.value)}
                  className="appearance-none bg-transparent text-xs font-bold text-slate-900 pr-5 pl-1 py-1 focus:outline-none cursor-pointer leading-normal"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id} className="text-slate-900 bg-white py-1">
                      {u.role} — {u.username}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 pointer-events-none absolute right-0" />
              </div>
            </div>
          )}

          <div className="inline-flex items-center gap-1 h-9 p-1 bg-slate-200/80 rounded-xl border border-slate-300/80 shadow-xs">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`h-7 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
                lang === 'en'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/50'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('kn')}
              className={`h-7 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
                lang === 'kn'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/50'
              }`}
            >
              ಕನ್ನಡ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {loading ? (
          <div className="glass-panel rounded-3xl p-12 text-center space-y-3">
            <div className="text-base font-semibold text-slate-800">
              Loading Shree Guru Traders Core Platform...
            </div>
            <div className="text-xs text-slate-500">
              Initializing SQLite ACID engine, Khata ledger, and commodity stock valuations
            </div>
          </div>
        ) : error ? (
          <div className="glass-panel rounded-3xl p-8 border-rose-200 bg-rose-50/60 text-rose-800 space-y-3">
            <div className="font-semibold">Workspace Error</div>
            <div className="text-sm">{error}</div>
            <button
              onClick={() => loadBootstrap()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Retry Connection
            </button>
          </div>
        ) : settings && activeUser ? (
          <ErrorBoundary key={activeSection} sectionName={activeSection}>
            {activeSection === 'dashboard' && (
              <DashboardView
                lang={lang}
                activeUser={activeUser}
                businessDate={businessDate}
                settings={settings}
                parties={parties}
                stockStatuses={stockStatuses}
                stockMovements={stockMovements}
                farmerPattis={farmerPattis}
                kharidiPattis={kharidiPattis}
                dalaliVikriPattis={dalaliVikriPattis}
                dalaliKharidiPattis={dalaliKharidiPattis}
                cashCreditBills={cashCreditBills}
                buyerCollections={buyerCollections}
                expensesCommitments={expensesCommitments}
                bankAccounts={bankAccounts}
                loans={loans}
                khata={khata}
                cashInHandBalancePaise={cashInHandBalancePaise}
                onNavigate={(sec) => setActiveSection(sec)}
                onRecordBuyerCollection={handleRecordBuyerCollection}
                onRecordExpenseOrCommitment={handleRecordExpenseOrCommitment}
                onPostJournalEntry={handlePostJournalEntry}
                onRefresh={() => loadBootstrap()}
              />
            )}

            {activeSection === 'stock' && (
              <StockStatusView
                stockStatuses={stockStatuses}
                stockMovements={stockMovements}
                parties={parties}
                farmerPattis={farmerPattis}
                kharidiPattis={kharidiPattis}
                dalaliVikriPattis={dalaliVikriPattis}
                dalaliKharidiPattis={dalaliKharidiPattis}
                cashCreditBills={cashCreditBills}
                businessDate={businessDate}
                activeUser={activeUser}
                lang={lang}
                onRefresh={() => loadBootstrap()}
                onRecordMovement={handleRecordStockMovement}
                onSeedStandardCommodities={handleSeedStandardCommodities}
                onCreateCommodity={handleCreateCommodity}
                onUpdateCommodity={handleUpdateCommodity}
              />
            )}

            {activeSection === 'pattis' && (
              <PattiAndBillingView
                lang={lang}
                activeUser={activeUser}
                businessDate={businessDate}
                settings={settings}
                parties={parties}
                stockStatuses={stockStatuses}
                loans={loans}
                bankAccounts={bankAccounts}
                farmerPattis={farmerPattis}
                kharidiPattis={kharidiPattis}
                dalaliVikriPattis={dalaliVikriPattis}
                dalaliKharidiPattis={dalaliKharidiPattis}
                cashCreditBills={cashCreditBills}
                onCreateFarmerPatti={handleCreateFarmerPatti}
                onDirectSettleFarmerPattis={handleDirectSettleFarmerPattis}
                onCreateKharidiPatti={handleCreateKharidiPatti}
                onCreateDalaliVikriPatti={handleCreateDalaliVikriPatti}
                onCreateDalaliKharidiPatti={handleCreateDalaliKharidiPatti}
                onCreateCashCreditBill={handleCreateCashCreditBill}
                onReverseCashCreditBill={handleReverseCashCreditBill}
              />
            )}

            {activeSection === 'parties' && (
              <PartiesAndFarmersView
                parties={parties}
                activeUser={activeUser}
                businessDate={businessDate}
                lang={lang}
                onCheckDuplicates={handleCheckPartyDuplicates}
                onRegisterParty={handleRegisterParty}
                onUpdateParty={handleUpdateParty}
                onDeleteParty={handleDeleteParty}
                onInspectPartyKyc={handleInspectPartyKyc}
                onLoadPartyLedger={handleLoadPartyLedger}
              />
            )}

            {activeSection === 'loans_bank' && (
              <CashBankAndLoansView
                lang={lang}
                activeUser={activeUser}
                businessDate={businessDate}
                bankAccounts={bankAccounts}
                cheques={cheques}
                loans={loans}
                loanTransactions={loanTransactions}
                parties={parties}
                cashInHandBalancePaise={cashInHandBalancePaise}
                onCreateBankAccount={handleCreateBankAccount}
                onRecordInternalTransfer={handleRecordInternalTransfer}
                onCreateCheque={handleCreateCheque}
                onUpdateChequeStatus={handleUpdateChequeStatus}
                onAddStatementLines={handleAddStatementLines}
                onFetchStatementLines={handleFetchStatementLines}
                onReconcileBankStatement={handleReconcileBankStatement}
                onDisburseFarmerLoan={handleDisburseFarmerLoan}
                onRecordLoanRepayment={handleRecordLoanRepayment}
              />
            )}

            {activeSection === 'khata' && (
              <KhataBookView
                lang={lang}
                activeUser={activeUser}
                businessDate={businessDate}
                khata={khata}
                parties={parties}
                onPostJournalEntry={handlePostJournalEntry}
                onReverseJournalEntry={handleReverseJournalEntry}
              />
            )}

            {activeSection === 'operations_reports' && (
              <OperationsReportsAndDayCloseView
                lang={lang}
                activeUser={activeUser}
                businessDate={businessDate}
                parties={parties}
                bankAccounts={bankAccounts}
                cashCreditBills={cashCreditBills}
                kharidiPattis={kharidiPattis}
                dalaliKharidiPattis={dalaliKharidiPattis}
                buyerCollections={buyerCollections}
                expensesCommitments={expensesCommitments}
                dayCloseStatus={dayCloseStatus}
                dayCloses={dayCloses}
                validationIssues={validationIssues}
                smsOutbox={smsOutbox}
                financialReport={financialReport}
                onRecordBuyerCollection={handleRecordBuyerCollection}
                onRecordExpenseOrCommitment={handleRecordExpenseOrCommitment}
                onCloseBusinessDay={handleCloseBusinessDay}
                onReopenBusinessDay={handleReopenBusinessDay}
                onSendSms={handleSendSms}
                onRetrySms={handleRetrySms}
                onCreateBackup={handleCreateBackup}
                onVerifyBackup={handleVerifyBackup}
              />
            )}

            {activeSection === 'foundation' && (
              <CompanySettingsView
                settings={settings}
                policyVersions={policyVersions}
                activeUser={activeUser}
                lang={lang}
                onSaveSettings={handleSaveSettings}
              />
            )}

            {activeSection === 'numbering' && (
              <NumberSeriesView
                series={series}
                issuedNumbers={issuedNumbers}
                activeUser={activeUser}
                lang={lang}
                onUpdateSeries={handleUpdateSeries}
                onAllocateTestNumber={handleAllocateTestNumber}
                onCancelNumber={handleCancelNumber}
              />
            )}

            {activeSection === 'roles' && kycSample && (
              <RolesAndPrivacyView
                users={users}
                activeUser={activeUser}
                kycSample={kycSample}
                lang={lang}
                onSelectActiveUser={handleSelectActiveUser}
                onCreateUser={handleCreateUser}
                onToggleUnmaskKyc={handleToggleUnmaskKyc}
                onUpdateUserPermissions={handleUpdateUserPermissions}
              />
            )}

            {activeSection === 'audit' && (
              <AuditTrailView
                logs={auditLogs}
                lang={lang}
                onFilterLogs={handleFilterAuditLogs}
              />
            )}
          </ErrorBoundary>
        ) : null}
      </main>

      {/* Persistent Non-Posting Floating Calculator Drawer (SRS Sec 15.1 & 15.2) */}
      {settings && (
        <FloatingCalculator
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
          lang={lang}
          settings={settings}
        />
      )}

      {/* Persistent Floating Quick Action Menu (Section C) */}
      {settings && activeUser && (
        <FloatingQuickActionMenu
          businessDate={businessDate}
          parties={parties}
          bankAccounts={bankAccounts}
          stockStatuses={stockStatuses}
          onNavigateSection={(sec) => setActiveSection(sec)}
          onCreateVoucher={handleRecordExpenseOrCommitment}
          onPostJournalEntry={handlePostJournalEntry}
          onRegisterParty={handleRegisterParty}
          onRecordMovement={handleRecordStockMovement}
        />
      )}

      {/* Quiet Footer */}
      <footer className="max-w-7xl w-full mx-auto px-6 py-6 text-xs text-slate-400 flex items-center justify-between border-t border-slate-200/60 no-print">
        <span>Shree Guru Traders (SGT) · Integrated Business & Accounting Software</span>
        <span>India Standard Time (Asia/Kolkata) · Decimal-Safe Paise & Gram Engine</span>
      </footer>

      {/* In-App Change Password Modal */}
      {showInAppChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl p-7 sm:p-8 shadow-2xl border border-white/60">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-display">
                  Change Password
                </h3>
                <p className="text-xs text-slate-500">
                  Logged in as: <strong className="text-blue-600">{activeUser?.fullName}</strong>
                </p>
              </div>
            </div>

            {inAppChangeErr && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{inAppChangeErr}</span>
              </div>
            )}

            {inAppChangeSuccess ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                <h4 className="font-bold text-slate-900 text-base">Password Updated Successfully!</h4>
                <p className="text-xs text-slate-500">Credentials have been securely updated in SQLite.</p>
              </div>
            ) : (
              <form onSubmit={handleInAppPasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={inAppCurrPassword}
                    onChange={(e) => setInAppCurrPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={inAppNewPassword}
                    onChange={(e) => setInAppNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={inAppConfirmPassword}
                    onChange={(e) => setInAppConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInAppChangePassword(false);
                      setInAppChangeErr(null);
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inAppChangeLoading}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {inAppChangeLoading ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

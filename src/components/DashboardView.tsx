import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Receipt,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AccountRecord,
  BankAccountRecord,
  BuyerCollectionRecord,
  CashCreditBillRecord,
  CommodityStockStatus,
  CompanySettings,
  DalaliKharidiPattiRecord,
  DalaliVikriPattiRecord,
  ExpenseCommitmentCategory,
  ExpenseCommitmentRecord,
  FarmerPattiRecord,
  JournalEntryRecord,
  JournalLineInput,
  KharidiPattiRecord,
  LoanRecord,
  PartyRecord,
  PermissionKey,
  StockMovementRecord,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

export type DashboardTrendWindow = '7D' | '30D' | '3M' | '6M' | '1Y';

interface DashboardViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  businessDate: string;
  settings: CompanySettings;
  parties: PartyRecord[];
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
  farmerPattis: FarmerPattiRecord[];
  kharidiPattis: KharidiPattiRecord[];
  dalaliVikriPattis: DalaliVikriPattiRecord[];
  dalaliKharidiPattis: DalaliKharidiPattiRecord[];
  cashCreditBills: CashCreditBillRecord[];
  buyerCollections: BuyerCollectionRecord[];
  expensesCommitments: ExpenseCommitmentRecord[];
  bankAccounts: BankAccountRecord[];
  loans: LoanRecord[];
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
  cashInHandBalancePaise: number;
  onNavigate: (
    section:
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
      | 'audit',
    subView?: string
  ) => void;
  onRecordBuyerCollection: (payload: Record<string, unknown>) => Promise<void>;
  onRecordExpenseOrCommitment: (payload: Record<string, unknown>) => Promise<void>;
  onPostJournalEntry: (payload: {
    transactionDate: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    narration: string;
    lines: JournalLineInput[];
  }) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  activeUser,
  businessDate,
  parties,
  stockStatuses,
  stockMovements,
  farmerPattis,
  kharidiPattis,
  dalaliVikriPattis,
  dalaliKharidiPattis,
  cashCreditBills,
  buyerCollections,
  expensesCommitments,
  bankAccounts,
  khata,
  cashInHandBalancePaise,
  onNavigate,
  onRecordBuyerCollection,
  onRecordExpenseOrCommitment,
  onPostJournalEntry,
}) => {
  const [trendWindow, setTrendWindow] = useState<DashboardTrendWindow>('7D');
  const [dateFilterFrom, setDateFilterFrom] = useState<string>('');
  const [dateFilterTo, setDateFilterTo] = useState<string>('');
  const [quickModal, setQuickModal] = useState<
    'NONE' | 'RECEIVE_MONEY' | 'MAKE_PAYMENT' | 'MANDI_EXPENSES'
  >('NONE');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Quick Action Form States
  const [rmBuyerId, setRmBuyerId] = useState<string>('');
  const [rmAmountRupees, setRmAmountRupees] = useState<string>('');
  const [rmMode, setRmMode] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI'>('CASH');
  const [rmBankId, setRmBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [rmDate, setRmDate] = useState<string>(businessDate);
  const [rmNotes, setRmNotes] = useState<string>('');

  const [mpPartyId, setMpPartyId] = useState<string>('');
  const [mpAmountRupees, setMpAmountRupees] = useState<string>('');
  const [mpMode, setMpMode] = useState<'CASH' | 'BANK'>('CASH');
  const [mpDate, setMpDate] = useState<string>(businessDate);
  const [mpNarration, setMpNarration] = useState<string>('');

  const [meCategory, setMeCategory] = useState<ExpenseCommitmentCategory>('HAMALI_LABOR');
  const [mePayee, setMePayee] = useState<string>('');
  const [meAmountRupees, setMeAmountRupees] = useState<string>('');
  const [meMode, setMeMode] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [meBankId, setMeBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [meDate, setMeDate] = useState<string>(businessDate);
  const [meDescription, setMeDescription] = useState<string>('');

  const canRecordCashBank =
    activeUser.permissions.includes(PermissionKey.MANAGE_CASH_BANK) ||
    activeUser.permissions.includes(PermissionKey.CREATE_TRADING_BILLS) ||
    activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS);

  const commodityNameById = useMemo(() => {
    const map = new Map<string, string>();
    stockStatuses.forEach((s) => map.set(s.commodity.id, s.commodity.nameEn));
    return map;
  }, [stockStatuses]);

  const buyers = useMemo(
    () =>
      parties.filter(
        (p) =>
          p.status === 'ACTIVE' &&
          (p.partyType === 'BUYER' ||
            p.partyType === 'WHOLESALER' ||
            p.partyType === 'FACTORY' ||
            p.partyType === 'TRADER')
      ),
    [parties]
  );

  const inDateRange = (txDate: string): boolean => {
    if (dateFilterFrom && txDate < dateFilterFrom) return false;
    if (dateFilterTo && txDate > dateFilterTo) return false;
    return true;
  };

  // 1. Sales Summary (Calculated from actual saved transactions)
  const salesMetrics = useMemo(() => {
    const activeCashCreditBills = cashCreditBills.filter(
      (b) => b.status === 'FINALIZED' && inDateRange(b.billDate)
    );
    const activeKharidiPattis = kharidiPattis.filter((p) => inDateRange(p.invoiceDate));
    const activeDalaliKharidi = dalaliKharidiPattis.filter(
      (p) => p.status === 'FINALIZED' && inDateRange(p.pattiDate)
    );
    const activeCollections = buyerCollections.filter((c) => inDateRange(c.receiptDate));

    const totalBillsSalesPaise = activeCashCreditBills.reduce(
      (s, b) => s + b.netBillAmountPaise,
      0
    );
    const totalKharidiSalesPaise = activeKharidiPattis.reduce(
      (s, p) => s + p.netReceivablePaise,
      0
    );
    const totalDalaliKharidiPaise = activeDalaliKharidi.reduce(
      (s, p) => s + p.netReceivablePaise,
      0
    );

    const totalSalesPaise =
      totalBillsSalesPaise + totalKharidiSalesPaise + totalDalaliKharidiPaise;

    const immediateCollectedOnBillsPaise = activeCashCreditBills.reduce(
      (s, b) => s + b.amountReceivedNowPaise,
      0
    );
    const immediateCollectedOnKharidiPaise = activeKharidiPattis.reduce(
      (s, p) => s + p.amountReceivedNowPaise,
      0
    );
    const immediateCollectedOnDalaliPaise = activeDalaliKharidi.reduce(
      (s, p) => s + p.amountReceivedNowPaise,
      0
    );
    const subsequentCollectionsPaise = activeCollections.reduce(
      (s, c) => s + c.amountPaise,
      0
    );

    const cashSalesCollectedPaise = Math.min(
      totalSalesPaise,
      immediateCollectedOnBillsPaise +
        immediateCollectedOnKharidiPaise +
        immediateCollectedOnDalaliPaise +
        subsequentCollectionsPaise
    );

    const creditSalesReceivablePaise = Math.max(0, totalSalesPaise - cashSalesCollectedPaise);

    return {
      totalSalesPaise,
      cashSalesCollectedPaise,
      creditSalesReceivablePaise,
    };
  }, [
    cashCreditBills,
    kharidiPattis,
    dalaliKharidiPattis,
    buyerCollections,
    dateFilterFrom,
    dateFilterTo,
  ]);

  // 2. Purchase Insights (Calculated from actual saved transactions)
  const purchaseMetrics = useMemo(() => {
    const activeFarmerPattis = farmerPattis.filter((p) => inDateRange(p.pattiDate));
    const activeDalaliVikri = dalaliVikriPattis.filter(
      (p) => p.status === 'FINALIZED' && inDateRange(p.pattiDate)
    );
    const pattiRefs = new Set([
      ...farmerPattis.map((p) => p.pattiNo),
      ...dalaliVikriPattis.map((p) => p.pattiNo),
    ]);
    const directStockPurchases = stockMovements.filter(
      (m) =>
        m.direction === 'GOODS_IN' &&
        m.ownershipType === 'SGT_OWNED' &&
        !pattiRefs.has(m.referenceBillNo) &&
        inDateRange(m.transactionDate)
    );

    const pattiPurchaseTotalPaise = activeFarmerPattis.reduce(
      (s, p) => s + p.netPayablePaise,
      0
    );
    const dalaliVikriTotalPaise = activeDalaliVikri.reduce(
      (s, p) => s + p.netPayablePaise,
      0
    );
    const directPurchaseTotalPaise = directStockPurchases.reduce(
      (s, m) => s + m.totalValuePaise,
      0
    );

    const totalPurchasesPaise =
      pattiPurchaseTotalPaise + dalaliVikriTotalPaise + directPurchaseTotalPaise;

    const paidFarmerPattiPaise = activeFarmerPattis.reduce(
      (s, p) => s + p.amountPaidNowPaise,
      0
    );
    const paidDalaliVikriPaise = activeDalaliVikri.reduce(
      (s, p) => s + p.amountPaidNowPaise,
      0
    );
    const paidDirectPurchasesPaise = directStockPurchases.reduce(
      (s, m) => s + (m.settlementMode === 'CREDIT' ? 0 : m.totalValuePaise),
      0
    );

    const cashPurchasesPaidPaise = Math.min(
      totalPurchasesPaise,
      paidFarmerPattiPaise + paidDalaliVikriPaise + paidDirectPurchasesPaise
    );
    const creditPurchasesOutstandingPaise = Math.max(
      0,
      totalPurchasesPaise - cashPurchasesPaidPaise
    );

    return {
      totalPurchasesPaise,
      cashPurchasesPaidPaise,
      creditPurchasesOutstandingPaise,
    };
  }, [farmerPattis, dalaliVikriPattis, stockMovements, dateFilterFrom, dateFilterTo]);

  // 3. Liquid Assets (Cash + Bank + Inflow / Outflow)
  const liquidMetrics = useMemo(() => {
    const bankTotalPaise = bankAccounts
      .filter((b) => b.status === 'ACTIVE')
      .reduce(
        (s, b) =>
          s +
          (b.currentBookBalanceType === 'CR'
            ? -b.currentBookBalancePaise
            : b.currentBookBalancePaise),
        0
      );
    const totalLiquidPaise = cashInHandBalancePaise + bankTotalPaise;
    const inflowPaise =
      (khata.summary.cashInPaise || 0) + (khata.summary.bankInPaise || 0);
    const outflowPaise =
      (khata.summary.cashOutPaise || 0) + (khata.summary.bankOutPaise || 0);
    return {
      totalLiquidPaise,
      inflowPaise,
      outflowPaise,
    };
  }, [bankAccounts, cashInHandBalancePaise, khata.summary]);

  // 4. Daily Operational Expenses
  const dailyExpenseMetrics = useMemo(() => {
    const targetDay = dateFilterTo || businessDate;
    const filteredExpenses = expensesCommitments.filter((e) => {
      if (e.status !== 'FINALIZED') return false;
      if (e.accountingClassification !== 'OPERATING_EXPENSE') return false;
      if (e.isRestrictedPersonal) return false;
      if (dateFilterFrom || dateFilterTo) {
        return inDateRange(e.voucherDate);
      }
      return e.voucherDate === targetDay;
    });
    const totalDailyExpensesPaise = filteredExpenses.reduce(
      (s, e) => s + e.totalAmountPaise,
      0
    );
    return {
      totalDailyExpensesPaise,
      count: filteredExpenses.length,
    };
  }, [expensesCommitments, businessDate, dateFilterFrom, dateFilterTo]);

  // 5. Revenue Trend Graph Data (7D, 30D, 3M, 6M, 1Y)
  const revenueTrendData = useMemo(() => {
    const daysMap: Record<DashboardTrendWindow, number> = {
      '7D': 7,
      '30D': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
    };
    const totalDays = daysMap[trendWindow];
    const baseDate = new Date(`${businessDate}T00:00:00`);

    const dailyRevenuePaise = new Map<string, number>();
    cashCreditBills
      .filter((b) => b.status === 'FINALIZED')
      .forEach((b) => {
        dailyRevenuePaise.set(
          b.billDate,
          (dailyRevenuePaise.get(b.billDate) || 0) + b.netBillAmountPaise
        );
      });
    kharidiPattis.forEach((p) => {
      dailyRevenuePaise.set(
        p.invoiceDate,
        (dailyRevenuePaise.get(p.invoiceDate) || 0) + p.netReceivablePaise
      );
    });
    dalaliKharidiPattis
      .filter((p) => p.status === 'FINALIZED')
      .forEach((p) => {
        dailyRevenuePaise.set(
          p.pattiDate,
          (dailyRevenuePaise.get(p.pattiDate) || 0) + p.netReceivablePaise
        );
      });

    if (totalDays <= 30) {
      const points: Array<{ label: string; dateStr: string; revenueRupees: number }> = [];
      for (let i = totalDays - 1; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const paise = dailyRevenuePaise.get(iso) || 0;
        points.push({
          label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          dateStr: iso,
          revenueRupees: Math.round(paise / 100),
        });
      }
      return points;
    }

    const bucketSize = totalDays === 90 ? 7 : totalDays === 180 ? 15 : 30;
    const buckets: Array<{ label: string; dateStr: string; revenueRupees: number }> = [];
    for (let i = totalDays - 1; i >= 0; i -= bucketSize) {
      let bucketPaise = 0;
      const bucketStart = new Date(baseDate);
      bucketStart.setDate(bucketStart.getDate() - i);
      for (let j = 0; j < bucketSize && i - j >= 0; j++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - (i - j));
        const iso = d.toISOString().slice(0, 10);
        bucketPaise += dailyRevenuePaise.get(iso) || 0;
      }
      buckets.push({
        label: bucketStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        dateStr: bucketStart.toISOString().slice(0, 10),
        revenueRupees: Math.round(bucketPaise / 100),
      });
    }
    return buckets;
  }, [trendWindow, businessDate, cashCreditBills, kharidiPattis, dalaliKharidiPattis]);

  // 6. Live Floor Feed (Chronological recent saved transactions)
  const liveFloorFeed = useMemo(() => {
    const items: Array<{
      id: string;
      badge: 'S' | 'P' | 'C' | 'E' | 'M';
      title: string;
      subtitle: string;
      amountPaise: number;
      isPositive: boolean;
      createdAt: string;
      targetSection:
        | 'pattis'
        | 'stock'
        | 'operations_reports'
        | 'khata'
        | 'loans_bank';
    }> = [];

    cashCreditBills.forEach((b) => {
      items.push({
        id: `CB-${b.id}`,
        badge: 'S',
        title: `Sold Item · ${b.buyerName}`,
        subtitle: `LOT ${b.billNo}`,
        amountPaise: b.netBillAmountPaise,
        isPositive: true,
        createdAt: b.createdAt || `${b.billDate}T12:00:00Z`,
        targetSection: 'pattis',
      });
    });

    kharidiPattis.forEach((p) => {
      items.push({
        id: `KP-${p.id}`,
        badge: 'S',
        title: `Sold Item · ${p.buyerName}`,
        subtitle: `LOT ${p.invoiceNo}`,
        amountPaise: p.netReceivablePaise,
        isPositive: true,
        createdAt: p.createdAt || `${p.invoiceDate}T12:00:00Z`,
        targetSection: 'pattis',
      });
    });

    dalaliKharidiPattis.forEach((p) => {
      items.push({
        id: `DK-${p.id}`,
        badge: 'S',
        title: `Dalali Sale · ${p.buyerName}`,
        subtitle: `LOT ${p.pattiNo}`,
        amountPaise: p.netReceivablePaise,
        isPositive: true,
        createdAt: p.createdAt || `${p.pattiDate}T12:00:00Z`,
        targetSection: 'pattis',
      });
    });

    farmerPattis.forEach((p) => {
      items.push({
        id: `FP-${p.id}`,
        badge: 'P',
        title: `Farmer Patti · ${p.farmerName}`,
        subtitle: `LOT ${p.pattiNo}`,
        amountPaise: p.netPayablePaise,
        isPositive: false,
        createdAt: p.createdAt || `${p.pattiDate}T12:00:00Z`,
        targetSection: 'pattis',
      });
    });

    buyerCollections.forEach((c) => {
      items.push({
        id: `COL-${c.id}`,
        badge: 'C',
        title: `Received · ${c.buyerName}`,
        subtitle: `RCPT ${c.receiptNo}`,
        amountPaise: c.amountPaise,
        isPositive: true,
        createdAt: c.createdAt || `${c.receiptDate}T12:00:00Z`,
        targetSection: 'operations_reports',
      });
    });

    expensesCommitments
      .filter((e) => !e.isRestrictedPersonal)
      .forEach((e) => {
        items.push({
          id: `EXP-${e.id}`,
          badge: 'E',
          title: `Expense · ${e.payeeName}`,
          subtitle: `VCH ${e.voucherNo}`,
          amountPaise: e.totalAmountPaise,
          isPositive: false,
          createdAt: e.createdAt || `${e.voucherDate}T12:00:00Z`,
          targetSection: 'operations_reports',
        });
      });

    stockMovements.forEach((m) => {
      const cmdName = commodityNameById.get(m.commodityId) || 'Commodity';
      items.push({
        id: `MOV-${m.id}`,
        badge: 'M',
        title: `${m.direction === 'GOODS_IN' ? 'Arrival' : 'Dispatch'} · ${cmdName}`,
        subtitle: `LOT ${m.movementNo}`,
        amountPaise: m.totalValuePaise,
        isPositive: m.direction !== 'GOODS_IN',
        createdAt: m.createdAt || `${m.transactionDate}T12:00:00Z`,
        targetSection: 'stock',
      });
    });

    return items
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [
    cashCreditBills,
    kharidiPattis,
    dalaliKharidiPattis,
    farmerPattis,
    buyerCollections,
    expensesCommitments,
    stockMovements,
    commodityNameById,
  ]);

  const handleQuickReceiveMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const targetBuyer = rmBuyerId || buyers[0]?.id;
      if (!targetBuyer) {
        throw new Error('Please register or select a Buyer first.');
      }
      const amountPaise = rupeesToPaise(rmAmountRupees || '0');
      if (amountPaise <= 0) {
        throw new Error('Collection amount must be greater than zero.');
      }
      await onRecordBuyerCollection({
        receiptDate: rmDate,
        buyerId: targetBuyer,
        targetBillType: 'ON_ACCOUNT',
        targetBillId: null,
        amountPaise,
        discountAllowedPaise: 0,
        paymentMode: rmMode,
        bankAccountId: rmMode !== 'CASH' ? rmBankId || bankAccounts[0]?.id || null : null,
        referenceNo: `DASH-RCV-${Date.now()}`,
        notes: rmNotes.trim() || 'Dashboard Quick Receive Money',
      });
      setQuickModal('NONE');
      setRmAmountRupees('');
      setRmNotes('');
      setFeedback({
        type: 'success',
        message: `Received ${formatINR(amountPaise)} and updated Buyer Ledger & Liquid Assets.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record receipt',
      });
    }
  };

  const handleQuickMakePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const amountPaise = rupeesToPaise(mpAmountRupees || '0');
      if (amountPaise <= 0) {
        throw new Error('Payment amount must be greater than zero.');
      }
      const selectedParty = parties.find((p) => p.id === mpPartyId) || parties[0];
      if (!selectedParty) {
        throw new Error('Please register at least one Farmer or Party first.');
      }
      const partyAccountCode =
        selectedParty.partyType === 'FARMER'
          ? '2001'
          : selectedParty.partyType === 'SUPPLIER'
          ? '2002'
          : '1101';
      const creditAccountCode = mpMode === 'CASH' ? '1001' : '1002';

      await onPostJournalEntry({
        transactionDate: mpDate,
        sourceType: 'MANUAL_VOUCHER',
        sourceId: `PAY-${Date.now()}`,
        idempotencyKey: `DASH-PAY-${Date.now()}`,
        narration:
          mpNarration.trim() || `Payment to ${selectedParty.name} via ${mpMode}`,
        lines: [
          {
            accountCode: partyAccountCode,
            partyId: selectedParty.id,
            debitPaise: amountPaise,
            creditPaise: 0,
            cashDirection: 'NON_CASH',
            lineNote: `Payment to ${selectedParty.name}`,
          },
          {
            accountCode: creditAccountCode,
            partyId: null,
            debitPaise: 0,
            creditPaise: amountPaise,
            cashDirection: mpMode === 'CASH' ? 'CASH_OUT' : 'BANK_OUT',
            lineNote: `Outflow via ${mpMode}`,
          },
        ],
      });
      setQuickModal('NONE');
      setMpAmountRupees('');
      setMpNarration('');
      setFeedback({
        type: 'success',
        message: `Paid ${formatINR(amountPaise)} to ${selectedParty.name} and updated Khata & Cash/Bank.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record payment',
      });
    }
  };

  const handleQuickMandiExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const amountPaise = rupeesToPaise(meAmountRupees || '0');
      if (amountPaise <= 0) {
        throw new Error('Expense amount must be greater than zero.');
      }
      await onRecordExpenseOrCommitment({
        voucherDate: meDate,
        category: meCategory,
        payeeName: mePayee.trim() || 'Mandi Operational Expense',
        description: meDescription.trim() || 'Recorded from Dashboard Quick Action',
        amountPaise,
        gstAmountPaise: 0,
        paymentMode: meMode,
        bankAccountId: meMode === 'BANK_TRANSFER' ? meBankId || bankAccounts[0]?.id || null : null,
        referenceNo: `DASH-EXP-${Date.now()}`,
        isRestrictedPersonal: false,
      });
      setQuickModal('NONE');
      setMeAmountRupees('');
      setMePayee('');
      setMeDescription('');
      setFeedback({
        type: 'success',
        message: `Mandi Expense of ${formatINR(amountPaise)} posted to Daily Expenses & Khata Book.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record expense',
      });
    }
  };

  const trendLabels: Record<DashboardTrendWindow, string> = {
    '7D': 'Last 7 Days',
    '30D': 'Last 30 Days',
    '3M': 'Last 3 Months',
    '6M': 'Last 6 Months',
    '1Y': 'Last 1 Year',
  };

  return (
    <div className="space-y-6">
      {/* Top Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => {
            if (canRecordCashBank) {
              setQuickModal('RECEIVE_MONEY');
            } else {
              onNavigate('operations_reports');
            }
          }}
          className="relative overflow-hidden rounded-3xl p-5 text-left text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-100">
              <ArrowUpRight className="w-4 h-4" />
              <span>{lang === 'kn' ? 'ಹಣ ಸ್ವೀಕರಿಸಿ' : 'RECEIVE'}</span>
            </div>
            <div className="text-xl font-extrabold tracking-tight">
              {lang === 'kn' ? 'ವಸೂಲಾತಿ ಸ್ವೀಕೃತಿ' : 'MONEY'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-white" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (canRecordCashBank) {
              setQuickModal('MAKE_PAYMENT');
            } else {
              onNavigate('khata');
            }
          }}
          className="relative overflow-hidden rounded-3xl p-5 text-left text-white bg-gradient-to-r from-pink-600 to-rose-600 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-100">
              <Activity className="w-4 h-4" />
              <span>{lang === 'kn' ? 'ಪಾವತಿ ಮಾಡಿ' : 'MAKE'}</span>
            </div>
            <div className="text-xl font-extrabold tracking-tight">
              {lang === 'kn' ? 'ಪಾರ್ಟಿ ಪಾವತಿ' : 'PAYMENT'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <ArrowDownLeft className="w-6 h-6 text-white" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (canRecordCashBank) {
              setQuickModal('MANDI_EXPENSES');
            } else {
              onNavigate('operations_reports');
            }
          }}
          className="relative overflow-hidden rounded-3xl p-5 text-left text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-100">
              <Receipt className="w-4 h-4" />
              <span>{lang === 'kn' ? 'ಮಂಡಿ ವೆಚ್ಚಗಳು' : 'MANDI'}</span>
            </div>
            <div className="text-xl font-extrabold tracking-tight">
              {lang === 'kn' ? 'ದೈನಂದಿನ ಖರ್ಚು' : 'EXPENSES'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
        </button>
      </div>

      {/* Date Range Filter Bar */}
      <div className="glass-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>Shree Guru Traders Live Executive Dashboard</span>
          {(dateFilterFrom || dateFilterTo) && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono">
              Filtered: {dateFilterFrom || 'Start'} → {dateFilterTo || 'Today'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-slate-500">From:</label>
          <input
            type="date"
            aria-label="Dashboard From Date"
            value={dateFilterFrom}
            onChange={(e) => setDateFilterFrom(e.target.value)}
            className="apple-input py-1 px-2 text-xs h-7"
          />
          <label className="text-slate-500">To:</label>
          <input
            type="date"
            aria-label="Dashboard To Date"
            value={dateFilterTo}
            onChange={(e) => setDateFilterTo(e.target.value)}
            className="apple-input py-1 px-2 text-xs h-7"
          />
          {(dateFilterFrom || dateFilterTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFilterFrom('');
                setDateFilterTo('');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`glass-panel rounded-2xl p-4 flex items-center justify-between text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-300 text-emerald-900 bg-emerald-50/80'
              : 'border-rose-300 text-rose-900 bg-rose-50/80'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-500 hover:text-slate-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Main Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Sales Summary */}
        <div
          onClick={() => onNavigate('pattis', 'CASH_CREDIT_BILL')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('pattis', 'CASH_CREDIT_BILL')}
          className="glass-panel rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                SALES SUMMARY
              </span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900">
              {formatINR(salesMetrics.totalSalesPaise, false)}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• CASH SALES (COLLECTED)</span>
              <span className="font-mono font-bold text-emerald-600">
                {formatINR(salesMetrics.cashSalesCollectedPaise, false)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• UDHAAR SALES (RECEIVABLES)</span>
              <span className="font-mono font-bold text-rose-600">
                {formatINR(salesMetrics.creditSalesReceivablePaise, false)}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Purchase Insights */}
        <div
          onClick={() => onNavigate('pattis', 'FARMER_PATTI')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('pattis', 'FARMER_PATTI')}
          className="glass-panel rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                PURCHASE INSIGHTS
              </span>
              <ShoppingBag className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900">
              {formatINR(purchaseMetrics.totalPurchasesPaise, false)}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• CASH PURCHASE (PAID)</span>
              <span className="font-mono font-bold text-emerald-600">
                {formatINR(purchaseMetrics.cashPurchasesPaidPaise, false)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• UDHAAR PURCHASE (OUTSTANDING)</span>
              <span className="font-mono font-bold text-rose-600">
                {formatINR(purchaseMetrics.creditPurchasesOutstandingPaise, false)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Liquid Assets */}
        <div
          onClick={() => onNavigate('loans_bank')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('loans_bank')}
          className="glass-panel rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                LIQUID ASSETS
              </span>
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900">
              {formatINR(liquidMetrics.totalLiquidPaise, false)}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• INFLOW</span>
              <span className="font-mono font-bold text-emerald-600">
                {formatINR(liquidMetrics.inflowPaise, false)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">• OUTFLOW</span>
              <span className="font-mono font-bold text-rose-600">
                {formatINR(liquidMetrics.outflowPaise, false)}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Daily Expenses */}
        <div
          onClick={() => onNavigate('operations_reports')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('operations_reports')}
          className="glass-panel rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                DAILY EXPENSES
              </span>
              <Activity className="w-4 h-4 text-rose-500" />
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 pt-2">
            <div className="text-2xl font-extrabold font-mono text-slate-900">
              {formatINR(dailyExpenseMetrics.totalDailyExpensesPaise, false)}
            </div>
            <p className="text-[11px] text-slate-500 leading-snug text-right max-w-[160px]">
              Total volume of operational expenses paid out today (Labor, Transport, Petty Cash)
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Section: Revenue Trend Chart (Left 2/3) + Live Floor Feed (Right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <div
          onClick={() => onNavigate('operations_reports')}
          className="lg:col-span-2 glass-panel rounded-3xl p-6 space-y-4 cursor-pointer"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Revenue Trend</h2>
              <p className="text-xs text-slate-500">{trendLabels[trendWindow]}</p>
            </div>
            <div
              className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {(['7D', '30D', '3M', '6M', '1Y'] as DashboardTrendWindow[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setTrendWindow(w)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    trendWindow === w
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrendData}>
                <defs>
                  <linearGradient id="sgtRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) =>
                    val >= 1000 ? `₹${(val / 1000).toFixed(1)}k` : `₹${val}`
                  }
                />
                <Tooltip
                  formatter={(val: unknown) => [
                    `₹${Number(val || 0).toLocaleString('en-IN')}`,
                    'Revenue',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenueRupees"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#sgtRevenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Floor Feed */}
        <div className="glass-panel rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Live Floor Feed</h2>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Real-Time
            </span>
          </div>

          {liveFloorFeed.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
              No floor transactions recorded yet. Create a Patti, Sale Bill, or Stock Arrival to see live activity.
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {liveFloorFeed.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate(item.targetSection)}
                  className="p-3 rounded-2xl bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/60 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        item.isPositive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.badge}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-extrabold font-mono ${
                        item.isPositive ? 'text-emerald-600' : 'text-slate-800'
                      }`}
                    >
                      {formatINR(item.amountPaise, false)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatDateDDMMYYYY(item.createdAt.slice(0, 10))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Modal: Receive Money */}
      {quickModal === 'RECEIVE_MONEY' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setQuickModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Receive Money (Buyer Collection)
              </h3>
              <button
                type="button"
                onClick={() => setQuickModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickReceiveMoney} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Buyer</label>
                <select
                  value={rmBuyerId || buyers[0]?.id || ''}
                  onChange={(e) => setRmBuyerId(e.target.value)}
                  className="apple-input w-full"
                  required
                >
                  {buyers.length === 0 && <option value="">No Buyers Registered</option>}
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.partyCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={rmAmountRupees}
                    onChange={(e) => setRmAmountRupees(e.target.value)}
                    placeholder="e.g. 25000"
                    className="apple-input w-full font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={rmDate}
                    onChange={(e) => setRmDate(e.target.value)}
                    className="apple-input w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={rmMode}
                  onChange={(e) => setRmMode(e.target.value as any)}
                  className="apple-input w-full"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
              {rmMode !== 'CASH' && bankAccounts.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bank Account</label>
                  <select
                    value={rmBankId}
                    onChange={(e) => setRmBankId(e.target.value)}
                    className="apple-input w-full"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} — {b.accountLabel}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={rmNotes}
                  onChange={(e) => setRmNotes(e.target.value)}
                  placeholder="Receipt narration"
                  className="apple-input w-full"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickModal('NONE')}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold"
                >
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Action Modal: Make Payment */}
      {quickModal === 'MAKE_PAYMENT' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setQuickModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Make Payment (Party Voucher)</h3>
              <button
                type="button"
                onClick={() => setQuickModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickMakePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Farmer / Supplier / Party
                </label>
                <select
                  value={mpPartyId || parties[0]?.id || ''}
                  onChange={(e) => setMpPartyId(e.target.value)}
                  className="apple-input w-full"
                  required
                >
                  {parties.length === 0 && <option value="">No Parties Registered</option>}
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.partyType})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={mpAmountRupees}
                    onChange={(e) => setMpAmountRupees(e.target.value)}
                    placeholder="e.g. 15000"
                    className="apple-input w-full font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={mpDate}
                    onChange={(e) => setMpDate(e.target.value)}
                    className="apple-input w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mode</label>
                <select
                  value={mpMode}
                  onChange={(e) => setMpMode(e.target.value as 'CASH' | 'BANK')}
                  className="apple-input w-full"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Narration</label>
                <input
                  type="text"
                  value={mpNarration}
                  onChange={(e) => setMpNarration(e.target.value)}
                  placeholder="Payment narration"
                  className="apple-input w-full"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickModal('NONE')}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Action Modal: Mandi Expenses */}
      {quickModal === 'MANDI_EXPENSES' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setQuickModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Record Mandi Expense</h3>
              <button
                type="button"
                onClick={() => setQuickModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickMandiExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={meCategory}
                  onChange={(e) => setMeCategory(e.target.value as ExpenseCommitmentCategory)}
                  className="apple-input w-full"
                >
                  <option value="HAMALI_LABOR">Hamali / Labor</option>
                  <option value="VEHICLE_FREIGHT">Transport / Vehicle Freight</option>
                  <option value="OPERATING_EXPENSE">Petty Cash / Operating Expense</option>
                  <option value="GOVT_FORM_FEE">Market Cess / Govt Form Fee</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={meAmountRupees}
                    onChange={(e) => setMeAmountRupees(e.target.value)}
                    placeholder="e.g. 500"
                    className="apple-input w-full font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={meDate}
                    onChange={(e) => setMeDate(e.target.value)}
                    className="apple-input w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payee Name</label>
                <input
                  type="text"
                  value={mePayee}
                  onChange={(e) => setMePayee(e.target.value)}
                  placeholder="e.g. Yard Hamali Gang / Transporter"
                  className="apple-input w-full"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={meDescription}
                  onChange={(e) => setMeDescription(e.target.value)}
                  placeholder="Operational expense details"
                  className="apple-input w-full"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickModal('NONE')}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

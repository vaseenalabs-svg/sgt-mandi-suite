import React, { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Printer,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ArrowRight,
  Receipt,
  RotateCcw,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  BankAccountRecord,
  BillTransportDetails,
  CashCreditBillLineInput,
  CashCreditBillRecord,
  CommodityStockStatus,
  CompanySettings,
  DalaliKharidiLineInput,
  DalaliKharidiPattiRecord,
  DalaliVikriLineInput,
  DalaliVikriPattiRecord,
  FarmerPattiLineInput,
  FarmerPattiRecord,
  KharidiPattiLineInput,
  KharidiPattiRecord,
  KharidiPaymentMode,
  LoanRecord,
  PartyRecord,
  PattiSettlementPaymentMode,
  PermissionKey,
  StockOwnershipType,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR, paiseToIndianWords, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

interface PattiAndBillingViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  businessDate: string;
  settings: CompanySettings;
  parties: PartyRecord[];
  stockStatuses: CommodityStockStatus[];
  loans: LoanRecord[];
  bankAccounts: BankAccountRecord[];
  farmerPattis: FarmerPattiRecord[];
  kharidiPattis: KharidiPattiRecord[];
  dalaliVikriPattis?: DalaliVikriPattiRecord[];
  dalaliKharidiPattis?: DalaliKharidiPattiRecord[];
  cashCreditBills?: CashCreditBillRecord[];
  onCreateFarmerPatti: (payload: {
    pattiDate: string;
    farmerId: string;
    ownershipMode: StockOwnershipType;
    vehicleNo: string;
    items: FarmerPattiLineInput[];
    commissionRateBps: number;
    commissionAmountPaise: number;
    hamaliAmountPaise: number;
    weighmentFeePaise: number;
    mandiFeePaise: number;
    otherDeductionsPaise: number;
    otherDeductionsLabel: string;
    linkedLoanId: string | null;
    recoverLoanInPatti: boolean;
    loanRecoveryOverridePaise?: number;
    paymentMode: PattiSettlementPaymentMode;
    bankAccountId: string | null;
    amountPaidNowPaise: number;
    notes: string;
  }) => Promise<FarmerPattiRecord>;
  onCreateKharidiPatti: (payload: {
    invoiceDate: string;
    buyerId: string;
    ownershipMode: StockOwnershipType;
    linkedFarmerPattiId: string | null;
    linkedFarmerId: string | null;
    vehicleNo: string;
    items: KharidiPattiLineInput[];
    buyerCommissionBps: number;
    buyerCommissionPaise: number;
    buyerHamaliPackingPaise: number;
    buyerMarketFeePaise: number;
    paymentMode: KharidiPaymentMode;
    bankAccountId: string | null;
    amountReceivedNowPaise: number;
    notes: string;
  }) => Promise<KharidiPattiRecord>;
  onCreateDalaliVikriPatti?: (payload: {
    pattiDate: string;
    farmerId: string;
    counterpartyBuyerId: string | null;
    classSerial: string;
    vehicleNo: string;
    items: DalaliVikriLineInput[];
    commissionRateBps: number;
    commissionAmountPaise: number;
    hamaliAmountPaise: number;
    niituFeePaise: number;
    tukadFeePaise: number;
    rmcFeePaise: number;
    vehicleRentPaise: number;
    handLoanAdvancePaise: number;
    paymentMode: PattiSettlementPaymentMode;
    bankAccountId: string | null;
    notes: string;
  }) => Promise<DalaliVikriPattiRecord>;
  onCreateDalaliKharidiPatti?: (payload: {
    pattiDate: string;
    buyerId: string;
    linkedDalaliVikriId: string | null;
    linkedFarmerId: string | null;
    classSerial: string;
    vehicleNo: string;
    items: DalaliKharidiLineInput[];
    commissionRateBps: number;
    commissionAmountPaise: number;
    hamaliAmountPaise: number;
    niituFeePaise: number;
    tukadFeePaise: number;
    rmcFeePaise: number;
    paymentMode: KharidiPaymentMode;
    bankAccountId: string | null;
    notes: string;
  }) => Promise<DalaliKharidiPattiRecord>;
  onCreateCashCreditBill?: (payload: {
    billDate: string;
    billKind: 'CASH_BILL' | 'CREDIT_BILL';
    buyerId: string;
    ownershipMode: StockOwnershipType;
    classSerial: string;
    transport: Partial<BillTransportDetails>;
    items: CashCreditBillLineInput[];
    commissionPaise: number;
    hamaliPackingPaise: number;
    rmcFeePaise: number;
    tukadFeePaise: number;
    cstOrOtherTaxLabel: string;
    cstOrOtherTaxPaise: number;
    paymentMode: KharidiPaymentMode;
    bankAccountId: string | null;
    amountReceivedNowPaise: number;
    notes: string;
  }) => Promise<CashCreditBillRecord>;
  onReverseCashCreditBill?: (
    billId: string,
    payload: { reversalDate: string; reason: string }
  ) => Promise<CashCreditBillRecord>;
}

interface DraftFarmerLine {
  commodityId: string;
  bags: string;
  weightQuintals: string;
  moisturePct: string;
  rateRupees: string;
}

interface DraftKharidiLine {
  commodityId: string;
  bags: string;
  weightQuintals: string;
  rateRupees: string;
  gstApplicable: boolean;
  cgstPct: string;
  sgstPct: string;
}

interface DraftDalaliLine {
  commodityId: string;
  bags: string;
  andiges: string;
  weightQuintals: string;
  rateRupees: string;
  gstApplicable: boolean;
  cgstPct: string;
  sgstPct: string;
}

export const PattiAndBillingView: React.FC<PattiAndBillingViewProps> = ({
  lang,
  activeUser,
  businessDate,
  settings,
  parties,
  stockStatuses,
  loans,
  bankAccounts,
  farmerPattis,
  kharidiPattis,
  dalaliVikriPattis = [],
  dalaliKharidiPattis = [],
  cashCreditBills = [],
  onCreateFarmerPatti,
  onCreateKharidiPatti,
  onCreateDalaliVikriPatti,
  onCreateDalaliKharidiPatti,
  onCreateCashCreditBill,
  onReverseCashCreditBill,
}) => {
  const [activeTab, setActiveTab] = useState<
    'FARMER_PATTI' | 'KHARIDI_PATTI' | 'DALALI_SECTION' | 'CASH_CREDIT_BILL'
  >('FARMER_PATTI');
  const [dalaliSubMode, setDalaliSubMode] = useState<'VIKRI' | 'KHARIDI'>('VIKRI');
  const [selectedFarmerPatti, setSelectedFarmerPatti] = useState<FarmerPattiRecord | null>(
    farmerPattis[0] ?? null
  );
  const [selectedKharidiPatti, setSelectedKharidiPatti] = useState<KharidiPattiRecord | null>(
    kharidiPattis[0] ?? null
  );
  const [selectedDalaliVikri, setSelectedDalaliVikri] = useState<DalaliVikriPattiRecord | null>(
    dalaliVikriPattis[0] ?? null
  );
  const [selectedDalaliKharidi, setSelectedDalaliKharidi] =
    useState<DalaliKharidiPattiRecord | null>(dalaliKharidiPattis[0] ?? null);
  const [selectedCashCreditBill, setSelectedCashCreditBill] =
    useState<CashCreditBillRecord | null>(cashCreditBills[0] ?? null);
  const [reversalReasonInput, setReversalReasonInput] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const canCreateBills =
    activeUser.permissions.includes(PermissionKey.CREATE_TRADING_BILLS) ||
    activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS);
  const canApproveCorrections =
    activeUser.permissions.includes(PermissionKey.APPROVE_CORRECTIONS) ||
    activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS);

  const farmers = useMemo(
    () =>
      parties.filter(
        (p) => p.status === 'ACTIVE' && p.partyType === 'FARMER'
      ),
    [parties]
  );

  const buyers = useMemo(
    () =>
      parties.filter(
        (p) =>
          p.status === 'ACTIVE' &&
          (p.partyType === 'BUYER' ||
            p.partyType === 'WHOLESALER' ||
            p.partyType === 'FACTORY' ||
            p.partyType === 'TRADER' ||
            p.partyType === 'SUPPLIER')
      ),
    [parties]
  );

  // --- Farmer Patti Form State ---
  const [fpDate, setFpDate] = useState<string>(businessDate);
  const [fpFarmerId, setFpFarmerId] = useState<string>(farmers[0]?.id ?? '');
  const [fpOwnershipMode, setFpOwnershipMode] = useState<StockOwnershipType>('FARMER_AGENCY');
  const [fpVehicleNo, setFpVehicleNo] = useState<string>('');
  const [fpLines, setFpLines] = useState<DraftFarmerLine[]>([
    {
      commodityId: stockStatuses[0]?.commodity.id ?? '',
      bags: '',
      weightQuintals: '',
      moisturePct: '0',
      rateRupees: '',
    },
  ]);
  const [fpCommPct, setFpCommPct] = useState<string>(
    String((settings.commissionHamaliPolicy.defaultCommissionBps || 0) / 100)
  );
  const [fpHamaliPerBagRupees, setFpHamaliPerBagRupees] = useState<string>(
    String((settings.commissionHamaliPolicy.defaultHamaliPerBagPaise || 0) / 100)
  );
  const [fpWeighmentRupees, setFpWeighmentRupees] = useState<string>('0');
  const [fpMandiFeeRupees, setFpMandiFeeRupees] = useState<string>('0');
  const [fpOtherDedRupees, setFpOtherDedRupees] = useState<string>('0');
  const [fpOtherDedLabel, setFpOtherDedLabel] = useState<string>(
    settings.customLabels?.niituFeeLabelEn || 'Niitu / Tukad Fee'
  );
  const [fpRecoverLoan, setFpRecoverLoan] = useState<boolean>(true);
  const [fpCustomLoanRecoveryRupees, setFpCustomLoanRecoveryRupees] = useState<string>('');
  const [fpPaymentMode, setFpPaymentMode] = useState<PattiSettlementPaymentMode>('CASH');
  const [fpBankAccountId, setFpBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '');
  const [fpNotes, setFpNotes] = useState<string>('');

  // --- Kharidi Patti Form State ---
  const [kpDate, setKpDate] = useState<string>(businessDate);
  const [kpBuyerId, setKpBuyerId] = useState<string>(buyers[0]?.id ?? '');
  const [kpOwnershipMode, setKpOwnershipMode] = useState<StockOwnershipType>('SGT_OWNED');
  const [kpLinkedFarmerPattiId, setKpLinkedFarmerPattiId] = useState<string>('');
  const [kpVehicleNo, setKpVehicleNo] = useState<string>('');
  const [kpLines, setKpLines] = useState<DraftKharidiLine[]>([
    {
      commodityId: stockStatuses[0]?.commodity.id ?? '',
      bags: '',
      weightQuintals: '',
      rateRupees: '',
      gstApplicable: false,
      cgstPct: '2.5',
      sgstPct: '2.5',
    },
  ]);
  const [kpCommPct, setKpCommPct] = useState<string>('0');
  const [kpHamaliPackingRupees, setKpHamaliPackingRupees] = useState<string>('0');
  const [kpMarketFeeRupees, setKpMarketFeeRupees] = useState<string>('0');
  const [kpPaymentMode, setKpPaymentMode] = useState<KharidiPaymentMode>('CREDIT');
  const [kpBankAccountId, setKpBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '');
  const [kpAmountReceivedRupees, setKpAmountReceivedRupees] = useState<string>('0');
  const [kpNotes, setKpNotes] = useState<string>('');

  // --- Chunk 6: Dalali Vikri & Kharidi Patti Form State ---
  const [dvDate, setDvDate] = useState<string>(businessDate);
  const [dvFarmerId, setDvFarmerId] = useState<string>(farmers[0]?.id ?? '');
  const [dvBuyerId, setDvBuyerId] = useState<string>(buyers[0]?.id ?? '');
  const [dvClassSerial, setDvClassSerial] = useState<string>('A-01');
  const [dvVehicleNo, setDvVehicleNo] = useState<string>('');
  const [dvLines, setDvLines] = useState<DraftDalaliLine[]>([
    {
      commodityId: stockStatuses[0]?.commodity.id ?? '',
      bags: '',
      andiges: '1',
      weightQuintals: '',
      rateRupees: '',
      gstApplicable: false,
      cgstPct: '2.5',
      sgstPct: '2.5',
    },
  ]);
  const [dvCommPct, setDvCommPct] = useState<string>(
    String((settings.commissionHamaliPolicy.defaultCommissionBps || 0) / 100)
  );
  const [dvHamaliRupees, setDvHamaliRupees] = useState<string>('0');
  const [dvNiituRupees, setDvNiituRupees] = useState<string>('0');
  const [dvTukadRupees, setDvTukadRupees] = useState<string>('0');
  const [dvRmcRupees, setDvRmcRupees] = useState<string>('0');
  const [dvVehicleRentRupees, setDvVehicleRentRupees] = useState<string>('0');
  const [dvHandLoanRupees, setDvHandLoanRupees] = useState<string>('0');
  const [dvPaymentMode, setDvPaymentMode] = useState<PattiSettlementPaymentMode>('CASH');
  const [dvBankAccountId, setDvBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '');
  const [dvNotes, setDvNotes] = useState<string>('');

  // --- Chunk 6: Cash / Credit Bill Form State ---
  const [cbDate, setCbDate] = useState<string>(businessDate);
  const [cbKind, setCbKind] = useState<'CASH_BILL' | 'CREDIT_BILL'>('CREDIT_BILL');
  const [cbBuyerId, setCbBuyerId] = useState<string>(buyers[0]?.id ?? '');
  const [cbOwnershipMode, setCbOwnershipMode] = useState<StockOwnershipType>('SGT_OWNED');
  const [cbClassSerial, setCbClassSerial] = useState<string>('INV-A');
  const [cbLorryOwner, setCbLorryOwner] = useState<string>('');
  const [cbDriverName, setCbDriverName] = useState<string>('');
  const [cbDriverLicense, setCbDriverLicense] = useState<string>('');
  const [cbDriverPhone, setCbDriverPhone] = useState<string>('');
  const [cbVehicleNo, setCbVehicleNo] = useState<string>('');
  const [cbOrigin, setCbOrigin] = useState<string>(settings.villageCity || 'Mandi Yard');
  const [cbDestination, setCbDestination] = useState<string>('');
  const [cbDeliveryNoteNo, setCbDeliveryNoteNo] = useState<string>('');
  const [cbFreightAdvanceRupees, setCbFreightAdvanceRupees] = useState<string>('0');
  const [cbLines, setCbLines] = useState<DraftDalaliLine[]>([
    {
      commodityId: stockStatuses[0]?.commodity.id ?? '',
      bags: '',
      andiges: '1',
      weightQuintals: '',
      rateRupees: '',
      gstApplicable: false,
      cgstPct: '2.5',
      sgstPct: '2.5',
    },
  ]);
  const [cbCommRupees, setCbCommRupees] = useState<string>('0');
  const [cbHamaliRupees, setCbHamaliRupees] = useState<string>('0');
  const [cbRmcRupees, setCbRmcRupees] = useState<string>('0');
  const [cbTukadRupees, setCbTukadRupees] = useState<string>('0');
  const [cbCstLabel, setCbCstLabel] = useState<string>(
    settings.customLabels?.cstOrOtherTaxLabelEn || 'CST / Other Tax'
  );
  const [cbCstRupees, setCbCstRupees] = useState<string>('0');
  const [cbBankAccountId, setCbBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '');
  const [cbAmountReceivedRupees, setCbAmountReceivedRupees] = useState<string>('0');
  const [cbNotes, setCbNotes] = useState<string>('');

  // Active loan detection for selected Farmer
  const selectedFarmerLoans = useMemo(
    () =>
      loans.filter(
        (l) =>
          l.farmerId === fpFarmerId &&
          l.status === 'ACTIVE' &&
          l.totalOutstandingAsOfTodayPaise > 0
      ),
    [loans, fpFarmerId]
  );

  const primaryActiveLoan = selectedFarmerLoans.length > 0 ? selectedFarmerLoans[selectedFarmerLoans.length - 1] : null;

  // Live Farmer Patti calculation preview
  const fpPreview = useMemo(() => {
    let totalBags = 0;
    let totalNetWeightGrams = 0;
    let grossCropAmountPaise = 0;

    fpLines.forEach((line) => {
      const bags = Math.max(0, Math.round(Number(line.bags || 0)));
      const weightGrams = Math.max(0, Math.round(Number(line.weightQuintals || 0) * 100_000));
      const ratePaise = rupeesToPaise(line.rateRupees || '0');
      const grossPaise = Math.round((weightGrams / 100_000) * ratePaise);
      totalBags += bags;
      totalNetWeightGrams += weightGrams;
      grossCropAmountPaise += grossPaise;
    });

    const commBps = Math.max(0, Math.round(Number(fpCommPct || 0) * 100));
    const commissionAmountPaise = Math.round((grossCropAmountPaise * commBps) / 10_000);
    const hamaliPerBagPaise = rupeesToPaise(fpHamaliPerBagRupees || '0');
    const hamaliAmountPaise = totalBags * hamaliPerBagPaise;
    const weighmentFeePaise = rupeesToPaise(fpWeighmentRupees || '0');
    const mandiFeePaise = rupeesToPaise(fpMandiFeeRupees || '0');
    const otherDeductionsPaise = rupeesToPaise(fpOtherDedRupees || '0');

    const totalOperationalDeductionsPaise =
      commissionAmountPaise +
      hamaliAmountPaise +
      weighmentFeePaise +
      mandiFeePaise +
      otherDeductionsPaise;

    const netProceedsBeforeLoanPaise = Math.max(
      0,
      grossCropAmountPaise - totalOperationalDeductionsPaise
    );

    const loanDuePaise = primaryActiveLoan
      ? primaryActiveLoan.principalOutstandingPaise + primaryActiveLoan.accruedInterestAsOfTodayPaise
      : 0;

    let desiredLoanRecoveryPaise = 0;
    if (primaryActiveLoan && fpRecoverLoan) {
      desiredLoanRecoveryPaise =
        fpCustomLoanRecoveryRupees.trim() !== ''
          ? rupeesToPaise(fpCustomLoanRecoveryRupees)
          : loanDuePaise;
    }

    const actualLoanRecoveredPaise = Math.min(
      desiredLoanRecoveryPaise,
      netProceedsBeforeLoanPaise,
      loanDuePaise
    );

    let principalRecoveredPaise = 0;
    let interestRecoveredPaise = 0;
    if (primaryActiveLoan && actualLoanRecoveredPaise > 0) {
      if (primaryActiveLoan.repaymentOrder === 'INTEREST_FIRST') {
        interestRecoveredPaise = Math.min(
          actualLoanRecoveredPaise,
          primaryActiveLoan.accruedInterestAsOfTodayPaise
        );
        principalRecoveredPaise = Math.min(
          actualLoanRecoveredPaise - interestRecoveredPaise,
          primaryActiveLoan.principalOutstandingPaise
        );
      } else {
        principalRecoveredPaise = Math.min(
          actualLoanRecoveredPaise,
          primaryActiveLoan.principalOutstandingPaise
        );
        interestRecoveredPaise = Math.min(
          actualLoanRecoveredPaise - principalRecoveredPaise,
          primaryActiveLoan.accruedInterestAsOfTodayPaise
        );
      }
    }

    const carryForwardLoanBalancePaise = Math.max(0, loanDuePaise - actualLoanRecoveredPaise);
    const netPayablePaise = Math.max(0, netProceedsBeforeLoanPaise - actualLoanRecoveredPaise);

    return {
      totalBags,
      totalNetWeightGrams,
      grossCropAmountPaise,
      commBps,
      commissionAmountPaise,
      hamaliAmountPaise,
      weighmentFeePaise,
      mandiFeePaise,
      otherDeductionsPaise,
      totalOperationalDeductionsPaise,
      netProceedsBeforeLoanPaise,
      loanDuePaise,
      actualLoanRecoveredPaise,
      principalRecoveredPaise,
      interestRecoveredPaise,
      carryForwardLoanBalancePaise,
      netPayablePaise,
    };
  }, [
    fpLines,
    fpCommPct,
    fpHamaliPerBagRupees,
    fpWeighmentRupees,
    fpMandiFeeRupees,
    fpOtherDedRupees,
    primaryActiveLoan,
    fpRecoverLoan,
    fpCustomLoanRecoveryRupees,
  ]);

  // Live Kharidi Patti calculation preview
  const kpPreview = useMemo(() => {
    let totalBags = 0;
    let totalNetWeightGrams = 0;
    let totalBaseAmountPaise = 0;
    let totalGstPaise = 0;

    kpLines.forEach((line) => {
      const bags = Math.max(0, Math.round(Number(line.bags || 0)));
      const weightGrams = Math.max(0, Math.round(Number(line.weightQuintals || 0) * 100_000));
      const ratePaise = rupeesToPaise(line.rateRupees || '0');
      const basePaise = Math.round((weightGrams / 100_000) * ratePaise);
      const cgstBps = line.gstApplicable ? Math.round(Number(line.cgstPct || 0) * 100) : 0;
      const sgstBps = line.gstApplicable ? Math.round(Number(line.sgstPct || 0) * 100) : 0;
      const gstPaise = line.gstApplicable
        ? Math.round((basePaise * (cgstBps + sgstBps)) / 10_000)
        : 0;

      totalBags += bags;
      totalNetWeightGrams += weightGrams;
      totalBaseAmountPaise += basePaise;
      totalGstPaise += gstPaise;
    });

    const buyerCommBps = Math.max(0, Math.round(Number(kpCommPct || 0) * 100));
    const buyerCommissionPaise = Math.round((totalBaseAmountPaise * buyerCommBps) / 10_000);
    const buyerHamaliPackingPaise = rupeesToPaise(kpHamaliPackingRupees || '0');
    const buyerMarketFeePaise = rupeesToPaise(kpMarketFeeRupees || '0');

    const netReceivablePaise =
      totalBaseAmountPaise +
      buyerCommissionPaise +
      buyerHamaliPackingPaise +
      buyerMarketFeePaise +
      totalGstPaise;

    return {
      totalBags,
      totalNetWeightGrams,
      totalBaseAmountPaise,
      buyerCommBps,
      buyerCommissionPaise,
      buyerHamaliPackingPaise,
      buyerMarketFeePaise,
      totalGstPaise,
      netReceivablePaise,
    };
  }, [kpLines, kpCommPct, kpHamaliPackingRupees, kpMarketFeeRupees]);

  const handleSubmitFarmerPatti = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const targetFarmerId = fpFarmerId || farmers[0]?.id;
      if (!targetFarmerId) {
        throw new Error('Please register at least one Farmer in Parties & Farmers first.');
      }

      const items: FarmerPattiLineInput[] = fpLines.map((l) => {
        const netWeightGrams = Math.round(Number(l.weightQuintals || 0) * 100_000);
        return {
          commodityId: l.commodityId || stockStatuses[0]?.commodity.id || '',
          bags: Math.round(Number(l.bags || 0)),
          grossWeightGrams: netWeightGrams,
          tareWeightGrams: 0,
          moisturePct: Number(l.moisturePct || 0),
          netWeightGrams,
          ratePerQuintalPaise: rupeesToPaise(l.rateRupees || '0'),
        };
      });

      const created = await onCreateFarmerPatti({
        pattiDate: fpDate,
        farmerId: targetFarmerId,
        ownershipMode: fpOwnershipMode,
        vehicleNo: fpVehicleNo.trim(),
        items,
        commissionRateBps: fpPreview.commBps,
        commissionAmountPaise: fpPreview.commissionAmountPaise,
        hamaliAmountPaise: fpPreview.hamaliAmountPaise,
        weighmentFeePaise: fpPreview.weighmentFeePaise,
        mandiFeePaise: fpPreview.mandiFeePaise,
        otherDeductionsPaise: fpPreview.otherDeductionsPaise,
        otherDeductionsLabel: fpOtherDedLabel,
        linkedLoanId: primaryActiveLoan ? primaryActiveLoan.id : null,
        recoverLoanInPatti: fpRecoverLoan,
        loanRecoveryOverridePaise:
          fpCustomLoanRecoveryRupees.trim() !== ''
            ? rupeesToPaise(fpCustomLoanRecoveryRupees)
            : undefined,
        paymentMode: fpPaymentMode,
        bankAccountId: fpPaymentMode === 'BANK_TRANSFER' ? fpBankAccountId || null : null,
        amountPaidNowPaise:
          fpPaymentMode === 'CREDIT_PAYABLE' ? 0 : fpPreview.netPayablePaise,
        notes: fpNotes.trim(),
      });

      setSelectedFarmerPatti(created);
      setFpLines([
        {
          commodityId: stockStatuses[0]?.commodity.id ?? '',
          bags: '',
          weightQuintals: '',
          moisturePct: '0',
          rateRupees: '',
        },
      ]);
      setFpCustomLoanRecoveryRupees('');
      setFpVehicleNo('');
      setFpNotes('');
      setFeedback({
        type: 'success',
        message: `Settled Farmer Patti ${created.pattiNo}. Net Payable: ${formatINR(created.netPayablePaise)}${
          created.carryForwardLoanBalancePaise > 0
            ? ` · Carry-Forward Loan Balance: ${formatINR(created.carryForwardLoanBalancePaise)}`
            : ''
        }`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create Farmer Patti',
      });
    }
  };

  const handleSubmitKharidiPatti = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const targetBuyerId = kpBuyerId || buyers[0]?.id;
      if (!targetBuyerId) {
        throw new Error('Please register at least one Buyer in Parties & Farmers first.');
      }

      const items: KharidiPattiLineInput[] = kpLines.map((l) => ({
        commodityId: l.commodityId || stockStatuses[0]?.commodity.id || '',
        bags: Math.round(Number(l.bags || 0)),
        netWeightGrams: Math.round(Number(l.weightQuintals || 0) * 100_000),
        ratePerQuintalPaise: rupeesToPaise(l.rateRupees || '0'),
        gstApplicable: l.gstApplicable,
        cgstRateBps: l.gstApplicable ? Math.round(Number(l.cgstPct || 0) * 100) : 0,
        sgstRateBps: l.gstApplicable ? Math.round(Number(l.sgstPct || 0) * 100) : 0,
        igstRateBps: 0,
      }));

      const linkedFp = farmerPattis.find((fp) => fp.id === kpLinkedFarmerPattiId) ?? null;

      const created = await onCreateKharidiPatti({
        invoiceDate: kpDate,
        buyerId: targetBuyerId,
        ownershipMode: kpOwnershipMode,
        linkedFarmerPattiId: linkedFp ? linkedFp.id : null,
        linkedFarmerId: linkedFp ? linkedFp.farmerId : null,
        vehicleNo: kpVehicleNo.trim(),
        items,
        buyerCommissionBps: kpPreview.buyerCommBps,
        buyerCommissionPaise: kpPreview.buyerCommissionPaise,
        buyerHamaliPackingPaise: kpPreview.buyerHamaliPackingPaise,
        buyerMarketFeePaise: kpPreview.buyerMarketFeePaise,
        paymentMode: kpPaymentMode,
        bankAccountId: kpPaymentMode === 'BANK_TRANSFER' ? kpBankAccountId || null : null,
        amountReceivedNowPaise:
          kpPaymentMode === 'CREDIT'
            ? rupeesToPaise(kpAmountReceivedRupees || '0')
            : kpPreview.netReceivablePaise,
        notes: kpNotes.trim(),
      });

      setSelectedKharidiPatti(created);
      setKpLines([
        {
          commodityId: stockStatuses[0]?.commodity.id ?? '',
          bags: '',
          weightQuintals: '',
          rateRupees: '',
          gstApplicable: false,
          cgstPct: '2.5',
          sgstPct: '2.5',
        },
      ]);
      setKpVehicleNo('');
      setKpNotes('');
      setFeedback({
        type: 'success',
        message: `Generated Buyer Kharidi Patti ${created.invoiceNo} for ${formatINR(created.netReceivablePaise)}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create Kharidi Patti',
      });
    }
  };

  // Live Dalali Vikri / Kharidi calculation preview
  const dalaliPreview = useMemo(() => {
    let totalBags = 0;
    let totalAndiges = 0;
    let totalNetWeightGrams = 0;
    let totalBaseAmountPaise = 0;
    let totalGstPaise = 0;

    dvLines.forEach((line) => {
      const bags = Math.max(0, Math.round(Number(line.bags || 0)));
      const andiges = Math.max(0, Math.round(Number(line.andiges || 0)));
      const weightGrams = Math.max(0, Math.round(Number(line.weightQuintals || 0) * 100_000));
      const ratePaise = rupeesToPaise(line.rateRupees || '0');
      const basePaise = Math.round((weightGrams / 100_000) * ratePaise);
      const cgstBps = line.gstApplicable ? Math.round(Number(line.cgstPct || 0) * 100) : 0;
      const sgstBps = line.gstApplicable ? Math.round(Number(line.sgstPct || 0) * 100) : 0;
      const gstPaise = line.gstApplicable
        ? Math.round((basePaise * (cgstBps + sgstBps)) / 10_000)
        : 0;

      totalBags += bags;
      totalAndiges += andiges;
      totalNetWeightGrams += weightGrams;
      totalBaseAmountPaise += basePaise;
      totalGstPaise += gstPaise;
    });

    const commBps = Math.max(0, Math.round(Number(dvCommPct || 0) * 100));
    const commissionAmountPaise = Math.round((totalBaseAmountPaise * commBps) / 10_000);
    const hamaliAmountPaise = rupeesToPaise(dvHamaliRupees || '0');
    const niituFeePaise = rupeesToPaise(dvNiituRupees || '0');
    const tukadFeePaise = rupeesToPaise(dvTukadRupees || '0');
    const rmcFeePaise = rupeesToPaise(dvRmcRupees || '0');
    const vehicleRentPaise = rupeesToPaise(dvVehicleRentRupees || '0');
    const handLoanAdvancePaise = rupeesToPaise(dvHandLoanRupees || '0');

    const totalVikriDeductionsPaise =
      commissionAmountPaise +
      hamaliAmountPaise +
      niituFeePaise +
      tukadFeePaise +
      rmcFeePaise +
      vehicleRentPaise +
      handLoanAdvancePaise;

    const netVikriPayablePaise = Math.max(0, totalBaseAmountPaise - totalVikriDeductionsPaise);
    const netKharidiReceivablePaise =
      totalBaseAmountPaise +
      commissionAmountPaise +
      hamaliAmountPaise +
      niituFeePaise +
      tukadFeePaise +
      rmcFeePaise +
      totalGstPaise;

    return {
      totalBags,
      totalAndiges,
      totalNetWeightGrams,
      totalBaseAmountPaise,
      commBps,
      commissionAmountPaise,
      hamaliAmountPaise,
      niituFeePaise,
      tukadFeePaise,
      rmcFeePaise,
      vehicleRentPaise,
      handLoanAdvancePaise,
      totalVikriDeductionsPaise,
      netVikriPayablePaise,
      totalGstPaise,
      netKharidiReceivablePaise,
    };
  }, [
    dvLines,
    dvCommPct,
    dvHamaliRupees,
    dvNiituRupees,
    dvTukadRupees,
    dvRmcRupees,
    dvVehicleRentRupees,
    dvHandLoanRupees,
  ]);

  // Live Cash / Credit Bill calculation preview
  const cbPreview = useMemo(() => {
    let totalBags = 0;
    let totalAndiges = 0;
    let totalNetWeightGrams = 0;
    let totalBaseAmountPaise = 0;
    let totalGstPaise = 0;

    cbLines.forEach((line) => {
      const bags = Math.max(0, Math.round(Number(line.bags || 0)));
      const andiges = Math.max(0, Math.round(Number(line.andiges || 0)));
      const weightGrams = Math.max(0, Math.round(Number(line.weightQuintals || 0) * 100_000));
      const ratePaise = rupeesToPaise(line.rateRupees || '0');
      const basePaise = Math.round((weightGrams / 100_000) * ratePaise);
      const cgstBps = line.gstApplicable ? Math.round(Number(line.cgstPct || 0) * 100) : 0;
      const sgstBps = line.gstApplicable ? Math.round(Number(line.sgstPct || 0) * 100) : 0;
      const gstPaise = line.gstApplicable
        ? Math.round((basePaise * (cgstBps + sgstBps)) / 10_000)
        : 0;

      totalBags += bags;
      totalAndiges += andiges;
      totalNetWeightGrams += weightGrams;
      totalBaseAmountPaise += basePaise;
      totalGstPaise += gstPaise;
    });

    const commissionPaise = rupeesToPaise(cbCommRupees || '0');
    const hamaliPackingPaise = rupeesToPaise(cbHamaliRupees || '0');
    const rmcFeePaise = rupeesToPaise(cbRmcRupees || '0');
    const tukadFeePaise = rupeesToPaise(cbTukadRupees || '0');
    const cstOrOtherTaxPaise = rupeesToPaise(cbCstRupees || '0');

    const netBillAmountPaise =
      totalBaseAmountPaise +
      commissionPaise +
      hamaliPackingPaise +
      rmcFeePaise +
      tukadFeePaise +
      cstOrOtherTaxPaise +
      totalGstPaise;

    return {
      totalBags,
      totalAndiges,
      totalNetWeightGrams,
      totalBaseAmountPaise,
      commissionPaise,
      hamaliPackingPaise,
      rmcFeePaise,
      tukadFeePaise,
      cstOrOtherTaxPaise,
      totalGstPaise,
      netBillAmountPaise,
      amountInWords: paiseToIndianWords(netBillAmountPaise),
    };
  }, [cbLines, cbCommRupees, cbHamaliRupees, cbRmcRupees, cbTukadRupees, cbCstRupees]);

  const handleSubmitDalaliPatti = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (dalaliSubMode === 'VIKRI') {
        if (!onCreateDalaliVikriPatti) return;
        const targetFarmerId = dvFarmerId || farmers[0]?.id;
        if (!targetFarmerId) {
          throw new Error('Please register at least one Farmer first.');
        }

        const items: DalaliVikriLineInput[] = dvLines.map((l) => ({
          commodityId: l.commodityId || stockStatuses[0]?.commodity.id || '',
          bags: Math.round(Number(l.bags || 0)),
          andiges: Math.round(Number(l.andiges || 0)),
          netWeightGrams: Math.round(Number(l.weightQuintals || 0) * 100_000),
          ratePerQuintalPaise: rupeesToPaise(l.rateRupees || '0'),
        }));

        const created = await onCreateDalaliVikriPatti({
          pattiDate: dvDate,
          farmerId: targetFarmerId,
          counterpartyBuyerId: dvBuyerId || null,
          classSerial: dvClassSerial.trim(),
          vehicleNo: dvVehicleNo.trim(),
          items,
          commissionRateBps: dalaliPreview.commBps,
          commissionAmountPaise: dalaliPreview.commissionAmountPaise,
          hamaliAmountPaise: dalaliPreview.hamaliAmountPaise,
          niituFeePaise: dalaliPreview.niituFeePaise,
          tukadFeePaise: dalaliPreview.tukadFeePaise,
          rmcFeePaise: dalaliPreview.rmcFeePaise,
          vehicleRentPaise: dalaliPreview.vehicleRentPaise,
          handLoanAdvancePaise: dalaliPreview.handLoanAdvancePaise,
          paymentMode: dvPaymentMode,
          bankAccountId: dvPaymentMode === 'BANK_TRANSFER' ? dvBankAccountId || null : null,
          notes: dvNotes.trim(),
        });

        setSelectedDalaliVikri(created);
        setFeedback({
          type: 'success',
          message: `Created Dalali Vikri Patti ${created.pattiNo}. Net Payable: ${formatINR(created.netPayablePaise)} (${created.amountInWords}).`,
        });
      } else {
        if (!onCreateDalaliKharidiPatti) return;
        const targetBuyerId = dvBuyerId || buyers[0]?.id;
        if (!targetBuyerId) {
          throw new Error('Please register at least one Buyer first.');
        }

        const items: DalaliKharidiLineInput[] = dvLines.map((l) => ({
          commodityId: l.commodityId || stockStatuses[0]?.commodity.id || '',
          bags: Math.round(Number(l.bags || 0)),
          andiges: Math.round(Number(l.andiges || 0)),
          netWeightGrams: Math.round(Number(l.weightQuintals || 0) * 100_000),
          ratePerQuintalPaise: rupeesToPaise(l.rateRupees || '0'),
          gstApplicable: l.gstApplicable,
          cgstRateBps: l.gstApplicable ? Math.round(Number(l.cgstPct || 0) * 100) : 0,
          sgstRateBps: l.gstApplicable ? Math.round(Number(l.sgstPct || 0) * 100) : 0,
          igstRateBps: 0,
        }));

        const created = await onCreateDalaliKharidiPatti({
          pattiDate: dvDate,
          buyerId: targetBuyerId,
          linkedDalaliVikriId: selectedDalaliVikri?.id ?? null,
          linkedFarmerId: dvFarmerId || null,
          classSerial: dvClassSerial.trim(),
          vehicleNo: dvVehicleNo.trim(),
          items,
          commissionRateBps: dalaliPreview.commBps,
          commissionAmountPaise: dalaliPreview.commissionAmountPaise,
          hamaliAmountPaise: dalaliPreview.hamaliAmountPaise,
          niituFeePaise: dalaliPreview.niituFeePaise,
          tukadFeePaise: dalaliPreview.tukadFeePaise,
          rmcFeePaise: dalaliPreview.rmcFeePaise,
          paymentMode: dvPaymentMode === 'CREDIT_PAYABLE' ? 'CREDIT' : dvPaymentMode,
          bankAccountId: dvPaymentMode === 'BANK_TRANSFER' ? dvBankAccountId || null : null,
          notes: dvNotes.trim(),
        });

        setSelectedDalaliKharidi(created);
        setFeedback({
          type: 'success',
          message: `Created Dalali Kharidi Patti ${created.pattiNo}. Net Receivable: ${formatINR(created.netReceivablePaise)}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create Dalali Patti',
      });
    }
  };

  const handleSubmitCashCreditBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (!onCreateCashCreditBill) return;
      const targetBuyerId = cbBuyerId || buyers[0]?.id;
      if (!targetBuyerId) {
        throw new Error('Please register at least one Buyer first.');
      }

      const items: CashCreditBillLineInput[] = cbLines.map((l) => ({
        commodityId: l.commodityId || stockStatuses[0]?.commodity.id || '',
        bags: Math.round(Number(l.bags || 0)),
        andiges: Math.round(Number(l.andiges || 0)),
        netWeightGrams: Math.round(Number(l.weightQuintals || 0) * 100_000),
        ratePerQuintalPaise: rupeesToPaise(l.rateRupees || '0'),
        gstApplicable: l.gstApplicable,
        cgstRateBps: l.gstApplicable ? Math.round(Number(l.cgstPct || 0) * 100) : 0,
        sgstRateBps: l.gstApplicable ? Math.round(Number(l.sgstPct || 0) * 100) : 0,
        igstRateBps: 0,
      }));

      const paymentMode: KharidiPaymentMode = cbKind === 'CASH_BILL' ? 'CASH' : 'CREDIT';
      const created = await onCreateCashCreditBill({
        billDate: cbDate,
        billKind: cbKind,
        buyerId: targetBuyerId,
        ownershipMode: cbOwnershipMode,
        classSerial: cbClassSerial.trim(),
        transport: {
          lorryOwnerName: cbLorryOwner.trim(),
          driverName: cbDriverName.trim(),
          driverLicenseNo: cbDriverLicense.trim(),
          driverPhone: cbDriverPhone.trim(),
          vehicleNo: cbVehicleNo.trim(),
          originPlace: cbOrigin.trim(),
          destinationPlace: cbDestination.trim(),
          deliveryNoteNo: cbDeliveryNoteNo.trim(),
          freightAdvancePaise: rupeesToPaise(cbFreightAdvanceRupees || '0'),
        },
        items,
        commissionPaise: cbPreview.commissionPaise,
        hamaliPackingPaise: cbPreview.hamaliPackingPaise,
        rmcFeePaise: cbPreview.rmcFeePaise,
        tukadFeePaise: cbPreview.tukadFeePaise,
        cstOrOtherTaxLabel: cbCstLabel.trim(),
        cstOrOtherTaxPaise: cbPreview.cstOrOtherTaxPaise,
        paymentMode,
        bankAccountId: cbBankAccountId || null,
        amountReceivedNowPaise:
          cbKind === 'CASH_BILL'
            ? cbPreview.netBillAmountPaise
            : rupeesToPaise(cbAmountReceivedRupees || '0'),
        notes: cbNotes.trim(),
      });

      setSelectedCashCreditBill(created);
      setFeedback({
        type: 'success',
        message: `Issued ${created.billKind.replace('_', ' ')} ${created.billNo} for ${formatINR(created.netBillAmountPaise)} (${created.amountInWords}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create Cash/Credit Bill',
      });
    }
  };

  const handleReverseSelectedBill = async () => {
    if (!selectedCashCreditBill || !onReverseCashCreditBill) return;
    setFeedback(null);
    try {
      const reversed = await onReverseCashCreditBill(selectedCashCreditBill.id, {
        reversalDate: businessDate,
        reason: reversalReasonInput.trim() || 'Authorized Credit Note / Bill Reversal',
      });
      setSelectedCashCreditBill(reversed);
      setReversalReasonInput('');
      setFeedback({
        type: 'success',
        message: `Reversed Bill ${reversed.billNo} via Credit Note ${reversed.creditNoteNo}. Stock and Khata balances restored.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reverse Cash/Credit Bill',
      });
    }
  };

  // Top KPI Strip Aggregates
  const totalFarmerGrossPaise = farmerPattis.reduce((s, p) => s + p.grossCropAmountPaise, 0);
  const totalLoanRecoveredViaPattisPaise = farmerPattis.reduce(
    (s, p) => s + p.totalLoanRecoveredPaise,
    0
  );
  const totalKharidiReceivablePaise =
    kharidiPattis.reduce((s, p) => s + p.netReceivablePaise, 0) +
    dalaliKharidiPattis.reduce((s, p) => s + p.netReceivablePaise, 0) +
    cashCreditBills
      .filter((b) => b.status === 'FINALIZED')
      .reduce((s, b) => s + b.netBillAmountPaise, 0);
  const totalCommissionHamaliEarnedPaise =
    farmerPattis.reduce((s, p) => s + p.commissionAmountPaise + p.hamaliAmountPaise, 0) +
    kharidiPattis.reduce((s, p) => s + p.buyerCommissionPaise + p.buyerHamaliPackingPaise, 0) +
    dalaliVikriPattis.reduce((s, p) => s + p.commissionAmountPaise + p.hamaliAmountPaise, 0) +
    dalaliKharidiPattis.reduce((s, p) => s + p.commissionAmountPaise + p.hamaliAmountPaise, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Agency Isolation · Loan Recovery · Statutory Invoicing</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'kn'
              ? 'ಪಟ್ಟಿಗಳು, ದಲಾಲಿ ಮತ್ತು ನಗದು/ಉದರಿ ಬಿಲ್ಲಿಂಗ್ ಇಂಜಿನ್'
              : 'Farmer Patti, Dalali Section & Cash/Credit Billing Engine'}
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Integrated mandi billing engine covering Farmer Settlement Pattis (`SGT-FP`), Buyer
            Kharidi Pattis (`SGT-KP`), Dalali Vikri & Kharidi Pattis (`SGT-DV` / `SGT-DK`), and
            Transport-enabled Cash/Credit Invoices (`SGT-CB`) with Credit Note reversals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/75 rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('FARMER_PATTI')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'FARMER_PATTI'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Farmer Patti ({farmerPattis.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('KHARIDI_PATTI')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'KHARIDI_PATTI'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Buyer Kharidi ({kharidiPattis.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DALALI_SECTION')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'DALALI_SECTION'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dalali Vikri & Kharidi ({dalaliVikriPattis.length + dalaliKharidiPattis.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CASH_CREDIT_BILL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'CASH_CREDIT_BILL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cash / Credit Bill ({cashCreditBills.length})
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">
            Gross Farmer Patti Crop Value
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatINR(totalFarmerGrossPaise, false)}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {farmerPattis.length} Settled Pattis (SGT-FP)
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">
            Loan Principal + Interest Recovered
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            {formatINR(totalLoanRecoveredViaPattisPaise, false)}
          </div>
          <div className="text-xs text-slate-500">
            Auto-settled from crop proceeds (AT-08)
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">
            Buyer Kharidi Patti Billing
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600">
            {formatINR(totalKharidiReceivablePaise, false)}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {kharidiPattis.length} Buyer Bills (SGT-KP)
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1">
          <div className="text-xs font-medium text-slate-500">
            Commission & Hamali Earned
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatINR(totalCommissionHamaliEarnedPaise, false)}
          </div>
          <div className="text-xs text-slate-500">
            Posted to Accounts 4002 & 4004
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`glass-panel rounded-2xl p-4 flex items-center justify-between text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-300/80 text-emerald-900 bg-emerald-50/70'
              : 'border-rose-300/80 text-rose-900 bg-rose-50/70'
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
            className="text-slate-500 hover:text-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'FARMER_PATTI' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Farmer Patti Builder */}
          <form
            onSubmit={handleSubmitFarmerPatti}
            className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Create Farmer Settlement Patti (ರೈತ ಪಟ್ಟಿ)
                </h2>
                <p className="text-xs text-slate-500">
                  Calculates gross crop proceeds, deducts mandi charges, recovers active loan
                  balances, and carries forward any loan shortfall automatically.
                </p>
              </div>
              <span className="text-xs font-mono text-blue-600 font-semibold">SGT-FP Series</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Registered Farmer (ರೈತರು) *
                </label>
                <select
                  required
                  value={fpFarmerId}
                  onChange={(e) => setFpFarmerId(e.target.value)}
                  className="apple-input w-full"
                >
                  <option value="">-- Select Farmer --</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.partyCode}) · {f.village || 'Mandi'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Patti Date {fpDate && <span className="text-[11px] font-mono text-blue-600 font-normal">({formatDateDDMMYYYY(fpDate)})</span>}
                </label>
                <input
                  type="date"
                  required
                  value={fpDate}
                  onChange={(e) => setFpDate(e.target.value)}
                  className="apple-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Trading Mode
                </label>
                <select
                  value={fpOwnershipMode}
                  onChange={(e) => setFpOwnershipMode(e.target.value as StockOwnershipType)}
                  className="apple-input w-full"
                >
                  <option value="FARMER_AGENCY">Dalali / Agency Lot</option>
                  <option value="SGT_OWNED">SGT Owned Purchase</option>
                </select>
              </div>
            </div>

            {/* Crop Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Crop Lot Line Items (Weight in Quintals · Rate per Quintal)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setFpLines((prev) => [
                      ...prev,
                      {
                        commodityId: stockStatuses[0]?.commodity.id ?? '',
                        bags: '',
                        weightQuintals: '',
                        moisturePct: '0',
                        rateRupees: '',
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Lot Line
                </button>
              </div>

              {fpLines.map((line, idx) => {
                const lineGrams = Math.round(Number(line.weightQuintals || 0) * 100_000);
                const lineRatePaise = rupeesToPaise(line.rateRupees || '0');
                const lineGrossPaise = Math.round((lineGrams / 100_000) * lineRatePaise);

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white/75 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Commodity
                      </label>
                      <select
                        required
                        value={line.commodityId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFpLines((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, commodityId: val } : item
                            )
                          );
                        }}
                        className="apple-input w-full text-xs"
                      >
                        <option value="">-- Select Commodity --</option>
                        {stockStatuses.map((s) => (
                          <option key={s.commodity.id} value={s.commodity.id}>
                            {s.commodity.nameEn} ({s.commodity.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">Bags</label>
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Bags"
                        value={line.bags}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFpLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, bags: val } : item))
                          );
                        }}
                        className="apple-input w-full font-mono text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Net Weight (Q)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={line.weightQuintals}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFpLines((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, weightQuintals: val } : item
                            )
                          );
                        }}
                        className="apple-input w-full font-mono text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Rate / Q (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        placeholder="₹/Q"
                        value={line.rateRupees}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFpLines((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, rateRupees: val } : item
                            )
                          );
                        }}
                        className="apple-input w-full font-mono text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-between gap-2 pb-1">
                      <div className="text-right flex-1">
                        <div className="text-[10px] text-slate-400">Line Gross</div>
                        <div className="text-xs font-bold font-mono text-slate-900">
                          {formatINR(lineGrossPaise, false)}
                        </div>
                      </div>
                      {fpLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setFpLines((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Deductions Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Commission (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fpCommPct}
                  onChange={(e) => setFpCommPct(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Hamali / Bag (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={fpHamaliPerBagRupees}
                  onChange={(e) => setFpHamaliPerBagRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Weighment Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={fpWeighmentRupees}
                  onChange={(e) => setFpWeighmentRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Mandi / RMC Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={fpMandiFeeRupees}
                  onChange={(e) => setFpMandiFeeRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Other Deduction (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={fpOtherDedRupees}
                  onChange={(e) => setFpOtherDedRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>
            </div>

            {/* Active Farmer Loan Detection & AT-08 Recovery Panel */}
            {primaryActiveLoan ? (
              <div className="p-4 rounded-2xl bg-blue-50/75 border border-blue-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Active Farmer Loan Detected: {primaryActiveLoan.loanNo} (
                      {primaryActiveLoan.repaymentOrder})
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      Principal Due: {formatINR(primaryActiveLoan.principalOutstandingPaise)} ·
                      Accrued Interest: {formatINR(primaryActiveLoan.accruedInterestAsOfTodayPaise)}{' '}
                      · Total Loan Due: {formatINR(fpPreview.loanDuePaise)}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fpRecoverLoan}
                      onChange={(e) => setFpRecoverLoan(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Recover in this Patti</span>
                  </label>
                </div>

                {fpRecoverLoan && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Optional Custom Recovery Cap (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Auto max recoverable"
                        value={fpCustomLoanRecoveryRupees}
                        onChange={(e) => setFpCustomLoanRecoveryRupees(e.target.value)}
                        className="apple-input w-full font-mono text-xs"
                      />
                    </div>
                    <div className="text-xs font-mono space-y-0.5">
                      <div className="text-slate-500">Recovering Now:</div>
                      <div className="font-bold text-emerald-700">
                        {formatINR(fpPreview.actualLoanRecoveredPaise)} (P:{' '}
                        {formatINR(fpPreview.principalRecoveredPaise, false)} + I:{' '}
                        {formatINR(fpPreview.interestRecoveredPaise, false)})
                      </div>
                    </div>
                    <div className="text-xs font-mono space-y-0.5">
                      <div className="text-slate-500">Shortfall Carry-Forward (AT-08):</div>
                      <div
                        className={`font-bold ${
                          fpPreview.carryForwardLoanBalancePaise > 0
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {formatINR(fpPreview.carryForwardLoanBalancePaise)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-100/70 border border-slate-200/70 text-xs text-slate-500">
                No active outstanding Farmer Loan for the selected farmer.
              </div>
            )}

            {/* Settlement Mode & Live Summary Footer */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Payout Mode
                </label>
                <select
                  value={fpPaymentMode}
                  onChange={(e) =>
                    setFpPaymentMode(e.target.value as PattiSettlementPaymentMode)
                  }
                  className="apple-input w-full text-xs"
                >
                  <option value="CASH">Cash Payout (1001)</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT (1002)</option>
                  <option value="CREDIT_PAYABLE">Keep as Farmer Payable (2001)</option>
                </select>
              </div>

              {fpPaymentMode === 'BANK_TRANSFER' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Disbursing Bank Account
                  </label>
                  <select
                    value={fpBankAccountId}
                    onChange={(e) => setFpBankAccountId(e.target.value)}
                    className="apple-input w-full text-xs"
                  >
                    <option value="">-- Select Bank --</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountLabel} ({b.accountNumberMasked})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Vehicle / Slip Reference
                </label>
                <input
                  type="text"
                  placeholder="Optional Vehicle No"
                  value={fpVehicleNo}
                  onChange={(e) => setFpVehicleNo(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/5 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs font-mono">
                <div>
                  Gross Crop: <strong>{formatINR(fpPreview.grossCropAmountPaise)}</strong> · Ops
                  Deductions:{' '}
                  <strong className="text-rose-700">
                    -{formatINR(fpPreview.totalOperationalDeductionsPaise)}
                  </strong>{' '}
                  · Loan Recovered:{' '}
                  <strong className="text-blue-700">
                    -{formatINR(fpPreview.actualLoanRecoveredPaise)}
                  </strong>
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Net Payable to Farmer: {formatINR(fpPreview.netPayablePaise)}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canCreateBills}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all shadow-xs whitespace-nowrap"
              >
                Finalize & Print Farmer Patti
              </button>
            </div>
          </form>

          {/* Right 5 Columns: Printable Farmer Patti Receipt Preview & Recent Pattis */}
          <div className="lg:col-span-5 space-y-6">
            {selectedFarmerPatti ? (
              <div className="glass-panel rounded-3xl p-6 space-y-5 border border-blue-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                  <div>
                    <div className="text-[11px] font-mono text-blue-600 font-semibold">
                      BILINGUAL PRINT-READY PATTI · {selectedFarmerPatti.pattiNo}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {settings.legalName || 'Shree Guru Traders'} · ರೈತ ಪಟ್ಟಿ / Farmer Patti
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-600" />
                    Print
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Farmer / ರೈತರು:</span>{' '}
                    <span className="font-semibold text-slate-900">
                      {selectedFarmerPatti.farmerName} ({selectedFarmerPatti.farmerCode})
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-slate-500">Date:</span>{' '}
                    <span>{formatDateDDMMYYYY(selectedFarmerPatti.pattiDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Village / ಗ್ರಾಮ:</span>{' '}
                    <span>{selectedFarmerPatti.farmerVillage || '—'}</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-slate-500">Mode:</span>{' '}
                    <span>{selectedFarmerPatti.paymentMode}</span>
                  </div>
                </div>

                <div className="border-t border-b border-slate-200/80 py-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">
                    Crop Lots / ಉತ್ಪನ್ನಗಳ ವಿವರ
                  </div>
                  {selectedFarmerPatti.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-xs font-mono"
                    >
                      <span className="font-sans font-medium text-slate-800">
                        {it.commodityNameEn} ({it.commodityNameKn}) · {it.bags}b ·{' '}
                        {(it.netWeightGrams / 100_000).toFixed(2)}Q @{' '}
                        {formatINR(it.ratePerQuintalPaise, false)}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatINR(it.grossAmountPaise)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">
                      Gross Crop Proceeds (ಒಟ್ಟು ಮೊತ್ತ):
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatINR(selectedFarmerPatti.grossCropAmountPaise)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="font-sans">
                      Less: Commission / ದಲ್ಲಾಳಿ (
                      {(selectedFarmerPatti.commissionRateBps / 100).toFixed(2)}%):
                    </span>
                    <span>-{formatINR(selectedFarmerPatti.commissionAmountPaise)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="font-sans">Less: Hamali / ಹಮಾಲಿ:</span>
                    <span>-{formatINR(selectedFarmerPatti.hamaliAmountPaise)}</span>
                  </div>
                  {(selectedFarmerPatti.weighmentFeePaise > 0 ||
                    selectedFarmerPatti.mandiFeePaise > 0 ||
                    selectedFarmerPatti.otherDeductionsPaise > 0) && (
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">
                        Less: Weighment, Mandi & {selectedFarmerPatti.otherDeductionsLabel}:
                      </span>
                      <span>
                        -
                        {formatINR(
                          selectedFarmerPatti.weighmentFeePaise +
                            selectedFarmerPatti.mandiFeePaise +
                            selectedFarmerPatti.otherDeductionsPaise
                        )}
                      </span>
                    </div>
                  )}
                  {selectedFarmerPatti.totalLoanRecoveredPaise > 0 && (
                    <>
                      <div className="flex justify-between text-blue-700 font-semibold">
                        <span className="font-sans">
                          Less: Loan Principal Recovered (ಸಾಲ ಅಸಲು ವಸೂಲಿ):
                        </span>
                        <span>
                          -{formatINR(selectedFarmerPatti.loanPrincipalRecoveredPaise)}
                        </span>
                      </div>
                      <div className="flex justify-between text-blue-700 font-semibold">
                        <span className="font-sans">
                          Less: Loan Interest Recovered (ಬಡ್ಡಿ ವಸೂಲಿ):
                        </span>
                        <span>
                          -{formatINR(selectedFarmerPatti.loanInterestRecoveredPaise)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-emerald-800">
                    <span className="font-sans">
                      Net Payable to Farmer (ರೈತರಿಗೆ ಸಂದಾಯ ಮೊತ್ತ):
                    </span>
                    <span>{formatINR(selectedFarmerPatti.netPayablePaise)}</span>
                  </div>
                  {selectedFarmerPatti.carryForwardLoanBalancePaise > 0 && (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 flex justify-between text-amber-900 font-semibold">
                      <span className="font-sans">
                        Carry-Forward Loan Balance (ಮುಂದುವರಿದ ಸಾಲ ಬಾಕಿ · AT-08):
                      </span>
                      <span>{formatINR(selectedFarmerPatti.carryForwardLoanBalancePaise)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Recent Farmer Pattis List */}
            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Settled Farmer Pattis ({farmerPattis.length})
              </h3>
              {farmerPattis.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No Farmer Pattis settled yet. Complete the form on the left to issue your first
                  `SGT-FP` settlement.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {farmerPattis.map((fp) => (
                    <button
                      key={fp.id}
                      type="button"
                      onClick={() => setSelectedFarmerPatti(fp)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        selectedFarmerPatti?.id === fp.id
                          ? 'bg-blue-50/80 border-blue-300'
                          : 'bg-white/70 border-slate-200/70 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold font-mono text-slate-900">
                          {fp.pattiNo} · {fp.farmerName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatDateDDMMYYYY(fp.pattiDate)} · {fp.totalBags} Bags · Gross:{' '}
                          {formatINR(fp.grossCropAmountPaise, false)}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-emerald-700">
                          Net: {formatINR(fp.netPayablePaise, false)}
                        </div>
                        {fp.carryForwardLoanBalancePaise > 0 && (
                          <div className="text-[10px] text-amber-700">
                            CF Loan: {formatINR(fp.carryForwardLoanBalancePaise, false)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'KHARIDI_PATTI' ? (
        /* Buyer-Side Kharidi Patti Tab */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmitKharidiPatti}
            className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Create Buyer-Side Kharidi Patti (ಖರೀದಿ ಪಟ್ಟಿ)
                </h2>
                <p className="text-xs text-slate-500">
                  Generates Buyer Sales / Dalali Kharidi Patti (`SGT-KP-*`) with non-automatic GST
                  (`DR-04`) and atomic stock + Khata posting.
                </p>
              </div>
              <span className="text-xs font-mono text-blue-600 font-semibold">SGT-KP Series</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Registered Buyer / Wholesaler *
                </label>
                <select
                  required
                  value={kpBuyerId}
                  onChange={(e) => setKpBuyerId(e.target.value)}
                  className="apple-input w-full"
                >
                  <option value="">-- Select Buyer --</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.partyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  required
                  value={kpDate}
                  onChange={(e) => setKpDate(e.target.value)}
                  className="apple-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Sale Mode
                </label>
                <select
                  value={kpOwnershipMode}
                  onChange={(e) => setKpOwnershipMode(e.target.value as StockOwnershipType)}
                  className="apple-input w-full"
                >
                  <option value="SGT_OWNED">SGT Owned Sale</option>
                  <option value="FARMER_AGENCY">Dalali Pass-Through</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Kharidi Patti Line Items (Explicit GST Toggle per Line · DR-04)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setKpLines((prev) => [
                      ...prev,
                      {
                        commodityId: stockStatuses[0]?.commodity.id ?? '',
                        bags: '',
                        weightQuintals: '',
                        rateRupees: '',
                        gstApplicable: false,
                        cgstPct: '2.5',
                        sgstPct: '2.5',
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>

              {kpLines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/75 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-500 mb-1">Commodity</label>
                    <select
                      required
                      value={line.commodityId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKpLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, commodityId: val } : item
                          )
                        );
                      }}
                      className="apple-input w-full text-xs"
                    >
                      <option value="">-- Select Commodity --</option>
                      {stockStatuses.map((s) => (
                        <option key={s.commodity.id} value={s.commodity.id}>
                          {s.commodity.nameEn} ({s.commodity.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Bags</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={line.bags}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKpLines((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, bags: val } : item))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Net Weight (Q)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={line.weightQuintals}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKpLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, weightQuintals: val } : item
                          )
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Rate / Q (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={line.rateRupees}
                      onChange={(e) => {
                        const val = e.target.value;
                        setKpLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, rateRupees: val } : item
                          )
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between pb-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.gstApplicable}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setKpLines((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, gstApplicable: checked } : item
                            )
                          );
                        }}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>5% GST</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Buyer Commission (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={kpCommPct}
                  onChange={(e) => setKpCommPct(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Hamali & Packing (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={kpHamaliPackingRupees}
                  onChange={(e) => setKpHamaliPackingRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Market / APMC Cess (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={kpMarketFeeRupees}
                  onChange={(e) => setKpMarketFeeRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Settlement Mode
                </label>
                <select
                  value={kpPaymentMode}
                  onChange={(e) => setKpPaymentMode(e.target.value as KharidiPaymentMode)}
                  className="apple-input w-full text-xs"
                >
                  <option value="CREDIT">Buyer Credit Receivable (1301)</option>
                  <option value="CASH">Cash Receipt (1001)</option>
                  <option value="BANK_TRANSFER">Bank Receipt (1002)</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/5 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs font-mono">
                <div>
                  Base Crop: <strong>{formatINR(kpPreview.totalBaseAmountPaise)}</strong> · Buyer
                  Charges:{' '}
                  <strong>
                    +
                    {formatINR(
                      kpPreview.buyerCommissionPaise +
                        kpPreview.buyerHamaliPackingPaise +
                        kpPreview.buyerMarketFeePaise
                    )}
                  </strong>{' '}
                  · Explicit GST: <strong>+{formatINR(kpPreview.totalGstPaise)}</strong>
                </div>
                <div className="text-sm font-bold text-blue-700">
                  Total Kharidi Patti Receivable: {formatINR(kpPreview.netReceivablePaise)}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canCreateBills}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all shadow-xs whitespace-nowrap"
              >
                Issue Buyer Kharidi Patti
              </button>
            </div>
          </form>

          {/* Right 5 Columns: Kharidi Patti List & Preview */}
          <div className="lg:col-span-5 space-y-6">
            {selectedKharidiPatti && (
              <div className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                  <div>
                    <div className="text-[11px] font-mono text-blue-600 font-semibold">
                      BUYER KHARIDI PATTI · {selectedKharidiPatti.invoiceNo}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedKharidiPatti.buyerName} ({selectedKharidiPatti.buyerCode})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-600" />
                    Print
                  </button>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  {selectedKharidiPatti.items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span className="font-sans">
                        {it.commodityNameEn} · {it.bags}b ·{' '}
                        {(it.netWeightGrams / 100_000).toFixed(2)}Q
                      </span>
                      <span>{formatINR(it.baseAmountPaise)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-blue-700">
                    <span className="font-sans">Net Receivable Total:</span>
                    <span>{formatINR(selectedKharidiPatti.netReceivablePaise)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Issued Buyer Kharidi Pattis ({kharidiPattis.length})
              </h3>
              {kharidiPattis.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No Buyer Kharidi Pattis issued yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {kharidiPattis.map((kp) => (
                    <button
                      key={kp.id}
                      type="button"
                      onClick={() => setSelectedKharidiPatti(kp)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        selectedKharidiPatti?.id === kp.id
                          ? 'bg-blue-50/80 border-blue-300'
                          : 'bg-white/70 border-slate-200/70 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold font-mono text-slate-900">
                          {kp.invoiceNo} · {kp.buyerName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatDateDDMMYYYY(kp.invoiceDate)} · {kp.totalBags} Bags
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-bold text-blue-700">
                        {formatINR(kp.netReceivablePaise, false)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'DALALI_SECTION' ? (
        /* Chunk 6: Dalali Vikri Patti (SRS 8.1) & Dalali Kharidi Patti (SRS 8.2) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmitDalaliPatti}
            className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {dalaliSubMode === 'VIKRI'
                    ? 'Dalali Vikri Patti — Farmer Commission Sale (ದಲಾಲಿ ವಿಕ್ರಿ ಪಟ್ಟಿ)'
                    : 'Dalali Kharidi Patti — Buyer Commission Bill (ದಲಾಲಿ ಖರೀದಿ ಪಟ್ಟಿ)'}
                </h2>
                <p className="text-xs text-slate-500">
                  Strictly isolated `FARMER_AGENCY` Dalali goods with configurable{' '}
                  {settings.customLabels.niituFeeLabelEn},{' '}
                  {settings.customLabels.tukadFeeLabelEn},{' '}
                  {settings.customLabels.rmcFeeLabelEn}, and{' '}
                  {settings.customLabels.andigesLabelEn} fields (`DR-06`).
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDalaliSubMode('VIKRI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    dalaliSubMode === 'VIKRI'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Vikri Patti (SGT-DV)
                </button>
                <button
                  type="button"
                  onClick={() => setDalaliSubMode('KHARIDI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    dalaliSubMode === 'KHARIDI'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Kharidi Patti (SGT-DK)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Farmer (ರೈತರು) {dalaliSubMode === 'VIKRI' ? '*' : '(Linked)'}
                </label>
                <select
                  required={dalaliSubMode === 'VIKRI'}
                  value={dvFarmerId}
                  onChange={(e) => setDvFarmerId(e.target.value)}
                  className="apple-input w-full text-xs"
                >
                  <option value="">-- Select Farmer --</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.partyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Buyer (ಖರೀದಿದಾರರು) {dalaliSubMode === 'KHARIDI' ? '*' : '(Counterparty)'}
                </label>
                <select
                  required={dalaliSubMode === 'KHARIDI'}
                  value={dvBuyerId}
                  onChange={(e) => setDvBuyerId(e.target.value)}
                  className="apple-input w-full text-xs"
                >
                  <option value="">-- Select Buyer --</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.partyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Patti Date {dvDate && <span className="text-[11px] font-mono text-blue-600 font-normal">({formatDateDDMMYYYY(dvDate)})</span>}
                </label>
                <input
                  type="date"
                  required
                  value={dvDate}
                  onChange={(e) => setDvDate(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Class / Serial & Vehicle
                </label>
                <input
                  type="text"
                  placeholder="Class A-01 / Vehicle"
                  value={dvClassSerial}
                  onChange={(e) => setDvClassSerial(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>
            </div>

            {/* Dalali Commodity Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Dalali Agency Lots (Includes {settings.customLabels.andigesLabelEn} & Non-Auto GST)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDvLines((prev) => [
                      ...prev,
                      {
                        commodityId: stockStatuses[0]?.commodity.id ?? '',
                        bags: '',
                        andiges: '1',
                        weightQuintals: '',
                        rateRupees: '',
                        gstApplicable: false,
                        cgstPct: '2.5',
                        sgstPct: '2.5',
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Dalali Lot
                </button>
              </div>

              {dvLines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/75 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">Commodity</label>
                    <select
                      required
                      value={line.commodityId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDvLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, commodityId: val } : it))
                        );
                      }}
                      className="apple-input w-full text-xs"
                    >
                      <option value="">-- Select --</option>
                      {stockStatuses.map((s) => (
                        <option key={s.commodity.id} value={s.commodity.id}>
                          {s.commodity.nameEn} ({s.commodity.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Bags</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={line.bags}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDvLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, bags: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {settings.customLabels.andigesLabelEn}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={line.andiges}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDvLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, andiges: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Weight (Q)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={line.weightQuintals}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDvLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, weightQuintals: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Rate / Q (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={line.rateRupees}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDvLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, rateRupees: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-1 flex items-center pb-1">
                    {dalaliSubMode === 'KHARIDI' && (
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.gstApplicable}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setDvLines((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, gstApplicable: checked } : it
                              )
                            );
                          }}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>GST</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Configurable DR-06 Mandi Deductions & Charges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Commission (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dvCommPct}
                  onChange={(e) => setDvCommPct(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Hamali Total (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={dvHamaliRupees}
                  onChange={(e) => setDvHamaliRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {settings.customLabels.niituFeeLabelEn} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={dvNiituRupees}
                  onChange={(e) => setDvNiituRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {settings.customLabels.tukadFeeLabelEn} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={dvTukadRupees}
                  onChange={(e) => setDvTukadRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {settings.customLabels.rmcFeeLabelEn} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={dvRmcRupees}
                  onChange={(e) => setDvRmcRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Vehicle Rent (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={dvVehicleRentRupees}
                  onChange={(e) => setDvVehicleRentRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/5 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs font-mono">
                <div>
                  Gross Agency Value:{' '}
                  <strong>{formatINR(dalaliPreview.totalBaseAmountPaise)}</strong> ·{' '}
                  {dalaliSubMode === 'VIKRI'
                    ? `Deductions: -${formatINR(dalaliPreview.totalVikriDeductionsPaise)}`
                    : `Charges + Explicit GST: +${formatINR(
                        dalaliPreview.netKharidiReceivablePaise -
                          dalaliPreview.totalBaseAmountPaise
                      )}`}
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {dalaliSubMode === 'VIKRI'
                    ? `Net Dalali Vikri Payable: ${formatINR(dalaliPreview.netVikriPayablePaise)}`
                    : `Net Dalali Kharidi Receivable: ${formatINR(
                        dalaliPreview.netKharidiReceivablePaise
                      )}`}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canCreateBills}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all shadow-xs whitespace-nowrap"
              >
                {dalaliSubMode === 'VIKRI'
                  ? 'Finalize Dalali Vikri Patti (SGT-DV)'
                  : 'Finalize Dalali Kharidi Patti (SGT-DK)'}
              </button>
            </div>
          </form>

          {/* Right 5 Columns: Dalali Registers */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Dalali Vikri Pattis ({dalaliVikriPattis.length}) · SGT-DV
              </h3>
              {dalaliVikriPattis.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No Dalali Vikri Pattis recorded yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {dalaliVikriPattis.map((dv) => (
                    <div
                      key={dv.id}
                      className="p-3 rounded-2xl bg-white/80 border border-slate-200/80 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {dv.pattiNo} · {dv.farmerName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(dv.pattiDate)} · {dv.totalBags}b ({dv.totalAndiges}{' '}
                          {settings.customLabels.andigesLabelEn})
                        </div>
                      </div>
                      <div className="text-right font-bold text-emerald-700">
                        {formatINR(dv.netPayablePaise, false)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Dalali Kharidi Pattis ({dalaliKharidiPattis.length}) · SGT-DK
              </h3>
              {dalaliKharidiPattis.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No Dalali Kharidi Pattis recorded yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {dalaliKharidiPattis.map((dk) => (
                    <div
                      key={dk.id}
                      className="p-3 rounded-2xl bg-white/80 border border-slate-200/80 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {dk.pattiNo} · {dk.buyerName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(dk.pattiDate)} · GST: {formatINR(dk.totalGstPaise, false)}
                        </div>
                      </div>
                      <div className="text-right font-bold text-blue-700">
                        {formatINR(dk.netReceivablePaise, false)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Chunk 6: Cash / Credit Bill & Controlled Credit Note Reversal (SRS Sec 9.1, 9.2 & 17.3) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmitCashCreditBill}
            className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Create Cash / Credit Bill with Transport Details (ನಗದು / ಉದರಿ ಬಿಲ್)
                </h2>
                <p className="text-xs text-slate-500">
                  Full commercial/tax invoice (`SGT-CB-*`) with lorry/driver dispatch fields,
                  configurable {cbCstLabel} (`DR-07`), amount in words, and controlled Credit Note
                  reversal (`AT-14`).
                </p>
              </div>
              <span className="text-xs font-mono text-blue-600 font-semibold">SGT-CB Series</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bill Type</label>
                <select
                  value={cbKind}
                  onChange={(e) => setCbKind(e.target.value as 'CASH_BILL' | 'CREDIT_BILL')}
                  className="apple-input w-full text-xs"
                >
                  <option value="CREDIT_BILL">Credit Bill (ಉದರಿ ಬಿಲ್)</option>
                  <option value="CASH_BILL">Cash Bill (ನಗದು ಬಿಲ್)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Buyer / Customer *
                </label>
                <select
                  required
                  value={cbBuyerId}
                  onChange={(e) => setCbBuyerId(e.target.value)}
                  className="apple-input w-full text-xs"
                >
                  <option value="">-- Select Buyer --</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.partyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bill Date</label>
                <input
                  type="date"
                  required
                  value={cbDate}
                  onChange={(e) => setCbDate(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Stock Mode</label>
                <select
                  value={cbOwnershipMode}
                  onChange={(e) => setCbOwnershipMode(e.target.value as StockOwnershipType)}
                  className="apple-input w-full text-xs"
                >
                  <option value="SGT_OWNED">SGT Owned Stock</option>
                  <option value="FARMER_AGENCY">Dalali Agency Stock</option>
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Invoice Commodity Lines (Explicit GST Toggle · AT-11)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCbLines((prev) => [
                      ...prev,
                      {
                        commodityId: stockStatuses[0]?.commodity.id ?? '',
                        bags: '',
                        andiges: '1',
                        weightQuintals: '',
                        rateRupees: '',
                        gstApplicable: false,
                        cgstPct: '2.5',
                        sgstPct: '2.5',
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Invoice Line
                </button>
              </div>

              {cbLines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/75 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-500 mb-1">Commodity</label>
                    <select
                      required
                      value={line.commodityId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCbLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, commodityId: val } : it))
                        );
                      }}
                      className="apple-input w-full text-xs"
                    >
                      <option value="">-- Select Commodity --</option>
                      {stockStatuses.map((s) => (
                        <option key={s.commodity.id} value={s.commodity.id}>
                          {s.commodity.nameEn} ({s.commodity.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Bags</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={line.bags}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCbLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, bags: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Weight (Q)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={line.weightQuintals}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCbLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, weightQuintals: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Rate / Q (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={line.rateRupees}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCbLines((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, rateRupees: val } : it))
                        );
                      }}
                      className="apple-input w-full font-mono text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center pb-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.gstApplicable}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCbLines((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, gstApplicable: checked } : it
                            )
                          );
                        }}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>5% GST</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* Transport & Lorry Dispatch Details (SRS Sec 9.1 & 9.2) */}
            <div className="p-4 rounded-2xl bg-slate-100/80 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Lorry & Transport Dispatch Details (SRS Sec 9.2)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Vehicle / Lorry No</label>
                  <input
                    type="text"
                    placeholder="KA-28-N-4512"
                    value={cbVehicleNo}
                    onChange={(e) => setCbVehicleNo(e.target.value)}
                    className="apple-input w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Lorry Owner</label>
                  <input
                    type="text"
                    placeholder="Owner Name"
                    value={cbLorryOwner}
                    onChange={(e) => setCbLorryOwner(e.target.value)}
                    className="apple-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Driver Name</label>
                  <input
                    type="text"
                    placeholder="Driver Name"
                    value={cbDriverName}
                    onChange={(e) => setCbDriverName(e.target.value)}
                    className="apple-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Licence No</label>
                  <input
                    type="text"
                    placeholder="DL-KA28..."
                    value={cbDriverLicense}
                    onChange={(e) => setCbDriverLicense(e.target.value)}
                    className="apple-input w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Destination</label>
                  <input
                    type="text"
                    placeholder="City / Factory"
                    value={cbDestination}
                    onChange={(e) => setCbDestination(e.target.value)}
                    className="apple-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Delivery / E-Way No</label>
                  <input
                    type="text"
                    placeholder="DN-001"
                    value={cbDeliveryNoteNo}
                    onChange={(e) => setCbDeliveryNoteNo(e.target.value)}
                    className="apple-input w-full font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Charges & Configurable CST / Other Tax Slot (DR-07) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Hamali & Packing (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cbHamaliRupees}
                  onChange={(e) => setCbHamaliRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {settings.customLabels.rmcFeeLabelEn} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cbRmcRupees}
                  onChange={(e) => setCbRmcRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Tax Label (DR-07)
                </label>
                <input
                  type="text"
                  value={cbCstLabel}
                  onChange={(e) => setCbCstLabel(e.target.value)}
                  className="apple-input w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {cbCstLabel} Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={cbCstRupees}
                  onChange={(e) => setCbCstRupees(e.target.value)}
                  className="apple-input w-full font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/5 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs">
                <div className="font-mono text-sm font-bold text-blue-700">
                  Net Invoice Total: {formatINR(cbPreview.netBillAmountPaise)}
                </div>
                <div className="text-[11px] text-slate-600 italic">
                  Amount in Words: {cbPreview.amountInWords}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canCreateBills}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all shadow-xs whitespace-nowrap"
              >
                Finalize {cbKind === 'CASH_BILL' ? 'Cash Bill' : 'Credit Bill'} (SGT-CB)
              </button>
            </div>
          </form>

          {/* Right 5 Columns: Printable Cash/Credit Bill Sheet & Credit Note Reversal (AT-14) */}
          <div className="lg:col-span-5 space-y-6">
            {selectedCashCreditBill && (
              <div className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                  <div>
                    <div className="text-[11px] font-mono text-blue-600 font-semibold">
                      {selectedCashCreditBill.billKind.replace('_', ' ')} ·{' '}
                      {selectedCashCreditBill.billNo} · {selectedCashCreditBill.status}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedCashCreditBill.buyerName} ({selectedCashCreditBill.buyerCode})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-600" />
                    Print
                  </button>
                </div>

                {selectedCashCreditBill.transport.vehicleNo && (
                  <div className="p-2.5 rounded-xl bg-slate-100/80 text-[11px] font-mono text-slate-700">
                    Vehicle: {selectedCashCreditBill.transport.vehicleNo} · Driver:{' '}
                    {selectedCashCreditBill.transport.driverName || '—'} · To:{' '}
                    {selectedCashCreditBill.transport.destinationPlace || '—'}
                  </div>
                )}

                <div className="space-y-1.5 text-xs font-mono">
                  {selectedCashCreditBill.items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span className="font-sans">
                        {it.commodityNameEn} · {it.bags}b ·{' '}
                        {(it.netWeightGrams / 100_000).toFixed(2)}Q
                      </span>
                      <span>{formatINR(it.lineTotalPaise)}</span>
                    </div>
                  ))}
                  {selectedCashCreditBill.cstOrOtherTaxPaise > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">
                        {selectedCashCreditBill.cstOrOtherTaxLabel}:
                      </span>
                      <span>+{formatINR(selectedCashCreditBill.cstOrOtherTaxPaise)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                    <span className="font-sans">Net Bill Total:</span>
                    <span>{formatINR(selectedCashCreditBill.netBillAmountPaise)}</span>
                  </div>
                  <div className="text-[11px] font-sans text-slate-600 italic">
                    {selectedCashCreditBill.amountInWords}
                  </div>
                </div>

                {selectedCashCreditBill.status === 'FINALIZED' &&
                  canApproveCorrections &&
                  onReverseCashCreditBill && (
                    <div className="pt-3 border-t border-slate-200/70 space-y-2">
                      <div className="text-[11px] font-semibold text-rose-700">
                        Controlled Credit Note / Reversal (SRS 17.3 · AT-14)
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Reason for Credit Note / Reversal..."
                          value={reversalReasonInput}
                          onChange={(e) => setReversalReasonInput(e.target.value)}
                          className="apple-input flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleReverseSelectedBill}
                          className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Issue Credit Note
                        </button>
                      </div>
                    </div>
                  )}

                {selectedCashCreditBill.status === 'REVERSED' && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-mono">
                    REVERSED via Credit Note <strong>{selectedCashCreditBill.creditNoteNo}</strong>:{' '}
                    {selectedCashCreditBill.reversalReason}
                  </div>
                )}
              </div>
            )}

            <div className="glass-panel rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Cash / Credit Bills ({cashCreditBills.length}) · SGT-CB
              </h3>
              {cashCreditBills.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No Cash/Credit Bills issued yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {cashCreditBills.map((cb) => (
                    <button
                      key={cb.id}
                      type="button"
                      onClick={() => setSelectedCashCreditBill(cb)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        selectedCashCreditBill?.id === cb.id
                          ? 'bg-blue-50/80 border-blue-300'
                          : 'bg-white/70 border-slate-200/70 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold font-mono text-slate-900">
                          {cb.billNo} · {cb.buyerName}{' '}
                          {cb.status === 'REVERSED' ? `(${cb.creditNoteNo})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatDateDDMMYYYY(cb.billDate)} · {cb.billKind.replace('_', ' ')} ·{' '}
                          {cb.totalBags}b
                        </div>
                      </div>
                      <div
                        className={`text-right font-mono text-xs font-bold ${
                          cb.status === 'REVERSED'
                            ? 'text-rose-600 line-through'
                            : 'text-blue-700'
                        }`}
                      >
                        {formatINR(cb.netBillAmountPaise, false)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


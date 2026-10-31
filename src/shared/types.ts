export enum UserRole {
  OWNER = 'OWNER',
  ACCOUNTANT = 'ACCOUNTANT',
  TRADING_STAFF = 'TRADING_STAFF',
  CASHIER = 'CASHIER',
  AUDITOR = 'AUDITOR',
}

export enum PermissionKey {
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  MANAGE_RATES_AND_POLICIES = 'MANAGE_RATES_AND_POLICIES',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_SENSITIVE_KYC = 'VIEW_SENSITIVE_KYC',
  CREATE_TRADING_BILLS = 'CREATE_TRADING_BILLS',
  MANAGE_LOANS = 'MANAGE_LOANS',
  MANAGE_CASH_BANK = 'MANAGE_CASH_BANK',
  APPROVE_CORRECTIONS = 'APPROVE_CORRECTIONS',
  REOPEN_CLOSED_DAY = 'REOPEN_CLOSED_DAY',
  VIEW_REPORTS_AND_AUDIT = 'VIEW_REPORTS_AND_AUDIT',
  EXPORT_SENSITIVE_DATA = 'EXPORT_SENSITIVE_DATA',
}

export enum RoundingMode {
  NEAREST_RUPEE = 'NEAREST_RUPEE',
  EXACT_PAISE = 'EXACT_PAISE',
  UP_RUPEE = 'UP_RUPEE',
  DOWN_RUPEE = 'DOWN_RUPEE',
}

export enum InterestMethod {
  SIMPLE = 'SIMPLE',
  COMPOUND = 'COMPOUND',
}

export enum RateUnit {
  YEARLY = 'YEARLY',
  MONTHLY = 'MONTHLY',
  DAILY = 'DAILY',
}

export enum DayCountConvention {
  ACT_365 = 'ACT_365',
  ACT_360 = 'ACT_360',
  THIRTY_360 = 'THIRTY_360',
}

export enum RepaymentAllocationOrder {
  PRINCIPAL_FIRST = 'PRINCIPAL_FIRST',
  INTEREST_FIRST = 'INTEREST_FIRST',
  MANUAL = 'MANUAL',
}

export enum WeightUnit {
  GRAM = 'GRAM',
  KG = 'KG',
  QUINTAL = 'QUINTAL',
  TONNE = 'TONNE',
  BAG = 'BAG',
}

export enum DocumentSeriesType {
  FARMER = 'FARMER',
  PARTY = 'PARTY',
  LOAN = 'LOAN',
  FARMER_PATTI = 'FARMER_PATTI',
  KHARIDI_PATTI = 'KHARIDI_PATTI',
  DALALI_VIKRI = 'DALALI_VIKRI',
  DALALI_KHARIDI = 'DALALI_KHARIDI',
  CASH_CREDIT_BILL = 'CASH_CREDIT_BILL',
  GOODS_IN = 'GOODS_IN',
  GOODS_OUT = 'GOODS_OUT',
  STOCK_ADJ = 'STOCK_ADJ',
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
  EXPENSE = 'EXPENSE',
  JOURNAL = 'JOURNAL',
}

export interface InterestPolicyConfig {
  defaultRateBps: number; // e.g. 1800 = 18.00%
  defaultRateUnit: RateUnit;
  defaultMethod: InterestMethod;
  dayCountConvention: DayCountConvention;
  repaymentAllocationOrder: RepaymentAllocationOrder;
  gracePeriodDays: number;
  unpaidInterestCompounds: boolean;
  roundingMode: RoundingMode;
  ownerConfirmed: boolean;
}

export interface CommissionHamaliPolicyConfig {
  defaultCommissionBps: number; // e.g. 200 = 2.00%
  defaultHamaliPerBagPaise: number; // e.g. 1000 = ₹10.00
  commissionTaxable: boolean;
  ownerConfirmed: boolean;
}

export interface CustomLabelsConfig {
  niituFeeLabelEn: string;
  niituFeeLabelKn: string;
  tukadFeeLabelEn: string;
  tukadFeeLabelKn: string;
  rmcFeeLabelEn: string;
  rmcFeeLabelKn: string;
  andigesLabelEn: string;
  andigesLabelKn: string;
  cstOrOtherTaxLabelEn: string;
  cstOrOtherTaxLabelKn: string;
  ownerConfirmed: boolean;
}

export interface ApprovalThresholdsConfig {
  highValueLoanPaise: number;
  requireApprovalForRateChange: boolean;
  requireApprovalForStockAdjustment: boolean;
  requireApprovalForFinalizedReversal: boolean;
  requireApprovalForDayReopen: boolean;
}

export interface CompanySettings {
  id: number;
  legalName: string;
  subtitleEn: string;
  subtitleKn: string;
  address: string;
  villageCity: string;
  stateName: string;
  pincode: string;
  phonePrimary: string;
  phoneSecondary: string;
  gstin: string;
  pan: string;
  timezone: string;
  currentFinancialYear: string;
  fyStartDate: string;
  fyEndDate: string;
  roundingMode: RoundingMode;
  stockValuationMethod: 'WEIGHTED_AVERAGE' | 'FIFO' | 'MANUAL';
  interestPolicy: InterestPolicyConfig;
  commissionHamaliPolicy: CommissionHamaliPolicyConfig;
  customLabels: CustomLabelsConfig;
  approvalThresholds: ApprovalThresholdsConfig;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  permissions: PermissionKey[];
  canViewSensitiveKyc: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface NumberSeriesRecord {
  id: string;
  docType: DocumentSeriesType;
  labelEn: string;
  labelKn: string;
  financialYear: string;
  prefix: string;
  currentSequence: number;
  paddingLength: number;
  includeFyInNumber: boolean;
  samplePreview: string;
  updatedAt: string;
}

export interface IssuedDocumentNumber {
  id: string;
  docType: DocumentSeriesType;
  financialYear: string;
  sequenceNumber: number;
  formattedNumber: string;
  referenceEntityId: string;
  transactionDate: string;
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  issuedBy: string;
  issuedAt: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  reason: string;
  approvedBy: string | null;
  userId: string;
  userName: string;
  userRole: UserRole;
  createdAt: string;
}

export interface RepaymentEventInput {
  date: string; // YYYY-MM-DD
  amountPaise: number;
  note?: string;
}

export interface InterestCalculationInput {
  principalPaise: number;
  ratePercentage: number; // e.g. 18 for 18% or 1.5 for 1.5%
  rateUnit: RateUnit;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  method: InterestMethod;
  dayCountConvention: DayCountConvention;
  repaymentAllocationOrder: RepaymentAllocationOrder;
  roundingMode: RoundingMode;
  gracePeriodDays?: number;
  repayments?: RepaymentEventInput[];
}

export interface InterestSegmentBreakdown {
  segmentIndex: number;
  fromDate: string;
  toDate: string;
  days: number;
  openingPrincipalPaise: number;
  openingUnpaidInterestPaise: number;
  interestAccruedInSegmentPaise: number;
  repaymentAmountPaise: number;
  allocatedToPrincipalPaise: number;
  allocatedToInterestPaise: number;
  closingPrincipalPaise: number;
  closingUnpaidInterestPaise: number;
  formulaNote: string;
}

export interface InterestCalculationResult {
  principalPaise: number;
  totalDays: number;
  rawInterestPaise: number;
  roundedInterestPaise: number;
  totalRepaidPaise: number;
  principalRepaidPaise: number;
  interestPaidPaise: number;
  closingPrincipalOutstandingPaise: number;
  closingInterestOutstandingPaise: number;
  totalOutstandingPaise: number;
  totalPayableWithNoRepaymentsPaise: number;
  isNonPostingPreview: true;
  policySummary: string;
  segments: InterestSegmentBreakdown[];
}

export type StockOwnershipType = 'SGT_OWNED' | 'FARMER_AGENCY' | 'CUSTOMER_HANDLED';
export type StockMovementDirection = 'OPENING' | 'GOODS_IN' | 'GOODS_OUT' | 'ADJUSTMENT';
export type StockTrackingMode = 'OWNED' | 'AGENCY_ONLY' | 'BOTH';

export interface CommodityRecord {
  id: string;
  code: string;
  nameEn: string;
  nameKn: string;
  gradeVariety: string;
  hsnCode: string;
  defaultUnit: WeightUnit;
  referenceBagWeightKg: number | null; // Optional helper only; bags & weight tracked separately
  lowStockThresholdGrams: number;
  lowStockThresholdQuintals?: number;
  standardRatePerQuintalPaise: number;
  stockTrackingMode?: StockTrackingMode;
  gstApplicableDefault?: boolean;
  cgstRateBps?: number;
  sgstRateBps?: number;
  igstRateBps?: number;
  commissionRateBps?: number;
  hamaliPerBagPaise?: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface StockMovementRecord {
  id: string;
  movementNo: string;
  commodityId: string;
  transactionDate: string;
  direction: StockMovementDirection;
  ownershipType: StockOwnershipType;
  bagsDelta: number; // Positive for IN/OPENING, negative for OUT, signed for ADJUSTMENT
  weightGramsDelta: number; // Positive for IN/OPENING, negative for OUT, signed for ADJUSTMENT
  grossWeightGrams?: number;
  tareWeightGrams?: number;
  moisturePct?: number;
  ratePerQuintalPaise: number;
  totalValuePaise: number;
  gstAmountPaise?: number;
  partyId?: string | null;
  partyName: string;
  settlementMode?: 'CASH' | 'BANK' | 'CREDIT';
  bankAccountId?: string | null;
  journalEntryId?: string | null;
  referenceBillNo: string;
  vehicleNo?: string;
  reason: string;
  approvedBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CommodityStockStatus {
  commodity: CommodityRecord;
  // SGT-Owned Stock (Closing = Opening + Goods In - Goods Out +/- Adjustments)
  openingBags: number;
  openingWeightGrams: number;
  goodsInBags: number;
  goodsInWeightGrams: number;
  goodsInValuePaise: number;
  goodsOutBags: number;
  goodsOutWeightGrams: number;
  goodsOutSalesValuePaise: number;
  adjustmentBags: number;
  adjustmentWeightGrams: number;
  closingOwnedBags: number;
  closingOwnedWeightGrams: number;
  closingOwnedWeightQuintals: number;
  closingOwnedWeightKg: number;
  weightedAvgRatePerQuintalPaise: number;
  closingStockValuationPaise: number;
  // Agency / Dalali Goods (Tracked separately per SRS Sec 6.3, never mixed into SGT-owned valuation)
  agencyHandledBags: number;
  agencyHandledWeightGrams: number;
  // Status indicators
  isLowStock: boolean;
  isNegativeStockException: boolean;
  valuationMethod: 'WEIGHTED_AVERAGE' | 'FIFO' | 'MANUAL';
}

// ============================================================================
// CHUNK 2: FARMER & PARTY MASTER + CENTRAL KHATA / DOUBLE-ENTRY POSTING ENGINE
// ============================================================================

export type PartyType =
  | 'FARMER'
  | 'BUYER'
  | 'WHOLESALER'
  | 'FACTORY'
  | 'TRADER'
  | 'SUPPLIER'
  | 'TRANSPORTER'
  | 'EMPLOYEE'
  | 'GOVT_DEPT'
  | 'INSURER'
  | 'CHIT_PROVIDER'
  | 'OTHER';

export interface PartyRecord {
  id: string;
  partyCode: string; // Immutable auto-generated ID (e.g. SGT-FM-000001 or SGT-PT-000001)
  partyType: PartyType;
  name: string;
  village: string;
  address: string;
  phonePrimary: string;
  phoneSecondary: string;
  smsConsent: boolean;
  gstin: string;
  pan: string;
  nomineeName: string;
  nomineeRelation: string;
  nomineePhone: string;
  bankName: string;
  bankBranch: string;
  bankAccountHolder: string;
  bankAccountNoMasked: string;
  bankAccountNoUnmasked?: string; // Present only when explicitly unmasked by authorized role
  bankIfsc: string;
  idProofType: string;
  idProofNoMasked: string;
  idProofNoUnmasked?: string; // Present only when explicitly unmasked by authorized role
  idProofVerified: boolean;
  hasSignatureOnFile: boolean;
  signatureDataUrl?: string | null; // Present only when explicitly unmasked by authorized role
  openingBalancePaise: number;
  openingBalanceType: 'DR' | 'CR';
  openingBalanceDate: string;
  openingBalanceNotes: string;
  status: 'ACTIVE' | 'INACTIVE';
  deactivationReason: string | null;
  deactivatedAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateWarningItem {
  matchType: 'PHONE_MATCH' | 'BANK_ACCOUNT_MATCH' | 'ID_PROOF_MATCH' | 'NAME_VILLAGE_MATCH';
  existingPartyId: string;
  existingPartyCode: string;
  existingName: string;
  existingVillage: string;
  matchedValueSummary: string;
  message: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export type AccountSubType =
  | 'CASH'
  | 'BANK'
  | 'FARMER_CONTROL'
  | 'BUYER_CONTROL'
  | 'SUPPLIER_CONTROL'
  | 'LOAN_PRINCIPAL'
  | 'INTEREST_RECEIVABLE'
  | 'STOCK_ASSET'
  | 'GST_CONTROL'
  | 'CAPITAL'
  | 'DRAWINGS'
  | 'OPENING_EQUITY_OFFSET'
  | 'SALES_INCOME'
  | 'COMMISSION_INCOME'
  | 'INTEREST_INCOME'
  | 'HAMALI_RECOVERY'
  | 'PURCHASE_EXPENSE'
  | 'OPERATING_EXPENSE';

export type LedgerBucket =
  | 'GENERAL'
  | 'OPENING_BALANCE'
  | 'LOAN_PRINCIPAL'
  | 'LOAN_INTEREST'
  | 'CROP_PROCEEDS'
  | 'DEDUCTIONS'
  | 'ADVANCE'
  | 'INVOICE_RECEIVABLE'
  | 'TAX';

export type CashFlowDirection =
  | 'CASH_IN'
  | 'CASH_OUT'
  | 'BANK_IN'
  | 'BANK_OUT'
  | 'TRANSFER'
  | 'NON_CASH';

export interface AccountRecord {
  id: string;
  code: string;
  nameEn: string;
  nameKn: string;
  accountType: AccountType;
  subType: AccountSubType;
  isSystem: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  totalDebitPaise?: number;
  totalCreditPaise?: number;
  netBalancePaise?: number;
  balanceDirection?: 'DR' | 'CR';
}

export interface JournalLineInput {
  accountCode: string;
  partyId?: string | null;
  bankAccountId?: string | null;
  ledgerBucket?: LedgerBucket;
  debitPaise: number;
  creditPaise: number;
  cashDirection?: CashFlowDirection;
  lineNote?: string;
}

export interface JournalLineRecord {
  id: string;
  journalEntryId: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountNameEn: string;
  accountNameKn: string;
  partyId: string | null;
  partyCode?: string | null;
  partyName?: string | null;
  bankAccountId: string | null;
  ledgerBucket: LedgerBucket;
  debitPaise: number;
  creditPaise: number;
  cashDirection: CashFlowDirection;
  lineNote: string;
}

export interface JournalEntryRecord {
  id: string;
  entryNo: string;
  transactionDate: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  narration: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  cashFlowSummary: CashFlowDirection | 'MIXED';
  status: 'POSTED' | 'REVERSED';
  reversalOfEntryId: string | null;
  reversedByEntryId: string | null;
  reversalReason: string | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLineRecord[];
}

export interface PartyLedgerLine {
  lineId: string;
  journalEntryId: string;
  entryNo: string;
  transactionDate: string;
  sourceType: string;
  sourceId: string;
  accountCode: string;
  accountNameEn: string;
  ledgerBucket: LedgerBucket;
  narration: string;
  debitPaise: number;
  creditPaise: number;
  cashDirection: CashFlowDirection;
  runningBalancePaise: number;
  runningBalanceType: 'DR' | 'CR';
}

export interface PartyLedgerStatement {
  party: PartyRecord;
  fromDate: string | null;
  toDate: string | null;
  openingBalancePaise: number;
  openingBalanceType: 'DR' | 'CR';
  periodTotalDebitPaise: number;
  periodTotalCreditPaise: number;
  closingBalancePaise: number;
  closingBalanceType: 'DR' | 'CR';
  // Distinct Farmer Bucket Breakdown (SRS Sec 10.1)
  bucketSummary: {
    loanPrincipalReceivablePaise: number;
    loanInterestReceivablePaise: number;
    cropProceedsCreditedPaise: number;
    deductionsDebitedPaise: number;
    tradeReceivableOrPayablePaise: number;
    tradeDirection: 'DR' | 'CR';
  };
  lines: PartyLedgerLine[];
}

// ============================================================================
// CHUNK 3: CASH BOOK, BANK ACCOUNTS, CHEQUES, RECONCILIATION & FARMER LOANS
// ============================================================================

export interface BankAccountRecord {
  id: string;
  bankName: string;
  branchName: string;
  accountLabel: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'OD_CC';
  accountNumberMasked: string;
  ifscCode: string;
  openingBalancePaise: number;
  openingBalanceType: 'DR' | 'CR';
  currentBookBalancePaise: number;
  currentBookBalanceType: 'DR' | 'CR';
  reconciledStatementBalancePaise: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export type ChequeDirection = 'ISSUED' | 'RECEIVED';
export type ChequeStatus = 'PENDING' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';

export interface ChequeRecord {
  id: string;
  chequeNo: string;
  chequeDate: string;
  direction: ChequeDirection;
  bankAccountId: string;
  bankAccountLabel?: string;
  partyId: string | null;
  partyName: string;
  amountPaise: number;
  purpose: string;
  status: ChequeStatus;
  clearedDate: string | null;
  bouncedReason: string | null;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface BankStatementLineRecord {
  id: string;
  bankAccountId: string;
  valueDate: string;
  description: string;
  referenceNo: string;
  debitPaise: number; // Withdrawal in bank statement
  creditPaise: number; // Deposit in bank statement
  status: 'UNMATCHED' | 'MATCHED';
  matchedJournalLineId: string | null;
  matchedEntryNo: string | null;
  reconciledBy: string | null;
  reconciledAt: string | null;
  createdAt: string;
}

export type LoanPaymentMode = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI';

export interface LoanRecord {
  id: string;
  loanNo: string;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  farmerVillage: string;
  disbursementDate: string;
  principalPaise: number;
  paymentMode: LoanPaymentMode;
  bankAccountId: string | null;
  bankReference: string;
  interestRateBps: number; // e.g. 1800 = 18.00%
  rateUnit: RateUnit;
  interestMethod: InterestMethod;
  dayCountConvention: DayCountConvention;
  repaymentOrder: RepaymentAllocationOrder;
  principalRepaidPaise: number;
  interestPaidPaise: number;
  principalOutstandingPaise: number;
  accruedInterestAsOfTodayPaise: number;
  totalOutstandingAsOfTodayPaise: number;
  status: 'ACTIVE' | 'CLOSED' | 'REVERSED';
  notes: string;
  journalEntryId: string;
  createdBy: string;
  createdAt: string;
}

export interface LoanTransactionRecord {
  id: string;
  loanId: string;
  txnNo: string;
  transactionDate: string;
  txnType: 'DISBURSEMENT' | 'REPAYMENT' | 'PATTI_RECOVERY' | 'REVERSAL';
  totalAmountPaise: number;
  principalComponentPaise: number;
  interestComponentPaise: number;
  paymentMode: LoanPaymentMode;
  bankAccountId: string | null;
  referenceNo: string;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

// ============================================================================
// CHUNK 5: FARMER PATTI SETTLEMENT ENGINE (AT-08) & BUYER-SIDE KHARIDI PATTI
// ============================================================================

export type PattiSettlementPaymentMode = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_PAYABLE';

export interface FarmerPattiLineInput {
  commodityId: string;
  bags: number;
  grossWeightGrams: number;
  tareWeightGrams?: number;
  moisturePct?: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
}

export interface FarmerPattiLineRecord {
  id: string;
  pattiId: string;
  lineNo: number;
  commodityId: string;
  commodityCode: string;
  commodityNameEn: string;
  commodityNameKn: string;
  bags: number;
  grossWeightGrams: number;
  tareWeightGrams: number;
  moisturePct: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  grossAmountPaise: number;
}

export interface FarmerPattiRecord {
  id: string;
  pattiNo: string;
  pattiDate: string;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  farmerVillage: string;
  farmerPhone: string;
  ownershipMode: StockOwnershipType; // 'FARMER_AGENCY' (Dalali) or 'SGT_OWNED' (Direct Purchase)
  vehicleNo: string;
  totalBags: number;
  totalNetWeightGrams: number;
  grossCropAmountPaise: number;
  commissionRateBps: number;
  commissionAmountPaise: number;
  hamaliAmountPaise: number;
  weighmentFeePaise: number;
  mandiFeePaise: number;
  otherDeductionsPaise: number;
  otherDeductionsLabel: string;
  totalOperationalDeductionsPaise: number;
  linkedLoanId: string | null;
  linkedLoanNo: string | null;
  loanDueBeforePattiPaise: number;
  loanPrincipalRecoveredPaise: number;
  loanInterestRecoveredPaise: number;
  totalLoanRecoveredPaise: number;
  carryForwardLoanBalancePaise: number; // AT-08: When deductions + loan exceed crop value, remaining loan balance is carried forward
  netPayablePaise: number;
  paymentMode: PattiSettlementPaymentMode;
  bankAccountId: string | null;
  amountPaidNowPaise: number;
  balancePayablePaise: number;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: FarmerPattiLineRecord[];
}

export type KharidiPaymentMode = 'CREDIT' | 'CASH' | 'BANK_TRANSFER';

export interface KharidiPattiLineInput {
  commodityId: string;
  bags: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  gstApplicable?: boolean;
  cgstRateBps?: number;
  sgstRateBps?: number;
  igstRateBps?: number;
}

export interface KharidiPattiLineRecord {
  id: string;
  kharidiPattiId: string;
  lineNo: number;
  commodityId: string;
  commodityCode: string;
  commodityNameEn: string;
  commodityNameKn: string;
  bags: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  baseAmountPaise: number;
  gstApplicable: boolean;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  gstAmountPaise: number;
  lineTotalPaise: number;
}

export interface KharidiPattiRecord {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  buyerId: string;
  buyerCode: string;
  buyerName: string;
  buyerGstin: string;
  ownershipMode: StockOwnershipType; // 'SGT_OWNED' or 'FARMER_AGENCY'
  linkedFarmerPattiId: string | null;
  linkedFarmerId: string | null;
  vehicleNo: string;
  totalBags: number;
  totalNetWeightGrams: number;
  totalBaseAmountPaise: number;
  buyerCommissionBps: number;
  buyerCommissionPaise: number;
  buyerHamaliPackingPaise: number;
  buyerMarketFeePaise: number;
  totalGstPaise: number;
  netReceivablePaise: number;
  paymentMode: KharidiPaymentMode;
  bankAccountId: string | null;
  amountReceivedNowPaise: number;
  balanceReceivablePaise: number;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: KharidiPattiLineRecord[];
}

// ============================================================================
// CHUNK 6: DALALI VIKRI PATTI, DALALI KHARIDI PATTI, CASH/CREDIT BILL & CREDIT NOTES
// ============================================================================

export interface DalaliVikriLineInput {
  commodityId: string;
  bags: number;
  andiges?: number;
  grossWeightGrams?: number;
  tareWeightGrams?: number;
  moisturePct?: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
}

export interface DalaliVikriLineRecord {
  id: string;
  pattiId: string;
  lineNo: number;
  commodityId: string;
  commodityCode: string;
  commodityNameEn: string;
  commodityNameKn: string;
  bags: number;
  andiges: number;
  grossWeightGrams: number;
  tareWeightGrams: number;
  moisturePct: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  grossAmountPaise: number;
}

export interface DalaliVikriPattiRecord {
  id: string;
  pattiNo: string;
  pattiDate: string;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  farmerVillage: string;
  farmerPhone: string;
  counterpartyBuyerId: string | null;
  counterpartyBuyerName: string;
  classSerial: string;
  vehicleNo: string;
  totalBags: number;
  totalAndiges: number;
  totalNetWeightGrams: number;
  grossSaleAmountPaise: number;
  commissionRateBps: number;
  commissionAmountPaise: number;
  hamaliAmountPaise: number;
  niituFeePaise: number;
  tukadFeePaise: number;
  rmcFeePaise: number;
  vehicleRentPaise: number;
  handLoanAdvancePaise: number;
  otherDeductionsPaise: number;
  totalDeductionsPaise: number;
  netPayablePaise: number;
  paymentMode: PattiSettlementPaymentMode;
  bankAccountId: string | null;
  amountPaidNowPaise: number;
  balancePayablePaise: number;
  amountInWords: string;
  status: 'FINALIZED' | 'REVERSED';
  reversalReason: string | null;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: DalaliVikriLineRecord[];
}

export interface DalaliKharidiLineInput {
  commodityId: string;
  bags: number;
  andiges?: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  gstApplicable?: boolean;
  cgstRateBps?: number;
  sgstRateBps?: number;
  igstRateBps?: number;
}

export interface DalaliKharidiLineRecord {
  id: string;
  pattiId: string;
  lineNo: number;
  commodityId: string;
  commodityCode: string;
  commodityNameEn: string;
  commodityNameKn: string;
  bags: number;
  andiges: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  baseAmountPaise: number;
  gstApplicable: boolean;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  gstAmountPaise: number;
  lineTotalPaise: number;
}

export interface DalaliKharidiPattiRecord {
  id: string;
  pattiNo: string;
  pattiDate: string;
  buyerId: string;
  buyerCode: string;
  buyerName: string;
  buyerGstin: string;
  linkedDalaliVikriId: string | null;
  linkedFarmerId: string | null;
  classSerial: string;
  vehicleNo: string;
  totalBags: number;
  totalAndiges: number;
  totalNetWeightGrams: number;
  totalBaseAmountPaise: number;
  commissionRateBps: number;
  commissionAmountPaise: number;
  hamaliAmountPaise: number;
  niituFeePaise: number;
  tukadFeePaise: number;
  rmcFeePaise: number;
  totalGstPaise: number;
  netReceivablePaise: number;
  paymentMode: KharidiPaymentMode;
  bankAccountId: string | null;
  amountReceivedNowPaise: number;
  balanceReceivablePaise: number;
  amountInWords: string;
  status: 'FINALIZED' | 'REVERSED';
  reversalReason: string | null;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: DalaliKharidiLineRecord[];
}

export interface BillTransportDetails {
  lorryOwnerName: string;
  driverName: string;
  driverLicenseNo: string;
  driverPhone: string;
  vehicleNo: string;
  originPlace: string;
  destinationPlace: string;
  deliveryNoteNo: string;
  freightAdvancePaise: number;
}

export interface CashCreditBillLineInput {
  commodityId: string;
  bags: number;
  andiges?: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  hsnCode?: string;
  gstApplicable?: boolean;
  cgstRateBps?: number;
  sgstRateBps?: number;
  igstRateBps?: number;
}

export interface CashCreditBillLineRecord {
  id: string;
  billId: string;
  lineNo: number;
  commodityId: string;
  commodityCode: string;
  commodityNameEn: string;
  commodityNameKn: string;
  hsnCode: string;
  bags: number;
  andiges: number;
  netWeightGrams: number;
  ratePerQuintalPaise: number;
  baseAmountPaise: number;
  gstApplicable: boolean;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  gstAmountPaise: number;
  lineTotalPaise: number;
}

export interface CashCreditBillRecord {
  id: string;
  billNo: string;
  billDate: string;
  billKind: 'CASH_BILL' | 'CREDIT_BILL';
  buyerId: string;
  buyerCode: string;
  buyerName: string;
  buyerGstin: string;
  buyerAddress: string;
  ownershipMode: StockOwnershipType;
  classSerial: string;
  transport: BillTransportDetails;
  totalBags: number;
  totalAndiges: number;
  totalNetWeightGrams: number;
  totalBaseAmountPaise: number;
  commissionPaise: number;
  hamaliPackingPaise: number;
  rmcFeePaise: number;
  tukadFeePaise: number;
  cstOrOtherTaxLabel: string;
  cstOrOtherTaxPaise: number;
  totalCgstPaise: number;
  totalSgstPaise: number;
  totalIgstPaise: number;
  totalGstPaise: number;
  netBillAmountPaise: number;
  amountInWords: string;
  paymentMode: KharidiPaymentMode;
  bankAccountId: string | null;
  amountReceivedNowPaise: number;
  balanceReceivablePaise: number;
  status: 'FINALIZED' | 'REVERSED';
  reversalReason: string | null;
  reversalDate: string | null;
  reversalJournalEntryId: string | null;
  creditNoteNo: string | null;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: CashCreditBillLineRecord[];
}

// ============================================================================
// CHUNK 7: BUYER COLLECTION BOOK, EXPENSES/COMMITMENTS & TAX REGISTERS
// ============================================================================

export type CollectionTargetBillType =
  | 'CASH_CREDIT_BILL'
  | 'KHARIDI_PATTI'
  | 'DALALI_KHARIDI_PATTI'
  | 'ON_ACCOUNT';

export interface BuyerCollectionRecord {
  id: string;
  receiptNo: string;
  receiptDate: string;
  buyerId: string;
  buyerCode: string;
  buyerName: string;
  targetBillType: CollectionTargetBillType;
  targetBillId: string | null;
  targetBillNo: string | null;
  amountPaise: number;
  discountAllowedPaise: number;
  paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
  bankAccountId: string | null;
  referenceNo: string;
  billBalanceBeforePaise: number;
  billBalanceAfterPaise: number;
  journalEntryId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export type ExpenseCommitmentCategory =
  | 'OPERATING_EXPENSE'
  | 'HAMALI_LABOR'
  | 'VEHICLE_FREIGHT'
  | 'GOVT_FORM_FEE'
  | 'CHIT_FUND'
  | 'INSURANCE_POLICY'
  | 'OWNER_CAPITAL'
  | 'OWNER_DRAWING';

export type ExpenseAccountingClassification =
  | 'OPERATING_EXPENSE'
  | 'ASSET_INVESTMENT'
  | 'OWNER_DRAWING'
  | 'OWNER_CAPITAL';

export interface ExpenseCommitmentRecord {
  id: string;
  voucherNo: string;
  voucherDate: string;
  category: ExpenseCommitmentCategory;
  accountingClassification: ExpenseAccountingClassification;
  payeeName: string;
  partyId: string | null;
  amountPaise: number;
  gstAmountPaise: number;
  totalAmountPaise: number;
  paymentMode: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
  bankAccountId: string | null;
  referenceNo: string;
  description: string;
  isRestrictedPersonal: boolean;
  status: 'FINALIZED' | 'REVERSED';
  reversalReason: string | null;
  reversalJournalEntryId: string | null;
  journalEntryId: string;
  createdBy: string;
  createdAt: string;
}

export interface GstSalesPurchaseRegisterRow {
  id: string;
  registerType: 'SALES' | 'PURCHASE' | 'DALALI_AGENCY';
  documentType: string;
  documentNo: string;
  documentDate: string;
  partyName: string;
  partyGstin: string;
  totalBags: number;
  totalNetWeightGrams: number;
  taxableOrBaseAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalGstPaise: number;
  mandiOrRmcFeePaise: number;
  commissionPaise: number;
  netDocumentAmountPaise: number;
  status: string;
}

// ============================================================================
// CHUNK 8: DAY-END CLOSE, VALIDATION ENGINE & SMS OUTBOX SIMULATOR
// ============================================================================

export interface DayCloseRecord {
  businessDate: string;
  status: 'OPEN' | 'CLOSED' | 'REOPENED';
  cashOpeningPaise: number;
  cashInPaise: number;
  cashOutPaise: number;
  cashClosingPaise: number;
  physicalCashCountedPaise: number;
  cashVariancePaise: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
  journalEntryCount: number;
  closedBy: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  notes: string;
}

export interface ValidationIssueRecord {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ruleCode: string;
  title: string;
  description: string;
  suggestedAction: string;
}

export interface SmsOutboxRecord {
  id: string;
  idempotencyKey: string;
  eventType: 'FARMER_PATTI' | 'LOAN_DISBURSEMENT' | 'LOAN_REPAYMENT' | 'BUYER_COLLECTION' | 'CUSTOM';
  recipientPhone: string;
  recipientName: string;
  language: 'en' | 'kn';
  messageBody: string;
  sourceDocNo: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  retryCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

// ============================================================================
// CHUNK 9: FINANCIAL STATEMENTS, 12 MANDATORY REPORTS & BACKUP/RESTORE
// ============================================================================

export interface TrialBalanceLine {
  accountId: string;
  accountCode: string;
  accountNameEn: string;
  accountNameKn: string;
  accountType: string;
  debitPaise: number;
  creditPaise: number;
  netBalancePaise: number;
  balanceDirection: 'DR' | 'CR' | 'ZERO';
}

export interface ComprehensiveFinancialReport {
  generatedAt: string;
  asOfDate: string;
  trialBalance: {
    lines: TrialBalanceLine[];
    totalDebitPaise: number;
    totalCreditPaise: number;
    isBalanced: boolean;
  };
  profitAndLoss: {
    commoditySalesPaise: number;
    dalaliCommissionPaise: number;
    loanInterestIncomePaise: number;
    hamaliAndFeeRecoveryPaise: number;
    closingInventoryValuePaise: number;
    totalRevenueAndCreditsPaise: number;
    commodityPurchasesPaise: number;
    operatingExpensesPaise: number;
    totalExpensesAndDebitsPaise: number;
    netProfitOrLossPaise: number;
  };
  balanceSheet: {
    cashInHandPaise: number;
    bankBalancesPaise: number;
    closingInventoryAssetPaise: number;
    loanPrincipalReceivablePaise: number;
    loanInterestReceivablePaise: number;
    buyerTradeReceivablesPaise: number;
    chitAndOtherInvestmentsPaise: number;
    totalAssetsPaise: number;
    farmerTradePayablesPaise: number;
    supplierPayablesPaise: number;
    gstAndTaxPayablesPaise: number;
    ownerCapitalNetPaise: number;
    retainedNetProfitPaise: number;
    totalLiabilitiesAndEquityPaise: number;
  };
  gstAndTaxRegister: GstSalesPurchaseRegisterRow[];
}

export interface SystemBackupSnapshot {
  formatVersion: string;
  createdAt: string;
  createdBy: string;
  checksumSha256: string;
  tableCounts: Record<string, number>;
  trialBalanceVerified: boolean;
  totalAccountingDebitPaise: number;
  totalAccountingCreditPaise: number;
  payload: Record<string, unknown[]>;
}



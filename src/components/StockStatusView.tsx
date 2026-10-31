import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  History,
  Package,
  Plus,
  Printer,
  Scale,
  Search,
  Settings2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CommodityRecord,
  CommodityStockStatus,
  PartyRecord,
  PermissionKey,
  StockMovementDirection,
  StockMovementRecord,
  StockOwnershipType,
  UserProfile,
  WeightUnit,
} from '../shared/types';
import {
  convertGramsToUnit,
  convertWeightToGrams,
  formatDateDDMMYYYY,
  formatINR,
  rupeesToPaise,
} from '../shared/math';
import { LanguageCode, t } from '../shared/i18n';

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface StockStatusViewProps {
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
  parties?: PartyRecord[];
  activeUser: UserProfile;
  lang: LanguageCode;
  onRecordMovement: (payload: {
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
  }) => Promise<void>;
  onSeedStandardCommodities?: () => Promise<void>;
  onCreateCommodity: (payload: {
    code: string;
    nameEn: string;
    nameKn: string;
    gradeVariety: string;
    hsnCode: string;
    referenceBagWeightKg: number | null;
    lowStockThresholdQuintals: number;
    standardRatePerQuintalPaise: number;
  }) => Promise<void>;
  onUpdateCommodity: (
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
  ) => Promise<void>;
}

type StockFilterMode = 'ALL' | 'LOW_STOCK' | 'AGENCY_ACTIVE';
type DisplayWeightUnit = 'QUINTAL' | 'KG' | 'TONNE';
type ChartMetricMode = 'WEIGHT' | 'BAGS' | 'VALUATION';

export const StockStatusView: React.FC<StockStatusViewProps> = ({
  stockStatuses,
  stockMovements,
  parties = [],
  activeUser,
  lang,
  onRecordMovement,
  onSeedStandardCommodities,
  onCreateCommodity,
  onUpdateCommodity,
}) => {
  const todayStr = getTodayIST();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<StockFilterMode>('ALL');
  const [displayUnit, setDisplayUnit] = useState<DisplayWeightUnit>('QUINTAL');
  const [chartMetric, setChartMetric] = useState<ChartMetricMode>('WEIGHT');
  const [showAgencyOnChart, setShowAgencyOnChart] = useState<boolean>(true);
  const [selectedCommodityId, setSelectedCommodityId] = useState<string | null>(null);
  const [expandedMovementsByCommodity, setExpandedMovementsByCommodity] = useState<
    Record<string, boolean>
  >({});

  const toggleCommodityRecentMovements = (commodityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMovementsByCommodity((prev) => ({
      ...prev,
      [commodityId]: !prev[commodityId],
    }));
  };
  const [activeDrawer, setActiveDrawer] = useState<
    'NONE' | 'MOVEMENT' | 'NEW_COMMODITY' | 'EDIT_COMMODITY'
  >('NONE');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Record Stock Movement form state (clean, zero-hardcode initialization)
  const [movCommodityId, setMovCommodityId] = useState<string>(
    stockStatuses[0]?.commodity.id || ''
  );
  const [movDirection, setMovDirection] = useState<StockMovementDirection>('GOODS_IN');
  const [movOwnership, setMovOwnership] = useState<StockOwnershipType>('SGT_OWNED');
  const [movDate, setMovDate] = useState<string>(todayStr);
  const [movBags, setMovBags] = useState<string>('');
  const [movWeightQuintals, setMovWeightQuintals] = useState<string>('');
  const [movRateRupees, setMovRateRupees] = useState<string>('');
  const [movPartyId, setMovPartyId] = useState<string>('');
  const [movPartyName, setMovPartyName] = useState<string>('');
  const [movSettlementMode, setMovSettlementMode] = useState<'CREDIT' | 'CASH' | 'BANK'>('CREDIT');
  const [movReason, setMovReason] = useState<string>('');

  // New Commodity form state (clean initialization)
  const [cmdCode, setCmdCode] = useState<string>('');
  const [cmdNameEn, setCmdNameEn] = useState<string>('');
  const [cmdNameKn, setCmdNameKn] = useState<string>('');
  const [cmdGrade, setCmdGrade] = useState<string>('');
  const [cmdHsn, setCmdHsn] = useState<string>('');
  const [cmdRefBagKg, setCmdRefBagKg] = useState<string>('');
  const [cmdLowStockQ, setCmdLowStockQ] = useState<string>('');
  const [cmdRateRupees, setCmdRateRupees] = useState<string>('');

  // Edit Commodity form state (SRS Sec 6.1)
  const [editingCommodity, setEditingCommodity] = useState<CommodityRecord | null>(null);
  const [editNameEn, setEditNameEn] = useState<string>('');
  const [editNameKn, setEditNameKn] = useState<string>('');
  const [editGrade, setEditGrade] = useState<string>('');
  const [editHsn, setEditHsn] = useState<string>('');
  const [editRefBagKg, setEditRefBagKg] = useState<string>('');
  const [editLowStockQ, setEditLowStockQ] = useState<string>('');
  const [editRateRupees, setEditRateRupees] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editReason, setEditReason] = useState<string>('');

  useEffect(() => {
    if (
      stockStatuses.length > 0 &&
      (!movCommodityId || !stockStatuses.some((s) => s.commodity.id === movCommodityId))
    ) {
      setMovCommodityId(stockStatuses[0].commodity.id);
    }
  }, [stockStatuses, movCommodityId]);

  const canCreateBills = activeUser.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);
  const canApproveAdj = activeUser.permissions.includes(PermissionKey.APPROVE_CORRECTIONS);
  const canManageSettings =
    activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS) ||
    activeUser.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);

  const openEditCommodityDrawer = (cmd: CommodityRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCommodity(cmd);
    setEditNameEn(cmd.nameEn);
    setEditNameKn(cmd.nameKn);
    setEditGrade(cmd.gradeVariety);
    setEditHsn(cmd.hsnCode);
    setEditRefBagKg(cmd.referenceBagWeightKg !== null ? String(cmd.referenceBagWeightKg) : '');
    setEditLowStockQ(String(cmd.lowStockThresholdGrams / 100_000));
    setEditRateRupees(String(cmd.standardRatePerQuintalPaise / 100));
    setEditStatus(cmd.status);
    setEditReason('');
    setActiveDrawer('EDIT_COMMODITY');
  };

  // Aggregate summary metrics across all SGT-Owned commodities
  const totalOwnedValuationPaise = stockStatuses.reduce(
    (sum, item) => sum + item.closingStockValuationPaise,
    0
  );
  const totalOwnedWeightGrams = stockStatuses.reduce(
    (sum, item) => sum + item.closingOwnedWeightGrams,
    0
  );
  const totalOwnedBags = stockStatuses.reduce((sum, item) => sum + item.closingOwnedBags, 0);
  const totalAgencyWeightGrams = stockStatuses.reduce(
    (sum, item) => sum + item.agencyHandledWeightGrams,
    0
  );
  const totalAgencyBags = stockStatuses.reduce((sum, item) => sum + item.agencyHandledBags, 0);
  const getLowStockThresholdQuintals = (item: CommodityStockStatus): number =>
    item.commodity.lowStockThresholdQuintals ??
    item.commodity.lowStockThresholdGrams / 100_000;

  const isCommodityBelowThreshold = (item: CommodityStockStatus): boolean => {
    const thresholdQ = getLowStockThresholdQuintals(item);
    return (
      item.isLowStock ||
      (thresholdQ > 0 && item.closingOwnedWeightQuintals <= thresholdQ)
    );
  };

  const lowStockCount = stockStatuses.filter((item) => isCommodityBelowThreshold(item)).length;

  const unitSuffix = displayUnit === 'QUINTAL' ? 'Q' : displayUnit === 'KG' ? 'kg' : 't';

  const convertWeightForDisplay = (grams: number): number => {
    if (displayUnit === 'QUINTAL') return convertGramsToUnit(grams, WeightUnit.QUINTAL);
    if (displayUnit === 'KG') return convertGramsToUnit(grams, WeightUnit.KG);
    return convertGramsToUnit(grams, WeightUnit.TONNE);
  };

  const formatWeightDisplay = (grams: number): string => {
    const val = convertWeightForDisplay(grams);
    if (displayUnit === 'QUINTAL') {
      return `${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Q`;
    }
    if (displayUnit === 'KG') {
      return `${val.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;
    }
    return `${val.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t`;
  };

  // Filtered commodity cards & chart data
  const filteredCommodities = stockStatuses.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.commodity.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.commodity.nameKn.includes(searchQuery) ||
      item.commodity.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.commodity.gradeVariety.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.commodity.hsnCode.includes(searchQuery);

    if (!matchesSearch) return false;
    if (filterMode === 'LOW_STOCK')
      return isCommodityBelowThreshold(item) || item.isNegativeStockException;
    if (filterMode === 'AGENCY_ACTIVE') return item.agencyHandledWeightGrams > 0;
    return true;
  });

  // Prepare Recharts data points from filteredCommodities
  const chartData = filteredCommodities.map((item) => {
    const shortNameEn = item.commodity.nameEn.split(' (')[0];
    const displayName = lang === 'kn' ? item.commodity.nameKn.split(' (')[0] : shortNameEn;

    const ownedWeightVal = convertWeightForDisplay(item.closingOwnedWeightGrams);
    const agencyWeightVal = convertWeightForDisplay(item.agencyHandledWeightGrams);
    const thresholdWeightVal = convertWeightForDisplay(item.commodity.lowStockThresholdGrams);

    const ownedMetricValue =
      chartMetric === 'WEIGHT'
        ? ownedWeightVal
        : chartMetric === 'BAGS'
        ? item.closingOwnedBags
        : Math.round(item.closingStockValuationPaise / 100);

    const agencyMetricValue =
      chartMetric === 'WEIGHT'
        ? agencyWeightVal
        : chartMetric === 'BAGS'
        ? item.agencyHandledBags
        : 0;

    return {
      commodityId: item.commodity.id,
      code: item.commodity.code,
      name: displayName,
      fullNameEn: item.commodity.nameEn,
      fullNameKn: item.commodity.nameKn,
      ownedValue: ownedMetricValue,
      agencyValue: agencyMetricValue,
      closingOwnedWeightDisplay: formatWeightDisplay(item.closingOwnedWeightGrams),
      closingOwnedBags: item.closingOwnedBags,
      agencyWeightDisplay: formatWeightDisplay(item.agencyHandledWeightGrams),
      agencyBags: item.agencyHandledBags,
      thresholdDisplay:
        item.commodity.lowStockThresholdGrams > 0
          ? `${thresholdWeightVal.toLocaleString('en-IN')} ${unitSuffix}`
          : 'Not Set',
      valuationDisplay: formatINR(item.closingStockValuationPaise, false),
      rateDisplay: formatINR(item.weightedAvgRatePerQuintalPaise, false),
      isLowStock: item.isLowStock,
      isNegative: item.isNegativeStockException,
    };
  });

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const weightGrams = convertWeightToGrams(
        Math.abs(Number(movWeightQuintals)),
        WeightUnit.QUINTAL
      );
      const signedGrams =
        movDirection === 'ADJUSTMENT' && Number(movWeightQuintals) < 0
          ? -weightGrams
          : weightGrams;

      await onRecordMovement({
        commodityId: movCommodityId,
        transactionDate: movDate,
        direction: movDirection,
        ownershipType: movOwnership,
        bags: Number(movBags),
        weightGrams: signedGrams,
        ratePerQuintalPaise: rupeesToPaise(movRateRupees || '0'),
        partyId: movPartyId || undefined,
        partyName: movPartyName.trim(),
        settlementMode: movSettlementMode,
        reason: movReason.trim(),
      });

      setActiveDrawer('NONE');
      setMovBags('');
      setMovWeightQuintals('');
      setMovRateRupees('');
      setMovPartyId('');
      setMovPartyName('');
      setMovReason('');
      setFeedback({
        type: 'success',
        message:
          'Stock movement finalized and synchronized atomically with closing stock valuation and Central Khata Book.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record stock movement',
      });
    }
  };

  const handleSubmitNewCommodity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const trimmedNameEn = cmdNameEn.trim();
    if (!trimmedNameEn) {
      setFeedback({
        type: 'error',
        message: 'Please enter the Commodity Name (English).',
      });
      return;
    }
    const resolvedCode =
      cmdCode.trim().toUpperCase() ||
      trimmedNameEn
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) ||
      `CROP${Date.now().toString().slice(-4)}`;

    try {
      await onCreateCommodity({
        code: resolvedCode,
        nameEn: trimmedNameEn,
        nameKn: cmdNameKn.trim() || trimmedNameEn,
        gradeVariety: cmdGrade.trim(),
        hsnCode: cmdHsn.trim(),
        referenceBagWeightKg: cmdRefBagKg ? Number(cmdRefBagKg) : null,
        lowStockThresholdQuintals: Number(cmdLowStockQ || 0),
        standardRatePerQuintalPaise: rupeesToPaise(cmdRateRupees || '0'),
      });
      setActiveDrawer('NONE');
      setCmdCode('');
      setCmdNameEn('');
      setCmdNameKn('');
      setCmdGrade('');
      setCmdHsn('');
      setCmdRefBagKg('');
      setCmdLowStockQ('');
      setCmdRateRupees('');
      setFeedback({
        type: 'success',
        message: `Added ${trimmedNameEn} (${resolvedCode}) to Commodity Master.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add commodity',
      });
    }
  };

  const handleSubmitEditCommodity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCommodity) return;
    setFeedback(null);
    try {
      await onUpdateCommodity(editingCommodity.id, {
        nameEn: editNameEn,
        nameKn: editNameKn,
        gradeVariety: editGrade,
        hsnCode: editHsn,
        referenceBagWeightKg: editRefBagKg ? Number(editRefBagKg) : null,
        lowStockThresholdQuintals: Number(editLowStockQ || 0),
        standardRatePerQuintalPaise: rupeesToPaise(editRateRupees || '0'),
        status: editStatus,
        reason: editReason.trim(),
      });
      setActiveDrawer('NONE');
      setEditingCommodity(null);
      setFeedback({
        type: 'success',
        message: `Updated commodity configuration for ${editNameEn} and logged to audit trail.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update commodity',
      });
    }
  };

  const selectedCommodityStatus = selectedCommodityId
    ? stockStatuses.find((s) => s.commodity.id === selectedCommodityId) ?? null
    : null;

  const selectedCommodityMovements = selectedCommodityId
    ? stockMovements.filter((m) => m.commodityId === selectedCommodityId)
    : stockMovements.slice(0, 15);

  const [showPrintSummaryTable, setShowPrintSummaryTable] = useState(false);

  // CommodityId-aware target list: if a specific commodityId is selected, aggregate specifically for it;
  // otherwise aggregate across the active filteredCommodities list.
  const exportTargetCommodities: CommodityStockStatus[] = selectedCommodityStatus
    ? [selectedCommodityStatus]
    : filteredCommodities;

  const exportTargetMovements: StockMovementRecord[] = selectedCommodityId
    ? stockMovements.filter((m) => m.commodityId === selectedCommodityId)
    : stockMovements.filter((m) =>
        exportTargetCommodities.some((item) => item.commodity.id === m.commodityId)
      );

  const exportAggregatedTotals = exportTargetCommodities.reduce(
    (acc, item) => {
      acc.openingBags += item.openingBags;
      acc.openingWeightGrams += item.openingWeightGrams;
      acc.goodsInBags += item.goodsInBags;
      acc.goodsInWeightGrams += item.goodsInWeightGrams;
      acc.goodsOutBags += item.goodsOutBags;
      acc.goodsOutWeightGrams += item.goodsOutWeightGrams;
      acc.adjustmentsBags += item.adjustmentBags;
      acc.adjustmentsWeightGrams += item.adjustmentWeightGrams;
      acc.closingOwnedBags += item.closingOwnedBags;
      acc.closingOwnedWeightGrams += item.closingOwnedWeightGrams;
      acc.closingValuationPaise += item.closingStockValuationPaise;
      acc.agencyHandledBags += item.agencyHandledBags;
      acc.agencyHandledWeightGrams += item.agencyHandledWeightGrams;
      if (isCommodityBelowThreshold(item)) {
        acc.lowStockCount += 1;
      }
      return acc;
    },
    {
      openingBags: 0,
      openingWeightGrams: 0,
      goodsInBags: 0,
      goodsInWeightGrams: 0,
      goodsOutBags: 0,
      goodsOutWeightGrams: 0,
      adjustmentsBags: 0,
      adjustmentsWeightGrams: 0,
      closingOwnedBags: 0,
      closingOwnedWeightGrams: 0,
      closingValuationPaise: 0,
      agencyHandledBags: 0,
      agencyHandledWeightGrams: 0,
      lowStockCount: 0,
    }
  );

  const escapeCsvCell = (value: string | number | null | undefined): string => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportStockCsv = () => {
    if (exportTargetCommodities.length === 0) {
      setFeedback({
        type: 'error',
        message: 'No commodities match the active filter to export.',
      });
      return;
    }

    const scopeLabel = selectedCommodityStatus
      ? `Single Commodity Filter: ${selectedCommodityStatus.commodity.nameEn} (${selectedCommodityStatus.commodity.code})`
      : `Filtered View (${filterMode}${searchQuery.trim() ? ` · Search: "${searchQuery.trim()}"` : ''}) — ${exportTargetCommodities.length} Commodities`;

    const metaRows: string[][] = [
      ['SHREE GURU TRADERS (SGT) — AGRICULTURAL COMMODITY STOCK & VALUATION REGISTER'],
      ['Report Date', formatDateDDMMYYYY(todayStr), 'ISO Date', todayStr],
      ['Filter Scope', scopeLabel, 'Commodity ID Filter', selectedCommodityId ?? 'ALL'],
      [
        'Aggregated Closing Owned Stock (Q)',
        (exportAggregatedTotals.closingOwnedWeightGrams / 100_000).toFixed(2),
        'Aggregated Closing Valuation (INR)',
        (exportAggregatedTotals.closingValuationPaise / 100).toFixed(2),
      ],
      [],
    ];

    const tableHeaders = [
      'Commodity ID',
      'Code',
      'Commodity (English)',
      'Commodity (Kannada)',
      'Grade / Variety',
      'HSN Code',
      'Opening Bags',
      'Opening Weight (Q)',
      'Goods In Bags',
      'Goods In Weight (Q)',
      'Goods Out Bags',
      'Goods Out Weight (Q)',
      'Adjustments Bags',
      'Adjustments Weight (Q)',
      'Closing Owned Bags',
      'Closing Owned Weight (Q)',
      'Closing Owned Weight (kg)',
      'Low Stock Threshold (Q)',
      'Stock Status',
      'Weighted Avg Rate (Rs/Q)',
      'Closing Stock Valuation (Rs)',
      'Dalali Agency Bags',
      'Dalali Agency Weight (Q)',
    ];

    const commodityRows = exportTargetCommodities.map((item) => {
      const thresholdQ = getLowStockThresholdQuintals(item);
      const belowThreshold = isCommodityBelowThreshold(item);
      const statusText = item.isNegativeStockException
        ? 'NEGATIVE EXCEPTION'
        : belowThreshold
          ? 'LOW STOCK WARNING'
          : 'HEALTHY';

      return [
        item.commodity.id,
        item.commodity.code,
        item.commodity.nameEn,
        item.commodity.nameKn,
        item.commodity.gradeVariety,
        item.commodity.hsnCode,
        item.openingBags,
        (item.openingWeightGrams / 100_000).toFixed(2),
        item.goodsInBags,
        (item.goodsInWeightGrams / 100_000).toFixed(2),
        item.goodsOutBags,
        (item.goodsOutWeightGrams / 100_000).toFixed(2),
        item.adjustmentBags,
        (item.adjustmentWeightGrams / 100_000).toFixed(2),
        item.closingOwnedBags,
        (item.closingOwnedWeightGrams / 100_000).toFixed(2),
        (item.closingOwnedWeightGrams / 1_000).toFixed(1),
        thresholdQ.toFixed(2),
        statusText,
        (item.weightedAvgRatePerQuintalPaise / 100).toFixed(2),
        (item.closingStockValuationPaise / 100).toFixed(2),
        item.agencyHandledBags,
        (item.agencyHandledWeightGrams / 100_000).toFixed(2),
      ];
    });

    const weightedOverallRatePaise =
      exportAggregatedTotals.closingOwnedWeightGrams > 0
        ? Math.round(
            (exportAggregatedTotals.closingValuationPaise * 100_000) /
              exportAggregatedTotals.closingOwnedWeightGrams
          )
        : 0;

    const grandTotalRow = [
      'GRAND TOTAL',
      selectedCommodityStatus ? selectedCommodityStatus.commodity.code : `ALL (${exportTargetCommodities.length})`,
      selectedCommodityStatus
        ? `${selectedCommodityStatus.commodity.nameEn} Total`
        : `Aggregated Total (${exportTargetCommodities.length} Commodities)`,
      '',
      '',
      '',
      exportAggregatedTotals.openingBags,
      (exportAggregatedTotals.openingWeightGrams / 100_000).toFixed(2),
      exportAggregatedTotals.goodsInBags,
      (exportAggregatedTotals.goodsInWeightGrams / 100_000).toFixed(2),
      exportAggregatedTotals.goodsOutBags,
      (exportAggregatedTotals.goodsOutWeightGrams / 100_000).toFixed(2),
      exportAggregatedTotals.adjustmentsBags,
      (exportAggregatedTotals.adjustmentsWeightGrams / 100_000).toFixed(2),
      exportAggregatedTotals.closingOwnedBags,
      (exportAggregatedTotals.closingOwnedWeightGrams / 100_000).toFixed(2),
      (exportAggregatedTotals.closingOwnedWeightGrams / 1_000).toFixed(1),
      '',
      `${exportAggregatedTotals.lowStockCount} Low Stock`,
      (weightedOverallRatePaise / 100).toFixed(2),
      (exportAggregatedTotals.closingValuationPaise / 100).toFixed(2),
      exportAggregatedTotals.agencyHandledBags,
      (exportAggregatedTotals.agencyHandledWeightGrams / 100_000).toFixed(2),
    ];

    const movementSectionRows: (string | number)[][] = [];
    if (exportTargetMovements.length > 0) {
      movementSectionRows.push(
        [],
        [
          selectedCommodityStatus
            ? `STOCK MOVEMENTS FOR ${selectedCommodityStatus.commodity.nameEn.toUpperCase()} (${selectedCommodityStatus.commodity.code})`
            : 'STOCK MOVEMENTS FOR EXPORTED COMMODITIES',
        ],
        [
          'Movement No',
          'Date',
          'Commodity ID',
          'Commodity Name',
          'Direction',
          'Ownership Type',
          'Party Name',
          'Reference Bill No',
          'Bags Delta',
          'Weight Delta (Q)',
          'Rate per Quintal (Rs)',
          'Total Value (Rs)',
          'Reason / Remarks',
        ]
      );

      for (const mov of exportTargetMovements) {
        const cmd = stockStatuses.find((s) => s.commodity.id === mov.commodityId)?.commodity;
        movementSectionRows.push([
          mov.movementNo,
          formatDateDDMMYYYY(mov.transactionDate),
          mov.commodityId,
          cmd ? cmd.nameEn : mov.commodityId,
          mov.direction,
          mov.ownershipType,
          mov.partyName,
          mov.referenceBillNo,
          mov.bagsDelta,
          (mov.weightGramsDelta / 100_000).toFixed(2),
          (mov.ratePerQuintalPaise / 100).toFixed(2),
          (mov.totalValuePaise / 100).toFixed(2),
          mov.reason,
        ]);
      }
    }

    const allRows = [
      ...metaRows,
      tableHeaders,
      ...commodityRows,
      grandTotalRow,
      ...movementSectionRows,
    ];

    const csvString =
      '\uFEFF' + allRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileSuffix = selectedCommodityStatus
      ? selectedCommodityStatus.commodity.code
      : filterMode.toLowerCase();
    link.href = url;
    link.setAttribute('download', `SGT-Stock-Valuation-${fileSuffix}-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setFeedback({
      type: 'success',
      message: selectedCommodityStatus
        ? `Exported CSV valuation & stock summary for ${selectedCommodityStatus.commodity.nameEn} (${(selectedCommodityStatus.closingOwnedWeightGrams / 100_000).toFixed(2)} Q · ${formatINR(selectedCommodityStatus.closingStockValuationPaise, false)}).`
        : `Exported CSV valuation & stock summary for ${exportTargetCommodities.length} commodities (${(exportAggregatedTotals.closingOwnedWeightGrams / 100_000).toFixed(2)} Q · ${formatINR(exportAggregatedTotals.closingValuationPaise, false)}).`,
    });
  };

  const handlePrintStockSummary = () => {
    setShowPrintSummaryTable(true);
    setTimeout(() => {
      window.print();
    }, 80);
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Minimalist Glassmorphic Header & Primary Actions */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>SRS Sections 6.1, 6.3 & 6.4</span>
            <span aria-hidden="true">·</span>
            <span>Separate Bags & Weight Accounting</span>
            <span aria-hidden="true">·</span>
            <span>Owned vs Dalali Agency Isolation</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, 'stockStatusTitle')}</h1>
          <p className="text-sm text-slate-600 max-w-3xl">{t(lang, 'stockStatusSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 print:hidden">
          {stockStatuses.length === 0 && onSeedStandardCommodities && canManageSettings && (
            <button
              type="button"
              onClick={async () => {
                await onSeedStandardCommodities();
                setFeedback({
                  type: 'success',
                  message:
                    'Loaded 11 SRS Section 6.1 standard agricultural commodities with ₹0/0Q balances.',
                });
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-300/80 text-xs font-semibold text-emerald-800 hover:bg-emerald-600/15 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Package className="w-3.5 h-3.5 text-emerald-700" />
              Load 11 SRS Standard Crops (0 Stock)
            </button>
          )}

          <button
            type="button"
            onClick={handleExportStockCsv}
            disabled={exportTargetCommodities.length === 0}
            title={
              selectedCommodityStatus
                ? `Export CSV for ${selectedCommodityStatus.commodity.nameEn} (${selectedCommodityStatus.commodity.code})`
                : `Export CSV for ${exportTargetCommodities.length} filtered commodities`
            }
            className="px-3.5 py-2.5 rounded-xl bg-white/85 border border-slate-200/80 text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-40 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {selectedCommodityStatus
                ? `Export CSV (${selectedCommodityStatus.commodity.code})`
                : `Export CSV (${exportTargetCommodities.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrintStockSummary}
            disabled={exportTargetCommodities.length === 0}
            title={
              selectedCommodityStatus
                ? `Print valuation & stock report for ${selectedCommodityStatus.commodity.nameEn}`
                : 'Print valuation & stock summary table'
            }
            className="px-3.5 py-2.5 rounded-xl bg-white/85 border border-slate-200/80 text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-40 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-slate-700" />
            <span>
              {selectedCommodityStatus
                ? `Print (${selectedCommodityStatus.commodity.code})`
                : 'Print Summary'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveDrawer(activeDrawer === 'NEW_COMMODITY' ? 'NONE' : 'NEW_COMMODITY')
            }
            disabled={!canManageSettings}
            className="px-4 py-2.5 rounded-xl bg-white/85 border border-slate-200/80 text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-40 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            {t(lang, 'addCommodity')}
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'MOVEMENT' ? 'NONE' : 'MOVEMENT')}
            disabled={stockStatuses.length === 0 || (!canCreateBills && !canApproveAdj)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all shadow-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Scale className="w-3.5 h-3.5" />
            {t(lang, 'recordStockMovement')}
          </button>
        </div>
      </div>

      {/* Section 2: 4-Column Full-Width KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-3xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">
            {t(lang, 'totalOwnedValuation')}
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatINR(totalOwnedValuationPaise, false)}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Weighted Average Cost</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{stockStatuses.length} Crops</span>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">{t(lang, 'totalOwnedWeight')}</div>
          <div className="text-2xl font-bold font-mono text-blue-600">
            {formatWeightDisplay(totalOwnedWeightGrams)}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {(totalOwnedWeightGrams / 100_000).toLocaleString('en-IN', {
              maximumFractionDigits: 2,
            })}{' '}
            Q · {(totalOwnedWeightGrams / 1_000).toLocaleString('en-IN')} kg
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">{t(lang, 'totalOwnedBags')}</div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {totalOwnedBags.toLocaleString('en-IN')} Bags
          </div>
          <div className="text-xs text-slate-500">
            Tracked independently of weight (SRS 6.1)
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">{t(lang, 'agencyHandledStock')}</div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            {formatWeightDisplay(totalAgencyWeightGrams)}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {totalAgencyBags.toLocaleString('en-IN')} Bags · Excluded from SGT stock value
          </div>
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

      {/* Progressive Disclosure Drawer: Record Stock Movement */}
      {activeDrawer === 'MOVEMENT' && stockStatuses.length > 0 && (
        <form
          onSubmit={handleSubmitMovement}
          className="glass-panel rounded-3xl p-6 space-y-5 border border-blue-200/80"
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Record Opening Stock / Goods In / Goods Out / Stock Adjustment
              </h2>
              <p className="text-xs text-slate-500">
                SRS Section 6.3: Updates bags and weight separately. Agency/Dalali goods do not
                alter SGT-owned stock.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer('NONE')}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Commodity</label>
              <select
                value={movCommodityId}
                onChange={(e) => {
                  const cid = e.target.value;
                  setMovCommodityId(cid);
                  const found = stockStatuses.find((s) => s.commodity.id === cid);
                  if (found && found.commodity.standardRatePerQuintalPaise > 0) {
                    setMovRateRupees(
                      String(found.commodity.standardRatePerQuintalPaise / 100)
                    );
                  }
                }}
                className="apple-input w-full"
              >
                {stockStatuses.map((s) => (
                  <option key={s.commodity.id} value={s.commodity.id}>
                    {s.commodity.nameEn} ({s.commodity.nameKn}) — {s.closingOwnedWeightQuintals} Q
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Movement Type
              </label>
              <select
                value={movDirection}
                onChange={(e) => setMovDirection(e.target.value as StockMovementDirection)}
                className="apple-input w-full"
              >
                <option value="OPENING">Opening Stock Entry</option>
                <option value="GOODS_IN">Goods In (Purchase / Receipt)</option>
                <option value="GOODS_OUT">Goods Out (Sale / Dispatch)</option>
                <option value="ADJUSTMENT">Authorized Stock Adjustment (±)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Stock Ownership (SRS 6.3)
              </label>
              <select
                value={movOwnership}
                onChange={(e) => setMovOwnership(e.target.value as StockOwnershipType)}
                className="apple-input w-full"
              >
                <option value="SGT_OWNED">SGT-Owned Stock (Affects Valuation)</option>
                <option value="FARMER_AGENCY">Dalali / Farmer Agency Goods</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Transaction Date
              </label>
              <input
                type="date"
                value={movDate}
                onChange={(e) => setMovDate(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Number of Bags {movDirection === 'ADJUSTMENT' ? '(Signed ±)' : ''}
              </label>
              <input
                type="number"
                required
                placeholder="Enter bags count"
                value={movBags}
                onChange={(e) => setMovBags(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Actual Weight in Quintals (Q)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="Enter weight in Q"
                value={movWeightQuintals}
                onChange={(e) => setMovWeightQuintals(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Rate per Quintal (₹)
              </label>
              <input
                type="number"
                step="1"
                required
                placeholder="Enter rate per Q (₹)"
                value={movRateRupees}
                onChange={(e) => setMovRateRupees(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Registered Party (Optional Link)
              </label>
              <select
                value={movPartyId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setMovPartyId(pid);
                  const foundParty = parties.find((p) => p.id === pid);
                  if (foundParty) {
                    setMovPartyName(foundParty.name);
                  }
                }}
                className="apple-input w-full"
              >
                <option value="">Walk-in / Custom Party Name</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partyCode} — {p.name} ({p.partyType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Farmer / Supplier / Buyer Name
              </label>
              <input
                type="text"
                required
                placeholder="Enter party name"
                value={movPartyName}
                onChange={(e) => setMovPartyName(e.target.value)}
                className="apple-input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Khata Settlement Mode (AT-05 / AT-06)
              </label>
              <select
                value={movSettlementMode}
                onChange={(e) =>
                  setMovSettlementMode(e.target.value as 'CREDIT' | 'CASH' | 'BANK')
                }
                className="apple-input w-full"
              >
                <option value="CREDIT">Credit (Party Payable / Receivable)</option>
                <option value="CASH">Immediate Cash Settlement (1001)</option>
                <option value="BANK">Immediate Bank Settlement (1002)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <input
              type="text"
              required
              placeholder="Audit / Movement Reason (required)"
              value={movReason}
              onChange={(e) => setMovReason(e.target.value)}
              className="apple-input flex-1"
            />
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              Finalize Stock Movement
            </button>
          </div>
        </form>
      )}

      {/* Progressive Disclosure Drawer: Add New Commodity */}
      {activeDrawer === 'NEW_COMMODITY' && (
        <form
          onSubmit={handleSubmitNewCommodity}
          className="glass-panel rounded-3xl p-6 space-y-5 border border-blue-200/80"
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Add Agricultural Commodity to Master (SRS Section 6.1)
              </h2>
              <p className="text-xs text-slate-500">
                Configure code, bilingual name, grade/variety, HSN, and low-stock alert threshold.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer('NONE')}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Commodity Name (English) *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Maize, Sunflower, Cotton"
                value={cmdNameEn}
                onChange={(e) => {
                  const val = e.target.value;
                  setCmdNameEn(val);
                  const prevAuto = cmdNameEn
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 10);
                  if (!cmdCode || cmdCode === prevAuto) {
                    setCmdCode(
                      val
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 10)
                    );
                  }
                }}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Commodity Code (Auto / Custom)
              </label>
              <input
                type="text"
                placeholder="Auto-filled from name"
                value={cmdCode}
                onChange={(e) => setCmdCode(e.target.value.toUpperCase())}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Commodity Name (ಕನ್ನಡ)
              </label>
              <input
                type="text"
                placeholder="Enter Kannada name"
                value={cmdNameKn}
                onChange={(e) => setCmdNameKn(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Grade / Variety
              </label>
              <input
                type="text"
                placeholder="Optional grade / variety"
                value={cmdGrade}
                onChange={(e) => setCmdGrade(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">HSN Code</label>
              <input
                type="text"
                placeholder="Optional HSN"
                value={cmdHsn}
                onChange={(e) => setCmdHsn(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Standard Rate / Quintal (₹)
              </label>
              <input
                type="number"
                placeholder="0"
                value={cmdRateRupees}
                onChange={(e) => setCmdRateRupees(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Low-Stock Alert Threshold (Q)
              </label>
              <input
                type="number"
                placeholder="0"
                value={cmdLowStockQ}
                onChange={(e) => setCmdLowStockQ(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
              >
                Save Commodity
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Progressive Disclosure Drawer: Edit / Configure Existing Commodity */}
      {activeDrawer === 'EDIT_COMMODITY' && editingCommodity && (
        <form
          onSubmit={handleSubmitEditCommodity}
          className="glass-panel rounded-3xl p-6 space-y-5 border border-blue-200/80"
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Configure Commodity Master: {editingCommodity.nameEn} ({editingCommodity.code})
              </h2>
              <p className="text-xs text-slate-500">
                SRS Section 6.1: Update standard rate, HSN, grade/variety, low-stock threshold, or
                active status.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDrawer('NONE');
                setEditingCommodity(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Commodity Name (English)
              </label>
              <input
                type="text"
                required
                value={editNameEn}
                onChange={(e) => setEditNameEn(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Commodity Name (ಕನ್ನಡ)
              </label>
              <input
                type="text"
                value={editNameKn}
                onChange={(e) => setEditNameKn(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Grade / Variety
              </label>
              <input
                type="text"
                placeholder="Optional grade / variety"
                value={editGrade}
                onChange={(e) => setEditGrade(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">HSN Code</label>
              <input
                type="text"
                placeholder="Optional HSN code"
                value={editHsn}
                onChange={(e) => setEditHsn(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Standard Rate / Quintal (₹)
              </label>
              <input
                type="number"
                min="0"
                value={editRateRupees}
                onChange={(e) => setEditRateRupees(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Low-Stock Alert Threshold (Q)
              </label>
              <input
                type="number"
                min="0"
                value={editLowStockQ}
                onChange={(e) => setEditLowStockQ(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Optional Reference Bag Weight (kg)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Leave blank if variable"
                value={editRefBagKg}
                onChange={(e) => setEditRefBagKg(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editStatus === 'ACTIVE'}
                  onChange={(e) => setEditStatus(e.target.checked ? 'ACTIVE' : 'INACTIVE')}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Active for Trading & Billing</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <input
              type="text"
              required
              placeholder="Audit reason for commodity update (required)"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="apple-input flex-1"
            />
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              Update Commodity Master
            </button>
          </div>
        </form>
      )}

      {/* Section 3: Filter & Unit Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Commodities ({stockStatuses.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('LOW_STOCK')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'LOW_STOCK'
                  ? 'bg-white text-amber-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low Stock Alerts ({lowStockCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('AGENCY_ACTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                filterMode === 'AGENCY_ACTIVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dalali / Agency Lots
            </button>
          </div>

          {/* Interactive Weight Unit Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
            {(['QUINTAL', 'KG', 'TONNE'] as DisplayWeightUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setDisplayUnit(u)}
                className={`px-2.5 py-1.5 text-xs font-semibold font-mono rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  displayUnit === u
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {u === 'QUINTAL' ? 'Quintals (Q)' : u === 'KG' ? 'Kilograms (kg)' : 'Tonnes (t)'}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search crop name, code, HSN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="apple-input w-full pl-9 py-2 text-xs"
          />
        </div>
      </div>

      {/* Section 4: Minimalist Glassmorphic Recharts Bar Chart */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {lang === 'kn'
                  ? 'ಉತ್ಪನ್ನಗಳ ಪ್ರಸ್ತುತ ದಾಸ್ತಾನು ಪ್ರಮಾಣ ನಕ್ಷೆ'
                  : 'Commodity Stock Quantity & Valuation Comparison'}
              </h2>
              <p className="text-xs text-slate-500">
                Click any commodity bar to filter its detailed stock movement ledger below ·{' '}
                <span className="text-blue-600 font-medium">Blue: Optimal Owned Stock</span> ·{' '}
                <span className="text-amber-600 font-medium">Amber: Low-Stock Alert</span>
                {showAgencyOnChart && chartMetric !== 'VALUATION' ? (
                  <>
                    {' '}
                    · <span className="text-emerald-600 font-medium">Teal: Dalali Agency Lot</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {chartMetric !== 'VALUATION' && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAgencyOnChart}
                  onChange={(e) => setShowAgencyOnChart(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Compare Dalali / Agency Lots</span>
              </label>
            )}

            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setChartMetric('WEIGHT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  chartMetric === 'WEIGHT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Weight ({unitSuffix})
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('BAGS')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  chartMetric === 'BAGS'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bags Count
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('VALUATION')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  chartMetric === 'VALUATION'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Valuation (₹)
              </button>
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-14 text-center space-y-4">
            <BarChart3 className="w-8 h-8 text-blue-600 mx-auto opacity-80" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-800">
                No Agricultural Commodities Registered Yet
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All sample commodities and stock movements have been purged for production. Use the
                buttons below to add a custom commodity or load the 11 SRS standard crops.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer('NEW_COMMODITY');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-all shadow-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t(lang, 'addCommodity')}
              </button>
              {onSeedStandardCommodities && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await onSeedStandardCommodities();
                      setFeedback({
                        type: 'success',
                        message:
                          'Loaded 11 SRS Section 6.1 standard agricultural commodities with ₹0/0Q balances.',
                      });
                    } catch (err) {
                      setFeedback({
                        type: 'error',
                        message:
                          err instanceof Error ? err.message : 'Failed to load standard crops',
                      });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-300/80 text-xs font-semibold text-emerald-800 hover:bg-emerald-600/15 transition-all inline-flex items-center gap-1.5"
                >
                  <Package className="w-3.5 h-3.5 text-emerald-700" />
                  Load 11 SRS Standard Crops (0 Stock)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
                barGap={6}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(148, 163, 184, 0.25)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: '#64748B',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  tickFormatter={(val: number) => {
                    if (chartMetric === 'VALUATION') {
                      return `₹${(val / 1000).toLocaleString('en-IN', {
                        maximumFractionDigits: 0,
                      })}k`;
                    }
                    return `${val.toLocaleString('en-IN')}${
                      chartMetric === 'WEIGHT' ? ` ${unitSuffix}` : ''
                    }`;
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0, 113, 227, 0.04)', radius: 12 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0].payload;
                    return (
                      <div className="glass-panel rounded-2xl p-4 text-xs space-y-2 min-w-60 border border-white/90">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 pb-2">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {row.fullNameEn}
                            </div>
                            <div className="text-slate-500">
                              {row.fullNameKn} · <span className="font-mono">{row.code}</span>
                            </div>
                          </div>
                          <span
                            className={`font-semibold ${
                              row.isLowStock ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {row.isLowStock ? 'Low Stock' : 'Optimal'}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-sans text-slate-500">SGT Owned Weight:</span>
                            <span className="font-bold text-slate-900">
                              {row.closingOwnedWeightDisplay}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-sans text-slate-500">SGT Owned Bags:</span>
                            <span className="font-bold text-slate-900">
                              {row.closingOwnedBags.toLocaleString('en-IN')} Bags
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-sans text-slate-500">Owned Valuation:</span>
                            <span className="font-bold text-blue-600">{row.valuationDisplay}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-sans text-slate-500">Dalali Agency Lot:</span>
                            <span className="font-semibold text-emerald-700">
                              {row.agencyWeightDisplay} ({row.agencyBags}b)
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                            <span className="font-sans">Low-Stock Alert Threshold:</span>
                            <span>{row.thresholdDisplay}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="ownedValue"
                  name="SGT Owned Stock"
                  radius={[10, 10, 4, 4]}
                  maxBarSize={42}
                  onClick={(barData: any) => {
                    const cid = barData?.commodityId || barData?.payload?.commodityId;
                    if (cid) {
                      setSelectedCommodityId((prev) => (prev === cid ? null : cid));
                    }
                  }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry) => {
                    const isSelected = selectedCommodityId === entry.commodityId;
                    const baseColor = entry.isNegative
                      ? '#E11D48'
                      : entry.isLowStock
                      ? '#D97706'
                      : '#0071E3';
                    return (
                      <Cell
                        key={entry.commodityId}
                        fill={baseColor}
                        fillOpacity={
                          selectedCommodityId === null || isSelected ? 0.9 : 0.35
                        }
                      />
                    );
                  })}
                </Bar>
                {showAgencyOnChart && chartMetric !== 'VALUATION' && (
                  <Bar
                    dataKey="agencyValue"
                    name="Dalali / Agency Goods"
                    fill="#10B981"
                    fillOpacity={0.65}
                    radius={[8, 8, 4, 4]}
                    maxBarSize={26}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Section 5: Minimalist Glassmorphic Commodity Cards Grid */}
      {filteredCommodities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCommodities.map((item) => {
            const isSelected = selectedCommodityId === item.commodity.id;
            const avgBagKg =
              item.closingOwnedBags > 0
                ? (item.closingOwnedWeightGrams / 1_000 / item.closingOwnedBags).toFixed(1)
                : '—';

            const lowStockThresholdQuintals = getLowStockThresholdQuintals(item);
            const belowThreshold = isCommodityBelowThreshold(item);
            const shortfallQuintals = Math.max(
              0,
              lowStockThresholdQuintals - item.closingOwnedWeightQuintals
            );
            const thresholdFillPct =
              lowStockThresholdQuintals > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round(
                        (item.closingOwnedWeightQuintals / lowStockThresholdQuintals) * 100
                      )
                    )
                  )
                : 100;

            const commodityMovements = stockMovements.filter(
              (mov) => mov.commodityId === item.commodity.id
            );
            const recentCommodityMovements = commodityMovements.slice(0, 5);
            const isRecentMovementsOpen = Boolean(
              expandedMovementsByCommodity[item.commodity.id]
            );

            return (
              <div
                key={item.commodity.id}
                onClick={() =>
                  setSelectedCommodityId(isSelected ? null : item.commodity.id)
                }
                className={`glass-panel rounded-3xl p-6 cursor-pointer transition-all duration-150 flex flex-col justify-between space-y-5 ${
                  isSelected
                    ? 'ring-2 ring-blue-600/40 bg-white/95'
                    : item.isNegativeStockException
                    ? 'border border-rose-300/90 bg-rose-50/40 hover:bg-rose-50/60'
                    : belowThreshold
                    ? 'border border-amber-300/90 bg-amber-50/40 hover:bg-amber-50/60'
                    : 'hover:bg-white/88'
                }`}
              >
                {/* Top Section: Unboxed Metadata Kicker & Title (Zero Pill Discipline) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span>{item.commodity.code}</span>
                      {item.commodity.gradeVariety && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{item.commodity.gradeVariety}</span>
                        </>
                      )}
                      {item.commodity.hsnCode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>HSN {item.commodity.hsnCode}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {canManageSettings && (
                        <button
                          type="button"
                          onClick={(e) => openEditCommodityDrawer(item.commodity, e)}
                          className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-lg"
                          title="Configure Commodity Master"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {item.commodity.status === 'INACTIVE' ? (
                        <span className="text-slate-400 font-medium">Inactive</span>
                      ) : item.isNegativeStockException ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5" /> Negative Exception
                        </span>
                      ) : belowThreshold ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" /> Low Stock Warning
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Optimal
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-0.5">
                    <h2 className="text-lg font-bold text-slate-900">
                      {lang === 'kn' ? item.commodity.nameKn : item.commodity.nameEn}
                    </h2>
                    <span className="text-xs text-slate-500">
                      {lang === 'kn' ? item.commodity.nameEn : item.commodity.nameKn}
                    </span>
                  </div>
                </div>

                {/* Middle Section: Primary Quantities (Weight & Bags Separate) & Valuation */}
                <div className="pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500">Closing Owned Stock</div>
                    <div
                      className={`text-xl font-bold font-mono mt-0.5 ${
                        item.isNegativeStockException
                          ? 'text-rose-700'
                          : belowThreshold
                          ? 'text-amber-800'
                          : 'text-slate-900'
                      }`}
                    >
                      {formatWeightDisplay(item.closingOwnedWeightGrams)}
                    </div>
                    <div className="text-xs text-slate-600 font-mono mt-0.5">
                      {item.closingOwnedBags.toLocaleString('en-IN')} Bags{' '}
                      <span className="text-slate-400">({avgBagKg} kg/bag avg)</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Owned Stock Valuation</div>
                    <div className="text-xl font-bold font-mono text-blue-600 mt-0.5">
                      {formatINR(item.closingStockValuationPaise, false)}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      @ {formatINR(item.weightedAvgRatePerQuintalPaise, false)} / Q
                    </div>
                  </div>
                </div>

                {/* Visual Warning Indicator when Stock <= lowStockThresholdQuintals */}
                {lowStockThresholdQuintals > 0 && (
                  <div
                    className={`rounded-2xl p-3.5 space-y-2 border ${
                      belowThreshold
                        ? 'bg-amber-50/90 border-amber-300/80 text-amber-950'
                        : 'bg-slate-50/80 border-slate-200/70 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="inline-flex items-center gap-1.5 font-semibold">
                        {belowThreshold ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span>
                          {belowThreshold
                            ? lang === 'kn'
                              ? 'ಕಡಿಮೆ ದಾಸ್ತಾನು ಎಚ್ಚರಿಕೆ (Low Stock Alert)'
                              : 'Below Low-Stock Threshold'
                            : lang === 'kn'
                            ? 'ಕನಿಷ್ಠ ದಾಸ್ತಾನು ಮಿತಿ ಸುರಕ್ಷಿತವಾಗಿದೆ'
                            : 'Above Low-Stock Threshold'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold">
                        {item.closingOwnedWeightQuintals.toFixed(2)} Q /{' '}
                        {lowStockThresholdQuintals.toFixed(2)} Q
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          belowThreshold ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${thresholdFillPct}%` }}
                      />
                    </div>

                    {belowThreshold && (
                      <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                        <span className="text-amber-800 font-mono">
                          {shortfallQuintals > 0
                            ? `Shortfall: ${shortfallQuintals.toFixed(2)} Q below threshold`
                            : `At minimum threshold (${lowStockThresholdQuintals.toFixed(2)} Q)`}
                        </span>
                        {(canCreateBills || canApproveAdj) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovCommodityId(item.commodity.id);
                              setMovDirection('GOODS_IN');
                              setMovOwnership('SGT_OWNED');
                              setActiveDrawer('MOVEMENT');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="font-semibold text-amber-900 underline hover:text-blue-700 whitespace-nowrap"
                          >
                            + Replenish Stock
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Section: Stock Equation & Dalali Agency Separation */}
                <div className="pt-3 border-t border-slate-200/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                    <span>
                      Open: {(item.openingWeightGrams / 100_000).toFixed(1)}Q ({item.openingBags}b)
                    </span>
                    <span className="text-emerald-700">
                      +In: {(item.goodsInWeightGrams / 100_000).toFixed(1)}Q
                    </span>
                    <span className="text-rose-700">
                      −Out: {(item.goodsOutWeightGrams / 100_000).toFixed(1)}Q
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>
                      Dalali / Agency Handled:{' '}
                      <strong className="font-mono text-slate-700">
                        {(item.agencyHandledWeightGrams / 100_000).toFixed(2)} Q (
                        {item.agencyHandledBags} bags)
                      </strong>
                    </span>
                    <span className="text-blue-600 font-medium">
                      {isSelected ? 'Viewing Ledger' : 'Inspect →'}
                    </span>
                  </div>

                  {/* Recent Movements Toggle & Compressed History Panel */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => toggleCommodityRecentMovements(item.commodity.id, e)}
                        aria-expanded={isRecentMovementsOpen}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-white/75 hover:bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-700 hover:text-slate-900 transition-all flex items-center justify-between gap-2"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>
                            {lang === 'kn' ? 'ಇತ್ತೀಚಿನ ಚಲನೆಗಳು' : 'Recent Movements'}
                          </span>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="font-mono text-slate-500 font-normal">
                            {commodityMovements.length}{' '}
                            {commodityMovements.length === 1 ? 'entry' : 'entries'}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                          <span>{isRecentMovementsOpen ? 'Hide' : 'Show'}</span>
                          {isRecentMovementsOpen ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </button>
                    </div>

                    {isRecentMovementsOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 p-3 space-y-2 cursor-default"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 border-b border-slate-200/70">
                          <span className="font-semibold text-slate-700">
                            {recentCommodityMovements.length > 0
                              ? `Last ${recentCommodityMovements.length} of ${commodityMovements.length} Stock Adjustments (In/Out)`
                              : 'Stock Adjustment History'}
                          </span>
                          {(canCreateBills || canApproveAdj) && (
                            <button
                              type="button"
                              onClick={() => {
                                setMovCommodityId(item.commodity.id);
                                setActiveDrawer('MOVEMENT');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="text-blue-600 hover:text-blue-700 font-semibold"
                            >
                              + Adjust
                            </button>
                          )}
                        </div>

                        {recentCommodityMovements.length === 0 ? (
                          <div className="py-2 text-center text-[11px] text-slate-500">
                            No stock movements or adjustments recorded for this commodity yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-200/60">
                            {recentCommodityMovements.map((mov) => {
                              const isOut = mov.weightGramsDelta < 0 || mov.bagsDelta < 0;
                              const shortDirection =
                                mov.direction === 'OPENING'
                                  ? 'OPEN'
                                  : mov.direction === 'GOODS_IN'
                                  ? 'IN'
                                  : mov.direction === 'GOODS_OUT'
                                  ? 'OUT'
                                  : 'ADJ';

                              return (
                                <div
                                  key={mov.id}
                                  className="py-1.5 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1 text-slate-800 font-medium truncate">
                                      {isOut ? (
                                        <ArrowDownRight className="w-3 h-3 text-rose-600 shrink-0" />
                                      ) : (
                                        <ArrowUpRight className="w-3 h-3 text-emerald-600 shrink-0" />
                                      )}
                                      <span
                                        className={`font-mono font-semibold ${
                                          isOut ? 'text-rose-700' : 'text-emerald-700'
                                        }`}
                                      >
                                        {shortDirection}
                                      </span>
                                      <span aria-hidden="true" className="text-slate-400">
                                        ·
                                      </span>
                                      <span className="font-mono text-slate-500">
                                        {formatDateDDMMYYYY(mov.transactionDate)}
                                      </span>
                                      {mov.ownershipType === 'FARMER_AGENCY' && (
                                        <>
                                          <span aria-hidden="true" className="text-slate-400">
                                            ·
                                          </span>
                                          <span className="font-mono text-[10px] text-emerald-700">
                                            Dalali
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate pl-4">
                                      {mov.partyName}
                                      {mov.reason ? ` · ${mov.reason}` : ''}
                                    </div>
                                  </div>

                                  <div className="text-right font-mono shrink-0">
                                    <div
                                      className={`font-semibold ${
                                        isOut ? 'text-rose-700' : 'text-emerald-700'
                                      }`}
                                    >
                                      {mov.weightGramsDelta > 0 ? '+' : ''}
                                      {(mov.weightGramsDelta / 100_000).toFixed(2)} Q{' '}
                                      <span className="text-[10px] font-normal text-slate-500">
                                        ({mov.bagsDelta > 0 ? `+${mov.bagsDelta}` : mov.bagsDelta}b)
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {formatINR(mov.totalValuePaise, false)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {commodityMovements.length > 5 && (
                          <div className="pt-1 border-t border-slate-200/70 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCommodityId(item.commodity.id);
                              }}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                            >
                              View all {commodityMovements.length} movements in register →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Print-Ready & Toggleable Aggregated Stock Valuation Summary Table */}
      <div
        className={`glass-panel rounded-3xl overflow-hidden ${
          showPrintSummaryTable ? 'block' : 'hidden print:block'
        }`}
      >
        <div className="px-6 py-4 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Shree Guru Traders (SGT)</span>
              <span aria-hidden="true">·</span>
              <span>Date: {formatDateDDMMYYYY(todayStr)}</span>
              <span aria-hidden="true">·</span>
              <span>
                Scope:{' '}
                {selectedCommodityStatus
                  ? `${selectedCommodityStatus.commodity.nameEn} (${selectedCommodityStatus.commodity.code})`
                  : `${exportTargetCommodities.length} Commodities (${filterMode})`}
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Aggregated Commodity Quantities & Valuation Statement
            </h2>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={handleExportStockCsv}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/10 border border-emerald-300/80 text-xs font-semibold text-emerald-800 hover:bg-emerald-600/15 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Now
            </button>
            <button
              type="button"
              onClick={() => setShowPrintSummaryTable(false)}
              className="px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Hide Preview
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-600 bg-slate-50/80">
                <th className="py-2.5 px-4 font-semibold">Commodity & Code</th>
                <th className="py-2.5 px-3 font-semibold text-right">Opening (Q / Bags)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Goods In (Q)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Goods Out (Q)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Closing Owned (Q / Bags)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Threshold (Q)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg Rate (₹/Q)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Closing Valuation</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dalali Agency (Q)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {exportTargetCommodities.map((item) => {
                const thresholdQ = getLowStockThresholdQuintals(item);
                const belowThreshold = isCommodityBelowThreshold(item);
                return (
                  <tr key={item.commodity.id} className="hover:bg-white/60">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {item.commodity.nameEn}{' '}
                        <span className="font-mono text-[11px] text-slate-500">
                          ({item.commodity.code})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.commodity.nameKn} · Grade: {item.commodity.gradeVariety}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {(item.openingWeightGrams / 100_000).toFixed(2)} Q ({item.openingBags}b)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                      +{(item.goodsInWeightGrams / 100_000).toFixed(2)} Q
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                      -{(item.goodsOutWeightGrams / 100_000).toFixed(2)} Q
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                      {(item.closingOwnedWeightGrams / 100_000).toFixed(2)} Q ({item.closingOwnedBags}b)
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono ${
                        belowThreshold ? 'text-amber-700 font-semibold' : 'text-slate-600'
                      }`}
                    >
                      {thresholdQ.toFixed(2)} Q{belowThreshold ? ' (LOW)' : ''}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {formatINR(item.weightedAvgRatePerQuintalPaise, false)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(item.closingStockValuationPaise, false)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                      {(item.agencyHandledWeightGrams / 100_000).toFixed(2)} Q (
                      {item.agencyHandledBags}b)
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/80 font-semibold text-slate-900">
                <td className="py-3 px-4">
                  GRAND TOTAL ({exportTargetCommodities.length}{' '}
                  {exportTargetCommodities.length === 1 ? 'Commodity' : 'Commodities'})
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {(exportAggregatedTotals.openingWeightGrams / 100_000).toFixed(2)} Q (
                  {exportAggregatedTotals.openingBags}b)
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-800">
                  +{(exportAggregatedTotals.goodsInWeightGrams / 100_000).toFixed(2)} Q
                </td>
                <td className="py-3 px-3 text-right font-mono text-rose-800">
                  -{(exportAggregatedTotals.goodsOutWeightGrams / 100_000).toFixed(2)} Q
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold">
                  {(exportAggregatedTotals.closingOwnedWeightGrams / 100_000).toFixed(2)} Q (
                  {exportAggregatedTotals.closingOwnedBags}b)
                </td>
                <td className="py-3 px-3 text-right font-mono text-amber-800">
                  {exportAggregatedTotals.lowStockCount} Low Stock
                </td>
                <td className="py-3 px-3 text-right font-mono">—</td>
                <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                  {formatINR(exportAggregatedTotals.closingValuationPaise, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono">
                  {(exportAggregatedTotals.agencyHandledWeightGrams / 100_000).toFixed(2)} Q (
                  {exportAggregatedTotals.agencyHandledBags}b)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Section 6: Date-Wise Goods In / Goods Out & Adjustment Ledger */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {selectedCommodityStatus
                  ? `Stock Movement Register: ${selectedCommodityStatus.commodity.nameEn} (${selectedCommodityStatus.commodity.code})`
                  : 'Recent Goods In / Goods Out & Stock Adjustments Register'}
              </h2>
              <p className="text-xs text-slate-500">
                SRS Section 6.3 Formula: Closing Stock = Opening Stock + Goods In − Goods Out ±
                Approved Adjustments
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <button
              type="button"
              onClick={() => setShowPrintSummaryTable((prev) => !prev)}
              disabled={exportTargetCommodities.length === 0}
              className="px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 transition-all"
            >
              {showPrintSummaryTable ? 'Hide Valuation Table' : 'View Valuation Table'}
            </button>
            <button
              type="button"
              onClick={handleExportStockCsv}
              disabled={exportTargetCommodities.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/10 border border-emerald-300/80 text-xs font-semibold text-emerald-800 hover:bg-emerald-600/15 disabled:opacity-40 transition-all inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {selectedCommodityStatus
                ? `Export ${selectedCommodityStatus.commodity.code} CSV`
                : 'Export Filtered CSV'}
            </button>
            {selectedCommodityStatus && (
              <button
                type="button"
                onClick={() => setSelectedCommodityId(null)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 ml-1"
              >
                Show All Commodities
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {selectedCommodityMovements.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="text-sm font-semibold text-slate-700">
                No Stock Movements Recorded Yet
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Add your agricultural commodities first, then click “
                {t(lang, 'recordStockMovement')}” to record Opening Stock, Goods In, or Dalali
                Agency lots.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                  <th className="py-3 px-4 font-medium">Movement ID & Date</th>
                  <th className="py-3 px-3 font-medium">Commodity</th>
                  <th className="py-3 px-3 font-medium">Type & Ownership</th>
                  <th className="py-3 px-3 font-medium">Party & Bill Ref</th>
                  <th className="py-3 px-3 font-medium text-right">Bags</th>
                  <th className="py-3 px-3 font-medium text-right">Weight (Q)</th>
                  <th className="py-3 px-4 font-medium text-right">Rate / Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {selectedCommodityMovements.map((mov) => {
                  const cmd = stockStatuses.find((s) => s.commodity.id === mov.commodityId)
                    ?.commodity;
                  const isOut = mov.weightGramsDelta < 0;
                  return (
                    <tr key={mov.id} className="hover:bg-white/60 transition-colors">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-semibold text-slate-900">{mov.movementNo}</div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(mov.transactionDate)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">
                          {cmd ? (lang === 'kn' ? cmd.nameKn : cmd.nameEn) : mov.commodityId}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">{cmd?.code}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          {isOut ? (
                            <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <span>{mov.direction.replace('_', ' ')}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {mov.ownershipType === 'SGT_OWNED'
                            ? 'SGT Owned Stock'
                            : 'Dalali / Agency Goods'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-900 font-medium">{mov.partyName}</div>
                        <div className="text-[11px] text-slate-500">
                          Ref: <span className="font-mono">{mov.referenceBillNo}</span> ·{' '}
                          {mov.reason}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold ${
                          isOut ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {mov.bagsDelta > 0 ? `+${mov.bagsDelta}` : mov.bagsDelta}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold ${
                          isOut ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {mov.weightGramsDelta > 0 ? '+' : ''}
                        {(mov.weightGramsDelta / 100_000).toFixed(2)} Q
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <div className="font-semibold text-slate-900">
                          {formatINR(mov.totalValuePaise, false)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          @ {formatINR(mov.ratePerQuintalPaise, false)}/Q
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

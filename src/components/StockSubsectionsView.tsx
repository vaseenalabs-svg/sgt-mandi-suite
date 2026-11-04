import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Package,
  Plus,
  Power,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  CashCreditBillRecord,
  CommodityRecord,
  CommodityStockStatus,
  DalaliKharidiPattiRecord,
  DalaliVikriPattiRecord,
  FarmerPattiRecord,
  KharidiPattiRecord,
  PermissionKey,
  StockMovementRecord,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

export type StockMenuTab =
  | 'COMMODITY_MASTER'
  | 'STOCK_STATUS'
  | 'COMMODITY_SUMMARY'
  | 'SALES_BOOK';

export type PeriodWindowFilter = 'TODAY' | '7D' | '30D' | 'CUSTOM';

interface StockSubsectionsCommonProps {
  lang: LanguageCode;
  businessDate: string;
  activeUser: UserProfile;
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
  farmerPattis?: FarmerPattiRecord[];
  kharidiPattis?: KharidiPattiRecord[];
  dalaliVikriPattis?: DalaliVikriPattiRecord[];
  dalaliKharidiPattis?: DalaliKharidiPattiRecord[];
  cashCreditBills?: CashCreditBillRecord[];
  onCreateCommodity: (payload: {
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
  onOpenEditCommodity: (cmd: CommodityRecord, e: React.MouseEvent) => void;
}

const escapeCsv = (val: string | number | null | undefined): string => {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

// ============================================================================
// B1. COMMODITY MASTER SUBSECTION
// ============================================================================
export const CommodityMasterSubsection: React.FC<StockSubsectionsCommonProps> = ({
  businessDate,
  activeUser,
  stockStatuses,
  onCreateCommodity,
  onUpdateCommodity,
  onOpenEditCommodity,
}) => {
  const [searchText, setSearchText] = useState<string>('');
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add New Entry Form State (1. Meta Data, 2. GST Section, 3. Opening Stock Section)
  const [itemName, setItemName] = useState<string>('');
  const [localName, setLocalName] = useState<string>('');
  const [varietyGrade, setVarietyGrade] = useState<string>('');
  const [internalCode, setInternalCode] = useState<string>('');
  const [qrCodeVal, setQrCodeVal] = useState<string>('');
  const [unitCode] = useState<string>('Q');
  const [bagWeightKg, setBagWeightKg] = useState<string>('');
  const [lowStockThresholdQ, setLowStockThresholdQ] = useState<string>('10');
  const [gstHsnCode, setGstHsnCode] = useState<string>('');
  const [purchaseGstPct, setPurchaseGstPct] = useState<string>('0');
  const [salesGstPct, setSalesGstPct] = useState<string>('0');
  const [openingQtyQ, setOpeningQtyQ] = useState<string>('0');
  const [openingPriceRupees, setOpeningPriceRupees] = useState<string>('0');
  const [godownLocation, setGodownLocation] = useState<string>('MANDI');

  // Import CSV Preview State
  const [importCsvText, setImportCsvText] = useState<string>('');
  const [importPreviewRows, setImportPreviewRows] = useState<
    Array<{
      code: string;
      nameEn: string;
      nameKn: string;
      gradeVariety: string;
      hsnCode: string;
      gstPct: number;
      openingQtyQ: number;
      openingRateRupees: number;
      godown: string;
      isDuplicate: boolean;
      validationError: string | null;
    }>
  >([]);

  const canManage =
    activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS) ||
    activeUser.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);

  const filteredMasterList = useMemo(() => {
    return stockStatuses.filter((item) => {
      const cmd = item.commodity;
      if (cmd.status !== statusTab) return false;
      if (!searchText.trim()) return true;
      const q = searchText.trim().toLowerCase();
      return (
        cmd.nameEn.toLowerCase().includes(q) ||
        cmd.nameKn.toLowerCase().includes(q) ||
        cmd.code.toLowerCase().includes(q) ||
        cmd.gradeVariety.toLowerCase().includes(q) ||
        cmd.hsnCode.toLowerCase().includes(q)
      );
    });
  }, [stockStatuses, statusTab, searchText]);

  const handleExportMasterCsv = () => {
    const headers = [
      'Commodity Name',
      'Variety / Grade',
      'Local Name',
      'Unit',
      'GST / HSN Code',
      'GST %',
      'Internal ID / Code',
      'Status',
      'Opening Stock (Q)',
      'Standard Rate (Rs/Q)',
    ];
    const rows = stockStatuses.map((s) => {
      const c = s.commodity;
      const gstPct = ((c.cgstRateBps || 0) + (c.sgstRateBps || 0) + (c.igstRateBps || 0)) / 100;
      return [
        c.nameEn,
        c.gradeVariety || '-',
        c.nameKn || '-',
        'Q (Quintal)',
        c.hsnCode || '-',
        `${gstPct}%`,
        `SGT-${c.code}-${c.id.slice(-4)}`,
        c.status,
        (s.openingWeightGrams / 100_000).toFixed(2),
        (c.standardRatePerQuintalPaise / 100).toFixed(2),
      ];
    });
    const csv =
      '\uFEFF' +
      [headers, ...rows].map((r) => r.map((cell) => escapeCsv(cell)).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGT-Commodity-Master-${businessDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRegisterCommodity = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const trimmedName = itemName.trim();
    if (!trimmedName) {
      setMsg({ type: 'error', text: 'Item Name is required.' });
      return;
    }
    const resolvedCode =
      internalCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '') ||
      trimmedName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) ||
      `CROP${Date.now().toString().slice(-4)}`;

    const duplicate = stockStatuses.some(
      (s) =>
        s.commodity.code.toUpperCase() === resolvedCode ||
        (s.commodity.nameEn.toLowerCase() === trimmedName.toLowerCase() &&
          s.commodity.gradeVariety.toLowerCase() === varietyGrade.trim().toLowerCase())
    );
    if (duplicate) {
      setMsg({
        type: 'error',
        text: `Duplicate commodity code or record ("${resolvedCode}" / "${trimmedName}") already exists in Commodity Master.`,
      });
      return;
    }

    const salesGst = Math.max(0, Number(salesGstPct || 0));
    const purchaseGst = Math.max(0, Number(purchaseGstPct || 0));
    const effectiveGstPct = salesGst > 0 ? salesGst : purchaseGst;
    const halfGstBps = Math.round((effectiveGstPct / 2) * 100);
    const openQty = Math.max(0, Number(openingQtyQ || 0));
    const openRatePaise = rupeesToPaise(openingPriceRupees || '0');

    try {
      await onCreateCommodity({
        code: resolvedCode,
        nameEn: trimmedName,
        nameKn: localName.trim() || trimmedName,
        gradeVariety: varietyGrade.trim(),
        hsnCode: gstHsnCode.trim(),
        referenceBagWeightKg: bagWeightKg ? Number(bagWeightKg) : null,
        lowStockThresholdQuintals: Math.max(0, Number(lowStockThresholdQ || 0)),
        standardRatePerQuintalPaise: openRatePaise,
        gstApplicableDefault: effectiveGstPct > 0,
        cgstRateBps: halfGstBps,
        sgstRateBps: halfGstBps,
        openingQuantityQuintals: openQty,
        openingRatePerQuintalPaise: openRatePaise,
        godownLocation: godownLocation.trim() || 'MANDI',
        openingDate: businessDate,
      });
      setShowAddModal(false);
      setItemName('');
      setLocalName('');
      setVarietyGrade('');
      setInternalCode('');
      setQrCodeVal('');
      setGstHsnCode('');
      setPurchaseGstPct('0');
      setSalesGstPct('0');
      setOpeningQtyQ('0');
      setOpeningPriceRupees('0');
      setMsg({
        type: 'success',
        text: `Registered "${trimmedName}" (${resolvedCode}) in Unit Q (Quintal)${
          openQty > 0 ? ` with ${openQty} Q opening stock in ${godownLocation}` : ''
        }.`,
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to register commodity',
      });
    }
  };

  const handleToggleActiveStatus = async (cmd: CommodityRecord) => {
    const nextStatus = cmd.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await onUpdateCommodity(cmd.id, {
        nameEn: cmd.nameEn,
        nameKn: cmd.nameKn,
        gradeVariety: cmd.gradeVariety,
        hsnCode: cmd.hsnCode,
        referenceBagWeightKg: cmd.referenceBagWeightKg,
        lowStockThresholdQuintals:
          cmd.lowStockThresholdQuintals ?? cmd.lowStockThresholdGrams / 100_000,
        standardRatePerQuintalPaise: cmd.standardRatePerQuintalPaise,
        status: nextStatus,
        reason: `Status toggled to ${nextStatus} from Commodity Master`,
      });
      setMsg({
        type: 'success',
        text: `${cmd.nameEn} moved to ${nextStatus === 'ACTIVE' ? 'Active' : 'Inactive'} list.`,
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update commodity status',
      });
    }
  };

  const handleParseImportPreview = (rawText: string) => {
    setImportCsvText(rawText);
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setImportPreviewRows([]);
      return;
    }
    const dataLines =
      lines[0].toLowerCase().includes('commodity') || lines[0].toLowerCase().includes('name')
        ? lines.slice(1)
        : lines;

    const existingCodes = new Set(stockStatuses.map((s) => s.commodity.code.toUpperCase()));
    const seenInBatch = new Set<string>();

    const parsed = dataLines.map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const nameEn = cols[0] || '';
      const gradeVariety = cols[1] || '';
      const nameKn = cols[2] || nameEn;
      const hsnCode = cols[3] || '';
      const gstPct = Number(cols[4] || 0);
      const rawCode =
        (cols[5] || nameEn)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 10) || 'CROP';
      const openingQtyQ = Math.max(0, Number(cols[6] || 0));
      const openingRateRupees = Math.max(0, Number(cols[7] || 0));
      const godown = cols[8] || 'MANDI';

      const isDuplicate = existingCodes.has(rawCode) || seenInBatch.has(rawCode);
      seenInBatch.add(rawCode);

      let validationError: string | null = null;
      if (!nameEn) validationError = 'Missing Item Name';
      else if (isDuplicate) validationError = `Duplicate Code (${rawCode})`;

      return {
        code: rawCode,
        nameEn,
        nameKn,
        gradeVariety,
        hsnCode,
        gstPct,
        openingQtyQ,
        openingRateRupees,
        godown,
        isDuplicate,
        validationError,
      };
    });
    setImportPreviewRows(parsed);
  };

  const handleConfirmImportSave = async () => {
    const validRows = importPreviewRows.filter((r) => !r.validationError);
    if (validRows.length === 0) {
      setMsg({ type: 'error', text: 'No valid non-duplicate rows to import.' });
      return;
    }
    try {
      for (const r of validRows) {
        const halfBps = Math.round((r.gstPct / 2) * 100);
        await onCreateCommodity({
          code: r.code,
          nameEn: r.nameEn,
          nameKn: r.nameKn,
          gradeVariety: r.gradeVariety,
          hsnCode: r.hsnCode,
          referenceBagWeightKg: null,
          lowStockThresholdQuintals: 10,
          standardRatePerQuintalPaise: rupeesToPaise(String(r.openingRateRupees || 0)),
          gstApplicableDefault: r.gstPct > 0,
          cgstRateBps: halfBps,
          sgstRateBps: halfBps,
          openingQuantityQuintals: r.openingQtyQ,
          openingRatePerQuintalPaise: rupeesToPaise(String(r.openingRateRupees || 0)),
          godownLocation: r.godown,
          openingDate: businessDate,
        });
      }
      setShowImportModal(false);
      setImportCsvText('');
      setImportPreviewRows([]);
      setMsg({
        type: 'success',
        text: `Imported and validated ${validRows.length} commodities into Commodity Master.`,
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed during commodity import',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* B1 Top Header & Controls: Export, Import, + New */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            COMMODITY MASTER
          </h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Manage Commodities, Varieties, Grades, HSN/GST & Opening Stock in Quintals (Q)</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportMasterCsv}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            disabled={!canManage}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Import</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            disabled={!canManage}
            className="px-4 py-2 rounded-xl bg-slate-950 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Search Field and Active / Inactive Tabs */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or local name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="apple-input w-full pl-9 py-2 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setStatusTab('ACTIVE')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusTab === 'ACTIVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Active ({stockStatuses.filter((s) => s.commodity.status === 'ACTIVE').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('INACTIVE')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusTab === 'INACTIVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Inactive ({stockStatuses.filter((s) => s.commodity.status === 'INACTIVE').length})
            </button>
          </div>
        </div>

        {/* Commodity Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4">Commodity Name</th>
                <th className="py-3 px-3">Variety</th>
                <th className="py-3 px-3">Grade</th>
                <th className="py-3 px-3">Local Name</th>
                <th className="py-3 px-3">Unit</th>
                <th className="py-3 px-3">HSN</th>
                <th className="py-3 px-3">GST %</th>
                <th className="py-3 px-3">Internal ID</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMasterList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No {statusTab.toLowerCase()} commodities match your search. Click “+ New” to register a commodity.
                  </td>
                </tr>
              ) : (
                filteredMasterList.map((item) => {
                  const cmd = item.commodity;
                  const parts = (cmd.gradeVariety || '').split('/').map((s) => s.trim());
                  const varietyText = parts[0] || '—';
                  const gradeText = parts[1] || (parts[0] ? 'Standard' : '—');
                  const totalGstPct =
                    ((cmd.cgstRateBps || 0) + (cmd.sgstRateBps || 0) + (cmd.igstRateBps || 0)) /
                    100;
                  const internalIdDisplay = `SGT-${cmd.code}-${cmd.id.slice(-4)}`;

                  return (
                    <tr key={cmd.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>{cmd.nameEn}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[11px]">
                          {varietyText}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">{gradeText}</td>
                      <td className="py-3.5 px-3 text-slate-700 font-medium">{cmd.nameKn || '—'}</td>
                      <td className="py-3.5 px-3 font-mono font-bold text-slate-700">Q</td>
                      <td className="py-3.5 px-3 font-mono text-slate-600">
                        {cmd.hsnCode || '—'}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-700">{totalGstPct}%</td>
                      <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500">
                        {internalIdDisplay}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => onOpenEditCommodity(cmd, e)}
                            title="Edit Commodity"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActiveStatus(cmd)}
                            title={
                              cmd.status === 'ACTIVE'
                                ? 'Deactivate Commodity'
                                : 'Activate Commodity'
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                              cmd.status === 'ACTIVE'
                                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            <span>{cmd.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Entry Modal (B1 Spec: 1. Meta Data, 2. GST Section, 3. Opening Stock Section) */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Add New Commodity Entry
                </h3>
                <p className="text-xs text-slate-500">
                  Shree Guru Traders · Standardized in Quintals (Q) · Opening Stock Posted Atomically Once
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterCommodity} className="space-y-5 text-xs">
              {/* 1. Meta Data */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  1. Meta Data
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Item Name (Select / Enter) *
                    </label>
                    <input
                      type="text"
                      list="sgt-standard-crops-list"
                      required
                      value={itemName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItemName(v);
                        const clean = v
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                          .slice(0, 10);
                        setInternalCode(clean);
                        setQrCodeVal(clean ? `SGT-QR-${clean}` : '');
                      }}
                      placeholder="e.g. Maize, Paddy - RNR"
                      className="apple-input w-full"
                    />
                    <datalist id="sgt-standard-crops-list">
                      <option value="Maize" />
                      <option value="Paddy - RNR" />
                      <option value="Sunflower" />
                      <option value="Cotton (Kapas)" />
                      <option value="Soybean" />
                      <option value="Groundnut" />
                      <option value="Ragi" />
                      <option value="Kadli (Bengal Gram)" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Local Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      placeholder="e.g. ಗೋವಿನ ಜೋಳ / ಭತ್ತ"
                      className="apple-input w-full"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Variety / Grade (Optional)
                    </label>
                    <input
                      type="text"
                      value={varietyGrade}
                      onChange={(e) => setVarietyGrade(e.target.value)}
                      placeholder="e.g. RNR / FAQ Grade-A"
                      className="apple-input w-full"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Internal Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={internalCode}
                      onChange={(e) => setInternalCode(e.target.value.toUpperCase())}
                      placeholder="e.g. MAIZE"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      QR Code
                    </label>
                    <div className="relative">
                      <QrCode className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={qrCodeVal}
                        onChange={(e) => setQrCodeVal(e.target.value)}
                        placeholder="Auto-generated QR ID"
                        className="apple-input w-full pl-8 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unit (Requested Default)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${unitCode} — Quintal (100 Kg)`}
                      className="apple-input w-full bg-slate-100 font-semibold text-slate-700"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default Bag Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={bagWeightKg}
                      onChange={(e) => setBagWeightKg(e.target.value)}
                      placeholder="Optional e.g. 50"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Low Stock Alert Threshold (Q)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={lowStockThresholdQ}
                      onChange={(e) => setLowStockThresholdQ(e.target.value)}
                      className="apple-input w-full font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 2. GST Section */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  2. GST Section
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      GST / HSN Code
                    </label>
                    <input
                      type="text"
                      value={gstHsnCode}
                      onChange={(e) => setGstHsnCode(e.target.value)}
                      placeholder="e.g. 1005 / 1006"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Purchase GST % (Optional)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={purchaseGstPct}
                      onChange={(e) => setPurchaseGstPct(e.target.value)}
                      placeholder="0"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Sales GST % (Optional)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={salesGstPct}
                      onChange={(e) => setSalesGstPct(e.target.value)}
                      placeholder="0"
                      className="apple-input w-full font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Opening Stock Section */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  3. Opening Stock Section (Posted Once)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Opening Quantity in Q
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={openingQtyQ}
                      onChange={(e) => setOpeningQtyQ(e.target.value)}
                      placeholder="0.00"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Opening Stock Price (₹ / Q)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={openingPriceRupees}
                      onChange={(e) => setOpeningPriceRupees(e.target.value)}
                      placeholder="0"
                      className="apple-input w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Godown Location
                    </label>
                    <input
                      type="text"
                      value={godownLocation}
                      onChange={(e) => setGodownLocation(e.target.value)}
                      placeholder="MANDI / MAIN GODOWN"
                      className="apple-input w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                >
                  Register / Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Preview & Validation Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Import & Validate Commodities (Preview Before Saving)
                </h3>
                <p className="text-xs text-slate-500">
                  Format: Item Name, Variety/Grade, Local Name, HSN Code, GST %, Internal Code, Opening Q, Opening Rate, Godown
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={importCsvText}
              onChange={(e) => handleParseImportPreview(e.target.value)}
              placeholder={`Maize,Yellow FAQ,ಮೆಕ್ಕೆಜೋಳ,1005,0,MAIZE,25,2200,MANDI\nPaddy - RNR,RNR Grade-A,ಭತ್ತ,1006,0,PADDYRNR,45,3200,MANDI`}
              className="apple-input w-full font-mono text-xs"
            />

            {importPreviewRows.length > 0 && (
              <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-3">Variety/Grade</th>
                      <th className="py-2 px-3">HSN / GST</th>
                      <th className="py-2 px-3">Opening Stock</th>
                      <th className="py-2 px-3">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreviewRows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-bold">{r.code}</td>
                        <td className="py-2 px-3">
                          {r.nameEn} ({r.nameKn})
                        </td>
                        <td className="py-2 px-3">{r.gradeVariety || '—'}</td>
                        <td className="py-2 px-3 font-mono">
                          {r.hsnCode || '-'} ({r.gstPct}%)
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {r.openingQtyQ} Q @ ₹{r.openingRateRupees} ({r.godown})
                        </td>
                        <td className="py-2 px-3">
                          {r.validationError ? (
                            <span className="text-rose-600 font-bold">{r.validationError}</span>
                          ) : (
                            <span className="text-emerald-600 font-bold">Ready to Save</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImportSave}
                disabled={importPreviewRows.filter((r) => !r.validationError).length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Validate & Save ({importPreviewRows.filter((r) => !r.validationError).length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// B3. COMMODITY SUMMARY SUBSECTION
// ============================================================================
export const CommoditySummarySubsection: React.FC<{
  businessDate: string;
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
}> = ({ businessDate, stockStatuses, stockMovements }) => {
  const [windowFilter, setWindowFilter] = useState<PeriodWindowFilter>('TODAY');
  const [pickedDate, setPickedDate] = useState<string>(businessDate);

  const windowBounds = useMemo(() => {
    const end = pickedDate || businessDate;
    const base = new Date(`${end}T00:00:00`);
    if (windowFilter === 'TODAY' || windowFilter === 'CUSTOM') {
      return { start: end, end };
    }
    const days = windowFilter === '7D' ? 6 : 29;
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    return { start: d.toISOString().slice(0, 10), end };
  }, [windowFilter, pickedDate, businessDate]);

  const summaryRows = useMemo(() => {
    const rows: Array<{
      commodity: CommodityRecord;
      cameInBags: number;
      cameInGrams: number;
      wentOutBags: number;
      wentOutGrams: number;
      remainsOwnedBags: number;
      remainsOwnedGrams: number;
      remainsAgencyBags: number;
      remainsAgencyGrams: number;
      movementCount: number;
    }> = [];

    for (const status of stockStatuses) {
      const cmdMovesInWindow = stockMovements.filter(
        (m) =>
          m.commodityId === status.commodity.id &&
          m.transactionDate >= windowBounds.start &&
          m.transactionDate <= windowBounds.end
      );

      let cameInBags = 0;
      let cameInGrams = 0;
      let wentOutBags = 0;
      let wentOutGrams = 0;

      for (const m of cmdMovesInWindow) {
        if (m.direction === 'OPENING' || m.direction === 'GOODS_IN') {
          cameInBags += Math.abs(m.bagsDelta);
          cameInGrams += Math.abs(m.weightGramsDelta);
        } else if (m.direction === 'GOODS_OUT') {
          wentOutBags += Math.abs(m.bagsDelta);
          wentOutGrams += Math.abs(m.weightGramsDelta);
        } else if (m.direction === 'ADJUSTMENT') {
          if (m.weightGramsDelta >= 0) {
            cameInBags += Math.max(0, m.bagsDelta);
            cameInGrams += m.weightGramsDelta;
          } else {
            wentOutBags += Math.abs(m.bagsDelta);
            wentOutGrams += Math.abs(m.weightGramsDelta);
          }
        }
      }

      if (cmdMovesInWindow.length > 0) {
        rows.push({
          commodity: status.commodity,
          cameInBags,
          cameInGrams,
          wentOutBags,
          wentOutGrams,
          remainsOwnedBags: status.closingOwnedBags,
          remainsOwnedGrams: status.closingOwnedWeightGrams,
          remainsAgencyBags: status.agencyHandledBags,
          remainsAgencyGrams: status.agencyHandledWeightGrams,
          movementCount: cmdMovesInWindow.length,
        });
      }
    }
    return rows;
  }, [stockStatuses, stockMovements, windowBounds]);

  const handleExportSummaryCsv = () => {
    const headers = [
      'Commodity Code',
      'Commodity Name',
      'Local Name',
      'Period Start',
      'Period End',
      'Came In (Bags)',
      'Came In (Q)',
      'Went Out (Bags)',
      'Went Out (Q)',
      'Remaining Owned (Bags)',
      'Remaining Owned (Q)',
      'Remaining Commission/Agency (Q)',
    ];
    const dataRows = summaryRows.map((r) => [
      r.commodity.code,
      r.commodity.nameEn,
      r.commodity.nameKn,
      windowBounds.start,
      windowBounds.end,
      r.cameInBags,
      (r.cameInGrams / 100_000).toFixed(2),
      r.wentOutBags,
      (r.wentOutGrams / 100_000).toFixed(2),
      r.remainsOwnedBags,
      (r.remainsOwnedGrams / 100_000).toFixed(2),
      (r.remainsAgencyGrams / 100_000).toFixed(2),
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...dataRows].map((row) => row.map((c) => escapeCsv(c)).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGT-Commodity-Summary-${windowBounds.start}-to-${windowBounds.end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-3xl p-6 bg-emerald-50/40 border border-emerald-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold tracking-tight text-emerald-900">
            COMMODITY DAY SUMMARY
          </h2>
          <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-emerald-600" />
            <span>What came in, what went out, what is still lying</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200">
            {(
              [
                { id: 'TODAY', label: 'TODAY' },
                { id: '7D', label: '7 DAYS' },
                { id: '30D', label: '30 DAYS' },
              ] as Array<{ id: PeriodWindowFilter; label: string }>
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setWindowFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  windowFilter === btn.id
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            aria-label="Commodity Summary Date Picker"
            value={pickedDate}
            onChange={(e) => {
              setPickedDate(e.target.value);
              setWindowFilter('CUSTOM');
            }}
            className="apple-input py-1.5 px-3 text-xs font-semibold bg-white"
          />

          <button
            type="button"
            onClick={handleExportSummaryCsv}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>PRINT</span>
          </button>
        </div>
      </div>

      {summaryRows.length === 0 ? (
        <div className="glass-panel rounded-3xl p-16 text-center space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-xs font-bold tracking-widest uppercase text-slate-400">
            NO COMMODITY MOVEMENT IN THIS WINDOW
          </div>
          <p className="text-xs text-slate-400">
            Period: {formatDateDDMMYYYY(windowBounds.start)} to{' '}
            {formatDateDDMMYYYY(windowBounds.end)}
          </p>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <th className="py-3.5 px-4">Commodity</th>
                  <th className="py-3.5 px-3 text-right">Came In (Goods In)</th>
                  <th className="py-3.5 px-3 text-right">Went Out (Goods Out)</th>
                  <th className="py-3.5 px-3 text-right">Remains (SGT Owned)</th>
                  <th className="py-3.5 px-4 text-right">Remains (Commission Held)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.map((r) => (
                  <tr key={r.commodity.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">
                        {r.commodity.nameEn} ({r.commodity.code})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.commodity.nameKn} · {r.movementCount} movement(s) in window
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-700">
                      +{(r.cameInGrams / 100_000).toFixed(2)} Q ({r.cameInBags} bags)
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-rose-700">
                      -{(r.wentOutGrams / 100_000).toFixed(2)} Q ({r.wentOutBags} bags)
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-extrabold text-slate-900">
                      {(r.remainsOwnedGrams / 100_000).toFixed(2)} Q ({r.remainsOwnedBags} bags)
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-amber-800">
                      {(r.remainsAgencyGrams / 100_000).toFixed(2)} Q ({r.remainsAgencyBags} bags)
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

// ============================================================================
// B4. SALES BOOK SUBSECTION
// ============================================================================
export const SalesBookSubsection: React.FC<{
  businessDate: string;
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
  kharidiPattis?: KharidiPattiRecord[];
  dalaliKharidiPattis?: DalaliKharidiPattiRecord[];
  cashCreditBills?: CashCreditBillRecord[];
}> = ({
  businessDate,
  stockStatuses,
  stockMovements,
  kharidiPattis = [],
  dalaliKharidiPattis = [],
  cashCreditBills = [],
}) => {
  const [windowFilter, setWindowFilter] = useState<PeriodWindowFilter>('TODAY');
  const [pickedDate, setPickedDate] = useState<string>(businessDate);
  const [viewMode, setViewMode] = useState<'ONE_ITEM' | 'ALL_ITEMS'>('ONE_ITEM');
  const [itemSearch, setItemSearch] = useState<string>('');
  const [selectedCommodityId, setSelectedCommodityId] = useState<string | null>(
    stockStatuses[0]?.commodity.id || null
  );

  const windowBounds = useMemo(() => {
    const end = pickedDate || businessDate;
    const base = new Date(`${end}T00:00:00`);
    if (windowFilter === 'TODAY' || windowFilter === 'CUSTOM') {
      return { start: end, end };
    }
    const days = windowFilter === '7D' ? 6 : 29;
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    return { start: d.toISOString().slice(0, 10), end };
  }, [windowFilter, pickedDate, businessDate]);

  // Compile all invoice-level sales lines across Cash/Credit Bills, Kharidi Pattis, Dalali Kharidi Pattis, and Direct Goods Out
  const allSalesLines = useMemo(() => {
    const list: Array<{
      id: string;
      invoiceNo: string;
      invoiceDate: string;
      docType: string;
      commodityId: string;
      commodityName: string;
      buyerName: string;
      bags: number;
      weightGrams: number;
      ratePerQuintalPaise: number;
      lineAmountPaise: number;
    }> = [];

    const billedRefs = new Set<string>();

    cashCreditBills
      .filter(
        (b) =>
          b.status === 'FINALIZED' &&
          b.billDate >= windowBounds.start &&
          b.billDate <= windowBounds.end
      )
      .forEach((b) => {
        billedRefs.add(b.billNo);
        b.items.forEach((line) => {
          list.push({
            id: `CB-${b.id}-${line.id}`,
            invoiceNo: b.billNo,
            invoiceDate: b.billDate,
            docType: b.billKind === 'CASH_BILL' ? 'Cash Bill' : 'Credit Bill',
            commodityId: line.commodityId,
            commodityName: line.commodityNameEn,
            buyerName: b.buyerName,
            bags: line.bags,
            weightGrams: line.netWeightGrams,
            ratePerQuintalPaise: line.ratePerQuintalPaise,
            lineAmountPaise: line.lineTotalPaise,
          });
        });
      });

    kharidiPattis
      .filter(
        (p) => p.invoiceDate >= windowBounds.start && p.invoiceDate <= windowBounds.end
      )
      .forEach((p) => {
        billedRefs.add(p.invoiceNo);
        p.items.forEach((line) => {
          list.push({
            id: `KP-${p.id}-${line.id}`,
            invoiceNo: p.invoiceNo,
            invoiceDate: p.invoiceDate,
            docType: 'Kharidi Patti',
            commodityId: line.commodityId,
            commodityName: line.commodityNameEn,
            buyerName: p.buyerName,
            bags: line.bags,
            weightGrams: line.netWeightGrams,
            ratePerQuintalPaise: line.ratePerQuintalPaise,
            lineAmountPaise: line.lineTotalPaise,
          });
        });
      });

    dalaliKharidiPattis
      .filter(
        (p) =>
          p.status === 'FINALIZED' &&
          p.pattiDate >= windowBounds.start &&
          p.pattiDate <= windowBounds.end
      )
      .forEach((p) => {
        billedRefs.add(p.pattiNo);
        p.items.forEach((line) => {
          list.push({
            id: `DK-${p.id}-${line.id}`,
            invoiceNo: p.pattiNo,
            invoiceDate: p.pattiDate,
            docType: 'Dalali Kharidi',
            commodityId: line.commodityId,
            commodityName: line.commodityNameEn,
            buyerName: p.buyerName,
            bags: line.bags,
            weightGrams: line.netWeightGrams,
            ratePerQuintalPaise: line.ratePerQuintalPaise,
            lineAmountPaise: line.lineTotalPaise,
          });
        });
      });

    stockMovements
      .filter(
        (m) =>
          m.direction === 'GOODS_OUT' &&
          !billedRefs.has(m.referenceBillNo) &&
          m.transactionDate >= windowBounds.start &&
          m.transactionDate <= windowBounds.end
      )
      .forEach((m) => {
        const cmd = stockStatuses.find((s) => s.commodity.id === m.commodityId)?.commodity;
        list.push({
          id: `MOV-${m.id}`,
          invoiceNo: m.referenceBillNo || m.movementNo,
          invoiceDate: m.transactionDate,
          docType: 'Direct Sale',
          commodityId: m.commodityId,
          commodityName: cmd?.nameEn || m.commodityId,
          buyerName: m.partyName,
          bags: Math.abs(m.bagsDelta),
          weightGrams: Math.abs(m.weightGramsDelta),
          ratePerQuintalPaise: m.ratePerQuintalPaise,
          lineAmountPaise: m.totalValuePaise,
        });
      });

    return list;
  }, [
    cashCreditBills,
    kharidiPattis,
    dalaliKharidiPattis,
    stockMovements,
    stockStatuses,
    windowBounds,
  ]);

  const filteredItems = useMemo(() => {
    return stockStatuses.filter((s) => {
      if (!itemSearch.trim()) return true;
      const q = itemSearch.trim().toLowerCase();
      return (
        s.commodity.nameEn.toLowerCase().includes(q) ||
        s.commodity.nameKn.toLowerCase().includes(q) ||
        s.commodity.code.toLowerCase().includes(q)
      );
    });
  }, [stockStatuses, itemSearch]);

  const selectedItemSales = useMemo(() => {
    if (!selectedCommodityId) return [];
    return allSalesLines.filter((l) => l.commodityId === selectedCommodityId);
  }, [allSalesLines, selectedCommodityId]);

  const handleDownloadSalesExcelCsv = () => {
    const headers = [
      'Invoice / Bill No',
      'Date',
      'Document Type',
      'Commodity',
      'Buyer Name',
      'Bags',
      'Quantity (Q)',
      'Quantity (Kg)',
      'Rate (Rs/Q)',
      'Invoice Sale Amount (Rs)',
    ];
    const targetLines = viewMode === 'ONE_ITEM' && selectedCommodityId ? selectedItemSales : allSalesLines;
    const rows = targetLines.map((l) => [
      l.invoiceNo,
      l.invoiceDate,
      l.docType,
      l.commodityName,
      l.buyerName,
      l.bags,
      (l.weightGrams / 100_000).toFixed(2),
      (l.weightGrams / 1_000).toFixed(1),
      (l.ratePerQuintalPaise / 100).toFixed(2),
      (l.lineAmountPaise / 100).toFixed(2),
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...rows].map((r) => r.map((c) => escapeCsv(c)).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGT-Sales-Book-${windowBounds.start}-to-${windowBounds.end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Sales Book Header */}
      <div className="glass-panel rounded-3xl p-6 bg-emerald-50/40 border border-emerald-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold tracking-tight text-emerald-900">
            SALES BOOK
          </h2>
          <p className="text-xs font-medium text-emerald-800">
            Every item, every buyer, in the unit on the invoice
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200">
            {(
              [
                { id: 'TODAY', label: 'TODAY' },
                { id: '7D', label: '7 DAYS' },
                { id: '30D', label: '30 DAYS' },
              ] as Array<{ id: PeriodWindowFilter; label: string }>
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setWindowFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  windowFilter === btn.id
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            aria-label="Sales Book Date Picker"
            value={pickedDate}
            onChange={(e) => {
              setPickedDate(e.target.value);
              setWindowFilter('CUSTOM');
            }}
            className="apple-input py-1.5 px-3 text-xs font-semibold bg-white"
          />

          <button
            type="button"
            onClick={handleDownloadSalesExcelCsv}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>DOWNLOAD EXCEL</span>
          </button>
        </div>
      </div>

      {/* View Mode Switcher & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 self-start">
          <button
            type="button"
            onClick={() => setViewMode('ONE_ITEM')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'ONE_ITEM'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ONE ITEM
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ALL_ITEMS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'ALL_ITEMS'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ALL ITEMS
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search an item..."
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            className="apple-input w-full pl-9 py-2 text-xs"
          />
        </div>
      </div>

      {viewMode === 'ONE_ITEM' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Item List on Left */}
          <div className="glass-panel rounded-3xl p-4 space-y-2">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No commodities registered.
              </div>
            ) : (
              filteredItems.map((s) => {
                const itemLines = allSalesLines.filter(
                  (l) => l.commodityId === s.commodity.id
                );
                const totalSoldGrams = itemLines.reduce((acc, l) => acc + l.weightGrams, 0);
                const isSelected = selectedCommodityId === s.commodity.id;
                return (
                  <button
                    key={s.commodity.id}
                    type="button"
                    onClick={() => setSelectedCommodityId(s.commodity.id)}
                    className={`w-full px-4 py-3 rounded-2xl text-left text-xs flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-emerald-50 border border-emerald-300 font-bold text-slate-900'
                        : 'bg-white hover:bg-slate-50 border border-slate-100 text-slate-700'
                    }`}
                  >
                    <span>
                      {s.commodity.nameEn}
                      {s.commodity.gradeVariety ? ` - ${s.commodity.gradeVariety}` : ''}
                    </span>
                    {totalSoldGrams > 0 ? (
                      <span className="font-mono font-bold text-emerald-700">
                        {(totalSoldGrams / 100_000).toFixed(2)} Q sold
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400">not sold</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Buyer-wise & Invoice-level Sales on Right */}
          <div className="lg:col-span-2 glass-panel rounded-3xl p-6">
            {!selectedCommodityId ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Pick an item to see its buyers.
              </div>
            ) : selectedItemSales.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="text-sm font-bold text-slate-700">
                  {stockStatuses.find((s) => s.commodity.id === selectedCommodityId)?.commodity
                    .nameEn || 'Selected Item'}{' '}
                  — <span className="text-slate-400">not sold</span>
                </div>
                <p className="text-xs text-slate-400">
                  No sales recorded for this item in the selected window (
                  {formatDateDDMMYYYY(windowBounds.start)} –{' '}
                  {formatDateDDMMYYYY(windowBounds.end)}).
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Buyer-Wise & Invoice-Level Sales:{' '}
                      {
                        stockStatuses.find((s) => s.commodity.id === selectedCommodityId)
                          ?.commodity.nameEn
                      }
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedItemSales.length} Invoice Line(s)
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-extrabold text-emerald-700">
                      {formatINR(
                        selectedItemSales.reduce((s, l) => s + l.lineAmountPaise, 0),
                        false
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {(
                        selectedItemSales.reduce((s, l) => s + l.weightGrams, 0) / 100_000
                      ).toFixed(2)}{' '}
                      Q ({selectedItemSales.reduce((s, l) => s + l.bags, 0)} bags)
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold">
                        <th className="py-2.5 px-3">Buyer Name</th>
                        <th className="py-2.5 px-3">Invoice / Date</th>
                        <th className="py-2.5 px-3 text-right">Bags</th>
                        <th className="py-2.5 px-3 text-right">Qty (Q / Kg)</th>
                        <th className="py-2.5 px-3 text-right">Rate (₹/Q)</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedItemSales.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {line.buyerName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {line.invoiceNo} · {formatDateDDMMYYYY(line.invoiceDate)} (
                            {line.docType})
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{line.bags}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold">
                            {(line.weightGrams / 100_000).toFixed(2)} Q (
                            {(line.weightGrams / 1_000).toFixed(0)} kg)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {formatINR(line.ratePerQuintalPaise, false)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            {formatINR(line.lineAmountPaise, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-6">
          {allSalesLines.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No sales recorded across any items in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Buyer Name</th>
                    <th className="py-2.5 px-3">Invoice / Date</th>
                    <th className="py-2.5 px-3 text-right">Bags</th>
                    <th className="py-2.5 px-3 text-right">Weight (Q)</th>
                    <th className="py-2.5 px-3 text-right">Rate (₹/Q)</th>
                    <th className="py-2.5 px-3 text-right">Invoice Sale Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allSalesLines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {line.commodityName}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {line.buyerName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {line.invoiceNo} · {formatDateDDMMYYYY(line.invoiceDate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{line.bags}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {(line.weightGrams / 100_000).toFixed(2)} Q
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatINR(line.ratePerQuintalPaise, false)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatINR(line.lineAmountPaise, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// B2. AUDIT PRINT & SALES AUDIT MODAL (Underlying Movements & Linked Pattis/Bills)
// ============================================================================
export const StockAuditModal: React.FC<{
  mode: 'AUDIT_PRINT' | 'SALES_AUDIT';
  onClose: () => void;
  stockStatuses: CommodityStockStatus[];
  stockMovements: StockMovementRecord[];
  farmerPattis?: FarmerPattiRecord[];
  kharidiPattis?: KharidiPattiRecord[];
  dalaliVikriPattis?: DalaliVikriPattiRecord[];
  dalaliKharidiPattis?: DalaliKharidiPattiRecord[];
  cashCreditBills?: CashCreditBillRecord[];
}> = ({
  mode,
  onClose,
  stockStatuses,
  stockMovements,
  farmerPattis = [],
  kharidiPattis = [],
  dalaliVikriPattis = [],
  dalaliKharidiPattis = [],
  cashCreditBills = [],
}) => {
  const commodityNameMap = useMemo(() => {
    const m = new Map<string, string>();
    stockStatuses.forEach((s) => m.set(s.commodity.id, s.commodity.nameEn));
    return m;
  }, [stockStatuses]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-white rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              {mode === 'AUDIT_PRINT'
                ? 'Stock Audit Print — Underlying Movements & Ownership Separation'
                : 'Sales Audit — Linked Pattis, Invoices & Stock Dispatches'}
            </h3>
            <p className="text-xs text-slate-500">
              SGT-Owned Purchased Stock vs Farmer/Supplier Commission Goods Held Separately
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Audit</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Underlying Stock Movements */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            1. Underlying Stock Movements ({stockMovements.length})
          </h4>
          <div className="border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2 px-3">Movement No</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Commodity</th>
                  <th className="py-2 px-3">Direction</th>
                  <th className="py-2 px-3">Source / Ownership</th>
                  <th className="py-2 px-3">Party & Linked Ref</th>
                  <th className="py-2 px-3 text-right">Qty (Q / Bags)</th>
                  <th className="py-2 px-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 px-3 font-mono font-bold">{m.movementNo}</td>
                    <td className="py-2 px-3 font-mono">
                      {formatDateDDMMYYYY(m.transactionDate)}
                    </td>
                    <td className="py-2 px-3 font-semibold">
                      {commodityNameMap.get(m.commodityId) || m.commodityId}
                    </td>
                    <td className="py-2 px-3 font-mono">{m.direction}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          m.ownershipType === 'SGT_OWNED'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {m.ownershipType === 'SGT_OWNED'
                          ? 'DIRECT PURCHASE (SGT OWNED)'
                          : 'FARMER / SUPPLIER COMMISSION'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {m.partyName} · <span className="font-mono">{m.referenceBillNo}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">
                      {(m.weightGramsDelta / 100_000).toFixed(2)} Q ({m.bagsDelta}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {formatINR(m.totalValuePaise, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Linked Pattis & Bills */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            2. Linked Pattis & Sales Bills
          </h4>
          <div className="border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2 px-3">Doc No</th>
                  <th className="py-2 px-3">Doc Type</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Counterparty</th>
                  <th className="py-2 px-3">Ownership Category</th>
                  <th className="py-2 px-3 text-right">Weight (Q) / Bags</th>
                  <th className="py-2 px-3 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {farmerPattis.map((fp) => (
                  <tr key={fp.id}>
                    <td className="py-2 px-3 font-mono font-bold">{fp.pattiNo}</td>
                    <td className="py-2 px-3">Farmer Patti</td>
                    <td className="py-2 px-3 font-mono">{formatDateDDMMYYYY(fp.pattiDate)}</td>
                    <td className="py-2 px-3">{fp.farmerName}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">{fp.ownershipMode}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {(fp.totalNetWeightGrams / 100_000).toFixed(2)} Q ({fp.totalBags}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {formatINR(fp.netPayablePaise, false)}
                    </td>
                  </tr>
                ))}
                {kharidiPattis.map((kp) => (
                  <tr key={kp.id}>
                    <td className="py-2 px-3 font-mono font-bold">{kp.invoiceNo}</td>
                    <td className="py-2 px-3">Buyer Kharidi Patti</td>
                    <td className="py-2 px-3 font-mono">
                      {formatDateDDMMYYYY(kp.invoiceDate)}
                    </td>
                    <td className="py-2 px-3">{kp.buyerName}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">{kp.ownershipMode}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {(kp.totalNetWeightGrams / 100_000).toFixed(2)} Q ({kp.totalBags}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatINR(kp.netReceivablePaise, false)}
                    </td>
                  </tr>
                ))}
                {dalaliVikriPattis.map((dv) => (
                  <tr key={dv.id}>
                    <td className="py-2 px-3 font-mono font-bold">{dv.pattiNo}</td>
                    <td className="py-2 px-3">Dalali Vikri Patti</td>
                    <td className="py-2 px-3 font-mono">{formatDateDDMMYYYY(dv.pattiDate)}</td>
                    <td className="py-2 px-3">{dv.farmerName}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">FARMER_COMMISSION</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {(dv.totalNetWeightGrams / 100_000).toFixed(2)} Q ({dv.totalBags}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {formatINR(dv.netPayablePaise, false)}
                    </td>
                  </tr>
                ))}
                {dalaliKharidiPattis.map((dk) => (
                  <tr key={dk.id}>
                    <td className="py-2 px-3 font-mono font-bold">{dk.pattiNo}</td>
                    <td className="py-2 px-3">Dalali Kharidi Patti</td>
                    <td className="py-2 px-3 font-mono">{formatDateDDMMYYYY(dk.pattiDate)}</td>
                    <td className="py-2 px-3">{dk.buyerName}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">FARMER_COMMISSION</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {(dk.totalNetWeightGrams / 100_000).toFixed(2)} Q ({dk.totalBags}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatINR(dk.netReceivablePaise, false)}
                    </td>
                  </tr>
                ))}
                {cashCreditBills.map((cb) => (
                  <tr key={cb.id}>
                    <td className="py-2 px-3 font-mono font-bold">{cb.billNo}</td>
                    <td className="py-2 px-3">{cb.billKind.replace('_', ' ')}</td>
                    <td className="py-2 px-3 font-mono">{formatDateDDMMYYYY(cb.billDate)}</td>
                    <td className="py-2 px-3">{cb.buyerName}</td>
                    <td className="py-2 px-3 font-mono text-[11px]">{cb.ownershipMode}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {(cb.totalNetWeightGrams / 100_000).toFixed(2)} Q ({cb.totalBags}b)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatINR(cb.netBillAmountPaise, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

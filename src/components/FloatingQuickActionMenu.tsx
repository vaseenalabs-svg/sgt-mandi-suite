import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  PackagePlus,
  Plus,
  ShoppingBag,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import {
  BankAccountRecord,
  CommodityStockStatus,
  JournalLineInput,
  PartyRecord,
  PartyType,
  StockMovementDirection,
  StockOwnershipType,
} from '../shared/types';
import { convertWeightToGrams, rupeesToPaise } from '../shared/math';
import { WeightUnit } from '../shared/types';

interface FloatingQuickActionMenuProps {
  businessDate: string;
  parties: PartyRecord[];
  bankAccounts: BankAccountRecord[];
  stockStatuses: CommodityStockStatus[];
  onNavigateSection: (
    section:
      | 'dashboard'
      | 'stock'
      | 'pattis'
      | 'parties'
      | 'khata'
      | 'loans_bank'
      | 'operations_reports'
  ) => void;
  onCreateVoucher: (payload: Record<string, unknown>) => Promise<void>;
  onPostJournalEntry: (payload: {
    transactionDate: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    narration: string;
    lines: JournalLineInput[];
  }) => Promise<void>;
  onRegisterParty: (payload: Record<string, unknown>) => Promise<unknown>;
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
}

type QuickModalMode =
  | 'NONE'
  | 'ADD_PAYMENT'
  | 'QUICK_ENTRY'
  | 'ADD_CONTACT'
  | 'NEW_ARRIVAL'
  | 'NEW_SALE';

export const FloatingQuickActionMenu: React.FC<FloatingQuickActionMenuProps> = ({
  businessDate,
  parties,
  bankAccounts,
  stockStatuses,
  onNavigateSection,
  onCreateVoucher,
  onPostJournalEntry,
  onRegisterParty,
  onRecordMovement,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<QuickModalMode>('NONE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside or pressing Escape (Section C requirement)
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // 1. Add Payment state
  const [payPartyId, setPayPartyId] = useState('');
  const [payPayeeName, setPayPayeeName] = useState('');
  const [payAmountRs, setPayAmountRs] = useState('');
  const [payMode, setPayMode] = useState<'CASH' | 'BANK'>('CASH');
  const [payBankId, setPayBankId] = useState(bankAccounts[0]?.id || '');
  const [payDate, setPayDate] = useState(businessDate);
  const [payNarration, setPayNarration] = useState('');

  // 2. Quick Entry state
  const [qeDirection, setQeDirection] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [qePartyName, setQePartyName] = useState('');
  const [qeCategory, setQeCategory] = useState('Mandi Operational Expense');
  const [qeAmountRs, setQeAmountRs] = useState('');
  const [qeDate, setQeDate] = useState(businessDate);
  const [qeNarration, setQeNarration] = useState('');

  // 3. Add Contact state
  const [contactType, setContactType] = useState<PartyType>('FARMER');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactVillage, setContactVillage] = useState('Ranebennur');
  const [contactGstin, setContactGstin] = useState('');

  // 4 & 5. New Arrival / New Sale state
  const [stkCommodityId, setStkCommodityId] = useState(stockStatuses[0]?.commodity.id || '');
  const [stkOwnership, setStkOwnership] = useState<StockOwnershipType>('SGT_OWNED');
  const [stkPartyId, setStkPartyId] = useState('');
  const [stkPartyName, setStkPartyName] = useState('');
  const [stkBags, setStkBags] = useState('');
  const [stkWeightQ, setStkWeightQ] = useState('');
  const [stkRateRs, setStkRateRs] = useState('');
  const [stkSettlement, setStkSettlement] = useState<'CREDIT' | 'CASH' | 'BANK'>('CREDIT');
  const [stkDate, setStkDate] = useState(businessDate);
  const [stkReason, setStkReason] = useState('');

  const selectAction = (mode: QuickModalMode) => {
    setIsOpen(false); // Close menu after an action is selected
    setErrorMsg(null);
    setStkCommodityId(stockStatuses[0]?.commodity.id || '');
    setPayBankId(bankAccounts[0]?.id || '');
    setActiveModal(mode);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    const amountPaise = rupeesToPaise(payAmountRs || '0');
    if (amountPaise <= 0) {
      setErrorMsg('Enter a valid payment amount greater than ₹0.');
      return;
    }
    const party = parties.find((p) => p.id === payPartyId);
    const resolvedName = party ? party.name : payPayeeName.trim();
    if (!resolvedName) {
      setErrorMsg('Select a party or enter payee name.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreateVoucher({
        voucherDate: payDate,
        voucherCategory: party ? 'PARTY_SETTLEMENT' : 'MANDI_EXPENSE',
        partyId: party ? party.id : null,
        payeeName: resolvedName,
        expenseHeadCode: party ? null : '5004',
        expenseHeadName: party ? 'Party Settlement' : 'General Expense',
        description: payNarration.trim() || `Quick Payment — ${resolvedName}`,
        amountPaise,
        gstApplicable: false,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        paymentMode: payMode,
        bankAccountId: payMode === 'BANK' ? payBankId || bankAccounts[0]?.id || null : null,
        idempotencyKey: `FAB-PAY-${payDate}-${resolvedName}-${amountPaise}-${Date.now()}`,
      });
      setActiveModal('NONE');
      setPayAmountRs('');
      setPayPayeeName('');
      setPayNarration('');
      showToast(`Saved payment of ₹${(amountPaise / 100).toFixed(2)} to ${resolvedName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    const amountPaise = rupeesToPaise(qeAmountRs || '0');
    if (amountPaise <= 0) {
      setErrorMsg('Enter a valid amount greater than ₹0.');
      return;
    }
    setIsSubmitting(true);
    try {
      const idempKey = `FAB-QE-${qeDate}-${qeDirection}-${amountPaise}-${Date.now()}`;
      await onPostJournalEntry({
        transactionDate: qeDate,
        sourceType: 'MANUAL_KHATA_VOUCHER',
        sourceId: idempKey,
        idempotencyKey: idempKey,
        narration:
          qeNarration.trim() || `${qeCategory} — ${qePartyName.trim() || 'Mandi Counter'}`,
        lines:
          qeDirection === 'INFLOW'
            ? [
                {
                  accountCode: '1001',
                  partyId: null,
                  debitPaise: amountPaise,
                  creditPaise: 0,
                  lineNote: 'Cash Inflow (1001)',
                },
                {
                  accountCode: '4001',
                  partyId: null,
                  debitPaise: 0,
                  creditPaise: amountPaise,
                  lineNote: qeCategory.trim() || 'Quick Cash Inflow',
                },
              ]
            : [
                {
                  accountCode: '5004',
                  partyId: null,
                  debitPaise: amountPaise,
                  creditPaise: 0,
                  lineNote: qeCategory.trim() || 'Quick Cash Outflow',
                },
                {
                  accountCode: '1001',
                  partyId: null,
                  debitPaise: 0,
                  creditPaise: amountPaise,
                  lineNote: 'Cash Outflow (1001)',
                },
              ],
      });
      setActiveModal('NONE');
      setQeAmountRs('');
      setQePartyName('');
      setQeNarration('');
      showToast(
        `Quick ${qeDirection === 'INFLOW' ? 'Receipt' : 'Outflow'} of ₹${(amountPaise / 100).toFixed(2)} posted.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post quick entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    if (!contactName.trim() || !contactPhone.trim()) {
      setErrorMsg('Contact Name and Phone Number are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onRegisterParty({
        partyType: contactType,
        name: contactName.trim(),
        phone: contactPhone.trim(),
        villageCity: contactVillage.trim() || 'Ranebennur',
        gstin: contactGstin.trim() || undefined,
        openingBalancePaise: 0,
        openingBalanceType: 'DR',
        openingBalanceDate: businessDate,
      });
      setActiveModal('NONE');
      setContactName('');
      setContactPhone('');
      setContactGstin('');
      showToast(`Registered ${contactName.trim()} (${contactType}) in Party Master.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveStockAction = async (e: React.FormEvent, direction: 'GOODS_IN' | 'GOODS_OUT') => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    if (!stkCommodityId) {
      setErrorMsg('Please select a commodity.');
      return;
    }
    const bags = Number(stkBags || 0);
    const weightQ = Number(stkWeightQ || 0);
    if (bags <= 0 || weightQ <= 0) {
      setErrorMsg('Bags and Weight (Q) must be greater than 0.');
      return;
    }
    const party = parties.find((p) => p.id === stkPartyId);
    const resolvedPartyName = party ? party.name : stkPartyName.trim();
    if (!resolvedPartyName) {
      setErrorMsg('Please select or enter a party name.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onRecordMovement({
        commodityId: stkCommodityId,
        transactionDate: stkDate,
        direction,
        ownershipType: stkOwnership,
        bags,
        weightGrams: convertWeightToGrams(weightQ, WeightUnit.QUINTAL),
        ratePerQuintalPaise: rupeesToPaise(stkRateRs || '0'),
        partyId: party?.id,
        partyName: resolvedPartyName,
        settlementMode: stkSettlement,
        reason:
          stkReason.trim() ||
          (direction === 'GOODS_IN' ? 'Quick New Arrival Entry' : 'Quick Sale Dispatch'),
      });
      setActiveModal('NONE');
      setStkBags('');
      setStkWeightQ('');
      setStkRateRs('');
      setStkPartyId('');
      setStkPartyName('');
      setStkReason('');
      showToast(
        `${direction === 'GOODS_IN' ? 'New Arrival' : 'New Sale'} (${weightQ.toFixed(2)} Q, ${bags} bags) recorded.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record stock movement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickActions: Array<{
    mode: QuickModalMode;
    label: string;
    icon: React.ReactNode;
    iconBg: string;
  }> = [
    {
      mode: 'ADD_PAYMENT',
      label: 'Add Payment',
      icon: <CreditCard className="w-4 h-4 text-emerald-600" />,
      iconBg: 'bg-emerald-50 border-emerald-200/80',
    },
    {
      mode: 'QUICK_ENTRY',
      label: 'Quick Entry',
      icon: <Zap className="w-4 h-4 text-orange-600" />,
      iconBg: 'bg-orange-50 border-orange-200/80',
    },
    {
      mode: 'ADD_CONTACT',
      label: 'Add Contact',
      icon: <UserPlus className="w-4 h-4 text-blue-600" />,
      iconBg: 'bg-blue-50 border-blue-200/80',
    },
    {
      mode: 'NEW_ARRIVAL',
      label: 'New Arrival',
      icon: <PackagePlus className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-200/80',
    },
    {
      mode: 'NEW_SALE',
      label: 'New Sale',
      icon: <ShoppingBag className="w-4 h-4 text-purple-600" />,
      iconBg: 'bg-purple-50 border-purple-200/80',
    },
  ];

  return (
    <>
      {toastMsg && (
        <div className="fixed bottom-24 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Persistent Floating Action Button & Expanded 5-Item Menu (Section C, Page 9) */}
      <div
        ref={containerRef}
        className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5 print:hidden"
      >
        {isOpen && (
          <div className="flex flex-col items-end gap-2 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {quickActions.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => selectAction(item.mode)}
                className="group flex items-center gap-3 pl-4 pr-2.5 py-2 rounded-2xl bg-white/95 hover:bg-white border border-slate-200/90 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              >
                <span className="text-xs font-extrabold text-slate-800 group-hover:text-orange-600 whitespace-nowrap">
                  {item.label}
                </span>
                <span
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center ${item.iconBg}`}
                >
                  {item.icon}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Floating Quick Action Menu"
          aria-expanded={isOpen}
          className={`w-14 h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center transition-all cursor-pointer ${
            isOpen ? 'rotate-45 bg-slate-900 hover:bg-slate-800 shadow-slate-900/25' : ''
          }`}
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* Modal 1: Add Payment */}
      {activeModal === 'ADD_PAYMENT' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs print:hidden"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Quick Add Payment</h3>
                <p className="text-xs text-slate-500">
                  Updates Party Ledger & Cash/Bank Book once
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Registered Party</label>
                <select
                  value={payPartyId}
                  onChange={(e) => {
                    setPayPartyId(e.target.value);
                    const p = parties.find((pt) => pt.id === e.target.value);
                    if (p) setPayPayeeName(p.name);
                  }}
                  className="apple-input w-full"
                >
                  <option value="">-- Custom / Walk-in Payee --</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.partyType})
                    </option>
                  ))}
                </select>
              </div>
              {!payPartyId && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payee Name *</label>
                  <input
                    type="text"
                    required
                    value={payPayeeName}
                    onChange={(e) => setPayPayeeName(e.target.value)}
                    placeholder="Enter payee name"
                    className="apple-input w-full"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={payAmountRs}
                    onChange={(e) => setPayAmountRs(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mode</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as 'CASH' | 'BANK')}
                    className="apple-input w-full"
                  >
                    <option value="CASH">Cash (1001)</option>
                    <option value="BANK">Bank (1002)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={payNarration}
                    onChange={(e) => setPayNarration(e.target.value)}
                    placeholder="Voucher narration"
                    className="apple-input w-full"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal('NONE');
                    onNavigateSection('operations_reports');
                  }}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  Open Full Payments Module →
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick Entry */}
      {activeModal === 'QUICK_ENTRY' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs print:hidden"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Quick Cashbook Entry</h3>
                <p className="text-xs text-slate-500">
                  Instant Mandi Cash Inflow or Operational Outflow
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleSaveQuickEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Entry Type</label>
                  <select
                    value={qeDirection}
                    onChange={(e) => setQeDirection(e.target.value as 'INFLOW' | 'OUTFLOW')}
                    className="apple-input w-full"
                  >
                    <option value="OUTFLOW">Cash Outflow / Expense</option>
                    <option value="INFLOW">Cash Inflow / Receipt</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={qeAmountRs}
                    onChange={(e) => setQeAmountRs(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Counterparty</label>
                  <input
                    type="text"
                    value={qePartyName}
                    onChange={(e) => setQePartyName(e.target.value)}
                    placeholder="e.g. Hamali Team"
                    className="apple-input w-full"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={qeDate}
                    onChange={(e) => setQeDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Category / Narration</label>
                <input
                  type="text"
                  value={qeNarration}
                  onChange={(e) => setQeNarration(e.target.value)}
                  placeholder="Enter narration"
                  className="apple-input w-full"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Post Quick Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Add Contact */}
      {activeModal === 'ADD_CONTACT' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs print:hidden"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Quick Add Contact</h3>
                <p className="text-xs text-slate-500">
                  Register Farmer, Buyer, or Supplier in Khata Master
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleSaveContact} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Type</label>
                <select
                  value={contactType}
                  onChange={(e) => setContactType(e.target.value as PartyType)}
                  className="apple-input w-full"
                >
                  <option value="FARMER">Farmer (ರೈತರು)</option>
                  <option value="BUYER">Registered Buyer (ಖರೀದಿದಾರರು)</option>
                  <option value="SUPPLIER">Supplier / Trader</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter full name"
                  className="apple-input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Village / City</label>
                  <input
                    type="text"
                    value={contactVillage}
                    onChange={(e) => setContactVillage(e.target.value)}
                    className="apple-input w-full"
                  />
                </div>
              </div>
              {contactType !== 'FARMER' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={contactGstin}
                    onChange={(e) => setContactGstin(e.target.value.toUpperCase())}
                    placeholder="29XXXXX0000X1Z5"
                    className="apple-input w-full font-mono"
                  />
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal('NONE');
                    onNavigateSection('khata');
                  }}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  Open Khata Master →
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4 & 5: New Arrival / New Sale */}
      {(activeModal === 'NEW_ARRIVAL' || activeModal === 'NEW_SALE') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs print:hidden"
          onClick={() => setActiveModal('NONE')}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {activeModal === 'NEW_ARRIVAL'
                    ? 'New Commodity Arrival (Goods In)'
                    : 'New Commodity Sale (Goods Out)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Updates Stock Ledger, Party Khata & Cash/Bank atomically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                {errorMsg}
              </div>
            )}
            <form
              onSubmit={(e) =>
                handleSaveStockAction(
                  e,
                  activeModal === 'NEW_ARRIVAL' ? 'GOODS_IN' : 'GOODS_OUT'
                )
              }
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commodity *</label>
                  <select
                    value={stkCommodityId}
                    onChange={(e) => setStkCommodityId(e.target.value)}
                    className="apple-input w-full"
                  >
                    {stockStatuses.map((s) => (
                      <option key={s.commodity.id} value={s.commodity.id}>
                        {s.commodity.nameEn} ({s.closingOwnedWeightQuintals.toFixed(2)} Q)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ownership</label>
                  <select
                    value={stkOwnership}
                    onChange={(e) => setStkOwnership(e.target.value as StockOwnershipType)}
                    className="apple-input w-full"
                  >
                    <option value="SGT_OWNED">Direct Purchase / SGT Owned</option>
                    <option value="FARMER_AGENCY">Farmer / Supplier Commission</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Registered Party</label>
                  <select
                    value={stkPartyId}
                    onChange={(e) => {
                      setStkPartyId(e.target.value);
                      const found = parties.find((p) => p.id === e.target.value);
                      if (found) setStkPartyName(found.name);
                    }}
                    className="apple-input w-full"
                  >
                    <option value="">-- Custom Party Name --</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.partyType})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Party Name *</label>
                  <input
                    type="text"
                    required
                    value={stkPartyName}
                    onChange={(e) => setStkPartyName(e.target.value)}
                    placeholder="Farmer / Buyer name"
                    className="apple-input w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bags *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={stkBags}
                    onChange={(e) => setStkBags(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Weight (Q) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={stkWeightQ}
                    onChange={(e) => setStkWeightQ(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rate / Q (₹) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={stkRateRs}
                    onChange={(e) => setStkRateRs(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Settlement Mode</label>
                  <select
                    value={stkSettlement}
                    onChange={(e) =>
                      setStkSettlement(e.target.value as 'CREDIT' | 'CASH' | 'BANK')
                    }
                    className="apple-input w-full"
                  >
                    <option value="CREDIT">Credit (Udhaar)</option>
                    <option value="CASH">Cash (1001)</option>
                    <option value="BANK">Bank (1002)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={stkDate}
                    onChange={(e) => setStkDate(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal('NONE');
                    onNavigateSection('pattis');
                  }}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  Open Full Patti & Billing Form →
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : activeModal === 'NEW_ARRIVAL'
                    ? 'Record Arrival'
                    : 'Record Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

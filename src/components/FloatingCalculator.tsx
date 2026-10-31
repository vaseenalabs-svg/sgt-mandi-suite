import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Delete,
  History,
  Info,
  Percent,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  CompanySettings,
  DayCountConvention,
  InterestCalculationResult,
  InterestMethod,
  RateUnit,
  RepaymentAllocationOrder,
  RepaymentEventInput,
  RoundingMode,
} from '../shared/types';
import {
  calculateInterest,
  formatDateDDMMYYYY,
  formatINR,
  rupeesToPaise,
} from '../shared/math';
import { LanguageCode, t } from '../shared/i18n';

interface FloatingCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  lang: LanguageCode;
  settings: CompanySettings;
}

interface CalcTapeItem {
  expression: string;
  result: string;
  timestamp: string;
}

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({
  isOpen,
  onClose,
  lang,
  settings,
}) => {
  const todayStr = getTodayIST();
  const [activeTab, setActiveTab] = useState<'standard' | 'interest'>('interest');

  // Standard calculator state (starts completely clean with empty tape)
  const [display, setDisplay] = useState<string>('0');
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);
  const [historyTape, setHistoryTape] = useState<CalcTapeItem[]>([]);

  // Interest calculator state (AT-04 & SRS Sec 15.2) — initialized from configured settings without hardcoded demo amounts
  const [principalInput, setPrincipalInput] = useState<string>('');
  const [rateInput, setRateInput] = useState<string>(
    String((settings.interestPolicy.defaultRateBps || 0) / 100)
  );
  const [rateUnit, setRateUnit] = useState<RateUnit>(
    settings.interestPolicy.defaultRateUnit || RateUnit.YEARLY
  );
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [method, setMethod] = useState<InterestMethod>(
    settings.interestPolicy.defaultMethod || InterestMethod.SIMPLE
  );
  const [dayCount, setDayCount] = useState<DayCountConvention>(
    settings.interestPolicy.dayCountConvention || DayCountConvention.ACT_365
  );
  const [allocationOrder, setAllocationOrder] = useState<RepaymentAllocationOrder>(
    settings.interestPolicy.repaymentAllocationOrder || RepaymentAllocationOrder.PRINCIPAL_FIRST
  );
  const [roundingMode, setRoundingMode] = useState<RoundingMode>(
    settings.interestPolicy.roundingMode || RoundingMode.NEAREST_RUPEE
  );
  const [repayments, setRepayments] = useState<
    Array<{ id: string; date: string; amountRupees: string; note: string }>
  >([]);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Sync defaults when settings change
  useEffect(() => {
    setRateInput(String((settings.interestPolicy.defaultRateBps || 0) / 100));
    setRateUnit(settings.interestPolicy.defaultRateUnit);
    setMethod(settings.interestPolicy.defaultMethod);
    setDayCount(settings.interestPolicy.dayCountConvention);
    setAllocationOrder(settings.interestPolicy.repaymentAllocationOrder);
    setRoundingMode(settings.interestPolicy.roundingMode);
  }, [settings]);

  // Compute live interest result safely when user enters a positive principal
  let interestResult: InterestCalculationResult | null = null;
  let computeError: string | null = null;
  const hasPrincipal = principalInput.trim() !== '' && Number(principalInput) > 0;

  if (hasPrincipal) {
    try {
      const principalPaise = rupeesToPaise(principalInput);
      const parsedRepayments: RepaymentEventInput[] = repayments
        .filter((r) => r.amountRupees.trim() !== '' && Number(r.amountRupees) > 0)
        .map((r) => ({
          date: r.date,
          amountPaise: rupeesToPaise(r.amountRupees),
          note: r.note,
        }));

      interestResult = calculateInterest({
        principalPaise,
        ratePercentage: Number(rateInput || 0),
        rateUnit,
        startDate,
        endDate,
        method,
        dayCountConvention: dayCount,
        repaymentAllocationOrder: allocationOrder,
        roundingMode,
        repayments: parsedRepayments,
      });
    } catch (err) {
      computeError = err instanceof Error ? err.message : 'Invalid calculation inputs';
    }
  }

  if (!isOpen) return null;

  // Standard calculator handlers
  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clearAll = () => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOp(null);
    setWaitingForOperand(false);
  };

  const backspace = () => {
    if (waitingForOperand) return;
    setDisplay(display.length > 1 ? display.slice(0, -1) : '0');
  };

  const applyPercentage = () => {
    const current = parseFloat(display);
    if (isNaN(current)) return;
    const base = storedValue !== null ? (storedValue * current) / 100 : current / 100;
    const formatted = Number(base.toFixed(4)).toString();
    setDisplay(formatted);
  };

  const performOperation = (nextOp: string) => {
    const inputValue = parseFloat(display);
    if (storedValue === null) {
      setStoredValue(inputValue);
    } else if (pendingOp) {
      const currentVal = storedValue || 0;
      let newVal = currentVal;
      if (pendingOp === '+') newVal = currentVal + inputValue;
      else if (pendingOp === '-') newVal = currentVal - inputValue;
      else if (pendingOp === '×') newVal = currentVal * inputValue;
      else if (pendingOp === '÷') newVal = inputValue !== 0 ? currentVal / inputValue : 0;

      const roundedVal = Number(newVal.toFixed(4));
      setStoredValue(roundedVal);
      setDisplay(String(roundedVal));

      if (nextOp === '=') {
        setHistoryTape((prev) => [
          {
            expression: `${currentVal.toLocaleString('en-IN')} ${pendingOp} ${inputValue.toLocaleString('en-IN')}`,
            result: roundedVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
            timestamp: new Date().toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
          ...prev.slice(0, 14),
        ]);
        setStoredValue(null);
        setPendingOp(null);
        setWaitingForOperand(true);
        return;
      }
    }
    setWaitingForOperand(true);
    setPendingOp(nextOp === '=' ? null : nextOp);
  };

  const addRepaymentRow = () => {
    setRepayments((prev) => [
      ...prev,
      {
        id: `rep-${Date.now()}`,
        date: endDate,
        amountRupees: '',
        note: '',
      },
    ]);
  };

  const removeRepaymentRow = (id: string) => {
    setRepayments((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="fixed inset-y-4 right-4 z-50 w-full max-w-xl glass-panel rounded-3xl flex flex-col overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200/70 bg-white/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t(lang, 'calculatorTitle')}
            </h2>
            <p className="text-xs text-slate-500">
              SRS Section 15.1 & 15.2 · Persistent Desk Utility
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 transition-colors"
          aria-label="Close calculator"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Non-posting safeguard banner */}
      <div className="px-6 py-2.5 bg-sky-50/90 border-b border-sky-100 flex items-center gap-2.5 text-xs text-sky-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0" />
        <span>{t(lang, 'nonPostingNotice')}</span>
      </div>

      {/* Segmented Control */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/65 rounded-xl">
          <button
            onClick={() => setActiveTab('interest')}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'interest'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'interestCalcTab')} (AT-04)
          </button>
          <button
            onClick={() => setActiveTab('standard')}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'standard'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'standardCalcTab')}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {activeTab === 'interest' ? (
          <div className="space-y-4">
            {/* Primary Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'principalLabel')}
                </label>
                <input
                  type="number"
                  min="1"
                  step="100"
                  placeholder="Enter principal (₹)"
                  value={principalInput}
                  onChange={(e) => {
                    setPrincipalInput(e.target.value);
                    setCalcError(null);
                  }}
                  className="apple-input w-full font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t(lang, 'rateLabel')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="Rate"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="apple-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t(lang, 'rateUnitLabel')}
                  </label>
                  <select
                    value={rateUnit}
                    onChange={(e) => setRateUnit(e.target.value as RateUnit)}
                    className="apple-input w-full"
                  >
                    <option value={RateUnit.YEARLY}>Yearly (% p.a.)</option>
                    <option value={RateUnit.MONTHLY}>Monthly (% p.m.)</option>
                    <option value={RateUnit.DAILY}>Daily (% / day)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'startDateLabel')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="apple-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'endDateLabel')}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="apple-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'methodLabel')}
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as InterestMethod)}
                  className="apple-input w-full"
                >
                  <option value={InterestMethod.SIMPLE}>{t(lang, 'simpleInterest')}</option>
                  <option value={InterestMethod.COMPOUND}>{t(lang, 'compoundInterest')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'dayCountLabel')}
                </label>
                <select
                  value={dayCount}
                  onChange={(e) => setDayCount(e.target.value as DayCountConvention)}
                  className="apple-input w-full"
                >
                  <option value={DayCountConvention.ACT_365}>Actual / 365 Days</option>
                  <option value={DayCountConvention.ACT_360}>Actual / 360 Days</option>
                  <option value={DayCountConvention.THIRTY_360}>30 / 360 Equal Months</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'allocationOrderLabel')}
                </label>
                <select
                  value={allocationOrder}
                  onChange={(e) => setAllocationOrder(e.target.value as RepaymentAllocationOrder)}
                  className="apple-input w-full"
                >
                  <option value={RepaymentAllocationOrder.PRINCIPAL_FIRST}>
                    {t(lang, 'principalFirst')}
                  </option>
                  <option value={RepaymentAllocationOrder.INTEREST_FIRST}>
                    {t(lang, 'interestFirst')}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rounding Policy
                </label>
                <select
                  value={roundingMode}
                  onChange={(e) => setRoundingMode(e.target.value as RoundingMode)}
                  className="apple-input w-full"
                >
                  <option value={RoundingMode.NEAREST_RUPEE}>Nearest ₹1.00</option>
                  <option value={RoundingMode.EXACT_PAISE}>Exact Paise (2 Decimals)</option>
                  <option value={RoundingMode.UP_RUPEE}>Round Up to ₹1.00</option>
                  <option value={RoundingMode.DOWN_RUPEE}>Round Down to ₹1.00</option>
                </select>
              </div>
            </div>

            {/* Optional Interim Repayments */}
            <div className="glass-subtle rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Interim Repayments / Partial Recoveries ({repayments.length})
                </span>
                <button
                  type="button"
                  onClick={addRepaymentRow}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Repayment Date
                </button>
              </div>

              {repayments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No interim repayments added. Calculating single uninterrupted period.
                </p>
              ) : (
                <div className="space-y-2">
                  {repayments.map((rep, idx) => (
                    <div key={rep.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="date"
                          value={rep.date}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRepayments((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, date: val } : item))
                            );
                          }}
                          className="apple-input w-full text-xs py-1.5 px-2.5 font-mono"
                        />
                      </div>
                      <div className="col-span-5">
                        <input
                          type="number"
                          placeholder="Amount (₹)"
                          value={rep.amountRupees}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRepayments((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, amountRupees: val } : item
                              )
                            );
                          }}
                          className="apple-input w-full text-xs py-1.5 px-2.5 font-mono"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeRepaymentRow(rep.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="Remove repayment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Result Summary & Breakdown */}
            {!hasPrincipal ? (
              <div className="glass-subtle rounded-2xl p-6 text-center space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  Enter Loan Principal & Period Above
                </div>
                <p className="text-xs text-slate-500">
                  Type any principal amount (₹), interest rate, and date range to preview exact
                  paise-level interest accrual without writing to any ledger.
                </p>
              </div>
            ) : computeError || calcError ? (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-200 text-xs text-rose-700">
                {computeError || calcError}
              </div>
            ) : interestResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-subtle rounded-2xl p-3.5">
                    <div className="text-xs text-slate-500">{t(lang, 'totalDuration')}</div>
                    <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                      {interestResult.totalDays} days
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {formatDateDDMMYYYY(startDate)} → {formatDateDDMMYYYY(endDate)}
                    </div>
                  </div>

                  <div className="glass-subtle rounded-2xl p-3.5">
                    <div className="text-xs text-slate-500">{t(lang, 'interestAccrued')}</div>
                    <div className="mt-1 text-lg font-bold font-mono text-blue-600">
                      {formatINR(interestResult.roundedInterestPaise)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      Exact: {formatINR(interestResult.rawInterestPaise)}
                    </div>
                  </div>

                  <div className="glass-subtle rounded-2xl p-3.5">
                    <div className="text-xs text-slate-500">{t(lang, 'closingBalance')}</div>
                    <div className="mt-1 text-lg font-bold font-mono text-emerald-700">
                      {formatINR(interestResult.totalOutstandingPaise)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      P: {formatINR(interestResult.closingPrincipalOutstandingPaise, false)} · I:{' '}
                      {formatINR(interestResult.closingInterestOutstandingPaise, false)}
                    </div>
                  </div>
                </div>

                {/* Segment-by-Segment Breakdown Table (SRS Sec 5.2 & AT-04) */}
                <div className="glass-subtle rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200/70 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Period-by-Period Calculation Breakdown
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {interestResult.policySummary}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                          <th className="py-2 px-3 font-medium">Period</th>
                          <th className="py-2 px-2 font-medium text-right">Days</th>
                          <th className="py-2 px-3 font-medium text-right">Opening Principal</th>
                          <th className="py-2 px-3 font-medium text-right">Interest Accrued</th>
                          <th className="py-2 px-3 font-medium text-right">Repayment Split</th>
                          <th className="py-2 px-3 font-medium text-right">Closing P + I</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50 font-mono">
                        {interestResult.segments.map((seg) => (
                          <tr key={seg.segmentIndex} className="hover:bg-white/60">
                            <td className="py-2.5 px-3 font-sans text-[11px] text-slate-700 whitespace-nowrap">
                              {formatDateDDMMYYYY(seg.fromDate)} → {formatDateDDMMYYYY(seg.toDate)}
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-700">{seg.days}d</td>
                            <td className="py-2.5 px-3 text-right text-slate-900">
                              {formatINR(seg.openingPrincipalPaise)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-blue-600">
                              +{formatINR(seg.interestAccruedInSegmentPaise)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700">
                              {seg.repaymentAmountPaise > 0 ? (
                                <div>
                                  <div className="text-emerald-700 font-semibold">
                                    -{formatINR(seg.repaymentAmountPaise)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    P:{formatINR(seg.allocatedToPrincipalPaise, false)} / I:
                                    {formatINR(seg.allocatedToInterestPaise, false)}
                                  </div>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                              {formatINR(
                                seg.closingPrincipalPaise + seg.closingUnpaidInterestPaise
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          /* Standard Desk Keypad Calculator (SRS Sec 15.1) */
          <div className="space-y-4">
            <div className="glass-subtle rounded-2xl p-4 text-right">
              <div className="text-xs text-slate-400 font-mono h-4">
                {storedValue !== null && pendingOp
                  ? `${storedValue.toLocaleString('en-IN')} ${pendingOp}`
                  : 'Standard Arithmetic'}
              </div>
              <div className="text-3xl font-bold font-mono text-slate-900 tracking-tight truncate mt-1">
                {display}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              <button
                onClick={clearAll}
                className="py-3 rounded-xl bg-rose-500/10 text-rose-700 font-semibold text-sm hover:bg-rose-500/15 transition-colors flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-4 h-4" /> AC
              </button>
              <button
                onClick={backspace}
                className="py-3 rounded-xl bg-slate-200/70 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={applyPercentage}
                className="py-3 rounded-xl bg-slate-200/70 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center"
              >
                <Percent className="w-4 h-4" />
              </button>
              <button
                onClick={() => performOperation('÷')}
                className="py-3 rounded-xl bg-blue-600/10 text-blue-700 font-bold text-base hover:bg-blue-600/20 transition-colors"
              >
                ÷
              </button>

              {['7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => inputDigit(d)}
                  className="py-3 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-mono font-semibold text-base hover:bg-slate-50 shadow-2xs transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => performOperation('×')}
                className="py-3 rounded-xl bg-blue-600/10 text-blue-700 font-bold text-base hover:bg-blue-600/20 transition-colors"
              >
                ×
              </button>

              {['4', '5', '6'].map((d) => (
                <button
                  key={d}
                  onClick={() => inputDigit(d)}
                  className="py-3 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-mono font-semibold text-base hover:bg-slate-50 shadow-2xs transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => performOperation('-')}
                className="py-3 rounded-xl bg-blue-600/10 text-blue-700 font-bold text-base hover:bg-blue-600/20 transition-colors"
              >
                −
              </button>

              {['1', '2', '3'].map((d) => (
                <button
                  key={d}
                  onClick={() => inputDigit(d)}
                  className="py-3 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-mono font-semibold text-base hover:bg-slate-50 shadow-2xs transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => performOperation('+')}
                className="py-3 rounded-xl bg-blue-600/10 text-blue-700 font-bold text-base hover:bg-blue-600/20 transition-colors"
              >
                +
              </button>

              <button
                onClick={() => inputDigit('0')}
                className="col-span-2 py-3 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-mono font-semibold text-base hover:bg-slate-50 shadow-2xs transition-colors"
              >
                0
              </button>
              <button
                onClick={inputDecimal}
                className="py-3 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-mono font-semibold text-base hover:bg-slate-50 shadow-2xs transition-colors"
              >
                .
              </button>
              <button
                onClick={() => performOperation('=')}
                className="py-3 rounded-xl bg-blue-600 text-white font-bold text-base hover:bg-blue-500 shadow-sm transition-colors"
              >
                =
              </button>
            </div>

            {/* Calculation Tape / History */}
            <div className="glass-subtle rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <History className="w-3.5 h-3.5" /> Calculation History Tape
                </span>
                <button
                  onClick={() => setHistoryTape([])}
                  className="text-slate-400 hover:text-slate-700"
                >
                  Clear Tape
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-200/50 text-xs font-mono">
                {historyTape.length === 0 ? (
                  <p className="py-2 text-slate-400 font-sans">No calculations recorded yet.</p>
                ) : (
                  historyTape.map((item, i) => (
                    <div key={i} className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-600">{item.expression}</span>
                      <span className="font-semibold text-slate-900">= {item.result}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import {
  DayCountConvention,
  InterestCalculationInput,
  InterestCalculationResult,
  InterestMethod,
  InterestSegmentBreakdown,
  RateUnit,
  RepaymentAllocationOrder,
  RoundingMode,
  WeightUnit,
} from './types';

/**
 * Converts a decimal rupee value (number or string) to integer paise safely without IEEE-754 drift.
 */
export function rupeesToPaise(rupees: number | string): number {
  const cleaned = String(rupees).replace(/,/g, '').trim();
  if (!cleaned || isNaN(Number(cleaned))) {
    throw new Error(`Invalid rupee amount: "${rupees}"`);
  }
  const isNegative = cleaned.startsWith('-');
  const absStr = isNegative ? cleaned.slice(1) : cleaned;
  const [wholePart = '0', fracPart = ''] = absStr.split('.');
  const paddedFrac = (fracPart + '000').slice(0, 3);
  const twoDigits = Number(paddedFrac.slice(0, 2));
  const thirdDigit = Number(paddedFrac.slice(2, 3));
  const roundedFrac = thirdDigit >= 5 ? twoDigits + 1 : twoDigits;
  const totalPaise = Number(wholePart) * 100 + roundedFrac;
  return isNegative ? -totalPaise : totalPaise;
}

/**
 * Converts integer paise to decimal rupee number (for display/inputs).
 */
export function paiseToRupees(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Applies configurable SGT rounding rules to an integer paise value.
 */
export function applyRounding(paise: number, mode: RoundingMode): number {
  const safePaise = Math.round(paise);
  switch (mode) {
    case RoundingMode.EXACT_PAISE:
      return safePaise;
    case RoundingMode.NEAREST_RUPEE: {
      const sign = safePaise < 0 ? -1 : 1;
      const abs = Math.abs(safePaise);
      const rem = abs % 100;
      const roundedAbs = rem >= 50 ? abs + (100 - rem) : abs - rem;
      return sign * roundedAbs;
    }
    case RoundingMode.UP_RUPEE: {
      const rem = safePaise % 100;
      if (rem === 0) return safePaise;
      return safePaise > 0 ? safePaise + (100 - rem) : safePaise - rem;
    }
    case RoundingMode.DOWN_RUPEE: {
      const rem = safePaise % 100;
      return safePaise - rem;
    }
    default:
      return safePaise;
  }
}

/**
 * Formats integer paise in Indian numbering format (₹12,34,567.89).
 */
export function formatINR(paise: number, showDecimals = true): string {
  const safePaise = Number.isFinite(paise) ? Math.round(paise) : 0;
  const isNegative = safePaise < 0;
  const absRupees = Math.abs(safePaise) / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(absRupees);
  return isNegative ? `-${formatted}` : formatted;
}

export const formatPaiseToRupees = formatINR;

/**
 * Formats YYYY-MM-DD or ISO timestamp to India standard DD-MM-YYYY.
 */
export function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const ONES_WORDS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS_WORDS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitToWords(n: number): string {
  if (n <= 0) return '';
  if (n < 20) return ONES_WORDS[n];
  const tens = Math.floor(n / 10);
  const rem = n % 10;
  return rem > 0 ? `${TENS_WORDS[tens]}-${ONES_WORDS[rem]}` : TENS_WORDS[tens];
}

function threeDigitToWords(n: number): string {
  if (n <= 0) return '';
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(`${ONES_WORDS[hundreds]} Hundred`);
  }
  if (rem > 0) {
    parts.push(twoDigitToWords(rem));
  }
  return parts.join(' ');
}

/**
 * Converts integer paise into Indian numbering words (Crores, Lakhs, Thousands, Hundreds)
 * for printable Cash/Credit Bills and Pattis (SRS Section 9.2).
 */
export function paiseToIndianWords(paise: number): string {
  const safePaise = Number.isFinite(paise) ? Math.max(0, Math.round(paise)) : 0;
  const rupees = Math.floor(safePaise / 100);
  const remPaise = safePaise % 100;

  if (rupees === 0 && remPaise === 0) {
    return 'Rupees Zero Only';
  }

  const parts: string[] = [];
  let n = rupees;

  const crores = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  if (crores > 0) {
    parts.push(`${threeDigitToWords(crores)} Crore`);
  }

  const lakhs = Math.floor(n / 100_000);
  n %= 100_000;
  if (lakhs > 0) {
    parts.push(`${twoDigitToWords(lakhs)} Lakh`);
  }

  const thousands = Math.floor(n / 1_000);
  n %= 1_000;
  if (thousands > 0) {
    parts.push(`${twoDigitToWords(thousands)} Thousand`);
  }

  if (n > 0) {
    parts.push(threeDigitToWords(n));
  }

  const rupeeStr = parts.length > 0 ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  if (remPaise > 0) {
    return `${rupeeStr} and ${twoDigitToWords(remPaise)} Paise Only`;
  }
  return `${rupeeStr} Only`;
}

/**
 * Masks sensitive bank account or government ID numbers on normal screens.
 * Example: "123456789012" -> "XXXX-XXXX-9012"
 */
export function maskSensitiveValue(raw: string | null | undefined, visibleTail = 4): string {
  if (!raw) return '—';
  const cleaned = String(raw).trim();
  if (cleaned.length <= visibleTail) return 'XXXX';
  const tail = cleaned.slice(-visibleTail);
  return `XXXX-XXXX-${tail}`;
}

/**
 * Converts a quantity in a given unit to integer grams.
 * Note: For BAG, an explicit bagWeightKg is required (SRS Sec 6.1: never assume uniform bag weight).
 */
export function convertWeightToGrams(
  quantity: number,
  unit: WeightUnit,
  bagWeightKg?: number | null
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Weight quantity must be a non-negative number');
  }
  switch (unit) {
    case WeightUnit.GRAM:
      return Math.round(quantity);
    case WeightUnit.KG:
      return Math.round(quantity * 1_000);
    case WeightUnit.QUINTAL:
      return Math.round(quantity * 100_000);
    case WeightUnit.TONNE:
      return Math.round(quantity * 1_000_000);
    case WeightUnit.BAG:
      if (!bagWeightKg || bagWeightKg <= 0) {
        throw new Error(
          'Explicit bag weight (kg) is required to convert bags to weight; SGT policy prohibits assuming a fixed bag weight.'
        );
      }
      return Math.round(quantity * bagWeightKg * 1_000);
    default:
      throw new Error(`Unsupported weight unit: ${unit}`);
  }
}

/**
 * Converts integer grams to target weight unit with 3 decimal precision.
 */
export function convertGramsToUnit(
  grams: number,
  targetUnit: WeightUnit,
  bagWeightKg?: number | null
): number {
  switch (targetUnit) {
    case WeightUnit.GRAM:
      return Math.round(grams);
    case WeightUnit.KG:
      return Number((grams / 1_000).toFixed(3));
    case WeightUnit.QUINTAL:
      return Number((grams / 100_000).toFixed(4));
    case WeightUnit.TONNE:
      return Number((grams / 1_000_000).toFixed(4));
    case WeightUnit.BAG:
      if (!bagWeightKg || bagWeightKg <= 0) {
        throw new Error('Explicit bag weight (kg) is required to convert grams into bags.');
      }
      return Number((grams / (bagWeightKg * 1_000)).toFixed(2));
    default:
      throw new Error(`Unsupported target unit: ${targetUnit}`);
  }
}

/**
 * Calculates exact day count between two YYYY-MM-DD dates according to convention.
 */
export function calculateDaysBetween(
  startDate: string,
  endDate: string,
  convention: DayCountConvention
): number {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid start or end date format (expected YYYY-MM-DD)');
  }
  if (end.getTime() < start.getTime()) {
    throw new Error('End date cannot be earlier than start date');
  }

  if (convention === DayCountConvention.THIRTY_360) {
    const y1 = start.getUTCFullYear();
    const m1 = start.getUTCMonth() + 1;
    const d1 = Math.min(30, start.getUTCDate());
    const y2 = end.getUTCFullYear();
    const m2 = end.getUTCMonth() + 1;
    const d2 = d1 === 30 && end.getUTCDate() === 31 ? 30 : Math.min(30, end.getUTCDate());
    return Math.max(0, (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1));
  }

  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Computes interest for a single segment of days in integer paise.
 */
function computeSegmentInterestPaise(
  principalPaise: number,
  days: number,
  ratePercentage: number,
  rateUnit: RateUnit,
  method: InterestMethod,
  convention: DayCountConvention
): number {
  if (principalPaise <= 0 || days <= 0 || ratePercentage <= 0) {
    return 0;
  }

  const yearDays = convention === DayCountConvention.ACT_365 ? 365 : 360;
  const monthDays = convention === DayCountConvention.ACT_365 ? 365 / 12 : 30;

  let dailyRateDecimal: number;
  if (rateUnit === RateUnit.YEARLY) {
    dailyRateDecimal = ratePercentage / 100 / yearDays;
  } else if (rateUnit === RateUnit.MONTHLY) {
    dailyRateDecimal = ratePercentage / 100 / monthDays;
  } else {
    dailyRateDecimal = ratePercentage / 100;
  }

  if (method === InterestMethod.SIMPLE) {
    return Math.round(principalPaise * dailyRateDecimal * days);
  } else {
    // Compound interest (compounded monthly if MONTHLY/YEARLY or daily if DAILY)
    const periodDays = rateUnit === RateUnit.DAILY ? 1 : monthDays;
    const periods = days / periodDays;
    const periodRate = dailyRateDecimal * periodDays;
    const totalAmount = principalPaise * Math.pow(1 + periodRate, periods);
    return Math.round(totalAmount - principalPaise);
  }
}

/**
 * Full reproducible SGT Interest Calculation Engine (satisfies SRS Sec 5.2, 15.2, and AT-04).
 * Never mutates any database ledger (pure calculation with segment-by-segment breakdown).
 */
export function calculateInterest(input: InterestCalculationInput): InterestCalculationResult {
  if (input.principalPaise <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (input.ratePercentage < 0) {
    throw new Error('Interest rate cannot be negative');
  }

  const totalDays = calculateDaysBetween(input.startDate, input.endDate, input.dayCountConvention);
  const graceDays = input.gracePeriodDays ?? 0;

  // Sort valid repayments within [startDate, endDate]
  const sortedRepayments = [...(input.repayments ?? [])]
    .filter((r) => r.amountPaise > 0 && r.date >= input.startDate && r.date <= input.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const segments: InterestSegmentBreakdown[] = [];
  let cursorDate = input.startDate;
  let currentPrincipalPaise = input.principalPaise;
  let currentUnpaidInterestPaise = 0;
  let totalInterestAccruedPaise = 0;
  let totalPrincipalRepaidPaise = 0;
  let totalInterestPaidPaise = 0;

  // If within grace period and totalDays <= graceDays, interest is 0
  const isWithinGrace = graceDays > 0 && totalDays <= graceDays;

  const events: Array<{ date: string; repaymentPaise: number; note?: string }> = [
    ...sortedRepayments.map((r) => ({ date: r.date, repaymentPaise: r.amountPaise, note: r.note })),
    { date: input.endDate, repaymentPaise: 0, note: 'Settlement / Calculation End Date' },
  ];

  let segIdx = 1;
  for (const ev of events) {
    const segDays = calculateDaysBetween(cursorDate, ev.date, input.dayCountConvention);
    if (segDays === 0 && ev.repaymentPaise === 0 && segments.length > 0) {
      continue;
    }

    const openingPrincipal = currentPrincipalPaise;
    const openingUnpaidInterest = currentUnpaidInterestPaise;

    const segInterest = isWithinGrace
      ? 0
      : computeSegmentInterestPaise(
          openingPrincipal,
          segDays,
          input.ratePercentage,
          input.rateUnit,
          input.method,
          input.dayCountConvention
        );

    totalInterestAccruedPaise += segInterest;
    currentUnpaidInterestPaise += segInterest;

    let allocatedPrincipal = 0;
    let allocatedInterest = 0;

    if (ev.repaymentPaise > 0) {
      let remainingRepayment = ev.repaymentPaise;
      if (input.repaymentAllocationOrder === RepaymentAllocationOrder.PRINCIPAL_FIRST) {
        allocatedPrincipal = Math.min(currentPrincipalPaise, remainingRepayment);
        currentPrincipalPaise -= allocatedPrincipal;
        remainingRepayment -= allocatedPrincipal;

        allocatedInterest = Math.min(currentUnpaidInterestPaise, remainingRepayment);
        currentUnpaidInterestPaise -= allocatedInterest;
      } else {
        // INTEREST_FIRST
        allocatedInterest = Math.min(currentUnpaidInterestPaise, remainingRepayment);
        currentUnpaidInterestPaise -= allocatedInterest;
        remainingRepayment -= allocatedInterest;

        allocatedPrincipal = Math.min(currentPrincipalPaise, remainingRepayment);
        currentPrincipalPaise -= allocatedPrincipal;
      }

      totalPrincipalRepaidPaise += allocatedPrincipal;
      totalInterestPaidPaise += allocatedInterest;
    }

    segments.push({
      segmentIndex: segIdx++,
      fromDate: cursorDate,
      toDate: ev.date,
      days: segDays,
      openingPrincipalPaise: openingPrincipal,
      openingUnpaidInterestPaise: openingUnpaidInterest,
      interestAccruedInSegmentPaise: segInterest,
      repaymentAmountPaise: ev.repaymentPaise,
      allocatedToPrincipalPaise: allocatedPrincipal,
      allocatedToInterestPaise: allocatedInterest,
      closingPrincipalPaise: currentPrincipalPaise,
      closingUnpaidInterestPaise: currentUnpaidInterestPaise,
      formulaNote: `${formatINR(openingPrincipal)} × ${input.ratePercentage}% (${input.rateUnit}) for ${segDays}d [${input.dayCountConvention}]`,
    });

    cursorDate = ev.date;
  }

  const roundedInterestPaise = applyRounding(totalInterestAccruedPaise, input.roundingMode);
  const roundingDelta = roundedInterestPaise - totalInterestAccruedPaise;
  const finalInterestOutstanding = Math.max(0, currentUnpaidInterestPaise + roundingDelta);
  const totalOutstanding = currentPrincipalPaise + finalInterestOutstanding;

  return {
    principalPaise: input.principalPaise,
    totalDays,
    rawInterestPaise: totalInterestAccruedPaise,
    roundedInterestPaise,
    totalRepaidPaise: totalPrincipalRepaidPaise + totalInterestPaidPaise,
    principalRepaidPaise: totalPrincipalRepaidPaise,
    interestPaidPaise: totalInterestPaidPaise,
    closingPrincipalOutstandingPaise: currentPrincipalPaise,
    closingInterestOutstandingPaise: finalInterestOutstanding,
    totalOutstandingPaise: totalOutstanding,
    totalPayableWithNoRepaymentsPaise: input.principalPaise + roundedInterestPaise,
    isNonPostingPreview: true,
    policySummary: `${input.method} · ${input.ratePercentage}% ${input.rateUnit} · ${input.dayCountConvention} · ${input.repaymentAllocationOrder.replace('_', ' ')}`,
    segments,
  };
}

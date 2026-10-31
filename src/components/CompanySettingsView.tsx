import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  Percent,
  Save,
  Scale,
  Sliders,
} from 'lucide-react';
import {
  CompanySettings,
  DayCountConvention,
  InterestMethod,
  PermissionKey,
  RateUnit,
  RepaymentAllocationOrder,
  RoundingMode,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatINR } from '../shared/math';
import { LanguageCode, t } from '../shared/i18n';

interface PolicyVersionRecord {
  id: string;
  versionNo: number;
  effectiveFrom: string;
  snapshot: Record<string, unknown>;
  changeReason: string;
  changedBy: string;
  createdAt: string;
}

interface CompanySettingsViewProps {
  settings: CompanySettings;
  policyVersions: PolicyVersionRecord[];
  activeUser: UserProfile;
  lang: LanguageCode;
  onSaveSettings: (
    updates: Partial<CompanySettings>,
    expectedVersion: number,
    reason: string
  ) => Promise<void>;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  settings,
  policyVersions,
  activeUser,
  lang,
  onSaveSettings,
}) => {
  const [formState, setFormState] = useState<CompanySettings>(settings);
  const [auditReason, setAuditReason] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [showAdvancedLabels, setShowAdvancedLabels] = useState<boolean>(false);

  // Sync when settings prop updates
  React.useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const canEditPolicy = activeUser.permissions.includes(PermissionKey.MANAGE_RATES_AND_POLICIES);
  const canEditCompany = activeUser.permissions.includes(PermissionKey.MANAGE_SETTINGS);
  const canSaveAnything = canEditPolicy || canEditCompany;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!auditReason || auditReason.trim().length < 3) {
      setFeedback({
        type: 'error',
        message: 'Please provide an audit reason (minimum 3 characters) to record this change.',
      });
      return;
    }

    setSaving(true);
    try {
      await onSaveSettings(
        {
          legalName: formState.legalName,
          subtitleEn: formState.subtitleEn,
          subtitleKn: formState.subtitleKn,
          address: formState.address,
          villageCity: formState.villageCity,
          stateName: formState.stateName,
          pincode: formState.pincode,
          phonePrimary: formState.phonePrimary,
          phoneSecondary: formState.phoneSecondary,
          gstin: formState.gstin,
          pan: formState.pan,
          currentFinancialYear: formState.currentFinancialYear,
          roundingMode: formState.roundingMode,
          stockValuationMethod: formState.stockValuationMethod,
          interestPolicy: formState.interestPolicy,
          commissionHamaliPolicy: formState.commissionHamaliPolicy,
          customLabels: formState.customLabels,
          approvalThresholds: formState.approvalThresholds,
        },
        settings.version,
        auditReason.trim()
      );
      setAuditReason('');
      setFeedback({
        type: 'success',
        message: `Configuration saved as Policy Version v${settings.version + 1} and recorded in the immutable audit log.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update settings',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Status Banner */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <span>SRS Sections 3, 4.2, 5.2, 15.3 & 24</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Record Version v{settings.version}</span>
            <span aria-hidden="true">·</span>
            <span>Timezone: {settings.timezone}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t(lang, 'companyProfileTitle')} & {t(lang, 'policySettingsTitle')}
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Central single source of truth for SGT bill headers, loan interest rules, commission &
            hamali rates, rounding modes, and bilingual paper-bill terminology.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="glass-subtle rounded-2xl px-4 py-2.5 text-right">
            <div className="text-[11px] text-slate-500">Active Financial Year</div>
            <div className="text-sm font-bold font-mono text-slate-900">
              FY {settings.currentFinancialYear}
            </div>
          </div>
          <div className="glass-subtle rounded-2xl px-4 py-2.5 text-right">
            <div className="text-[11px] text-slate-500">Default Recovery Policy</div>
            <div className="text-sm font-semibold text-blue-600">
              {settings.interestPolicy.repaymentAllocationOrder ===
              RepaymentAllocationOrder.PRINCIPAL_FIRST
                ? 'Principal-First'
                : 'Interest-First'}
            </div>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Company Profile & Configurable Business Rules */}
          <div className="lg:col-span-7 space-y-6">
            {/* Section 1: Legal Bill Header Profile */}
            <div className="glass-panel rounded-3xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    01. {t(lang, 'companyProfileTitle')}
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Applies to all Pattis & Cash/Credit Bills
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Firm Legal Name
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.legalName}
                    onChange={(e) => setFormState({ ...formState, legalName: e.target.value })}
                    className="apple-input w-full font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bill Subtitle (English)
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.subtitleEn}
                    onChange={(e) => setFormState({ ...formState, subtitleEn: e.target.value })}
                    className="apple-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bill Subtitle (ಕನ್ನಡ)
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.subtitleKn}
                    onChange={(e) => setFormState({ ...formState, subtitleKn: e.target.value })}
                    className="apple-input w-full"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Market Yard / Street Address
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.address}
                    onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                    className="apple-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    GSTIN (Central Header)
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.gstin}
                    onChange={(e) =>
                      setFormState({ ...formState, gstin: e.target.value.toUpperCase() })
                    }
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.pan}
                    onChange={(e) =>
                      setFormState({ ...formState, pan: e.target.value.toUpperCase() })
                    }
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Primary Contact Number
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.phonePrimary}
                    onChange={(e) => setFormState({ ...formState, phonePrimary: e.target.value })}
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    City / APMC Region & Pincode
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={formState.villageCity}
                    onChange={(e) => setFormState({ ...formState, villageCity: e.target.value })}
                    className="apple-input w-full"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Loan Interest & Recovery Policy (SRS Sec 5.2 & DR-01) */}
            <div className="glass-panel rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <Percent className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    02. Loan Interest & Settlement Allocation Policy
                  </h2>
                </div>
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEditPolicy}
                    checked={formState.interestPolicy.ownerConfirmed}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          ownerConfirmed: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className={
                      formState.interestPolicy.ownerConfirmed
                        ? 'text-emerald-700 font-medium'
                        : 'text-amber-700 font-medium'
                    }
                  >
                    {formState.interestPolicy.ownerConfirmed
                      ? t(lang, 'confirmedRule')
                      : t(lang, 'pendingOwnerConfirmation')}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Default Interest Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    disabled={!canEditPolicy}
                    value={formState.interestPolicy.defaultRateBps / 100}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          defaultRateBps: Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Rate Unit Basis
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.interestPolicy.defaultRateUnit}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          defaultRateUnit: e.target.value as RateUnit,
                        },
                      })
                    }
                    className="apple-input w-full"
                  >
                    <option value={RateUnit.YEARLY}>Yearly (% per annum)</option>
                    <option value={RateUnit.MONTHLY}>Monthly (% per month)</option>
                    <option value={RateUnit.DAILY}>Daily (% per day)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Interest Method
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.interestPolicy.defaultMethod}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          defaultMethod: e.target.value as InterestMethod,
                        },
                      })
                    }
                    className="apple-input w-full"
                  >
                    <option value={InterestMethod.SIMPLE}>Simple Interest (Default)</option>
                    <option value={InterestMethod.COMPOUND}>Compound Interest</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Day-Count Convention
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.interestPolicy.dayCountConvention}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          dayCountConvention: e.target.value as DayCountConvention,
                        },
                      })
                    }
                    className="apple-input w-full"
                  >
                    <option value={DayCountConvention.ACT_365}>Actual / 365 Days</option>
                    <option value={DayCountConvention.ACT_360}>Actual / 360 Days</option>
                    <option value={DayCountConvention.THIRTY_360}>30 / 360 Equal Months</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Repayment & Patti Recovery Allocation
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.interestPolicy.repaymentAllocationOrder}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          repaymentAllocationOrder: e.target.value as RepaymentAllocationOrder,
                        },
                      })
                    }
                    className="apple-input w-full"
                  >
                    <option value={RepaymentAllocationOrder.PRINCIPAL_FIRST}>
                      Principal-First Recovery (Confirmed Default)
                    </option>
                    <option value={RepaymentAllocationOrder.INTEREST_FIRST}>
                      Interest-First Recovery
                    </option>
                    <option value={RepaymentAllocationOrder.MANUAL}>
                      Manual Split at Settlement
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Currency Rounding Mode
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.roundingMode}
                    onChange={(e) => {
                      const mode = e.target.value as RoundingMode;
                      setFormState({
                        ...formState,
                        roundingMode: mode,
                        interestPolicy: {
                          ...formState.interestPolicy,
                          roundingMode: mode,
                        },
                      });
                    }}
                    className="apple-input w-full"
                  >
                    <option value={RoundingMode.NEAREST_RUPEE}>Round to Nearest ₹1.00</option>
                    <option value={RoundingMode.EXACT_PAISE}>Exact Paise (2 Decimals)</option>
                    <option value={RoundingMode.UP_RUPEE}>Round Up to ₹1.00</option>
                    <option value={RoundingMode.DOWN_RUPEE}>Round Down to ₹1.00</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Commission, Hamali & Custom Paper Bill Labels (Progressive Disclosure) */}
            <div className="glass-panel rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <Scale className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    03. Commission, Hamali & Paper-Bill Terminology
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedLabels(!showAdvancedLabels)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {showAdvancedLabels
                    ? 'Hide Custom Bill Labels'
                    : 'Configure Dalali / CST Labels (DR-06, DR-07)'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Default Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    disabled={!canEditPolicy}
                    value={formState.commissionHamaliPolicy.defaultCommissionBps / 100}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        commissionHamaliPolicy: {
                          ...formState.commissionHamaliPolicy,
                          defaultCommissionBps: Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Default Hamali Charge / Bag (₹)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    disabled={!canEditPolicy}
                    value={formState.commissionHamaliPolicy.defaultHamaliPerBagPaise / 100}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        commissionHamaliPolicy: {
                          ...formState.commissionHamaliPolicy,
                          defaultHamaliPerBagPaise: Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                    className="apple-input w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Owned Stock Valuation
                  </label>
                  <select
                    disabled={!canEditPolicy}
                    value={formState.stockValuationMethod}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        stockValuationMethod: e.target
                          .value as CompanySettings['stockValuationMethod'],
                      })
                    }
                    className="apple-input w-full"
                  >
                    <option value="WEIGHTED_AVERAGE">Weighted Average Cost</option>
                    <option value="FIFO">First-In First-Out (FIFO)</option>
                  </select>
                </div>
              </div>

              {showAdvancedLabels && (
                <div className="pt-3 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Dalali Vikri “Niitu Fee” Label (EN / KN)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        disabled={!canEditCompany}
                        value={formState.customLabels.niituFeeLabelEn}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            customLabels: {
                              ...formState.customLabels,
                              niituFeeLabelEn: e.target.value,
                            },
                          })
                        }
                        className="apple-input w-full text-xs"
                      />
                      <input
                        type="text"
                        disabled={!canEditCompany}
                        value={formState.customLabels.niituFeeLabelKn}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            customLabels: {
                              ...formState.customLabels,
                              niituFeeLabelKn: e.target.value,
                            },
                          })
                        }
                        className="apple-input w-full text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Cash/Credit Bill “CST / Other Tax” Label (EN / KN)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        disabled={!canEditCompany}
                        value={formState.customLabels.cstOrOtherTaxLabelEn}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            customLabels: {
                              ...formState.customLabels,
                              cstOrOtherTaxLabelEn: e.target.value,
                            },
                          })
                        }
                        className="apple-input w-full text-xs"
                      />
                      <input
                        type="text"
                        disabled={!canEditCompany}
                        value={formState.customLabels.cstOrOtherTaxLabelKn}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            customLabels: {
                              ...formState.customLabels,
                              cstOrOtherTaxLabelKn: e.target.value,
                            },
                          })
                        }
                        className="apple-input w-full text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save & Audit Bar */}
            <div className="glass-panel rounded-3xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t(lang, 'auditReasonPrompt')}
                </label>
                <input
                  type="text"
                  disabled={!canSaveAnything}
                  placeholder="e.g., Confirmed 18% Simple Interest & 2% Commission with Chief Accountant"
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                  className="apple-input w-full"
                />
              </div>
              <button
                type="submit"
                disabled={!canSaveAnything || saving}
                className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 self-end"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : t(lang, 'saveChanges')}
              </button>
            </div>
          </div>

          {/* Right 5 Columns: Decisions Register & Reproducible Policy History */}
          <div className="lg:col-span-5 space-y-6">
            {/* Decisions Register Live Status */}
            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-200/70 pb-3.5">
                <Sliders className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {t(lang, 'decisionsRegisterTitle')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configurable defaults flagged for owner/accountant sign-off
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-200/60 text-xs">
                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">DR-01: Interest & Recovery</div>
                    <div className="text-slate-600 mt-0.5">
                      {formState.interestPolicy.defaultMethod} ·{' '}
                      {(formState.interestPolicy.defaultRateBps / 100).toFixed(2)}%{' '}
                      {formState.interestPolicy.defaultRateUnit} ·{' '}
                      {formState.interestPolicy.dayCountConvention} ·{' '}
                      {formState.interestPolicy.repaymentAllocationOrder}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      formState.interestPolicy.ownerConfirmed
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {formState.interestPolicy.ownerConfirmed ? 'Confirmed' : 'Pending Sign-off'}
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">DR-02: Commission & Hamali</div>
                    <div className="text-slate-600 mt-0.5 font-mono">
                      Commission:{' '}
                      {(formState.commissionHamaliPolicy.defaultCommissionBps / 100).toFixed(2)}% ·
                      Hamali: {formatINR(formState.commissionHamaliPolicy.defaultHamaliPerBagPaise)}
                      /bag
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      formState.commissionHamaliPolicy.ownerConfirmed
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {formState.commissionHamaliPolicy.ownerConfirmed
                      ? 'Confirmed'
                      : 'Pending Sign-off'}
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      DR-03: Bag & Weight Conversion
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      1 Q = 100 kg = 1,00,000 g. Never assumes uniform bag weight without explicit
                      commodity setting.
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                    Enforced
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      DR-06 & DR-07: Paper Bill Labels
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      “{formState.customLabels.niituFeeLabelEn}” · “
                      {formState.customLabels.cstOrOtherTaxLabelEn}”
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-amber-700 shrink-0">
                    Configurable
                  </span>
                </div>
              </div>
            </div>

            {/* Historical Policy Snapshots (SRS Sec 5.2 Reproducibility) */}
            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-200/70 pb-3.5">
                <Clock className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Dated Policy Snapshots ({policyVersions.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ensures historical interest & Patti calculations remain 100% reproducible
                  </p>
                </div>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {policyVersions.map((pv) => (
                  <div key={pv.id} className="glass-subtle rounded-2xl p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-900">
                        Version v{pv.versionNo} ({pv.id})
                      </span>
                      <span className="text-slate-500 font-mono">
                        Effective: {formatDateDDMMYYYY(pv.effectiveFrom)}
                      </span>
                    </div>
                    <p className="text-slate-700">{pv.changeReason}</p>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                      <span>By: {pv.changedBy}</span>
                      <span className="font-mono">{pv.createdAt.slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

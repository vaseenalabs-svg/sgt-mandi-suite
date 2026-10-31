import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  FileSignature,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  DuplicateWarningItem,
  PartyLedgerStatement,
  PartyRecord,
  PartyType,
  PermissionKey,
  UserProfile,
} from '../shared/types';
import { formatDateDDMMYYYY, formatPaiseToRupees, rupeesToPaise } from '../shared/math';
import { LanguageCode } from '../shared/i18n';

interface PartiesAndFarmersViewProps {
  lang: LanguageCode;
  activeUser: UserProfile;
  parties: PartyRecord[];
  businessDate: string;
  onRegisterParty: (payload: Record<string, unknown>) => Promise<{
    party: PartyRecord;
    duplicateWarnings: DuplicateWarningItem[];
  }>;
  onCheckDuplicates: (payload: Record<string, unknown>) => Promise<DuplicateWarningItem[]>;
  onUpdateParty: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDeleteParty?: (id: string, reason: string) => Promise<void>;
  onInspectPartyKyc: (id: string, unmask: boolean) => Promise<PartyRecord>;
  onLoadPartyLedger: (id: string, fromDate?: string, toDate?: string) => Promise<PartyLedgerStatement>;
}

const PARTY_TYPE_OPTIONS: Array<{ value: PartyType; labelEn: string; labelKn: string }> = [
  { value: 'FARMER', labelEn: 'Farmer (ರೈತರು)', labelKn: 'ರೈತರು' },
  { value: 'BUYER', labelEn: 'Buyer / Merchant', labelKn: 'ಖರೀದಿದಾರರು' },
  { value: 'WHOLESALER', labelEn: 'Wholesaler', labelKn: 'ಸಗಟು ವ್ಯಾಪಾರಿ' },
  { value: 'FACTORY', labelEn: 'Oil Mill / Processing Factory', labelKn: 'ಕಾರ್ಖಾನೆ / ಮಿಲ್' },
  { value: 'TRADER', labelEn: 'Commission Trader', labelKn: 'ವ್ಯಾಪಾರಿ' },
  { value: 'SUPPLIER', labelEn: 'Supplier', labelKn: 'ಪೂರೈಕೆದಾರರು' },
  { value: 'TRANSPORTER', labelEn: 'Transporter / Lorry Owner', labelKn: 'ಲಾರಿ ಮಾಲೀಕರು' },
  { value: 'OTHER', labelEn: 'Other Counterparty', labelKn: 'ಇತರೆ ಪಾರ್ಟಿ' },
];

export const PartiesAndFarmersView: React.FC<PartiesAndFarmersViewProps> = ({
  lang,
  activeUser,
  parties,
  businessDate,
  onRegisterParty,
  onCheckDuplicates,
  onUpdateParty,
  onDeleteParty,
  onInspectPartyKyc,
  onLoadPartyLedger,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

  // Registration form state
  const [partyType, setPartyType] = useState<PartyType>('FARMER');
  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [address, setAddress] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [phoneSecondary, setPhoneSecondary] = useState('');
  const [smsConsent, setSmsConsent] = useState(true);
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeRelation, setNomineeRelation] = useState('');
  const [nomineePhone, setNomineePhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [idProofType, setIdProofType] = useState('Aadhaar Card');
  const [idProofNo, setIdProofNo] = useState('');
  const [idProofVerified, setIdProofVerified] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [openingBalanceRupees, setOpeningBalanceRupees] = useState('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'DR' | 'CR'>('DR');
  const [openingBalanceNotes, setOpeningBalanceNotes] = useState('');

  // Duplicate detection state (AT-01)
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateWarningItem[]>([]);
  const [ignoreDuplicateWarning, setIgnoreDuplicateWarning] = useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Farmer / Party State
  const [editingParty, setEditingParty] = useState<PartyRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhonePrimary, setEditPhonePrimary] = useState('');
  const [editPhoneSecondary, setEditPhoneSecondary] = useState('');
  const [editSmsConsent, setEditSmsConsent] = useState(true);
  const [editGstin, setEditGstin] = useState('');
  const [editPan, setEditPan] = useState('');
  const [editNomineeName, setEditNomineeName] = useState('');
  const [editNomineeRelation, setEditNomineeRelation] = useState('');
  const [editNomineePhone, setEditNomineePhone] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankBranch, setEditBankBranch] = useState('');
  const [editBankIfsc, setEditBankIfsc] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Farmer / Party Confirmation State
  const [deletingParty, setDeletingParty] = useState<PartyRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // KYC & Signature Inspection State
  const [inspectedParty, setInspectedParty] = useState<PartyRecord | null>(null);
  const [kycUnmasked, setKycUnmasked] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const [ledgerStatement, setLedgerStatement] = useState<PartyLedgerStatement | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const canUnmaskKyc =
    Boolean(activeUser?.canViewSensitiveKyc) &&
    Boolean(activeUser?.permissions?.includes(PermissionKey.VIEW_SENSITIVE_KYC));

  const safeParties = Array.isArray(parties) ? parties : [];

  const filteredParties = safeParties.filter((p) => {
    if (!p) return false;
    const matchesType = filterType === 'ALL' || p.partyType === filterType;
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      (p.partyCode || '').toLowerCase().includes(term) ||
      (p.name || '').toLowerCase().includes(term) ||
      (p.village || '').toLowerCase().includes(term) ||
      (p.phonePrimary || '').toLowerCase().includes(term);
    return matchesType && matchesSearch;
  });

  const farmerCount = safeParties.filter((p) => p && p.partyType === 'FARMER').length;
  const otherPartyCount = safeParties.length - farmerCount;

  const resetForm = () => {
    setPartyType('FARMER');
    setName('');
    setVillage('');
    setAddress('');
    setPhonePrimary('');
    setPhoneSecondary('');
    setSmsConsent(true);
    setGstin('');
    setPan('');
    setNomineeName('');
    setNomineeRelation('');
    setNomineePhone('');
    setBankName('');
    setBankBranch('');
    setBankAccountNo('');
    setBankIfsc('');
    setIdProofType('Aadhaar Card');
    setIdProofNo('');
    setIdProofVerified(true);
    setSignatureDataUrl('');
    setOpeningBalanceRupees('0');
    setOpeningBalanceType('DR');
    setOpeningBalanceNotes('');
    setDuplicateWarnings([]);
    setIgnoreDuplicateWarning(false);
    setDuplicateOverrideReason('');
    setFormError(null);
  };

  const handleRunDuplicateCheck = async () => {
    if (!name.trim() && !phonePrimary.trim() && !bankAccountNo.trim() && !idProofNo.trim()) {
      return;
    }
    const warnings = await onCheckDuplicates({
      name,
      village,
      phonePrimary,
      phoneSecondary,
      bankAccountNo,
      idProofNo,
    });
    setDuplicateWarnings(warnings);
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      setSubmitting(true);
      const warnings = await onCheckDuplicates({
        name,
        village,
        phonePrimary,
        phoneSecondary,
        bankAccountNo,
        idProofNo,
      });
      setDuplicateWarnings(warnings);

      if (warnings.length > 0 && !ignoreDuplicateWarning) {
        setFormError(
          'Potential duplicate Farmer/Party detected! Review the warning below or explicitly confirm override with an audit reason.'
        );
        setSubmitting(false);
        return;
      }

      if (warnings.length > 0 && ignoreDuplicateWarning && duplicateOverrideReason.trim().length < 3) {
        setFormError('Please provide an override reason (at least 3 characters) to proceed with duplicate fields.');
        setSubmitting(false);
        return;
      }

      await onRegisterParty({
        partyType,
        name,
        village,
        address,
        phonePrimary,
        phoneSecondary,
        smsConsent,
        gstin,
        pan,
        nomineeName,
        nomineeRelation,
        nomineePhone,
        bankName,
        bankBranch,
        bankAccountHolder: name,
        bankAccountNo,
        bankIfsc,
        idProofType,
        idProofNo,
        idProofVerified,
        signatureDataUrl: signatureDataUrl || null,
        openingBalancePaise: rupeesToPaise(Number(openingBalanceRupees || 0)),
        openingBalanceType,
        openingBalanceDate: businessDate,
        openingBalanceNotes,
        ignoreDuplicateWarning,
        duplicateOverrideReason,
      });

      resetForm();
      setIsRegisterModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register party');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInspectKyc = async (party: PartyRecord, unmask: boolean) => {
    try {
      setKycError(null);
      const loaded = await onInspectPartyKyc(party.id, unmask);
      setInspectedParty(loaded);
      setKycUnmasked(unmask);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Unable to unmask KYC');
    }
  };

  const handleOpenLedger = async (party: PartyRecord) => {
    try {
      setLedgerLoading(true);
      const stmt = await onLoadPartyLedger(party.id);
      setLedgerStatement(stmt);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleOpenEdit = (party: PartyRecord) => {
    setEditingParty(party);
    setEditName(party.name);
    setEditVillage(party.village || '');
    setEditAddress(party.address || '');
    setEditPhonePrimary(party.phonePrimary || '');
    setEditPhoneSecondary(party.phoneSecondary || '');
    setEditSmsConsent(party.smsConsent);
    setEditGstin(party.gstin || '');
    setEditPan(party.pan || '');
    setEditNomineeName(party.nomineeName || '');
    setEditNomineeRelation(party.nomineeRelation || '');
    setEditNomineePhone(party.nomineePhone || '');
    setEditBankName(party.bankName || '');
    setEditBankBranch(party.bankBranch || '');
    setEditBankIfsc(party.bankIfsc || '');
    setEditStatus(party.status);
    setEditReason('');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty) return;
    if (!editName.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!editReason.trim() || editReason.trim().length < 3) {
      setEditError('An audit reason is required to update party details (min 3 chars).');
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError(null);
      await onUpdateParty(editingParty.id, {
        name: editName.trim(),
        village: editVillage.trim(),
        address: editAddress.trim(),
        phonePrimary: editPhonePrimary.trim(),
        phoneSecondary: editPhoneSecondary.trim(),
        smsConsent: editSmsConsent,
        gstin: editGstin.trim(),
        pan: editPan.trim(),
        nomineeName: editNomineeName.trim(),
        nomineeRelation: editNomineeRelation.trim(),
        nomineePhone: editNomineePhone.trim(),
        bankName: editBankName.trim(),
        bankBranch: editBankBranch.trim(),
        bankIfsc: editBankIfsc.trim(),
        status: editStatus,
        expectedVersion: editingParty.version,
        reason: editReason.trim(),
      });
      setEditingParty(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update party.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenDelete = (party: PartyRecord) => {
    setDeletingParty(party);
    setDeleteReason('');
    setDeleteError(null);
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingParty) return;
    if (!deleteReason.trim() || deleteReason.trim().length < 3) {
      setDeleteError('Audit reason is required to delete farmer/party (min 3 chars).');
      return;
    }

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      if (onDeleteParty) {
        await onDeleteParty(deletingParty.id, deleteReason.trim());
      }
      setDeletingParty(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete farmer/party.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <div className="glass-panel p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            {lang === 'kn'
              ? 'ವಿಭಾಗ 4.1 ಮತ್ತು 4.2 · ರೈತರ ನೋಂದಣಿ ಮತ್ತು ಪಾರ್ಟಿ ಮಾಸ್ಟರ್'
              : 'SRS SEC 4.1 & 4.2 · FARMER REGISTRATION & PARTY MASTER (AT-01)'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {lang === 'kn'
              ? 'ರೈತರು, ಖರೀದಿದಾರರು ಮತ್ತು ಪಾರ್ಟಿಗಳ ನೋಂದಣಿ'
              : 'Farmers, Buyers & Counterparty Master'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Immutable Farmer IDs (<span className="font-mono text-slate-800">SGT-FM-000001</span>),
            duplicate warning engine, masked bank/ID KYC protection, and instant Farmer Khata sub-ledgers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Registered Farmers
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {farmerCount}
            </div>
          </div>
          <div className="px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Buyers & Other Parties
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
              {otherPartyCount}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsRegisterModalOpen(true);
            }}
            className="btn-cupertino flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'kn' ? '+ ಹೊಸ ರೈತ / ಪಾರ್ಟಿ ನೋಂದಣಿ' : '+ Register Farmer / Party'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="segmented-control overflow-x-auto">
          {[
            { id: 'ALL', label: `All (${parties.length})` },
            { id: 'FARMER', label: `Farmers (${farmerCount})` },
            { id: 'BUYER', label: 'Buyers' },
            { id: 'WHOLESALER', label: 'Wholesalers' },
            { id: 'FACTORY', label: 'Factories' },
            { id: 'SUPPLIER', label: 'Suppliers' },
            { id: 'TRANSPORTER', label: 'Transporters' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`segmented-item text-xs ${
                filterType === tab.id ? 'segmented-item-active' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Farmer ID, Name, Village, Phone..."
            className="input-glass w-full pl-9 pr-4 py-2 text-sm"
          />
        </div>
      </div>

      {/* Party Master Table */}
      <div className="glass-panel overflow-hidden">
        {filteredParties.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-400 mx-auto mb-3 stroke-[1.5]" />
            <h3 className="text-base font-semibold text-slate-800">
              No Registered Farmers or Parties Found
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              Click &ldquo;+ Register Farmer / Party&rdquo; above to onboard a farmer with verified KYC,
              masked bank details, and an immutable SGT Farmer ID.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-white/50">
                  <th className="py-3.5 px-4">Party ID</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Name & Village</th>
                  <th className="py-3.5 px-4">Contact & SMS</th>
                  <th className="py-3.5 px-4">Bank Account (Masked)</th>
                  <th className="py-3.5 px-4">ID Proof (Masked)</th>
                  <th className="py-3.5 px-4 text-right">Opening Balance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-sm">
                {filteredParties.map((party) => (
                  <tr key={party.id} className="hover:bg-white/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-blue-700 tabular-nums">
                      {party.partyCode}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-semibold text-slate-700">
                        {party.partyType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{party.name}</div>
                      <div className="text-xs text-slate-500">
                        {party.village || party.address || '—'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      <div>{party.phonePrimary || '—'}</div>
                      <div className="text-[11px] text-slate-500">
                        SMS: {party.smsConsent ? 'Opted In' : 'Muted'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-xs text-slate-800 tabular-nums">
                        {party.bankAccountNoMasked || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {party.bankName ? `${party.bankName} (${party.bankIfsc || 'IFSC'})` : 'No Bank'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-xs text-slate-800 tabular-nums">
                        {party.idProofNoMasked || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        {party.idProofVerified ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : null}
                        <span>{party.idProofType || 'ID'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {party.openingBalancePaise > 0 ? (
                        <span className="font-semibold text-slate-900">
                          {formatPaiseToRupees(party.openingBalancePaise)}{' '}
                          <span className="text-xs text-slate-500">{party.openingBalanceType}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">₹0.00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleInspectKyc(party, false)}
                          className="btn-glass px-2 py-1 text-xs font-medium flex items-center gap-1"
                          title="View KYC & Identity"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>KYC</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenLedger(party)}
                          className="btn-glass px-2 py-1 text-xs font-semibold text-blue-700 flex items-center gap-1"
                          title="View Khata Book Sub-Ledger"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 7v14" />
                            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
                          </svg>
                          <span>Khata</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(party)}
                          className="btn-glass px-2 py-1 text-xs font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1"
                          title="Edit Information"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(party)}
                          className="btn-glass px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1"
                          title="Delete Farmer / Party"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KYC & Signature Inspection Modal */}
      {inspectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-xl w-full p-6 space-y-5 border border-white/90">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-mono font-semibold text-blue-600">
                  {inspectedParty.partyCode} · {inspectedParty.partyType}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {inspectedParty.name} ({inspectedParty.village || 'Mandi'})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInspectedParty(null);
                  setKycUnmasked(false);
                  setKycError(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {kycError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{kycError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 rounded-xl bg-white/75 border border-slate-200/70">
                <div className="text-xs text-slate-500">Bank Account Number</div>
                <div className="font-mono font-semibold text-slate-900 mt-1">
                  {kycUnmasked
                    ? inspectedParty.bankAccountNoUnmasked || inspectedParty.bankAccountNoMasked
                    : inspectedParty.bankAccountNoMasked}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {inspectedParty.bankName || '—'} · IFSC: {inspectedParty.bankIfsc || '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/75 border border-slate-200/70">
                <div className="text-xs text-slate-500">
                  Identity Proof ({inspectedParty.idProofType || 'Govt ID'})
                </div>
                <div className="font-mono font-semibold text-slate-900 mt-1">
                  {kycUnmasked
                    ? inspectedParty.idProofNoUnmasked || inspectedParty.idProofNoMasked
                    : inspectedParty.idProofNoMasked}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Nominee: {inspectedParty.nomineeName || '—'} ({inspectedParty.nomineeRelation || '—'})
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/75 border border-slate-200/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSignature className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Farmer Signature / Thumb Impression Record
                  </div>
                  <div className="text-xs text-slate-500">
                    {inspectedParty.hasSignatureOnFile
                      ? kycUnmasked
                        ? `Unmasked Signature Reference: ${inspectedParty.signatureDataUrl}`
                        : 'Signature on file (Masked on ordinary screen)'
                      : 'No signature attachment uploaded yet'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
              <div className="text-xs text-slate-500">
                Active Role: <span className="font-semibold text-slate-800">{activeUser.role}</span>
              </div>
              <div className="flex items-center gap-2">
                {!kycUnmasked ? (
                  <button
                    type="button"
                    onClick={() => handleInspectKyc(inspectedParty, true)}
                    className="btn-cupertino px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      {canUnmaskKyc
                        ? 'Reveal Unmasked KYC (Audit Logged)'
                        : 'Attempt Unmask (Verify RBAC Block)'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleInspectKyc(inspectedParty, false)}
                    className="btn-glass px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Re-Mask Sensitive Fields</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Party / Farmer Khata Sub-Ledger Statement Modal (SRS Sec 10.1) */}
      {(ledgerStatement || ledgerLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-4xl w-full max-h-[88vh] flex flex-col p-6 border border-white/90">
            {ledgerLoading || !ledgerStatement ? (
              <div className="py-12 text-center text-sm text-slate-600">
                Loading Party Khata Sub-Ledger...
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between pb-4 border-b border-slate-200/80">
                  <div>
                    <div className="text-xs font-mono font-semibold text-blue-600">
                      {ledgerStatement.party.partyCode} · {ledgerStatement.party.partyType} KHATA SUB-LEDGER
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                      {ledgerStatement.party.name} ({ledgerStatement.party.village || 'Mandi'})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLedgerStatement(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Distinct Farmer Bucket Breakdown (SRS Sec 10.1) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                  <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80">
                    <div className="text-[11px] font-medium text-slate-500 uppercase">
                      Loan Principal Due
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {formatPaiseToRupees(ledgerStatement.bucketSummary.loanPrincipalReceivablePaise)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80">
                    <div className="text-[11px] font-medium text-slate-500 uppercase">
                      Crop Proceeds Credited
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                      {formatPaiseToRupees(ledgerStatement.bucketSummary.cropProceedsCreditedPaise)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80">
                    <div className="text-[11px] font-medium text-slate-500 uppercase">
                      Trade / Patti Balance
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {formatPaiseToRupees(ledgerStatement.bucketSummary.tradeReceivableOrPayablePaise)}{' '}
                      <span className="text-xs text-slate-500">
                        {ledgerStatement.bucketSummary.tradeDirection}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/80">
                    <div className="text-[11px] font-semibold text-blue-700 uppercase">
                      Overall Net Closing Balance
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-blue-900 mt-0.5">
                      {formatPaiseToRupees(ledgerStatement.closingBalancePaise)}{' '}
                      <span className="text-xs">{ledgerStatement.closingBalanceType}</span>
                    </div>
                  </div>
                </div>

                {/* Chronological Ledger Table */}
                <div className="flex-1 overflow-y-auto border border-slate-200/80 rounded-xl bg-white/70">
                  {ledgerStatement.lines.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      No financial postings recorded for this party yet.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Entry No</th>
                          <th className="py-2.5 px-3">Bucket</th>
                          <th className="py-2.5 px-3">Particulars / Narration</th>
                          <th className="py-2.5 px-3 text-right">Debit (Dr)</th>
                          <th className="py-2.5 px-3 text-right">Credit (Cr)</th>
                          <th className="py-2.5 px-3 text-right">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {ledgerStatement.lines.map((line) => (
                          <tr key={line.lineId} className="hover:bg-white">
                            <td className="py-2.5 px-3 font-mono tabular-nums">
                              {formatDateDDMMYYYY(line.transactionDate)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">
                              {line.entryNo}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {line.ledgerBucket}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800">{line.narration}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                              {line.debitPaise > 0 ? formatPaiseToRupees(line.debitPaise) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                              {line.creditPaise > 0 ? formatPaiseToRupees(line.creditPaise) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                              {formatPaiseToRupees(line.runningBalancePaise)} {line.runningBalanceType}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Register Farmer / Party Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 border border-white/90">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  SRS Sec 4.1 & 4.2 · Atomic Registration & Duplicate Guard (AT-01)
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  Register Farmer or Business Counterparty
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRegistration} className="space-y-5 mt-5">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              {/* Duplicate Warning Card (AT-01) */}
              {duplicateWarnings.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Duplicate Detection Warning (AT-01)</span>
                  </div>
                  <ul className="space-y-1 text-xs text-amber-900 list-disc pl-5">
                    {duplicateWarnings.map((w, idx) => (
                      <li key={idx}>
                        <span className="font-mono font-semibold">[{w.matchType}]</span> {w.message}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        checked={ignoreDuplicateWarning}
                        onChange={(e) => setIgnoreDuplicateWarning(e.target.checked)}
                        className="rounded border-amber-400"
                      />
                      <span>Confirm override (e.g., family member sharing phone)</span>
                    </label>
                    {ignoreDuplicateWarning && (
                      <input
                        type="text"
                        value={duplicateOverrideReason}
                        onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                        placeholder="Mandatory audit reason for duplicate override..."
                        className="input-glass flex-1 px-3 py-1.5 text-xs"
                        required
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party Category *
                  </label>
                  <select
                    value={partyType}
                    onChange={(e) => setPartyType(e.target.value as PartyType)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  >
                    {PARTY_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleRunDuplicateCheck}
                    placeholder="e.g., Basavaraj Patil"
                    className="input-glass w-full px-3 py-2 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Village / City {partyType === 'FARMER' ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    onBlur={handleRunDuplicateCheck}
                    placeholder="e.g., Annigeri / Gadag"
                    className="input-glass w-full px-3 py-2 text-sm"
                    required={partyType === 'FARMER'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Mobile Number
                  </label>
                  <input
                    type="text"
                    value={phonePrimary}
                    onChange={(e) => setPhonePrimary(e.target.value)}
                    onBlur={handleRunDuplicateCheck}
                    placeholder="10-digit mobile"
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Secondary Phone
                  </label>
                  <input
                    type="text"
                    value={phoneSecondary}
                    onChange={(e) => setPhoneSecondary(e.target.value)}
                    placeholder="Optional alternate phone"
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Postal Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street / Taluk / District"
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Bank & Identity KYC Section */}
              <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/80 space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Bank Account, Govt Identity KYC & Nominee (Automatically Masked on Ordinary Screens)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g., Karnataka Vikas Grameena Bank"
                      className="input-glass w-full px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Bank Account No
                    </label>
                    <input
                      type="text"
                      value={bankAccountNo}
                      onChange={(e) => setBankAccountNo(e.target.value)}
                      onBlur={handleRunDuplicateCheck}
                      placeholder="Raw account no"
                      className="input-glass w-full px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value)}
                      placeholder="e.g., SBIN0001234"
                      className="input-glass w-full px-3 py-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      placeholder="Branch"
                      className="input-glass w-full px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ID Proof Type
                    </label>
                    <select
                      value={idProofType}
                      onChange={(e) => setIdProofType(e.target.value)}
                      className="input-glass w-full px-3 py-1.5 text-xs"
                    >
                      <option value="Aadhaar Card">Aadhaar Card</option>
                      <option value="Voter ID">Voter ID</option>
                      <option value="PAN Card">PAN Card</option>
                      <option value="Driving Licence">Driving Licence</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ID Proof Number
                    </label>
                    <input
                      type="text"
                      value={idProofNo}
                      onChange={(e) => setIdProofNo(e.target.value)}
                      onBlur={handleRunDuplicateCheck}
                      placeholder="Masked on save"
                      className="input-glass w-full px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nominee Name & Relation
                    </label>
                    <input
                      type="text"
                      value={nomineeName}
                      onChange={(e) => setNomineeName(e.target.value)}
                      placeholder="e.g., Savitri (Spouse)"
                      className="input-glass w-full px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Signature Reference / Scan ID
                    </label>
                    <input
                      type="text"
                      value={signatureDataUrl}
                      onChange={(e) => setSignatureDataUrl(e.target.value)}
                      placeholder="e.g., SIG-SCAN-001"
                      className="input-glass w-full px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Opening Balance Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalanceRupees}
                    onChange={(e) => setOpeningBalanceRupees(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Balance Nature
                  </label>
                  <select
                    value={openingBalanceType}
                    onChange={(e) => setOpeningBalanceType(e.target.value as 'DR' | 'CR')}
                    className="input-glass w-full px-3 py-2 text-sm"
                  >
                    <option value="DR">Debit (DR — Receivable from Party)</option>
                    <option value="CR">Credit (CR — Payable to Party)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN (For Buyers / Suppliers)
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="Optional 15-digit GSTIN"
                    className="input-glass w-full px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="btn-glass px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-cupertino px-5 py-2 text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{submitting ? 'Registering...' : 'Save & Allocate Immutable ID'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Farmer / Party Modal */}
      {editingParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 border border-white/90">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Edit {editingParty.partyType === 'FARMER' ? 'Farmer' : 'Party'} Information
                  </h3>
                  <p className="text-xs font-mono text-blue-600">
                    Immutable ID: {editingParty.partyCode} (v{editingParty.version})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingParty(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Village / Town
                  </label>
                  <input
                    type="text"
                    value={editVillage}
                    onChange={(e) => setEditVillage(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="input-glass w-full px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Mobile No.
                  </label>
                  <input
                    type="tel"
                    value={editPhonePrimary}
                    onChange={(e) => setEditPhonePrimary(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Secondary Mobile No.
                  </label>
                  <input
                    type="tel"
                    value={editPhoneSecondary}
                    onChange={(e) => setEditPhoneSecondary(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editBankName}
                    onChange={(e) => setEditBankName(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <input
                    type="text"
                    value={editBankBranch}
                    onChange={(e) => setEditBankBranch(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={editBankIfsc}
                    onChange={(e) => setEditBankIfsc(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nominee Name</label>
                  <input
                    type="text"
                    value={editNomineeName}
                    onChange={(e) => setEditNomineeName(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Relation</label>
                  <input
                    type="text"
                    value={editNomineeRelation}
                    onChange={(e) => setEditNomineeRelation(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nominee Mobile</label>
                  <input
                    type="tel"
                    value={editNomineePhone}
                    onChange={(e) => setEditNomineePhone(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editGstin}
                    onChange={(e) => setEditGstin(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PAN</label>
                  <input
                    type="text"
                    value={editPan}
                    onChange={(e) => setEditPan(e.target.value)}
                    className="input-glass w-full px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="input-glass w-full px-3 py-2 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE (Deactivated)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Update / Audit Note <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Updated primary mobile and village details"
                  className="input-glass w-full px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setEditingParty(null)}
                  className="btn-glass px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="btn-cupertino px-5 py-2 text-xs font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editSubmitting ? 'Saving...' : 'Update Farmer Details'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Farmer / Party Confirmation Modal */}
      {deletingParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-panel-strong max-w-md w-full p-6 space-y-4 border border-rose-200/80 bg-white/95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Delete {deletingParty.partyType === 'FARMER' ? 'Farmer' : 'Party'}
                </h3>
                <p className="text-xs text-slate-500">
                  {deletingParty.name} ({deletingParty.partyCode})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
              <p>
                ⚠️ <strong>Note:</strong> Deletion is only permitted for parties with 0 operational transactions (Pattis, Bills, Loans, or Collections).
              </p>
              <p>
                If this party has past trade transactions, the system will protect financial audit integrity and prompt you to deactivate instead.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Deletion <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Registered by mistake with 0 transactions"
                  className="input-glass w-full px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingParty(null)}
                  className="btn-glass px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleteSubmitting ? 'Deleting...' : 'Confirm Delete'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

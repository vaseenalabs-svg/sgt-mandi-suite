import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Shield,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { PermissionKey, UserProfile, UserRole } from '../shared/types';
import { LanguageCode, t } from '../shared/i18n';

interface KycSampleRecord {
  farmerId: string;
  farmerName: string;
  village: string;
  bankName: string;
  bankIfsc: string;
  bankAccountNo: string;
  idProofType: string;
  idProofNo: string;
  signatureStatus: string;
  isMasked: boolean;
}

interface RolesAndPrivacyViewProps {
  users: UserProfile[];
  activeUser: UserProfile;
  kycSample: KycSampleRecord;
  lang: LanguageCode;
  onSelectActiveUser: (userId: string) => Promise<void>;
  onCreateUser: (payload: {
    username: string;
    password: string;
    fullName: string;
    role: UserRole;
    canViewSensitiveKyc: boolean;
  }) => Promise<void>;
  onToggleUnmaskKyc: (
    unmask: boolean,
    customFields?: {
      farmerName?: string;
      bankAccountNo?: string;
      idProofNo?: string;
    }
  ) => Promise<void>;
  onUpdateUserPermissions: (
    targetUserId: string,
    permissions: PermissionKey[],
    canViewSensitiveKyc: boolean,
    reason: string
  ) => Promise<void>;
}

const ALL_PERMISSIONS: Array<{ key: PermissionKey; label: string; desc: string }> = [
  {
    key: PermissionKey.MANAGE_SETTINGS,
    label: 'Manage Company & Series Settings',
    desc: 'Edit firm profile, document prefixes, and general setup',
  },
  {
    key: PermissionKey.MANAGE_RATES_AND_POLICIES,
    label: 'Configure Rates, Rounding & Units',
    desc: 'Approve or modify loan interest, commission, hamali, and rounding policies',
  },
  {
    key: PermissionKey.MANAGE_USERS,
    label: 'Manage Users & Role Permissions',
    desc: 'Grant or revoke individual employee access rights',
  },
  {
    key: PermissionKey.VIEW_SENSITIVE_KYC,
    label: 'Unmask Sensitive Farmer Bank & ID Data',
    desc: 'View unmasked bank account numbers, government IDs, and signatures',
  },
  {
    key: PermissionKey.CREATE_TRADING_BILLS,
    label: 'Create Commodity Pattis & Bills',
    desc: 'Draft and finalize Farmer Patti, Kharidi Patti, Dalali & Cash/Credit Bills',
  },
  {
    key: PermissionKey.MANAGE_LOANS,
    label: 'Manage Farmer Loans & Recoveries',
    desc: 'Disburse loans, compute interest, and record repayments',
  },
  {
    key: PermissionKey.MANAGE_CASH_BANK,
    label: 'Manage Cash Book, Bank & Collections',
    desc: 'Record cash receipts, payments, cheques, and daily cash balance',
  },
  {
    key: PermissionKey.APPROVE_CORRECTIONS,
    label: 'Approve Reversals & Adjustments',
    desc: 'Authorize controlled reversals of finalized transactions and stock adjustments',
  },
  {
    key: PermissionKey.REOPEN_CLOSED_DAY,
    label: 'Reopen Closed Business Day',
    desc: 'Unlock a finalized day-end close with mandatory audit trail',
  },
  {
    key: PermissionKey.VIEW_REPORTS_AND_AUDIT,
    label: 'View Financial Reports & Audit Logs',
    desc: 'Inspect ledgers, statements, and system audit history',
  },
  {
    key: PermissionKey.EXPORT_SENSITIVE_DATA,
    label: 'Export PDF / Spreadsheet Reports',
    desc: 'Download external copies of party statements and registers',
  },
];

export const RolesAndPrivacyView: React.FC<RolesAndPrivacyViewProps> = ({
  users,
  activeUser,
  kycSample,
  lang,
  onSelectActiveUser,
  onCreateUser,
  onToggleUnmaskKyc,
  onUpdateUserPermissions,
}) => {
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserProfile | null>(
    users[0] ?? null
  );
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>(
    users[0]?.permissions ?? []
  );
  const [draftKycAccess, setDraftKycAccess] = useState<boolean>(
    users[0]?.canViewSensitiveKyc ?? false
  );
  const [reason, setReason] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Create Production Staff User state
  const [showCreateUserForm, setShowCreateUserForm] = useState<boolean>(users.length === 0);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.OWNER);
  const [newKycAccess, setNewKycAccess] = useState<boolean>(true);

  // User-entered test fields for KYC masking verification (zero hardcoded personal data)
  const [testFarmerName, setTestFarmerName] = useState<string>('');
  const [testBankAccount, setTestBankAccount] = useState<string>('');
  const [testIdProof, setTestIdProof] = useState<string>('');

  useEffect(() => {
    if (users.length === 0) {
      setSelectedTargetUser(null);
      setDraftPermissions([]);
      setDraftKycAccess(false);
      setShowCreateUserForm(true);
    } else if (!selectedTargetUser || !users.some((u) => u.id === selectedTargetUser.id)) {
      const first = users[0];
      setSelectedTargetUser(first);
      setDraftPermissions(first.permissions);
      setDraftKycAccess(first.canViewSensitiveKyc);
    }
  }, [users, selectedTargetUser]);

  const canManageUsers = activeUser.permissions.includes(PermissionKey.MANAGE_USERS);

  const handleSelectUserToEdit = (u: UserProfile) => {
    setSelectedTargetUser(u);
    setDraftPermissions(u.permissions);
    setDraftKycAccess(u.canViewSensitiveKyc);
    setReason('');
    setStatusMsg(null);
  };

  const togglePermission = (perm: PermissionKey) => {
    setDraftPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleCreateStaffUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      await onCreateUser({
        username: newUsername,
        password: newPassword,
        fullName: newFullName,
        role: newRole,
        canViewSensitiveKyc: newKycAccess,
      });
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setShowCreateUserForm(false);
      setStatusMsg({
        type: 'success',
        text: `Created production staff user "${newFullName}" (${newRole}).`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create staff user',
      });
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetUser) return;
    setStatusMsg(null);
    try {
      await onUpdateUserPermissions(
        selectedTargetUser.id,
        draftPermissions,
        draftKycAccess,
        reason
      );
      setReason('');
      setStatusMsg({
        type: 'success',
        text: `Updated permissions for ${selectedTargetUser.fullName} and logged to audit trail.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update permissions',
      });
    }
  };

  const handleUnmaskToggle = async (targetUnmask: boolean) => {
    setStatusMsg(null);
    try {
      await onToggleUnmaskKyc(targetUnmask, {
        farmerName: testFarmerName.trim() || undefined,
        bankAccountNo: testBankAccount.trim() || undefined,
        idProofNo: testIdProof.trim() || undefined,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Permission denied to unmask KYC data',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>SRS Sections 2.2, 4.1 & 18.1</span>
            <span aria-hidden="true">·</span>
            <span>Least-Privilege Access</span>
            <span aria-hidden="true">·</span>
            <span>Sensitive Farmer Data Masking</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, 'rolesAndMaskingTitle')}</h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Create and manage production staff accounts across the 5 SGT roles and verify automatic
            masking of farmer bank account numbers, identity documents, and signatures.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={!canManageUsers}
            onClick={() => setShowCreateUserForm(!showCreateUserForm)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff Account
          </button>

          {users.length > 0 && (
            <div className="glass-subtle rounded-2xl p-3 flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <div>
                <label className="block text-[11px] text-slate-500">Active Staff Session</label>
                <select
                  value={activeUser.id}
                  onChange={(e) => onSelectActiveUser(e.target.value)}
                  className="mt-0.5 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} [{u.role}]
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-200 text-emerald-800'
              : 'bg-rose-500/10 border-rose-200 text-rose-800'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Progressive Disclosure Drawer: Create Production Staff Account */}
      {showCreateUserForm && (
        <form
          onSubmit={handleCreateStaffUser}
          className="glass-panel rounded-3xl p-6 space-y-4 border border-blue-200/80"
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Create Production Staff User Account (SRS Section 2.2)
              </h2>
              <p className="text-xs text-slate-500">
                Register real employees with hashed credentials and role-based permissions.
              </p>
            </div>
            {users.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCreateUserForm(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
              <input
                type="text"
                required
                placeholder="Enter employee name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="apple-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
              <input
                type="text"
                required
                placeholder="Enter login username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="Enter password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="apple-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">SGT Role</label>
              <select
                value={newRole}
                onChange={(e) => {
                  const r = e.target.value as UserRole;
                  setNewRole(r);
                  setNewKycAccess(r === UserRole.OWNER || r === UserRole.ACCOUNTANT);
                }}
                className="apple-input w-full"
              >
                <option value={UserRole.OWNER}>OWNER (Admin)</option>
                <option value={UserRole.ACCOUNTANT}>ACCOUNTANT</option>
                <option value={UserRole.TRADING_STAFF}>TRADING_STAFF</option>
                <option value={UserRole.CASHIER}>CASHIER</option>
                <option value={UserRole.AUDITOR}>AUDITOR (Read-Only)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Create User
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Columns: Sensitive Farmer KYC Masking Verifier + Staff List */}
        <div className="lg:col-span-5 space-y-6">
          {/* Sensitive KYC Masking Inspector */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3.5">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Sensitive Farmer KYC Masking Verifier
                  </h2>
                  <p className="text-xs text-slate-500">
                    Viewing as: <span className="font-semibold">{activeUser.role}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleUnmaskToggle(kycSample.isMasked)}
                className="px-3 py-1.5 rounded-xl bg-blue-600/10 text-blue-700 hover:bg-blue-600/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                {kycSample.isMasked ? (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Unmask KYC
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Mask Again
                  </>
                )}
              </button>
            </div>

            {/* Dynamic Test Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Test Farmer Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter farmer name to test"
                  value={testFarmerName}
                  onChange={(e) => setTestFarmerName(e.target.value)}
                  className="apple-input w-full py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Test Bank Account No.
                </label>
                <input
                  type="text"
                  placeholder="Enter account digits"
                  value={testBankAccount}
                  onChange={(e) => setTestBankAccount(e.target.value)}
                  className="apple-input w-full py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Test Govt ID No.
                </label>
                <input
                  type="text"
                  placeholder="Enter ID digits"
                  value={testIdProof}
                  onChange={(e) => setTestIdProof(e.target.value)}
                  className="apple-input w-full py-1.5 text-xs font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleUnmaskToggle(false)}
              className="w-full py-2 rounded-xl bg-slate-200/70 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-colors"
            >
              Preview Masked Output
            </button>

            <div className="glass-subtle rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Farmer Name</span>
                <span className="font-semibold text-slate-900">{kycSample.farmerName}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Bank Account No.</span>
                <span
                  className={`font-mono font-bold ${
                    kycSample.isMasked ? 'text-slate-800' : 'text-blue-600'
                  }`}
                >
                  {kycSample.bankAccountNo}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Identity Proof ({kycSample.idProofType})</span>
                <span
                  className={`font-mono font-bold ${
                    kycSample.isMasked ? 'text-slate-800' : 'text-blue-600'
                  }`}
                >
                  {kycSample.idProofNo}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Stored Farmer Signature</span>
                <span className="font-medium text-slate-700">{kycSample.signatureStatus}</span>
              </div>
            </div>
          </div>

          {/* Staff Accounts List */}
          <div className="glass-panel rounded-3xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Production Staff Accounts ({users.length})
            </h3>
            {users.length === 0 ? (
              <p className="text-xs text-slate-500">
                No staff accounts in database (sample users purged). Use the “Create Production
                Staff User Account” form above to register your first Owner or staff user.
              </p>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUserToEdit(u)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      selectedTargetUser?.id === u.id
                        ? 'bg-white border-blue-500/40 shadow-xs'
                        : 'bg-white/50 border-slate-200/70 hover:bg-white/80'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{u.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Role: {u.role} · @{u.username} · {u.permissions.length} permissions
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-blue-600">Configure →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Columns: Granular Role & Per-User Permission Matrix */}
        <div className="lg:col-span-7 glass-panel rounded-3xl p-6 space-y-5">
          {!selectedTargetUser ? (
            <div className="py-12 text-center space-y-2">
              <Shield className="w-8 h-8 text-blue-600 mx-auto opacity-80" />
              <div className="text-sm font-semibold text-slate-800">
                No Staff User Selected
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create a production staff user above to configure granular permissions and sensitive
                KYC access controls.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSavePermissions} className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Granular Permission Matrix: {selectedTargetUser.fullName}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Role: {selectedTargetUser.role} · Individual User Override Support (SRS Sec
                      2.2)
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {ALL_PERMISSIONS.map((perm) => {
                  const checked = draftPermissions.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className="glass-subtle rounded-2xl p-3.5 flex items-start gap-3 cursor-pointer hover:bg-white/80 transition-colors"
                    >
                      <input
                        type="checkbox"
                        disabled={!canManageUsers}
                        checked={checked}
                        onChange={() => togglePermission(perm.key)}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 text-xs">
                        <div className="font-semibold text-slate-900">{perm.label}</div>
                        <div className="text-slate-500 mt-0.5">{perm.desc}</div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">{perm.key}</span>
                    </label>
                  );
                })}

                <label className="glass-subtle rounded-2xl p-3.5 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManageUsers}
                    checked={draftKycAccess}
                    onChange={(e) => setDraftKycAccess(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 text-xs">
                    <div className="font-semibold text-slate-900">
                      Allow Unmasking Sensitive Farmer Identity, Signature & Bank Vault
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Requires both this flag and VIEW_SENSITIVE_KYC permission.
                    </div>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  disabled={!canManageUsers}
                  placeholder="Audit reason for permission change (required)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="apple-input flex-1 text-xs"
                />
                <button
                  type="submit"
                  disabled={!canManageUsers}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Update User Permissions
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

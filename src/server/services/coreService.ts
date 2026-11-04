import crypto from 'crypto';
import type Database from 'better-sqlite3';
import {
  AccountRecord,
  AccountSubType,
  AccountType,
  AuditLogEntry,
  BankAccountRecord,
  BankStatementLineRecord,
  BillTransportDetails,
  CashCreditBillLineInput,
  CashCreditBillLineRecord,
  CashCreditBillRecord,
  CashFlowDirection,
  ChequeDirection,
  ChequeRecord,
  ChequeStatus,
  CommodityRecord,
  CommodityStockStatus,
  CompanySettings,
  DalaliKharidiLineInput,
  DalaliKharidiLineRecord,
  DalaliKharidiPattiRecord,
  DalaliVikriLineInput,
  DalaliVikriLineRecord,
  DalaliVikriPattiRecord,
  DayCountConvention,
  DocumentSeriesType,
  DuplicateWarningItem,
  FarmerDirectSettlementReceipt,
  FarmerPattiLineInput,
  FarmerPattiLineRecord,
  FarmerPattiRecord,
  InterestMethod,
  IssuedDocumentNumber,
  JournalEntryRecord,
  JournalLineInput,
  JournalLineRecord,
  KharidiPattiLineInput,
  KharidiPattiLineRecord,
  KharidiPattiRecord,
  KharidiPaymentMode,
  LedgerBucket,
  LoanPaymentMode,
  LoanRecord,
  LoanTransactionRecord,
  NumberSeriesRecord,
  PartyLedgerLine,
  PartyLedgerStatement,
  PartyRecord,
  PartyType,
  PattiSettlementPaymentMode,
  PermissionKey,
  RateUnit,
  RepaymentAllocationOrder,
  RoundingMode,
  StockMovementDirection,
  StockMovementRecord,
  StockOwnershipType,
  StockTrackingMode,
  UserProfile,
  UserRole,
  WeightUnit,
  BuyerCollectionRecord,
  CollectionTargetBillType,
  ComprehensiveFinancialReport,
  DayCloseRecord,
  ExpenseAccountingClassification,
  ExpenseCommitmentCategory,
  ExpenseCommitmentRecord,
  GstSalesPurchaseRegisterRow,
  SmsOutboxRecord,
  SystemBackupSnapshot,
  TrialBalanceLine,
  ValidationIssueRecord,
} from '../../shared/types';
import {
  calculateInterest,
  convertGramsToUnit,
  maskSensitiveValue,
  paiseToIndianWords,
} from '../../shared/math';
import { getTodayIST, hashPassword, ROLE_DEFAULT_PERMISSIONS, verifyPassword } from '../db';

const SENSITIVE_LOG_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'pin',
  'otp',
  'cvv',
  'bankAccountNoRaw',
  'bank_account_no_raw',
  'idProofNoRaw',
  'id_proof_no_raw',
  'netBankingPassword',
]);

/**
 * Recursively scrubs/masks sensitive values before writing to audit logs (SRS Sec 17.3 & 18.1).
 */
export function redactSensitiveForAudit(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!payload) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_LOG_KEYS.has(key) || /password|pin|otp|secret/i.test(key)) {
      result[key] = '[REDACTED_SENSITIVE]';
    } else if (/bank.*account.*no|id.*proof.*no|aadhaar/i.test(key) && typeof value === 'string') {
      result[key] = maskSensitiveValue(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? redactSensitiveForAudit(item as Record<string, unknown>)
          : item
      );
    } else if (value && typeof value === 'object') {
      result[key] = redactSensitiveForAudit(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class CorePlatformService {
  constructor(private db: Database.Database) {}

  public recordAuditLog(params: {
    entityType: string;
    entityId: string;
    action: string;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
    reason: string;
    approvedBy?: string | null;
    actor: UserProfile;
  }): AuditLogEntry {
    const id = `AUD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const safeBefore = redactSensitiveForAudit(params.beforeData ?? null);
    const safeAfter = redactSensitiveForAudit(params.afterData ?? null);

    this.db
      .prepare(
        `
      INSERT INTO audit_logs (
        id, entity_type, entity_id, action, before_json, after_json, reason, approved_by, user_id, user_name, user_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        params.entityType,
        params.entityId,
        params.action,
        safeBefore ? JSON.stringify(safeBefore) : null,
        safeAfter ? JSON.stringify(safeAfter) : null,
        params.reason,
        params.approvedBy ?? null,
        params.actor.id,
        params.actor.fullName,
        params.actor.role,
        createdAt
      );

    return {
      id,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      beforeData: safeBefore,
      afterData: safeAfter,
      reason: params.reason,
      approvedBy: params.approvedBy ?? null,
      userId: params.actor.id,
      userName: params.actor.fullName,
      userRole: params.actor.role,
      createdAt,
    };
  }

  public getAuditLogs(filters?: { entityType?: string; search?: string; limit?: number; actor?: UserProfile }): AuditLogEntry[] {
    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const params: unknown[] = [];
    if (filters?.entityType && filters.entityType !== 'ALL') {
      sql += ` AND entity_type = ?`;
      params.push(filters.entityType);
    }
    if (filters?.search) {
      sql += ` AND (entity_id LIKE ? OR action LIKE ? OR reason LIKE ? OR user_name LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY created_at DESC, rowid DESC LIMIT ?`;
    params.push(filters?.limit ?? 100);

    const isPrivileged =
      filters?.actor &&
      (filters.actor.role === UserRole.OWNER ||
        filters.actor.role === UserRole.ACCOUNTANT ||
        filters.actor.permissions.includes(PermissionKey.VIEW_SENSITIVE_KYC));

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const entityType = String(r.entity_type);
      let afterData = r.after_json ? JSON.parse(String(r.after_json)) : null;
      let beforeData = r.before_json ? JSON.parse(String(r.before_json)) : null;

      if (!isPrivileged && entityType === 'EXPENSE_COMMITMENT' && afterData?.isRestrictedPersonal) {
        afterData = {
          voucherNo: afterData.voucherNo,
          category: '[Restricted]',
          accountingClassification: '[Restricted]',
          totalAmountPaise: 0,
          isRestrictedPersonal: true,
        };
      }

      return {
        id: String(r.id),
        entityType,
        entityId: String(r.entity_id),
        action: String(r.action),
        beforeData,
        afterData,
        reason: String(r.reason),
        approvedBy: r.approved_by ? String(r.approved_by) : null,
        userId: String(r.user_id),
        userName: String(r.user_name),
        userRole: r.user_role as UserRole,
        createdAt: String(r.created_at),
      };
    });
  }

  public listUsers(): UserProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM users ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapUserRow(r));
  }

  public getUserById(userId: string): UserProfile | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  public authenticateUser(username: string, passwordPlain: string): UserProfile | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username = ? AND status = ?')
      .get(username, 'ACTIVE') as Record<string, unknown> | undefined;
    if (!row) return null;
    if (!verifyPassword(passwordPlain, String(row.password_hash))) {
      return null;
    }
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id);
    const user = this.mapUserRow({ ...row, last_login_at: now });
    this.recordAuditLog({
      entityType: 'AUTH',
      entityId: user.id,
      action: 'USER_LOGIN',
      afterData: { username: user.username, role: user.role },
      reason: 'Authenticated session start',
      actor: user,
    });
    return user;
  }

  public createUser(params: {
    id?: string;
    username: string;
    passwordPlain: string;
    fullName: string;
    role: UserRole;
    permissions?: PermissionKey[];
    canViewSensitiveKyc?: boolean;
    actor: UserProfile;
  }): UserProfile {
    this.requirePermission(params.actor, PermissionKey.MANAGE_USERS);
    const username = params.username.trim().toLowerCase();
    if (!username || !params.fullName.trim() || !params.passwordPlain) {
      throw new Error('Username, full name, and password are required to create a user.');
    }

    const existing = this.db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username) as Record<string, unknown> | undefined;
    if (existing) {
      throw new Error(`Username "${username}" already exists.`);
    }

    const id = params.id?.trim() || `USR-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const permissions = params.permissions ?? ROLE_DEFAULT_PERMISSIONS[params.role] ?? [];
    const canViewSensitiveKyc =
      params.canViewSensitiveKyc ??
      (params.role === UserRole.OWNER || params.role === UserRole.ACCOUNTANT);
    const nowIso = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO users (
        id, username, password_hash, full_name, role, permissions_json,
        can_view_sensitive_kyc, status, last_login_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NULL, ?)
    `
      )
      .run(
        id,
        username,
        hashPassword(params.passwordPlain),
        params.fullName.trim(),
        params.role,
        JSON.stringify(permissions),
        canViewSensitiveKyc ? 1 : 0,
        nowIso
      );

    const created = this.getUserById(id)!;
    this.recordAuditLog({
      entityType: 'USER_ACCOUNT',
      entityId: created.id,
      action: 'CREATE_USER',
      afterData: {
        username: created.username,
        fullName: created.fullName,
        role: created.role,
        canViewSensitiveKyc: created.canViewSensitiveKyc,
      },
      reason: `Created staff user account ${created.fullName} (${created.role})`,
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return created;
  }

  public listMigrations(): Array<{
    id: string;
    name: string;
    migrationId: string;
    migrationName: string;
    appliedAt: string;
    summary: Record<string, unknown> | null;
  }> {
    const tableExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get();
    if (!tableExists) return [];
    const rows = this.db
      .prepare('SELECT * FROM schema_migrations ORDER BY applied_at DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      migrationId: String(r.id),
      migrationName: String(r.name),
      appliedAt: String(r.applied_at),
      summary: r.summary_json ? JSON.parse(String(r.summary_json)) : null,
    }));
  }

  public updateUserPermissions(params: {
    targetUserId: string;
    permissions: PermissionKey[];
    canViewSensitiveKyc: boolean;
    reason: string;
    actor: UserProfile;
  }): UserProfile {
    this.requirePermission(params.actor, PermissionKey.MANAGE_USERS);
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('An audit reason is required to modify user permissions.');
    }

    const before = this.getUserById(params.targetUserId);
    if (!before) {
      throw new Error(`User not found: ${params.targetUserId}`);
    }

    this.db
      .prepare(
        `UPDATE users SET permissions_json = ?, can_view_sensitive_kyc = ? WHERE id = ?`
      )
      .run(
        JSON.stringify(params.permissions),
        params.canViewSensitiveKyc ? 1 : 0,
        params.targetUserId
      );

    const updated = this.getUserById(params.targetUserId)!;
    this.recordAuditLog({
      entityType: 'USER_PERMISSIONS',
      entityId: updated.id,
      action: 'UPDATE_PERMISSIONS',
      beforeData: {
        permissions: before.permissions,
        canViewSensitiveKyc: before.canViewSensitiveKyc,
      },
      afterData: {
        permissions: updated.permissions,
        canViewSensitiveKyc: updated.canViewSensitiveKyc,
      },
      reason: params.reason.trim(),
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return updated;
  }

  public changeUserPassword(params: {
    targetUserId: string;
    currentPasswordPlain?: string;
    newPasswordPlain: string;
    actor: UserProfile;
  }): { success: boolean; message: string } {
    const isSelf = params.actor.id === params.targetUserId;
    const isOwner = params.actor.role === UserRole.OWNER;

    if (!isSelf && !isOwner) {
      this.requirePermission(params.actor, PermissionKey.MANAGE_USERS);
    }

    if (!params.newPasswordPlain || params.newPasswordPlain.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    const userRow = this.db
      .prepare('SELECT id, password_hash, username, full_name FROM users WHERE id = ?')
      .get(params.targetUserId) as Record<string, unknown> | undefined;

    if (!userRow) {
      throw new Error(`User not found: ${params.targetUserId}`);
    }

    // If changing own password, verify current password unless admin override
    if (isSelf && params.currentPasswordPlain !== undefined) {
      if (!verifyPassword(params.currentPasswordPlain, String(userRow.password_hash))) {
        throw new Error('AUTHENTICATION_FAILED: Current password does not match.');
      }
    }

    const newHash = hashPassword(params.newPasswordPlain);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, params.targetUserId);

    this.recordAuditLog({
      entityType: 'USER_ACCOUNT',
      entityId: String(userRow.id),
      action: 'CHANGE_PASSWORD',
      reason: `Password changed for ${String(userRow.username)} by ${params.actor.fullName}`,
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return { success: true, message: 'Password updated successfully.' };
  }

  public hasPermission(actor: UserProfile, permission: PermissionKey): boolean {
    return Array.isArray(actor.permissions) && actor.permissions.includes(permission);
  }

  public requirePermission(actor: UserProfile, permission: PermissionKey): void {
    if (!actor.permissions.includes(permission)) {
      throw new Error(
        `PERMISSION_DENIED: Role "${actor.role}" (${actor.fullName}) lacks required permission "${permission}".`
      );
    }
  }

  public getCompanySettings(): CompanySettings {
    const row = this.db.prepare('SELECT * FROM company_settings WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    return {
      id: Number(row.id),
      legalName: String(row.legal_name),
      subtitleEn: String(row.subtitle_en),
      subtitleKn: String(row.subtitle_kn),
      address: String(row.address),
      villageCity: String(row.village_city),
      stateName: String(row.state_name),
      pincode: String(row.pincode),
      phonePrimary: String(row.phone_primary),
      phoneSecondary: String(row.phone_secondary),
      gstin: String(row.gstin),
      pan: String(row.pan),
      timezone: String(row.timezone),
      currentFinancialYear: String(row.current_fy),
      fyStartDate: String(row.fy_start_date),
      fyEndDate: String(row.fy_end_date),
      roundingMode: row.rounding_mode as CompanySettings['roundingMode'],
      stockValuationMethod: row.stock_valuation_method as CompanySettings['stockValuationMethod'],
      interestPolicy: JSON.parse(String(row.interest_policy_json)),
      commissionHamaliPolicy: JSON.parse(String(row.commission_hamali_policy_json)),
      customLabels: JSON.parse(String(row.custom_labels_json)),
      approvalThresholds: JSON.parse(String(row.approval_thresholds_json)),
      version: Number(row.version),
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    };
  }

  public updateCompanySettings(params: {
    updates: Partial<
      Omit<CompanySettings, 'id' | 'version' | 'updatedBy' | 'updatedAt'>
    >;
    expectedVersion: number;
    reason: string;
    actor: UserProfile;
  }): CompanySettings {
    // Check permission: rate/policy changes require MANAGE_RATES_AND_POLICIES or MANAGE_SETTINGS
    const policyKeys = new Set(['interestPolicy', 'commissionHamaliPolicy', 'roundingMode']);
    const updateKeys = Object.keys(params.updates).filter(
      (k) => params.updates[k as keyof typeof params.updates] !== undefined
    );
    const hasPolicyUpdate = updateKeys.some((k) => policyKeys.has(k));
    const hasGeneralSettingsUpdate = updateKeys.some((k) => !policyKeys.has(k));

    if (hasPolicyUpdate) {
      this.requirePermission(params.actor, PermissionKey.MANAGE_RATES_AND_POLICIES);
    }
    if (hasGeneralSettingsUpdate || updateKeys.length === 0) {
      this.requirePermission(params.actor, PermissionKey.MANAGE_SETTINGS);
    }

    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('A clear audit reason is mandatory when updating settings or rate policies.');
    }

    const tx = this.db.transaction(() => {
      const current = this.getCompanySettings();
      if (current.version !== params.expectedVersion) {
        throw new Error(
          `VERSION_CONFLICT: Settings were modified by another user (expected v${params.expectedVersion}, found v${current.version}). Refresh and retry.`
        );
      }

      const nextVersion = current.version + 1;
      const nowIso = new Date().toISOString();

      const merged: CompanySettings = {
        ...current,
        ...params.updates,
        interestPolicy: params.updates.interestPolicy
          ? { ...current.interestPolicy, ...params.updates.interestPolicy }
          : current.interestPolicy,
        commissionHamaliPolicy: params.updates.commissionHamaliPolicy
          ? { ...current.commissionHamaliPolicy, ...params.updates.commissionHamaliPolicy }
          : current.commissionHamaliPolicy,
        customLabels: params.updates.customLabels
          ? { ...current.customLabels, ...params.updates.customLabels }
          : current.customLabels,
        approvalThresholds: params.updates.approvalThresholds
          ? { ...current.approvalThresholds, ...params.updates.approvalThresholds }
          : current.approvalThresholds,
        version: nextVersion,
        updatedBy: params.actor.fullName,
        updatedAt: nowIso,
      };

      this.db
        .prepare(
          `
        UPDATE company_settings SET
          legal_name = ?, subtitle_en = ?, subtitle_kn = ?, address = ?, village_city = ?,
          state_name = ?, pincode = ?, phone_primary = ?, phone_secondary = ?, gstin = ?, pan = ?,
          current_fy = ?, fy_start_date = ?, fy_end_date = ?, rounding_mode = ?,
          stock_valuation_method = ?, interest_policy_json = ?, commission_hamali_policy_json = ?,
          custom_labels_json = ?, approval_thresholds_json = ?, version = ?, updated_by = ?, updated_at = ?
        WHERE id = 1 AND version = ?
      `
        )
        .run(
          merged.legalName,
          merged.subtitleEn,
          merged.subtitleKn,
          merged.address,
          merged.villageCity,
          merged.stateName,
          merged.pincode,
          merged.phonePrimary,
          merged.phoneSecondary,
          merged.gstin,
          merged.pan,
          merged.currentFinancialYear,
          merged.fyStartDate,
          merged.fyEndDate,
          merged.roundingMode,
          merged.stockValuationMethod,
          JSON.stringify(merged.interestPolicy),
          JSON.stringify(merged.commissionHamaliPolicy),
          JSON.stringify(merged.customLabels),
          JSON.stringify(merged.approvalThresholds),
          nextVersion,
          merged.updatedBy,
          nowIso,
          params.expectedVersion
        );

      // Save dated policy version snapshot for reproducible historical calculations (SRS Sec 5.2)
      this.db
        .prepare(
          `
        INSERT INTO policy_versions (id, version_no, effective_from, settings_snapshot_json, change_reason, changed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          `PV-${String(nextVersion).padStart(4, '0')}`,
          nextVersion,
          nowIso.slice(0, 10),
          JSON.stringify({
            interestPolicy: merged.interestPolicy,
            commissionHamaliPolicy: merged.commissionHamaliPolicy,
            customLabels: merged.customLabels,
            roundingMode: merged.roundingMode,
          }),
          params.reason.trim(),
          params.actor.fullName,
          nowIso
        );

      this.recordAuditLog({
        entityType: 'COMPANY_SETTINGS',
        entityId: 'SGT-SETTINGS-1',
        action: hasPolicyUpdate ? 'UPDATE_RATE_OR_ACCOUNTING_POLICY' : 'UPDATE_COMPANY_PROFILE',
        beforeData: current as unknown as Record<string, unknown>,
        afterData: merged as unknown as Record<string, unknown>,
        reason: params.reason.trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return merged;
    });

    return tx();
  }

  public getPolicyVersions() {
    const rows = this.db
      .prepare('SELECT * FROM policy_versions ORDER BY version_no DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      versionNo: Number(r.version_no),
      effectiveFrom: String(r.effective_from),
      snapshot: JSON.parse(String(r.settings_snapshot_json)),
      changeReason: String(r.change_reason),
      changedBy: String(r.changed_by),
      createdAt: String(r.created_at),
    }));
  }

  public listNumberSeries(financialYear?: string): NumberSeriesRecord[] {
    const fy = financialYear ?? this.getCompanySettings().currentFinancialYear;
    const rows = this.db
      .prepare('SELECT * FROM number_series WHERE financial_year = ? ORDER BY doc_type ASC')
      .all(fy) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSeriesRow(r));
  }

  public updateNumberSeriesConfig(params: {
    id: string;
    prefix: string;
    paddingLength: number;
    includeFyInNumber: boolean;
    reason: string;
    actor: UserProfile;
  }): NumberSeriesRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_SETTINGS);
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('Audit reason is required to modify document numbering series.');
    }

    const existing = this.db
      .prepare('SELECT * FROM number_series WHERE id = ?')
      .get(params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Number series not found: ${params.id}`);
    }

    const beforeMapped = this.mapSeriesRow(existing);
    const nowIso = new Date().toISOString();

    this.db
      .prepare(
        `
      UPDATE number_series
      SET prefix = ?, padding_length = ?, include_fy_in_number = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        params.prefix.trim(),
        Math.max(3, Math.min(10, params.paddingLength)),
        params.includeFyInNumber ? 1 : 0,
        nowIso,
        params.id
      );

    const afterRow = this.db
      .prepare('SELECT * FROM number_series WHERE id = ?')
      .get(params.id) as Record<string, unknown>;
    const afterMapped = this.mapSeriesRow(afterRow);

    this.recordAuditLog({
      entityType: 'NUMBER_SERIES',
      entityId: params.id,
      action: 'UPDATE_NUMBER_SERIES',
      beforeData: beforeMapped as unknown as Record<string, unknown>,
      afterData: afterMapped as unknown as Record<string, unknown>,
      reason: params.reason.trim(),
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return afterMapped;
  }

  /**
   * Atomically issues the next human-readable document number for a given docType and financial year.
   * Enforces idempotency so a retried request with the same idempotencyKey returns the existing number
   * without incrementing twice. Never reuses cancelled numbers (SRS Sec 3).
   */
  public allocateDocumentNumber(params: {
    docType: DocumentSeriesType;
    financialYear?: string;
    referenceEntityId: string;
    transactionDate: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): IssuedDocumentNumber {
    const tx = this.db.transaction(() => {
      if (params.idempotencyKey) {
        const existingIssued = this.db
          .prepare('SELECT * FROM issued_numbers_log WHERE idempotency_key = ?')
          .get(params.idempotencyKey) as Record<string, unknown> | undefined;
        if (existingIssued) {
          return this.mapIssuedNumberRow(existingIssued);
        }
      }

      const fy = params.financialYear ?? this.getCompanySettings().currentFinancialYear;
      const seriesRow = this.db
        .prepare('SELECT * FROM number_series WHERE doc_type = ? AND financial_year = ?')
        .get(params.docType, fy) as Record<string, unknown> | undefined;

      if (!seriesRow) {
        throw new Error(`Number series not configured for ${params.docType} in FY ${fy}`);
      }

      const nextSeq = Number(seriesRow.current_sequence) + 1;
      const padding = Number(seriesRow.padding_length);
      const includeFy = Boolean(seriesRow.include_fy_in_number);
      const prefix = String(seriesRow.prefix);

      const formattedNumber = this.formatDocNumber(prefix, fy, nextSeq, padding, includeFy);
      const nowIso = new Date().toISOString();

      this.db
        .prepare('UPDATE number_series SET current_sequence = ?, updated_at = ? WHERE id = ?')
        .run(nextSeq, nowIso, seriesRow.id);

      const logId = `NUM-${params.docType}-${fy}-${String(nextSeq).padStart(padding, '0')}`;
      this.db
        .prepare(
          `
        INSERT INTO issued_numbers_log (
          id, doc_type, financial_year, sequence_number, formatted_number, reference_entity_id,
          idempotency_key, transaction_date, status, issued_by, issued_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `
        )
        .run(
          logId,
          params.docType,
          fy,
          nextSeq,
          formattedNumber,
          params.referenceEntityId,
          params.idempotencyKey ?? null,
          params.transactionDate,
          params.actor.fullName,
          nowIso
        );

      const inserted = this.db
        .prepare('SELECT * FROM issued_numbers_log WHERE id = ?')
        .get(logId) as Record<string, unknown>;
      return this.mapIssuedNumberRow(inserted);
    });

    return tx();
  }

  /**
   * Cancels an issued document number while preserving its record and reason.
   * Cancelled numbers are NEVER recycled or decremented back into the sequence (SRS Sec 3).
   */
  public cancelIssuedDocumentNumber(params: {
    formattedNumber: string;
    cancelReason: string;
    actor: UserProfile;
  }): IssuedDocumentNumber {
    if (!params.cancelReason || params.cancelReason.trim().length < 3) {
      throw new Error('Cancellation reason is required.');
    }

    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM issued_numbers_log WHERE formatted_number = ?')
        .get(params.formattedNumber) as Record<string, unknown> | undefined;

      if (!existing) {
        throw new Error(`Issued document number not found: ${params.formattedNumber}`);
      }
      if (existing.status === 'CANCELLED') {
        throw new Error(`Document number ${params.formattedNumber} is already cancelled.`);
      }

      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `
        UPDATE issued_numbers_log
        SET status = 'CANCELLED', cancel_reason = ?, cancelled_by = ?, cancelled_at = ?
        WHERE formatted_number = ?
      `
        )
        .run(
          params.cancelReason.trim(),
          params.actor.fullName,
          nowIso,
          params.formattedNumber
        );

      const updated = this.db
        .prepare('SELECT * FROM issued_numbers_log WHERE formatted_number = ?')
        .get(params.formattedNumber) as Record<string, unknown>;
      const mapped = this.mapIssuedNumberRow(updated);

      this.recordAuditLog({
        entityType: 'ISSUED_DOCUMENT_NUMBER',
        entityId: mapped.formattedNumber,
        action: 'CANCEL_DOCUMENT_NUMBER',
        beforeData: { status: 'ACTIVE' },
        afterData: { status: 'CANCELLED', cancelReason: mapped.cancelReason },
        reason: params.cancelReason.trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return mapped;
    });

    return tx();
  }

  public listIssuedNumbers(docType?: DocumentSeriesType): IssuedDocumentNumber[] {
    let sql = `SELECT * FROM issued_numbers_log`;
    const params: unknown[] = [];
    if (docType) {
      sql += ` WHERE doc_type = ?`;
      params.push(docType);
    }
    sql += ` ORDER BY issued_at DESC, sequence_number DESC LIMIT 100`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapIssuedNumberRow(r));
  }

  /**
   * Formats sensitive Farmer KYC records according to actor's role/permissions (SRS Sec 2.2, 4.1, 18.1).
   * Accepts dynamic input fields instead of hardcoded person data.
   */
  public getRoleFilteredKycSample(
    actor: UserProfile,
    revealUnmasked = false,
    input?: {
      farmerId?: string;
      farmerName?: string;
      village?: string;
      bankName?: string;
      bankIfsc?: string;
      bankAccountNo?: string;
      idProofType?: string;
      idProofNo?: string;
    }
  ) {
    const record = {
      farmerId: input?.farmerId?.trim() || '—',
      farmerName: input?.farmerName?.trim() || '—',
      village: input?.village?.trim() || '—',
      bankName: input?.bankName?.trim() || '—',
      bankIfsc: input?.bankIfsc?.trim() || '—',
      bankAccountNo: input?.bankAccountNo?.trim() || '',
      idProofType: input?.idProofType?.trim() || 'Government ID',
      idProofNo: input?.idProofNo?.trim() || '',
      signatureStatus: 'Restricted Access',
    };

    const hasSensitiveAccess =
      actor.canViewSensitiveKyc &&
      actor.permissions.includes(PermissionKey.VIEW_SENSITIVE_KYC);

    if (revealUnmasked) {
      if (!hasSensitiveAccess) {
        throw new Error(
          `PERMISSION_DENIED: Role "${actor.role}" is not permitted to unmask sensitive farmer bank or identity documents.`
        );
      }
      this.recordAuditLog({
        entityType: 'FARMER_SENSITIVE_KYC',
        entityId: record.farmerId,
        action: 'UNMASK_SENSITIVE_DATA',
        afterData: { farmerId: record.farmerId, viewedByRole: actor.role },
        reason: 'Authorized inspection of unmasked farmer bank and identity details',
        actor,
      });
      return {
        ...record,
        bankAccountNo: record.bankAccountNo || '—',
        idProofNo: record.idProofNo || '—',
        signatureStatus: 'Authorized to View Signature Scan',
        isMasked: false,
      };
    }

    return {
      ...record,
      bankAccountNo: record.bankAccountNo ? maskSensitiveValue(record.bankAccountNo, 4) : '—',
      idProofNo: record.idProofNo ? maskSensitiveValue(record.idProofNo, 4) : '—',
      signatureStatus: hasSensitiveAccess
        ? 'Authorized (Masked on Ordinary Screen)'
        : 'Restricted (Hidden for this Role)',
      isMasked: true,
    };
  }

  /**
   * Computes live stock status and valuation across all agricultural commodities (SRS Sec 6.1, 6.3, 6.4).
   * Formula: Closing stock quantity = Opening stock + Goods In − Goods Out ± approved adjustments.
   * Tracks bags and weight separately and isolates SGT-owned stock from Dalali agency goods.
   */
  public listCommodityStockStatus(asOfDate?: string): CommodityStockStatus[] {
    const settings = this.getCompanySettings();
    const commodityRows = this.db
      .prepare('SELECT * FROM commodities ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;

    let movementSql = 'SELECT * FROM stock_movements';
    const movementParams: unknown[] = [];
    if (asOfDate) {
      movementSql += ' WHERE transaction_date <= ?';
      movementParams.push(asOfDate);
    }
    movementSql += ' ORDER BY transaction_date ASC, created_at ASC';

    const movementRows = this.db
      .prepare(movementSql)
      .all(...movementParams) as Array<Record<string, unknown>>;

    const movementsByCommodity = new Map<string, Array<Record<string, unknown>>>();
    for (const m of movementRows) {
      const cid = String(m.commodity_id);
      const list = movementsByCommodity.get(cid) ?? [];
      list.push(m);
      movementsByCommodity.set(cid, list);
    }

    return commodityRows.map((cRow) => {
      const commodity: CommodityRecord = {
        id: String(cRow.id),
        code: String(cRow.code),
        nameEn: String(cRow.name_en),
        nameKn: String(cRow.name_kn),
        gradeVariety: String(cRow.grade_variety),
        hsnCode: String(cRow.hsn_code),
        defaultUnit: (cRow.default_unit as WeightUnit) || WeightUnit.QUINTAL,
        referenceBagWeightKg:
          cRow.reference_bag_weight_kg !== null ? Number(cRow.reference_bag_weight_kg) : null,
        lowStockThresholdGrams: Number(cRow.low_stock_threshold_grams),
        lowStockThresholdQuintals: Number(cRow.low_stock_threshold_grams) / 100_000,
        standardRatePerQuintalPaise: Number(cRow.standard_rate_per_quintal_paise),
        stockTrackingMode: (cRow.stock_tracking_mode as StockTrackingMode) || 'BOTH',
        gstApplicableDefault: Boolean(cRow.gst_applicable_default),
        cgstRateBps: Number(cRow.cgst_rate_bps ?? 0),
        sgstRateBps: Number(cRow.sgst_rate_bps ?? 0),
        igstRateBps: Number(cRow.igst_rate_bps ?? 0),
        commissionRateBps: Number(cRow.commission_rate_bps ?? 0),
        hamaliPerBagPaise: Number(cRow.hamali_per_bag_paise ?? 0),
        status: (cRow.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
        createdAt: String(cRow.created_at),
      };

      const moves = movementsByCommodity.get(commodity.id) ?? [];

      let openingBags = 0;
      let openingWeightGrams = 0;
      let openingValuePaise = 0;

      let goodsInBags = 0;
      let goodsInWeightGrams = 0;
      let goodsInValuePaise = 0;

      let goodsOutBags = 0;
      let goodsOutWeightGrams = 0;
      let goodsOutSalesValuePaise = 0;

      let adjustmentBags = 0;
      let adjustmentWeightGrams = 0;

      let agencyHandledBags = 0;
      let agencyHandledWeightGrams = 0;

      for (const m of moves) {
        const ownership = String(m.ownership_type) as StockOwnershipType;
        const direction = String(m.direction) as StockMovementDirection;
        const bagsDelta = Number(m.bags_delta);
        const weightDelta = Number(m.weight_grams_delta);
        const totalVal = Number(m.total_value_paise);

        if (ownership !== 'SGT_OWNED') {
          // Dalali / Agency goods must not be treated as SGT-owned stock (SRS Sec 6.3 & AT-07)
          agencyHandledBags += Math.abs(bagsDelta);
          agencyHandledWeightGrams += Math.abs(weightDelta);
          continue;
        }

        if (direction === 'OPENING') {
          openingBags += bagsDelta;
          openingWeightGrams += weightDelta;
          openingValuePaise += totalVal;
        } else if (direction === 'GOODS_IN') {
          goodsInBags += bagsDelta;
          goodsInWeightGrams += weightDelta;
          goodsInValuePaise += totalVal;
        } else if (direction === 'GOODS_OUT') {
          goodsOutBags += Math.abs(bagsDelta);
          goodsOutWeightGrams += Math.abs(weightDelta);
          goodsOutSalesValuePaise += totalVal;
        } else if (direction === 'ADJUSTMENT') {
          adjustmentBags += bagsDelta;
          adjustmentWeightGrams += weightDelta;
        }
      }

      const closingOwnedBags = openingBags + goodsInBags - goodsOutBags + adjustmentBags;
      const closingOwnedWeightGrams =
        openingWeightGrams + goodsInWeightGrams - goodsOutWeightGrams + adjustmentWeightGrams;

      // Weighted average valuation per Quintal (100,000 grams) across Opening + Goods In
      const totalInflowGrams = openingWeightGrams + goodsInWeightGrams;
      const totalInflowValuePaise = openingValuePaise + goodsInValuePaise;
      const weightedAvgRatePerQuintalPaise =
        totalInflowGrams > 0
          ? Math.round((totalInflowValuePaise * 100_000) / totalInflowGrams)
          : commodity.standardRatePerQuintalPaise;

      const closingStockValuationPaise =
        closingOwnedWeightGrams > 0
          ? Math.round((closingOwnedWeightGrams / 100_000) * weightedAvgRatePerQuintalPaise)
          : 0;

      return {
        commodity,
        openingBags,
        openingWeightGrams,
        goodsInBags,
        goodsInWeightGrams,
        goodsInValuePaise,
        goodsOutBags,
        goodsOutWeightGrams,
        goodsOutSalesValuePaise,
        adjustmentBags,
        adjustmentWeightGrams,
        closingOwnedBags,
        closingOwnedWeightGrams,
        closingOwnedWeightQuintals: convertGramsToUnit(closingOwnedWeightGrams, WeightUnit.QUINTAL),
        closingOwnedWeightKg: convertGramsToUnit(closingOwnedWeightGrams, WeightUnit.KG),
        weightedAvgRatePerQuintalPaise,
        closingStockValuationPaise,
        agencyHandledBags,
        agencyHandledWeightGrams,
        isLowStock:
          commodity.lowStockThresholdGrams > 0 &&
          closingOwnedWeightGrams <= commodity.lowStockThresholdGrams,
        isNegativeStockException: closingOwnedWeightGrams < 0 || closingOwnedBags < 0,
        valuationMethod: settings.stockValuationMethod,
      };
    });
  }

  public listStockMovements(commodityId?: string): StockMovementRecord[] {
    let sql = `SELECT * FROM stock_movements`;
    const params: unknown[] = [];
    if (commodityId) {
      sql += ` WHERE commodity_id = ?`;
      params.push(commodityId);
    }
    sql += ` ORDER BY transaction_date DESC, created_at DESC LIMIT 100`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapStockMovementRow(r));
  }

  private mapStockMovementRow(r: Record<string, unknown>): StockMovementRecord {
    return {
      id: String(r.id),
      movementNo: String(r.movement_no),
      commodityId: String(r.commodity_id),
      transactionDate: String(r.transaction_date),
      direction: r.direction as StockMovementDirection,
      ownershipType: r.ownership_type as StockOwnershipType,
      bagsDelta: Number(r.bags_delta),
      weightGramsDelta: Number(r.weight_grams_delta),
      grossWeightGrams: Number(r.gross_weight_grams ?? Math.abs(Number(r.weight_grams_delta))),
      tareWeightGrams: Number(r.tare_weight_grams ?? 0),
      moisturePct: Number(r.moisture_pct ?? 0),
      ratePerQuintalPaise: Number(r.rate_per_quintal_paise),
      totalValuePaise: Number(r.total_value_paise),
      gstAmountPaise: Number(r.gst_amount_paise ?? 0),
      partyId: r.party_id ? String(r.party_id) : null,
      partyName: String(r.party_name),
      settlementMode: (r.settlement_mode as 'CASH' | 'BANK' | 'CREDIT') || 'CREDIT',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      journalEntryId: r.journal_entry_id ? String(r.journal_entry_id) : null,
      referenceBillNo: String(r.reference_bill_no),
      vehicleNo: String(r.vehicle_no ?? ''),
      reason: String(r.reason),
      approvedBy: r.approved_by ? String(r.approved_by) : null,
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  public createCommodity(params: {
    code: string;
    nameEn: string;
    nameKn: string;
    gradeVariety: string;
    hsnCode: string;
    referenceBagWeightKg: number | null;
    lowStockThresholdQuintals: number;
    standardRatePerQuintalPaise: number;
    stockTrackingMode?: StockTrackingMode;
    gstApplicableDefault?: boolean;
    cgstRateBps?: number;
    sgstRateBps?: number;
    igstRateBps?: number;
    commissionRateBps?: number;
    hamaliPerBagPaise?: number;
    actor: UserProfile;
  }): CommodityRecord {
    const canManageCommodity =
      params.actor.permissions.includes(PermissionKey.MANAGE_SETTINGS) ||
      params.actor.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);
    if (!canManageCommodity) {
      this.requirePermission(params.actor, PermissionKey.MANAGE_SETTINGS);
    }

    const nameEnTrimmed = (params.nameEn || '').trim();
    if (!nameEnTrimmed) {
      throw new Error('Commodity English name is required.');
    }

    let code = (params.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    if (!code) {
      code = nameEnTrimmed
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10);
      if (!code) {
        code = `CROP${Date.now().toString().slice(-4)}`;
      }
    }

    const existingWithCode = this.db
      .prepare('SELECT id, name_en FROM commodities WHERE code = ?')
      .get(code) as { id: string; name_en: string } | undefined;
    if (existingWithCode) {
      throw new Error(
        `Commodity code "${code}" is already registered (${existingWithCode.name_en}). Please enter a distinct code.`
      );
    }

    const id = `CMD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const lowStockGrams = Math.round((params.lowStockThresholdQuintals || 0) * 100_000);
    const trackingMode = params.stockTrackingMode ?? 'BOTH';
    const gstApplicable = params.gstApplicableDefault ? 1 : 0;

    this.db
      .prepare(
        `
      INSERT INTO commodities (
        id, code, name_en, name_kn, grade_variety, hsn_code, default_unit,
        reference_bag_weight_kg, low_stock_threshold_grams, standard_rate_per_quintal_paise,
        stock_tracking_mode, gst_applicable_default, cgst_rate_bps, sgst_rate_bps, igst_rate_bps,
        commission_rate_bps, hamali_per_bag_paise, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUINTAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `
      )
      .run(
        id,
        code,
        params.nameEn.trim(),
        params.nameKn.trim() || params.nameEn.trim(),
        params.gradeVariety.trim(),
        params.hsnCode.trim(),
        params.referenceBagWeightKg,
        lowStockGrams,
        params.standardRatePerQuintalPaise || 0,
        trackingMode,
        gstApplicable,
        params.cgstRateBps ?? 0,
        params.sgstRateBps ?? 0,
        params.igstRateBps ?? 0,
        params.commissionRateBps ?? 0,
        params.hamaliPerBagPaise ?? 0,
        nowIso
      );

    this.recordAuditLog({
      entityType: 'COMMODITY_MASTER',
      entityId: id,
      action: 'CREATE_COMMODITY',
      afterData: { code, nameEn: params.nameEn, ratePaise: params.standardRatePerQuintalPaise },
      reason: `Added new commodity ${params.nameEn} (${code}) to Commodity Master`,
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return {
      id,
      code,
      nameEn: params.nameEn.trim(),
      nameKn: params.nameKn.trim() || params.nameEn.trim(),
      gradeVariety: params.gradeVariety.trim(),
      hsnCode: params.hsnCode.trim(),
      defaultUnit: WeightUnit.QUINTAL,
      referenceBagWeightKg: params.referenceBagWeightKg,
      lowStockThresholdGrams: lowStockGrams,
      lowStockThresholdQuintals: lowStockGrams / 100_000,
      standardRatePerQuintalPaise: params.standardRatePerQuintalPaise || 0,
      stockTrackingMode: trackingMode,
      gstApplicableDefault: Boolean(gstApplicable),
      cgstRateBps: params.cgstRateBps ?? 0,
      sgstRateBps: params.sgstRateBps ?? 0,
      igstRateBps: params.igstRateBps ?? 0,
      commissionRateBps: params.commissionRateBps ?? 0,
      hamaliPerBagPaise: params.hamaliPerBagPaise ?? 0,
      status: 'ACTIVE',
      createdAt: nowIso,
    };
  }

  /**
   * Optional user-triggered helper to populate the 11 standard agricultural crops from SRS Section 6.1
   * with ₹0 rates and 0 stock (never auto-seeded on startup).
   */
  public seedSrsStandardCommodities(actor: UserProfile): CommodityRecord[] {
    const canManageCommodity =
      actor.permissions.includes(PermissionKey.MANAGE_SETTINGS) ||
      actor.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);
    if (!canManageCommodity) {
      this.requirePermission(actor, PermissionKey.MANAGE_SETTINGS);
    }
    const standardCrops = [
      { code: 'SUNFLOWER', en: 'Sunflower', kn: 'ಸೂರ್ಯಕಾಂತಿ', grade: 'FAQ / Hybrid', hsn: '1206' },
      { code: 'MAIZE', en: 'Maize (Corn)', kn: 'ಮೆಕ್ಕೆಜೋಳ', grade: 'Yellow FAQ', hsn: '1005' },
      { code: 'COTTON', en: 'Cotton (Kapas)', kn: 'ಹತ್ತಿ', grade: 'Long Staple', hsn: '5201' },
      { code: 'PADDY', en: 'Paddy', kn: 'ಭತ್ತ', grade: 'Sona Masoori / IR-64', hsn: '1006' },
      { code: 'SOYBEAN', en: 'Soybean', kn: 'ಸೋಯಾಬೀನ್', grade: 'Yellow Grade-A', hsn: '1201' },
      { code: 'GROUNDNUT', en: 'Groundnut', kn: 'ಶೇಂಗಾ (ಕಡಲೆಕಾಯಿ)', grade: 'Pod / Bold', hsn: '1202' },
      { code: 'ALSANDI', en: 'Alsandi (Cowpea)', kn: 'ಅಲಸಂದಿ', grade: 'Local FAQ', hsn: '0713' },
      { code: 'RAGI', en: 'Ragi (Finger Millet)', kn: 'ರಾಗಿ', grade: 'Red FAQ', hsn: '1008' },
      { code: 'KHARADI', en: 'Kharadi', kn: 'ಖರಡಿ', grade: 'Mandi Standard', hsn: '1207' },
      { code: 'SAFFLOWER', en: 'Safflower (Kusube)', kn: 'ಕುಸುಬೆ', grade: 'A-Grade Oilseed', hsn: '1207' },
      { code: 'KADLI', en: 'Kadli (Bengal Gram)', kn: 'ಕಡಲೆ (ಚನ್ನಾ)', grade: 'Annigeri / Desi', hsn: '0713' },
    ];

    const created: CommodityRecord[] = [];
    for (const crop of standardCrops) {
      const exists = this.db
        .prepare('SELECT id FROM commodities WHERE code = ?')
        .get(crop.code) as Record<string, unknown> | undefined;
      if (!exists) {
        created.push(
          this.createCommodity({
            code: crop.code,
            nameEn: crop.en,
            nameKn: crop.kn,
            gradeVariety: crop.grade,
            hsnCode: crop.hsn,
            referenceBagWeightKg: null,
            lowStockThresholdQuintals: 0,
            standardRatePerQuintalPaise: 0,
            actor,
          })
        );
      }
    }
    return created;
  }

  public updateCommodity(params: {
    id: string;
    nameEn: string;
    nameKn: string;
    gradeVariety: string;
    hsnCode: string;
    referenceBagWeightKg: number | null;
    lowStockThresholdQuintals: number;
    standardRatePerQuintalPaise: number;
    status: 'ACTIVE' | 'INACTIVE';
    reason: string;
    actor: UserProfile;
  }): CommodityRecord {
    const canManageCommodity =
      params.actor.permissions.includes(PermissionKey.MANAGE_SETTINGS) ||
      params.actor.permissions.includes(PermissionKey.CREATE_TRADING_BILLS);
    if (!canManageCommodity) {
      this.requirePermission(params.actor, PermissionKey.MANAGE_SETTINGS);
    }
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('Audit reason is required to modify or deactivate a commodity.');
    }

    const existing = this.db
      .prepare('SELECT * FROM commodities WHERE id = ?')
      .get(params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Commodity not found: ${params.id}`);
    }

    const lowStockGrams = Math.round((params.lowStockThresholdQuintals || 0) * 100_000);
    this.db
      .prepare(
        `
      UPDATE commodities
      SET name_en = ?, name_kn = ?, grade_variety = ?, hsn_code = ?,
          reference_bag_weight_kg = ?, low_stock_threshold_grams = ?,
          standard_rate_per_quintal_paise = ?, status = ?
      WHERE id = ?
    `
      )
      .run(
        params.nameEn.trim(),
        params.nameKn.trim(),
        params.gradeVariety.trim(),
        params.hsnCode.trim(),
        params.referenceBagWeightKg,
        lowStockGrams,
        params.standardRatePerQuintalPaise || 0,
        params.status,
        params.id
      );

    this.recordAuditLog({
      entityType: 'COMMODITY_MASTER',
      entityId: params.id,
      action: 'UPDATE_COMMODITY',
      beforeData: {
        nameEn: existing.name_en,
        gradeVariety: existing.grade_variety,
        hsnCode: existing.hsn_code,
        ratePaise: existing.standard_rate_per_quintal_paise,
        status: existing.status,
      },
      afterData: {
        nameEn: params.nameEn.trim(),
        gradeVariety: params.gradeVariety.trim(),
        hsnCode: params.hsnCode.trim(),
        ratePaise: params.standardRatePerQuintalPaise || 0,
        status: params.status,
      },
      reason: params.reason.trim(),
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    const updated = this.db
      .prepare('SELECT * FROM commodities WHERE id = ?')
      .get(params.id) as Record<string, unknown>;

    return {
      id: String(updated.id),
      code: String(updated.code),
      nameEn: String(updated.name_en),
      nameKn: String(updated.name_kn),
      gradeVariety: String(updated.grade_variety),
      hsnCode: String(updated.hsn_code),
      defaultUnit: (updated.default_unit as WeightUnit) || WeightUnit.QUINTAL,
      referenceBagWeightKg:
        updated.reference_bag_weight_kg !== null ? Number(updated.reference_bag_weight_kg) : null,
      lowStockThresholdGrams: Number(updated.low_stock_threshold_grams),
      lowStockThresholdQuintals: Number(updated.low_stock_threshold_grams) / 100_000,
      standardRatePerQuintalPaise: Number(updated.standard_rate_per_quintal_paise),
      status: (updated.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
      createdAt: String(updated.created_at),
    };
  }

  /**
   * CHUNK 4: Atomic Commodity Purchase (AT-05), Sale (AT-06), Dalali Agency Lot (AT-07),
   * and Stock Adjustment Engine integrated with the Central Khata Book.
   */
  public recordStockMovement(params: {
    commodityId: string;
    transactionDate: string;
    direction: StockMovementDirection;
    ownershipType: StockOwnershipType;
    bags: number;
    weightGrams: number;
    grossWeightGrams?: number;
    tareWeightGrams?: number;
    moisturePct?: number;
    ratePerQuintalPaise: number;
    gstAmountPaise?: number;
    partyId?: string | null;
    partyName: string;
    settlementMode?: 'CASH' | 'BANK' | 'CREDIT';
    bankAccountId?: string | null;
    referenceBillNo?: string;
    vehicleNo?: string;
    idempotencyKey?: string;
    reason: string;
    actor: UserProfile;
  }): StockMovementRecord {
    // Closed-day check unconditionally before any stock movement
    this.assertDayOpenForPosting(params.transactionDate);

    // Stock adjustments require APPROVE_CORRECTIONS permission and an audit reason (SRS Sec 6.3 & 17.3)
    if (params.direction === 'ADJUSTMENT') {
      this.requirePermission(params.actor, PermissionKey.APPROVE_CORRECTIONS);
      if (!params.reason || params.reason.trim().length < 3) {
        throw new Error('Authorized stock adjustments require a clear audit reason.');
      }
    } else {
      this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);
    }

    const tx = this.db.transaction(() => {
      // Idempotency check (AT-13)
      if (params.idempotencyKey) {
        const existingMove = this.db
          .prepare('SELECT * FROM stock_movements WHERE idempotency_key = ?')
          .get(params.idempotencyKey) as Record<string, unknown> | undefined;
        if (existingMove) {
          return this.mapStockMovementRow(existingMove);
        }
      }

      const currentStatus = this.listCommodityStockStatus().find(
        (s) => s.commodity.id === params.commodityId
      );
      if (!currentStatus) {
        throw new Error(`Commodity not found: ${params.commodityId}`);
      }

      // Check insufficient stock on SGT-owned Goods Out (SRS Sec 6.2 & AT-06)
      if (params.ownershipType === 'SGT_OWNED' && params.direction === 'GOODS_OUT') {
        const absGrams = Math.abs(params.weightGrams);
        const absBags = Math.abs(params.bags);
        if (
          absGrams > currentStatus.closingOwnedWeightGrams ||
          absBags > currentStatus.closingOwnedBags
        ) {
          throw new Error(
            `INSUFFICIENT_STOCK: Sale/Goods Out (${(absGrams / 100_000).toFixed(2)} Q / ${absBags} bags) exceeds available SGT-owned stock (${currentStatus.closingOwnedWeightQuintals} Q / ${currentStatus.closingOwnedBags} bags) for ${currentStatus.commodity.nameEn}.`
          );
        }
      }

      const docSeriesType =
        params.direction === 'GOODS_IN'
          ? DocumentSeriesType.GOODS_IN
          : params.direction === 'GOODS_OUT'
          ? DocumentSeriesType.GOODS_OUT
          : DocumentSeriesType.STOCK_ADJ;

      const issuedNo = this.allocateDocumentNumber({
        docType: docSeriesType,
        referenceEntityId: `STK-${params.commodityId}-${Date.now()}`,
        transactionDate: params.transactionDate,
        actor: params.actor,
      });

      const signedBags =
        params.direction === 'GOODS_OUT'
          ? -Math.abs(params.bags)
          : params.direction === 'GOODS_IN' || params.direction === 'OPENING'
          ? Math.abs(params.bags)
          : params.bags;

      const signedWeightGrams =
        params.direction === 'GOODS_OUT'
          ? -Math.abs(params.weightGrams)
          : params.direction === 'GOODS_IN' || params.direction === 'OPENING'
          ? Math.abs(params.weightGrams)
          : params.weightGrams;

      const totalValuePaise = Math.round(
        (Math.abs(signedWeightGrams) / 100_000) * params.ratePerQuintalPaise
      );
      const gstAmountPaise = Math.max(0, Math.round(params.gstAmountPaise ?? 0));
      const settlementMode = params.settlementMode ?? 'CREDIT';

      // Resolve optional registered party
      let resolvedPartyName = params.partyName.trim() || 'Mandi Counter Party';
      let resolvedPartyType: PartyType = 'OTHER';
      if (params.partyId) {
        const partyRow = this.db
          .prepare('SELECT name, party_type FROM parties WHERE id = ?')
          .get(params.partyId) as { name: string; party_type: PartyType } | undefined;
        if (partyRow) {
          resolvedPartyName = partyRow.name;
          resolvedPartyType = partyRow.party_type;
        }
      }

      // Atomically post financial impact to Central Khata Book for SGT-owned Purchases (AT-05) & Sales (AT-06)
      // Agency/Dalali stock movements (AT-07) do NOT alter SGT-owned inventory valuation or purchase/sales accounts.
      let journalEntryId: string | null = null;
      if (params.ownershipType === 'SGT_OWNED' && totalValuePaise > 0) {
        const totalInvoicePaise = totalValuePaise + gstAmountPaise;
        if (params.direction === 'GOODS_IN') {
          const creditAccountCode =
            settlementMode === 'CASH'
              ? '1001'
              : settlementMode === 'BANK'
              ? '1002'
              : resolvedPartyType === 'FARMER'
              ? '1101'
              : '2001';
          const cashDir: CashFlowDirection =
            settlementMode === 'CASH'
              ? 'CASH_OUT'
              : settlementMode === 'BANK'
              ? 'BANK_OUT'
              : 'NON_CASH';

          const lines: JournalLineInput[] = [
            {
              accountCode: '5001',
              debitPaise: totalValuePaise,
              creditPaise: 0,
              cashDirection: 'NON_CASH',
              lineNote: `Purchase of ${currentStatus.commodity.nameEn} (${Math.abs(signedBags)} bags / ${(Math.abs(signedWeightGrams) / 100_000).toFixed(2)} Q)`,
            },
          ];
          if (gstAmountPaise > 0) {
            lines.push({
              accountCode: '2101',
              debitPaise: gstAmountPaise,
              creditPaise: 0,
              ledgerBucket: 'TAX',
              cashDirection: 'NON_CASH',
              lineNote: `Input GST on ${issuedNo.formattedNumber}`,
            });
          }
          lines.push({
            accountCode: creditAccountCode,
            partyId: settlementMode === 'CREDIT' ? params.partyId ?? null : params.partyId ?? null,
            bankAccountId: settlementMode === 'BANK' ? params.bankAccountId ?? null : null,
            ledgerBucket: resolvedPartyType === 'FARMER' ? 'CROP_PROCEEDS' : 'GENERAL',
            debitPaise: 0,
            creditPaise: totalInvoicePaise,
            cashDirection: cashDir,
            lineNote: `Payable/Paid to ${resolvedPartyName} (${issuedNo.formattedNumber})`,
          });

          const je = this.postJournalEntry({
            transactionDate: params.transactionDate,
            sourceType: 'COMMODITY_PURCHASE',
            sourceId: issuedNo.formattedNumber,
            idempotencyKey: params.idempotencyKey
              ? `JE-${params.idempotencyKey}`
              : `JE-STK-${issuedNo.formattedNumber}`,
            narration: `Owned Commodity Purchase (${currentStatus.commodity.nameEn}) from ${resolvedPartyName} — Ref ${params.referenceBillNo || issuedNo.formattedNumber}`,
            lines,
            actor: params.actor,
          });
          journalEntryId = je.id;
        } else if (params.direction === 'GOODS_OUT') {
          const debitAccountCode =
            settlementMode === 'CASH'
              ? '1001'
              : settlementMode === 'BANK'
              ? '1002'
              : '1102';
          const cashDir: CashFlowDirection =
            settlementMode === 'CASH'
              ? 'CASH_IN'
              : settlementMode === 'BANK'
              ? 'BANK_IN'
              : 'NON_CASH';

          const lines: JournalLineInput[] = [
            {
              accountCode: debitAccountCode,
              partyId: params.partyId ?? null,
              bankAccountId: settlementMode === 'BANK' ? params.bankAccountId ?? null : null,
              ledgerBucket: 'INVOICE_RECEIVABLE',
              debitPaise: totalInvoicePaise,
              creditPaise: 0,
              cashDirection: cashDir,
              lineNote: `Receivable/Received from ${resolvedPartyName} (${issuedNo.formattedNumber})`,
            },
            {
              accountCode: '4001',
              debitPaise: 0,
              creditPaise: totalValuePaise,
              cashDirection: 'NON_CASH',
              lineNote: `Sale of ${currentStatus.commodity.nameEn} (${Math.abs(signedBags)} bags / ${(Math.abs(signedWeightGrams) / 100_000).toFixed(2)} Q)`,
            },
          ];
          if (gstAmountPaise > 0) {
            lines.push({
              accountCode: '2101',
              debitPaise: 0,
              creditPaise: gstAmountPaise,
              ledgerBucket: 'TAX',
              cashDirection: 'NON_CASH',
              lineNote: `Output GST on ${issuedNo.formattedNumber}`,
            });
          }

          const je = this.postJournalEntry({
            transactionDate: params.transactionDate,
            sourceType: 'COMMODITY_SALE',
            sourceId: issuedNo.formattedNumber,
            idempotencyKey: params.idempotencyKey
              ? `JE-${params.idempotencyKey}`
              : `JE-STK-${issuedNo.formattedNumber}`,
            narration: `Owned Commodity Sale (${currentStatus.commodity.nameEn}) to ${resolvedPartyName} — Ref ${params.referenceBillNo || issuedNo.formattedNumber}`,
            lines,
            actor: params.actor,
          });
          journalEntryId = je.id;
        }
      }

      const id = `MOV-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO stock_movements (
          id, movement_no, commodity_id, transaction_date, direction, ownership_type,
          bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
          rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
          settlement_mode, bank_account_id, journal_entry_id, idempotency_key,
          reference_bill_no, vehicle_no, reason, approved_by, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          id,
          issuedNo.formattedNumber,
          params.commodityId,
          params.transactionDate,
          params.direction,
          params.ownershipType,
          signedBags,
          signedWeightGrams,
          params.grossWeightGrams ?? Math.abs(signedWeightGrams),
          params.tareWeightGrams ?? 0,
          params.moisturePct ?? 0,
          params.ratePerQuintalPaise,
          totalValuePaise,
          gstAmountPaise,
          params.partyId ?? null,
          resolvedPartyName,
          settlementMode,
          params.bankAccountId ?? null,
          journalEntryId,
          params.idempotencyKey ?? null,
          params.referenceBillNo?.trim() || issuedNo.formattedNumber,
          params.vehicleNo?.trim() || '',
          params.reason.trim() || `${params.direction} recorded`,
          params.direction === 'ADJUSTMENT' ? params.actor.fullName : null,
          params.actor.fullName,
          nowIso
        );

      this.recordAuditLog({
        entityType: 'STOCK_MOVEMENT',
        entityId: issuedNo.formattedNumber,
        action: `RECORD_${params.direction}_${params.ownershipType}`,
        beforeData: {
          closingOwnedBags: currentStatus.closingOwnedBags,
          closingOwnedWeightGrams: currentStatus.closingOwnedWeightGrams,
        },
        afterData: {
          commodity: currentStatus.commodity.nameEn,
          direction: params.direction,
          ownershipType: params.ownershipType,
          bagsDelta: signedBags,
          weightGramsDelta: signedWeightGrams,
          totalValuePaise,
          journalEntryId,
        },
        reason: params.reason.trim() || `${params.direction} movement`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      const inserted = this.db
        .prepare('SELECT * FROM stock_movements WHERE id = ?')
        .get(id) as Record<string, unknown>;
      return this.mapStockMovementRow(inserted);
    });

    return tx();
  }

  // ==========================================================================
  // CHUNK 2: FARMER REGISTRATION, PARTY MASTER & DUPLICATE DETECTION (AT-01)
  // ==========================================================================

  public checkPartyDuplicates(params: {
    name: string;
    village: string;
    phonePrimary: string;
    phoneSecondary?: string;
    bankAccountNo?: string;
    idProofNo?: string;
    excludePartyId?: string;
  }): DuplicateWarningItem[] {
    const warnings: DuplicateWarningItem[] = [];
    const rows = this.db.prepare('SELECT * FROM parties').all() as Array<Record<string, unknown>>;

    const normName = params.name.trim().toLowerCase();
    const normVillage = params.village.trim().toLowerCase();
    const normPhone1 = params.phonePrimary.replace(/\D/g, '');
    const normPhone2 = (params.phoneSecondary || '').replace(/\D/g, '');
    const normBank = (params.bankAccountNo || '').trim().toUpperCase();
    const normIdProof = (params.idProofNo || '').trim().toUpperCase();

    for (const r of rows) {
      const pid = String(r.id);
      if (params.excludePartyId && pid === params.excludePartyId) continue;

      const pCode = String(r.party_code);
      const pName = String(r.name);
      const pVillage = String(r.village);
      const rPhone1 = String(r.phone_primary || '').replace(/\D/g, '');
      const rPhone2 = String(r.phone_secondary || '').replace(/\D/g, '');
      const rBank = String(r.bank_account_no_raw || '').trim().toUpperCase();
      const rIdProof = String(r.id_proof_no_raw || '').trim().toUpperCase();

      if (
        normPhone1.length >= 6 &&
        (normPhone1 === rPhone1 || normPhone1 === rPhone2 || (normPhone2.length >= 6 && (normPhone2 === rPhone1 || normPhone2 === rPhone2)))
      ) {
        warnings.push({
          matchType: 'PHONE_MATCH',
          existingPartyId: pid,
          existingPartyCode: pCode,
          existingName: pName,
          existingVillage: pVillage,
          matchedValueSummary: params.phonePrimary,
          message: `Phone number ${params.phonePrimary} matches existing party ${pName} (${pCode}, ${pVillage || 'No Village'}).`,
        });
      }

      if (normBank.length >= 5 && normBank === rBank) {
        warnings.push({
          matchType: 'BANK_ACCOUNT_MATCH',
          existingPartyId: pid,
          existingPartyCode: pCode,
          existingName: pName,
          existingVillage: pVillage,
          matchedValueSummary: maskSensitiveValue(normBank, 4),
          message: `Bank account ${maskSensitiveValue(normBank, 4)} is already registered to ${pName} (${pCode}).`,
        });
      }

      if (normIdProof.length >= 4 && normIdProof === rIdProof) {
        warnings.push({
          matchType: 'ID_PROOF_MATCH',
          existingPartyId: pid,
          existingPartyCode: pCode,
          existingName: pName,
          existingVillage: pVillage,
          matchedValueSummary: maskSensitiveValue(normIdProof, 4),
          message: `Identity proof ${maskSensitiveValue(normIdProof, 4)} is already registered to ${pName} (${pCode}).`,
        });
      }

      if (
        normName.length >= 2 &&
        normVillage.length >= 2 &&
        normName === pName.trim().toLowerCase() &&
        normVillage === pVillage.trim().toLowerCase()
      ) {
        warnings.push({
          matchType: 'NAME_VILLAGE_MATCH',
          existingPartyId: pid,
          existingPartyCode: pCode,
          existingName: pName,
          existingVillage: pVillage,
          matchedValueSummary: `${params.name} (${params.village})`,
          message: `A farmer/party with the same Name + Village "${pName} (${pVillage})" already exists (${pCode}).`,
        });
      }
    }

    return warnings;
  }

  public registerParty(params: {
    partyType: PartyType;
    name: string;
    village?: string;
    address?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    smsConsent?: boolean;
    gstin?: string;
    pan?: string;
    nomineeName?: string;
    nomineeRelation?: string;
    nomineePhone?: string;
    bankName?: string;
    bankBranch?: string;
    bankAccountHolder?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    idProofType?: string;
    idProofNo?: string;
    idProofVerified?: boolean;
    signatureDataUrl?: string | null;
    openingBalancePaise?: number;
    openingBalanceType?: 'DR' | 'CR';
    openingBalanceDate?: string;
    openingBalanceNotes?: string;
    ignoreDuplicateWarning?: boolean;
    duplicateOverrideReason?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): { party: PartyRecord; duplicateWarnings: DuplicateWarningItem[] } {
    if (!params.name || !params.name.trim()) {
      throw new Error('Party / Farmer full name is required.');
    }
    if (params.partyType === 'FARMER' && (!params.village || !params.village.trim())) {
      throw new Error('Village name is required when registering a Farmer (SRS Sec 4.1).');
    }

    const warnings = this.checkPartyDuplicates({
      name: params.name,
      village: params.village || '',
      phonePrimary: params.phonePrimary || '',
      phoneSecondary: params.phoneSecondary || '',
      bankAccountNo: params.bankAccountNo || '',
      idProofNo: params.idProofNo || '',
    });

    if (warnings.length > 0 && !params.ignoreDuplicateWarning) {
      throw new Error(
        `DUPLICATE_WARNING: ${warnings.map((w) => w.message).join(' | ')}`
      );
    }

    const tx = this.db.transaction(() => {
      const seriesType =
        params.partyType === 'FARMER' ? DocumentSeriesType.FARMER : DocumentSeriesType.PARTY;
      const today = getTodayIST();
      const id = `PTY-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const allocatedCode = this.allocateDocumentNumber({
        docType: seriesType,
        referenceEntityId: id,
        transactionDate: today,
        idempotencyKey: params.idempotencyKey ? `NUM-${params.idempotencyKey}` : undefined,
        actor: params.actor,
      });

      const rawBank = (params.bankAccountNo || '').trim();
      const rawIdProof = (params.idProofNo || '').trim();
      const maskedBank = rawBank ? maskSensitiveValue(rawBank, 4) : '';
      const maskedIdProof = rawIdProof ? maskSensitiveValue(rawIdProof, 4) : '';
      const nowIso = new Date().toISOString();
      const openingPaise = Math.max(0, Math.round(params.openingBalancePaise ?? 0));
      const openingType = params.openingBalanceType === 'CR' ? 'CR' : 'DR';
      const openingDate = params.openingBalanceDate || today;

      this.db
        .prepare(
          `
        INSERT INTO parties (
          id, party_code, party_type, name, village, address, phone_primary, phone_secondary,
          sms_consent, gstin, pan, nominee_name, nominee_relation, nominee_phone,
          bank_name, bank_branch, bank_account_holder, bank_account_no_raw, bank_account_no_masked,
          bank_ifsc, id_proof_type, id_proof_no_raw, id_proof_no_masked, id_proof_verified,
          signature_data_url, opening_balance_paise, opening_balance_type, opening_balance_date,
          opening_balance_notes, status, version, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, 'ACTIVE', 1, ?, ?, ?
        )
      `
        )
        .run(
          id,
          allocatedCode.formattedNumber,
          params.partyType,
          params.name.trim(),
          (params.village || '').trim(),
          (params.address || '').trim(),
          (params.phonePrimary || '').trim(),
          (params.phoneSecondary || '').trim(),
          params.smsConsent === false ? 0 : 1,
          (params.gstin || '').trim().toUpperCase(),
          (params.pan || '').trim().toUpperCase(),
          (params.nomineeName || '').trim(),
          (params.nomineeRelation || '').trim(),
          (params.nomineePhone || '').trim(),
          (params.bankName || '').trim(),
          (params.bankBranch || '').trim(),
          (params.bankAccountHolder || params.name).trim(),
          rawBank,
          maskedBank,
          (params.bankIfsc || '').trim().toUpperCase(),
          (params.idProofType || 'Aadhaar / Voter ID').trim(),
          rawIdProof,
          maskedIdProof,
          params.idProofVerified ? 1 : 0,
          params.signatureDataUrl || null,
          openingPaise,
          openingType,
          openingDate,
          (params.openingBalanceNotes || '').trim(),
          params.actor.fullName,
          nowIso,
          nowIso
        );

      // Post Opening Balance into Central Khata Book if > 0 (SRS Sec 10.3)
      if (openingPaise > 0) {
        const controlAccountCode =
          params.partyType === 'FARMER'
            ? '1101'
            : ['BUYER', 'WHOLESALER', 'FACTORY', 'TRADER'].includes(params.partyType)
            ? '1102'
            : '2001';

        const lines: JournalLineInput[] =
          openingType === 'DR'
            ? [
                {
                  accountCode: controlAccountCode,
                  partyId: id,
                  ledgerBucket: 'OPENING_BALANCE',
                  debitPaise: openingPaise,
                  creditPaise: 0,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening Debit (Receivable) balance as of ${openingDate}`,
                },
                {
                  accountCode: '3099',
                  debitPaise: 0,
                  creditPaise: openingPaise,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening balance offset for ${allocatedCode.formattedNumber}`,
                },
              ]
            : [
                {
                  accountCode: '3099',
                  debitPaise: openingPaise,
                  creditPaise: 0,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening balance offset for ${allocatedCode.formattedNumber}`,
                },
                {
                  accountCode: controlAccountCode,
                  partyId: id,
                  ledgerBucket: 'OPENING_BALANCE',
                  debitPaise: 0,
                  creditPaise: openingPaise,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening Credit (Payable) balance as of ${openingDate}`,
                },
              ];

        this.postJournalEntry({
          transactionDate: openingDate,
          sourceType: 'OPENING_BALANCE',
          sourceId: id,
          idempotencyKey: `JE-OPEN-PTY-${id}`,
          narration: `Opening balance (${openingType}) for ${params.name.trim()} (${allocatedCode.formattedNumber})`,
          lines,
          actor: params.actor,
        });
      }

      this.recordAuditLog({
        entityType: 'PARTY_MASTER',
        entityId: allocatedCode.formattedNumber,
        action: `REGISTER_${params.partyType}`,
        afterData: {
          id,
          partyCode: allocatedCode.formattedNumber,
          partyType: params.partyType,
          name: params.name.trim(),
          village: params.village,
          phonePrimary: params.phonePrimary,
          bankAccountNoMasked: maskedBank,
          idProofNoMasked: maskedIdProof,
          openingBalancePaise: openingPaise,
          duplicateOverrideReason: params.duplicateOverrideReason || null,
        },
        reason:
          params.duplicateOverrideReason ||
          `Registered ${params.partyType} ${params.name.trim()} (${allocatedCode.formattedNumber})`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      const inserted = this.db.prepare('SELECT * FROM parties WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      return {
        party: this.mapPartyRow(inserted, false),
        duplicateWarnings: warnings,
      };
    });

    return tx();
  }

  public updateParty(params: {
    id: string;
    name: string;
    village?: string;
    address?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    smsConsent?: boolean;
    gstin?: string;
    pan?: string;
    nomineeName?: string;
    nomineeRelation?: string;
    nomineePhone?: string;
    bankName?: string;
    bankBranch?: string;
    bankIfsc?: string;
    idProofVerified?: boolean;
    status?: 'ACTIVE' | 'INACTIVE';
    expectedVersion?: number;
    reason: string;
    actor: UserProfile;
  }): PartyRecord {
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('Audit reason is required to update or deactivate a Farmer / Party record.');
    }

    const existing = this.db
      .prepare('SELECT * FROM parties WHERE id = ?')
      .get(params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Party not found: ${params.id}`);
    }

    const currentVersion = Number(existing.version);
    if (
      params.expectedVersion !== undefined &&
      Number(params.expectedVersion) !== currentVersion
    ) {
      throw new Error(
        `VERSION_CONFLICT: Party ${existing.party_code} was modified by another user (expected v${params.expectedVersion}, found v${currentVersion}).`
      );
    }

    const nextVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();
    const nextStatus = params.status ?? (existing.status as 'ACTIVE' | 'INACTIVE');
    const isDeactivating = existing.status === 'ACTIVE' && nextStatus === 'INACTIVE';

    // NOTE: party_code is NEVER modified even when name or phone changes (SRS Sec 4.1)
    this.db
      .prepare(
        `
      UPDATE parties SET
        name = ?, village = ?, address = ?, phone_primary = ?, phone_secondary = ?,
        sms_consent = ?, gstin = ?, pan = ?, nominee_name = ?, nominee_relation = ?,
        nominee_phone = ?, bank_name = ?, bank_branch = ?, bank_ifsc = ?,
        id_proof_verified = ?, status = ?,
        deactivation_reason = ?, deactivated_at = ?,
        version = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        params.name.trim(),
        (params.village ?? String(existing.village)).trim(),
        (params.address ?? String(existing.address)).trim(),
        (params.phonePrimary ?? String(existing.phone_primary)).trim(),
        (params.phoneSecondary ?? String(existing.phone_secondary)).trim(),
        params.smsConsent !== undefined ? (params.smsConsent ? 1 : 0) : existing.sms_consent,
        (params.gstin ?? String(existing.gstin)).trim().toUpperCase(),
        (params.pan ?? String(existing.pan)).trim().toUpperCase(),
        (params.nomineeName ?? String(existing.nominee_name)).trim(),
        (params.nomineeRelation ?? String(existing.nominee_relation)).trim(),
        (params.nomineePhone ?? String(existing.nominee_phone)).trim(),
        (params.bankName ?? String(existing.bank_name)).trim(),
        (params.bankBranch ?? String(existing.bank_branch)).trim(),
        (params.bankIfsc ?? String(existing.bank_ifsc)).trim().toUpperCase(),
        params.idProofVerified !== undefined
          ? params.idProofVerified
            ? 1
            : 0
          : existing.id_proof_verified,
        nextStatus,
        isDeactivating ? params.reason.trim() : existing.deactivation_reason,
        isDeactivating ? nowIso : existing.deactivated_at,
        nextVersion,
        nowIso,
        params.id
      );

    const updated = this.db
      .prepare('SELECT * FROM parties WHERE id = ?')
      .get(params.id) as Record<string, unknown>;

    this.recordAuditLog({
      entityType: 'PARTY_MASTER',
      entityId: String(existing.party_code),
      action: isDeactivating ? 'DEACTIVATE_PARTY' : 'UPDATE_PARTY',
      beforeData: this.mapPartyRow(existing, false) as unknown as Record<string, unknown>,
      afterData: this.mapPartyRow(updated, false) as unknown as Record<string, unknown>,
      reason: params.reason.trim(),
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return this.mapPartyRow(updated, false);
  }

  public deleteParty(params: {
    id: string;
    reason: string;
    actor: UserProfile;
  }): { success: boolean; message: string; deletedPartyCode: string } {
    this.requirePermission(params.actor, PermissionKey.APPROVE_CORRECTIONS);

    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('Audit reason is required to delete a Farmer / Party.');
    }

    const existing = this.db
      .prepare('SELECT * FROM parties WHERE id = ?')
      .get(params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Party not found: ${params.id}`);
    }

    const partyId = String(existing.id);
    const partyCode = String(existing.party_code);
    const partyName = String(existing.name);

    // Check transactional dependencies
    const loansCount = (
      this.db.prepare('SELECT count(*) as c FROM loans WHERE farmer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const farmerPattisCount = (
      this.db.prepare('SELECT count(*) as c FROM farmer_pattis WHERE farmer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const kharidiPattisCount = (
      this.db.prepare('SELECT count(*) as c FROM kharidi_pattis WHERE buyer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const dalaliVikriCount = (
      this.db.prepare('SELECT count(*) as c FROM dalali_vikri_pattis WHERE farmer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const dalaliKharidiCount = (
      this.db.prepare('SELECT count(*) as c FROM dalali_kharidi_pattis WHERE buyer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const billsCount = (
      this.db.prepare('SELECT count(*) as c FROM cash_credit_bills WHERE buyer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const collectionsCount = (
      this.db.prepare('SELECT count(*) as c FROM collections_receipts WHERE buyer_id = ?').get(partyId) as {
        c: number;
      }
    ).c;
    const stockMovementsCount = (
      this.db.prepare('SELECT count(*) as c FROM stock_movements WHERE party_id = ?').get(partyId) as {
        c: number;
      }
    ).c;

    const totalTransactions =
      loansCount +
      farmerPattisCount +
      kharidiPattisCount +
      dalaliVikriCount +
      dalaliKharidiCount +
      billsCount +
      collectionsCount +
      stockMovementsCount;

    if (totalTransactions > 0) {
      throw new Error(
        `CANNOT_DELETE: ${partyName} (${partyCode}) has ${totalTransactions} linked transaction record(s) (Pattis/Bills/Loans/Collections/Stock). To preserve accounting integrity, please deactivate the party instead of deleting.`
      );
    }

    // Check non-opening journal lines
    const operationalJournalLines = (
      this.db
        .prepare(
          `SELECT count(*) as c FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           WHERE jl.party_id = ? AND je.source_type != 'OPENING_BALANCE'`
        )
        .get(partyId) as { c: number }
    ).c;

    if (operationalJournalLines > 0) {
      throw new Error(
        `CANNOT_DELETE: ${partyName} (${partyCode}) has financial transactions in the central Khata Book. Please deactivate the party instead.`
      );
    }

    const tx = this.db.transaction(() => {
      // Clean up opening balance journal entry if any
      const openingEntries = this.db
        .prepare(`SELECT id FROM journal_entries WHERE source_type = 'OPENING_BALANCE' AND source_id = ?`)
        .all(partyId) as Array<{ id: string }>;

      for (const entry of openingEntries) {
        this.db.prepare('DELETE FROM journal_lines WHERE journal_entry_id = ?').run(entry.id);
        this.db.prepare('DELETE FROM journal_entries WHERE id = ?').run(entry.id);
      }

      // Also clean up any orphan journal_lines for this party
      this.db.prepare('DELETE FROM journal_lines WHERE party_id = ?').run(partyId);

      // Delete party record
      this.db.prepare('DELETE FROM parties WHERE id = ?').run(partyId);

      this.recordAuditLog({
        entityType: 'PARTY_MASTER',
        entityId: partyCode,
        action: 'DELETE_PARTY',
        beforeData: this.mapPartyRow(existing, false) as unknown as Record<string, unknown>,
        reason: params.reason.trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });
    });

    tx();
    return {
      success: true,
      message: `Farmer/Party ${partyName} (${partyCode}) deleted successfully.`,
      deletedPartyCode: partyCode,
    };
  }

  public listParties(filters?: {
    partyType?: string;
    search?: string;
    status?: string;
  }): PartyRecord[] {
    let sql = `SELECT * FROM parties WHERE 1=1`;
    const params: unknown[] = [];

    if (filters?.partyType && filters.partyType !== 'ALL') {
      sql += ` AND party_type = ?`;
      params.push(filters.partyType);
    }
    if (filters?.status && filters.status !== 'ALL') {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      sql += ` AND (party_code LIKE ? OR name LIKE ? OR village LIKE ? OR phone_primary LIKE ? OR gstin LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    sql += ` ORDER BY created_at DESC, party_code DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapPartyRow(r, false));
  }

  public getPartyById(
    partyId: string,
    actor: UserProfile,
    unmaskSensitive = false
  ): PartyRecord {
    const row = this.db
      .prepare('SELECT * FROM parties WHERE id = ? OR party_code = ?')
      .get(partyId, partyId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Party not found: ${partyId}`);
    }

    if (unmaskSensitive) {
      if (
        !actor.canViewSensitiveKyc ||
        !actor.permissions.includes(PermissionKey.VIEW_SENSITIVE_KYC)
      ) {
        throw new Error(
          `PERMISSION_DENIED: Role "${actor.role}" is not permitted to unmask sensitive farmer bank, ID proof, or signature records.`
        );
      }
      this.recordAuditLog({
        entityType: 'PARTY_SENSITIVE_KYC',
        entityId: String(row.party_code),
        action: 'UNMASK_PARTY_SENSITIVE_KYC',
        afterData: { partyCode: row.party_code, name: row.name, viewedByRole: actor.role },
        reason: 'Authorized inspection of unmasked Farmer/Party bank, ID, and signature KYC',
        actor,
      });
    }

    return this.mapPartyRow(row, unmaskSensitive);
  }

  private mapPartyRow(r: Record<string, unknown>, includeUnmasked: boolean): PartyRecord {
    const rawBank = String(r.bank_account_no_raw || '');
    const rawIdProof = String(r.id_proof_no_raw || '');
    const sigUrl = r.signature_data_url ? String(r.signature_data_url) : null;

    const record: PartyRecord = {
      id: String(r.id),
      partyCode: String(r.party_code),
      partyType: r.party_type as PartyType,
      name: String(r.name),
      village: String(r.village || ''),
      address: String(r.address || ''),
      phonePrimary: String(r.phone_primary || ''),
      phoneSecondary: String(r.phone_secondary || ''),
      smsConsent: Boolean(r.sms_consent),
      gstin: String(r.gstin || ''),
      pan: String(r.pan || ''),
      nomineeName: String(r.nominee_name || ''),
      nomineeRelation: String(r.nominee_relation || ''),
      nomineePhone: String(r.nominee_phone || ''),
      bankName: String(r.bank_name || ''),
      bankBranch: String(r.bank_branch || ''),
      bankAccountHolder: String(r.bank_account_holder || ''),
      bankAccountNoMasked: String(r.bank_account_no_masked || (rawBank ? maskSensitiveValue(rawBank, 4) : '—')),
      bankIfsc: String(r.bank_ifsc || ''),
      idProofType: String(r.id_proof_type || ''),
      idProofNoMasked: String(r.id_proof_no_masked || (rawIdProof ? maskSensitiveValue(rawIdProof, 4) : '—')),
      idProofVerified: Boolean(r.id_proof_verified),
      hasSignatureOnFile: Boolean(sigUrl),
      openingBalancePaise: Number(r.opening_balance_paise || 0),
      openingBalanceType: (r.opening_balance_type as 'DR' | 'CR') || 'DR',
      openingBalanceDate: String(r.opening_balance_date || ''),
      openingBalanceNotes: String(r.opening_balance_notes || ''),
      status: (r.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
      deactivationReason: r.deactivation_reason ? String(r.deactivation_reason) : null,
      deactivatedAt: r.deactivated_at ? String(r.deactivated_at) : null,
      version: Number(r.version || 1),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };

    if (includeUnmasked) {
      record.bankAccountNoUnmasked = rawBank || '—';
      record.idProofNoUnmasked = rawIdProof || '—';
      record.signatureDataUrl = sigUrl;
    }

    return record;
  }

  // ==========================================================================
  // CHUNK 2: CENTRAL KHATA BOOK & DOUBLE-ENTRY POSTING ENGINE (SRS Sec 3, 10)
  // ==========================================================================

  public listAccountsWithBalances(toDate?: string): AccountRecord[] {
    const accounts = this.db
      .prepare('SELECT * FROM accounts ORDER BY code ASC')
      .all() as Array<Record<string, unknown>>;

    let sumsSql = `
      SELECT jl.account_id,
             SUM(jl.debit_paise) as total_debit,
             SUM(jl.credit_paise) as total_credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
    `;
    const sumsParams: unknown[] = [];
    if (toDate) {
      sumsSql += ` WHERE je.transaction_date <= ?`;
      sumsParams.push(toDate);
    }
    sumsSql += ` GROUP BY jl.account_id`;

    const sums = this.db
      .prepare(sumsSql)
      .all(...sumsParams) as Array<{ account_id: string; total_debit: number; total_credit: number }>;

    const sumMap = new Map<string, { dr: number; cr: number }>();
    for (const s of sums) {
      sumMap.set(String(s.account_id), {
        dr: Number(s.total_debit || 0),
        cr: Number(s.total_credit || 0),
      });
    }

    return accounts.map((a) => {
      const id = String(a.id);
      const totals = sumMap.get(id) ?? { dr: 0, cr: 0 };
      const net = totals.dr - totals.cr;
      return {
        id,
        code: String(a.code),
        nameEn: String(a.name_en),
        nameKn: String(a.name_kn),
        accountType: a.account_type as AccountType,
        subType: a.sub_type as AccountSubType,
        isSystem: Boolean(a.is_system),
        status: (a.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
        totalDebitPaise: totals.dr,
        totalCreditPaise: totals.cr,
        netBalancePaise: Math.abs(net),
        balanceDirection: net >= 0 ? 'DR' : 'CR',
      };
    });
  }

  /**
   * Single shared atomic Double-Entry Posting Engine (SRS Sec 3, 10.1, 10.2, AT-13).
   * Enforces:
   * 1. Source-document idempotency (`idempotencyKey` UNIQUE).
   * 2. Balanced integer-paise double-entry (`SUM(debitPaise) === SUM(creditPaise) > 0`).
   * 3. Explicit separation between Accounting Dr/Cr and Cash/Bank movement (`cashFlowSummary`).
   */
  public postJournalEntry(params: {
    transactionDate: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    narration: string;
    lines: JournalLineInput[];
    reversalOfEntryId?: string | null;
    actor: UserProfile;
  }): JournalEntryRecord {
    const tx = this.db.transaction(() => {
      if (!params.idempotencyKey || !params.idempotencyKey.trim()) {
        throw new Error('idempotencyKey is mandatory for all accounting postings.');
      }

      // 1. Idempotency check (AT-13): return existing entry if already posted
      const existingEntry = this.db
        .prepare('SELECT * FROM journal_entries WHERE idempotency_key = ?')
        .get(params.idempotencyKey.trim()) as Record<string, unknown> | undefined;
      if (existingEntry) {
        return this.getJournalEntryById(String(existingEntry.id));
      }

      // 1b. Closed-Day Lock Enforcement (SRS Sec 11.4, AT-15)
      this.assertDayOpenForPosting(params.transactionDate);

      if (!Array.isArray(params.lines) || params.lines.length < 2) {
        throw new Error('UNBALANCED_JOURNAL: A double-entry journal posting requires at least 2 lines.');
      }

      let totalDebitPaise = 0;
      let totalCreditPaise = 0;
      const cashDirections = new Set<CashFlowDirection>();

      const resolvedLines = params.lines.map((line, idx) => {
        const dr = Math.round(Number(line.debitPaise || 0));
        const cr = Math.round(Number(line.creditPaise || 0));
        if (dr < 0 || cr < 0 || (dr === 0 && cr === 0) || (dr > 0 && cr > 0)) {
          throw new Error(
            `INVALID_JOURNAL_LINE: Line #${idx + 1} (${line.accountCode}) must have a positive integer debit OR credit in paise.`
          );
        }

        const accRow = this.db
          .prepare('SELECT * FROM accounts WHERE code = ?')
          .get(line.accountCode) as Record<string, unknown> | undefined;
        if (!accRow) {
          throw new Error(`Account code not found in Chart of Accounts: ${line.accountCode}`);
        }

        totalDebitPaise += dr;
        totalCreditPaise += cr;

        // Infer cash direction if not explicitly passed
        let cashDir: CashFlowDirection = line.cashDirection ?? 'NON_CASH';
        if (!line.cashDirection) {
          if (accRow.sub_type === 'CASH') {
            cashDir = dr > 0 ? 'CASH_IN' : 'CASH_OUT';
          } else if (accRow.sub_type === 'BANK') {
            cashDir = dr > 0 ? 'BANK_IN' : 'BANK_OUT';
          }
        }
        if (cashDir !== 'NON_CASH') {
          cashDirections.add(cashDir);
        }

        return {
          lineNo: idx + 1,
          accountId: String(accRow.id),
          accountCode: String(accRow.code),
          partyId: line.partyId ?? null,
          bankAccountId: line.bankAccountId ?? null,
          ledgerBucket: line.ledgerBucket ?? 'GENERAL',
          debitPaise: dr,
          creditPaise: cr,
          cashDirection: cashDir,
          lineNote: (line.lineNote || '').trim(),
        };
      });

      if (totalDebitPaise !== totalCreditPaise || totalDebitPaise <= 0) {
        throw new Error(
          `UNBALANCED_JOURNAL: Total Debit (${totalDebitPaise} paise) does not equal Total Credit (${totalCreditPaise} paise).`
        );
      }

      let cashFlowSummary: CashFlowDirection | 'MIXED' = 'NON_CASH';
      if (cashDirections.size === 1) {
        cashFlowSummary = Array.from(cashDirections)[0];
      } else if (cashDirections.size > 1) {
        cashFlowSummary = cashDirections.has('TRANSFER') ? 'TRANSFER' : 'MIXED';
      }

      const issuedNo = this.allocateDocumentNumber({
        docType: DocumentSeriesType.JOURNAL,
        referenceEntityId: `${params.sourceType}:${params.sourceId}`,
        transactionDate: params.transactionDate,
        idempotencyKey: `NUM-JE-${params.idempotencyKey.trim()}`,
        actor: params.actor,
      });

      const entryId = `JE-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO journal_entries (
          id, entry_no, transaction_date, source_type, source_id, idempotency_key,
          narration, total_debit_paise, total_credit_paise, cash_flow_summary,
          status, reversal_of_entry_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?)
      `
        )
        .run(
          entryId,
          issuedNo.formattedNumber,
          params.transactionDate,
          params.sourceType,
          params.sourceId,
          params.idempotencyKey.trim(),
          params.narration.trim(),
          totalDebitPaise,
          totalCreditPaise,
          cashFlowSummary,
          params.reversalOfEntryId ?? null,
          params.actor.fullName,
          nowIso
        );

      const insertLine = this.db.prepare(
        `
        INSERT INTO journal_lines (
          id, journal_entry_id, line_no, account_id, account_code, party_id,
          bank_account_id, ledger_bucket, debit_paise, credit_paise, cash_direction, line_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      );

      for (const l of resolvedLines) {
        insertLine.run(
          `JL-${entryId}-${l.lineNo}`,
          entryId,
          l.lineNo,
          l.accountId,
          l.accountCode,
          l.partyId,
          l.bankAccountId,
          l.ledgerBucket,
          l.debitPaise,
          l.creditPaise,
          l.cashDirection,
          l.lineNote
        );
      }

      return this.getJournalEntryById(entryId);
    });

    return tx();
  }

  /**
   * Controlled Reversal of a posted Journal Entry (SRS Sec 3 & 17.3, AT-14).
   * Preserves the original entry, marks it REVERSED, and posts an offsetting entry.
   */
  public reverseJournalEntry(params: {
    entryId: string;
    reversalDate: string;
    reason: string;
    actor: UserProfile;
  }): JournalEntryRecord {
    this.requirePermission(params.actor, PermissionKey.APPROVE_CORRECTIONS);
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('A clear audit reason is mandatory to reverse a posted journal entry.');
    }

    const tx = this.db.transaction(() => {
      const original = this.getJournalEntryById(params.entryId);
      if (original.status === 'REVERSED' || original.reversedByEntryId) {
        throw new Error(`Journal entry ${original.entryNo} has already been reversed.`);
      }

      const invertCashDir = (dir: CashFlowDirection): CashFlowDirection => {
        if (dir === 'CASH_IN') return 'CASH_OUT';
        if (dir === 'CASH_OUT') return 'CASH_IN';
        if (dir === 'BANK_IN') return 'BANK_OUT';
        if (dir === 'BANK_OUT') return 'BANK_IN';
        return dir;
      };

      const reversalLines: JournalLineInput[] = original.lines.map((l) => ({
        accountCode: l.accountCode,
        partyId: l.partyId,
        bankAccountId: l.bankAccountId,
        ledgerBucket: l.ledgerBucket,
        debitPaise: l.creditPaise,
        creditPaise: l.debitPaise,
        cashDirection: invertCashDir(l.cashDirection),
        lineNote: `Reversal of ${original.entryNo}: ${l.lineNote}`,
      }));

      const reversalEntry = this.postJournalEntry({
        transactionDate: params.reversalDate,
        sourceType: 'REVERSAL',
        sourceId: original.entryNo,
        idempotencyKey: `REV-${original.id}`,
        narration: `REVERSAL of ${original.entryNo} (${original.sourceType}): ${params.reason.trim()}`,
        lines: reversalLines,
        reversalOfEntryId: original.id,
        actor: params.actor,
      });

      this.db
        .prepare(
          `
        UPDATE journal_entries
        SET status = 'REVERSED', reversed_by_entry_id = ?, reversal_reason = ?
        WHERE id = ?
      `
        )
        .run(reversalEntry.id, params.reason.trim(), original.id);

      this.recordAuditLog({
        entityType: 'KHATA_JOURNAL_ENTRY',
        entityId: original.entryNo,
        action: 'REVERSE_JOURNAL_ENTRY',
        beforeData: { status: 'POSTED', totalPaise: original.totalDebitPaise },
        afterData: {
          status: 'REVERSED',
          reversedByEntryNo: reversalEntry.entryNo,
          reason: params.reason.trim(),
        },
        reason: params.reason.trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return reversalEntry;
    });

    return tx();
  }

  public getJournalEntryById(entryId: string): JournalEntryRecord {
    const row = this.db
      .prepare('SELECT * FROM journal_entries WHERE id = ? OR entry_no = ?')
      .get(entryId, entryId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Journal entry not found: ${entryId}`);
    }

    const lineRows = this.db
      .prepare(
        `
      SELECT jl.*, a.name_en as account_name_en, a.name_kn as account_name_kn,
             p.party_code, p.name as party_name
      FROM journal_lines jl
      JOIN accounts a ON a.id = jl.account_id
      LEFT JOIN parties p ON p.id = jl.party_id
      WHERE jl.journal_entry_id = ?
      ORDER BY jl.line_no ASC
    `
      )
      .all(row.id) as Array<Record<string, unknown>>;

    return {
      id: String(row.id),
      entryNo: String(row.entry_no),
      transactionDate: String(row.transaction_date),
      sourceType: String(row.source_type),
      sourceId: String(row.source_id),
      idempotencyKey: String(row.idempotency_key),
      narration: String(row.narration),
      totalDebitPaise: Number(row.total_debit_paise),
      totalCreditPaise: Number(row.total_credit_paise),
      cashFlowSummary: row.cash_flow_summary as CashFlowDirection | 'MIXED',
      status: row.status as 'POSTED' | 'REVERSED',
      reversalOfEntryId: row.reversal_of_entry_id ? String(row.reversal_of_entry_id) : null,
      reversedByEntryId: row.reversed_by_entry_id ? String(row.reversed_by_entry_id) : null,
      reversalReason: row.reversal_reason ? String(row.reversal_reason) : null,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      lines: lineRows.map((l) => ({
        id: String(l.id),
        journalEntryId: String(l.journal_entry_id),
        lineNo: Number(l.line_no),
        accountId: String(l.account_id),
        accountCode: String(l.account_code),
        accountNameEn: String(l.account_name_en),
        accountNameKn: String(l.account_name_kn),
        partyId: l.party_id ? String(l.party_id) : null,
        partyCode: l.party_code ? String(l.party_code) : null,
        partyName: l.party_name ? String(l.party_name) : null,
        bankAccountId: l.bank_account_id ? String(l.bank_account_id) : null,
        ledgerBucket: l.ledger_bucket as LedgerBucket,
        debitPaise: Number(l.debit_paise),
        creditPaise: Number(l.credit_paise),
        cashDirection: l.cash_direction as CashFlowDirection,
        lineNote: String(l.line_note || ''),
      })),
    };
  }

  public getCompanyKhataBook(filters?: {
    fromDate?: string;
    toDate?: string;
    sourceType?: string;
    accountCode?: string;
    actor?: UserProfile;
  }) {
    const accounts = this.listAccountsWithBalances(filters?.toDate);

    let whereClause = '1=1';
    const params: unknown[] = [];
    if (filters?.fromDate) {
      whereClause += ` AND transaction_date >= ?`;
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      whereClause += ` AND transaction_date <= ?`;
      params.push(filters.toDate);
    }
    if (filters?.sourceType && filters.sourceType !== 'ALL') {
      whereClause += ` AND source_type = ?`;
      params.push(filters.sourceType);
    }
    if (filters?.accountCode && filters.accountCode !== 'ALL') {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM journal_lines jl
        JOIN accounts a ON a.id = jl.account_id
        WHERE jl.journal_entry_id = journal_entries.id AND a.code = ?
      )`;
      params.push(filters.accountCode);
    }

    const sql = `SELECT id FROM journal_entries WHERE ${whereClause} ORDER BY transaction_date DESC, created_at DESC LIMIT 150`;
    const idRows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    let entries = idRows.map((r) => this.getJournalEntryById(r.id));

    // Mask restricted personal entries for non-privileged actors
    const isPrivileged =
      filters?.actor &&
      (filters.actor.role === UserRole.OWNER ||
        filters.actor.role === UserRole.ACCOUNTANT ||
        filters.actor.permissions.includes(PermissionKey.VIEW_SENSITIVE_KYC));

    if (!isPrivileged) {
      const restrictedRows = this.db
        .prepare('SELECT id FROM expenses_commitments WHERE is_restricted_personal = 1')
        .all() as Array<{ id: string }>;
      const restrictedIds = new Set(restrictedRows.map((r) => r.id));

      entries = entries.map((e) => {
        if (e.sourceType === 'EXPENSE_COMMITMENT' && restrictedIds.has(e.sourceId)) {
          return {
            ...e,
            narration: '[Restricted Owner Personal Drawing / Insurance]',
            lines: e.lines.map((l) => ({
              ...l,
              lineNote: '[Restricted Note]',
              partyName: l.partyName ? '[Restricted]' : null,
            })),
          };
        }
        return e;
      });
    }

    // Compute company-wide Accounting Dr/Cr summary across all matching journal lines
    let totalAccountingDebitPaise = 0;
    let totalAccountingCreditPaise = 0;
    let cashInPaise = 0;
    let cashOutPaise = 0;
    let bankInPaise = 0;
    let bankOutPaise = 0;
    let nonCashAdjustmentPaise = 0;

    const aggregateRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(jl.debit_paise), 0) as total_dr,
           COALESCE(SUM(jl.credit_paise), 0) as total_cr,
           COALESCE(SUM(CASE WHEN jl.cash_direction = 'CASH_IN' THEN jl.debit_paise ELSE 0 END), 0) as cash_in,
           COALESCE(SUM(CASE WHEN jl.cash_direction = 'CASH_OUT' THEN jl.credit_paise ELSE 0 END), 0) as cash_out,
           COALESCE(SUM(CASE WHEN jl.cash_direction = 'BANK_IN' THEN jl.debit_paise ELSE 0 END), 0) as bank_in,
           COALESCE(SUM(CASE WHEN jl.cash_direction = 'BANK_OUT' THEN jl.credit_paise ELSE 0 END), 0) as bank_out,
           COALESCE(SUM(CASE WHEN jl.cash_direction = 'NON_CASH' THEN jl.debit_paise ELSE 0 END), 0) as non_cash
         FROM journal_lines jl
         JOIN journal_entries ON journal_entries.id = jl.journal_entry_id
         WHERE ${whereClause}`
      )
      .get(...params) as
      | {
          total_dr: number;
          total_cr: number;
          cash_in: number;
          cash_out: number;
          bank_in: number;
          bank_out: number;
          non_cash: number;
        }
      | undefined;

    if (aggregateRow) {
      totalAccountingDebitPaise = Number(aggregateRow.total_dr || 0);
      totalAccountingCreditPaise = Number(aggregateRow.total_cr || 0);
      cashInPaise = Number(aggregateRow.cash_in || 0);
      cashOutPaise = Number(aggregateRow.cash_out || 0);
      bankInPaise = Number(aggregateRow.bank_in || 0);
      bankOutPaise = Number(aggregateRow.bank_out || 0);
      nonCashAdjustmentPaise = Number(aggregateRow.non_cash || 0);
    }

    return {
      accounts,
      journalEntries: entries,
      summary: {
        totalAccountingDebitPaise,
        totalAccountingCreditPaise,
        cashInPaise,
        cashOutPaise,
        bankInPaise,
        bankOutPaise,
        nonCashAdjustmentPaise,
      },
    };
  }

  /**
   * Computes a Party / Farmer Sub-Ledger Statement with distinct Loan Principal, Interest,
   * Crop Proceeds, and Deductions buckets (SRS Sec 10.1).
   */
  public getPartyLedgerStatement(params: {
    partyId: string;
    fromDate?: string;
    toDate?: string;
    actor: UserProfile;
  }): PartyLedgerStatement {
    const party = this.getPartyById(params.partyId, params.actor, false);

    const allLineRows = this.db
      .prepare(
        `
      SELECT jl.*, je.entry_no, je.transaction_date, je.source_type, je.source_id, je.narration,
             a.name_en as account_name_en
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.party_id = ?
      ORDER BY je.transaction_date ASC, je.created_at ASC, jl.line_no ASC
    `
      )
      .all(party.id) as Array<Record<string, unknown>>;

    let openingSignedPaise = 0; // Positive = DR (Receivable from party), Negative = CR (Payable to party)
    let periodTotalDebitPaise = 0;
    let periodTotalCreditPaise = 0;

    let loanPrincipalDr = 0;
    let loanPrincipalCr = 0;
    let loanInterestDr = 0;
    let loanInterestCr = 0;
    let cropProceedsCr = 0;
    let deductionsDr = 0;
    let tradeNetSigned = 0;

    const statementLines: PartyLedgerLine[] = [];
    let runningSignedPaise = 0;

    for (const r of allLineRows) {
      const txnDate = String(r.transaction_date);
      const dr = Number(r.debit_paise || 0);
      const cr = Number(r.credit_paise || 0);
      const bucket = r.ledger_bucket as LedgerBucket;

      if (bucket === 'LOAN_PRINCIPAL') {
        loanPrincipalDr += dr;
        loanPrincipalCr += cr;
      } else if (bucket === 'LOAN_INTEREST') {
        loanInterestDr += dr;
        loanInterestCr += cr;
      } else {
        if (bucket === 'CROP_PROCEEDS') cropProceedsCr += cr;
        if (bucket === 'DEDUCTIONS') deductionsDr += dr;
        tradeNetSigned += dr - cr;
      }

      if (params.fromDate && txnDate < params.fromDate) {
        openingSignedPaise += dr - cr;
        runningSignedPaise = openingSignedPaise;
        continue;
      }
      if (params.toDate && txnDate > params.toDate) {
        continue;
      }

      periodTotalDebitPaise += dr;
      periodTotalCreditPaise += cr;
      runningSignedPaise += dr - cr;

      statementLines.push({
        lineId: String(r.id),
        journalEntryId: String(r.journal_entry_id),
        entryNo: String(r.entry_no),
        transactionDate: txnDate,
        sourceType: String(r.source_type),
        sourceId: String(r.source_id),
        accountCode: String(r.account_code),
        accountNameEn: String(r.account_name_en),
        ledgerBucket: bucket,
        narration: String(r.line_note || r.narration),
        debitPaise: dr,
        creditPaise: cr,
        cashDirection: r.cash_direction as CashFlowDirection,
        runningBalancePaise: Math.abs(runningSignedPaise),
        runningBalanceType: runningSignedPaise >= 0 ? 'DR' : 'CR',
      });
    }

    return {
      party,
      fromDate: params.fromDate ?? null,
      toDate: params.toDate ?? null,
      openingBalancePaise: Math.abs(openingSignedPaise),
      openingBalanceType: openingSignedPaise >= 0 ? 'DR' : 'CR',
      periodTotalDebitPaise,
      periodTotalCreditPaise,
      closingBalancePaise: Math.abs(runningSignedPaise),
      closingBalanceType: runningSignedPaise >= 0 ? 'DR' : 'CR',
      bucketSummary: {
        loanPrincipalReceivablePaise: Math.max(0, loanPrincipalDr - loanPrincipalCr),
        loanInterestReceivablePaise: Math.max(0, loanInterestDr - loanInterestCr),
        cropProceedsCreditedPaise: cropProceedsCr,
        deductionsDebitedPaise: deductionsDr,
        tradeReceivableOrPayablePaise: Math.abs(tradeNetSigned),
        tradeDirection: tradeNetSigned >= 0 ? 'DR' : 'CR',
      },
      lines: statementLines,
    };
  }

  // ==========================================================================
  // CHUNK 3: BANK ACCOUNTS, INTERNAL TRANSFERS, CHEQUES, RECONCILIATION & LOANS
  // ==========================================================================

  public createBankAccount(params: {
    bankName: string;
    branchName?: string;
    accountLabel: string;
    accountType?: 'SAVINGS' | 'CURRENT' | 'OD_CC';
    accountNumber: string;
    ifscCode?: string;
    openingBalancePaise?: number;
    openingBalanceType?: 'DR' | 'CR';
    openingDate?: string;
    actor: UserProfile;
  }): BankAccountRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);
    if (!params.bankName.trim() || !params.accountLabel.trim() || !params.accountNumber.trim()) {
      throw new Error('Bank name, account label, and account number are required.');
    }

    const tx = this.db.transaction(() => {
      const id = `BNK-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date().toISOString();
      const maskedNo = maskSensitiveValue(params.accountNumber.trim(), 4);
      const openPaise = Math.max(0, Math.round(params.openingBalancePaise ?? 0));
      const openType = params.openingBalanceType === 'CR' ? 'CR' : 'DR';
      const openDate = params.openingDate || getTodayIST();

      this.db
        .prepare(
          `
        INSERT INTO bank_accounts (
          id, bank_name, branch_name, account_label, account_type,
          account_number_masked, ifsc_code, opening_balance_paise, opening_balance_type,
          reconciled_statement_balance_paise, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `
        )
        .run(
          id,
          params.bankName.trim(),
          (params.branchName || '').trim(),
          params.accountLabel.trim(),
          params.accountType || 'CURRENT',
          maskedNo,
          (params.ifscCode || '').trim().toUpperCase(),
          openPaise,
          openType,
          openPaise,
          nowIso
        );

      if (openPaise > 0) {
        const lines: JournalLineInput[] =
          openType === 'DR'
            ? [
                {
                  accountCode: '1002',
                  bankAccountId: id,
                  ledgerBucket: 'OPENING_BALANCE',
                  debitPaise: openPaise,
                  creditPaise: 0,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening Bank Balance for ${params.accountLabel.trim()}`,
                },
                {
                  accountCode: '3099',
                  debitPaise: 0,
                  creditPaise: openPaise,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening Balance Equity Offset for ${params.accountLabel.trim()}`,
                },
              ]
            : [
                {
                  accountCode: '3099',
                  debitPaise: openPaise,
                  creditPaise: 0,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening OD/CC Balance Offset for ${params.accountLabel.trim()}`,
                },
                {
                  accountCode: '1002',
                  bankAccountId: id,
                  ledgerBucket: 'OPENING_BALANCE',
                  debitPaise: 0,
                  creditPaise: openPaise,
                  cashDirection: 'NON_CASH',
                  lineNote: `Opening OD/CC Liability Balance for ${params.accountLabel.trim()}`,
                },
              ];

        this.postJournalEntry({
          transactionDate: openDate,
          sourceType: 'OPENING_BALANCE',
          sourceId: id,
          idempotencyKey: `JE-OPEN-BNK-${id}`,
          narration: `Opening balance for bank account ${params.accountLabel.trim()} (${maskedNo})`,
          lines,
          actor: params.actor,
        });
      }

      this.recordAuditLog({
        entityType: 'BANK_ACCOUNT',
        entityId: id,
        action: 'CREATE_BANK_ACCOUNT',
        afterData: {
          bankName: params.bankName,
          accountLabel: params.accountLabel,
          accountNumberMasked: maskedNo,
          openingBalancePaise: openPaise,
        },
        reason: `Added SGT bank account ${params.accountLabel.trim()} (${maskedNo})`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.listBankAccounts().find((b) => b.id === id)!;
    });

    return tx();
  }

  public listBankAccounts(): BankAccountRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM bank_accounts ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;

    const sums = this.db
      .prepare(
        `
      SELECT bank_account_id,
             SUM(debit_paise) as dr,
             SUM(credit_paise) as cr
      FROM journal_lines
      WHERE bank_account_id IS NOT NULL AND account_code = '1002'
      GROUP BY bank_account_id
    `
      )
      .all() as Array<{ bank_account_id: string; dr: number; cr: number }>;

    const map = new Map<string, number>();
    for (const s of sums) {
      map.set(String(s.bank_account_id), Number(s.dr || 0) - Number(s.cr || 0));
    }

    return rows.map((r) => {
      const id = String(r.id);
      const netSigned = map.get(id) ?? 0;
      return {
        id,
        bankName: String(r.bank_name),
        branchName: String(r.branch_name || ''),
        accountLabel: String(r.account_label),
        accountType: (r.account_type as 'SAVINGS' | 'CURRENT' | 'OD_CC') || 'CURRENT',
        accountNumberMasked: String(r.account_number_masked),
        ifscCode: String(r.ifsc_code || ''),
        openingBalancePaise: Number(r.opening_balance_paise || 0),
        openingBalanceType: (r.opening_balance_type as 'DR' | 'CR') || 'DR',
        currentBookBalancePaise: Math.abs(netSigned),
        currentBookBalanceType: netSigned >= 0 ? 'DR' : 'CR',
        reconciledStatementBalancePaise: Number(r.reconciled_statement_balance_paise || 0),
        status: (r.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
        createdAt: String(r.created_at),
      };
    });
  }

  /**
   * Internal Cash / Bank Transfer (AT-10, SRS Sec 12.2):
   * Moves funds between Cash in Hand (1001) and Bank Accounts (1002) or between two SGT Bank Accounts
   * WITHOUT creating any Income or Expense.
   */
  public recordInternalCashBankTransfer(params: {
    transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK';
    transactionDate: string;
    amountPaise: number;
    fromBankAccountId?: string | null;
    toBankAccountId?: string | null;
    referenceNo?: string;
    narration?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): JournalEntryRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);
    const amountPaise = Math.round(Number(params.amountPaise || 0));
    if (amountPaise <= 0) {
      throw new Error('Transfer amount must be greater than zero.');
    }

    const lines: JournalLineInput[] = [];
    if (params.transferType === 'CASH_TO_BANK') {
      if (!params.toBankAccountId) {
        throw new Error('Destination bank account is required for Cash-to-Bank deposit.');
      }
      lines.push(
        {
          accountCode: '1002',
          bankAccountId: params.toBankAccountId,
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: 'TRANSFER',
          lineNote: `Cash deposited into bank (${params.referenceNo || 'Contra'})`,
        },
        {
          accountCode: '1001',
          debitPaise: 0,
          creditPaise: amountPaise,
          cashDirection: 'TRANSFER',
          lineNote: `Cash sent to bank (${params.referenceNo || 'Contra'})`,
        }
      );
    } else if (params.transferType === 'BANK_TO_CASH') {
      if (!params.fromBankAccountId) {
        throw new Error('Source bank account is required for Bank-to-Cash withdrawal.');
      }
      lines.push(
        {
          accountCode: '1001',
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: 'TRANSFER',
          lineNote: `Cash withdrawn from bank (${params.referenceNo || 'Contra'})`,
        },
        {
          accountCode: '1002',
          bankAccountId: params.fromBankAccountId,
          debitPaise: 0,
          creditPaise: amountPaise,
          cashDirection: 'TRANSFER',
          lineNote: `Withdrawal to office cash (${params.referenceNo || 'Contra'})`,
        }
      );
    } else {
      if (!params.fromBankAccountId || !params.toBankAccountId) {
        throw new Error('Both source and destination SGT bank accounts are required for Bank-to-Bank transfer.');
      }
      if (params.fromBankAccountId === params.toBankAccountId) {
        throw new Error('Source and destination bank accounts must be different.');
      }
      lines.push(
        {
          accountCode: '1002',
          bankAccountId: params.toBankAccountId,
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: 'TRANSFER',
          lineNote: `Inter-bank transfer in (${params.referenceNo || 'Contra'})`,
        },
        {
          accountCode: '1002',
          bankAccountId: params.fromBankAccountId,
          debitPaise: 0,
          creditPaise: amountPaise,
          cashDirection: 'TRANSFER',
          lineNote: `Inter-bank transfer out (${params.referenceNo || 'Contra'})`,
        }
      );
    }

    const idemKey =
      params.idempotencyKey ||
      `TRF-${params.transferType}-${params.transactionDate}-${amountPaise}-${Date.now()}`;

    return this.postJournalEntry({
      transactionDate: params.transactionDate,
      sourceType: 'BANK_TRANSFER',
      sourceId: params.referenceNo?.trim() || idemKey,
      idempotencyKey: idemKey,
      narration:
        params.narration?.trim() ||
        `Internal ${params.transferType.replace(/_/g, ' ')} (${params.referenceNo || 'Contra'})`,
      lines,
      actor: params.actor,
    });
  }

  /**
   * Cheque Lifecycle Engine (SRS Sec 12.3 & DR-11):
   * Pending cheques are NEVER counted as cleared bank funds until status becomes CLEARED.
   */
  public createCheque(params: {
    chequeNo: string;
    chequeDate: string;
    direction: ChequeDirection;
    bankAccountId: string;
    partyId?: string | null;
    partyName: string;
    amountPaise: number;
    purpose?: string;
    actor: UserProfile;
  }): ChequeRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);
    const amountPaise = Math.round(Number(params.amountPaise || 0));
    if (!params.chequeNo.trim() || !params.bankAccountId || amountPaise <= 0) {
      throw new Error('Cheque number, bank account, and positive amount are required.');
    }

    const id = `CHQ-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const nowIso = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO cheques (
        id, cheque_no, cheque_date, direction, bank_account_id, party_id,
        party_name, amount_paise, purpose, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `
      )
      .run(
        id,
        params.chequeNo.trim(),
        params.chequeDate,
        params.direction,
        params.bankAccountId,
        params.partyId ?? null,
        params.partyName.trim() || 'Counterparty',
        amountPaise,
        (params.purpose || '').trim(),
        params.actor.fullName,
        nowIso
      );

    this.recordAuditLog({
      entityType: 'CHEQUE_REGISTER',
      entityId: id,
      action: `REGISTER_${params.direction}_CHEQUE`,
      afterData: {
        chequeNo: params.chequeNo,
        direction: params.direction,
        amountPaise,
        status: 'PENDING',
      },
      reason: `Registered ${params.direction} cheque #${params.chequeNo.trim()} (Pending clearance)`,
      approvedBy: params.actor.fullName,
      actor: params.actor,
    });

    return this.listCheques().find((c) => c.id === id)!;
  }

  public updateChequeStatus(params: {
    chequeId: string;
    newStatus: ChequeStatus;
    actionDate: string;
    reason?: string;
    actor: UserProfile;
  }): ChequeRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);

    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM cheques WHERE id = ?')
        .get(params.chequeId) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Cheque not found: ${params.chequeId}`);
      }

      const currentStatus = row.status as ChequeStatus;
      const direction = row.direction as ChequeDirection;
      const amountPaise = Number(row.amount_paise);
      const bankAccountId = String(row.bank_account_id);
      const partyId = row.party_id ? String(row.party_id) : null;
      const chequeNo = String(row.cheque_no);

      let journalEntryId = row.journal_entry_id ? String(row.journal_entry_id) : null;
      let reversalJournalEntryId = row.reversal_journal_entry_id
        ? String(row.reversal_journal_entry_id)
        : null;

      // Determine party control account if linked
      let partyControlAccount = direction === 'RECEIVED' ? '1102' : '1101';
      if (partyId) {
        const pRow = this.db
          .prepare('SELECT party_type FROM parties WHERE id = ?')
          .get(partyId) as { party_type: PartyType } | undefined;
        if (pRow) {
          partyControlAccount =
            pRow.party_type === 'FARMER'
              ? '1101'
              : ['BUYER', 'WHOLESALER', 'FACTORY', 'TRADER'].includes(pRow.party_type)
              ? '1102'
              : '2001';
        }
      }

      if (currentStatus === 'PENDING' && params.newStatus === 'CLEARED') {
        const lines: JournalLineInput[] =
          direction === 'RECEIVED'
            ? [
                {
                  accountCode: '1002',
                  bankAccountId,
                  debitPaise: amountPaise,
                  creditPaise: 0,
                  cashDirection: 'BANK_IN',
                  lineNote: `Cheque #${chequeNo} cleared into bank`,
                },
                {
                  accountCode: partyControlAccount,
                  partyId,
                  debitPaise: 0,
                  creditPaise: amountPaise,
                  cashDirection: 'NON_CASH',
                  lineNote: `Cheque #${chequeNo} realization from ${row.party_name}`,
                },
              ]
            : [
                {
                  accountCode: partyControlAccount,
                  partyId,
                  debitPaise: amountPaise,
                  creditPaise: 0,
                  cashDirection: 'NON_CASH',
                  lineNote: `Cheque #${chequeNo} cleared to ${row.party_name}`,
                },
                {
                  accountCode: '1002',
                  bankAccountId,
                  debitPaise: 0,
                  creditPaise: amountPaise,
                  cashDirection: 'BANK_OUT',
                  lineNote: `Cheque #${chequeNo} debited from bank`,
                },
              ];

        const je = this.postJournalEntry({
          transactionDate: params.actionDate,
          sourceType: 'CHEQUE_CLEARANCE',
          sourceId: chequeNo,
          idempotencyKey: `JE-CHQ-CLR-${params.chequeId}`,
          narration: `${direction} Cheque #${chequeNo} (${row.party_name}) cleared on ${params.actionDate}`,
          lines,
          actor: params.actor,
        });
        journalEntryId = je.id;
      } else if (currentStatus === 'CLEARED' && params.newStatus === 'BOUNCED') {
        if (!params.reason || params.reason.trim().length < 3) {
          throw new Error('Bounce reason is required when marking a cleared cheque as BOUNCED.');
        }
        if (journalEntryId) {
          const rev = this.reverseJournalEntry({
            entryId: journalEntryId,
            reversalDate: params.actionDate,
            reason: `Cheque #${chequeNo} bounced: ${params.reason.trim()}`,
            actor: params.actor,
          });
          reversalJournalEntryId = rev.id;
        }
      }

      this.db
        .prepare(
          `
        UPDATE cheques
        SET status = ?, cleared_date = ?, bounced_reason = ?,
            journal_entry_id = ?, reversal_journal_entry_id = ?
        WHERE id = ?
      `
        )
        .run(
          params.newStatus,
          params.newStatus === 'CLEARED' ? params.actionDate : row.cleared_date,
          params.newStatus === 'BOUNCED' || params.newStatus === 'CANCELLED'
            ? (params.reason || 'Cheque returned/cancelled').trim()
            : row.bounced_reason,
          journalEntryId,
          reversalJournalEntryId,
          params.chequeId
        );

      this.recordAuditLog({
        entityType: 'CHEQUE_REGISTER',
        entityId: String(row.id),
        action: `CHEQUE_${params.newStatus}`,
        beforeData: { status: currentStatus },
        afterData: {
          status: params.newStatus,
          journalEntryId,
          reversalJournalEntryId,
        },
        reason: params.reason?.trim() || `Cheque #${chequeNo} marked ${params.newStatus}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.listCheques().find((c) => c.id === params.chequeId)!;
    });

    return tx();
  }

  public listCheques(bankAccountId?: string): ChequeRecord[] {
    let sql = `
      SELECT c.*, b.account_label as bank_account_label
      FROM cheques c
      LEFT JOIN bank_accounts b ON b.id = c.bank_account_id
    `;
    const params: unknown[] = [];
    if (bankAccountId) {
      sql += ` WHERE c.bank_account_id = ?`;
      params.push(bankAccountId);
    }
    sql += ` ORDER BY c.cheque_date DESC, c.created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      chequeNo: String(r.cheque_no),
      chequeDate: String(r.cheque_date),
      direction: r.direction as ChequeDirection,
      bankAccountId: String(r.bank_account_id),
      bankAccountLabel: r.bank_account_label ? String(r.bank_account_label) : undefined,
      partyId: r.party_id ? String(r.party_id) : null,
      partyName: String(r.party_name),
      amountPaise: Number(r.amount_paise),
      purpose: String(r.purpose || ''),
      status: r.status as ChequeStatus,
      clearedDate: r.cleared_date ? String(r.cleared_date) : null,
      bouncedReason: r.bounced_reason ? String(r.bounced_reason) : null,
      journalEntryId: r.journal_entry_id ? String(r.journal_entry_id) : null,
      reversalJournalEntryId: r.reversal_journal_entry_id
        ? String(r.reversal_journal_entry_id)
        : null,
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Bank Statement Reconciliation Engine (AT-17, SRS Sec 12.4):
   * Matches imported/entered bank statement lines against SGT book journal lines
   * WITHOUT ever deleting unmatched book records.
   */
  public addBankStatementLines(params: {
    bankAccountId: string;
    lines: Array<{
      valueDate: string;
      description: string;
      referenceNo?: string;
      debitPaise?: number;
      creditPaise?: number;
    }>;
    actor: UserProfile;
  }): BankStatementLineRecord[] {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);
    const nowIso = new Date().toISOString();
    const insertStmt = this.db.prepare(
      `
      INSERT INTO bank_statement_lines (
        id, bank_account_id, value_date, description, reference_no,
        debit_paise, credit_paise, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)
    `
    );

    const tx = this.db.transaction(() => {
      for (const l of params.lines) {
        const id = `BSL-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        insertStmt.run(
          id,
          params.bankAccountId,
          l.valueDate,
          l.description.trim(),
          (l.referenceNo || '').trim(),
          Math.max(0, Math.round(l.debitPaise || 0)),
          Math.max(0, Math.round(l.creditPaise || 0)),
          nowIso
        );
      }
      return this.listBankStatementLines(params.bankAccountId);
    });

    return tx();
  }

  public listBankStatementLines(bankAccountId?: string): BankStatementLineRecord[] {
    let sql = `SELECT * FROM bank_statement_lines`;
    const params: unknown[] = [];
    if (bankAccountId) {
      sql += ` WHERE bank_account_id = ?`;
      params.push(bankAccountId);
    }
    sql += ` ORDER BY value_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      bankAccountId: String(r.bank_account_id),
      valueDate: String(r.value_date),
      description: String(r.description),
      referenceNo: String(r.reference_no || ''),
      debitPaise: Number(r.debit_paise || 0),
      creditPaise: Number(r.credit_paise || 0),
      status: (r.status as 'UNMATCHED' | 'MATCHED') || 'UNMATCHED',
      matchedJournalLineId: r.matched_journal_line_id ? String(r.matched_journal_line_id) : null,
      matchedEntryNo: r.matched_entry_no ? String(r.matched_entry_no) : null,
      reconciledBy: r.reconciled_by ? String(r.reconciled_by) : null,
      reconciledAt: r.reconciled_at ? String(r.reconciled_at) : null,
      createdAt: String(r.created_at),
    }));
  }

  public reconcileBankStatement(params: {
    bankAccountId: string;
    actor: UserProfile;
  }) {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);

    const tx = this.db.transaction(() => {
      const statementLines = this.listBankStatementLines(params.bankAccountId);
      const bookLines = this.db
        .prepare(
          `
        SELECT jl.*, je.entry_no, je.transaction_date, je.source_id, je.narration, je.status as entry_status
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.bank_account_id = ? AND jl.account_code = '1002' AND je.status = 'POSTED'
        ORDER BY je.transaction_date ASC
      `
        )
        .all(params.bankAccountId) as Array<Record<string, unknown>>;

      const usedBookLineIds = new Set<string>(
        statementLines
          .filter((s) => s.status === 'MATCHED' && s.matchedJournalLineId)
          .map((s) => s.matchedJournalLineId!)
      );

      const nowIso = new Date().toISOString();
      let newlyMatchedCount = 0;

      for (const stmt of statementLines) {
        if (stmt.status === 'MATCHED') continue;

        // Bank Statement Credit (Deposit) matches SGT Book Debit; Bank Statement Debit (Withdrawal) matches SGT Book Credit
        const candidate = bookLines.find((b) => {
          const bId = String(b.id);
          if (usedBookLineIds.has(bId)) return false;
          const bDr = Number(b.debit_paise || 0);
          const bCr = Number(b.credit_paise || 0);
          const amountMatches =
            (stmt.creditPaise > 0 && stmt.creditPaise === bDr) ||
            (stmt.debitPaise > 0 && stmt.debitPaise === bCr);
          return amountMatches;
        });

        if (candidate) {
          const bId = String(candidate.id);
          const entryNo = String(candidate.entry_no);
          usedBookLineIds.add(bId);
          newlyMatchedCount++;

          this.db
            .prepare(
              `
            UPDATE bank_statement_lines
            SET status = 'MATCHED', matched_journal_line_id = ?, matched_entry_no = ?,
                reconciled_by = ?, reconciled_at = ?
            WHERE id = ?
          `
            )
            .run(bId, entryNo, params.actor.fullName, nowIso, stmt.id);
        }
      }

      const updatedStatementLines = this.listBankStatementLines(params.bankAccountId);
      const unmatchedBookLines = bookLines
        .filter((b) => !usedBookLineIds.has(String(b.id)))
        .map((b) => ({
          journalLineId: String(b.id),
          entryNo: String(b.entry_no),
          transactionDate: String(b.transaction_date),
          narration: String(b.line_note || b.narration),
          debitPaise: Number(b.debit_paise || 0),
          creditPaise: Number(b.credit_paise || 0),
        }));

      return {
        newlyMatchedCount,
        statementLines: updatedStatementLines,
        matchedCount: updatedStatementLines.filter((s) => s.status === 'MATCHED').length,
        unmatchedStatementLines: updatedStatementLines.filter((s) => s.status === 'UNMATCHED'),
        unmatchedBookLines,
      };
    });

    return tx();
  }

  /**
   * Farmer Loan Disbursement & Repayment Engine (SRS Sec 5.1, 5.2, AT-02, AT-03).
   */
  public disburseFarmerLoan(params: {
    farmerId: string;
    disbursementDate: string;
    principalPaise: number;
    paymentMode: LoanPaymentMode;
    bankAccountId?: string | null;
    bankReference?: string;
    interestRateBps?: number;
    rateUnit?: RateUnit;
    interestMethod?: InterestMethod;
    dayCountConvention?: DayCountConvention;
    repaymentOrder?: RepaymentAllocationOrder;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): LoanRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_LOANS);
    const principalPaise = Math.round(Number(params.principalPaise || 0));
    if (principalPaise <= 0) {
      throw new Error('Loan principal must be greater than zero.');
    }

    const tx = this.db.transaction(() => {
      const idemKey =
        params.idempotencyKey?.trim() ||
        `LOAN-${params.farmerId}-${params.disbursementDate}-${principalPaise}-${Date.now()}`;

      const existingLoan = this.db
        .prepare('SELECT id FROM loans WHERE idempotency_key = ?')
        .get(idemKey) as { id: string } | undefined;
      if (existingLoan) {
        return this.getLoanById(existingLoan.id);
      }

      const farmerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.farmerId) as Record<string, unknown> | undefined;
      if (!farmerRow) {
        throw new Error(`Farmer not found: ${params.farmerId}`);
      }
      if (farmerRow.party_type !== 'FARMER') {
        throw new Error(`Loans can only be disbursed to registered Farmers (found ${farmerRow.party_type}).`);
      }
      if (farmerRow.status !== 'ACTIVE') {
        throw new Error(`Cannot disburse a loan to inactive farmer ${farmerRow.name} (${farmerRow.party_code}).`);
      }

      if (params.paymentMode !== 'CASH' && !params.bankAccountId) {
        throw new Error(`Bank account selection is required for ${params.paymentMode} loan disbursement.`);
      }

      const settings = this.getCompanySettings();
      const rateBps =
        params.interestRateBps !== undefined
          ? Math.round(Number(params.interestRateBps))
          : settings.interestPolicy.defaultRateBps;
      const rateUnit = params.rateUnit ?? settings.interestPolicy.defaultRateUnit;
      const method = params.interestMethod ?? settings.interestPolicy.defaultMethod;
      const dayCount = params.dayCountConvention ?? settings.interestPolicy.dayCountConvention;
      const repaymentOrder =
        params.repaymentOrder ?? settings.interestPolicy.repaymentAllocationOrder;

      const loanId = `LN-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const issuedNo = this.allocateDocumentNumber({
        docType: DocumentSeriesType.LOAN,
        referenceEntityId: loanId,
        transactionDate: params.disbursementDate,
        idempotencyKey: `NUM-${idemKey}`,
        actor: params.actor,
      });

      const creditAccountCode = params.paymentMode === 'CASH' ? '1001' : '1002';
      const cashDir: CashFlowDirection =
        params.paymentMode === 'CASH' ? 'CASH_OUT' : 'BANK_OUT';

      const je = this.postJournalEntry({
        transactionDate: params.disbursementDate,
        sourceType: 'LOAN_DISBURSEMENT',
        sourceId: issuedNo.formattedNumber,
        idempotencyKey: `JE-${idemKey}`,
        narration: `Loan disbursed to ${farmerRow.name} (${farmerRow.party_code}) via ${params.paymentMode} — Voucher ${issuedNo.formattedNumber}`,
        lines: [
          {
            accountCode: '1201',
            partyId: String(farmerRow.id),
            ledgerBucket: 'LOAN_PRINCIPAL',
            debitPaise: principalPaise,
            creditPaise: 0,
            cashDirection: 'NON_CASH',
            lineNote: `Loan Principal disbursed (${issuedNo.formattedNumber})`,
          },
          {
            accountCode: creditAccountCode,
            bankAccountId: params.paymentMode !== 'CASH' ? params.bankAccountId ?? null : null,
            debitPaise: 0,
            creditPaise: principalPaise,
            cashDirection: cashDir,
            lineNote: `Loan payout to ${farmerRow.name} (${params.bankReference || params.paymentMode})`,
          },
        ],
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `
        INSERT INTO loans (
          id, loan_no, farmer_id, disbursement_date, principal_paise, payment_mode,
          bank_account_id, bank_reference, interest_rate_bps, rate_unit, interest_method,
          day_count_convention, repayment_order, principal_repaid_paise, interest_paid_paise,
          status, notes, journal_entry_id, idempotency_key, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'ACTIVE', ?, ?, ?, ?, ?)
      `
        )
        .run(
          loanId,
          issuedNo.formattedNumber,
          String(farmerRow.id),
          params.disbursementDate,
          principalPaise,
          params.paymentMode,
          params.bankAccountId ?? null,
          (params.bankReference || '').trim(),
          rateBps,
          rateUnit,
          method,
          dayCount,
          repaymentOrder,
          (params.notes || '').trim(),
          je.id,
          idemKey,
          params.actor.fullName,
          nowIso
        );

      this.db
        .prepare(
          `
        INSERT INTO loan_transactions (
          id, loan_id, txn_no, transaction_date, txn_type, total_amount_paise,
          principal_component_paise, interest_component_paise, payment_mode,
          bank_account_id, reference_no, journal_entry_id, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, 'DISBURSEMENT', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          `LTX-${loanId}-1`,
          loanId,
          issuedNo.formattedNumber,
          params.disbursementDate,
          principalPaise,
          principalPaise,
          params.paymentMode,
          params.bankAccountId ?? null,
          (params.bankReference || '').trim(),
          je.id,
          (params.notes || 'Initial loan disbursement').trim(),
          params.actor.fullName,
          nowIso
        );

      this.recordAuditLog({
        entityType: 'FARMER_LOAN',
        entityId: issuedNo.formattedNumber,
        action: 'DISBURSE_LOAN',
        afterData: {
          loanNo: issuedNo.formattedNumber,
          farmerCode: farmerRow.party_code,
          farmerName: farmerRow.name,
          principalPaise,
          paymentMode: params.paymentMode,
          interestRateBps: rateBps,
          journalEntryNo: je.entryNo,
        },
        reason: `Disbursed loan ${issuedNo.formattedNumber} to ${farmerRow.name}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getLoanById(loanId);
    });

    return tx();
  }

  public recordLoanRepayment(params: {
    loanId: string;
    repaymentDate: string;
    amountPaise: number;
    paymentMode: LoanPaymentMode;
    bankAccountId?: string | null;
    referenceNo?: string;
    allocationOverride?: RepaymentAllocationOrder;
    manualPrincipalPaise?: number;
    manualInterestPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): { loan: LoanRecord; transaction: LoanTransactionRecord } {
    this.requirePermission(params.actor, PermissionKey.MANAGE_LOANS);
    const amountPaise = Math.round(Number(params.amountPaise || 0));
    if (amountPaise <= 0) {
      throw new Error('Repayment amount must be greater than zero.');
    }

    const tx = this.db.transaction(() => {
      const loan = this.getLoanById(params.loanId, params.repaymentDate);
      if (loan.status !== 'ACTIVE') {
        throw new Error(`Loan ${loan.loanNo} is ${loan.status} and cannot accept new repayments.`);
      }

      const order = params.allocationOverride ?? loan.repaymentOrder;
      let principalComponentPaise = 0;
      let interestComponentPaise = 0;

      if (order === RepaymentAllocationOrder.MANUAL && params.manualPrincipalPaise !== undefined) {
        principalComponentPaise = Math.round(Number(params.manualPrincipalPaise));
        interestComponentPaise = Math.round(Number(params.manualInterestPaise ?? 0));
        if (principalComponentPaise < 0 || interestComponentPaise < 0) {
          throw new Error('Manual principal and interest components must be non-negative.');
        }
        if (principalComponentPaise + interestComponentPaise !== amountPaise) {
          throw new Error('Manual principal + interest components must equal total repayment amount.');
        }
      } else if (order === RepaymentAllocationOrder.INTEREST_FIRST) {
        interestComponentPaise = Math.min(amountPaise, loan.accruedInterestAsOfTodayPaise);
        principalComponentPaise = Math.min(
          amountPaise - interestComponentPaise,
          loan.principalOutstandingPaise
        );
      } else {
        // PRINCIPAL_FIRST (Default per DR-01)
        principalComponentPaise = Math.min(amountPaise, loan.principalOutstandingPaise);
        interestComponentPaise = Math.max(0, amountPaise - principalComponentPaise);
      }

      const receiptNo = this.allocateDocumentNumber({
        docType: DocumentSeriesType.RECEIPT,
        referenceEntityId: `${loan.id}-${Date.now()}`,
        transactionDate: params.repaymentDate,
        idempotencyKey: params.idempotencyKey ? `NUM-${params.idempotencyKey}` : undefined,
        actor: params.actor,
      });

      const debitAccountCode = params.paymentMode === 'CASH' ? '1001' : '1002';
      const cashDir: CashFlowDirection =
        params.paymentMode === 'CASH' ? 'CASH_IN' : 'BANK_IN';

      const lines: JournalLineInput[] = [
        {
          accountCode: debitAccountCode,
          bankAccountId: params.paymentMode !== 'CASH' ? params.bankAccountId ?? null : null,
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: cashDir,
          lineNote: `Loan repayment received (${receiptNo.formattedNumber}) for ${loan.loanNo}`,
        },
      ];

      if (principalComponentPaise > 0) {
        lines.push({
          accountCode: '1201',
          partyId: loan.farmerId,
          ledgerBucket: 'LOAN_PRINCIPAL',
          debitPaise: 0,
          creditPaise: principalComponentPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Loan Principal recovery on ${loan.loanNo}`,
        });
      }
      if (interestComponentPaise > 0) {
        lines.push({
          accountCode: '4003',
          partyId: loan.farmerId,
          ledgerBucket: 'LOAN_INTEREST',
          debitPaise: 0,
          creditPaise: interestComponentPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Loan Interest collected on ${loan.loanNo}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: params.repaymentDate,
        sourceType: 'LOAN_REPAYMENT',
        sourceId: receiptNo.formattedNumber,
        idempotencyKey:
          params.idempotencyKey || `JE-LREP-${loan.id}-${receiptNo.formattedNumber}`,
        narration: `Loan repayment on ${loan.loanNo} from ${loan.farmerName} (${loan.farmerCode})`,
        lines,
        actor: params.actor,
      });

      const newPrincipalRepaid = loan.principalRepaidPaise + principalComponentPaise;
      const newInterestPaid = loan.interestPaidPaise + interestComponentPaise;
      const nextStatus =
        newPrincipalRepaid >= loan.principalPaise &&
        interestComponentPaise >= loan.accruedInterestAsOfTodayPaise
          ? 'CLOSED'
          : 'ACTIVE';

      this.db
        .prepare(
          `
        UPDATE loans
        SET principal_repaid_paise = ?, interest_paid_paise = ?, status = ?
        WHERE id = ?
      `
        )
        .run(newPrincipalRepaid, newInterestPaid, nextStatus, loan.id);

      const txnId = `LTX-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO loan_transactions (
          id, loan_id, txn_no, transaction_date, txn_type, total_amount_paise,
          principal_component_paise, interest_component_paise, payment_mode,
          bank_account_id, reference_no, journal_entry_id, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, 'REPAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          txnId,
          loan.id,
          receiptNo.formattedNumber,
          params.repaymentDate,
          amountPaise,
          principalComponentPaise,
          interestComponentPaise,
          params.paymentMode,
          params.bankAccountId ?? null,
          (params.referenceNo || '').trim(),
          je.id,
          (params.notes || `Loan repayment (${order})`).trim(),
          params.actor.fullName,
          nowIso
        );

      const updatedLoan = this.getLoanById(loan.id, params.repaymentDate);
      const txnRow = this.db
        .prepare('SELECT * FROM loan_transactions WHERE id = ?')
        .get(txnId) as Record<string, unknown>;

      return {
        loan: updatedLoan,
        transaction: this.mapLoanTransactionRow(txnRow),
      };
    });

    return tx();
  }

  public listLoans(farmerId?: string, asOfDate = getTodayIST()): LoanRecord[] {
    let sql = `SELECT id FROM loans`;
    const params: unknown[] = [];
    if (farmerId) {
      sql += ` WHERE farmer_id = ?`;
      params.push(farmerId);
    }
    sql += ` ORDER BY disbursement_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getLoanById(r.id, asOfDate));
  }

  public getLoanById(loanId: string, asOfDate = getTodayIST()): LoanRecord {
    const r = this.db
      .prepare(
        `
      SELECT l.*, p.party_code as farmer_code, p.name as farmer_name, p.village as farmer_village
      FROM loans l
      JOIN parties p ON p.id = l.farmer_id
      WHERE l.id = ? OR l.loan_no = ?
    `
      )
      .get(loanId, loanId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Loan not found: ${loanId}`);
    }

    const settings = this.getCompanySettings();
    const repaymentRows = this.db
      .prepare(
        `
      SELECT transaction_date, total_amount_paise
      FROM loan_transactions
      WHERE loan_id = ? AND txn_type IN ('REPAYMENT', 'PATTI_RECOVERY')
      ORDER BY transaction_date ASC, created_at ASC
    `
      )
      .all(r.id) as Array<{ transaction_date: string; total_amount_paise: number }>;

    const disbursementDate = String(r.disbursement_date);
    const calcEndDate = asOfDate >= disbursementDate ? asOfDate : disbursementDate;

    const calcResult = calculateInterest({
      principalPaise: Number(r.principal_paise),
      ratePercentage: Number(r.interest_rate_bps) / 100,
      rateUnit: r.rate_unit as RateUnit,
      startDate: disbursementDate,
      endDate: calcEndDate,
      method: r.interest_method as InterestMethod,
      dayCountConvention: r.day_count_convention as DayCountConvention,
      repaymentAllocationOrder: r.repayment_order as RepaymentAllocationOrder,
      roundingMode: settings.roundingMode,
      repayments: repaymentRows.map((rep) => ({
        date: String(rep.transaction_date),
        amountPaise: Number(rep.total_amount_paise),
      })),
    });

    const principalPaise = Number(r.principal_paise);
    const principalRepaidPaise = Number(r.principal_repaid_paise);
    const principalOutstandingPaise = Math.max(0, principalPaise - principalRepaidPaise);

    return {
      id: String(r.id),
      loanNo: String(r.loan_no),
      farmerId: String(r.farmer_id),
      farmerCode: String(r.farmer_code),
      farmerName: String(r.farmer_name),
      farmerVillage: String(r.farmer_village || ''),
      disbursementDate,
      principalPaise,
      paymentMode: r.payment_mode as LoanPaymentMode,
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      bankReference: String(r.bank_reference || ''),
      interestRateBps: Number(r.interest_rate_bps),
      rateUnit: r.rate_unit as RateUnit,
      interestMethod: r.interest_method as InterestMethod,
      dayCountConvention: r.day_count_convention as DayCountConvention,
      repaymentOrder: r.repayment_order as RepaymentAllocationOrder,
      principalRepaidPaise,
      interestPaidPaise: Number(r.interest_paid_paise),
      principalOutstandingPaise,
      accruedInterestAsOfTodayPaise: calcResult.closingInterestOutstandingPaise,
      totalOutstandingAsOfTodayPaise:
        principalOutstandingPaise + calcResult.closingInterestOutstandingPaise,
      status: (r.status as 'ACTIVE' | 'CLOSED' | 'REVERSED') || 'ACTIVE',
      notes: String(r.notes || ''),
      journalEntryId: String(r.journal_entry_id),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  public listLoanTransactions(loanId?: string): LoanTransactionRecord[] {
    let sql = `SELECT * FROM loan_transactions`;
    const params: unknown[] = [];
    if (loanId) {
      sql += ` WHERE loan_id = ?`;
      params.push(loanId);
    }
    sql += ` ORDER BY transaction_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapLoanTransactionRow(r));
  }

  private mapLoanTransactionRow(r: Record<string, unknown>): LoanTransactionRecord {
    return {
      id: String(r.id),
      loanId: String(r.loan_id),
      txnNo: String(r.txn_no),
      transactionDate: String(r.transaction_date),
      txnType: r.txn_type as LoanTransactionRecord['txnType'],
      totalAmountPaise: Number(r.total_amount_paise),
      principalComponentPaise: Number(r.principal_component_paise),
      interestComponentPaise: Number(r.interest_component_paise),
      paymentMode: r.payment_mode as LoanPaymentMode,
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      referenceNo: String(r.reference_no || ''),
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  private formatDocNumber(
    prefix: string,
    fy: string,
    seq: number,
    padding: number,
    includeFy: boolean
  ): string {
    const seqStr = String(seq).padStart(padding, '0');
    return includeFy ? `${prefix}${fy}-${seqStr}` : `${prefix}${seqStr}`;
  }

  private mapSeriesRow(r: Record<string, unknown>): NumberSeriesRecord {
    const prefix = String(r.prefix);
    const fy = String(r.financial_year);
    const seq = Number(r.current_sequence);
    const pad = Number(r.padding_length);
    const includeFy = Boolean(r.include_fy_in_number);
    return {
      id: String(r.id),
      docType: r.doc_type as DocumentSeriesType,
      labelEn: String(r.label_en),
      labelKn: String(r.label_kn),
      financialYear: fy,
      prefix,
      currentSequence: seq,
      paddingLength: pad,
      includeFyInNumber: includeFy,
      samplePreview: this.formatDocNumber(prefix, fy, seq + 1, pad, includeFy),
      updatedAt: String(r.updated_at),
    };
  }

  private mapIssuedNumberRow(r: Record<string, unknown>): IssuedDocumentNumber {
    return {
      id: String(r.id),
      docType: r.doc_type as DocumentSeriesType,
      financialYear: String(r.financial_year),
      sequenceNumber: Number(r.sequence_number),
      formattedNumber: String(r.formatted_number),
      referenceEntityId: String(r.reference_entity_id),
      transactionDate: String(r.transaction_date),
      status: r.status as 'ACTIVE' | 'CANCELLED',
      cancelReason: r.cancel_reason ? String(r.cancel_reason) : null,
      cancelledBy: r.cancelled_by ? String(r.cancelled_by) : null,
      cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
      issuedBy: String(r.issued_by),
      issuedAt: String(r.issued_at),
    };
  }

  private mapUserRow(r: Record<string, unknown>): UserProfile {
    return {
      id: String(r.id),
      username: String(r.username),
      fullName: String(r.full_name),
      role: r.role as UserRole,
      permissions: JSON.parse(String(r.permissions_json)) as PermissionKey[],
      canViewSensitiveKyc: Boolean(r.can_view_sensitive_kyc),
      status: r.status as 'ACTIVE' | 'INACTIVE',
      lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
      createdAt: String(r.created_at),
    };
  }

  // ============================================================================
  // CHUNK 5: FARMER PATTI SETTLEMENT ENGINE (AT-08) & BUYER-SIDE KHARIDI PATTI
  // ============================================================================

  /**
   * Creates an atomic Farmer Patti settlement (SRS Section 7.1 & AT-08).
   * - Allocates `SGT-FP-*` document number
   * - Calculates gross crop value across 1..N commodity lots
   * - Deducts commission, hamali, weighment, mandi fee, and optional custom deductions
   * - Integrates with active Farmer Loans: recovers up to available proceeds using
   *   configured Principal-First or Interest-First order, and carries forward any
   *   unrecovered loan balance when deductions + loan due exceed gross crop value (AT-08)
   * - Posts balanced Central Khata Book journal entry and Stock Movements in one ACID transaction
   */
  public createFarmerPatti(params: {
    pattiDate?: string;
    farmerId: string;
    ownershipMode?: StockOwnershipType;
    vehicleNo?: string;
    items: FarmerPattiLineInput[];
    commissionRateBps?: number;
    commissionAmountPaise?: number;
    hamaliAmountPaise?: number;
    weighmentFeePaise?: number;
    mandiFeePaise?: number;
    otherDeductionsPaise?: number;
    otherDeductionsLabel?: string;
    linkedLoanId?: string | null;
    recoverLoanInPatti?: boolean;
    loanRecoveryOverridePaise?: number;
    paymentMode?: PattiSettlementPaymentMode;
    bankAccountId?: string | null;
    amountPaidNowPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): FarmerPattiRecord {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.farmerId) {
      throw new Error('Farmer selection is required to create a Farmer Patti.');
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('At least one commodity lot item is required in Farmer Patti.');
    }

    const pattiDate = params.pattiDate?.trim() || getTodayIST();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `FP-${params.farmerId}-${pattiDate}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const existing = this.db
      .prepare('SELECT id FROM farmer_pattis WHERE idempotency_key = ?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) {
      return this.getFarmerPattiById(existing.id);
    }

    const tx = this.db.transaction(() => {
      const farmerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.farmerId) as Record<string, unknown> | undefined;
      if (!farmerRow) {
        throw new Error(`Farmer not found: ${params.farmerId}`);
      }

      const settings = this.getCompanySettings();
      const ownershipMode: StockOwnershipType =
        params.ownershipMode === 'SGT_OWNED' ? 'SGT_OWNED' : 'FARMER_AGENCY';

      let totalBags = 0;
      let totalNetWeightGrams = 0;
      let grossCropAmountPaise = 0;

      const preparedItems: Array<{
        lineNo: number;
        commodityId: string;
        commodityNameEn: string;
        bags: number;
        grossWeightGrams: number;
        tareWeightGrams: number;
        moisturePct: number;
        netWeightGrams: number;
        ratePerQuintalPaise: number;
        grossAmountPaise: number;
      }> = [];

      params.items.forEach((rawItem, idx) => {
        const cmdRow = this.db
          .prepare('SELECT * FROM commodities WHERE id = ?')
          .get(rawItem.commodityId) as Record<string, unknown> | undefined;
        if (!cmdRow) {
          throw new Error(`Commodity not found for line ${idx + 1}: ${rawItem.commodityId}`);
        }

        const bags = Math.max(0, Math.round(Number(rawItem.bags || 0)));
        const tareWeightGrams = Math.max(0, Math.round(Number(rawItem.tareWeightGrams || 0)));
        const grossWeightGrams = Math.max(
          0,
          Math.round(Number(rawItem.grossWeightGrams || rawItem.netWeightGrams || 0))
        );
        const netWeightGrams =
          Number(rawItem.netWeightGrams) > 0
            ? Math.round(Number(rawItem.netWeightGrams))
            : Math.max(0, grossWeightGrams - tareWeightGrams);

        if (netWeightGrams <= 0) {
          throw new Error(`Net weight must be greater than zero on line ${idx + 1}.`);
        }

        const ratePerQuintalPaise = Math.max(
          0,
          Math.round(Number(rawItem.ratePerQuintalPaise || 0))
        );
        const grossAmountPaise = Math.round((netWeightGrams / 100_000) * ratePerQuintalPaise);

        totalBags += bags;
        totalNetWeightGrams += netWeightGrams;
        grossCropAmountPaise += grossAmountPaise;

        preparedItems.push({
          lineNo: idx + 1,
          commodityId: String(cmdRow.id),
          commodityNameEn: String(cmdRow.name_en),
          bags,
          grossWeightGrams: Math.max(grossWeightGrams, netWeightGrams),
          tareWeightGrams,
          moisturePct: Number(rawItem.moisturePct || 0),
          netWeightGrams,
          ratePerQuintalPaise,
          grossAmountPaise,
        });
      });

      const commissionRateBps =
        params.commissionRateBps !== undefined
          ? Math.max(0, Math.round(Number(params.commissionRateBps)))
          : settings.commissionHamaliPolicy.defaultCommissionBps || 0;

      const commissionAmountPaise =
        params.commissionAmountPaise !== undefined
          ? Math.max(0, Math.round(Number(params.commissionAmountPaise)))
          : Math.round((grossCropAmountPaise * commissionRateBps) / 10_000);

      const hamaliAmountPaise =
        params.hamaliAmountPaise !== undefined
          ? Math.max(0, Math.round(Number(params.hamaliAmountPaise)))
          : totalBags * (settings.commissionHamaliPolicy.defaultHamaliPerBagPaise || 0);

      const weighmentFeePaise = Math.max(0, Math.round(Number(params.weighmentFeePaise || 0)));
      const mandiFeePaise = Math.max(0, Math.round(Number(params.mandiFeePaise || 0)));
      const otherDeductionsPaise = Math.max(
        0,
        Math.round(Number(params.otherDeductionsPaise || 0))
      );
      const otherDeductionsLabel = (params.otherDeductionsLabel || 'Other Deductions').trim();

      const totalOperationalDeductionsPaise =
        commissionAmountPaise +
        hamaliAmountPaise +
        weighmentFeePaise +
        mandiFeePaise +
        otherDeductionsPaise;

      if (totalOperationalDeductionsPaise > grossCropAmountPaise) {
        throw new Error(
          'Total operational deductions (commission, hamali, fees) cannot exceed gross crop value.'
        );
      }

      const netProceedsBeforeLoanPaise = Math.max(
        0,
        grossCropAmountPaise - totalOperationalDeductionsPaise
      );

      // Loan Recovery & Shortfall Carry-Forward (AT-08)
      let activeLoan: LoanRecord | null = null;
      if (params.linkedLoanId) {
        activeLoan = this.getLoanById(params.linkedLoanId, pattiDate);
      } else if (params.recoverLoanInPatti || (params.loanRecoveryOverridePaise ?? 0) > 0) {
        const farmerLoans = this.listLoans(params.farmerId, pattiDate).filter(
          (l) => l.status === 'ACTIVE' && l.totalOutstandingAsOfTodayPaise > 0
        );
        if (farmerLoans.length > 0) {
          // Pick oldest active loan first
          activeLoan = farmerLoans[farmerLoans.length - 1];
        }
      }

      let loanDueBeforePattiPaise = 0;
      let loanPrincipalRecoveredPaise = 0;
      let loanInterestRecoveredPaise = 0;
      let totalLoanRecoveredPaise = 0;
      let carryForwardLoanBalancePaise = 0;

      if (activeLoan && activeLoan.status === 'ACTIVE') {
        loanDueBeforePattiPaise =
          activeLoan.principalOutstandingPaise + activeLoan.accruedInterestAsOfTodayPaise;

        const shouldRecover =
          params.recoverLoanInPatti !== false &&
          (Boolean(params.linkedLoanId) ||
            Boolean(params.recoverLoanInPatti) ||
            params.loanRecoveryOverridePaise !== undefined);

        if (shouldRecover && loanDueBeforePattiPaise > 0) {
          const requestedRecoveryPaise =
            params.loanRecoveryOverridePaise !== undefined
              ? Math.max(0, Math.round(Number(params.loanRecoveryOverridePaise)))
              : loanDueBeforePattiPaise;

          // AT-08: Cap loan recovery at netProceedsBeforeLoanPaise so Farmer Patti never goes negative;
          // any excess loan balance is carried forward cleanly.
          const actualRecoverablePaise = Math.min(
            requestedRecoveryPaise,
            netProceedsBeforeLoanPaise,
            loanDueBeforePattiPaise
          );

          if (activeLoan.repaymentOrder === RepaymentAllocationOrder.INTEREST_FIRST) {
            loanInterestRecoveredPaise = Math.min(
              actualRecoverablePaise,
              activeLoan.accruedInterestAsOfTodayPaise
            );
            loanPrincipalRecoveredPaise = Math.min(
              actualRecoverablePaise - loanInterestRecoveredPaise,
              activeLoan.principalOutstandingPaise
            );
          } else {
            // Default PRINCIPAL_FIRST per DR-01
            loanPrincipalRecoveredPaise = Math.min(
              actualRecoverablePaise,
              activeLoan.principalOutstandingPaise
            );
            loanInterestRecoveredPaise = Math.min(
              actualRecoverablePaise - loanPrincipalRecoveredPaise,
              activeLoan.accruedInterestAsOfTodayPaise
            );
          }

          totalLoanRecoveredPaise = loanPrincipalRecoveredPaise + loanInterestRecoveredPaise;
        }

        carryForwardLoanBalancePaise = Math.max(
          0,
          loanDueBeforePattiPaise - totalLoanRecoveredPaise
        );
      }

      const netPayablePaise = Math.max(
        0,
        netProceedsBeforeLoanPaise - totalLoanRecoveredPaise
      );

      const paymentMode: PattiSettlementPaymentMode = params.paymentMode || 'CASH';
      const bankAccountId =
        paymentMode === 'BANK_TRANSFER' ? params.bankAccountId ?? null : null;
      if (paymentMode === 'BANK_TRANSFER' && netPayablePaise > 0 && !bankAccountId) {
        throw new Error('Bank account selection is required for BANK_TRANSFER Patti payout.');
      }

      let amountPaidNowPaise = 0;
      if (paymentMode === 'CREDIT_PAYABLE') {
        amountPaidNowPaise = Math.min(
          netPayablePaise,
          Math.max(0, Math.round(Number(params.amountPaidNowPaise ?? 0)))
        );
      } else {
        amountPaidNowPaise =
          params.amountPaidNowPaise !== undefined
            ? Math.min(
                netPayablePaise,
                Math.max(0, Math.round(Number(params.amountPaidNowPaise)))
              )
            : netPayablePaise;
      }

      const balancePayablePaise = Math.max(0, netPayablePaise - amountPaidNowPaise);

      const pattiId = `FP-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const pattiDoc = this.allocateDocumentNumber({
        docType: DocumentSeriesType.FARMER_PATTI,
        referenceEntityId: pattiId,
        transactionDate: pattiDate,
        idempotencyKey: `NUM-${idempotencyKey}`,
        actor: params.actor,
      });

      // Build balanced Double-Entry Khata lines
      const debitAccountCode = ownershipMode === 'SGT_OWNED' ? '5001' : '1101';
      const khataLines: JournalLineInput[] = [
        {
          accountCode: debitAccountCode,
          partyId: params.farmerId,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: grossCropAmountPaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Gross crop proceeds (${pattiDoc.formattedNumber}) - ${totalBags} bags`,
        },
      ];

      if (commissionAmountPaise > 0) {
        khataLines.push({
          accountCode: '4002',
          partyId: params.farmerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: commissionAmountPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Commission / Dalali deduction on ${pattiDoc.formattedNumber}`,
        });
      }

      const nonCommissionFeesPaise =
        hamaliAmountPaise + weighmentFeePaise + mandiFeePaise + otherDeductionsPaise;
      if (nonCommissionFeesPaise > 0) {
        khataLines.push({
          accountCode: '4004',
          partyId: params.farmerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: nonCommissionFeesPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Hamali, weighment & market deductions on ${pattiDoc.formattedNumber}`,
        });
      }

      if (loanPrincipalRecoveredPaise > 0) {
        khataLines.push({
          accountCode: '1201',
          partyId: params.farmerId,
          ledgerBucket: 'LOAN_PRINCIPAL',
          debitPaise: 0,
          creditPaise: loanPrincipalRecoveredPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Loan Principal recovered via Patti ${pattiDoc.formattedNumber} (${activeLoan?.loanNo})`,
        });
      }

      if (loanInterestRecoveredPaise > 0) {
        khataLines.push({
          accountCode: '4003',
          partyId: params.farmerId,
          ledgerBucket: 'LOAN_INTEREST',
          debitPaise: 0,
          creditPaise: loanInterestRecoveredPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Loan Interest recovered via Patti ${pattiDoc.formattedNumber} (${activeLoan?.loanNo})`,
        });
      }

      if (amountPaidNowPaise > 0) {
        const payoutAccountCode = paymentMode === 'BANK_TRANSFER' ? '1002' : '1001';
        const payoutCashDir: CashFlowDirection =
          paymentMode === 'BANK_TRANSFER' ? 'BANK_OUT' : 'CASH_OUT';
        khataLines.push({
          accountCode: payoutAccountCode,
          partyId: params.farmerId,
          bankAccountId: paymentMode === 'BANK_TRANSFER' ? bankAccountId : null,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: 0,
          creditPaise: amountPaidNowPaise,
          cashDirection: payoutCashDir,
          lineNote: `Net Farmer Patti payout (${paymentMode}) for ${pattiDoc.formattedNumber}`,
        });
      }

      if (balancePayablePaise > 0) {
        khataLines.push({
          accountCode: '2001',
          partyId: params.farmerId,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: 0,
          creditPaise: balancePayablePaise,
          cashDirection: 'NON_CASH',
          lineNote: `Unpaid Farmer Patti balance payable for ${pattiDoc.formattedNumber}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: pattiDate,
        sourceType: 'FARMER_PATTI',
        sourceId: pattiDoc.formattedNumber,
        idempotencyKey: `JE-${idempotencyKey}`,
        narration: `Farmer Patti ${pattiDoc.formattedNumber} for ${String(farmerRow.name)} (${String(farmerRow.party_code)})`,
        lines: khataLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();

      // Update active loan & record PATTI_RECOVERY transaction if loan recovery occurred
      if (activeLoan && totalLoanRecoveredPaise > 0) {
        const newPrincipalRepaid =
          activeLoan.principalRepaidPaise + loanPrincipalRecoveredPaise;
        const newInterestPaid = activeLoan.interestPaidPaise + loanInterestRecoveredPaise;
        const nextLoanStatus = carryForwardLoanBalancePaise === 0 ? 'CLOSED' : 'ACTIVE';

        this.db
          .prepare(
            `
          UPDATE loans
          SET principal_repaid_paise = ?, interest_paid_paise = ?, status = ?
          WHERE id = ?
        `
          )
          .run(newPrincipalRepaid, newInterestPaid, nextLoanStatus, activeLoan.id);

        const ltxId = `LTX-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        this.db
          .prepare(
            `
          INSERT INTO loan_transactions (
            id, loan_id, txn_no, transaction_date, txn_type, total_amount_paise,
            principal_component_paise, interest_component_paise, payment_mode,
            bank_account_id, reference_no, journal_entry_id, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'PATTI_RECOVERY', ?, ?, ?, 'CASH', NULL, ?, ?, ?, ?, ?)
        `
          )
          .run(
            ltxId,
            activeLoan.id,
            pattiDoc.formattedNumber,
            pattiDate,
            totalLoanRecoveredPaise,
            loanPrincipalRecoveredPaise,
            loanInterestRecoveredPaise,
            pattiDoc.formattedNumber,
            je.id,
            `Recovered in Farmer Patti ${pattiDoc.formattedNumber}. Carry-forward balance: ₹${(carryForwardLoanBalancePaise / 100).toFixed(2)}`,
            params.actor.fullName,
            nowIso
          );
      }

      // Insert Farmer Patti header
      this.db
        .prepare(
          `
        INSERT INTO farmer_pattis (
          id, patti_no, patti_date, farmer_id, ownership_mode, vehicle_no,
          total_bags, total_net_weight_grams, gross_crop_amount_paise,
          commission_rate_bps, commission_amount_paise, hamali_amount_paise,
          weighment_fee_paise, mandi_fee_paise, other_deductions_paise, other_deductions_label,
          total_operational_deductions_paise, linked_loan_id, linked_loan_no,
          loan_due_before_patti_paise, loan_principal_recovered_paise,
          loan_interest_recovered_paise, total_loan_recovered_paise,
          carry_forward_loan_balance_paise, net_payable_paise,
          payment_mode, bank_account_id, amount_paid_now_paise, balance_payable_paise,
          journal_entry_id, idempotency_key, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          pattiId,
          pattiDoc.formattedNumber,
          pattiDate,
          params.farmerId,
          ownershipMode,
          (params.vehicleNo || '').trim(),
          totalBags,
          totalNetWeightGrams,
          grossCropAmountPaise,
          commissionRateBps,
          commissionAmountPaise,
          hamaliAmountPaise,
          weighmentFeePaise,
          mandiFeePaise,
          otherDeductionsPaise,
          otherDeductionsLabel,
          totalOperationalDeductionsPaise,
          activeLoan ? activeLoan.id : null,
          activeLoan ? activeLoan.loanNo : null,
          loanDueBeforePattiPaise,
          loanPrincipalRecoveredPaise,
          loanInterestRecoveredPaise,
          totalLoanRecoveredPaise,
          carryForwardLoanBalancePaise,
          netPayablePaise,
          paymentMode,
          bankAccountId,
          amountPaidNowPaise,
          balancePayablePaise,
          je.id,
          idempotencyKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      // Insert Farmer Patti line items & Stock Movements
      for (const item of preparedItems) {
        const lineId = `FPI-${pattiId}-${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO farmer_patti_items (
            id, patti_id, line_no, commodity_id, bags, gross_weight_grams,
            tare_weight_grams, moisture_pct, net_weight_grams, rate_per_quintal_paise, gross_amount_paise
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            lineId,
            pattiId,
            item.lineNo,
            item.commodityId,
            item.bags,
            item.grossWeightGrams,
            item.tareWeightGrams,
            item.moisturePct,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.grossAmountPaise
          );

        const movId = `MOV-FP-${pattiId}-${item.lineNo}`;
        const movNo = `${pattiDoc.formattedNumber}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_IN', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            movId,
            movNo,
            item.commodityId,
            pattiDate,
            ownershipMode,
            item.bags,
            item.netWeightGrams,
            item.grossWeightGrams,
            item.tareWeightGrams,
            item.moisturePct,
            item.ratePerQuintalPaise,
            item.grossAmountPaise,
            params.farmerId,
            String(farmerRow.name),
            paymentMode === 'BANK_TRANSFER'
              ? 'BANK'
              : paymentMode === 'CASH'
              ? 'CASH'
              : 'CREDIT',
            bankAccountId,
            je.id,
            pattiDoc.formattedNumber,
            (params.vehicleNo || '').trim(),
            `Farmer Patti inward (${pattiDoc.formattedNumber})`,
            params.actor.fullName,
            `MOV-${idempotencyKey}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'FARMER_PATTI',
        entityId: pattiId,
        action: 'CREATE_FARMER_PATTI',
        afterData: {
          pattiNo: pattiDoc.formattedNumber,
          farmerId: params.farmerId,
          grossCropAmountPaise,
          totalOperationalDeductionsPaise,
          totalLoanRecoveredPaise,
          carryForwardLoanBalancePaise,
          netPayablePaise,
        },
        reason: `Settled Farmer Patti ${pattiDoc.formattedNumber}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getFarmerPattiById(pattiId);
    });

    return tx();
  }

  public listFarmerPattis(farmerId?: string): FarmerPattiRecord[] {
    let sql = `SELECT id FROM farmer_pattis`;
    const params: unknown[] = [];
    if (farmerId) {
      sql += ` WHERE farmer_id = ?`;
      params.push(farmerId);
    }
    sql += ` ORDER BY patti_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getFarmerPattiById(r.id));
  }

  public getFarmerPattiById(pattiId: string): FarmerPattiRecord {
    const r = this.db
      .prepare(
        `
      SELECT fp.*, p.party_code as farmer_code, p.name as farmer_name,
             p.village as farmer_village, p.phone_primary as farmer_phone
      FROM farmer_pattis fp
      JOIN parties p ON p.id = fp.farmer_id
      WHERE fp.id = ? OR fp.patti_no = ?
    `
      )
      .get(pattiId, pattiId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Farmer Patti not found: ${pattiId}`);
    }

    const itemRows = this.db
      .prepare(
        `
      SELECT fpi.*, c.code as commodity_code, c.name_en as commodity_name_en, c.name_kn as commodity_name_kn
      FROM farmer_patti_items fpi
      JOIN commodities c ON c.id = fpi.commodity_id
      WHERE fpi.patti_id = ?
      ORDER BY fpi.line_no ASC
    `
      )
      .all(r.id) as Array<Record<string, unknown>>;

    return {
      id: String(r.id),
      pattiNo: String(r.patti_no),
      pattiDate: String(r.patti_date),
      farmerId: String(r.farmer_id),
      farmerCode: String(r.farmer_code),
      farmerName: String(r.farmer_name),
      farmerVillage: String(r.farmer_village || ''),
      farmerPhone: String(r.farmer_phone || ''),
      ownershipMode: (r.ownership_mode as StockOwnershipType) || 'FARMER_AGENCY',
      vehicleNo: String(r.vehicle_no || ''),
      totalBags: Number(r.total_bags),
      totalNetWeightGrams: Number(r.total_net_weight_grams),
      grossCropAmountPaise: Number(r.gross_crop_amount_paise),
      commissionRateBps: Number(r.commission_rate_bps),
      commissionAmountPaise: Number(r.commission_amount_paise),
      hamaliAmountPaise: Number(r.hamali_amount_paise),
      weighmentFeePaise: Number(r.weighment_fee_paise),
      mandiFeePaise: Number(r.mandi_fee_paise),
      otherDeductionsPaise: Number(r.other_deductions_paise),
      otherDeductionsLabel: String(r.other_deductions_label || ''),
      totalOperationalDeductionsPaise: Number(r.total_operational_deductions_paise),
      linkedLoanId: r.linked_loan_id ? String(r.linked_loan_id) : null,
      linkedLoanNo: r.linked_loan_no ? String(r.linked_loan_no) : null,
      loanDueBeforePattiPaise: Number(r.loan_due_before_patti_paise),
      loanPrincipalRecoveredPaise: Number(r.loan_principal_recovered_paise),
      loanInterestRecoveredPaise: Number(r.loan_interest_recovered_paise),
      totalLoanRecoveredPaise: Number(r.total_loan_recovered_paise),
      carryForwardLoanBalancePaise: Number(r.carry_forward_loan_balance_paise),
      netPayablePaise: Number(r.net_payable_paise),
      paymentMode: (r.paymentMode || r.payment_mode) as PattiSettlementPaymentMode,
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      amountPaidNowPaise: Number(r.amount_paid_now_paise),
      balancePayablePaise: Number(r.balance_payable_paise),
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      items: itemRows.map((ir) => ({
        id: String(ir.id),
        pattiId: String(ir.patti_id),
        lineNo: Number(ir.line_no),
        commodityId: String(ir.commodity_id),
        commodityCode: String(ir.commodity_code),
        commodityNameEn: String(ir.commodity_name_en),
        commodityNameKn: String(ir.commodity_name_kn),
        bags: Number(ir.bags),
        grossWeightGrams: Number(ir.gross_weight_grams),
        tareWeightGrams: Number(ir.tare_weight_grams),
        moisturePct: Number(ir.moisture_pct),
        netWeightGrams: Number(ir.net_weight_grams),
        ratePerQuintalPaise: Number(ir.rate_per_quintal_paise),
        grossAmountPaise: Number(ir.gross_amount_paise),
      })),
    };
  }

  /**
   * Direct Settlement of Finalized Farmer Pattis (Section E).
   * - Requires one or more finalized Farmer Pattis with unpaid `balancePayablePaise > 0`
   * - Prevents premature settlement before pattis/deductions are finalized
   * - Prevents duplicate settlement and duplicate deductions via idempotency and balance checks
   * - Updates Farmer Ledger (Account 2001), Cash/Bank Account (1001/1002), and patti balances
   * - Generates a structured FarmerDirectSettlementReceipt
   */
  public settleFarmerPattisDirect(params: {
    farmerId: string;
    pattiIds: string[];
    settlementDate?: string;
    settlementAmountPaise?: number;
    paymentMode: 'CASH' | 'BANK';
    bankAccountId?: string | null;
    idempotencyKey?: string;
    notes?: string;
    actor: UserProfile;
  }): {
    receipt: FarmerDirectSettlementReceipt;
    updatedPattis: FarmerPattiRecord[];
  } {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.farmerId) {
      throw new Error('Farmer selection is required for Direct Settlement.');
    }
    if (!Array.isArray(params.pattiIds) || params.pattiIds.length === 0) {
      throw new Error(
        'Cannot perform premature settlement: select at least one finalized Farmer Patti with deductions.'
      );
    }

    const settlementDate = params.settlementDate || getTodayIST();

    const uniquePattiIds = Array.from(new Set(params.pattiIds));
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `FSR-${params.farmerId}-${uniquePattiIds.sort().join('-')}-${settlementDate}`;

    const existingJe = this.db
      .prepare('SELECT id FROM journal_entries WHERE idempotency_key = ?')
      .get(`JE-FSR-${idempotencyKey}`) as { id: string } | undefined;
    if (existingJe) {
      throw new Error(
        'Duplicate settlement prevented: this Farmer Patti Direct Settlement has already been completed.'
      );
    }

    const tx = this.db.transaction(() => {
      const farmerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.farmerId) as Record<string, unknown> | undefined;
      if (!farmerRow) {
        throw new Error(`Farmer not found: ${params.farmerId}`);
      }

      const pattis = uniquePattiIds.map((pid) => this.getFarmerPattiById(pid));
      for (const fp of pattis) {
        if (fp.farmerId !== params.farmerId) {
          throw new Error(
            `Farmer Patti ${fp.pattiNo} does not belong to selected farmer ${String(farmerRow.name)}.`
          );
        }
        if (fp.balancePayablePaise <= 0) {
          throw new Error(
            `Duplicate settlement prevented: Farmer Patti ${fp.pattiNo} is already settled in full (balance ₹0.00).`
          );
        }
      }

      const totalBags = pattis.reduce((s, p) => s + p.totalBags, 0);
      const totalNetWeightGrams = pattis.reduce((s, p) => s + p.totalNetWeightGrams, 0);
      const grossCropValuePaise = pattis.reduce((s, p) => s + p.grossCropAmountPaise, 0);
      const commissionDeductionPaise = pattis.reduce((s, p) => s + p.commissionAmountPaise, 0);
      const hamaliDeductionPaise = pattis.reduce((s, p) => s + p.hamaliAmountPaise, 0);
      const vehicleRentAndWeighmentPaise = pattis.reduce((s, p) => s + p.weighmentFeePaise, 0);
      const mandiAndOtherDeductionsPaise = pattis.reduce(
        (s, p) => s + p.mandiFeePaise + p.otherDeductionsPaise,
        0
      );
      const loanPrincipalRecoveredPaise = pattis.reduce(
        (s, p) => s + p.loanPrincipalRecoveredPaise,
        0
      );
      const loanInterestRecoveredPaise = pattis.reduce(
        (s, p) => s + p.loanInterestRecoveredPaise,
        0
      );
      const previouslyPaidPaise = pattis.reduce((s, p) => s + p.amountPaidNowPaise, 0);
      const finalNetPayablePaise = pattis.reduce((s, p) => s + p.balancePayablePaise, 0);

      const settlementAmountPaidPaise =
        params.settlementAmountPaise !== undefined
          ? Math.round(Number(params.settlementAmountPaise))
          : finalNetPayablePaise;

      if (settlementAmountPaidPaise <= 0) {
        throw new Error('Settlement amount must be greater than ₹0.');
      }
      if (settlementAmountPaidPaise > finalNetPayablePaise) {
        throw new Error(
          `Settlement amount (₹${(settlementAmountPaidPaise / 100).toFixed(2)}) cannot exceed final net payable balance (₹${(finalNetPayablePaise / 100).toFixed(2)}).`
        );
      }

      const paymentMode = params.paymentMode === 'BANK' ? 'BANK' : 'CASH';
      const bankAccountId = paymentMode === 'BANK' ? params.bankAccountId ?? null : null;
      if (paymentMode === 'BANK' && !bankAccountId) {
        throw new Error('Bank account selection is required for Bank mode settlement.');
      }

      const receiptNo = `FSR-${settlementDate.replace(/-/g, '')}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      // Post balanced Double-Entry Journal Entry: Dr 2001 (Farmer Trade Payable), Cr 1001/1002 (Cash/Bank)
      const creditAccountCode = paymentMode === 'BANK' ? '1002' : '1001';
      const creditCashDir: CashFlowDirection = paymentMode === 'BANK' ? 'BANK_OUT' : 'CASH_OUT';

      const je = this.postJournalEntry({
        transactionDate: settlementDate,
        sourceType: 'FARMER_PATTI',
        sourceId: receiptNo,
        idempotencyKey: `JE-FSR-${idempotencyKey}`,
        narration: `Direct Settlement Receipt ${receiptNo} for Farmer ${String(farmerRow.name)} (${pattis
          .map((p) => p.pattiNo)
          .join(', ')})`,
        lines: [
          {
            accountCode: '2001',
            partyId: params.farmerId,
            ledgerBucket: 'CROP_PROCEEDS',
            debitPaise: settlementAmountPaidPaise,
            creditPaise: 0,
            cashDirection: 'NON_CASH',
            lineNote: `Direct Settlement of Farmer Patti(s): ${pattis.map((p) => p.pattiNo).join(', ')}`,
          },
          {
            accountCode: creditAccountCode,
            partyId: params.farmerId,
            bankAccountId,
            ledgerBucket: 'CROP_PROCEEDS',
            debitPaise: 0,
            creditPaise: settlementAmountPaidPaise,
            cashDirection: creditCashDir,
            lineNote: `Direct Settlement payout (${paymentMode}) — Receipt ${receiptNo}`,
          },
        ],
        actor: params.actor,
      });

      // Allocate settlement across selected pattis in order
      let remainingToAllocate = settlementAmountPaidPaise;
      for (const fp of pattis) {
        if (remainingToAllocate <= 0) break;
        const allocateHere = Math.min(fp.balancePayablePaise, remainingToAllocate);
        const newPaid = fp.amountPaidNowPaise + allocateHere;
        const newBal = Math.max(0, fp.balancePayablePaise - allocateHere);
        const nextMode: PattiSettlementPaymentMode =
          newBal === 0
            ? paymentMode === 'BANK'
              ? 'BANK_TRANSFER'
              : 'CASH'
            : fp.paymentMode;

        this.db
          .prepare(
            `UPDATE farmer_pattis
             SET amount_paid_now_paise = ?, balance_payable_paise = ?, payment_mode = ?, bank_account_id = COALESCE(?, bank_account_id)
             WHERE id = ?`
          )
          .run(newPaid, newBal, nextMode, bankAccountId, fp.id);

        remainingToAllocate -= allocateHere;
      }

      const remainingBalancePayablePaise = Math.max(
        0,
        finalNetPayablePaise - settlementAmountPaidPaise
      );
      const nowIso = new Date().toISOString();

      const receipt: FarmerDirectSettlementReceipt = {
        receiptNo,
        settlementDate,
        farmerId: params.farmerId,
        farmerCode: String(farmerRow.party_code),
        farmerName: String(farmerRow.name),
        farmerVillage: String(farmerRow.village || ''),
        farmerPhone: String(farmerRow.phone_primary || ''),
        pattiIds: pattis.map((p) => p.id),
        pattiNumbers: pattis.map((p) => p.pattiNo),
        totalBags,
        totalNetWeightGrams,
        grossCropValuePaise,
        commissionDeductionPaise,
        hamaliDeductionPaise,
        vehicleRentAndWeighmentPaise,
        mandiAndOtherDeductionsPaise,
        loanPrincipalRecoveredPaise,
        loanInterestRecoveredPaise,
        previouslyPaidPaise,
        finalNetPayablePaise,
        settlementAmountPaidPaise,
        remainingBalancePayablePaise,
        paymentMode,
        bankAccountId,
        journalEntryId: je.id,
        settledBy: params.actor.fullName,
        createdAt: nowIso,
      };

      this.recordAuditLog({
        entityType: 'FARMER_PATTI',
        entityId: receiptNo,
        action: 'DIRECT_SETTLE_FARMER_PATTI',
        afterData: receipt as unknown as Record<string, unknown>,
        reason: params.notes?.trim() || `Direct Settlement ${receiptNo} for ${String(farmerRow.name)}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      const updatedPattis = uniquePattiIds.map((pid) => this.getFarmerPattiById(pid));
      return { receipt, updatedPattis };
    });

    return tx();
  }

  /**
   * Creates an atomic Buyer-Side Kharidi Patti / Sales Invoice (SRS Section 7.2).
   * - Allocates `SGT-KP-*` document number
   * - Supports both `SGT_OWNED` stock sale and `FARMER_AGENCY` Dalali pass-through sale
   * - Enforces non-automatic GST (`DR-04`): GST is 0 unless `gstApplicable === true` on a line
   * - Posts balanced Khata Journal Entry and `GOODS_OUT` Stock Movements atomically
   */
  public createKharidiPatti(params: {
    invoiceDate?: string;
    buyerId: string;
    ownershipMode?: StockOwnershipType;
    linkedFarmerPattiId?: string | null;
    linkedFarmerId?: string | null;
    vehicleNo?: string;
    items: KharidiPattiLineInput[];
    buyerCommissionBps?: number;
    buyerCommissionPaise?: number;
    buyerHamaliPackingPaise?: number;
    buyerMarketFeePaise?: number;
    paymentMode?: KharidiPaymentMode;
    bankAccountId?: string | null;
    amountReceivedNowPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): KharidiPattiRecord {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.buyerId) {
      throw new Error('Buyer selection is required to create a Buyer Kharidi Patti.');
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('At least one commodity line item is required in Kharidi Patti.');
    }

    const invoiceDate = params.invoiceDate?.trim() || getTodayIST();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `KP-${params.buyerId}-${invoiceDate}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const existing = this.db
      .prepare('SELECT id FROM kharidi_pattis WHERE idempotency_key = ?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) {
      return this.getKharidiPattiById(existing.id);
    }

    const tx = this.db.transaction(() => {
      const buyerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.buyerId) as Record<string, unknown> | undefined;
      if (!buyerRow) {
        throw new Error(`Buyer party not found: ${params.buyerId}`);
      }

      const ownershipMode: StockOwnershipType =
        params.ownershipMode === 'FARMER_AGENCY' ? 'FARMER_AGENCY' : 'SGT_OWNED';

      const currentStockStatuses = this.listCommodityStockStatus();

      let totalBags = 0;
      let totalNetWeightGrams = 0;
      let totalBaseAmountPaise = 0;
      let totalGstPaise = 0;

      const preparedItems: Array<{
        lineNo: number;
        commodityId: string;
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
      }> = [];

      params.items.forEach((rawItem, idx) => {
        const cmdRow = this.db
          .prepare('SELECT * FROM commodities WHERE id = ?')
          .get(rawItem.commodityId) as Record<string, unknown> | undefined;
        if (!cmdRow) {
          throw new Error(`Commodity not found for line ${idx + 1}: ${rawItem.commodityId}`);
        }

        const bags = Math.max(0, Math.round(Number(rawItem.bags || 0)));
        const netWeightGrams = Math.max(0, Math.round(Number(rawItem.netWeightGrams || 0)));
        if (netWeightGrams <= 0) {
          throw new Error(`Net weight must be greater than zero on line ${idx + 1}.`);
        }

        if (ownershipMode === 'SGT_OWNED') {
          const st = currentStockStatuses.find((s) => s.commodity.id === String(cmdRow.id));
          const availableGrams = st?.closingOwnedWeightGrams ?? 0;
          if (
            netWeightGrams > availableGrams &&
            !params.actor.permissions.includes(PermissionKey.APPROVE_CORRECTIONS)
          ) {
            throw new Error(
              `Insufficient SGT-owned stock for ${String(cmdRow.name_en)}: available ${(availableGrams / 100_000).toFixed(2)} Q, requested ${(netWeightGrams / 100_000).toFixed(2)} Q.`
            );
          }
        }

        const ratePerQuintalPaise = Math.max(
          0,
          Math.round(Number(rawItem.ratePerQuintalPaise || 0))
        );
        const baseAmountPaise = Math.round((netWeightGrams / 100_000) * ratePerQuintalPaise);

        // Non-automatic GST enforcement (DR-04): NEVER apply GST unless explicitly opted in on the line
        const gstApplicable = Boolean(rawItem.gstApplicable);
        const cgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.cgstRateBps ?? cmdRow.cgst_rate_bps ?? 0)))
          : 0;
        const sgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.sgstRateBps ?? cmdRow.sgst_rate_bps ?? 0)))
          : 0;
        const igstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.igstRateBps ?? cmdRow.igst_rate_bps ?? 0)))
          : 0;
        const totalTaxBps = cgstRateBps + sgstRateBps + igstRateBps;
        const gstAmountPaise = gstApplicable
          ? Math.round((baseAmountPaise * totalTaxBps) / 10_000)
          : 0;
        const lineTotalPaise = baseAmountPaise + gstAmountPaise;

        totalBags += bags;
        totalNetWeightGrams += netWeightGrams;
        totalBaseAmountPaise += baseAmountPaise;
        totalGstPaise += gstAmountPaise;

        preparedItems.push({
          lineNo: idx + 1,
          commodityId: String(cmdRow.id),
          bags,
          netWeightGrams,
          ratePerQuintalPaise,
          baseAmountPaise,
          gstApplicable,
          cgstRateBps,
          sgstRateBps,
          igstRateBps,
          gstAmountPaise,
          lineTotalPaise,
        });
      });

      const buyerCommissionBps = Math.max(0, Math.round(Number(params.buyerCommissionBps || 0)));
      const buyerCommissionPaise =
        params.buyerCommissionPaise !== undefined
          ? Math.max(0, Math.round(Number(params.buyerCommissionPaise)))
          : Math.round((totalBaseAmountPaise * buyerCommissionBps) / 10_000);
      const buyerHamaliPackingPaise = Math.max(
        0,
        Math.round(Number(params.buyerHamaliPackingPaise || 0))
      );
      const buyerMarketFeePaise = Math.max(
        0,
        Math.round(Number(params.buyerMarketFeePaise || 0))
      );

      const netReceivablePaise =
        totalBaseAmountPaise +
        buyerCommissionPaise +
        buyerHamaliPackingPaise +
        buyerMarketFeePaise +
        totalGstPaise;

      const paymentMode: KharidiPaymentMode = params.paymentMode || 'CREDIT';
      const bankAccountId =
        paymentMode === 'BANK_TRANSFER' ? params.bankAccountId ?? null : null;

      let amountReceivedNowPaise = 0;
      if (paymentMode === 'CREDIT') {
        amountReceivedNowPaise = Math.min(
          netReceivablePaise,
          Math.max(0, Math.round(Number(params.amountReceivedNowPaise ?? 0)))
        );
      } else {
        amountReceivedNowPaise =
          params.amountReceivedNowPaise !== undefined
            ? Math.min(
                netReceivablePaise,
                Math.max(0, Math.round(Number(params.amountReceivedNowPaise)))
              )
            : netReceivablePaise;
      }

      const balanceReceivablePaise = Math.max(0, netReceivablePaise - amountReceivedNowPaise);

      const kpId = `KP-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const kpDoc = this.allocateDocumentNumber({
        docType: DocumentSeriesType.KHARIDI_PATTI,
        referenceEntityId: kpId,
        transactionDate: invoiceDate,
        idempotencyKey: `NUM-${idempotencyKey}`,
        actor: params.actor,
      });

      const khataLines: JournalLineInput[] = [];

      if (amountReceivedNowPaise > 0) {
        const debitCode = paymentMode === 'BANK_TRANSFER' ? '1002' : '1001';
        const cashDir: CashFlowDirection =
          paymentMode === 'BANK_TRANSFER' ? 'BANK_IN' : 'CASH_IN';
        khataLines.push({
          accountCode: debitCode,
          partyId: params.buyerId,
          bankAccountId: paymentMode === 'BANK_TRANSFER' ? bankAccountId : null,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: amountReceivedNowPaise,
          creditPaise: 0,
          cashDirection: cashDir,
          lineNote: `Kharidi Patti receipt (${paymentMode}) on ${kpDoc.formattedNumber}`,
        });
      }

      if (balanceReceivablePaise > 0) {
        khataLines.push({
          accountCode: '1102',
          partyId: params.buyerId,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: balanceReceivablePaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer Trade Receivable for Kharidi Patti ${kpDoc.formattedNumber}`,
        });
      }

      // Credit base sales or Farmer Settlement Control
      const salesCreditAccountCode = ownershipMode === 'SGT_OWNED' ? '4001' : '1101';
      khataLines.push({
        accountCode: salesCreditAccountCode,
        partyId: params.linkedFarmerId || params.buyerId,
        ledgerBucket: 'INVOICE_RECEIVABLE',
        debitPaise: 0,
        creditPaise: totalBaseAmountPaise,
        cashDirection: 'NON_CASH',
        lineNote: `Kharidi Patti crop value (${ownershipMode}) on ${kpDoc.formattedNumber}`,
      });

      if (buyerCommissionPaise > 0) {
        khataLines.push({
          accountCode: '4002',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: buyerCommissionPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer commission charged on ${kpDoc.formattedNumber}`,
        });
      }

      const buyerFeesPaise = buyerHamaliPackingPaise + buyerMarketFeePaise;
      if (buyerFeesPaise > 0) {
        khataLines.push({
          accountCode: '4004',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: buyerFeesPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer hamali, packing & market fees on ${kpDoc.formattedNumber}`,
        });
      }

      if (totalGstPaise > 0) {
        khataLines.push({
          accountCode: '2101',
          partyId: params.buyerId,
          ledgerBucket: 'TAX',
          debitPaise: 0,
          creditPaise: totalGstPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Explicitly enabled GST on Kharidi Patti ${kpDoc.formattedNumber}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: invoiceDate,
        sourceType: 'KHARIDI_PATTI',
        sourceId: kpDoc.formattedNumber,
        idempotencyKey: `JE-${idempotencyKey}`,
        narration: `Buyer Kharidi Patti ${kpDoc.formattedNumber} to ${String(buyerRow.name)} (${String(buyerRow.party_code)})`,
        lines: khataLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO kharidi_pattis (
          id, invoice_no, invoice_date, buyer_id, ownership_mode,
          linked_farmer_patti_id, linked_farmer_id, vehicle_no,
          total_bags, total_net_weight_grams, total_base_amount_paise,
          buyer_commission_bps, buyer_commission_paise, buyer_hamali_packing_paise,
          buyer_market_fee_paise, total_gst_paise, net_receivable_paise,
          payment_mode, bank_account_id, amount_received_now_paise, balance_receivable_paise,
          journal_entry_id, idempotency_key, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          kpId,
          kpDoc.formattedNumber,
          invoiceDate,
          params.buyerId,
          ownershipMode,
          params.linkedFarmerPattiId ?? null,
          params.linkedFarmerId ?? null,
          (params.vehicleNo || '').trim(),
          totalBags,
          totalNetWeightGrams,
          totalBaseAmountPaise,
          buyerCommissionBps,
          buyerCommissionPaise,
          buyerHamaliPackingPaise,
          buyerMarketFeePaise,
          totalGstPaise,
          netReceivablePaise,
          paymentMode,
          bankAccountId,
          amountReceivedNowPaise,
          balanceReceivablePaise,
          je.id,
          idempotencyKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      for (const item of preparedItems) {
        const lineId = `KPI-${kpId}-${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO kharidi_patti_items (
            id, kharidi_patti_id, line_no, commodity_id, bags, net_weight_grams,
            rate_per_quintal_paise, base_amount_paise, gst_applicable,
            cgst_rate_bps, sgst_rate_bps, igst_rate_bps, gst_amount_paise, line_total_paise
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            lineId,
            kpId,
            item.lineNo,
            item.commodityId,
            item.bags,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstApplicable ? 1 : 0,
            item.cgstRateBps,
            item.sgstRateBps,
            item.igstRateBps,
            item.gstAmountPaise,
            item.lineTotalPaise
          );

        const movId = `MOV-KP-${kpId}-${item.lineNo}`;
        const movNo = `${kpDoc.formattedNumber}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_OUT', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            movId,
            movNo,
            item.commodityId,
            invoiceDate,
            ownershipMode,
            -item.bags,
            -item.netWeightGrams,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstAmountPaise,
            params.buyerId,
            String(buyerRow.name),
            paymentMode === 'BANK_TRANSFER'
              ? 'BANK'
              : paymentMode === 'CASH'
              ? 'CASH'
              : 'CREDIT',
            bankAccountId,
            je.id,
            kpDoc.formattedNumber,
            (params.vehicleNo || '').trim(),
            `Kharidi Patti outward (${kpDoc.formattedNumber})`,
            params.actor.fullName,
            `MOV-${idempotencyKey}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'KHARIDI_PATTI',
        entityId: kpId,
        action: 'CREATE_KHARIDI_PATTI',
        afterData: {
          invoiceNo: kpDoc.formattedNumber,
          buyerId: params.buyerId,
          totalBaseAmountPaise,
          totalGstPaise,
          netReceivablePaise,
        },
        reason: `Issued Buyer Kharidi Patti ${kpDoc.formattedNumber}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getKharidiPattiById(kpId);
    });

    return tx();
  }

  public listKharidiPattis(buyerId?: string): KharidiPattiRecord[] {
    let sql = `SELECT id FROM kharidi_pattis`;
    const params: unknown[] = [];
    if (buyerId) {
      sql += ` WHERE buyer_id = ?`;
      params.push(buyerId);
    }
    sql += ` ORDER BY invoice_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getKharidiPattiById(r.id));
  }

  public getKharidiPattiById(kpId: string): KharidiPattiRecord {
    const r = this.db
      .prepare(
        `
      SELECT kp.*, p.party_code as buyer_code, p.name as buyer_name, p.gstin as buyer_gstin
      FROM kharidi_pattis kp
      JOIN parties p ON p.id = kp.buyer_id
      WHERE kp.id = ? OR kp.invoice_no = ?
    `
      )
      .get(kpId, kpId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Kharidi Patti not found: ${kpId}`);
    }

    const itemRows = this.db
      .prepare(
        `
      SELECT kpi.*, c.code as commodity_code, c.name_en as commodity_name_en, c.name_kn as commodity_name_kn
      FROM kharidi_patti_items kpi
      JOIN commodities c ON c.id = kpi.commodity_id
      WHERE kpi.kharidi_patti_id = ?
      ORDER BY kpi.line_no ASC
    `
      )
      .all(r.id) as Array<Record<string, unknown>>;

    return {
      id: String(r.id),
      invoiceNo: String(r.invoice_no),
      invoiceDate: String(r.invoice_date),
      buyerId: String(r.buyer_id),
      buyerCode: String(r.buyer_code),
      buyerName: String(r.buyer_name),
      buyerGstin: String(r.buyer_gstin || ''),
      ownershipMode: (r.ownership_mode as StockOwnershipType) || 'SGT_OWNED',
      linkedFarmerPattiId: r.linked_farmer_patti_id ? String(r.linked_farmer_patti_id) : null,
      linkedFarmerId: r.linked_farmer_id ? String(r.linked_farmer_id) : null,
      vehicleNo: String(r.vehicle_no || ''),
      totalBags: Number(r.total_bags),
      totalNetWeightGrams: Number(r.total_net_weight_grams),
      totalBaseAmountPaise: Number(r.total_base_amount_paise),
      buyerCommissionBps: Number(r.buyer_commission_bps),
      buyerCommissionPaise: Number(r.buyer_commission_paise),
      buyerHamaliPackingPaise: Number(r.buyer_hamali_packing_paise),
      buyerMarketFeePaise: Number(r.buyer_market_fee_paise),
      totalGstPaise: Number(r.total_gst_paise),
      netReceivablePaise: Number(r.net_receivable_paise),
      paymentMode: (r.payment_mode as KharidiPaymentMode) || 'CREDIT',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      amountReceivedNowPaise: Number(r.amount_received_now_paise),
      balanceReceivablePaise: Number(r.balance_receivable_paise),
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      items: itemRows.map((ir) => ({
        id: String(ir.id),
        kharidiPattiId: String(ir.kharidi_patti_id),
        lineNo: Number(ir.line_no),
        commodityId: String(ir.commodity_id),
        commodityCode: String(ir.commodity_code),
        commodityNameEn: String(ir.commodity_name_en),
        commodityNameKn: String(ir.commodity_name_kn),
        bags: Number(ir.bags),
        netWeightGrams: Number(ir.net_weight_grams),
        ratePerQuintalPaise: Number(ir.rate_per_quintal_paise),
        baseAmountPaise: Number(ir.base_amount_paise),
        gstApplicable: Boolean(ir.gst_applicable),
        cgstRateBps: Number(ir.cgst_rate_bps),
        sgstRateBps: Number(ir.sgst_rate_bps),
        igstRateBps: Number(ir.igst_rate_bps),
        gstAmountPaise: Number(ir.gst_amount_paise),
        lineTotalPaise: Number(ir.line_total_paise),
      })),
    };
  }

  // ============================================================================
  // CHUNK 6: DALALI VIKRI PATTI, DALALI KHARIDI PATTI, CASH/CREDIT BILL & CREDIT NOTES
  // ============================================================================

  /**
   * Creates an atomic Dalali Vikri Patti (Farmer-side Agency Commission Sale Patti — SRS Sec 8.1, AT-07, DR-06).
   * - Allocates `SGT-DV-*` document number
   * - Strictly uses `FARMER_AGENCY` stock ownership so SGT-owned inventory valuation is never polluted (`AT-07`)
   * - Supports configurable mandi deductions (`niituFeePaise`, `tukadFeePaise`, `rmcFeePaise`, `vehicleRentPaise`, `handLoanAdvancePaise`)
   * - Posts balanced Double-Entry Khata Journal Entry atomically
   */
  public createDalaliVikriPatti(params: {
    pattiDate?: string;
    farmerId: string;
    counterpartyBuyerId?: string | null;
    counterpartyBuyerName?: string;
    classSerial?: string;
    vehicleNo?: string;
    items: DalaliVikriLineInput[];
    commissionRateBps?: number;
    commissionAmountPaise?: number;
    hamaliAmountPaise?: number;
    niituFeePaise?: number;
    tukadFeePaise?: number;
    rmcFeePaise?: number;
    vehicleRentPaise?: number;
    handLoanAdvancePaise?: number;
    otherDeductionsPaise?: number;
    paymentMode?: PattiSettlementPaymentMode;
    bankAccountId?: string | null;
    amountPaidNowPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): DalaliVikriPattiRecord {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.farmerId) {
      throw new Error('Farmer selection is required to create a Dalali Vikri Patti.');
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('At least one commodity lot is required in Dalali Vikri Patti.');
    }

    const pattiDate = params.pattiDate?.trim() || getTodayIST();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `DV-${params.farmerId}-${pattiDate}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const existing = this.db
      .prepare('SELECT id FROM dalali_vikri_pattis WHERE idempotency_key = ?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) {
      return this.getDalaliVikriPattiById(existing.id);
    }

    const tx = this.db.transaction(() => {
      const farmerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.farmerId) as Record<string, unknown> | undefined;
      if (!farmerRow) {
        throw new Error(`Farmer party not found: ${params.farmerId}`);
      }

      let counterpartyBuyerName = (params.counterpartyBuyerName || '').trim();
      if (params.counterpartyBuyerId) {
        const buyerRow = this.db
          .prepare('SELECT name FROM parties WHERE id = ?')
          .get(params.counterpartyBuyerId) as { name: string } | undefined;
        if (buyerRow) {
          counterpartyBuyerName = buyerRow.name;
        }
      }

      const settings = this.getCompanySettings();
      let totalBags = 0;
      let totalAndiges = 0;
      let totalNetWeightGrams = 0;
      let grossSaleAmountPaise = 0;

      const preparedItems: Array<{
        lineNo: number;
        commodityId: string;
        bags: number;
        andiges: number;
        grossWeightGrams: number;
        tareWeightGrams: number;
        moisturePct: number;
        netWeightGrams: number;
        ratePerQuintalPaise: number;
        grossAmountPaise: number;
      }> = [];

      params.items.forEach((rawItem, idx) => {
        const cmdRow = this.db
          .prepare('SELECT * FROM commodities WHERE id = ?')
          .get(rawItem.commodityId) as Record<string, unknown> | undefined;
        if (!cmdRow) {
          throw new Error(`Commodity not found for line ${idx + 1}: ${rawItem.commodityId}`);
        }

        const bags = Math.max(0, Math.round(Number(rawItem.bags || 0)));
        const andiges = Math.max(0, Math.round(Number(rawItem.andiges || 0)));
        const netWeightGrams = Math.max(0, Math.round(Number(rawItem.netWeightGrams || 0)));
        const tareWeightGrams = Math.max(0, Math.round(Number(rawItem.tareWeightGrams || 0)));
        const grossWeightGrams = Math.max(
          netWeightGrams + tareWeightGrams,
          Math.round(Number(rawItem.grossWeightGrams || netWeightGrams + tareWeightGrams))
        );
        const moisturePct = Math.max(0, Number(rawItem.moisturePct || 0));
        const ratePerQuintalPaise = Math.max(
          0,
          Math.round(Number(rawItem.ratePerQuintalPaise || 0))
        );

        if (netWeightGrams <= 0) {
          throw new Error(`Net weight must be greater than zero on line ${idx + 1}.`);
        }

        const grossAmountPaise = Math.round((netWeightGrams / 100_000) * ratePerQuintalPaise);

        totalBags += bags;
        totalAndiges += andiges;
        totalNetWeightGrams += netWeightGrams;
        grossSaleAmountPaise += grossAmountPaise;

        preparedItems.push({
          lineNo: idx + 1,
          commodityId: String(cmdRow.id),
          bags,
          andiges,
          grossWeightGrams,
          tareWeightGrams,
          moisturePct,
          netWeightGrams,
          ratePerQuintalPaise,
          grossAmountPaise,
        });
      });

      const commissionRateBps =
        params.commissionRateBps !== undefined
          ? Math.max(0, Math.round(Number(params.commissionRateBps)))
          : settings.commissionHamaliPolicy.defaultCommissionBps;

      const commissionAmountPaise =
        params.commissionAmountPaise !== undefined
          ? Math.max(0, Math.round(Number(params.commissionAmountPaise)))
          : Math.round((grossSaleAmountPaise * commissionRateBps) / 10_000);

      const hamaliAmountPaise =
        params.hamaliAmountPaise !== undefined
          ? Math.max(0, Math.round(Number(params.hamaliAmountPaise)))
          : totalBags * settings.commissionHamaliPolicy.defaultHamaliPerBagPaise;

      const niituFeePaise = Math.max(0, Math.round(Number(params.niituFeePaise || 0)));
      const tukadFeePaise = Math.max(0, Math.round(Number(params.tukadFeePaise || 0)));
      const rmcFeePaise = Math.max(0, Math.round(Number(params.rmcFeePaise || 0)));
      const vehicleRentPaise = Math.max(0, Math.round(Number(params.vehicleRentPaise || 0)));
      const handLoanAdvancePaise = Math.max(
        0,
        Math.round(Number(params.handLoanAdvancePaise || 0))
      );
      const otherDeductionsPaise = Math.max(
        0,
        Math.round(Number(params.otherDeductionsPaise || 0))
      );

      const totalDeductionsPaise =
        commissionAmountPaise +
        hamaliAmountPaise +
        niituFeePaise +
        tukadFeePaise +
        rmcFeePaise +
        vehicleRentPaise +
        handLoanAdvancePaise +
        otherDeductionsPaise;

      const netPayablePaise = Math.max(0, grossSaleAmountPaise - totalDeductionsPaise);
      const paymentMode: PattiSettlementPaymentMode = params.paymentMode || 'CASH';
      const bankAccountId =
        paymentMode === 'BANK_TRANSFER' ? params.bankAccountId ?? null : null;

      let amountPaidNowPaise = 0;
      if (paymentMode === 'CREDIT_PAYABLE') {
        amountPaidNowPaise = Math.min(
          netPayablePaise,
          Math.max(0, Math.round(Number(params.amountPaidNowPaise ?? 0)))
        );
      } else {
        amountPaidNowPaise =
          params.amountPaidNowPaise !== undefined
            ? Math.min(
                netPayablePaise,
                Math.max(0, Math.round(Number(params.amountPaidNowPaise)))
              )
            : netPayablePaise;
      }

      const balancePayablePaise = Math.max(0, netPayablePaise - amountPaidNowPaise);
      const amountInWords = paiseToIndianWords(netPayablePaise);

      const dvId = `DV-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const dvDoc = this.allocateDocumentNumber({
        docType: DocumentSeriesType.DALALI_VIKRI,
        referenceEntityId: dvId,
        transactionDate: pattiDate,
        idempotencyKey: `NUM-${idempotencyKey}`,
        actor: params.actor,
      });

      const khataLines: JournalLineInput[] = [
        {
          accountCode: '1101',
          partyId: params.farmerId,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: grossSaleAmountPaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Dalali Vikri Patti agency sale proceeds (${dvDoc.formattedNumber})`,
        },
      ];

      if (commissionAmountPaise > 0) {
        khataLines.push({
          accountCode: '4002',
          partyId: params.farmerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: commissionAmountPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Dalali Commission on ${dvDoc.formattedNumber}`,
        });
      }

      const mandiAndRecoveryFeesPaise =
        hamaliAmountPaise +
        niituFeePaise +
        tukadFeePaise +
        rmcFeePaise +
        vehicleRentPaise +
        handLoanAdvancePaise +
        otherDeductionsPaise;

      if (mandiAndRecoveryFeesPaise > 0) {
        khataLines.push({
          accountCode: '4004',
          partyId: params.farmerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: mandiAndRecoveryFeesPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Hamali, Niitu, Tukad, RMC & deductions on ${dvDoc.formattedNumber}`,
        });
      }

      if (amountPaidNowPaise > 0) {
        const payoutAccountCode = paymentMode === 'BANK_TRANSFER' ? '1002' : '1001';
        const payoutCashDir: CashFlowDirection =
          paymentMode === 'BANK_TRANSFER' ? 'BANK_OUT' : 'CASH_OUT';
        khataLines.push({
          accountCode: payoutAccountCode,
          partyId: params.farmerId,
          bankAccountId: paymentMode === 'BANK_TRANSFER' ? bankAccountId : null,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: 0,
          creditPaise: amountPaidNowPaise,
          cashDirection: payoutCashDir,
          lineNote: `Dalali Vikri Patti payout (${paymentMode}) for ${dvDoc.formattedNumber}`,
        });
      }

      if (balancePayablePaise > 0) {
        khataLines.push({
          accountCode: '2001',
          partyId: params.farmerId,
          ledgerBucket: 'CROP_PROCEEDS',
          debitPaise: 0,
          creditPaise: balancePayablePaise,
          cashDirection: 'NON_CASH',
          lineNote: `Dalali Vikri Patti balance payable for ${dvDoc.formattedNumber}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: pattiDate,
        sourceType: 'DALALI_VIKRI_PATTI',
        sourceId: dvDoc.formattedNumber,
        idempotencyKey: `JE-${idempotencyKey}`,
        narration: `Dalali Vikri Patti ${dvDoc.formattedNumber} for ${String(farmerRow.name)} (${String(farmerRow.party_code)})`,
        lines: khataLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO dalali_vikri_pattis (
          id, patti_no, patti_date, farmer_id, counterparty_buyer_id, counterparty_buyer_name,
          class_serial, vehicle_no, total_bags, total_andiges, total_net_weight_grams,
          gross_sale_amount_paise, commission_rate_bps, commission_amount_paise,
          hamali_amount_paise, niitu_fee_paise, tukad_fee_paise, rmc_fee_paise,
          vehicle_rent_paise, hand_loan_advance_paise, other_deductions_paise,
          total_deductions_paise, net_payable_paise, payment_mode, bank_account_id,
          amount_paid_now_paise, balance_payable_paise, amount_in_words, status,
          journal_entry_id, idempotency_key, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?, ?, ?, ?)
      `
        )
        .run(
          dvId,
          dvDoc.formattedNumber,
          pattiDate,
          params.farmerId,
          params.counterpartyBuyerId ?? null,
          counterpartyBuyerName,
          (params.classSerial || '').trim(),
          (params.vehicleNo || '').trim(),
          totalBags,
          totalAndiges,
          totalNetWeightGrams,
          grossSaleAmountPaise,
          commissionRateBps,
          commissionAmountPaise,
          hamaliAmountPaise,
          niituFeePaise,
          tukadFeePaise,
          rmcFeePaise,
          vehicleRentPaise,
          handLoanAdvancePaise,
          otherDeductionsPaise,
          totalDeductionsPaise,
          netPayablePaise,
          paymentMode,
          bankAccountId,
          amountPaidNowPaise,
          balancePayablePaise,
          amountInWords,
          je.id,
          idempotencyKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      for (const item of preparedItems) {
        const lineId = `DVI-${dvId}-${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO dalali_vikri_items (
            id, patti_id, line_no, commodity_id, bags, andiges,
            gross_weight_grams, tare_weight_grams, moisture_pct,
            net_weight_grams, rate_per_quintal_paise, gross_amount_paise
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            lineId,
            dvId,
            item.lineNo,
            item.commodityId,
            item.bags,
            item.andiges,
            item.grossWeightGrams,
            item.tareWeightGrams,
            item.moisturePct,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.grossAmountPaise
          );

        // AT-07: Record strictly as FARMER_AGENCY so SGT owned stock is untouched
        const movId = `MOV-DV-${dvId}-${item.lineNo}`;
        const movNo = `${dvDoc.formattedNumber}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_IN', 'FARMER_AGENCY', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            movId,
            movNo,
            item.commodityId,
            pattiDate,
            item.bags,
            item.netWeightGrams,
            item.grossWeightGrams,
            item.tareWeightGrams,
            item.moisturePct,
            item.ratePerQuintalPaise,
            item.grossAmountPaise,
            params.farmerId,
            String(farmerRow.name),
            paymentMode === 'BANK_TRANSFER'
              ? 'BANK'
              : paymentMode === 'CASH'
              ? 'CASH'
              : 'CREDIT',
            bankAccountId,
            je.id,
            dvDoc.formattedNumber,
            (params.vehicleNo || '').trim(),
            `Dalali Vikri agency inward (${dvDoc.formattedNumber})`,
            params.actor.fullName,
            `MOV-${idempotencyKey}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'DALALI_VIKRI_PATTI',
        entityId: dvId,
        action: 'CREATE_DALALI_VIKRI_PATTI',
        afterData: {
          pattiNo: dvDoc.formattedNumber,
          farmerId: params.farmerId,
          grossSaleAmountPaise,
          totalDeductionsPaise,
          netPayablePaise,
        },
        reason: `Created Dalali Vikri Patti ${dvDoc.formattedNumber}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getDalaliVikriPattiById(dvId);
    });

    return tx();
  }

  public listDalaliVikriPattis(farmerId?: string): DalaliVikriPattiRecord[] {
    let sql = `SELECT id FROM dalali_vikri_pattis`;
    const params: unknown[] = [];
    if (farmerId) {
      sql += ` WHERE farmer_id = ?`;
      params.push(farmerId);
    }
    sql += ` ORDER BY patti_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getDalaliVikriPattiById(r.id));
  }

  public getDalaliVikriPattiById(pattiId: string): DalaliVikriPattiRecord {
    const r = this.db
      .prepare(
        `
      SELECT dv.*, p.party_code as farmer_code, p.name as farmer_name,
             p.village as farmer_village, p.phone_primary as farmer_phone
      FROM dalali_vikri_pattis dv
      JOIN parties p ON p.id = dv.farmer_id
      WHERE dv.id = ? OR dv.patti_no = ?
    `
      )
      .get(pattiId, pattiId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Dalali Vikri Patti not found: ${pattiId}`);
    }

    const itemRows = this.db
      .prepare(
        `
      SELECT dvi.*, c.code as commodity_code, c.name_en as commodity_name_en, c.name_kn as commodity_name_kn
      FROM dalali_vikri_items dvi
      JOIN commodities c ON c.id = dvi.commodity_id
      WHERE dvi.patti_id = ?
      ORDER BY dvi.line_no ASC
    `
      )
      .all(r.id) as Array<Record<string, unknown>>;

    return {
      id: String(r.id),
      pattiNo: String(r.patti_no),
      pattiDate: String(r.patti_date),
      farmerId: String(r.farmer_id),
      farmerCode: String(r.farmer_code),
      farmerName: String(r.farmer_name),
      farmerVillage: String(r.farmer_village || ''),
      farmerPhone: String(r.farmer_phone || ''),
      counterpartyBuyerId: r.counterparty_buyer_id ? String(r.counterparty_buyer_id) : null,
      counterpartyBuyerName: String(r.counterparty_buyer_name || ''),
      classSerial: String(r.class_serial || ''),
      vehicleNo: String(r.vehicle_no || ''),
      totalBags: Number(r.total_bags),
      totalAndiges: Number(r.total_andiges),
      totalNetWeightGrams: Number(r.total_net_weight_grams),
      grossSaleAmountPaise: Number(r.gross_sale_amount_paise),
      commissionRateBps: Number(r.commission_rate_bps),
      commissionAmountPaise: Number(r.commission_amount_paise),
      hamaliAmountPaise: Number(r.hamali_amount_paise),
      niituFeePaise: Number(r.niitu_fee_paise),
      tukadFeePaise: Number(r.tukad_fee_paise),
      rmcFeePaise: Number(r.rmc_fee_paise),
      vehicleRentPaise: Number(r.vehicle_rent_paise),
      handLoanAdvancePaise: Number(r.hand_loan_advance_paise),
      otherDeductionsPaise: Number(r.other_deductions_paise),
      totalDeductionsPaise: Number(r.total_deductions_paise),
      netPayablePaise: Number(r.net_payable_paise),
      paymentMode: (r.payment_mode as PattiSettlementPaymentMode) || 'CASH',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      amountPaidNowPaise: Number(r.amount_paid_now_paise),
      balancePayablePaise: Number(r.balance_payable_paise),
      amountInWords: String(r.amount_in_words || ''),
      status: (r.status as 'FINALIZED' | 'REVERSED') || 'FINALIZED',
      reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      items: itemRows.map((ir) => ({
        id: String(ir.id),
        pattiId: String(ir.patti_id),
        lineNo: Number(ir.line_no),
        commodityId: String(ir.commodity_id),
        commodityCode: String(ir.commodity_code),
        commodityNameEn: String(ir.commodity_name_en),
        commodityNameKn: String(ir.commodity_name_kn),
        bags: Number(ir.bags),
        andiges: Number(ir.andiges),
        grossWeightGrams: Number(ir.gross_weight_grams),
        tareWeightGrams: Number(ir.tare_weight_grams),
        moisturePct: Number(ir.moisture_pct),
        netWeightGrams: Number(ir.net_weight_grams),
        ratePerQuintalPaise: Number(ir.rate_per_quintal_paise),
        grossAmountPaise: Number(ir.gross_amount_paise),
      })),
    };
  }

  /**
   * Creates an atomic Dalali Kharidi Patti (Buyer-side Agency Commission Bill — SRS Sec 8.2, AT-07, AT-11, DR-06).
   * - Allocates `SGT-DK-*` document number
   * - Strictly uses `FARMER_AGENCY` stock ownership (`AT-07`)
   * - Enforces non-automatic GST (`AT-11`): GST is ₹0 unless explicitly enabled on a line item
   * - Posts balanced Khata Journal Entry atomically
   */
  public createDalaliKharidiPatti(params: {
    pattiDate?: string;
    buyerId: string;
    linkedDalaliVikriId?: string | null;
    linkedFarmerId?: string | null;
    classSerial?: string;
    vehicleNo?: string;
    items: DalaliKharidiLineInput[];
    commissionRateBps?: number;
    commissionAmountPaise?: number;
    hamaliAmountPaise?: number;
    niituFeePaise?: number;
    tukadFeePaise?: number;
    rmcFeePaise?: number;
    paymentMode?: KharidiPaymentMode;
    bankAccountId?: string | null;
    amountReceivedNowPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): DalaliKharidiPattiRecord {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.buyerId) {
      throw new Error('Buyer selection is required to create a Dalali Kharidi Patti.');
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('At least one commodity line item is required in Dalali Kharidi Patti.');
    }

    const pattiDate = params.pattiDate?.trim() || getTodayIST();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `DK-${params.buyerId}-${pattiDate}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const existing = this.db
      .prepare('SELECT id FROM dalali_kharidi_pattis WHERE idempotency_key = ?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) {
      return this.getDalaliKharidiPattiById(existing.id);
    }

    const tx = this.db.transaction(() => {
      const buyerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.buyerId) as Record<string, unknown> | undefined;
      if (!buyerRow) {
        throw new Error(`Buyer party not found: ${params.buyerId}`);
      }

      let totalBags = 0;
      let totalAndiges = 0;
      let totalNetWeightGrams = 0;
      let totalBaseAmountPaise = 0;
      let totalGstPaise = 0;

      const preparedItems: Array<{
        lineNo: number;
        commodityId: string;
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
      }> = [];

      params.items.forEach((rawItem, idx) => {
        const cmdRow = this.db
          .prepare('SELECT * FROM commodities WHERE id = ?')
          .get(rawItem.commodityId) as Record<string, unknown> | undefined;
        if (!cmdRow) {
          throw new Error(`Commodity not found for line ${idx + 1}: ${rawItem.commodityId}`);
        }

        const bags = Math.max(0, Math.round(Number(rawItem.bags || 0)));
        const andiges = Math.max(0, Math.round(Number(rawItem.andiges || 0)));
        const netWeightGrams = Math.max(0, Math.round(Number(rawItem.netWeightGrams || 0)));
        if (netWeightGrams <= 0) {
          throw new Error(`Net weight must be greater than zero on line ${idx + 1}.`);
        }

        const ratePerQuintalPaise = Math.max(
          0,
          Math.round(Number(rawItem.ratePerQuintalPaise || 0))
        );
        const baseAmountPaise = Math.round((netWeightGrams / 100_000) * ratePerQuintalPaise);

        // Non-automatic GST enforcement (DR-08 / AT-11)
        const gstApplicable = Boolean(rawItem.gstApplicable);
        const cgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.cgstRateBps ?? cmdRow.cgst_rate_bps ?? 0)))
          : 0;
        const sgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.sgstRateBps ?? cmdRow.sgst_rate_bps ?? 0)))
          : 0;
        const igstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.igstRateBps ?? cmdRow.igst_rate_bps ?? 0)))
          : 0;
        const totalTaxBps = cgstRateBps + sgstRateBps + igstRateBps;
        const gstAmountPaise = gstApplicable
          ? Math.round((baseAmountPaise * totalTaxBps) / 10_000)
          : 0;
        const lineTotalPaise = baseAmountPaise + gstAmountPaise;

        totalBags += bags;
        totalAndiges += andiges;
        totalNetWeightGrams += netWeightGrams;
        totalBaseAmountPaise += baseAmountPaise;
        totalGstPaise += gstAmountPaise;

        preparedItems.push({
          lineNo: idx + 1,
          commodityId: String(cmdRow.id),
          bags,
          andiges,
          netWeightGrams,
          ratePerQuintalPaise,
          baseAmountPaise,
          gstApplicable,
          cgstRateBps,
          sgstRateBps,
          igstRateBps,
          gstAmountPaise,
          lineTotalPaise,
        });
      });

      const commissionRateBps = Math.max(0, Math.round(Number(params.commissionRateBps || 0)));
      const commissionAmountPaise =
        params.commissionAmountPaise !== undefined
          ? Math.max(0, Math.round(Number(params.commissionAmountPaise)))
          : Math.round((totalBaseAmountPaise * commissionRateBps) / 10_000);
      const hamaliAmountPaise = Math.max(0, Math.round(Number(params.hamaliAmountPaise || 0)));
      const niituFeePaise = Math.max(0, Math.round(Number(params.niituFeePaise || 0)));
      const tukadFeePaise = Math.max(0, Math.round(Number(params.tukadFeePaise || 0)));
      const rmcFeePaise = Math.max(0, Math.round(Number(params.rmcFeePaise || 0)));

      const netReceivablePaise =
        totalBaseAmountPaise +
        commissionAmountPaise +
        hamaliAmountPaise +
        niituFeePaise +
        tukadFeePaise +
        rmcFeePaise +
        totalGstPaise;

      const paymentMode: KharidiPaymentMode = params.paymentMode || 'CREDIT';
      const bankAccountId =
        paymentMode === 'BANK_TRANSFER' ? params.bankAccountId ?? null : null;

      let amountReceivedNowPaise = 0;
      if (paymentMode === 'CREDIT') {
        amountReceivedNowPaise = Math.min(
          netReceivablePaise,
          Math.max(0, Math.round(Number(params.amountReceivedNowPaise ?? 0)))
        );
      } else {
        amountReceivedNowPaise =
          params.amountReceivedNowPaise !== undefined
            ? Math.min(
                netReceivablePaise,
                Math.max(0, Math.round(Number(params.amountReceivedNowPaise)))
              )
            : netReceivablePaise;
      }

      const balanceReceivablePaise = Math.max(0, netReceivablePaise - amountReceivedNowPaise);
      const amountInWords = paiseToIndianWords(netReceivablePaise);

      const dkId = `DK-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const dkDoc = this.allocateDocumentNumber({
        docType: DocumentSeriesType.DALALI_KHARIDI,
        referenceEntityId: dkId,
        transactionDate: pattiDate,
        idempotencyKey: `NUM-${idempotencyKey}`,
        actor: params.actor,
      });

      const khataLines: JournalLineInput[] = [];

      if (amountReceivedNowPaise > 0) {
        const debitCode = paymentMode === 'BANK_TRANSFER' ? '1002' : '1001';
        const cashDir: CashFlowDirection =
          paymentMode === 'BANK_TRANSFER' ? 'BANK_IN' : 'CASH_IN';
        khataLines.push({
          accountCode: debitCode,
          partyId: params.buyerId,
          bankAccountId: paymentMode === 'BANK_TRANSFER' ? bankAccountId : null,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: amountReceivedNowPaise,
          creditPaise: 0,
          cashDirection: cashDir,
          lineNote: `Dalali Kharidi Patti receipt (${paymentMode}) on ${dkDoc.formattedNumber}`,
        });
      }

      if (balanceReceivablePaise > 0) {
        khataLines.push({
          accountCode: '1102',
          partyId: params.buyerId,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: balanceReceivablePaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer Receivable for Dalali Kharidi Patti ${dkDoc.formattedNumber}`,
        });
      }

      khataLines.push({
        accountCode: '1101',
        partyId: params.linkedFarmerId || params.buyerId,
        ledgerBucket: 'CROP_PROCEEDS',
        debitPaise: 0,
        creditPaise: totalBaseAmountPaise,
        cashDirection: 'NON_CASH',
        lineNote: `Dalali Kharidi Patti agency base crop value on ${dkDoc.formattedNumber}`,
      });

      if (commissionAmountPaise > 0) {
        khataLines.push({
          accountCode: '4002',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: commissionAmountPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer commission on Dalali Kharidi Patti ${dkDoc.formattedNumber}`,
        });
      }

      const buyerMandiFeesPaise =
        hamaliAmountPaise + niituFeePaise + tukadFeePaise + rmcFeePaise;
      if (buyerMandiFeesPaise > 0) {
        khataLines.push({
          accountCode: '4004',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: buyerMandiFeesPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Hamali, Niitu, Tukad & RMC charges on ${dkDoc.formattedNumber}`,
        });
      }

      if (totalGstPaise > 0) {
        khataLines.push({
          accountCode: '2101',
          partyId: params.buyerId,
          ledgerBucket: 'TAX',
          debitPaise: 0,
          creditPaise: totalGstPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Explicitly enabled GST on Dalali Kharidi Patti ${dkDoc.formattedNumber}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: pattiDate,
        sourceType: 'DALALI_KHARIDI_PATTI',
        sourceId: dkDoc.formattedNumber,
        idempotencyKey: `JE-${idempotencyKey}`,
        narration: `Dalali Kharidi Patti ${dkDoc.formattedNumber} to ${String(buyerRow.name)} (${String(buyerRow.party_code)})`,
        lines: khataLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO dalali_kharidi_pattis (
          id, patti_no, patti_date, buyer_id, linked_dalali_vikri_id, linked_farmer_id,
          class_serial, vehicle_no, total_bags, total_andiges, total_net_weight_grams,
          total_base_amount_paise, commission_rate_bps, commission_amount_paise,
          hamali_amount_paise, niitu_fee_paise, tukad_fee_paise, rmc_fee_paise,
          total_gst_paise, net_receivable_paise, payment_mode, bank_account_id,
          amount_received_now_paise, balance_receivable_paise, amount_in_words, status,
          journal_entry_id, idempotency_key, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?, ?, ?, ?)
      `
        )
        .run(
          dkId,
          dkDoc.formattedNumber,
          pattiDate,
          params.buyerId,
          params.linkedDalaliVikriId ?? null,
          params.linkedFarmerId ?? null,
          (params.classSerial || '').trim(),
          (params.vehicleNo || '').trim(),
          totalBags,
          totalAndiges,
          totalNetWeightGrams,
          totalBaseAmountPaise,
          commissionRateBps,
          commissionAmountPaise,
          hamaliAmountPaise,
          niituFeePaise,
          tukadFeePaise,
          rmcFeePaise,
          totalGstPaise,
          netReceivablePaise,
          paymentMode,
          bankAccountId,
          amountReceivedNowPaise,
          balanceReceivablePaise,
          amountInWords,
          je.id,
          idempotencyKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      for (const item of preparedItems) {
        const lineId = `DKI-${dkId}-${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO dalali_kharidi_items (
            id, patti_id, line_no, commodity_id, bags, andiges, net_weight_grams,
            rate_per_quintal_paise, base_amount_paise, gst_applicable,
            cgst_rate_bps, sgst_rate_bps, igst_rate_bps, gst_amount_paise, line_total_paise
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            lineId,
            dkId,
            item.lineNo,
            item.commodityId,
            item.bags,
            item.andiges,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstApplicable ? 1 : 0,
            item.cgstRateBps,
            item.sgstRateBps,
            item.igstRateBps,
            item.gstAmountPaise,
            item.lineTotalPaise
          );

        const movId = `MOV-DK-${dkId}-${item.lineNo}`;
        const movNo = `${dkDoc.formattedNumber}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_OUT', 'FARMER_AGENCY', ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            movId,
            movNo,
            item.commodityId,
            pattiDate,
            -item.bags,
            -item.netWeightGrams,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstAmountPaise,
            params.buyerId,
            String(buyerRow.name),
            paymentMode === 'BANK_TRANSFER'
              ? 'BANK'
              : paymentMode === 'CASH'
              ? 'CASH'
              : 'CREDIT',
            bankAccountId,
            je.id,
            dkDoc.formattedNumber,
            (params.vehicleNo || '').trim(),
            `Dalali Kharidi agency outward (${dkDoc.formattedNumber})`,
            params.actor.fullName,
            `MOV-${idempotencyKey}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'DALALI_KHARIDI_PATTI',
        entityId: dkId,
        action: 'CREATE_DALALI_KHARIDI_PATTI',
        afterData: {
          pattiNo: dkDoc.formattedNumber,
          buyerId: params.buyerId,
          totalBaseAmountPaise,
          totalGstPaise,
          netReceivablePaise,
        },
        reason: `Created Dalali Kharidi Patti ${dkDoc.formattedNumber}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getDalaliKharidiPattiById(dkId);
    });

    return tx();
  }

  public listDalaliKharidiPattis(buyerId?: string): DalaliKharidiPattiRecord[] {
    let sql = `SELECT id FROM dalali_kharidi_pattis`;
    const params: unknown[] = [];
    if (buyerId) {
      sql += ` WHERE buyer_id = ?`;
      params.push(buyerId);
    }
    sql += ` ORDER BY patti_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getDalaliKharidiPattiById(r.id));
  }

  public getDalaliKharidiPattiById(pattiId: string): DalaliKharidiPattiRecord {
    const r = this.db
      .prepare(
        `
      SELECT dk.*, p.party_code as buyer_code, p.name as buyer_name, p.gstin as buyer_gstin
      FROM dalali_kharidi_pattis dk
      JOIN parties p ON p.id = dk.buyer_id
      WHERE dk.id = ? OR dk.patti_no = ?
    `
      )
      .get(pattiId, pattiId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Dalali Kharidi Patti not found: ${pattiId}`);
    }

    const itemRows = this.db
      .prepare(
        `
      SELECT dki.*, c.code as commodity_code, c.name_en as commodity_name_en, c.name_kn as commodity_name_kn
      FROM dalali_kharidi_items dki
      JOIN commodities c ON c.id = dki.commodity_id
      WHERE dki.patti_id = ?
      ORDER BY dki.line_no ASC
    `
      )
      .all(r.id) as Array<Record<string, unknown>>;

    return {
      id: String(r.id),
      pattiNo: String(r.patti_no),
      pattiDate: String(r.patti_date),
      buyerId: String(r.buyer_id),
      buyerCode: String(r.buyer_code),
      buyerName: String(r.buyer_name),
      buyerGstin: String(r.buyer_gstin || ''),
      linkedDalaliVikriId: r.linked_dalali_vikri_id ? String(r.linked_dalali_vikri_id) : null,
      linkedFarmerId: r.linked_farmer_id ? String(r.linked_farmer_id) : null,
      classSerial: String(r.class_serial || ''),
      vehicleNo: String(r.vehicle_no || ''),
      totalBags: Number(r.total_bags),
      totalAndiges: Number(r.total_andiges),
      totalNetWeightGrams: Number(r.total_net_weight_grams),
      totalBaseAmountPaise: Number(r.total_base_amount_paise),
      commissionRateBps: Number(r.commission_rate_bps),
      commissionAmountPaise: Number(r.commission_amount_paise),
      hamaliAmountPaise: Number(r.hamali_amount_paise),
      niituFeePaise: Number(r.niitu_fee_paise),
      tukadFeePaise: Number(r.tukad_fee_paise),
      rmcFeePaise: Number(r.rmc_fee_paise),
      totalGstPaise: Number(r.total_gst_paise),
      netReceivablePaise: Number(r.net_receivable_paise),
      paymentMode: (r.payment_mode as KharidiPaymentMode) || 'CREDIT',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      amountReceivedNowPaise: Number(r.amount_received_now_paise),
      balanceReceivablePaise: Number(r.balance_receivable_paise),
      amountInWords: String(r.amount_in_words || ''),
      status: (r.status as 'FINALIZED' | 'REVERSED') || 'FINALIZED',
      reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      items: itemRows.map((ir) => ({
        id: String(ir.id),
        pattiId: String(ir.patti_id),
        lineNo: Number(ir.line_no),
        commodityId: String(ir.commodity_id),
        commodityCode: String(ir.commodity_code),
        commodityNameEn: String(ir.commodity_name_en),
        commodityNameKn: String(ir.commodity_name_kn),
        bags: Number(ir.bags),
        andiges: Number(ir.andiges),
        netWeightGrams: Number(ir.net_weight_grams),
        ratePerQuintalPaise: Number(ir.rate_per_quintal_paise),
        baseAmountPaise: Number(ir.base_amount_paise),
        gstApplicable: Boolean(ir.gst_applicable),
        cgstRateBps: Number(ir.cgst_rate_bps),
        sgstRateBps: Number(ir.sgst_rate_bps),
        igstRateBps: Number(ir.igst_rate_bps),
        gstAmountPaise: Number(ir.gst_amount_paise),
        lineTotalPaise: Number(ir.line_total_paise),
      })),
    };
  }

  /**
   * Creates an atomic Cash / Credit Bill (`SGT-CB-*`, SRS Sec 9.1 & 9.2, AT-11, DR-07).
   * - Supports full Transport Details (lorry owner, driver, licence, vehicle, origin, destination, delivery note, freight advance)
   * - Enforces non-automatic GST (`AT-11`) and configurable CST / Other Tax field (`DR-07`)
   * - Computes `amountInWords` (`paiseToIndianWords`)
   * - Posts balanced Khata Journal Entry and Stock Movements atomically
   */
  public createCashCreditBill(params: {
    billDate?: string;
    billKind?: 'CASH_BILL' | 'CREDIT_BILL';
    buyerId: string;
    ownershipMode?: StockOwnershipType;
    classSerial?: string;
    transport?: Partial<BillTransportDetails>;
    items: CashCreditBillLineInput[];
    commissionPaise?: number;
    hamaliPackingPaise?: number;
    rmcFeePaise?: number;
    tukadFeePaise?: number;
    cstOrOtherTaxLabel?: string;
    cstOrOtherTaxPaise?: number;
    paymentMode?: KharidiPaymentMode;
    bankAccountId?: string | null;
    amountReceivedNowPaise?: number;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): CashCreditBillRecord {
    this.requirePermission(params.actor, PermissionKey.CREATE_TRADING_BILLS);

    if (!params.buyerId) {
      throw new Error('Buyer selection is required to create a Cash/Credit Bill.');
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('At least one commodity line item is required in Cash/Credit Bill.');
    }

    const billDate = params.billDate?.trim() || getTodayIST();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      `CB-${params.buyerId}-${billDate}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const existing = this.db
      .prepare('SELECT id FROM cash_credit_bills WHERE idempotency_key = ?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) {
      return this.getCashCreditBillById(existing.id);
    }

    const tx = this.db.transaction(() => {
      const buyerRow = this.db
        .prepare('SELECT * FROM parties WHERE id = ?')
        .get(params.buyerId) as Record<string, unknown> | undefined;
      if (!buyerRow) {
        throw new Error(`Buyer party not found: ${params.buyerId}`);
      }

      const settings = this.getCompanySettings();
      const ownershipMode: StockOwnershipType =
        params.ownershipMode === 'FARMER_AGENCY' ? 'FARMER_AGENCY' : 'SGT_OWNED';
      const currentStockStatuses = this.listCommodityStockStatus();

      let totalBags = 0;
      let totalAndiges = 0;
      let totalNetWeightGrams = 0;
      let totalBaseAmountPaise = 0;
      let totalCgstPaise = 0;
      let totalSgstPaise = 0;
      let totalIgstPaise = 0;
      let totalGstPaise = 0;

      const preparedItems: Array<{
        lineNo: number;
        commodityId: string;
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
      }> = [];

      params.items.forEach((rawItem, idx) => {
        const cmdRow = this.db
          .prepare('SELECT * FROM commodities WHERE id = ?')
          .get(rawItem.commodityId) as Record<string, unknown> | undefined;
        if (!cmdRow) {
          throw new Error(`Commodity not found for line ${idx + 1}: ${rawItem.commodityId}`);
        }

        const bags = Math.max(0, Math.round(Number(rawItem.bags || 0)));
        const andiges = Math.max(0, Math.round(Number(rawItem.andiges || 0)));
        const netWeightGrams = Math.max(0, Math.round(Number(rawItem.netWeightGrams || 0)));
        if (netWeightGrams <= 0) {
          throw new Error(`Net weight must be greater than zero on line ${idx + 1}.`);
        }

        if (ownershipMode === 'SGT_OWNED') {
          const st = currentStockStatuses.find((s) => s.commodity.id === String(cmdRow.id));
          const availableGrams = st?.closingOwnedWeightGrams ?? 0;
          if (
            netWeightGrams > availableGrams &&
            !params.actor.permissions.includes(PermissionKey.APPROVE_CORRECTIONS)
          ) {
            throw new Error(
              `Insufficient SGT-owned stock for ${String(cmdRow.name_en)}: available ${(availableGrams / 100_000).toFixed(2)} Q, requested ${(netWeightGrams / 100_000).toFixed(2)} Q.`
            );
          }
        }

        const ratePerQuintalPaise = Math.max(
          0,
          Math.round(Number(rawItem.ratePerQuintalPaise || 0))
        );
        const baseAmountPaise = Math.round((netWeightGrams / 100_000) * ratePerQuintalPaise);

        // AT-11: Non-automatic GST — 0 unless explicitly opted in on the line
        const gstApplicable = Boolean(rawItem.gstApplicable);
        const cgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.cgstRateBps ?? cmdRow.cgst_rate_bps ?? 0)))
          : 0;
        const sgstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.sgstRateBps ?? cmdRow.sgst_rate_bps ?? 0)))
          : 0;
        const igstRateBps = gstApplicable
          ? Math.max(0, Math.round(Number(rawItem.igstRateBps ?? cmdRow.igst_rate_bps ?? 0)))
          : 0;

        const cgstAmountPaise = gstApplicable
          ? Math.round((baseAmountPaise * cgstRateBps) / 10_000)
          : 0;
        const sgstAmountPaise = gstApplicable
          ? Math.round((baseAmountPaise * sgstRateBps) / 10_000)
          : 0;
        const igstAmountPaise = gstApplicable
          ? Math.round((baseAmountPaise * igstRateBps) / 10_000)
          : 0;
        const gstAmountPaise = cgstAmountPaise + sgstAmountPaise + igstAmountPaise;
        const lineTotalPaise = baseAmountPaise + gstAmountPaise;

        totalBags += bags;
        totalAndiges += andiges;
        totalNetWeightGrams += netWeightGrams;
        totalBaseAmountPaise += baseAmountPaise;
        totalCgstPaise += cgstAmountPaise;
        totalSgstPaise += sgstAmountPaise;
        totalIgstPaise += igstAmountPaise;
        totalGstPaise += gstAmountPaise;

        preparedItems.push({
          lineNo: idx + 1,
          commodityId: String(cmdRow.id),
          hsnCode: String(rawItem.hsnCode || cmdRow.hsn_code || ''),
          bags,
          andiges,
          netWeightGrams,
          ratePerQuintalPaise,
          baseAmountPaise,
          gstApplicable,
          cgstRateBps,
          sgstRateBps,
          igstRateBps,
          cgstAmountPaise,
          sgstAmountPaise,
          igstAmountPaise,
          gstAmountPaise,
          lineTotalPaise,
        });
      });

      const commissionPaise = Math.max(0, Math.round(Number(params.commissionPaise || 0)));
      const hamaliPackingPaise = Math.max(0, Math.round(Number(params.hamaliPackingPaise || 0)));
      const rmcFeePaise = Math.max(0, Math.round(Number(params.rmcFeePaise || 0)));
      const tukadFeePaise = Math.max(0, Math.round(Number(params.tukadFeePaise || 0)));
      const cstOrOtherTaxLabel =
        (params.cstOrOtherTaxLabel || '').trim() ||
        settings.customLabels.cstOrOtherTaxLabelEn ||
        'CST / Other Tax';
      const cstOrOtherTaxPaise = Math.max(0, Math.round(Number(params.cstOrOtherTaxPaise || 0)));

      const netBillAmountPaise =
        totalBaseAmountPaise +
        commissionPaise +
        hamaliPackingPaise +
        rmcFeePaise +
        tukadFeePaise +
        cstOrOtherTaxPaise +
        totalGstPaise;

      const paymentMode: KharidiPaymentMode =
        params.paymentMode || (params.billKind === 'CASH_BILL' ? 'CASH' : 'CREDIT');
      const billKind: 'CASH_BILL' | 'CREDIT_BILL' =
        params.billKind || (paymentMode === 'CASH' ? 'CASH_BILL' : 'CREDIT_BILL');
      const bankAccountId =
        paymentMode === 'BANK_TRANSFER' ? params.bankAccountId ?? null : null;

      let amountReceivedNowPaise = 0;
      if (paymentMode === 'CREDIT') {
        amountReceivedNowPaise = Math.min(
          netBillAmountPaise,
          Math.max(0, Math.round(Number(params.amountReceivedNowPaise ?? 0)))
        );
      } else {
        amountReceivedNowPaise =
          params.amountReceivedNowPaise !== undefined
            ? Math.min(
                netBillAmountPaise,
                Math.max(0, Math.round(Number(params.amountReceivedNowPaise)))
              )
            : netBillAmountPaise;
      }

      const balanceReceivablePaise = Math.max(0, netBillAmountPaise - amountReceivedNowPaise);
      const amountInWords = paiseToIndianWords(netBillAmountPaise);

      const transport: BillTransportDetails = {
        lorryOwnerName: (params.transport?.lorryOwnerName || '').trim(),
        driverName: (params.transport?.driverName || '').trim(),
        driverLicenseNo: (params.transport?.driverLicenseNo || '').trim(),
        driverPhone: (params.transport?.driverPhone || '').trim(),
        vehicleNo: (params.transport?.vehicleNo || '').trim(),
        originPlace: (params.transport?.originPlace || '').trim(),
        destinationPlace: (params.transport?.destinationPlace || '').trim(),
        deliveryNoteNo: (params.transport?.deliveryNoteNo || '').trim(),
        freightAdvancePaise: Math.max(
          0,
          Math.round(Number(params.transport?.freightAdvancePaise || 0))
        ),
      };

      const cbId = `CB-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const cbDoc = this.allocateDocumentNumber({
        docType: DocumentSeriesType.CASH_CREDIT_BILL,
        referenceEntityId: cbId,
        transactionDate: billDate,
        idempotencyKey: `NUM-${idempotencyKey}`,
        actor: params.actor,
      });

      const khataLines: JournalLineInput[] = [];

      if (amountReceivedNowPaise > 0) {
        const debitCode = paymentMode === 'BANK_TRANSFER' ? '1002' : '1001';
        const cashDir: CashFlowDirection =
          paymentMode === 'BANK_TRANSFER' ? 'BANK_IN' : 'CASH_IN';
        khataLines.push({
          accountCode: debitCode,
          partyId: params.buyerId,
          bankAccountId: paymentMode === 'BANK_TRANSFER' ? bankAccountId : null,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: amountReceivedNowPaise,
          creditPaise: 0,
          cashDirection: cashDir,
          lineNote: `Cash/Credit Bill receipt (${paymentMode}) on ${cbDoc.formattedNumber}`,
        });
      }

      if (balanceReceivablePaise > 0) {
        khataLines.push({
          accountCode: '1102',
          partyId: params.buyerId,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: balanceReceivablePaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Buyer Receivable for Cash/Credit Bill ${cbDoc.formattedNumber}`,
        });
      }

      const salesCreditAccountCode = ownershipMode === 'SGT_OWNED' ? '4001' : '1101';
      khataLines.push({
        accountCode: salesCreditAccountCode,
        partyId: params.buyerId,
        ledgerBucket: 'INVOICE_RECEIVABLE',
        debitPaise: 0,
        creditPaise: totalBaseAmountPaise,
        cashDirection: 'NON_CASH',
        lineNote: `Cash/Credit Bill crop sales (${ownershipMode}) on ${cbDoc.formattedNumber}`,
      });

      if (commissionPaise > 0) {
        khataLines.push({
          accountCode: '4002',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: commissionPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Commission on Cash/Credit Bill ${cbDoc.formattedNumber}`,
        });
      }

      const ancillaryFeesPaise = hamaliPackingPaise + rmcFeePaise + tukadFeePaise;
      if (ancillaryFeesPaise > 0) {
        khataLines.push({
          accountCode: '4004',
          partyId: params.buyerId,
          ledgerBucket: 'DEDUCTIONS',
          debitPaise: 0,
          creditPaise: ancillaryFeesPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Hamali, RMC & Tukad fees on ${cbDoc.formattedNumber}`,
        });
      }

      const totalTaxCreditPaise = totalGstPaise + cstOrOtherTaxPaise;
      if (totalTaxCreditPaise > 0) {
        khataLines.push({
          accountCode: '2101',
          partyId: params.buyerId,
          ledgerBucket: 'TAX',
          debitPaise: 0,
          creditPaise: totalTaxCreditPaise,
          cashDirection: 'NON_CASH',
          lineNote: `Tax (GST / ${cstOrOtherTaxLabel}) on ${cbDoc.formattedNumber}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: billDate,
        sourceType: 'CASH_CREDIT_BILL',
        sourceId: cbDoc.formattedNumber,
        idempotencyKey: `JE-${idempotencyKey}`,
        narration: `${billKind.replace('_', ' ')} ${cbDoc.formattedNumber} to ${String(buyerRow.name)} (${String(buyerRow.party_code)})`,
        lines: khataLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        INSERT INTO cash_credit_bills (
          id, bill_no, bill_date, bill_kind, buyer_id, ownership_mode, class_serial,
          lorry_owner_name, driver_name, driver_license_no, driver_phone, vehicle_no,
          origin_place, destination_place, delivery_note_no, freight_advance_paise,
          total_bags, total_andiges, total_net_weight_grams, total_base_amount_paise,
          commission_paise, hamali_packing_paise, rmc_fee_paise, tukad_fee_paise,
          cst_or_other_tax_label, cst_or_other_tax_paise,
          total_cgst_paise, total_sgst_paise, total_igst_paise, total_gst_paise,
          net_bill_amount_paise, amount_in_words, payment_mode, bank_account_id,
          amount_received_now_paise, balance_receivable_paise, status,
          journal_entry_id, idempotency_key, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?, ?, ?, ?)
      `
        )
        .run(
          cbId,
          cbDoc.formattedNumber,
          billDate,
          billKind,
          params.buyerId,
          ownershipMode,
          (params.classSerial || '').trim(),
          transport.lorryOwnerName,
          transport.driverName,
          transport.driverLicenseNo,
          transport.driverPhone,
          transport.vehicleNo,
          transport.originPlace,
          transport.destinationPlace,
          transport.deliveryNoteNo,
          transport.freightAdvancePaise,
          totalBags,
          totalAndiges,
          totalNetWeightGrams,
          totalBaseAmountPaise,
          commissionPaise,
          hamaliPackingPaise,
          rmcFeePaise,
          tukadFeePaise,
          cstOrOtherTaxLabel,
          cstOrOtherTaxPaise,
          totalCgstPaise,
          totalSgstPaise,
          totalIgstPaise,
          totalGstPaise,
          netBillAmountPaise,
          amountInWords,
          paymentMode,
          bankAccountId,
          amountReceivedNowPaise,
          balanceReceivablePaise,
          je.id,
          idempotencyKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      for (const item of preparedItems) {
        const lineId = `CBI-${cbId}-${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO cash_credit_bill_items (
            id, bill_id, line_no, commodity_id, hsn_code, bags, andiges, net_weight_grams,
            rate_per_quintal_paise, base_amount_paise, gst_applicable,
            cgst_rate_bps, sgst_rate_bps, igst_rate_bps,
            cgst_amount_paise, sgst_amount_paise, igst_amount_paise,
            gst_amount_paise, line_total_paise
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            lineId,
            cbId,
            item.lineNo,
            item.commodityId,
            item.hsnCode,
            item.bags,
            item.andiges,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstApplicable ? 1 : 0,
            item.cgstRateBps,
            item.sgstRateBps,
            item.igstRateBps,
            item.cgstAmountPaise,
            item.sgstAmountPaise,
            item.igstAmountPaise,
            item.gstAmountPaise,
            item.lineTotalPaise
          );

        const movId = `MOV-CB-${cbId}-${item.lineNo}`;
        const movNo = `${cbDoc.formattedNumber}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_OUT', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            movId,
            movNo,
            item.commodityId,
            billDate,
            ownershipMode,
            -item.bags,
            -item.netWeightGrams,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstAmountPaise,
            params.buyerId,
            String(buyerRow.name),
            paymentMode === 'BANK_TRANSFER'
              ? 'BANK'
              : paymentMode === 'CASH'
              ? 'CASH'
              : 'CREDIT',
            bankAccountId,
            je.id,
            cbDoc.formattedNumber,
            transport.vehicleNo,
            `Cash/Credit Bill outward (${cbDoc.formattedNumber})`,
            params.actor.fullName,
            `MOV-${idempotencyKey}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'CASH_CREDIT_BILL',
        entityId: cbId,
        action: 'CREATE_CASH_CREDIT_BILL',
        afterData: {
          billNo: cbDoc.formattedNumber,
          billKind,
          buyerId: params.buyerId,
          totalBaseAmountPaise,
          totalGstPaise,
          cstOrOtherTaxPaise,
          netBillAmountPaise,
        },
        reason: `Issued ${billKind.replace('_', ' ')} ${cbDoc.formattedNumber}`,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getCashCreditBillById(cbId);
    });

    return tx();
  }

  /**
   * Controlled Reversal / Credit Note for a finalized Cash/Credit Bill (SRS Sec 9.2 & 17.3, AT-14).
   * - Requires `APPROVE_CORRECTIONS` permission + mandatory audit reason
   * - Preserves original bill row (`status = 'REVERSED'`), assigns Credit Note No (`CN-<billNo>`)
   * - Reverses the Khata Journal Entry and restores commodity stock via offsetting Stock Movements
   */
  public reverseCashCreditBill(params: {
    billId: string;
    reversalDate?: string;
    reason: string;
    actor: UserProfile;
  }): CashCreditBillRecord {
    this.requirePermission(params.actor, PermissionKey.APPROVE_CORRECTIONS);
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('A clear audit reason is mandatory to issue a Credit Note / reverse a finalized bill.');
    }

    const reversalDate = params.reversalDate?.trim() || getTodayIST();

    const tx = this.db.transaction(() => {
      const bill = this.getCashCreditBillById(params.billId);
      if (bill.status === 'REVERSED') {
        throw new Error(`Cash/Credit Bill ${bill.billNo} has already been reversed (${bill.creditNoteNo}).`);
      }

      const reversalJe = this.reverseJournalEntry({
        entryId: bill.journalEntryId,
        reversalDate,
        reason: `Credit Note / Reversal of ${bill.billNo}: ${params.reason.trim()}`,
        actor: params.actor,
      });

      const creditNoteNo = `CN-${bill.billNo}`;
      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `
        UPDATE cash_credit_bills
        SET status = 'REVERSED',
            reversal_reason = ?,
            reversal_date = ?,
            reversal_journal_entry_id = ?,
            credit_note_no = ?,
            balance_receivable_paise = 0
        WHERE id = ?
      `
        )
        .run(
          params.reason.trim(),
          reversalDate,
          reversalJe.id,
          creditNoteNo,
          bill.id
        );

      // Restore stock quantities with offsetting GOODS_IN movements
      for (const item of bill.items) {
        const revMovId = `MOV-REV-${bill.id}-${item.lineNo}`;
        const revMovNo = `${creditNoteNo}-L${item.lineNo}`;
        this.db
          .prepare(
            `
          INSERT INTO stock_movements (
            id, movement_no, commodity_id, transaction_date, direction, ownership_type,
            bags_delta, weight_grams_delta, gross_weight_grams, tare_weight_grams, moisture_pct,
            rate_per_quintal_paise, total_value_paise, gst_amount_paise, party_id, party_name,
            settlement_mode, bank_account_id, journal_entry_id, reference_bill_no, vehicle_no,
            reason, approved_by, idempotency_key, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'GOODS_IN', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'CREDIT', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            revMovId,
            revMovNo,
            item.commodityId,
            reversalDate,
            bill.ownershipMode,
            item.bags,
            item.netWeightGrams,
            item.netWeightGrams,
            item.ratePerQuintalPaise,
            item.baseAmountPaise,
            item.gstAmountPaise,
            bill.buyerId,
            bill.buyerName,
            reversalJe.id,
            creditNoteNo,
            bill.transport.vehicleNo,
            `Credit Note stock restoration for ${bill.billNo}: ${params.reason.trim()}`,
            params.actor.fullName,
            `REV-MOV-${bill.id}-${item.lineNo}`,
            params.actor.fullName,
            nowIso
          );
      }

      this.recordAuditLog({
        entityType: 'CASH_CREDIT_BILL',
        entityId: bill.id,
        action: 'REVERSE_CASH_CREDIT_BILL',
        beforeData: {
          billNo: bill.billNo,
          status: 'FINALIZED',
          netBillAmountPaise: bill.netBillAmountPaise,
        },
        afterData: {
          billNo: bill.billNo,
          status: 'REVERSED',
          creditNoteNo,
          reversalJournalEntryId: reversalJe.id,
          reason: params.reason.trim(),
        },
        reason: params.reason.trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getCashCreditBillById(bill.id);
    });

    return tx();
  }

  public listCashCreditBills(buyerId?: string): CashCreditBillRecord[] {
    let sql = `SELECT id FROM cash_credit_bills`;
    const params: unknown[] = [];
    if (buyerId) {
      sql += ` WHERE buyer_id = ?`;
      params.push(buyerId);
    }
    sql += ` ORDER BY bill_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getCashCreditBillById(r.id));
  }

  public getCashCreditBillById(billId: string): CashCreditBillRecord {
    const r = this.db
      .prepare(
        `
      SELECT cb.*, p.party_code as buyer_code, p.name as buyer_name,
             p.gstin as buyer_gstin, p.address as buyer_address
      FROM cash_credit_bills cb
      JOIN parties p ON p.id = cb.buyer_id
      WHERE cb.id = ? OR cb.bill_no = ?
    `
      )
      .get(billId, billId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new Error(`Cash/Credit Bill not found: ${billId}`);
    }

    const itemRows = this.db
      .prepare(
        `
      SELECT cbi.*, c.code as commodity_code, c.name_en as commodity_name_en, c.name_kn as commodity_name_kn
      FROM cash_credit_bill_items cbi
      JOIN commodities c ON c.id = cbi.commodity_id
      WHERE cbi.bill_id = ?
      ORDER BY cbi.line_no ASC
    `
      )
      .all(r.id) as Array<Record<string, unknown>>;

    return {
      id: String(r.id),
      billNo: String(r.bill_no),
      billDate: String(r.bill_date),
      billKind: (r.bill_kind as 'CASH_BILL' | 'CREDIT_BILL') || 'CREDIT_BILL',
      buyerId: String(r.buyer_id),
      buyerCode: String(r.buyer_code),
      buyerName: String(r.buyer_name),
      buyerGstin: String(r.buyer_gstin || ''),
      buyerAddress: String(r.buyer_address || ''),
      ownershipMode: (r.ownership_mode as StockOwnershipType) || 'SGT_OWNED',
      classSerial: String(r.class_serial || ''),
      transport: {
        lorryOwnerName: String(r.lorry_owner_name || ''),
        driverName: String(r.driver_name || ''),
        driverLicenseNo: String(r.driver_license_no || ''),
        driverPhone: String(r.driver_phone || ''),
        vehicleNo: String(r.vehicle_no || ''),
        originPlace: String(r.origin_place || ''),
        destinationPlace: String(r.destination_place || ''),
        deliveryNoteNo: String(r.delivery_note_no || ''),
        freightAdvancePaise: Number(r.freight_advance_paise || 0),
      },
      totalBags: Number(r.total_bags),
      totalAndiges: Number(r.total_andiges),
      totalNetWeightGrams: Number(r.total_net_weight_grams),
      totalBaseAmountPaise: Number(r.total_base_amount_paise),
      commissionPaise: Number(r.commission_paise),
      hamaliPackingPaise: Number(r.hamali_packing_paise),
      rmcFeePaise: Number(r.rmc_fee_paise),
      tukadFeePaise: Number(r.tukad_fee_paise),
      cstOrOtherTaxLabel: String(r.cst_or_other_tax_label || 'CST / Other Tax'),
      cstOrOtherTaxPaise: Number(r.cst_or_other_tax_paise),
      totalCgstPaise: Number(r.total_cgst_paise),
      totalSgstPaise: Number(r.total_sgst_paise),
      totalIgstPaise: Number(r.total_igst_paise),
      totalGstPaise: Number(r.total_gst_paise),
      netBillAmountPaise: Number(r.net_bill_amount_paise),
      amountInWords: String(r.amount_in_words || ''),
      paymentMode: (r.payment_mode as KharidiPaymentMode) || 'CREDIT',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      amountReceivedNowPaise: Number(r.amount_received_now_paise),
      balanceReceivablePaise: Number(r.balance_receivable_paise),
      status: (r.status as 'FINALIZED' | 'REVERSED') || 'FINALIZED',
      reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
      reversalDate: r.reversal_date ? String(r.reversal_date) : null,
      reversalJournalEntryId: r.reversal_journal_entry_id
        ? String(r.reversal_journal_entry_id)
        : null,
      creditNoteNo: r.credit_note_no ? String(r.credit_note_no) : null,
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      items: itemRows.map((ir) => ({
        id: String(ir.id),
        billId: String(ir.bill_id),
        lineNo: Number(ir.line_no),
        commodityId: String(ir.commodity_id),
        commodityCode: String(ir.commodity_code),
        commodityNameEn: String(ir.commodity_name_en),
        commodityNameKn: String(ir.commodity_name_kn),
        hsnCode: String(ir.hsn_code || ''),
        bags: Number(ir.bags),
        andiges: Number(ir.andiges),
        netWeightGrams: Number(ir.net_weight_grams),
        ratePerQuintalPaise: Number(ir.rate_per_quintal_paise),
        baseAmountPaise: Number(ir.base_amount_paise),
        gstApplicable: Boolean(ir.gst_applicable),
        cgstRateBps: Number(ir.cgst_rate_bps),
        sgstRateBps: Number(ir.sgst_rate_bps),
        igstRateBps: Number(ir.igst_rate_bps),
        cgstAmountPaise: Number(ir.cgst_amount_paise),
        sgstAmountPaise: Number(ir.sgst_amount_paise),
        igstAmountPaise: Number(ir.igst_amount_paise),
        gstAmountPaise: Number(ir.gst_amount_paise),
        lineTotalPaise: Number(ir.line_total_paise),
      })),
    };
  }

  // ==========================================================================
  // CHUNK 7: BUYER COLLECTION BOOK, EXPENSES/COMMITMENTS & TAX REGISTERS
  // ==========================================================================

  public assertDayOpenForPosting(businessDate: string): void {
    const cleanDate = (businessDate || '').trim();
    if (!cleanDate) return;
    const row = this.db
      .prepare('SELECT status FROM day_closes WHERE business_date = ?')
      .get(cleanDate) as { status: string } | undefined;
    if (row && row.status === 'CLOSED') {
      throw new Error(
        `DAY_CLOSED: Business date ${cleanDate} is closed and locked. Reopen the day with REOPEN_CLOSED_DAY permission before posting transactions.`
      );
    }
  }

  /**
   * Record a partial or full Buyer Collection Receipt (SRS Sec 14.2, AT-09).
   * Allocates against a Cash/Credit Bill, Kharidi Patti, Dalali Kharidi Patti, or On-Account,
   * updates remaining due on the invoice, and posts a balanced Journal Entry.
   */
  public recordBuyerCollection(params: {
    receiptDate?: string;
    buyerId: string;
    targetBillType?: CollectionTargetBillType;
    targetBillId?: string | null;
    amountPaise: number;
    discountAllowedPaise?: number;
    paymentMode?: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
    bankAccountId?: string | null;
    referenceNo?: string;
    notes?: string;
    idempotencyKey?: string;
    actor: UserProfile;
  }): BuyerCollectionRecord {
    if (
      !params.actor.permissions.includes(PermissionKey.MANAGE_CASH_BANK) &&
      !params.actor.permissions.includes(PermissionKey.CREATE_TRADING_BILLS)
    ) {
      throw new Error(
        `PERMISSION_DENIED: Role ${params.actor.role} requires MANAGE_CASH_BANK or CREATE_TRADING_BILLS to record buyer collections.`
      );
    }

    const tx = this.db.transaction(() => {
      const receiptDate = (params.receiptDate || getTodayIST()).trim();
      this.assertDayOpenForPosting(receiptDate);

      const idemKey = (
        params.idempotencyKey ||
        `COL-${params.buyerId}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`
      ).trim();

      const existing = this.db
        .prepare('SELECT id FROM collections_receipts WHERE idempotency_key = ?')
        .get(idemKey) as { id: string } | undefined;
      if (existing) {
        return this.getBuyerCollectionById(existing.id);
      }

      const amountPaise = Math.round(Number(params.amountPaise || 0));
      const discountAllowedPaise = Math.max(0, Math.round(Number(params.discountAllowedPaise || 0)));
      const totalSettledPaise = amountPaise + discountAllowedPaise;

      if (amountPaise <= 0) {
        throw new Error('Collection receipt amount must be greater than ₹0.');
      }

      const buyerRow = this.db
        .prepare('SELECT id, party_code, name, phone_primary FROM parties WHERE id = ?')
        .get(params.buyerId) as Record<string, unknown> | undefined;
      if (!buyerRow) {
        throw new Error(`Buyer party not found: ${params.buyerId}`);
      }

      const targetBillType: CollectionTargetBillType = params.targetBillType || 'ON_ACCOUNT';
      let targetBillId: string | null = params.targetBillId ? String(params.targetBillId) : null;
      let targetBillNo: string | null = null;
      let billBalanceBeforePaise = 0;
      let billBalanceAfterPaise = 0;

      if (targetBillType === 'CASH_CREDIT_BILL' && targetBillId) {
        const bill = this.getCashCreditBillById(targetBillId);
        if (bill.status === 'REVERSED') {
          throw new Error(`Cannot collect against reversed Cash/Credit Bill ${bill.billNo}.`);
        }
        targetBillId = bill.id;
        targetBillNo = bill.billNo;
        billBalanceBeforePaise = bill.balanceReceivablePaise;
        if (totalSettledPaise > billBalanceBeforePaise) {
          throw new Error(
            `Collection + Discount (${totalSettledPaise} paise) exceeds remaining due (${billBalanceBeforePaise} paise) on bill ${bill.billNo}.`
          );
        }
        billBalanceAfterPaise = billBalanceBeforePaise - totalSettledPaise;
        this.db
          .prepare(
            `UPDATE cash_credit_bills
             SET amount_received_now_paise = amount_received_now_paise + ?,
                 balance_receivable_paise = ?
             WHERE id = ?`
          )
          .run(totalSettledPaise, billBalanceAfterPaise, bill.id);
      } else if (targetBillType === 'KHARIDI_PATTI' && targetBillId) {
        const kp = this.getKharidiPattiById(targetBillId);
        targetBillId = kp.id;
        targetBillNo = kp.invoiceNo;
        billBalanceBeforePaise = kp.balanceReceivablePaise;
        if (totalSettledPaise > billBalanceBeforePaise) {
          throw new Error(
            `Collection + Discount (${totalSettledPaise} paise) exceeds remaining due (${billBalanceBeforePaise} paise) on Kharidi Patti ${kp.invoiceNo}.`
          );
        }
        billBalanceAfterPaise = billBalanceBeforePaise - totalSettledPaise;
        this.db
          .prepare(
            `UPDATE kharidi_pattis
             SET amount_received_now_paise = amount_received_now_paise + ?,
                 balance_receivable_paise = ?
             WHERE id = ?`
          )
          .run(totalSettledPaise, billBalanceAfterPaise, kp.id);
      } else if (targetBillType === 'DALALI_KHARIDI_PATTI' && targetBillId) {
        const dkp = this.getDalaliKharidiPattiById(targetBillId);
        targetBillId = dkp.id;
        targetBillNo = dkp.pattiNo;
        billBalanceBeforePaise = dkp.balanceReceivablePaise;
        if (totalSettledPaise > billBalanceBeforePaise) {
          throw new Error(
            `Collection + Discount (${totalSettledPaise} paise) exceeds remaining due (${billBalanceBeforePaise} paise) on Dalali Kharidi Patti ${dkp.pattiNo}.`
          );
        }
        billBalanceAfterPaise = billBalanceBeforePaise - totalSettledPaise;
        this.db
          .prepare(
            `UPDATE dalali_kharidi_pattis
             SET amount_received_now_paise = amount_received_now_paise + ?,
                 balance_receivable_paise = ?
             WHERE id = ?`
          )
          .run(totalSettledPaise, billBalanceAfterPaise, dkp.id);
      }

      const id = `COL-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const issuedReceipt = this.allocateDocumentNumber({
        docType: DocumentSeriesType.RECEIPT,
        referenceEntityId: id,
        transactionDate: receiptDate,
        idempotencyKey: `NUM-RC-${idemKey}`,
        actor: params.actor,
      });

      const paymentMode = params.paymentMode || 'CASH';
      const isCash = paymentMode === 'CASH';
      const debitAccountCode = isCash ? '1001' : '1002';
      const cashDir: CashFlowDirection = isCash ? 'CASH_IN' : 'BANK_IN';

      const jeLines: JournalLineInput[] = [
        {
          accountCode: debitAccountCode,
          bankAccountId: isCash ? null : params.bankAccountId || null,
          ledgerBucket: 'INVOICE_RECEIVABLE',
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: cashDir,
          lineNote: `Buyer receipt ${issuedReceipt.formattedNumber} from ${String(buyerRow.name)}${
            targetBillNo ? ` against ${targetBillNo}` : ''
          }`,
        },
      ];

      if (discountAllowedPaise > 0) {
        jeLines.push({
          accountCode: '5002',
          ledgerBucket: 'GENERAL',
          debitPaise: discountAllowedPaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `Cash discount allowed on ${issuedReceipt.formattedNumber}`,
        });
      }

      jeLines.push({
        accountCode: '1102',
        partyId: params.buyerId,
        ledgerBucket: 'INVOICE_RECEIVABLE',
        debitPaise: 0,
        creditPaise: totalSettledPaise,
        cashDirection: 'NON_CASH',
        lineNote: `Buyer Receivable credit for ${issuedReceipt.formattedNumber}${
          targetBillNo ? ` (Bill ${targetBillNo})` : ''
        }`,
      });

      const je = this.postJournalEntry({
        transactionDate: receiptDate,
        sourceType: 'BUYER_COLLECTION',
        sourceId: id,
        idempotencyKey: `JE-COL-${idemKey}`,
        narration: `Buyer Collection Receipt ${issuedReceipt.formattedNumber} — ${String(
          buyerRow.name
        )}${targetBillNo ? ` against ${targetBillNo}` : ''}`,
        lines: jeLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO collections_receipts (
            id, receipt_no, receipt_date, buyer_id, target_bill_type, target_bill_id,
            target_bill_no, amount_paise, discount_allowed_paise, payment_mode,
            bank_account_id, reference_no, bill_balance_before_paise, bill_balance_after_paise,
            journal_entry_id, idempotency_key, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          issuedReceipt.formattedNumber,
          receiptDate,
          params.buyerId,
          targetBillType,
          targetBillId,
          targetBillNo,
          amountPaise,
          discountAllowedPaise,
          paymentMode,
          params.bankAccountId || null,
          (params.referenceNo || '').trim(),
          billBalanceBeforePaise,
          billBalanceAfterPaise,
          je.id,
          idemKey,
          (params.notes || '').trim(),
          params.actor.fullName,
          nowIso
        );

      this.recordAuditLog({
        entityType: 'BUYER_COLLECTION',
        entityId: id,
        action: 'CREATE_BUYER_COLLECTION',
        afterData: {
          receiptNo: issuedReceipt.formattedNumber,
          buyerId: params.buyerId,
          targetBillNo,
          amountPaise,
          billBalanceBeforePaise,
          billBalanceAfterPaise,
        },
        reason: `Recorded buyer collection receipt ${issuedReceipt.formattedNumber}`,
        actor: params.actor,
      });

      return this.getBuyerCollectionById(id);
    });

    return tx();
  }

  public getBuyerCollectionById(id: string): BuyerCollectionRecord {
    const r = this.db
      .prepare(
        `SELECT cr.*, p.party_code as buyer_code, p.name as buyer_name
         FROM collections_receipts cr
         JOIN parties p ON p.id = cr.buyer_id
         WHERE cr.id = ? OR cr.receipt_no = ?`
      )
      .get(id, id) as Record<string, unknown> | undefined;
    if (!r) {
      throw new Error(`Buyer Collection Receipt not found: ${id}`);
    }
    return {
      id: String(r.id),
      receiptNo: String(r.receipt_no),
      receiptDate: String(r.receipt_date),
      buyerId: String(r.buyer_id),
      buyerCode: String(r.buyer_code),
      buyerName: String(r.buyer_name),
      targetBillType: (r.target_bill_type as CollectionTargetBillType) || 'ON_ACCOUNT',
      targetBillId: r.target_bill_id ? String(r.target_bill_id) : null,
      targetBillNo: r.target_bill_no ? String(r.target_bill_no) : null,
      amountPaise: Number(r.amount_paise),
      discountAllowedPaise: Number(r.discount_allowed_paise),
      paymentMode: (r.payment_mode as BuyerCollectionRecord['paymentMode']) || 'CASH',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      referenceNo: String(r.reference_no || ''),
      billBalanceBeforePaise: Number(r.bill_balance_before_paise),
      billBalanceAfterPaise: Number(r.bill_balance_after_paise),
      journalEntryId: String(r.journal_entry_id),
      notes: String(r.notes || ''),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  public listBuyerCollections(buyerId?: string): BuyerCollectionRecord[] {
    let sql = `SELECT id FROM collections_receipts`;
    const params: unknown[] = [];
    if (buyerId) {
      sql += ` WHERE buyer_id = ?`;
      params.push(buyerId);
    }
    sql += ` ORDER BY receipt_date DESC, created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ id: string }>;
    return rows.map((r) => this.getBuyerCollectionById(r.id));
  }

  /**
   * Record Operational Expense, Chit Fund, Insurance, Govt Fee, or Owner Capital/Drawings (SRS Sec 13.1-13.7, DR-12).
   */
  public recordExpenseOrCommitment(params: {
    voucherDate?: string;
    category: ExpenseCommitmentCategory;
    accountingClassification?: ExpenseAccountingClassification;
    payeeName: string;
    partyId?: string | null;
    amountPaise: number;
    gstAmountPaise?: number;
    paymentMode?: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
    bankAccountId?: string | null;
    referenceNo?: string;
    description?: string;
    isRestrictedPersonal?: boolean;
    idempotencyKey?: string;
    actor: UserProfile;
  }): ExpenseCommitmentRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);

    const tx = this.db.transaction(() => {
      const voucherDate = (params.voucherDate || getTodayIST()).trim();
      this.assertDayOpenForPosting(voucherDate);

      const idemKey = (
        params.idempotencyKey ||
        `EXP-${params.category}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`
      ).trim();

      const existing = this.db
        .prepare('SELECT id FROM expenses_commitments WHERE idempotency_key = ?')
        .get(idemKey) as { id: string } | undefined;
      if (existing) {
        return this.getExpenseCommitmentById(existing.id);
      }

      const amountPaise = Math.round(Number(params.amountPaise || 0));
      const gstAmountPaise = Math.max(0, Math.round(Number(params.gstAmountPaise || 0)));
      const totalAmountPaise = amountPaise + gstAmountPaise;
      if (amountPaise <= 0) {
        throw new Error('Voucher base amount must be greater than ₹0.');
      }
      if (!params.payeeName || !params.payeeName.trim()) {
        throw new Error('Payee / Counterparty name is required.');
      }

      // Default accounting classification based on DR-12
      let classification: ExpenseAccountingClassification =
        params.accountingClassification || 'OPERATING_EXPENSE';
      if (!params.accountingClassification) {
        if (params.category === 'CHIT_FUND') {
          classification = 'ASSET_INVESTMENT';
        } else if (params.category === 'OWNER_DRAWING') {
          classification = 'OWNER_DRAWING';
        } else if (params.category === 'OWNER_CAPITAL') {
          classification = 'OWNER_CAPITAL';
        }
      }

      const isRestrictedPersonal =
        params.isRestrictedPersonal ??
        (params.category === 'INSURANCE_POLICY' ||
          params.category === 'OWNER_DRAWING' ||
          classification === 'OWNER_DRAWING');

      const id = `EXP-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const issuedVoucher = this.allocateDocumentNumber({
        docType: DocumentSeriesType.EXPENSE,
        referenceEntityId: id,
        transactionDate: voucherDate,
        idempotencyKey: `NUM-EX-${idemKey}`,
        actor: params.actor,
      });

      const paymentMode = params.paymentMode || 'CASH';
      const isCash = paymentMode === 'CASH';
      const cashOrBankAccountCode = isCash ? '1001' : '1002';

      const jeLines: JournalLineInput[] = [];
      if (classification === 'OWNER_CAPITAL') {
        // Capital Infusion: DR Cash/Bank, CR Owner Capital (3001)
        jeLines.push(
          {
            accountCode: cashOrBankAccountCode,
            bankAccountId: isCash ? null : params.bankAccountId || null,
            debitPaise: totalAmountPaise,
            creditPaise: 0,
            cashDirection: isCash ? 'CASH_IN' : 'BANK_IN',
            lineNote: `Owner Capital receipt ${issuedVoucher.formattedNumber} from ${params.payeeName.trim()}`,
          },
          {
            accountCode: '3001',
            partyId: params.partyId || null,
            debitPaise: 0,
            creditPaise: totalAmountPaise,
            cashDirection: 'NON_CASH',
            lineNote: `Owner Capital credited (${issuedVoucher.formattedNumber})`,
          }
        );
      } else {
        // Outflow: DR Target Account (5002 Expense, 3002 Drawings, or 1201 Investment/Advance), CR Cash/Bank
        const targetDrAccountCode =
          classification === 'OWNER_DRAWING'
            ? '3002'
            : classification === 'ASSET_INVESTMENT'
            ? '1201'
            : '5002';

        jeLines.push({
          accountCode: targetDrAccountCode,
          partyId: params.partyId || null,
          debitPaise: amountPaise,
          creditPaise: 0,
          cashDirection: 'NON_CASH',
          lineNote: `${params.category} (${classification}) — ${params.payeeName.trim()}`,
        });

        if (gstAmountPaise > 0) {
          jeLines.push({
            accountCode: '2101',
            debitPaise: gstAmountPaise,
            creditPaise: 0,
            cashDirection: 'NON_CASH',
            lineNote: `Input GST on ${issuedVoucher.formattedNumber}`,
          });
        }

        jeLines.push({
          accountCode: cashOrBankAccountCode,
          bankAccountId: isCash ? null : params.bankAccountId || null,
          debitPaise: 0,
          creditPaise: totalAmountPaise,
          cashDirection: isCash ? 'CASH_OUT' : 'BANK_OUT',
          lineNote: `Payment for ${issuedVoucher.formattedNumber} to ${params.payeeName.trim()}`,
        });
      }

      const je = this.postJournalEntry({
        transactionDate: voucherDate,
        sourceType: 'EXPENSE_COMMITMENT',
        sourceId: id,
        idempotencyKey: `JE-EXP-${idemKey}`,
        narration: `${issuedVoucher.formattedNumber} [${params.category}] — ${params.payeeName.trim()}: ${(
          params.description || ''
        ).trim()}`,
        lines: jeLines,
        actor: params.actor,
      });

      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO expenses_commitments (
            id, voucher_no, voucher_date, category, accounting_classification,
            payee_name, party_id, amount_paise, gst_amount_paise, total_amount_paise,
            payment_mode, bank_account_id, reference_no, description,
            is_restricted_personal, status, journal_entry_id, idempotency_key,
            created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?, ?, ?)`
        )
        .run(
          id,
          issuedVoucher.formattedNumber,
          voucherDate,
          params.category,
          classification,
          params.payeeName.trim(),
          params.partyId || null,
          amountPaise,
          gstAmountPaise,
          totalAmountPaise,
          paymentMode,
          params.bankAccountId || null,
          (params.referenceNo || '').trim(),
          (params.description || '').trim(),
          isRestrictedPersonal ? 1 : 0,
          je.id,
          idemKey,
          params.actor.fullName,
          nowIso
        );

      this.recordAuditLog({
        entityType: 'EXPENSE_COMMITMENT',
        entityId: id,
        action: 'CREATE_EXPENSE_VOUCHER',
        afterData: {
          voucherNo: issuedVoucher.formattedNumber,
          category: params.category,
          accountingClassification: classification,
          totalAmountPaise,
          isRestrictedPersonal,
        },
        reason: `Recorded ${params.category} voucher ${issuedVoucher.formattedNumber}`,
        actor: params.actor,
      });

      return this.getExpenseCommitmentById(id);
    });

    return tx();
  }

  public getExpenseCommitmentById(id: string): ExpenseCommitmentRecord {
    const r = this.db
      .prepare('SELECT * FROM expenses_commitments WHERE id = ? OR voucher_no = ?')
      .get(id, id) as Record<string, unknown> | undefined;
    if (!r) {
      throw new Error(`Expense/Commitment voucher not found: ${id}`);
    }
    return {
      id: String(r.id),
      voucherNo: String(r.voucher_no),
      voucherDate: String(r.voucher_date),
      category: r.category as ExpenseCommitmentCategory,
      accountingClassification: r.accounting_classification as ExpenseAccountingClassification,
      payeeName: String(r.payee_name),
      partyId: r.party_id ? String(r.party_id) : null,
      amountPaise: Number(r.amount_paise),
      gstAmountPaise: Number(r.gst_amount_paise),
      totalAmountPaise: Number(r.total_amount_paise),
      paymentMode: (r.payment_mode as ExpenseCommitmentRecord['paymentMode']) || 'CASH',
      bankAccountId: r.bank_account_id ? String(r.bank_account_id) : null,
      referenceNo: String(r.reference_no || ''),
      description: String(r.description || ''),
      isRestrictedPersonal: Boolean(r.is_restricted_personal),
      status: (r.status as 'FINALIZED' | 'REVERSED') || 'FINALIZED',
      reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
      reversalJournalEntryId: r.reversal_journal_entry_id
        ? String(r.reversal_journal_entry_id)
        : null,
      journalEntryId: String(r.journal_entry_id),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  public listExpensesAndCommitments(actor?: UserProfile): ExpenseCommitmentRecord[] {
    const rows = this.db
      .prepare('SELECT id FROM expenses_commitments ORDER BY voucher_date DESC, created_at DESC')
      .all() as Array<{ id: string }>;
    const all = rows.map((r) => this.getExpenseCommitmentById(r.id));

    // Privacy restriction: Personal Insurance & Owner Drawings hidden from general staff unless Owner/Accountant
    const isPrivileged =
      actor &&
      (actor.role === UserRole.OWNER ||
        actor.role === UserRole.ACCOUNTANT ||
        actor.permissions.includes(PermissionKey.VIEW_SENSITIVE_KYC));
    if (!isPrivileged) {
      return all.filter((item) => !item.isRestrictedPersonal);
    }
    return all;
  }

  /**
   * Aggregated Sales, Purchase, Dalali & GST Register (SRS Sec 14.1, 14.3).
   */
  public getGstSalesPurchaseRegisters(params?: {
    fromDate?: string;
    toDate?: string;
  }): GstSalesPurchaseRegisterRow[] {
    const rows: GstSalesPurchaseRegisterRow[] = [];

    for (const bill of this.listCashCreditBills()) {
      if (params?.fromDate && bill.billDate < params.fromDate) continue;
      if (params?.toDate && bill.billDate > params.toDate) continue;
      rows.push({
        id: bill.id,
        registerType: 'SALES',
        documentType: bill.billKind === 'CASH_BILL' ? 'Cash Bill' : 'Credit Bill',
        documentNo: bill.billNo,
        documentDate: bill.billDate,
        partyName: bill.buyerName,
        partyGstin: bill.buyerGstin,
        totalBags: bill.totalBags,
        totalNetWeightGrams: bill.totalNetWeightGrams,
        taxableOrBaseAmountPaise: bill.totalBaseAmountPaise,
        cgstPaise: bill.totalCgstPaise,
        sgstPaise: bill.totalSgstPaise,
        igstPaise: bill.totalIgstPaise,
        totalGstPaise: bill.totalGstPaise,
        mandiOrRmcFeePaise: bill.rmcFeePaise,
        commissionPaise: bill.commissionPaise,
        netDocumentAmountPaise: bill.netBillAmountPaise,
        status: bill.status,
      });
    }

    for (const kp of this.listKharidiPattis()) {
      if (params?.fromDate && kp.invoiceDate < params.fromDate) continue;
      if (params?.toDate && kp.invoiceDate > params.toDate) continue;

      let kpCgst = 0;
      let kpSgst = 0;
      let kpIgst = 0;
      for (const it of kp.items) {
        if (!it.gstApplicable) continue;
        const totalBps = (it.cgstRateBps || 0) + (it.sgstRateBps || 0) + (it.igstRateBps || 0);
        if (totalBps > 0) {
          kpCgst += Math.round((it.gstAmountPaise * (it.cgstRateBps || 0)) / totalBps);
          kpSgst += Math.round((it.gstAmountPaise * (it.sgstRateBps || 0)) / totalBps);
          kpIgst += it.gstAmountPaise - Math.round((it.gstAmountPaise * (it.cgstRateBps || 0)) / totalBps) - Math.round((it.gstAmountPaise * (it.sgstRateBps || 0)) / totalBps);
        }
      }

      rows.push({
        id: kp.id,
        registerType: 'SALES',
        documentType: 'Kharidi Patti (Buyer)',
        documentNo: kp.invoiceNo,
        documentDate: kp.invoiceDate,
        partyName: kp.buyerName,
        partyGstin: kp.buyerGstin,
        totalBags: kp.totalBags,
        totalNetWeightGrams: kp.totalNetWeightGrams,
        taxableOrBaseAmountPaise: kp.totalBaseAmountPaise,
        cgstPaise: kpCgst,
        sgstPaise: kpSgst,
        igstPaise: kpIgst,
        totalGstPaise: kp.totalGstPaise,
        mandiOrRmcFeePaise: kp.buyerMarketFeePaise,
        commissionPaise: kp.buyerCommissionPaise,
        netDocumentAmountPaise: kp.netReceivablePaise,
        status: 'FINALIZED',
      });
    }

    for (const fp of this.listFarmerPattis()) {
      if (params?.fromDate && fp.pattiDate < params.fromDate) continue;
      if (params?.toDate && fp.pattiDate > params.toDate) continue;
      rows.push({
        id: fp.id,
        registerType: fp.ownershipMode === 'SGT_OWNED' ? 'PURCHASE' : 'DALALI_AGENCY',
        documentType: 'Farmer Patti',
        documentNo: fp.pattiNo,
        documentDate: fp.pattiDate,
        partyName: fp.farmerName,
        partyGstin: '',
        totalBags: fp.totalBags,
        totalNetWeightGrams: fp.totalNetWeightGrams,
        taxableOrBaseAmountPaise: fp.grossCropAmountPaise,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        totalGstPaise: 0,
        mandiOrRmcFeePaise: fp.mandiFeePaise,
        commissionPaise: fp.commissionAmountPaise,
        netDocumentAmountPaise: fp.netPayablePaise,
        status: 'FINALIZED',
      });
    }

    for (const dkp of this.listDalaliKharidiPattis()) {
      if (params?.fromDate && dkp.pattiDate < params.fromDate) continue;
      if (params?.toDate && dkp.pattiDate > params.toDate) continue;

      let dkpCgst = 0;
      let dkpSgst = 0;
      let dkpIgst = 0;
      for (const it of dkp.items) {
        if (!it.gstApplicable) continue;
        const totalBps = (it.cgstRateBps || 0) + (it.sgstRateBps || 0) + (it.igstRateBps || 0);
        if (totalBps > 0) {
          dkpCgst += Math.round((it.gstAmountPaise * (it.cgstRateBps || 0)) / totalBps);
          dkpSgst += Math.round((it.gstAmountPaise * (it.sgstRateBps || 0)) / totalBps);
          dkpIgst += it.gstAmountPaise - Math.round((it.gstAmountPaise * (it.cgstRateBps || 0)) / totalBps) - Math.round((it.gstAmountPaise * (it.sgstRateBps || 0)) / totalBps);
        }
      }

      rows.push({
        id: dkp.id,
        registerType: 'DALALI_AGENCY',
        documentType: 'Dalali Kharidi Patti',
        documentNo: dkp.pattiNo,
        documentDate: dkp.pattiDate,
        partyName: dkp.buyerName,
        partyGstin: dkp.buyerGstin,
        totalBags: dkp.totalBags,
        totalNetWeightGrams: dkp.totalNetWeightGrams,
        taxableOrBaseAmountPaise: dkp.totalBaseAmountPaise,
        cgstPaise: dkpCgst,
        sgstPaise: dkpSgst,
        igstPaise: dkpIgst,
        totalGstPaise: dkp.totalGstPaise,
        mandiOrRmcFeePaise: dkp.rmcFeePaise,
        commissionPaise: dkp.commissionAmountPaise,
        netDocumentAmountPaise: dkp.netReceivablePaise,
        status: dkp.status,
      });
    }

    return rows.sort((a, b) => b.documentDate.localeCompare(a.documentDate));
  }

  // ==========================================================================
  // CHUNK 8: DAY-END CLOSE, VALIDATION ENGINE & SMS OUTBOX SIMULATOR
  // ==========================================================================

  public getDayCloseStatus(businessDate = getTodayIST()): DayCloseRecord {
    const cleanDate = businessDate.trim();
    const existing = this.db
      .prepare('SELECT * FROM day_closes WHERE business_date = ?')
      .get(cleanDate) as Record<string, unknown> | undefined;

    // Compute live cash & journal totals for this businessDate
    const priorCashRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(jl.debit_paise), 0) as dr,
           COALESCE(SUM(jl.credit_paise), 0) as cr
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_code = '1001' AND je.transaction_date < ?`
      )
      .get(cleanDate) as { dr: number; cr: number };

    const dayCashRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(jl.debit_paise), 0) as cash_in,
           COALESCE(SUM(jl.credit_paise), 0) as cash_out
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_code = '1001' AND je.transaction_date = ?`
      )
      .get(cleanDate) as { cash_in: number; cash_out: number };

    const dayTotalsRow = this.db
      .prepare(
        `SELECT
           COUNT(*) as cnt,
           COALESCE(SUM(total_debit_paise), 0) as total_dr,
           COALESCE(SUM(total_credit_paise), 0) as total_cr
         FROM journal_entries
         WHERE transaction_date = ?`
      )
      .get(cleanDate) as { cnt: number; total_dr: number; total_cr: number };

    const cashOpeningPaise = Number(priorCashRow.dr || 0) - Number(priorCashRow.cr || 0);
    const cashInPaise = Number(dayCashRow.cash_in || 0);
    const cashOutPaise = Number(dayCashRow.cash_out || 0);
    const cashClosingPaise = cashOpeningPaise + cashInPaise - cashOutPaise;

    if (!existing) {
      return {
        businessDate: cleanDate,
        status: 'OPEN',
        cashOpeningPaise,
        cashInPaise,
        cashOutPaise,
        cashClosingPaise,
        physicalCashCountedPaise: cashClosingPaise,
        cashVariancePaise: 0,
        totalDebitPaise: Number(dayTotalsRow.total_dr || 0),
        totalCreditPaise: Number(dayTotalsRow.total_cr || 0),
        journalEntryCount: Number(dayTotalsRow.cnt || 0),
        closedBy: null,
        closedAt: null,
        reopenedBy: null,
        reopenedAt: null,
        reopenReason: null,
        notes: '',
      };
    }

    return {
      businessDate: String(existing.business_date),
      status: (existing.status as DayCloseRecord['status']) || 'CLOSED',
      cashOpeningPaise: Number(existing.cash_opening_paise),
      cashInPaise: Number(existing.cash_in_paise),
      cashOutPaise: Number(existing.cash_out_paise),
      cashClosingPaise: Number(existing.cash_closing_paise),
      physicalCashCountedPaise: Number(existing.physical_cash_counted_paise),
      cashVariancePaise: Number(existing.cash_variance_paise),
      totalDebitPaise: Number(existing.total_debit_paise),
      totalCreditPaise: Number(existing.total_credit_paise),
      journalEntryCount: Number(existing.journal_entry_count),
      closedBy: existing.closed_by ? String(existing.closed_by) : null,
      closedAt: existing.closed_at ? String(existing.closed_at) : null,
      reopenedBy: existing.reopened_by ? String(existing.reopened_by) : null,
      reopenedAt: existing.reopened_at ? String(existing.reopened_at) : null,
      reopenReason: existing.reopen_reason ? String(existing.reopen_reason) : null,
      notes: String(existing.notes || ''),
    };
  }

  public listDayCloses(): DayCloseRecord[] {
    const rows = this.db
      .prepare('SELECT business_date FROM day_closes ORDER BY business_date DESC')
      .all() as Array<{ business_date: string }>;
    return rows.map((r) => this.getDayCloseStatus(r.business_date));
  }

  /**
   * Formal Day-End Close (SRS Sec 11.3, 11.4, AT-15).
   * Verifies balanced journal postings, snapshots cash/accounting totals, and locks the date.
   */
  public closeBusinessDay(params: {
    businessDate?: string;
    physicalCashCountedPaise?: number;
    notes?: string;
    actor: UserProfile;
  }): DayCloseRecord {
    this.requirePermission(params.actor, PermissionKey.MANAGE_CASH_BANK);

    const tx = this.db.transaction(() => {
      const cleanDate = (params.businessDate || getTodayIST()).trim();
      const preview = this.getDayCloseStatus(cleanDate);

      if (preview.totalDebitPaise !== preview.totalCreditPaise) {
        throw new Error(
          `UNBALANCED_DAY: Cannot close ${cleanDate} because Total Debit (${preview.totalDebitPaise}) != Total Credit (${preview.totalCreditPaise}).`
        );
      }

      const physicalCash =
        params.physicalCashCountedPaise !== undefined
          ? Math.round(Number(params.physicalCashCountedPaise))
          : preview.cashClosingPaise;
      const variancePaise = physicalCash - preview.cashClosingPaise;
      const nowIso = new Date().toISOString();

      this.db
        .prepare(
          `INSERT INTO day_closes (
            business_date, status, cash_opening_paise, cash_in_paise, cash_out_paise,
            cash_closing_paise, physical_cash_counted_paise, cash_variance_paise,
            total_debit_paise, total_credit_paise, journal_entry_count,
            closed_by, closed_at, notes
          ) VALUES (?, 'CLOSED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date) DO UPDATE SET
            status = 'CLOSED',
            cash_opening_paise = excluded.cash_opening_paise,
            cash_in_paise = excluded.cash_in_paise,
            cash_out_paise = excluded.cash_out_paise,
            cash_closing_paise = excluded.cash_closing_paise,
            physical_cash_counted_paise = excluded.physical_cash_counted_paise,
            cash_variance_paise = excluded.cash_variance_paise,
            total_debit_paise = excluded.total_debit_paise,
            total_credit_paise = excluded.total_credit_paise,
            journal_entry_count = excluded.journal_entry_count,
            closed_by = excluded.closed_by,
            closed_at = excluded.closed_at,
            notes = excluded.notes`
        )
        .run(
          cleanDate,
          preview.cashOpeningPaise,
          preview.cashInPaise,
          preview.cashOutPaise,
          preview.cashClosingPaise,
          physicalCash,
          variancePaise,
          preview.totalDebitPaise,
          preview.totalCreditPaise,
          preview.journalEntryCount,
          params.actor.fullName,
          nowIso,
          (params.notes || '').trim()
        );

      this.recordAuditLog({
        entityType: 'DAY_CLOSE',
        entityId: cleanDate,
        action: 'CLOSE_BUSINESS_DAY',
        afterData: {
          businessDate: cleanDate,
          status: 'CLOSED',
          cashClosingPaise: preview.cashClosingPaise,
          physicalCashCountedPaise: physicalCash,
          cashVariancePaise: variancePaise,
          totalDebitPaise: preview.totalDebitPaise,
        },
        reason: (params.notes || `Closed business day ${cleanDate}`).trim(),
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getDayCloseStatus(cleanDate);
    });

    return tx();
  }

  /**
   * Authorized Reopen of a Closed Business Day (SRS Sec 11.4, AT-15).
   * Strictly requires PermissionKey.REOPEN_CLOSED_DAY and a mandatory audit reason.
   */
  public reopenBusinessDay(params: {
    businessDate: string;
    reopenReason: string;
    actor: UserProfile;
  }): DayCloseRecord {
    this.requirePermission(params.actor, PermissionKey.REOPEN_CLOSED_DAY);
    const reason = (params.reopenReason || '').trim();
    if (reason.length < 4) {
      throw new Error('A clear audit reason (min 4 characters) is mandatory to reopen a closed business day.');
    }

    const tx = this.db.transaction(() => {
      const cleanDate = params.businessDate.trim();
      const existing = this.getDayCloseStatus(cleanDate);
      if (existing.status !== 'CLOSED') {
        throw new Error(`Business day ${cleanDate} is not currently in CLOSED state.`);
      }

      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE day_closes
           SET status = 'REOPENED',
               reopened_by = ?,
               reopened_at = ?,
               reopen_reason = ?
           WHERE business_date = ?`
        )
        .run(params.actor.fullName, nowIso, reason, cleanDate);

      this.recordAuditLog({
        entityType: 'DAY_CLOSE',
        entityId: cleanDate,
        action: 'REOPEN_BUSINESS_DAY',
        beforeData: { businessDate: cleanDate, status: 'CLOSED' },
        afterData: {
          businessDate: cleanDate,
          status: 'REOPENED',
          reopenedBy: params.actor.fullName,
          reopenReason: reason,
        },
        reason,
        approvedBy: params.actor.fullName,
        actor: params.actor,
      });

      return this.getDayCloseStatus(cleanDate);
    });

    return tx();
  }

  /**
   * Automatic Error & Mismatch Detection Engine (SRS Sec 17.1 & 17.2).
   */
  public getValidationIssues(): ValidationIssueRecord[] {
    const issues: ValidationIssueRecord[] = [];
    const khata = this.getCompanyKhataBook();

    if (khata.summary.totalAccountingDebitPaise !== khata.summary.totalAccountingCreditPaise) {
      issues.push({
        id: 'VAL-TB-MISMATCH',
        severity: 'CRITICAL',
        ruleCode: 'TRIAL_BALANCE_DRIFT',
        title: 'Trial Balance Debit/Credit Mismatch',
        description: `Total Debits (${khata.summary.totalAccountingDebitPaise} paise) do not match Total Credits (${khata.summary.totalAccountingCreditPaise} paise).`,
        suggestedAction: 'Inspect journal entries in the Khata Book for manual overrides.',
      });
    }

    for (const st of this.listCommodityStockStatus()) {
      const thresholdQuintals = st.commodity.lowStockThresholdQuintals ?? 0;
      if (st.closingOwnedWeightGrams < 0 || st.closingOwnedBags < 0) {
        issues.push({
          id: `VAL-NEG-STOCK-${st.commodity.id}`,
          severity: 'HIGH',
          ruleCode: 'NEGATIVE_OWNED_STOCK',
          title: `Negative Owned Stock: ${st.commodity.nameEn}`,
          description: `${st.commodity.nameEn} has ${st.closingOwnedBags} bags (${st.closingOwnedWeightQuintals} Q).`,
          suggestedAction: 'Record missing Goods In purchase or Stock Adjustment voucher.',
        });
      } else if (
        thresholdQuintals > 0 &&
        st.closingOwnedWeightQuintals < thresholdQuintals
      ) {
        issues.push({
          id: `VAL-LOW-STOCK-${st.commodity.id}`,
          severity: 'LOW',
          ruleCode: 'LOW_STOCK_THRESHOLD',
          title: `Low Stock Alert: ${st.commodity.nameEn}`,
          description: `Current stock (${st.closingOwnedWeightQuintals} Q) is below threshold (${thresholdQuintals} Q).`,
          suggestedAction: 'Replenish inventory or review threshold in Commodity Master.',
        });
      }
    }

    const pendingCheques = this.listCheques().filter((c) => c.status === 'PENDING');
    if (pendingCheques.length > 0) {
      issues.push({
        id: 'VAL-PENDING-CHEQUES',
        severity: 'MEDIUM',
        ruleCode: 'UNCLEARED_CHEQUES',
        title: `${pendingCheques.length} Pending Cheque(s) Awaiting Bank Clearance`,
        description: `Pending cheques are held outside cleared bank balance until marked CLEARED or BOUNCED.`,
        suggestedAction: 'Review Cheque Register and reconcile with bank statement.',
      });
    }

    return issues;
  }

  /**
   * Pluggable SMS Outbox Simulator with Failure Isolation & Idempotent Retry (SRS Sec 16.3, AT-12).
   * Never rolls back a financial transaction if SMS gateway fails; retries never duplicate ledger entries.
   */
  public sendOrQueueSmsNotification(params: {
    idempotencyKey?: string;
    eventType: SmsOutboxRecord['eventType'];
    recipientPhone: string;
    recipientName: string;
    language?: 'en' | 'kn';
    messageBody: string;
    sourceDocNo: string;
    simulateProviderFailure?: boolean;
    actor: UserProfile;
  }): SmsOutboxRecord {
    const idemKey = (
      params.idempotencyKey ||
      `SMS-${params.eventType}-${params.sourceDocNo}-${params.recipientPhone}`
    ).trim();

    const existing = this.db
      .prepare('SELECT id FROM sms_logs WHERE idempotency_key = ?')
      .get(idemKey) as { id: string } | undefined;
    if (existing) {
      return this.getSmsLogById(existing.id);
    }

    const id = `SMS-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const failed = Boolean(params.simulateProviderFailure);
    const status = failed ? 'FAILED' : 'SENT';
    const lastError = failed ? 'SIMULATED_GATEWAY_TIMEOUT: Provider unreachable' : null;
    const sentAt = failed ? null : nowIso;

    this.db
      .prepare(
        `INSERT INTO sms_logs (
          id, idempotency_key, event_type, recipient_phone, recipient_name,
          language, message_body, source_doc_no, status, retry_count,
          last_error, sent_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        id,
        idemKey,
        params.eventType,
        params.recipientPhone.trim(),
        params.recipientName.trim(),
        params.language || 'en',
        params.messageBody.trim(),
        params.sourceDocNo.trim(),
        status,
        lastError,
        sentAt,
        nowIso
      );

    return this.getSmsLogById(id);
  }

  public retrySmsNotification(params: { smsId: string; actor: UserProfile }): SmsOutboxRecord {
    const existing = this.getSmsLogById(params.smsId);
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sms_logs
         SET status = 'SENT',
             retry_count = retry_count + 1,
             last_error = NULL,
             sent_at = ?
         WHERE id = ?`
      )
      .run(nowIso, existing.id);

    this.recordAuditLog({
      entityType: 'SMS_OUTBOX',
      entityId: existing.id,
      action: 'RETRY_SMS_NOTIFICATION',
      beforeData: { status: existing.status, retryCount: existing.retryCount },
      afterData: { status: 'SENT', retryCount: existing.retryCount + 1 },
      reason: `Retried SMS delivery for ${existing.sourceDocNo} without touching accounting ledgers`,
      actor: params.actor,
    });

    return this.getSmsLogById(existing.id);
  }

  public getSmsLogById(id: string): SmsOutboxRecord {
    const r = this.db
      .prepare('SELECT * FROM sms_logs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!r) {
      throw new Error(`SMS Log not found: ${id}`);
    }
    return {
      id: String(r.id),
      idempotencyKey: String(r.idempotency_key),
      eventType: r.event_type as SmsOutboxRecord['eventType'],
      recipientPhone: String(r.recipient_phone),
      recipientName: String(r.recipient_name),
      language: (r.language as 'en' | 'kn') || 'en',
      messageBody: String(r.message_body),
      sourceDocNo: String(r.source_doc_no || ''),
      status: (r.status as SmsOutboxRecord['status']) || 'SENT',
      retryCount: Number(r.retry_count || 0),
      lastError: r.last_error ? String(r.last_error) : null,
      sentAt: r.sent_at ? String(r.sent_at) : null,
      createdAt: String(r.created_at),
    };
  }

  public listSmsOutbox(): SmsOutboxRecord[] {
    const rows = this.db
      .prepare('SELECT id FROM sms_logs ORDER BY created_at DESC')
      .all() as Array<{ id: string }>;
    return rows.map((r) => this.getSmsLogById(r.id));
  }

  // ==========================================================================
  // CHUNK 9: COMPREHENSIVE FINANCIAL REPORTS & BACKUP/RESTORE VERIFIER (AT-18)
  // ==========================================================================

  public getComprehensiveFinancialReport(asOfDate = getTodayIST()): ComprehensiveFinancialReport {
    const khata = this.getCompanyKhataBook({ toDate: asOfDate });
    const stockStatuses = this.listCommodityStockStatus(asOfDate);

    const tbLines: TrialBalanceLine[] = khata.accounts.map((acc) => {
      const dr = acc.totalDebitPaise || 0;
      const cr = acc.totalCreditPaise || 0;
      const diff = dr - cr;
      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountNameEn: acc.nameEn,
        accountNameKn: acc.nameKn,
        accountType: acc.accountType,
        debitPaise: dr,
        creditPaise: cr,
        netBalancePaise: Math.abs(diff),
        balanceDirection: diff > 0 ? 'DR' : diff < 0 ? 'CR' : 'ZERO',
      };
    });

    const totalDebitPaise = tbLines.reduce((sum, l) => sum + l.debitPaise, 0);
    const totalCreditPaise = tbLines.reduce((sum, l) => sum + l.creditPaise, 0);

    const findAccDiff = (code: string) => {
      const a = khata.accounts.find((x) => x.code === code);
      if (!a) return 0;
      return (a.totalDebitPaise || 0) - (a.totalCreditPaise || 0);
    };

    // Income accounts have credit balances (cr - dr)
    const commoditySalesPaise = Math.max(0, -findAccDiff('4001'));
    const dalaliCommissionPaise = Math.max(0, -findAccDiff('4002'));
    const loanInterestIncomePaise = Math.max(0, -findAccDiff('4003'));
    const hamaliAndFeeRecoveryPaise = Math.max(0, -findAccDiff('4004'));
    const closingInventoryValuePaise = stockStatuses.reduce(
      (sum, s) => sum + Math.max(0, s.closingStockValuationPaise),
      0
    );

    const commodityPurchasesPaise = Math.max(0, findAccDiff('5001'));
    const operatingExpensesPaise = Math.max(0, findAccDiff('5002'));

    const totalRevenueAndCreditsPaise =
      commoditySalesPaise +
      dalaliCommissionPaise +
      loanInterestIncomePaise +
      hamaliAndFeeRecoveryPaise +
      closingInventoryValuePaise;

    const totalExpensesAndDebitsPaise = commodityPurchasesPaise + operatingExpensesPaise;
    const netProfitOrLossPaise = totalRevenueAndCreditsPaise - totalExpensesAndDebitsPaise;

    const cashInHandPaise = Math.max(0, findAccDiff('1001'));
    const bankBalancesPaise = Math.max(0, findAccDiff('1002'));
    const loanPrincipalReceivablePaise = Math.max(0, findAccDiff('1201'));
    const loanInterestReceivablePaise = Math.max(0, findAccDiff('1202'));
    const buyerTradeReceivablesPaise = Math.max(0, findAccDiff('1102'));
    const farmerTradePayablesPaise = Math.max(0, -findAccDiff('1101'));
    const supplierPayablesPaise = Math.max(0, -findAccDiff('2001'));
    const gstAndTaxPayablesPaise = Math.max(0, -findAccDiff('2101'));
    const ownerCapitalNetPaise = Math.max(
      0,
      -findAccDiff('3001') - Math.max(0, findAccDiff('3002')) - findAccDiff('3099')
    );

    const totalAssetsPaise =
      cashInHandPaise +
      bankBalancesPaise +
      closingInventoryValuePaise +
      loanPrincipalReceivablePaise +
      loanInterestReceivablePaise +
      buyerTradeReceivablesPaise;

    const totalLiabilitiesAndEquityPaise =
      farmerTradePayablesPaise +
      supplierPayablesPaise +
      gstAndTaxPayablesPaise +
      ownerCapitalNetPaise +
      netProfitOrLossPaise;

    return {
      generatedAt: new Date().toISOString(),
      asOfDate,
      trialBalance: {
        lines: tbLines,
        totalDebitPaise,
        totalCreditPaise,
        isBalanced: totalDebitPaise === totalCreditPaise,
      },
      profitAndLoss: {
        commoditySalesPaise,
        dalaliCommissionPaise,
        loanInterestIncomePaise,
        hamaliAndFeeRecoveryPaise,
        closingInventoryValuePaise,
        totalRevenueAndCreditsPaise,
        commodityPurchasesPaise,
        operatingExpensesPaise,
        totalExpensesAndDebitsPaise,
        netProfitOrLossPaise,
      },
      balanceSheet: {
        cashInHandPaise,
        bankBalancesPaise,
        closingInventoryAssetPaise: closingInventoryValuePaise,
        loanPrincipalReceivablePaise,
        loanInterestReceivablePaise,
        buyerTradeReceivablesPaise,
        chitAndOtherInvestmentsPaise: 0,
        totalAssetsPaise,
        farmerTradePayablesPaise,
        supplierPayablesPaise,
        gstAndTaxPayablesPaise,
        ownerCapitalNetPaise,
        retainedNetProfitPaise: netProfitOrLossPaise,
        totalLiabilitiesAndEquityPaise,
      },
      gstAndTaxRegister: this.getGstSalesPurchaseRegisters({ toDate: asOfDate }),
    };
  }

  private backupHmacSecret: string | null = null;

  private getBackupHmacSecret(): string {
    if (process.env.SGT_BACKUP_SECRET) {
      return process.env.SGT_BACKUP_SECRET;
    }
    if (!this.backupHmacSecret) {
      this.backupHmacSecret = crypto.randomBytes(32).toString('hex');
    }
    return this.backupHmacSecret;
  }

  private computeBackupChecksum(serializedPayload: string): string {
    return crypto
      .createHmac('sha256', this.getBackupHmacSecret())
      .update(serializedPayload)
      .digest('hex');
  }

  /**
   * Generate a Checksummed Database Backup Snapshot & Verify Restore Integrity (SRS Sec 18.3, AT-18).
   */
  public createSystemBackupSnapshot(actor: UserProfile): SystemBackupSnapshot {
    this.requirePermission(actor, PermissionKey.EXPORT_SENSITIVE_DATA);

    const tablesToExport = [
      'company_settings',
      'number_series',
      'parties',
      'commodities',
      'accounts',
      'journal_entries',
      'journal_lines',
      'bank_accounts',
      'cheques',
      'loans',
      'loan_transactions',
      'farmer_pattis',
      'kharidi_pattis',
      'dalali_vikri_pattis',
      'dalali_kharidi_pattis',
      'cash_credit_bills',
      'collections_receipts',
      'expenses_commitments',
      'day_closes',
      'sms_logs',
      'audit_logs',
    ];

    const payload: Record<string, unknown[]> = {};
    const tableCounts: Record<string, number> = {};

    for (const table of tablesToExport) {
      const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (table === 'parties') {
        payload[table] = rows.map((p) => ({
          ...p,
          bank_account_no_raw: maskSensitiveValue(String(p.bank_account_no_raw || ''), 4),
          id_proof_no_raw: maskSensitiveValue(String(p.id_proof_no_raw || ''), 4),
          signature_data_url: p.signature_data_url ? '[PROTECTED_SIGNATURE_DATA]' : null,
        }));
      } else {
        payload[table] = rows;
      }
      tableCounts[table] = rows.length;
    }

    const khata = this.getCompanyKhataBook({ actor });
    const serializedPayload = JSON.stringify(payload);
    const checksumSha256 = this.computeBackupChecksum(serializedPayload);

    this.recordAuditLog({
      entityType: 'SYSTEM_BACKUP',
      entityId: `BKP-${Date.now()}`,
      action: 'CREATE_BACKUP_SNAPSHOT',
      afterData: {
        checksumSha256,
        tableCounts,
        trialBalanceVerified:
          khata.summary.totalAccountingDebitPaise === khata.summary.totalAccountingCreditPaise,
      },
      reason: 'Exported full SGT database backup snapshot',
      approvedBy: actor.fullName,
      actor,
    });

    return {
      formatVersion: 'SGT-BACKUP-V1',
      createdAt: new Date().toISOString(),
      createdBy: actor.fullName,
      checksumSha256,
      tableCounts,
      trialBalanceVerified:
        khata.summary.totalAccountingDebitPaise === khata.summary.totalAccountingCreditPaise,
      totalAccountingDebitPaise: khata.summary.totalAccountingDebitPaise,
      totalAccountingCreditPaise: khata.summary.totalAccountingCreditPaise,
      payload,
    };
  }

  public verifyBackupSnapshotIntegrity(params: {
    snapshot: SystemBackupSnapshot;
    actor: UserProfile;
  }): {
    valid: boolean;
    checksumMatches: boolean;
    trialBalanceVerified: boolean;
    verifiedTableCount: number;
    totalRecordsVerified: number;
  } {
    this.requirePermission(params.actor, PermissionKey.EXPORT_SENSITIVE_DATA);
    const snap = params.snapshot;
    if (!snap || !snap.payload || typeof snap.payload !== 'object') {
      throw new Error('Invalid backup snapshot structure.');
    }

    const payloadStr = JSON.stringify(snap.payload);
    const expectedHmac = this.computeBackupChecksum(payloadStr);
    const isChecksumValidHex =
      typeof snap.checksumSha256 === 'string' &&
      /^[0-9a-f]{64}$/i.test(snap.checksumSha256);
    const checksumMatches =
      isChecksumValidHex &&
      crypto.timingSafeEqual(
        Buffer.from(expectedHmac, 'hex'),
        Buffer.from(snap.checksumSha256, 'hex')
      );

    const jeLines = (snap.payload.journal_lines || []) as Array<Record<string, unknown>>;
    let dr = 0;
    let cr = 0;
    for (const l of jeLines) {
      dr += Number(l.debit_paise || 0);
      cr += Number(l.credit_paise || 0);
    }
    const trialBalanceVerified = dr === cr;

    const tableKeys = Object.keys(snap.payload);
    const totalRecordsVerified = tableKeys.reduce(
      (sum, k) => sum + (Array.isArray(snap.payload[k]) ? snap.payload[k].length : 0),
      0
    );

    return {
      valid: checksumMatches && trialBalanceVerified,
      checksumMatches,
      trialBalanceVerified,
      verifiedTableCount: tableKeys.length,
      totalRecordsVerified,
    };
  }
}



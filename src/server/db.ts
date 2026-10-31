import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DayCountConvention,
  DocumentSeriesType,
  InterestMethod,
  PermissionKey,
  RateUnit,
  RepaymentAllocationOrder,
  RoundingMode,
  UserProfile,
  UserRole,
} from '../shared/types';

export function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getCurrentIndianFinancialYear(dateStr = getTodayIST()): {
  fyCode: string;
  startDate: string;
  endDate: string;
} {
  const [yStr, mStr] = dateStr.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const fyCode = `${startYear}-${String(endYear).slice(-2)}`;
  return {
    fyCode,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  };
}

export function hashPassword(password: string, salt?: string): string {
  const resolvedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, resolvedSalt, 32).toString('hex');
  return `${resolvedSalt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  [UserRole.OWNER]: Object.values(PermissionKey),
  [UserRole.ACCOUNTANT]: [
    PermissionKey.MANAGE_RATES_AND_POLICIES,
    PermissionKey.VIEW_SENSITIVE_KYC,
    PermissionKey.CREATE_TRADING_BILLS,
    PermissionKey.MANAGE_LOANS,
    PermissionKey.MANAGE_CASH_BANK,
    PermissionKey.APPROVE_CORRECTIONS,
    PermissionKey.REOPEN_CLOSED_DAY,
    PermissionKey.VIEW_REPORTS_AND_AUDIT,
    PermissionKey.EXPORT_SENSITIVE_DATA,
  ],
  [UserRole.TRADING_STAFF]: [
    PermissionKey.CREATE_TRADING_BILLS,
    PermissionKey.VIEW_REPORTS_AND_AUDIT,
  ],
  [UserRole.CASHIER]: [
    PermissionKey.MANAGE_CASH_BANK,
    PermissionKey.VIEW_REPORTS_AND_AUDIT,
  ],
  [UserRole.AUDITOR]: [
    PermissionKey.VIEW_REPORTS_AND_AUDIT,
  ],
};

/**
 * Fallback system principal used only when the `users` table has 0 rows (e.g., immediately
 * after running the production purge migration before the first real staff account is created).
 */
export function getBootstrapSystemActor(): UserProfile {
  return {
    id: 'SYSTEM-BOOTSTRAP',
    username: 'system',
    fullName: 'Initial Production Setup (No Staff Created Yet)',
    role: UserRole.OWNER,
    permissions: Object.values(PermissionKey),
    canViewSensitiveKyc: true,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function createDatabase(dbFilePath?: string): Database.Database {
  let resolvedPath =
    dbFilePath ?? process.env.SGT_DB_PATH ?? path.resolve(process.cwd(), 'sgt_database.sqlite');

  if (resolvedPath !== ':memory:') {
    try {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (fsErr) {
      // If root/mount path (/var/data) has permission restrictions without an attached volume,
      // fallback safely to local working directory to keep application online
      console.warn(`Warning: Could not create directory for ${resolvedPath} (${fsErr}). Falling back to local database.`);
      resolvedPath = path.resolve(process.cwd(), 'sgt_database.sqlite');
    }
  }

  let db: Database.Database;
  try {
    db = new Database(resolvedPath);
  } catch (dbErr) {
    console.warn(`Warning: Could not open database at ${resolvedPath} (${dbErr}). Falling back to local database.`);
    resolvedPath = path.resolve(process.cwd(), 'sgt_database.sqlite');
    db = new Database(resolvedPath);
  }

  if (resolvedPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  initializeSchemaAndBaseline(db);
  return db;
}

function initializeSchemaAndBaseline(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      summary_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      can_view_sensitive_kyc INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_login_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      legal_name TEXT NOT NULL,
      subtitle_en TEXT NOT NULL,
      subtitle_kn TEXT NOT NULL,
      address TEXT NOT NULL,
      village_city TEXT NOT NULL,
      state_name TEXT NOT NULL,
      pincode TEXT NOT NULL,
      phone_primary TEXT NOT NULL,
      phone_secondary TEXT NOT NULL,
      gstin TEXT NOT NULL,
      pan TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      current_fy TEXT NOT NULL,
      fy_start_date TEXT NOT NULL,
      fy_end_date TEXT NOT NULL,
      rounding_mode TEXT NOT NULL,
      stock_valuation_method TEXT NOT NULL,
      interest_policy_json TEXT NOT NULL,
      commission_hamali_policy_json TEXT NOT NULL,
      custom_labels_json TEXT NOT NULL,
      approval_thresholds_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY,
      version_no INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      settings_snapshot_json TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS number_series (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL,
      label_en TEXT NOT NULL,
      label_kn TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      prefix TEXT NOT NULL,
      current_sequence INTEGER NOT NULL DEFAULT 0,
      padding_length INTEGER NOT NULL DEFAULT 6,
      include_fy_in_number INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(doc_type, financial_year)
    );

    CREATE TABLE IF NOT EXISTS issued_numbers_log (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      formatted_number TEXT NOT NULL UNIQUE,
      reference_entity_id TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      transaction_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      cancel_reason TEXT,
      cancelled_by TEXT,
      cancelled_at TEXT,
      issued_by TEXT NOT NULL,
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT NOT NULL,
      approved_by TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commodities (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      grade_variety TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      default_unit TEXT NOT NULL DEFAULT 'QUINTAL',
      reference_bag_weight_kg REAL,
      low_stock_threshold_grams INTEGER NOT NULL DEFAULT 0,
      standard_rate_per_quintal_paise INTEGER NOT NULL DEFAULT 0,
      stock_tracking_mode TEXT NOT NULL DEFAULT 'BOTH',
      gst_applicable_default INTEGER NOT NULL DEFAULT 0,
      cgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      sgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      igst_rate_bps INTEGER NOT NULL DEFAULT 0,
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      hamali_per_bag_paise INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      movement_no TEXT NOT NULL UNIQUE,
      commodity_id TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      direction TEXT NOT NULL,
      ownership_type TEXT NOT NULL DEFAULT 'SGT_OWNED',
      bags_delta INTEGER NOT NULL,
      weight_grams_delta INTEGER NOT NULL,
      gross_weight_grams INTEGER NOT NULL DEFAULT 0,
      tare_weight_grams INTEGER NOT NULL DEFAULT 0,
      moisture_pct REAL NOT NULL DEFAULT 0,
      rate_per_quintal_paise INTEGER NOT NULL,
      total_value_paise INTEGER NOT NULL,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0,
      party_id TEXT,
      party_name TEXT NOT NULL,
      settlement_mode TEXT NOT NULL DEFAULT 'CREDIT',
      bank_account_id TEXT,
      journal_entry_id TEXT,
      idempotency_key TEXT UNIQUE,
      reference_bill_no TEXT NOT NULL,
      vehicle_no TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      approved_by TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    -- CHUNK 2: UNIFIED FARMER & OTHER PARTY MASTER (SRS Sec 4.1, 4.2, 18.1)
    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      party_code TEXT NOT NULL UNIQUE,
      party_type TEXT NOT NULL,
      name TEXT NOT NULL,
      village TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      phone_primary TEXT NOT NULL DEFAULT '',
      phone_secondary TEXT NOT NULL DEFAULT '',
      sms_consent INTEGER NOT NULL DEFAULT 1,
      gstin TEXT NOT NULL DEFAULT '',
      pan TEXT NOT NULL DEFAULT '',
      nominee_name TEXT NOT NULL DEFAULT '',
      nominee_relation TEXT NOT NULL DEFAULT '',
      nominee_phone TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_branch TEXT NOT NULL DEFAULT '',
      bank_account_holder TEXT NOT NULL DEFAULT '',
      bank_account_no_raw TEXT NOT NULL DEFAULT '',
      bank_account_no_masked TEXT NOT NULL DEFAULT '',
      bank_ifsc TEXT NOT NULL DEFAULT '',
      id_proof_type TEXT NOT NULL DEFAULT '',
      id_proof_no_raw TEXT NOT NULL DEFAULT '',
      id_proof_no_masked TEXT NOT NULL DEFAULT '',
      id_proof_verified INTEGER NOT NULL DEFAULT 0,
      signature_data_url TEXT,
      opening_balance_paise INTEGER NOT NULL DEFAULT 0,
      opening_balance_type TEXT NOT NULL DEFAULT 'DR',
      opening_balance_date TEXT NOT NULL DEFAULT '',
      opening_balance_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      deactivation_reason TEXT,
      deactivated_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- CHUNK 2: CHART OF ACCOUNTS & CENTRAL KHATA DOUBLE-ENTRY ENGINE (SRS Sec 3, 10.1, 10.2)
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      account_type TEXT NOT NULL,
      sub_type TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_no TEXT NOT NULL UNIQUE,
      transaction_date TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      narration TEXT NOT NULL,
      total_debit_paise INTEGER NOT NULL,
      total_credit_paise INTEGER NOT NULL,
      cash_flow_summary TEXT NOT NULL DEFAULT 'NON_CASH',
      status TEXT NOT NULL DEFAULT 'POSTED',
      reversal_of_entry_id TEXT,
      reversed_by_entry_id TEXT,
      reversal_reason TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      account_code TEXT NOT NULL,
      party_id TEXT,
      bank_account_id TEXT,
      ledger_bucket TEXT NOT NULL DEFAULT 'GENERAL',
      debit_paise INTEGER NOT NULL DEFAULT 0,
      credit_paise INTEGER NOT NULL DEFAULT 0,
      cash_direction TEXT NOT NULL DEFAULT 'NON_CASH',
      line_note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(journal_entry_id) REFERENCES journal_entries(id),
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );

    -- CHUNK 3: BANK ACCOUNTS, CHEQUES, STATEMENT RECONCILIATION & FARMER LOANS
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      branch_name TEXT NOT NULL DEFAULT '',
      account_label TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'CURRENT',
      account_number_masked TEXT NOT NULL,
      ifsc_code TEXT NOT NULL DEFAULT '',
      opening_balance_paise INTEGER NOT NULL DEFAULT 0,
      opening_balance_type TEXT NOT NULL DEFAULT 'DR',
      reconciled_statement_balance_paise INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cheques (
      id TEXT PRIMARY KEY,
      cheque_no TEXT NOT NULL,
      cheque_date TEXT NOT NULL,
      direction TEXT NOT NULL,
      bank_account_id TEXT NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      cleared_date TEXT,
      bounced_reason TEXT,
      journal_entry_id TEXT,
      reversal_journal_entry_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
    );

    CREATE TABLE IF NOT EXISTS bank_statement_lines (
      id TEXT PRIMARY KEY,
      bank_account_id TEXT NOT NULL,
      value_date TEXT NOT NULL,
      description TEXT NOT NULL,
      reference_no TEXT NOT NULL DEFAULT '',
      debit_paise INTEGER NOT NULL DEFAULT 0,
      credit_paise INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'UNMATCHED',
      matched_journal_line_id TEXT,
      matched_entry_no TEXT,
      reconciled_by TEXT,
      reconciled_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      loan_no TEXT NOT NULL UNIQUE,
      farmer_id TEXT NOT NULL,
      disbursement_date TEXT NOT NULL,
      principal_paise INTEGER NOT NULL,
      payment_mode TEXT NOT NULL,
      bank_account_id TEXT,
      bank_reference TEXT NOT NULL DEFAULT '',
      interest_rate_bps INTEGER NOT NULL,
      rate_unit TEXT NOT NULL,
      interest_method TEXT NOT NULL,
      day_count_convention TEXT NOT NULL,
      repayment_order TEXT NOT NULL,
      principal_repaid_paise INTEGER NOT NULL DEFAULT 0,
      interest_paid_paise INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT NOT NULL DEFAULT '',
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(farmer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS loan_transactions (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      txn_no TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      txn_type TEXT NOT NULL,
      total_amount_paise INTEGER NOT NULL,
      principal_component_paise INTEGER NOT NULL,
      interest_component_paise INTEGER NOT NULL,
      payment_mode TEXT NOT NULL,
      bank_account_id TEXT,
      reference_no TEXT NOT NULL DEFAULT '',
      journal_entry_id TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(loan_id) REFERENCES loans(id)
    );

    -- CHUNK 5: FARMER PATTI SETTLEMENT ENGINE (AT-08) & BUYER-SIDE KHARIDI PATTI
    CREATE TABLE IF NOT EXISTS farmer_pattis (
      id TEXT PRIMARY KEY,
      patti_no TEXT NOT NULL UNIQUE,
      patti_date TEXT NOT NULL,
      farmer_id TEXT NOT NULL,
      ownership_mode TEXT NOT NULL DEFAULT 'FARMER_AGENCY',
      vehicle_no TEXT NOT NULL DEFAULT '',
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_net_weight_grams INTEGER NOT NULL DEFAULT 0,
      gross_crop_amount_paise INTEGER NOT NULL DEFAULT 0,
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      commission_amount_paise INTEGER NOT NULL DEFAULT 0,
      hamali_amount_paise INTEGER NOT NULL DEFAULT 0,
      weighment_fee_paise INTEGER NOT NULL DEFAULT 0,
      mandi_fee_paise INTEGER NOT NULL DEFAULT 0,
      other_deductions_paise INTEGER NOT NULL DEFAULT 0,
      other_deductions_label TEXT NOT NULL DEFAULT '',
      total_operational_deductions_paise INTEGER NOT NULL DEFAULT 0,
      linked_loan_id TEXT,
      linked_loan_no TEXT,
      loan_due_before_patti_paise INTEGER NOT NULL DEFAULT 0,
      loan_principal_recovered_paise INTEGER NOT NULL DEFAULT 0,
      loan_interest_recovered_paise INTEGER NOT NULL DEFAULT 0,
      total_loan_recovered_paise INTEGER NOT NULL DEFAULT 0,
      carry_forward_loan_balance_paise INTEGER NOT NULL DEFAULT 0,
      net_payable_paise INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'CASH',
      bank_account_id TEXT,
      amount_paid_now_paise INTEGER NOT NULL DEFAULT 0,
      balance_payable_paise INTEGER NOT NULL DEFAULT 0,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(farmer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS farmer_patti_items (
      id TEXT PRIMARY KEY,
      patti_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      commodity_id TEXT NOT NULL,
      bags INTEGER NOT NULL,
      gross_weight_grams INTEGER NOT NULL,
      tare_weight_grams INTEGER NOT NULL DEFAULT 0,
      moisture_pct REAL NOT NULL DEFAULT 0,
      net_weight_grams INTEGER NOT NULL,
      rate_per_quintal_paise INTEGER NOT NULL,
      gross_amount_paise INTEGER NOT NULL,
      FOREIGN KEY(patti_id) REFERENCES farmer_pattis(id),
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    CREATE TABLE IF NOT EXISTS kharidi_pattis (
      id TEXT PRIMARY KEY,
      invoice_no TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      ownership_mode TEXT NOT NULL DEFAULT 'SGT_OWNED',
      linked_farmer_patti_id TEXT,
      linked_farmer_id TEXT,
      vehicle_no TEXT NOT NULL DEFAULT '',
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_net_weight_grams INTEGER NOT NULL DEFAULT 0,
      total_base_amount_paise INTEGER NOT NULL DEFAULT 0,
      buyer_commission_bps INTEGER NOT NULL DEFAULT 0,
      buyer_commission_paise INTEGER NOT NULL DEFAULT 0,
      buyer_hamali_packing_paise INTEGER NOT NULL DEFAULT 0,
      buyer_market_fee_paise INTEGER NOT NULL DEFAULT 0,
      total_gst_paise INTEGER NOT NULL DEFAULT 0,
      net_receivable_paise INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'CREDIT',
      bank_account_id TEXT,
      amount_received_now_paise INTEGER NOT NULL DEFAULT 0,
      balance_receivable_paise INTEGER NOT NULL DEFAULT 0,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(buyer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS kharidi_patti_items (
      id TEXT PRIMARY KEY,
      kharidi_patti_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      commodity_id TEXT NOT NULL,
      bags INTEGER NOT NULL,
      net_weight_grams INTEGER NOT NULL,
      rate_per_quintal_paise INTEGER NOT NULL,
      base_amount_paise INTEGER NOT NULL,
      gst_applicable INTEGER NOT NULL DEFAULT 0,
      cgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      sgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      igst_rate_bps INTEGER NOT NULL DEFAULT 0,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0,
      line_total_paise INTEGER NOT NULL,
      FOREIGN KEY(kharidi_patti_id) REFERENCES kharidi_pattis(id),
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    -- CHUNK 6: DALALI VIKRI PATTI, DALALI KHARIDI PATTI, CASH/CREDIT BILL & CREDIT NOTES (SRS Sec 8 & 9)
    CREATE TABLE IF NOT EXISTS dalali_vikri_pattis (
      id TEXT PRIMARY KEY,
      patti_no TEXT NOT NULL UNIQUE,
      patti_date TEXT NOT NULL,
      farmer_id TEXT NOT NULL,
      counterparty_buyer_id TEXT,
      counterparty_buyer_name TEXT NOT NULL DEFAULT '',
      class_serial TEXT NOT NULL DEFAULT '',
      vehicle_no TEXT NOT NULL DEFAULT '',
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_andiges INTEGER NOT NULL DEFAULT 0,
      total_net_weight_grams INTEGER NOT NULL DEFAULT 0,
      gross_sale_amount_paise INTEGER NOT NULL DEFAULT 0,
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      commission_amount_paise INTEGER NOT NULL DEFAULT 0,
      hamali_amount_paise INTEGER NOT NULL DEFAULT 0,
      niitu_fee_paise INTEGER NOT NULL DEFAULT 0,
      tukad_fee_paise INTEGER NOT NULL DEFAULT 0,
      rmc_fee_paise INTEGER NOT NULL DEFAULT 0,
      vehicle_rent_paise INTEGER NOT NULL DEFAULT 0,
      hand_loan_advance_paise INTEGER NOT NULL DEFAULT 0,
      other_deductions_paise INTEGER NOT NULL DEFAULT 0,
      total_deductions_paise INTEGER NOT NULL DEFAULT 0,
      net_payable_paise INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'CASH',
      bank_account_id TEXT,
      amount_paid_now_paise INTEGER NOT NULL DEFAULT 0,
      balance_payable_paise INTEGER NOT NULL DEFAULT 0,
      amount_in_words TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'FINALIZED',
      reversal_reason TEXT,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(farmer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS dalali_vikri_items (
      id TEXT PRIMARY KEY,
      patti_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      commodity_id TEXT NOT NULL,
      bags INTEGER NOT NULL,
      andiges INTEGER NOT NULL DEFAULT 0,
      gross_weight_grams INTEGER NOT NULL,
      tare_weight_grams INTEGER NOT NULL DEFAULT 0,
      moisture_pct REAL NOT NULL DEFAULT 0,
      net_weight_grams INTEGER NOT NULL,
      rate_per_quintal_paise INTEGER NOT NULL,
      gross_amount_paise INTEGER NOT NULL,
      FOREIGN KEY(patti_id) REFERENCES dalali_vikri_pattis(id),
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    CREATE TABLE IF NOT EXISTS dalali_kharidi_pattis (
      id TEXT PRIMARY KEY,
      patti_no TEXT NOT NULL UNIQUE,
      patti_date TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      linked_dalali_vikri_id TEXT,
      linked_farmer_id TEXT,
      class_serial TEXT NOT NULL DEFAULT '',
      vehicle_no TEXT NOT NULL DEFAULT '',
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_andiges INTEGER NOT NULL DEFAULT 0,
      total_net_weight_grams INTEGER NOT NULL DEFAULT 0,
      total_base_amount_paise INTEGER NOT NULL DEFAULT 0,
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      commission_amount_paise INTEGER NOT NULL DEFAULT 0,
      hamali_amount_paise INTEGER NOT NULL DEFAULT 0,
      niitu_fee_paise INTEGER NOT NULL DEFAULT 0,
      tukad_fee_paise INTEGER NOT NULL DEFAULT 0,
      rmc_fee_paise INTEGER NOT NULL DEFAULT 0,
      total_gst_paise INTEGER NOT NULL DEFAULT 0,
      net_receivable_paise INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'CREDIT',
      bank_account_id TEXT,
      amount_received_now_paise INTEGER NOT NULL DEFAULT 0,
      balance_receivable_paise INTEGER NOT NULL DEFAULT 0,
      amount_in_words TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'FINALIZED',
      reversal_reason TEXT,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(buyer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS dalali_kharidi_items (
      id TEXT PRIMARY KEY,
      patti_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      commodity_id TEXT NOT NULL,
      bags INTEGER NOT NULL,
      andiges INTEGER NOT NULL DEFAULT 0,
      net_weight_grams INTEGER NOT NULL,
      rate_per_quintal_paise INTEGER NOT NULL,
      base_amount_paise INTEGER NOT NULL,
      gst_applicable INTEGER NOT NULL DEFAULT 0,
      cgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      sgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      igst_rate_bps INTEGER NOT NULL DEFAULT 0,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0,
      line_total_paise INTEGER NOT NULL,
      FOREIGN KEY(patti_id) REFERENCES dalali_kharidi_pattis(id),
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    CREATE TABLE IF NOT EXISTS cash_credit_bills (
      id TEXT PRIMARY KEY,
      bill_no TEXT NOT NULL UNIQUE,
      bill_date TEXT NOT NULL,
      bill_kind TEXT NOT NULL DEFAULT 'CREDIT_BILL',
      buyer_id TEXT NOT NULL,
      ownership_mode TEXT NOT NULL DEFAULT 'SGT_OWNED',
      class_serial TEXT NOT NULL DEFAULT '',
      lorry_owner_name TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      driver_license_no TEXT NOT NULL DEFAULT '',
      driver_phone TEXT NOT NULL DEFAULT '',
      vehicle_no TEXT NOT NULL DEFAULT '',
      origin_place TEXT NOT NULL DEFAULT '',
      destination_place TEXT NOT NULL DEFAULT '',
      delivery_note_no TEXT NOT NULL DEFAULT '',
      freight_advance_paise INTEGER NOT NULL DEFAULT 0,
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_andiges INTEGER NOT NULL DEFAULT 0,
      total_net_weight_grams INTEGER NOT NULL DEFAULT 0,
      total_base_amount_paise INTEGER NOT NULL DEFAULT 0,
      commission_paise INTEGER NOT NULL DEFAULT 0,
      hamali_packing_paise INTEGER NOT NULL DEFAULT 0,
      rmc_fee_paise INTEGER NOT NULL DEFAULT 0,
      tukad_fee_paise INTEGER NOT NULL DEFAULT 0,
      cst_or_other_tax_label TEXT NOT NULL DEFAULT '',
      cst_or_other_tax_paise INTEGER NOT NULL DEFAULT 0,
      total_cgst_paise INTEGER NOT NULL DEFAULT 0,
      total_sgst_paise INTEGER NOT NULL DEFAULT 0,
      total_igst_paise INTEGER NOT NULL DEFAULT 0,
      total_gst_paise INTEGER NOT NULL DEFAULT 0,
      net_bill_amount_paise INTEGER NOT NULL DEFAULT 0,
      amount_in_words TEXT NOT NULL DEFAULT '',
      payment_mode TEXT NOT NULL DEFAULT 'CREDIT',
      bank_account_id TEXT,
      amount_received_now_paise INTEGER NOT NULL DEFAULT 0,
      balance_receivable_paise INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'FINALIZED',
      reversal_reason TEXT,
      reversal_date TEXT,
      reversal_journal_entry_id TEXT,
      credit_note_no TEXT,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(buyer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS cash_credit_bill_items (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      commodity_id TEXT NOT NULL,
      hsn_code TEXT NOT NULL DEFAULT '',
      bags INTEGER NOT NULL,
      andiges INTEGER NOT NULL DEFAULT 0,
      net_weight_grams INTEGER NOT NULL,
      rate_per_quintal_paise INTEGER NOT NULL,
      base_amount_paise INTEGER NOT NULL,
      gst_applicable INTEGER NOT NULL DEFAULT 0,
      cgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      sgst_rate_bps INTEGER NOT NULL DEFAULT 0,
      igst_rate_bps INTEGER NOT NULL DEFAULT 0,
      cgst_amount_paise INTEGER NOT NULL DEFAULT 0,
      sgst_amount_paise INTEGER NOT NULL DEFAULT 0,
      igst_amount_paise INTEGER NOT NULL DEFAULT 0,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0,
      line_total_paise INTEGER NOT NULL,
      FOREIGN KEY(bill_id) REFERENCES cash_credit_bills(id),
      FOREIGN KEY(commodity_id) REFERENCES commodities(id)
    );

    -- CHUNK 7: BUYER COLLECTION BOOK & EXPENSES / COMMITMENTS (SRS Sec 13 & 14)
    CREATE TABLE IF NOT EXISTS collections_receipts (
      id TEXT PRIMARY KEY,
      receipt_no TEXT NOT NULL UNIQUE,
      receipt_date TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      target_bill_type TEXT NOT NULL DEFAULT 'ON_ACCOUNT',
      target_bill_id TEXT,
      target_bill_no TEXT,
      amount_paise INTEGER NOT NULL,
      discount_allowed_paise INTEGER NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'CASH',
      bank_account_id TEXT,
      reference_no TEXT NOT NULL DEFAULT '',
      bill_balance_before_paise INTEGER NOT NULL DEFAULT 0,
      bill_balance_after_paise INTEGER NOT NULL DEFAULT 0,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(buyer_id) REFERENCES parties(id)
    );

    CREATE TABLE IF NOT EXISTS expenses_commitments (
      id TEXT PRIMARY KEY,
      voucher_no TEXT NOT NULL UNIQUE,
      voucher_date TEXT NOT NULL,
      category TEXT NOT NULL,
      accounting_classification TEXT NOT NULL DEFAULT 'OPERATING_EXPENSE',
      payee_name TEXT NOT NULL,
      party_id TEXT,
      amount_paise INTEGER NOT NULL,
      gst_amount_paise INTEGER NOT NULL DEFAULT 0,
      total_amount_paise INTEGER NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'CASH',
      bank_account_id TEXT,
      reference_no TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_restricted_personal INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'FINALIZED',
      reversal_reason TEXT,
      reversal_journal_entry_id TEXT,
      journal_entry_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- CHUNK 8: DAY-END CLOSE & PLUGGABLE SMS OUTBOX SIMULATOR (SRS Sec 11 & 16.3)
    CREATE TABLE IF NOT EXISTS day_closes (
      business_date TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'CLOSED',
      cash_opening_paise INTEGER NOT NULL DEFAULT 0,
      cash_in_paise INTEGER NOT NULL DEFAULT 0,
      cash_out_paise INTEGER NOT NULL DEFAULT 0,
      cash_closing_paise INTEGER NOT NULL DEFAULT 0,
      physical_cash_counted_paise INTEGER NOT NULL DEFAULT 0,
      cash_variance_paise INTEGER NOT NULL DEFAULT 0,
      total_debit_paise INTEGER NOT NULL DEFAULT 0,
      total_credit_paise INTEGER NOT NULL DEFAULT 0,
      journal_entry_count INTEGER NOT NULL DEFAULT 0,
      closed_by TEXT,
      closed_at TEXT,
      reopened_by TEXT,
      reopened_at TEXT,
      reopen_reason TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      message_body TEXT NOT NULL,
      source_doc_no TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'SENT',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Safe schema evolution for existing SQLite files created in Chunk 1
  const ensureColumn = (tableName: string, columnName: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  };

  ensureColumn('commodities', 'stock_tracking_mode', "TEXT NOT NULL DEFAULT 'BOTH'");
  ensureColumn('commodities', 'gst_applicable_default', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('commodities', 'cgst_rate_bps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('commodities', 'sgst_rate_bps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('commodities', 'igst_rate_bps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('commodities', 'commission_rate_bps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('commodities', 'hamali_per_bag_paise', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn('stock_movements', 'gross_weight_grams', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('stock_movements', 'tare_weight_grams', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('stock_movements', 'moisture_pct', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('stock_movements', 'gst_amount_paise', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('stock_movements', 'party_id', 'TEXT');
  ensureColumn('stock_movements', 'settlement_mode', "TEXT NOT NULL DEFAULT 'CREDIT'");
  ensureColumn('stock_movements', 'bank_account_id', 'TEXT');
  ensureColumn('stock_movements', 'journal_entry_id', 'TEXT');
  ensureColumn('stock_movements', 'idempotency_key', 'TEXT');
  ensureColumn('stock_movements', 'vehicle_no', "TEXT NOT NULL DEFAULT ''");

  const nowIso = new Date().toISOString();
  const todayIst = getTodayIST();
  const fyInfo = getCurrentIndianFinancialYear(todayIst);

  // Initialize singleton Company Settings structural row (id = 1) with blank fields and 0 unconfirmed rates
  const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM company_settings').get() as {
    cnt: number;
  };
  if (settingsCount.cnt === 0) {
    const zeroInterestPolicy = {
      defaultRateBps: 0,
      defaultRateUnit: RateUnit.YEARLY,
      defaultMethod: InterestMethod.SIMPLE,
      dayCountConvention: DayCountConvention.ACT_365,
      repaymentAllocationOrder: RepaymentAllocationOrder.PRINCIPAL_FIRST,
      gracePeriodDays: 0,
      unpaidInterestCompounds: false,
      roundingMode: RoundingMode.NEAREST_RUPEE,
      ownerConfirmed: false,
    };

    const zeroCommHamaliPolicy = {
      defaultCommissionBps: 0,
      defaultHamaliPerBagPaise: 0,
      commissionTaxable: false,
      ownerConfirmed: false,
    };

    const baselineCustomLabels = {
      niituFeeLabelEn: 'Niitu Fee',
      niituFeeLabelKn: 'ನೀಟು ಶುಲ್ಕ',
      tukadFeeLabelEn: 'Tukad Fee',
      tukadFeeLabelKn: 'ತುಕಡ ಶುಲ್ಕ',
      rmcFeeLabelEn: 'RMC',
      rmcFeeLabelKn: 'ಆರ್.ಎಂ.ಸಿ',
      andigesLabelEn: 'Andiges',
      andigesLabelKn: 'ಅಂದಿಗೆಗಳು',
      cstOrOtherTaxLabelEn: 'CST / Other Tax',
      cstOrOtherTaxLabelKn: 'ಇತರೆ ತೆರಿಗೆ',
      ownerConfirmed: false,
    };

    const baselineApprovalThresholds = {
      highValueLoanPaise: 0,
      requireApprovalForRateChange: true,
      requireApprovalForStockAdjustment: true,
      requireApprovalForFinalizedReversal: true,
      requireApprovalForDayReopen: true,
    };

    db.prepare(`
      INSERT INTO company_settings (
        id, legal_name, subtitle_en, subtitle_kn, address, village_city, state_name, pincode,
        phone_primary, phone_secondary, gstin, pan, timezone, current_fy, fy_start_date, fy_end_date,
        rounding_mode, stock_valuation_method, interest_policy_json, commission_hamali_policy_json,
        custom_labels_json, approval_thresholds_json, version, updated_by, updated_at
      ) VALUES (
        1, 'Shree Guru Traders (SGT)', '', '', '', '', '', '',
        '', '', '', '', 'Asia/Kolkata', ?, ?, ?,
        ?, 'WEIGHTED_AVERAGE', ?, ?, ?, ?, 1, 'SYSTEM', ?
      )
    `).run(
      fyInfo.fyCode,
      fyInfo.startDate,
      fyInfo.endDate,
      RoundingMode.NEAREST_RUPEE,
      JSON.stringify(zeroInterestPolicy),
      JSON.stringify(zeroCommHamaliPolicy),
      JSON.stringify(baselineCustomLabels),
      JSON.stringify(baselineApprovalThresholds),
      nowIso
    );
  }

  // Ensure all Document Number Series format definitions exist (sequences start at 0)
  const insertSeries = db.prepare(`
    INSERT OR IGNORE INTO number_series (id, doc_type, label_en, label_kn, financial_year, prefix, current_sequence, padding_length, include_fy_in_number, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 6, 0, ?)
  `);

  const srsSeries: Array<{
    type: DocumentSeriesType;
    en: string;
    kn: string;
    prefix: string;
  }> = [
    { type: DocumentSeriesType.FARMER, en: 'Farmer Registration ID', kn: 'ರೈತರ ನೋಂದಣಿ ಸಂಖ್ಯೆ', prefix: 'SGT-FM-' },
    { type: DocumentSeriesType.PARTY, en: 'Buyer / Party Master ID', kn: 'ಖರೀದಿದಾರ / ಪಾರ್ಟಿ ಸಂಖ್ಯೆ', prefix: 'SGT-PT-' },
    { type: DocumentSeriesType.LOAN, en: 'Farmer Loan Voucher', kn: 'ರೈತರ ಸಾಲದ ರಶೀದಿ', prefix: 'SGT-LN-' },
    { type: DocumentSeriesType.FARMER_PATTI, en: 'Farmer Settlement Patti', kn: 'ರೈತರ ಪಟ್ಟಿ', prefix: 'SGT-FP-' },
    { type: DocumentSeriesType.KHARIDI_PATTI, en: 'Kharidi Patti', kn: 'ಖರೀದಿ ಪಟ್ಟಿ', prefix: 'SGT-KP-' },
    { type: DocumentSeriesType.DALALI_VIKRI, en: 'Dalali Vikri Patti', kn: 'ದಲಾಲಿ ವಿಕ್ರಿ ಪಟ್ಟಿ', prefix: 'SGT-DV-' },
    { type: DocumentSeriesType.DALALI_KHARIDI, en: 'Dalali Kharidi Patti', kn: 'ದಲಾಲಿ ಖರೀದಿ ಪಟ್ಟಿ', prefix: 'SGT-DK-' },
    { type: DocumentSeriesType.CASH_CREDIT_BILL, en: 'Cash / Credit Invoice', kn: 'ನಗದು / ಉದರಿ ಬಿಲ್', prefix: 'SGT-CB-' },
    { type: DocumentSeriesType.GOODS_IN, en: 'Goods In Stock Entry', kn: 'ಮಾಲಿನ ಒಳಹರಿವು (Goods In)', prefix: 'SGT-GI-' },
    { type: DocumentSeriesType.GOODS_OUT, en: 'Goods Out Dispatch', kn: 'ಮಾಲಿನ ಹೊರಹರಿವು (Goods Out)', prefix: 'SGT-GO-' },
    { type: DocumentSeriesType.STOCK_ADJ, en: 'Stock Adjustment Voucher', kn: 'ದಾಸ್ತಾನು ಹೊಂದಾಣಿಕೆ', prefix: 'SGT-SA-' },
    { type: DocumentSeriesType.RECEIPT, en: 'Collection / Cash Receipt', kn: 'ಹಣ ಸ್ವೀಕೃತಿ ರಶೀದಿ', prefix: 'SGT-RC-' },
    { type: DocumentSeriesType.PAYMENT, en: 'Payment Voucher', kn: 'ಪಾವತಿ ವೋಚರ್', prefix: 'SGT-PY-' },
    { type: DocumentSeriesType.EXPENSE, en: 'Expense & Commitment', kn: 'ಖರ್ಚು ವೋಚರ್', prefix: 'SGT-EX-' },
    { type: DocumentSeriesType.JOURNAL, en: 'Khata Book Journal Entry', kn: 'ಖಾತೆ ಪುಸ್ತಕ ನಮೂದು', prefix: 'SGT-JE-' },
  ];

  for (const s of srsSeries) {
    insertSeries.run(`SER-${s.type}`, s.type, s.en, s.kn, fyInfo.fyCode, s.prefix, nowIso);
  }

  // Initialize Structural System Chart of Accounts (SRS Sec 10.1 & 10.2) — ₹0 balances until posted
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (id, code, name_en, name_kn, account_type, sub_type, is_system, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'ACTIVE', ?)
  `);

  const systemAccounts = [
    { id: 'ACC-1001', code: '1001', en: 'Cash in Hand (Main Galla)', kn: 'ಕೈಯಲ್ಲಿರುವ ನಗದು (ಗಲ್ಲಾ)', type: 'ASSET', sub: 'CASH' },
    { id: 'ACC-1002', code: '1002', en: 'Bank Control Account', kn: 'ಬ್ಯಾಂಕ್ ನಿಯಂತ್ರಣ ಖಾತೆ', type: 'ASSET', sub: 'BANK' },
    { id: 'ACC-1101', code: '1101', en: 'Farmer Settlement & Trade Control', kn: 'ರೈತರ ವ್ಯಾಪಾರ ನಿಯಂತ್ರಣ ಖಾತೆ', type: 'LIABILITY', sub: 'FARMER_CONTROL' },
    { id: 'ACC-1102', code: '1102', en: 'Buyer / Customer Receivable Control', kn: 'ಖರೀದಿದಾರರ ಬಾಕಿ ನಿಯಂತ್ರಣ ಖಾತೆ', type: 'ASSET', sub: 'BUYER_CONTROL' },
    { id: 'ACC-1201', code: '1201', en: 'Farmer Loan Principal Receivable', kn: 'ರೈತರ ಸಾಲದ ಅಸಲು ಬಾಕಿ', type: 'ASSET', sub: 'LOAN_PRINCIPAL' },
    { id: 'ACC-1202', code: '1202', en: 'Farmer Loan Interest Receivable', kn: 'ರೈತರ ಸಾಲದ ಬಡ್ಡಿ ಬಾಕಿ', type: 'ASSET', sub: 'INTEREST_RECEIVABLE' },
    { id: 'ACC-1301', code: '1301', en: 'SGT Owned Commodity Inventory', kn: 'ಎಸ್.ಜಿ.ಟಿ ಮಾಲೀಕತ್ವದ ಮಾಲಿನ ದಾಸ್ತಾನು', type: 'ASSET', sub: 'STOCK_ASSET' },
    { id: 'ACC-2001', code: '2001', en: 'Supplier & Transporter Payable Control', kn: 'ಪೂರೈಕೆದಾರರ ಪಾವತಿ ನಿಯಂತ್ರಣ ಖಾತೆ', type: 'LIABILITY', sub: 'SUPPLIER_CONTROL' },
    { id: 'ACC-2101', code: '2101', en: 'GST & Statutory Tax Control', kn: 'ಜಿ.ಎಸ್.ಟಿ ಮತ್ತು ತೆರಿಗೆ ಖಾತೆ', type: 'LIABILITY', sub: 'GST_CONTROL' },
    { id: 'ACC-3001', code: '3001', en: 'Owner Capital Account', kn: 'ಮಾಲೀಕರ ಬಂಡವಾಳ ಖಾತೆ', type: 'EQUITY', sub: 'CAPITAL' },
    { id: 'ACC-3002', code: '3002', en: 'Owner Drawings Account', kn: 'ಮಾಲೀಕರ ವೈಯಕ್ತಿಕ ಹಿಂಪಡೆಯುವಿಕೆ', type: 'EQUITY', sub: 'DRAWINGS' },
    { id: 'ACC-3099', code: '3099', en: 'Opening Balance Equity Offset', kn: 'ಪ್ರಾರಂಭಿಕ ಶಿಲ್ಕು ಹೊಂದಾಣಿಕೆ ಖಾತೆ', type: 'EQUITY', sub: 'OPENING_EQUITY_OFFSET' },
    { id: 'ACC-4001', code: '4001', en: 'Commodity Sales Account (Owned)', kn: 'ಮಾಲಿನ ಮಾರಾಟ ಖಾತೆ', type: 'INCOME', sub: 'SALES_INCOME' },
    { id: 'ACC-4002', code: '4002', en: 'Dalali Commission Income', kn: 'ದಲಾಲಿ ಕಮಿಷನ್ ಆದಾಯ', type: 'INCOME', sub: 'COMMISSION_INCOME' },
    { id: 'ACC-4003', code: '4003', en: 'Farmer Loan Interest Income', kn: 'ರೈತರ ಸಾಲದ ಬಡ್ಡಿ ಆದಾಯ', type: 'INCOME', sub: 'INTEREST_INCOME' },
    { id: 'ACC-4004', code: '4004', en: 'Hamali, Weighing & Mandi Fee Recovery', kn: 'ಹಮಾಲಿ ಮತ್ತು ತೂಕದ ಶುಲ್ಕ ವಸೂಲಾತಿ', type: 'INCOME', sub: 'HAMALI_RECOVERY' },
    { id: 'ACC-5001', code: '5001', en: 'Commodity Purchase Account (Owned)', kn: 'ಮಾಲಿನ ಖರೀದಿ ಖಾತೆ', type: 'EXPENSE', sub: 'PURCHASE_EXPENSE' },
    { id: 'ACC-5002', code: '5002', en: 'Operating, Hamali & Mandi Expenses', kn: 'ಅಂಗಡಿ ಮತ್ತು ಮಂಡಿ ಖರ್ಚುಗಳು', type: 'EXPENSE', sub: 'OPERATING_EXPENSE' },
  ];

  for (const acc of systemAccounts) {
    insertAccount.run(acc.id, acc.code, acc.en, acc.kn, acc.type, acc.sub, nowIso);
  }

  // In non-test environments, ensure default administrator account (rohit / Password@123) exists
  if (process.env.NODE_ENV !== 'test') {
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('rohit');
    if (!adminExists) {
      const adminPerms = JSON.stringify(Object.values(PermissionKey));
      db.prepare(`
        INSERT INTO users (
          id, username, password_hash, full_name, role, permissions_json,
          can_view_sensitive_kyc, status, last_login_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'ACTIVE', NULL, ?)
      `).run(
        'USR-ADMIN-ROHIT',
        'rohit',
        hashPassword('Password@123'),
        'Rohit (Administrator)',
        UserRole.OWNER,
        adminPerms,
        nowIso
      );
    }
  }
}

let sharedDbInstance: Database.Database | null = null;

export function getSharedDb(): Database.Database {
  if (!sharedDbInstance) {
    sharedDbInstance = createDatabase();
  }
  return sharedDbInstance;
}

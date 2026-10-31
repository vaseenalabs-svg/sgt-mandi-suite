import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DayCountConvention,
  InterestMethod,
  RateUnit,
  RepaymentAllocationOrder,
  RoundingMode,
} from '../../shared/types';
import { createDatabase, getCurrentIndianFinancialYear, getTodayIST } from '../db';

export interface MigrationReport {
  migrationId: string;
  migrationName: string;
  appliedAt: string;
  tablesVerified: string[];
  purgedRowCounts: {
    stock_movements: number;
    commodities: number;
    users: number;
    issued_numbers_log: number;
    policy_versions: number;
    audit_logs: number;
    number_series_reset: number;
  };
  integrityCheck: string;
}

const REQUIRED_PRODUCTION_TABLES = [
  'users',
  'company_settings',
  'policy_versions',
  'number_series',
  'issued_numbers_log',
  'audit_logs',
  'commodities',
  'stock_movements',
  'schema_migrations',
];

/**
 * Migration 001: Purges all hardcoded/sample rows (commodities, users, stock movements,
 * sample issued numbers, policy snapshots, and audit logs) while preserving all SQLite
 * table structures, indexes, foreign keys, and zeroed numbering counters for production use.
 */
export function runPurgeSampleDataMigration(db: Database.Database): MigrationReport {
  const migrationId = '001_purge_sample_data';
  const migrationName = 'Purge hardcoded sample commodities, users, and stock movements for production';
  const appliedAt = new Date().toISOString();
  const fyInfo = getCurrentIndianFinancialYear(getTodayIST());

  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      summary_json TEXT NOT NULL
    );
  `);

  const tx = db.transaction((): MigrationReport => {
    // 1. Delete child tables first to respect foreign key constraints
    const tableExists = (name: string) =>
      Boolean(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
          .get(name)
      );

    if (tableExists('cash_credit_bill_items')) db.prepare('DELETE FROM cash_credit_bill_items').run();
    if (tableExists('cash_credit_bills')) db.prepare('DELETE FROM cash_credit_bills').run();
    if (tableExists('collections_receipts')) db.prepare('DELETE FROM collections_receipts').run();
    if (tableExists('expenses_commitments')) db.prepare('DELETE FROM expenses_commitments').run();
    if (tableExists('dalali_kharidi_items')) db.prepare('DELETE FROM dalali_kharidi_items').run();
    if (tableExists('dalali_kharidi_pattis')) db.prepare('DELETE FROM dalali_kharidi_pattis').run();
    if (tableExists('dalali_vikri_items')) db.prepare('DELETE FROM dalali_vikri_items').run();
    if (tableExists('dalali_vikri_pattis')) db.prepare('DELETE FROM dalali_vikri_pattis').run();
    if (tableExists('kharidi_patti_items')) db.prepare('DELETE FROM kharidi_patti_items').run();
    if (tableExists('kharidi_pattis')) db.prepare('DELETE FROM kharidi_pattis').run();
    if (tableExists('farmer_patti_items')) db.prepare('DELETE FROM farmer_patti_items').run();
    if (tableExists('farmer_pattis')) db.prepare('DELETE FROM farmer_pattis').run();
    if (tableExists('loan_transactions')) db.prepare('DELETE FROM loan_transactions').run();
    if (tableExists('loans')) db.prepare('DELETE FROM loans').run();
    if (tableExists('bank_statement_lines')) db.prepare('DELETE FROM bank_statement_lines').run();
    if (tableExists('cheques')) db.prepare('DELETE FROM cheques').run();
    if (tableExists('day_closes')) db.prepare('DELETE FROM day_closes').run();
    if (tableExists('sms_logs')) db.prepare('DELETE FROM sms_logs').run();
    if (tableExists('journal_lines')) db.prepare('DELETE FROM journal_lines').run();
    if (tableExists('journal_entries')) db.prepare('DELETE FROM journal_entries').run();
    const deletedMovements = db.prepare('DELETE FROM stock_movements').run().changes;
    if (tableExists('parties')) db.prepare('DELETE FROM parties').run();
    if (tableExists('bank_accounts')) db.prepare('DELETE FROM bank_accounts').run();
    const deletedCommodities = db.prepare('DELETE FROM commodities').run().changes;
    const deletedUsers = db.prepare('DELETE FROM users').run().changes;
    const deletedIssuedNums = db.prepare('DELETE FROM issued_numbers_log').run().changes;
    const deletedPolicies = db.prepare('DELETE FROM policy_versions').run().changes;
    const deletedAuditLogs = db.prepare('DELETE FROM audit_logs').run().changes;

    // 2. Reset all document numbering sequences to 0 for production cutover
    const resetSeries = db
      .prepare('UPDATE number_series SET current_sequence = 0, financial_year = ?, updated_at = ?')
      .run(fyInfo.fyCode, appliedAt).changes;

    // 3. Reset singleton company_settings row to blank production state (rates = 0, unconfirmed)
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

    const blankCustomLabels = {
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

    const defaultApprovalThresholds = {
      highValueLoanPaise: 0,
      requireApprovalForRateChange: true,
      requireApprovalForStockAdjustment: true,
      requireApprovalForFinalizedReversal: true,
      requireApprovalForDayReopen: true,
    };

    db.prepare(
      `
      UPDATE company_settings
      SET legal_name = 'Shree Guru Traders (SGT)',
          subtitle_en = '',
          subtitle_kn = '',
          address = '',
          village_city = '',
          state_name = '',
          pincode = '',
          phone_primary = '',
          phone_secondary = '',
          gstin = '',
          pan = '',
          current_fy = ?,
          fy_start_date = ?,
          fy_end_date = ?,
          rounding_mode = ?,
          stock_valuation_method = 'WEIGHTED_AVERAGE',
          interest_policy_json = ?,
          commission_hamali_policy_json = ?,
          custom_labels_json = ?,
          approval_thresholds_json = ?,
          version = 1,
          updated_by = 'SYSTEM_MIGRATION',
          updated_at = ?
      WHERE id = 1
    `
    ).run(
      fyInfo.fyCode,
      fyInfo.startDate,
      fyInfo.endDate,
      RoundingMode.NEAREST_RUPEE,
      JSON.stringify(zeroInterestPolicy),
      JSON.stringify(zeroCommHamaliPolicy),
      JSON.stringify(blankCustomLabels),
      JSON.stringify(defaultApprovalThresholds),
      appliedAt
    );

    // 4. Verify all required table structures remain intact in sqlite_master
    const existingTableRows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`
      )
      .all() as Array<{ name: string }>;
    const existingTableNames = existingTableRows.map((r) => r.name);

    for (const reqTable of REQUIRED_PRODUCTION_TABLES) {
      if (!existingTableNames.includes(reqTable)) {
        throw new Error(`Migration verification failed: required table "${reqTable}" is missing.`);
      }
    }

    // 5. Run foreign key & integrity checks
    const fkErrors = db.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`Foreign key constraint violation detected during migration: ${JSON.stringify(fkErrors)}`);
    }

    const integrityResult = db.pragma('integrity_check', { simple: true }) as string;

    const report: MigrationReport = {
      migrationId,
      migrationName,
      appliedAt,
      tablesVerified: existingTableNames,
      purgedRowCounts: {
        stock_movements: deletedMovements,
        commodities: deletedCommodities,
        users: deletedUsers,
        issued_numbers_log: deletedIssuedNums,
        policy_versions: deletedPolicies,
        audit_logs: deletedAuditLogs,
        number_series_reset: resetSeries,
      },
      integrityCheck: String(integrityResult),
    };

    // 6. Record migration execution in schema_migrations
    db.prepare(
      `
      INSERT INTO schema_migrations (id, name, applied_at, summary_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        applied_at = excluded.applied_at,
        summary_json = excluded.summary_json
    `
    ).run(migrationId, migrationName, appliedAt, JSON.stringify(report));

    return report;
  });

  return tx();
}

// Allow direct CLI execution via `tsx src/server/migrations/001_purge_sample_data.ts`
const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)) {
  const dbPath = process.env.SGT_DB_PATH ?? path.resolve(process.cwd(), 'sgt_database.sqlite');
  const db = createDatabase(dbPath);
  const report = runPurgeSampleDataMigration(db);
  // Perform WAL checkpoint and vacuum outside transaction to reclaim disk space
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  console.log(JSON.stringify(report, null, 2));
  db.close();
}

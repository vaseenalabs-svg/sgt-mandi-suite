# Shree Guru Traders (SGT) — Integrated Business Management & Accounting Suite

Agricultural trading, commission agent (*Dalali*), farmer credit/loan management, stock valuation, billing, and double-entry *Khata* accounting suite built to the **SGT Software Requirements Specification (Version 1.0)**.

---

## 1. System Architecture & Core Guarantees
- **Single-Entry-to-Multi-Ledger Posting Engine (`src/server/services/coreService.ts`)**: Every operational event (Farmer Loan, Goods In/Out, Farmer Patti, Kharidi Patti, Dalali Vikri/Kharidi Patti, Cash/Credit Bill, Buyer Collection, Expense/Drawing/Chit/Insurance, Contra Transfer, Cheque Clearance) atomically posts balanced double-entry *Khata* lines (`SUM(Dr) === SUM(Cr)`), updates party sub-ledgers, and adjusts inventory within a single SQLite transaction.
- **Exact Integer Math (`src/shared/math.ts`)**: All monetary amounts are stored and computed in integer **paise** (`1 ₹ = 100 paise`), weights in integer **grams** (`1 Quintal = 100,000 grams`), and rates in **basis points** (`1% = 100 bps`).
- **Owned vs. Dalali Agency Stock Isolation (`AT-07`)**: `SGT_OWNED` stock updates weighted-average inventory valuation (`1301`), while `FARMER_AGENCY` lots track physical bags and weight without polluting SGT-owned inventory valuation.
- **Non-Automatic GST (`AT-11`, `DR-04`)**: GST (`CGST`, `SGST`, `IGST`) is strictly opt-in per line item (`gstApplicable: true`).
- **Controlled Reversal & Append-Only Audit (`AT-14`, `AT-15`)**: Posted financial documents cannot be hard-deleted; corrections use Credit Notes (`CN-*`) or Journal Reversals (`REV-*`), and closed business days block backdated postings unless explicitly reopened with an audit reason (`REOPEN_CLOSED_DAY`).

---

## 2. Quick Start & Deployment Guide

### Prerequisites
- **Node.js** 20+ and npm

### Local Setup
```bash
npm install
npm run dev
```
- The Express + Vite server listens on `http://localhost:3000`.
- Production build:
  ```bash
  npm run build
  npm start
  ```

### Database & Migration Management
- By default, SQLite stores data in `sgt_production.db` (override via `SGT_DB_PATH`).
- To purge any legacy/sample data while keeping all schema tables intact:
  ```bash
  npm run db:purge-sample-data
  ```

---

## 3. Administrator Guide (Initial Bootstrap & Configuration)
1. **First-Time Owner Bootstrap**:
   - On an empty database, create the initial `OWNER` account via the First-Time Setup screen (`POST /api/users`).
2. **Company Profile & Rule Settings (`Settings & Rules` tab)**:
   - Configure Company Legal Name, Kannada Title (`ಶ್ರೀ ಗುರು ಟ್ರೇಡರ್ಸ್`), APMC Yard Code, GSTIN, and Financial Year (`2025-26`).
   - Confirm **Interest Calculation Rules (`DR-01`)**: Method (`SIMPLE` / `COMPOUND`), Default Annual Rate (bps), Day-Count Basis (`ACT_365` / `ACT_360`), and Loan Recovery Order (`PRINCIPAL_FIRST` / `INTEREST_FIRST`).
   - Confirm **Trading & Mandi Fee Rules (`DR-02`, `DR-03`, `DR-06`, `DR-07`)**: Commission bps, Hamali per bag, Weighment fee, APMC Market Cess, and custom labels for *Niitu*, *Tukad*, *RMC*, *Andiges*, and *CST/Other Tax*.
3. **Role-Based Access Control (RBAC)**:
   - `OWNER`: Full system permissions including reopening closed days, unmasking KYC/bank fields, viewing restricted personal drawings, and modifying interest/tax rules.
   - `ACCOUNTANT`: Full accounting, billing, collections, expenses, and day-close permissions.
   - `TRADING_STAFF`: Farmer/Party registration, Commodity trading, Pattis, and Bills.
   - `CASHIER`: Cash/Bank books, Collections, and Loan disbursements.
   - `AUDITOR_VIEW_ONLY`: Read-only access to ledgers, reports, and audit logs (sensitive KYC and restricted personal drawings masked).

---

## 4. User Guide (Daily Workflow)
1. **Master Registration (`Farmers & Parties`)**:
   - Register Farmers (`SGT-FM-*`) and Buyers/Suppliers/Transporters (`SGT-PT-*`). Duplicate phone, bank account, KYC ID, or name+village combinations trigger real-time warnings (`AT-01`).
2. **Commodity & Stock Management (`Stock Status` & `Trading & Stock`)**:
   - Seed the 11 standard SRS agricultural commodities with one click or add custom crops.
   - Record `GOODS_IN` (Purchase / Farmer Inward) and `GOODS_OUT` (Sale / Dispatch) with exact bag count and net weight in quintals/kg.
3. **Pattis & Billing (`Pattis & Billing`)**:
   - **Farmer Patti (`SGT-FP-*`)**: Settle farmer crop lots, deduct commission/hamali/market fees, and automatically recover active Farmer Loan Principal & Accrued Interest (`AT-08`).
   - **Dalali Vikri Patti (`SGT-DV-*`) & Dalali Kharidi Patti (`SGT-DK-*`)**: Agency settlement slips with *Andiges*, *Niitu*, *Tukad*, and *RMC* fields (`DR-06`).
   - **Cash / Credit Bill (`SGT-CB-*`)**: Full tax/commercial invoice with Lorry/Driver transport details, Indian numbering amount in words, and Credit Note reversal (`CN-*`, `AT-14`).
4. **Collections, Expenses & Commitments (`Ops, GST & Day Close`)**:
   - Record partial or full Buyer Receipts (`SGT-RC-*`) with discount/write-off and real-time overdue aging (`0–7`, `8–15`, `16–30`, `30+` days, `AT-09`).
   - Record operational expenses, owner capital/drawings (`DR-12`), APMC/govt fees, chit funds, and insurance commitments (`SGT-EX-*`).
5. **Day Close, Validation & Backup (`Ops, GST & Day Close`)**:
   - Review the **Error & Validation Dashboard (`AT-13`)** and **Day-End Report (`AT-16`)**.
   - Lock the business day (**Close Day**, `AT-15`) and generate a **Checksummed Backup Snapshot (`SGT-BK-*`, `AT-18`)**, then run **Verify Integrity** to confirm SHA-256 and Trial Balance (`Dr === Cr`) invariants.

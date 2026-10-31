# SGT Decisions Register (SRS Section 24 & Business Rules)

All unresolved business rules identified in SRS Section 24 are implemented as database-driven settings in `company_settings` (with historical versioning in `policy_versions`) rather than hard-coded constants.

| ID | SRS Topic | Current Configured Default | Confirmation Status |
| :--- | :--- | :--- | :--- |
| **DR-01** | **Loan Interest & Recovery Policy** (Sec 5.2, 24) | **Simple Interest**, **18.00% p.a.** placeholder rate, **Actual/365** day-count, **Principal-First Recovery** (per Phase 1 user decision), round to nearest ₹1.00. | Configurable in UI · Pending Accountant Sign-off on final rate % |
| **DR-02** | **Commission & Hamali Rates** (Sec 7.1, 24) | **2.00% Commission** on crop value, **₹10.00 / bag Hamali**, non-taxable by default. | Configurable in UI · Pending Owner Confirmation |
| **DR-03** | **Quantity, Bag Weights & Conversions** (Sec 6.1, 24) | `1 Tonne = 10 Quintals = 1,000 kg = 1,000,000 g`. System strictly forbids assuming uniform bag weight without explicit commodity conversion setting. | **Enforced in Code & UI** |
| **DR-04** | **Stock Ownership & Valuation** (Sec 6.3, 7.2, 24) | Owned Stock vs Dalali Agency Stock tracked separately; Owned Stock valued via **Weighted Average Cost** (configurable to FIFO). | Configurable in UI · Pending Accountant Confirmation |
| **DR-05** | **Farmer Patti Deduction Order & Shortfall** (Sec 7.1, 24) | Gross Crop Value → Commission/Hamali/Other Deductions → Loan Principal Recovery → Loan Interest Recovery. Shortfall never creates negative payout; residual liability carries forward. | Planned for Chunk 5 |
| **DR-06** | **Dalali Labels ("niitu fee", "tukad fee", "RMC", "andiges")** (Sec 8.1, 8.2, 24) | Bilingual editable labels stored in `company_settings.custom_labels_json` (`Niitu / Weighing Fee`, `Tukad / Weighment Fee`, `RMC / Market Cess`, `Andiges / Lots`). | Configurable in UI · Pending Paper Form Sign-off |
| **DR-07** | **Cash/Credit Bill "CST" Field** (Sec 9.2, 14.3, 24) | Configurable label `Other Charge / Tax (Confirm CST)` disabled by default unless enabled per invoice/commodity. | Configurable in UI · Pending Owner Confirmation |
| **DR-08** | **GST Applicability** (Sec 8.2, 14.3, 24) | Zero automatic GST on primary agricultural produce; explicit per-commodity and per-bill tax profile. | Planned for Chunk 2 & 6 |
| **DR-09** | **Financial Year & Numbering Reset** (Sec 3, 24) | FY `2026-27` (`01-04-2026` to `31-03-2027`), configurable prefixes (`SGT-LN-`, `SGT-FP-`, etc.), cancelled numbers never reused. | **Implemented & Tested in Chunk 1** |
| **DR-10** | **Opening Balances As-Of Date** (Sec 10.3, 24) | Explicit `as_of_date`, source note, and Owner/Accountant approval required during setup. | Planned for Chunk 3 |
| **DR-11** | **Split Payments & Cheque Clearing** (Sec 12.3, 24) | Pending cheques excluded from cleared cash until confirmed; bounced cheques auto-reverse with audit trail. | Planned for Chunk 3 |
| **DR-12** | **Chit Fund Accounting Classification** (Sec 13.5, 24) | Configurable per chit/commitment (`ASSET_INVESTMENT`, `RECEIVABLE_ADVANCE`, `OPERATING_EXPENSE`). | Planned for Chunk 7 |
| **DR-13** | **SMS Provider & Templates** (Sec 16.3, 24) | Local Outbox Simulator with pluggable HTTP webhook adapter and Unicode English/Kannada templates (per Phase 1 user decision). | Planned for Chunk 8 |
| **DR-14** | **Access & Approval Thresholds** (Sec 2.2, 17.3, 24) | 5 Roles (`OWNER`, `ACCOUNTANT`, `TRADING_STAFF`, `CASHIER`, `AUDITOR`), masked farmer KYC for non-privileged roles, approval required for loans > ₹1,00,000 and rate/policy edits. | **Implemented & Tested in Chunk 1** |
| **DR-15** | **Hosting & Backup Policy** (Sec 18.2, 18.3, 24) | Node.js Express + SQLite WAL ACID database with encrypted backup/restore snapshot utility. | SQLite Engine Active · Backup UI in Chunk 9 |
| **DR-16** | **Bilingual Interface & Print Layouts** (Sec 18.2, 24) | Bilingual English + Kannada (`EN / ಕನ್ನಡ`) toggle across UI and print sheets (per Phase 1 user decision). | **Implemented in Chunk 1** |
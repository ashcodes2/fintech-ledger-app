# 🏦 Fintech Ledger — Banking & Double-Entry Accounting System

[![Live Demo](https://img.shields.io/badge/Demo-Vercel-black?style=flat-square&logo=vercel)](https://frontend-sable-seven-48.vercel.app)
[![API Status](https://img.shields.io/badge/API-Render-informational?style=flat-square)](https://banking-backend-ledger-3gzv.onrender.com)
[![React](https://img.shields.io/badge/Frontend-React_19-blue?style=flat-square&logo=react)](https://react.dev/)
[![Database](https://img.shields.io/badge/Database-MongoDB_Atlas-green?style=flat-square&logo=mongodb)](https://www.mongodb.com/)

A full-stack banking ledger platform engineered with double-entry accounting integrity, ACID-compliant multi-document transactions, and strict idempotency handling to prevent balance discrepancies and race conditions.

---

### ⚡ Transaction Lifecycle & ACID Guarantees
```text
[ Client Transfer Request ] 
           │
           ▼
[ Idempotency Verification ] ──(Duplicate)──> Return Cached Response
           │ (New)
           ▼
[ MongoDB Session Started ]
  ├── 1. Account Ownership & Positive Balance Check
  ├── 2. Atomic DEBIT Entry (Sender)
  ├── 3. Atomic CREDIT Entry (Receiver)
  └── 4. Commit Transaction (Session End)
           │
   (Failure / Network Drop) ──> Full Rollback (Zero Partial States)

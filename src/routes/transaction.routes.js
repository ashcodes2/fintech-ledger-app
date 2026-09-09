const { Router } = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const transactionController = require("../controllers/transaction.controller")

const transactionRoutes = Router();

/**
 * - POST /api/transactions/
 * - Create a new transaction
 */

transactionRoutes.post("/", authMiddleware.authMiddleware, transactionController.createTransaction)

/**
 * - POST /api/transactions/deposit
 * - Add money / deposit funds into user's own account
 */
transactionRoutes.post("/deposit", authMiddleware.authMiddleware, transactionController.depositMoneyController)


/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds transaction from system user
 */
transactionRoutes.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction)

/**
 * - GET /api/transactions/account/:accountId
 * - Get all transactions of an account (for passbook/history)
 */
transactionRoutes.get("/account/:accountId", authMiddleware.authMiddleware, transactionController.getAccountTransactions)

module.exports = transactionRoutes;
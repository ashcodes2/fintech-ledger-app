const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key
     * 3. Check account status
     * 4. Derive sender balance from ledger
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session
     * 10. Send email notification
 */

async function createTransaction(req, res) {

    /**
     * 1. Validate request
     */
    const {
        fromAccount,
        fromAccountNumber,
        toAccount,
        recipientAccountNumber,
        amount,
        idempotencyKey,
        description
    } = req.body

    const recipientIdentifier = recipientAccountNumber || toAccount
    const senderIdentifier = fromAccount || fromAccountNumber

    if (!senderIdentifier || !recipientIdentifier || !amount) {
        return res.status(400).json({
            message: "Sender account, recipient account number, and amount are required"
        })
    }

    const cleanRecipient = String(recipientIdentifier).trim()
    const cleanSender = String(senderIdentifier).trim()

    // Validate recipient: exactly 12 digits numeric (with ObjectId legacy fallback)
    let toUserAccount
    if (/^\d{12}$/.test(cleanRecipient)) {
        toUserAccount = await accountModel.findOne({ accountNumber: cleanRecipient })
    } else if (mongoose.Types.ObjectId.isValid(cleanRecipient)) {
        toUserAccount = await accountModel.findById(cleanRecipient)
    } else {
        return res.status(400).json({
            message: "Account number must be exactly 12 digits."
        })
    }

    if (!toUserAccount) {
        return res.status(404).json({
            message: "Recipient account not found"
        })
    }

    // Sender account must belong to the logged-in user
    let fromUserAccount
    if (/^\d{12}$/.test(cleanSender)) {
        fromUserAccount = await accountModel.findOne({
            accountNumber: cleanSender,
            user: req.user._id
        })
    } else if (mongoose.Types.ObjectId.isValid(cleanSender)) {
        fromUserAccount = await accountModel.findOne({
            _id: cleanSender,
            user: req.user._id
        })
    }

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "Invalid sender account or you do not own this account"
        })
    }

    // Self transfer validation
    if (
        fromUserAccount._id.toString() === toUserAccount._id.toString() ||
        (fromUserAccount.accountNumber && toUserAccount.accountNumber && fromUserAccount.accountNumber === toUserAccount.accountNumber)
    ) {
        return res.status(400).json({
            message: "You cannot transfer money to your own account."
        })
    }

    const numericAmount = Number(amount)

    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
            message: "Transaction amount must be a valid positive number"
        })
    }

    const finalIdempotencyKey = idempotencyKey || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    /**
     * 2. Validate idempotency key
     */
    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: finalIdempotencyKey
    })

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })
        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 3. Check account status
     */
    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both sender and recipient accounts must be ACTIVE to process transaction"
        })
    }

    /**
     * 4. Derive sender balance from ledger
     */
    const balance = await fromUserAccount.getBalance()

    if (balance < numericAmount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${numericAmount}`
        })
    }

    // Check if MongoDB supports transactions (requires replica set)
    const isReplicaSet = Boolean(mongoose.connection.client?.topology?.description?.setName)
    const session = isReplicaSet ? await mongoose.startSession() : null
    if (session) {
        session.startTransaction()
    }
    const sessionOptions = session ? { session } : {}

    let transaction;
    try {
        /**
         * 5. Create transaction (PENDING)
         */
        transaction = (await transactionModel.create([ {
            fromAccount: fromUserAccount._id,
            toAccount: toUserAccount._id,
            amount: numericAmount,
            idempotencyKey: finalIdempotencyKey,
            status: "PENDING"
        } ], sessionOptions))[ 0 ]

        await ledgerModel.create([ {
            account: fromUserAccount._id,
            amount: numericAmount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], sessionOptions)

        await ledgerModel.create([ {
            account: toUserAccount._id,
            amount: numericAmount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], sessionOptions)

        const completedTransaction = await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { ...sessionOptions, new: true }
        )

        if (session) {
            await session.commitTransaction()
            session.endSession()
        }

        /**
         * 6. Send email notification (Fail-safe, non-blocking)
         */
        emailService.sendTransactionEmail(
            req.user.email,
            req.user.name,
            numericAmount,
            toUserAccount.accountNumber || toUserAccount._id
        ).catch(err => {
            console.log("Email notification skipped/failed:", err.message)
        });

        return res.status(201).json({
            message: "Transaction completed successfully",
            transaction: completedTransaction,
            recipientAccountNumber: toUserAccount.accountNumber,
            senderAccountNumber: fromUserAccount.accountNumber
        })
    } catch (error) {
        console.error("Transaction error:", error)
        if (session) {
            await session.abortTransaction()
            session.endSession()
        }
        return res.status(500).json({
            message: "Transaction failed, please retry after sometime",
            error: error.message
        })
    }
}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    const numericAmount = Number(amount)

    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
            message: "Amount must be a valid positive number"
        })
    }

    const cleanToAccount = String(toAccount).trim()
    const isTwelveDigit = /^\d{12}$/.test(cleanToAccount)
    const isObjectId = mongoose.Types.ObjectId.isValid(cleanToAccount)

    if (!isTwelveDigit && !isObjectId) {
        return res.status(400).json({
            message: "Invalid toAccount identifier format"
        })
    }

    const toUserAccount = isTwelveDigit
        ? await accountModel.findOne({ accountNumber: cleanToAccount })
        : await accountModel.findById(cleanToAccount)

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }

    const isReplicaSet = Boolean(mongoose.connection.client?.topology?.description?.setName)
    const session = isReplicaSet ? await mongoose.startSession() : null
    if (session) {
        session.startTransaction()
    }
    const sessionOptions = session ? { session } : {}

    try {
        const transaction = new transactionModel({
            fromAccount: fromUserAccount._id,
            toAccount,
            amount: numericAmount,
            idempotencyKey,
            status: "PENDING"
        })

        await ledgerModel.create([ {
            account: fromUserAccount._id,
            amount: numericAmount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], sessionOptions)

        await ledgerModel.create([ {
            account: toAccount,
            amount: numericAmount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], sessionOptions)

        transaction.status = "COMPLETED"
        await transaction.save(sessionOptions)

        if (session) {
            await session.commitTransaction()
            session.endSession()
        }

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction: transaction
        })
    } catch (error) {
        if (session) {
            await session.abortTransaction()
            session.endSession()
        }
        return res.status(500).json({
            message: "Failed to add initial funds"
        })
    }

}

// Controller to get transactions for an account (Needed for Frontend Passbook)
async function getAccountTransactions(req, res) {
    try {
        const { accountId } = req.params

        const cleanAccountId = String(accountId).trim()
        const isTwelveDigit = /^\d{12}$/.test(cleanAccountId)
        const isObjectId = mongoose.Types.ObjectId.isValid(cleanAccountId)

        if (!isTwelveDigit && !isObjectId) {
            return res.status(400).json({
                message: "Invalid account identifier format"
            })
        }

        const query = isTwelveDigit
            ? { accountNumber: cleanAccountId, user: req.user._id }
            : { _id: cleanAccountId, user: req.user._id }

        // Verify that the account exists and belongs to the logged-in user
        const account = await accountModel.findOne(query)

        if (!account) {
            return res.status(404).json({
                message: "Account not found or access denied"
            })
        }

        const transactions = await transactionModel.find({
            $or: [{ fromAccount: account._id }, { toAccount: account._id }]
        })
        .populate('fromAccount', 'accountNumber status currency')
        .populate('toAccount', 'accountNumber status currency')
        .sort({ createdAt: -1 })

        return res.status(200).json({
            transactions
        })
    } catch (error) {
        return res.status(500).json({
            message: "Error fetching transactions"
        })
    }
}

/**
 * - Deposit / Add Money Controller
 * - POST /api/transactions/deposit
 */
async function depositMoneyController(req, res) {
    try {
        const { accountId, accountNumber, amount, idempotencyKey, description } = req.body
        const targetAccount = accountNumber || accountId

        if (!targetAccount || amount === undefined || amount === null) {
            return res.status(400).json({
                message: "AccountId or accountNumber, and amount are required"
            })
        }

        const cleanTarget = String(targetAccount).trim()
        const isTwelveDigit = /^\d{12}$/.test(cleanTarget)
        const isObjectId = mongoose.Types.ObjectId.isValid(cleanTarget)

        if (!isTwelveDigit && !isObjectId) {
            return res.status(400).json({
                message: "Invalid account identifier format"
            })
        }

        const numericAmount = Number(amount)

        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({
                message: "Deposit amount must be a valid positive number"
            })
        }

        // Account ownership check: must belong to the logged-in user
        const query = isTwelveDigit
            ? { accountNumber: cleanTarget, user: req.user._id }
            : { _id: cleanTarget, user: req.user._id }

        const userAccount = await accountModel.findOne(query)

        if (!userAccount) {
            return res.status(404).json({
                message: "Account not found or access denied"
            })
        }

        if (userAccount.status !== "ACTIVE") {
            return res.status(400).json({
                message: `Account is not active (current status: ${userAccount.status})`
            })
        }

        const finalKey = idempotencyKey || `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

        // Check if transaction with this idempotency key already exists
        const existingTx = await transactionModel.findOne({ idempotencyKey: finalKey })
        if (existingTx) {
            return res.status(409).json({
                message: "Duplicate transaction. This idempotency key has already been processed."
            })
        }

        const isReplicaSet = Boolean(mongoose.connection.client?.topology?.description?.setName)
        const session = isReplicaSet ? await mongoose.startSession() : null
        if (session) {
            session.startTransaction()
        }
        const sessionOptions = session ? { session } : {}

        try {
            const transaction = (await transactionModel.create([ {
                fromAccount: userAccount._id,
                toAccount: userAccount._id,
                amount: numericAmount,
                idempotencyKey: finalKey,
                status: "COMPLETED"
            } ], sessionOptions))[ 0 ]

            await ledgerModel.create([ {
                account: userAccount._id,
                amount: numericAmount,
                transaction: transaction._id,
                type: "CREDIT"
            } ], sessionOptions)

            if (session) {
                await session.commitTransaction()
                session.endSession()
            }

            const newBalance = await userAccount.getBalance()

            return res.status(201).json({
                message: "Deposit completed successfully",
                transaction,
                accountNumber: userAccount.accountNumber,
                balance: newBalance
            })
        } catch (error) {
            console.error("Deposit transaction error:", error)
            if (session) {
                await session.abortTransaction()
                session.endSession()
            }
            return res.status(500).json({
                message: "Deposit failed, please retry after sometime",
                error: error.message
            })
        }
    } catch (error) {
        return res.status(500).json({
            message: "Internal server error during deposit",
            error: error.message
        })
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getAccountTransactions,
    depositMoneyController
}


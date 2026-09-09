const accountModel = require("../models/account.model");
const mongoose = require("mongoose");
const { generateAccountNumber } = require("../utils/accountNumber.util");

async function createAccountController(req, res) {
    try {
        const user = req.user;

        let account;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            try {
                const accountNumber = await generateAccountNumber(accountModel);
                account = await accountModel.create({
                    user: user._id,
                    accountNumber
                });
                break;
            } catch (createErr) {
                // If collision on unique index, retry with fresh number
                if (createErr.code === 11000 && createErr.keyPattern?.accountNumber) {
                    attempts++;
                    continue;
                }
                throw createErr;
            }
        }

        if (!account) {
            return res.status(500).json({
                message: "Failed to generate a unique account number, please try again"
            });
        }

        res.status(201).json({
            account
        });
    } catch (error) {
        console.error("Error creating account:", error);
        res.status(500).json({
            message: "Error creating account",
            error: error.message
        });
    }
}

async function getUserAccountsController(req, res) {
    try {
        const accounts = await accountModel.find({ user: req.user._id });

        // Calculate balance for each account using ledger aggregation
        const accountsWithBalance = await Promise.all(
            accounts.map(async (acc) => {
                const balance = await acc.getBalance();
                return {
                    ...acc.toObject(),
                    balance
                };
            })
        );

        res.status(200).json({
            accounts: accountsWithBalance
        });
    } catch (error) {
        res.status(500).json({
            message: "Error fetching accounts"
        });
    }
}

async function getAccountBalanceController(req, res) {
    try {
        const { accountId } = req.params;

        const isTwelveDigit = /^\d{12}$/.test(accountId);
        const isObjectId = mongoose.Types.ObjectId.isValid(accountId);

        if (!isTwelveDigit && !isObjectId) {
            return res.status(400).json({
                message: "Invalid account identifier format"
            });
        }

        const query = isTwelveDigit
            ? { accountNumber: accountId, user: req.user._id }
            : { _id: accountId, user: req.user._id };

        const account = await accountModel.findOne(query);

        if (!account) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        const balance = await account.getBalance();

        res.status(200).json({
            accountId: account._id,
            accountNumber: account.accountNumber,
            balance: balance
        });
    } catch (error) {
        res.status(500).json({
            message: "Error fetching balance"
        });
    }
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController
}
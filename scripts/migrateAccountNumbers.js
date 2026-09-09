/**
 * Database Migration Script: Safe 12-Digit Account Number Population
 *
 * Requirements:
 * 1. Connects via process.env.MONGO_URI
 * 2. Identifies accounts missing an accountNumber (or null/empty)
 * 3. Assigns sequential unique 12-digit account numbers (starting from 100000000001)
 * 4. Idempotent: Accounts already having an accountNumber are completely untouched
 * 5. Safe: Does NOT delete, reset, or modify any user, ledger, transaction, or balance
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function runMigration() {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        console.error("ERROR: MONGO_URI environment variable is not defined in .env");
        process.exit(1);
    }

    console.log("--------------------------------------------------");
    console.log("Connecting to MongoDB Atlas...");
    console.log("--------------------------------------------------");

    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to database successfully.");

        const accountCollection = mongoose.connection.collection('accounts');

        // Find existing maximum 12-digit numeric accountNumber to avoid any overlap
        const existingAccountsWithNum = await accountCollection
            .find({ accountNumber: { $exists: true, $ne: null, $regex: /^\d{12}$/ } })
            .sort({ accountNumber: -1 })
            .limit(1)
            .toArray();

        let currentSequence = 100000000001n;
        if (existingAccountsWithNum.length > 0 && existingAccountsWithNum[0].accountNumber) {
            const maxVal = BigInt(existingAccountsWithNum[0].accountNumber);
            currentSequence = maxVal + 1n;
        }

        // Find accounts missing an accountNumber
        const accountsToMigrate = await accountCollection.find({
            $or: [
                { accountNumber: { $exists: false } },
                { accountNumber: null },
                { accountNumber: "" }
            ]
        }).sort({ createdAt: 1, _id: 1 }).toArray();

        console.log(`Accounts found without account numbers: ${accountsToMigrate.length}`);

        if (accountsToMigrate.length === 0) {
            console.log("All accounts already possess valid account numbers. No migration needed.");
            await mongoose.disconnect();
            console.log("Disconnected from database.");
            return;
        }

        console.log("Applying 12-digit account numbers...");

        let updatedCount = 0;
        for (const account of accountsToMigrate) {
            let candidate = String(currentSequence).padStart(12, '0');

            // Double check uniqueness against collection
            let alreadyExists = await accountCollection.findOne({ accountNumber: candidate });
            while (alreadyExists) {
                currentSequence++;
                candidate = String(currentSequence).padStart(12, '0');
                alreadyExists = await accountCollection.findOne({ accountNumber: candidate });
            }

            await accountCollection.updateOne(
                { _id: account._id },
                { $set: { accountNumber: candidate } }
            );

            console.log(`Updated: Account ${account._id} -> ${candidate}`);
            currentSequence++;
            updatedCount++;
        }

        // Ensure unique index exists on accountNumber
        try {
            await accountCollection.createIndex({ accountNumber: 1 }, { unique: true });
            console.log("Unique index verified on 'accountNumber'.");
        } catch (idxErr) {
            console.log("Note on index creation:", idxErr.message);
        }

        console.log("--------------------------------------------------");
        console.log(`Migration completed successfully. Total accounts updated: ${updatedCount}`);
        console.log("--------------------------------------------------");

    } catch (error) {
        console.error("Migration failed with error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

if (require.main === module) {
    runMigration();
}

module.exports = runMigration;

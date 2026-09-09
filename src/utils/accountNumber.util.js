/**
 * Banking Account Number Utility
 * Generates unique, 12-digit numeric account numbers in a sequential banking sequence
 * starting from 100000000001.
 */

async function generateAccountNumber(accountModel) {
    const STARTING_ACCOUNT_NUMBER = 100000000001n;

    // Find the latest account that has a 12-digit numeric account number
    const latestAccount = await accountModel
        .findOne({ accountNumber: /^\d{12}$/ })
        .sort({ accountNumber: -1 })
        .select('accountNumber')
        .lean();

    let candidateNumber;

    if (latestAccount && latestAccount.accountNumber) {
        try {
            const nextVal = BigInt(latestAccount.accountNumber) + 1n;
            candidateNumber = String(nextVal).padStart(12, '0');
        } catch {
            candidateNumber = String(STARTING_ACCOUNT_NUMBER);
        }
    } else {
        candidateNumber = String(STARTING_ACCOUNT_NUMBER);
    }

    // Safety loop to ensure collision avoidance in concurrent scenarios
    let isTaken = await accountModel.exists({ accountNumber: candidateNumber });
    let safetyCounter = 0;

    while (isTaken && safetyCounter < 100) {
        const nextVal = BigInt(candidateNumber) + 1n;
        candidateNumber = String(nextVal).padStart(12, '0');
        isTaken = await accountModel.exists({ accountNumber: candidateNumber });
        safetyCounter++;
    }

    if (candidateNumber.length !== 12 || !/^\d{12}$/.test(candidateNumber)) {
        throw new Error(`Generated invalid account number: ${candidateNumber}`);
    }

    return candidateNumber;
}

module.exports = {
    generateAccountNumber
};

const mongoose = require("mongoose")
const dns = require("dns")

// Ensure Node.js resolves MongoDB Atlas SRV records properly on Windows
if (process.platform === 'win32') {
    try {
        dns.setServers(["8.8.8.8", "8.8.4.4"])
    } catch (e) {}
}

function connectToDB() {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/banking-ledger"

    mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
    })
        .then(() => {
            console.log("server is connected to DB")
        })
        .catch(err => {
            console.log("Error connecting to DB:", err.message)
            process.exit(1)
        })

}


module.exports = connectToDB
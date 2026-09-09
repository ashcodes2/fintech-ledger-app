# Fintech Ledger — Banking & Double-Entry Accounting System

A full-stack banking and ledger platform built with Node.js, Express, MongoDB (Atlas), and a React + Vite frontend. It features double-entry bookkeeping, ACID-compliant money transfers, account management, live passbook history, and JWT authentication.

---

## 🌐 Live Deployments

- **Frontend (Vercel):** [https://frontend-sable-seven-48.vercel.app](https://frontend-sable-seven-48.vercel.app/)
- **Backend API (Render):** [https://banking-backend-ledger-3gzv.onrender.com](https://banking-backend-ledger-3gzv.onrender.com/)

---

## Features

- **Authentication & Security:** User registration and login with JWT stored in HTTP-only cookies and Authorization header fallback, plus token blacklisting on logout.
- **Bank Account Management:** Open multiple bank accounts per user, switch active accounts, and view real-time balances.
- **Double-Entry Ledger:** Every financial transfer creates balanced `DEBIT` and `CREDIT` entries in the ledger to maintain mathematical consistency.
- **Money Transfers:** Transfer funds between accounts with account ownership verification, non-zero positive amount checks, and balance validation.
- **Passbook / Statement:** View chronological transaction history with visual credit/debit indicators and reference keys.
- **Responsive UI:** Clean, production-ready banking interface built with React 19 and modular CSS, prioritizing low bundle size and sub-second load times.

---

## Tech Stack

- **Backend:** Node.js, Express 5, MongoDB / Mongoose, JSON Web Tokens (JWT), Cookie-Parser, CORS, Nodemailer.
- **Frontend:** React 19, Vite, Vanilla CSS.
- **Database:** MongoDB Atlas (Cloud Database).

---

## Project Structure

```
├── .env.example          # Sample environment configuration
├── .gitignore            # Git ignore rules for secrets and dependencies
├── package.json          # Backend dependencies and scripts
├── server.js             # HTTP server entrypoint
├── src/                  # Backend source code
│   ├── app.js            # Express app configuration & middleware
│   ├── config/           # Database connection (Atlas DNS & Mongoose)
│   ├── controllers/      # Auth, Account, and Transaction controllers
│   ├── middleware/       # JWT auth & system user verification
│   ├── models/           # Mongoose schemas (User, Account, Transaction, Ledger, BlackList)
│   ├── routes/           # Express API route definitions
│   └── services/         # Email notification service
└── frontend/             # React + Vite frontend
    ├── index.html        # Main HTML file
    ├── package.json      # Frontend dependencies and scripts
    └── src/
        ├── api.js        # API fetch wrapper for backend endpoints
        ├── App.jsx       # Complete dashboard, transfer modal, and passbook
        ├── App.css       # Clean banking stylesheet (responsive, no purple slop)
        └── main.jsx      # React root mount
```

---

## Environment Variables

Create a `.env` file in the project root directory based on `.env.example`:

```env
PORT=3000

# MongoDB URI (Local or MongoDB Atlas)
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/banking-ledger?retryWrites=true&w=majority

# JWT Secret for Authentication
JWT_SECRET=your_jwt_secret_key_here

# Optional: Email Service (Nodemailer OAuth2)
EMAIL_USER=your_email@gmail.com
CLIENT_ID=your_oauth_client_id
CLIENT_SECRET=your_oauth_client_secret
REFRESH_TOKEN=your_oauth_refresh_token
```

> **Note:** Never commit the `.env` file containing real credentials to GitHub.

---

## Backend Setup

1. Install root dependencies:
   ```bash
   npm install
   ```

2. Configure your `.env` file as shown above.

3. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend server will run at `http://localhost:3000`.

---

## Frontend Setup

1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will run at `http://localhost:5173`.

---

## MongoDB Atlas Setup

1. Log into your **MongoDB Atlas** console and create a database named `banking-ledger`.
2. Under **Network Access**, ensure your IP address is whitelisted (or `0.0.0.0/0` for development).
3. Under **Database Access**, create a database user and copy the connection string.
4. Paste the connection string into `MONGO_URI` in `.env`.
5. Because MongoDB Atlas is a replica set, multi-document ACID transactions and sessions are supported automatically.

---

## API Overview

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new user (`name`, `email`, `password`).
- `POST /api/auth/login` — Sign in and receive a JWT cookie and token.
- `GET /api/auth/me` — Retrieve the currently authenticated user's profile.
- `POST /api/auth/logout` — Invalidate the JWT token and clear auth cookies.

### Accounts (`/api/accounts`)
- `POST /api/accounts` — Open a new active bank account for the logged-in user.
- `GET /api/accounts` — List all accounts belonging to the user with real-time calculated ledger balance.
- `GET /api/accounts/balance/:accountId` — Get the current live balance for a specific account.

### Transactions (`/api/transactions`)
- `POST /api/transactions` — Transfer funds from one account to another (`fromAccount`, `toAccount`, `amount`).
- `POST /api/transactions/deposit` — Deposit / add money to user's own bank account (`accountId`, `amount`, `description`).
- `GET /api/transactions/account/:accountId` — Fetch passbook history for an account.


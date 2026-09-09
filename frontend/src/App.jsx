import React, { useState, useEffect } from 'react';
import {
  apiLogin,
  apiRegister,
  apiGetMe,
  apiLogout,
  apiGetAccounts,
  apiCreateAccount,
  apiSendMoney,
  apiDepositMoney,
  apiGetTransactions,
  setToken,
  getToken,
} from './api';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const [loadingApp, setLoadingApp] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [transferForm, setTransferForm] = useState({ toAccount: '', amount: '' });
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  const [depositForm, setDepositForm] = useState({ amount: '', description: '' });
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  const [alert, setAlert] = useState(null); // { type: 'error' | 'success', message: '' }
  const [copied, setCopied] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Listen for browser navigation / route changes
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  // Initial Check
  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) {
        setLoadingApp(false);
        return;
      }
      try {
        const res = await apiGetMe();
        if (res.user) {
          setUser(res.user);
          await loadAccounts();
        }
      } catch (err) {
        setToken(null);
      } finally {
        setLoadingApp(false);
      }
    };
    init();
  }, []);

  // Fetch accounts
  const loadAccounts = async () => {
    try {
      const res = await apiGetAccounts();
      const accList = res.accounts || [];
      setAccounts(accList);
      if (accList.length > 0) {
        // preserve or select first
        setActiveAccount((prev) => {
          const found = accList.find((a) => a._id === prev?._id);
          return found || accList[0];
        });
      } else {
        setActiveAccount(null);
      }
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  // Fetch transactions when activeAccount changes
  useEffect(() => {
    if (!activeAccount) {
      setTransactions([]);
      return;
    }
    const loadTx = async () => {
      setLoadingTx(true);
      try {
        const res = await apiGetTransactions(activeAccount._id);
        setTransactions(res.transactions || []);
      } catch (err) {
        showAlert('error', err.message);
      } finally {
        setLoadingTx(false);
      }
    };
    loadTx();
  }, [activeAccount?._id]);

  // Auth Submit
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAlert(null);
    try {
      if (authMode === 'register') {
        const res = await apiRegister(authForm.name, authForm.email, authForm.password);
        setToken(res.token);
        setUser(res.user);
        showAlert('success', 'Registration successful! Welcome.');
      } else {
        const res = await apiLogin(authForm.email, authForm.password);
        setToken(res.token);
        setUser(res.user);
      }
      await loadAccounts();
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (e) {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
      setAccounts([]);
      setActiveAccount(null);
      setTransactions([]);
    }
  };

  // Create new account
  const handleCreateAccount = async () => {
    setActionLoading(true);
    try {
      await apiCreateAccount();
      showAlert('success', 'New bank account opened successfully.');
      await loadAccounts();
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Refresh Accounts and Ledger
  const handleRefresh = async () => {
    setActionLoading(true);
    try {
      await loadAccounts();
      if (activeAccount) {
        const txRes = await apiGetTransactions(activeAccount._id);
        setTransactions(txRes.transactions || []);
      }
      showAlert('success', 'Data refreshed successfully.');
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Deposit / Add Money
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!activeAccount) return;
    const numericAmount = Number(depositForm.amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert('error', 'Please enter a valid positive deposit amount.');
      return;
    }
    setActionLoading(true);
    try {
      await apiDepositMoney(activeAccount._id, numericAmount, depositForm.description);
      showAlert('success', `Deposit of ₹${numericAmount.toLocaleString('en-IN')} completed successfully.`);
      setDepositForm({ amount: '', description: '' });
      setIsDepositOpen(false);
      // Reload accounts and transactions in real-time
      await loadAccounts();
      const txRes = await apiGetTransactions(activeAccount._id);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Transfer Money
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!activeAccount) return;
    const cleanToAccount = transferForm.toAccount.trim();
    if (!cleanToAccount || !transferForm.amount) {
      showAlert('error', 'Recipient Account Number and Amount are required.');
      return;
    }
    if (!/^\d{12}$/.test(cleanToAccount)) {
      showAlert('error', 'Account number must be exactly 12 digits.');
      return;
    }
    if (activeAccount.accountNumber && cleanToAccount === activeAccount.accountNumber) {
      showAlert('error', 'You cannot transfer money to your own account.');
      return;
    }
    const numericAmount = Number(transferForm.amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert('error', 'Please enter a valid positive transfer amount.');
      return;
    }
    if (numericAmount > (activeAccount.balance || 0)) {
      showAlert('error', `Insufficient balance. Current balance is ₹${Number(activeAccount.balance || 0).toLocaleString('en-IN')}`);
      return;
    }
    setActionLoading(true);
    try {
      await apiSendMoney(activeAccount._id, cleanToAccount, numericAmount);
      showAlert('success', `Transfer of ₹${numericAmount.toLocaleString('en-IN')} completed successfully.`);
      setTransferForm({ toAccount: '', amount: '' });
      setIsTransferOpen(false);
      // Reload accounts and transactions
      await loadAccounts();
      const txRes = await apiGetTransactions(activeAccount.accountNumber || activeAccount._id);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const copyAccountNumber = (accNumber) => {
    if (!accNumber) return;
    navigator.clipboard.writeText(accNumber);
    setCopied(true);
    showAlert('success', 'Account number copied.');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadingApp) {
    return (
      <div className="empty-state" style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
        <span className="spinner spinner-dark" style={{ width: 28, height: 28 }}></span>
        <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9375rem' }}>Loading Ledger Platform...</p>
      </div>
    );
  }

  // 404 Fallback View for any unknown path
  if (currentPath !== '/' && currentPath !== '') {
    return (
      <div className="not-found-wrapper">
        <div className="not-found-card">
          <span className="not-found-badge">Error 404</span>
          <h1 className="not-found-title">Page Not Found</h1>
          <p className="not-found-desc">
            The requested destination <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{currentPath}</code> does not exist on the Fintech Ledger platform.
          </p>
          <button onClick={navigateToHome} className="btn-primary" style={{ width: '100%' }}>
            Return to Banking Portal
          </button>
        </div>
      </div>
    );
  }

  // If not logged in, render Auth Screen
  if (!user) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Fintech Ledger</h1>
            <p className="auth-subtitle">
              {authMode === 'login' ? 'Sign in to access your accounts' : 'Create a new banking profile'}
            </p>
          </div>

          {alert && (
            <div className={`alert alert-${alert.type}`} role="alert">
              <div className="alert-content">
                <span className="alert-icon">{alert.type === 'success' ? '✓' : '⚠'}</span>
                <span>{alert.message}</span>
              </div>
              <button
                type="button"
                className="alert-close"
                onClick={() => setAlert(null)}
                aria-label="Dismiss alert"
              >
                &times;
              </button>
            </div>
          )}

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Enter full legal name"
                  className="form-input"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                required
                placeholder="name@domain.com"
                className="form-input"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Enter password (min. 6 characters)"
                className="form-input"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              />
            </div>

            <button type="submit" disabled={authLoading} className="btn-primary" style={{ marginTop: '0.5rem' }}>
              {authLoading ? (
                <>
                  <span className="spinner"></span>
                  {authMode === 'login' ? 'Signing In...' : 'Creating Profile...'}
                </>
              ) : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="auth-switch">
            {authMode === 'login' ? (
              <>
                Don't have an account?
                <button type="button" className="auth-link" onClick={() => { setAuthMode('register'); setAlert(null); }}>
                  Register here
                </button>
              </>
            ) : (
              <>
                Already registered?
                <button type="button" className="auth-link" onClick={() => { setAuthMode('login'); setAlert(null); }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div className="app-container">
      {/* Navigation */}
      <header className="navbar">
        <div className="brand" onClick={navigateToHome} style={{ cursor: 'pointer' }} title="Fintech Ledger Home">
          Fintech Ledger <span className="brand-badge">PROD</span>
        </div>
        <div className="nav-user">
          <div style={{ textAlign: 'right' }}>
            <div className="user-name" title={user.name}>{user.name}</div>
            <div className="user-email">{user.email}</div>
          </div>
          <button onClick={handleLogout} className="btn-logout">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {alert && (
          <div className={`alert alert-${alert.type}`} role="alert">
            <div className="alert-content">
              <span className="alert-icon">{alert.type === 'success' ? '✓' : '⚠'}</span>
              <span>{alert.message}</span>
            </div>
            <button
              type="button"
              className="alert-close"
              onClick={() => setAlert(null)}
              aria-label="Dismiss alert"
            >
              &times;
            </button>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Left Column: Accounts & Balance */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Your Bank Accounts</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={handleRefresh}
                  disabled={actionLoading}
                  className="btn-refresh"
                  title="Refresh Balance"
                >
                  {actionLoading ? <><span className="spinner spinner-dark"></span>Refreshing...</> : '↻ Refresh'}
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={actionLoading}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                >
                  {actionLoading ? <><span className="spinner spinner-dark"></span>Opening...</> : '+ New Account'}
                </button>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="empty-state-card">
                <span className="empty-state-icon">🏛️</span>
                <h3 className="empty-state-title">No Active Accounts</h3>
                <p className="empty-state-desc">
                  You haven't opened a bank account yet. Open your first 12-digit ledger account to start transacting.
                </p>
                <button
                  onClick={handleCreateAccount}
                  disabled={actionLoading}
                  className="btn-primary"
                  style={{ marginTop: '1rem' }}
                >
                  {actionLoading ? <><span className="spinner"></span>Opening Account...</> : '+ Open First Account'}
                </button>
              </div>
            ) : (
              <div className="account-selector">
                {accounts.map((acc) => (
                  <div
                    key={acc._id}
                    className={`account-item ${activeAccount?._id === acc._id ? 'active' : ''}`}
                    onClick={() => setActiveAccount(acc)}
                  >
                    <div className="account-item-top">
                      <span>Account ({acc.currency || 'INR'})</span>
                      <span className="status-badge status-active">{acc.status}</span>
                    </div>
                    <div className="account-balance-large">
                      ₹{Number(acc.balance || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="account-id-copy">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Account Number
                        </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '0.06em', color: 'var(--primary-dark)' }}>
                          {acc.accountNumber || acc._id}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyAccountNumber(acc.accountNumber || acc._id);
                        }}
                      >
                        {copied && activeAccount?._id === acc._id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeAccount && (
              <div className="btn-action-group">
                <button
                  onClick={() => setIsDepositOpen(true)}
                  className="btn-primary"
                  style={{ width: '100%', background: 'var(--credit)' }}
                >
                  + Add Money
                </button>
                <button
                  onClick={() => setIsTransferOpen(true)}
                  className="btn-secondary"
                  style={{ width: '100%' }}
                >
                  Send Money
                </button>
              </div>
            )}
          </section>

          {/* Right Column: Passbook / Transaction Statement */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Account Passbook & Ledger</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {transactions.length} record{transactions.length === 1 ? '' : 's'}
                </span>
                {activeAccount && (
                  <button
                    onClick={handleRefresh}
                    disabled={actionLoading || loadingTx}
                    className="btn-refresh"
                    title="Refresh Transactions"
                  >
                    ↻ Refresh
                  </button>
                )}
              </div>
            </div>

            {!activeAccount ? (
              <div className="empty-state-card">
                <span className="empty-state-icon">📋</span>
                <h3 className="empty-state-title">Select an Account</h3>
                <p className="empty-state-desc">
                  Choose an account from the left panel to view its real-time ledger entries and passbook statement.
                </p>
              </div>
            ) : loadingTx ? (
              <div className="empty-state-card">
                <span className="spinner spinner-dark" style={{ width: 22, height: 22, marginBottom: '0.5rem' }}></span>
                <p style={{ fontSize: '0.875rem' }}>Loading transaction ledger...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="empty-state-card">
                <span className="empty-state-icon">🧾</span>
                <h3 className="empty-state-title">No Transaction Records</h3>
                <p className="empty-state-desc">
                  No debits or credits recorded for this account yet. Deposit funds or send money to view double-entry statements.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setIsDepositOpen(true)}
                    className="btn-secondary"
                    style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
                  >
                    + Add Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(true)}
                    className="btn-secondary"
                    style={{ fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
                  >
                    Send Money
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop View: Full Table (shown >= 768px) */}
                <div className="table-container desktop-table-view">
                  <table className="passbook-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Counterparty / Details</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => {
                        const fromId = tx.fromAccount?._id ? tx.fromAccount._id.toString() : (tx.fromAccount?.toString() || '');
                        const toId = tx.toAccount?._id ? tx.toAccount._id.toString() : (tx.toAccount?.toString() || '');
                        const fromNum = tx.fromAccount?.accountNumber || fromId;
                        const toNum = tx.toAccount?.accountNumber || toId;

                        const isDeposit = Boolean(fromId && toId && fromId === toId);
                        const isDebit = !isDeposit && fromId === (activeAccount._id ? activeAccount._id.toString() : '');
                        return (
                          <tr key={tx._id}>
                            <td>
                              <span className={`tx-type ${isDebit ? 'tx-debit' : 'tx-credit'}`}>
                                {isDebit ? 'DEBIT' : 'CREDIT'}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600 }}>
                                {isDeposit
                                  ? 'Deposit / Added Funds'
                                  : isDebit
                                  ? `To: ${toNum}`
                                  : `From: ${fromNum}`}
                              </div>
                              <div style={{ fontSize: '0.6875rem', color: 'var(--text-light)' }}>
                                Ref: {tx.idempotencyKey}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: isDebit ? 'var(--debit)' : 'var(--credit)',
                              }}
                            >
                              {isDebit ? '-' : '+'}₹{Number(tx.amount).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Transaction Cards (shown < 768px) */}
                <div className="tx-mobile-list">
                  {transactions.map((tx) => {
                    const fromId = tx.fromAccount?._id ? tx.fromAccount._id.toString() : (tx.fromAccount?.toString() || '');
                    const toId = tx.toAccount?._id ? tx.toAccount._id.toString() : (tx.toAccount?.toString() || '');
                    const fromNum = tx.fromAccount?.accountNumber || fromId;
                    const toNum = tx.toAccount?.accountNumber || toId;

                    const isDeposit = Boolean(fromId && toId && fromId === toId);
                    const isDebit = !isDeposit && fromId === (activeAccount._id ? activeAccount._id.toString() : '');
                    return (
                      <div key={tx._id} className="tx-mobile-card">
                        <div className="tx-mobile-card-header">
                          <span className={`tx-type ${isDebit ? 'tx-debit' : 'tx-credit'}`}>
                            {isDebit ? 'DEBIT' : 'CREDIT'}
                          </span>
                          <span className={`tx-mobile-amount ${isDebit ? 'amount-debit' : 'amount-credit'}`}>
                            {isDebit ? '-' : '+'}₹{Number(tx.amount).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="tx-mobile-counterparty">
                          {isDeposit
                            ? 'Deposit / Added Funds'
                            : isDebit
                            ? `To: ${toNum}`
                            : `From: ${fromNum}`}
                        </div>
                        <div className="tx-mobile-card-footer">
                          <span className="tx-mobile-ref" title={tx.idempotencyKey}>
                            Ref: {tx.idempotencyKey}
                          </span>
                          <span className="tx-mobile-date">
                            {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Transfer Modal */}
      {isTransferOpen && (
        <div className="modal-overlay" onClick={() => setIsTransferOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Transfer Money</h3>
              <button className="modal-close" onClick={() => setIsTransferOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">From Account</label>
                <input
                  type="text"
                  disabled
                  className="form-input"
                  value={`Account No: ${activeAccount.accountNumber || activeAccount._id} (Balance: ₹${Number(activeAccount.balance || 0).toLocaleString('en-IN')})`}
                  style={{ background: 'var(--bg-subtle)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Recipient Account Number</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="Enter 12-digit account number"
                  className="form-input"
                  value={transferForm.toAccount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setTransferForm({ ...transferForm, toAccount: val });
                  }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  {transferForm.toAccount.length}/12 digits entered
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Amount (₹ INR)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="Enter transfer amount in ₹"
                  className="form-input"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsTransferOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  {actionLoading ? <><span className="spinner"></span>Transferring...</> : 'Send Funds'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit / Add Money Modal */}
      {isDepositOpen && activeAccount && (
        <div className="modal-overlay" onClick={() => setIsDepositOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Add Money / Deposit</h3>
              <button className="modal-close" onClick={() => setIsDepositOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleDepositSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Target Account</label>
                <input
                  type="text"
                  disabled
                  className="form-input"
                  value={`Account No: ${activeAccount.accountNumber || activeAccount._id} (Current Balance: ₹${Number(activeAccount.balance || 0).toLocaleString('en-IN')})`}
                  style={{ background: 'var(--bg-subtle)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deposit Amount (₹ INR)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="Enter deposit amount in ₹"
                  className="form-input"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Deposit reference note (optional)"
                  className="form-input"
                  value={depositForm.description}
                  onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsDepositOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn-primary"
                  style={{ flex: 1, background: 'var(--credit)' }}
                >
                  {actionLoading ? <><span className="spinner"></span>Depositing...</> : 'Add Money'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


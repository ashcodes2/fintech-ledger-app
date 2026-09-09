const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// Authentication
export const apiRegister = (name, email, password) =>
  request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });

export const apiLogin = (email, password) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const apiGetMe = () => request('/auth/me');

export const apiLogout = () =>
  request('/auth/logout', {
    method: 'POST',
  });

// Accounts
export const apiGetAccounts = () => request('/accounts');

export const apiCreateAccount = () =>
  request('/accounts', {
    method: 'POST',
    body: JSON.stringify({}),
  });

// Transactions
export const apiSendMoney = (fromAccount, recipientAccountNumber, amount) =>
  request('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      fromAccount,
      recipientAccountNumber,
      toAccount: recipientAccountNumber,
      amount: Number(amount),
      idempotencyKey: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    }),
  });

export const apiGetTransactions = (accountId) =>
  request(`/transactions/account/${accountId}`);

export const apiDepositMoney = (accountId, amount, description) =>
  request('/transactions/deposit', {
    method: 'POST',
    body: JSON.stringify({
      accountId,
      amount: Number(amount),
      description: description || 'Added money to account',
      idempotencyKey: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    }),
  });


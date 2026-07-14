/* API client, global state, and formatting helpers. No build step — plain JS, loaded as a script. */

const Auth = {
  token: localStorage.getItem("auth_token") || null,
  user: null,
  setSession(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem("auth_token", token);
  },
  clear() {
    this.token = null;
    this.user = null;
    localStorage.removeItem("auth_token");
  },
};

const Api = (() => {
  async function request(method, path, body, params) {
    let url = path;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    const opts = { method, headers: {} };
    if (Auth.token) opts.headers["X-Auth-Token"] = Auth.token;
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail || JSON.stringify(data);
      } catch (e) { /* ignore */ }
      if (res.status === 401 && Auth.token) {
        Auth.clear();
        if (typeof App !== "undefined" && App.boot) App.boot();
      }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    get: (path, params) => request("GET", path, undefined, params),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
    del: (path) => request("DELETE", path),

    // Auth
    authStatus: () => Api.get("/api/auth/status"),
    bootstrapAdmin: (payload) => Api.post("/api/auth/bootstrap-admin", payload),
    login: (payload) => Api.post("/api/auth/login", payload),
    logout: () => Api.post("/api/auth/logout"),
    me: () => Api.get("/api/auth/me"),
    listUsers: () => Api.get("/api/auth/users"),
    createUser: (payload) => Api.post("/api/auth/users", payload),
    updateUser: (id, payload) => Api.put(`/api/auth/users/${id}`, payload),

    // Setup
    setupStatus: () => Api.get("/api/setup/status"),
    setupDefaults: (taxName, country) => Api.get("/api/setup/defaults", { tax_name: taxName, country }),
    setupComplete: (payload) => Api.post("/api/setup/complete", payload),

    // Company / masters
    getCompany: () => Api.get("/api/company"),
    updateCompany: (payload) => Api.put("/api/company", payload),
    listTaxRates: () => Api.get("/api/tax-rates"),
    createTaxRate: (payload) => Api.post("/api/tax-rates", payload),
    updateTaxRate: (id, payload) => Api.put(`/api/tax-rates/${id}`, payload),
    deleteTaxRate: (id) => Api.del(`/api/tax-rates/${id}`),
    listOwners: () => Api.get("/api/owners"),
    createOwner: (payload) => Api.post("/api/owners", payload),
    updateOwner: (id, payload) => Api.put(`/api/owners/${id}`, payload),
    deactivateOwner: (id) => Api.del(`/api/owners/${id}`),

    listCustomers: () => Api.get("/api/customers"),
    createCustomer: (payload) => Api.post("/api/customers", payload),
    updateCustomer: (id, payload) => Api.put(`/api/customers/${id}`, payload),
    deactivateCustomer: (id) => Api.del(`/api/customers/${id}`),

    listVendors: () => Api.get("/api/vendors"),
    createVendor: (payload) => Api.post("/api/vendors", payload),
    updateVendor: (id, payload) => Api.put(`/api/vendors/${id}`, payload),
    deactivateVendor: (id) => Api.del(`/api/vendors/${id}`),

    // Accounts
    listAccounts: (params) => Api.get("/api/accounts", params),
    createAccount: (payload) => Api.post("/api/accounts", payload),
    updateAccount: (id, payload) => Api.put(`/api/accounts/${id}`, payload),
    deactivateAccount: (id) => Api.post(`/api/accounts/${id}/deactivate`),
    activateAccount: (id) => Api.post(`/api/accounts/${id}/activate`),
    deleteAccount: (id) => Api.del(`/api/accounts/${id}`),

    // Journal
    listJournal: (params) => Api.get("/api/journal", params),
    getJournalEntry: (id) => Api.get(`/api/journal/${id}`),
    createJournalEntry: (payload) => Api.post("/api/journal", payload),
    updateJournalEntry: (id, payload) => Api.put(`/api/journal/${id}`, payload),
    voidJournalEntry: (id) => Api.post(`/api/journal/${id}/void`),
    unvoidJournalEntry: (id) => Api.post(`/api/journal/${id}/unvoid`),
    toggleLineCleared: (lineId) => Api.patch(`/api/journal/lines/${lineId}/toggle-cleared`),
    addAttachment: (entryId, payload) => Api.post(`/api/journal/${entryId}/attachments`, payload),
    deleteAttachment: (id) => Api.del(`/api/journal/attachments/${id}`),

    // Reports
    dashboard: () => Api.get("/api/reports/dashboard"),
    trialBalance: (asOf) => Api.get("/api/reports/trial-balance", { as_of: asOf }),
    generalLedger: (accountId, params) => Api.get(`/api/reports/general-ledger/${accountId}`, params),
    profitLoss: (params) => Api.get("/api/reports/profit-loss", params),
    balanceSheet: (asOf) => Api.get("/api/reports/balance-sheet", { as_of: asOf }),
    cashFlow: (params) => Api.get("/api/reports/cash-flow", params),
    ratios: (asOf) => Api.get("/api/reports/ratios", { as_of: asOf }),
    taxRegister: (granularity) => Api.get("/api/reports/tax-register", { granularity }),
    salesRegister: (params) => Api.get("/api/reports/sales-register", params),
    purchaseRegister: (params) => Api.get("/api/reports/purchase-register", params),
    expenseRegister: (params) => Api.get("/api/reports/expense-register", params),
    cashBook: (params) => Api.get("/api/reports/cash-book", params),
    bankBook: (params) => Api.get("/api/reports/bank-book", params),
    capitalAccounts: () => Api.get("/api/reports/capital-accounts"),
    capitalContributions: () => Api.get("/api/reports/capital-contributions"),
    monthlyTrend: (monthsBack) => Api.get("/api/reports/monthly-trend", { months_back: monthsBack }),
    bankReconciliationPreview: (accountId, params) => Api.get(`/api/reports/bank-reconciliation/${accountId}`, params),
    saveBankReconciliation: (payload) => Api.post("/api/reports/bank-reconciliation", payload),
    bankReconciliationHistory: (accountId) => Api.get("/api/reports/bank-reconciliation-history", { account_id: accountId }),
    parseBankStatement: (payload) => Api.post("/api/reports/bank-statement/parse", payload),
    clearMatchedStatementLines: (lineIds) => Api.post("/api/reports/bank-statement/clear-matched", { line_ids: lineIds }),
    createEntriesFromStatement: (payload) => Api.post("/api/reports/bank-statement/create-entries", payload),

    // Assets
    listAssets: () => Api.get("/api/assets"),
    createAsset: (payload) => Api.post("/api/assets", payload),
    updateAsset: (id, payload) => Api.put(`/api/assets/${id}`, payload),
    disposeAsset: (id, disposedDate) => Api.post(`/api/assets/${id}/dispose?disposed_date=${encodeURIComponent(disposedDate)}`),
    deleteAsset: (id) => Api.del(`/api/assets/${id}`),
    assetDepreciationSchedule: (id) => Api.get(`/api/assets/${id}/depreciation-schedule`),

    // Loans
    listLoans: () => Api.get("/api/loans"),
    createLoan: (payload) => Api.post("/api/loans", payload),
    updateLoan: (id, payload) => Api.put(`/api/loans/${id}`, payload),
    closeLoan: (id) => Api.del(`/api/loans/${id}`),
    loanSchedule: (id) => Api.get(`/api/loans/${id}/schedule`),

    // Invoices
    listInvoices: (docType) => Api.get("/api/invoices", { doc_type: docType }),
    getInvoice: (id) => Api.get(`/api/invoices/${id}`),
    createInvoice: (payload) => Api.post("/api/invoices", payload),
    generateInvoiceFromEntry: (entryId, docType) => Api.post(`/api/invoices/from-journal-entry/${entryId}?doc_type=${encodeURIComponent(docType)}`),
    convertQuoteToInvoice: (id) => Api.post(`/api/invoices/${id}/convert-to-invoice`),

    // Recurring invoices
    listRecurring: () => Api.get("/api/recurring-invoices"),
    createRecurring: (payload) => Api.post("/api/recurring-invoices", payload),
    updateRecurring: (id, payload) => Api.put(`/api/recurring-invoices/${id}`, payload),
    deleteRecurring: (id) => Api.del(`/api/recurring-invoices/${id}`),
    generateDueRecurring: () => Api.post("/api/recurring-invoices/generate-due"),

    // Inventory
    listItems: (params) => Api.get("/api/items", params),
    createItem: (payload) => Api.post("/api/items", payload),
    updateItem: (id, payload) => Api.put(`/api/items/${id}`, payload),
    deactivateItem: (id) => Api.post(`/api/items/${id}/deactivate`),
    activateItem: (id) => Api.post(`/api/items/${id}/activate`),
    deleteItem: (id) => Api.del(`/api/items/${id}`),
    listItemMovements: (id) => Api.get(`/api/items/${id}/movements`),
    addItemMovement: (id, payload) => Api.post(`/api/items/${id}/movements`, payload),
    stockRegister: () => Api.get("/api/inventory/stock-register"),

    // Payroll
    listEmployees: (params) => Api.get("/api/employees", params),
    createEmployee: (payload) => Api.post("/api/employees", payload),
    updateEmployee: (id, payload) => Api.put(`/api/employees/${id}`, payload),
    deactivateEmployee: (id) => Api.post(`/api/employees/${id}/deactivate`),
    activateEmployee: (id) => Api.post(`/api/employees/${id}/activate`),
    listDeductionTypes: () => Api.get("/api/payroll-deduction-types"),
    createDeductionType: (payload) => Api.post("/api/payroll-deduction-types", payload),
    deleteDeductionType: (id) => Api.del(`/api/payroll-deduction-types/${id}`),
    listPayrollRuns: () => Api.get("/api/payroll-runs"),
    getPayrollRun: (id) => Api.get(`/api/payroll-runs/${id}`),
    createPayrollRun: (payload) => Api.post("/api/payroll-runs", payload),
    postPayrollRun: (id) => Api.post(`/api/payroll-runs/${id}/post`),
    deletePayrollRun: (id) => Api.del(`/api/payroll-runs/${id}`),
    updateInvoiceStatus: (id, status) => Api.put(`/api/invoices/${id}?status=${encodeURIComponent(status)}`),
    deleteInvoice: (id) => Api.del(`/api/invoices/${id}`),
  };
})();

/* ---------------- Global state ---------------- */

const State = {
  company: null,
  accounts: [],
  taxRates: [],
  owners: [],
  items: [],

  async loadAll() {
    const [company, accounts, taxRates, owners, items] = await Promise.all([
      Api.getCompany(),
      Api.listAccounts({ include_inactive: true }),
      Api.listTaxRates(),
      Api.listOwners(),
      Api.listItems(),
    ]);
    this.company = company;
    this.accounts = accounts;
    this.taxRates = taxRates;
    this.owners = owners;
    this.items = items;
  },

  activeAccounts() {
    return this.accounts.filter((a) => a.is_active);
  },
};

/* ---------------- Formatting helpers ---------------- */

function fmtMoney(amount) {
  if (amount === null || amount === undefined) return "—";
  const symbol = State.company ? State.company.currency_symbol : "$";
  const n = Number(amount);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${symbol}${abs}`;
}

function fmtNum(n, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPercent(value, decimals = 1) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}

function fmtRatio(value, decimals = 2) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(decimals)}x`;
}

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d + (typeof d === "string" && d.length === 10 ? "T00:00:00" : ""));
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function emptyState(icon, title, message, actionHtml) {
  return `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${actionHtml || ""}
    </div>`;
}

function toast(message, isError) {
  let holder = document.getElementById("toast-holder");
  if (!holder) {
    holder = document.createElement("div");
    holder.id = "toast-holder";
    holder.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:999;display:flex;flex-direction:column;gap:8px;";
    document.body.appendChild(holder);
  }
  const t = document.createElement("div");
  t.style.cssText = `background:${isError ? "#d9534f" : "#1c2531"};color:white;padding:10px 16px;border-radius:6px;font-size:0.85rem;box-shadow:0 4px 16px rgba(0,0,0,0.25);max-width:360px;`;
  t.textContent = message;
  holder.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

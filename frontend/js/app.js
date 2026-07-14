/* App shell: sidebar nav, router, modal helpers, bootstrap. */

const NAV = [
  { section: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "🏠", view: () => Dashboard },
  ] },
  { section: "Transactions", items: [
    { key: "journal", label: "Journal Entries", icon: "📝", view: () => JournalView },
    { key: "invoices", label: "Invoice Generator", icon: "🧾", view: () => InvoicesView },
    { key: "receipts", label: "Receipt Generator", icon: "🧾", view: () => ReceiptsView },
    { key: "quotes", label: "Quotes / Estimates", icon: "📋", view: () => QuotesView },
    { key: "purchase-orders", label: "Purchase Orders", icon: "📦", view: () => PurchaseOrdersView },
    { key: "recurring", label: "Recurring Invoices", icon: "🔁", view: () => RecurringInvoicesView },
  ] },
  { section: "Ledgers & Statements", items: [
    { key: "ledger", label: "General Ledger", icon: "📒", view: () => LedgerView },
    { key: "trial-balance", label: "Trial Balance", icon: "⚖️", view: () => TrialBalanceView },
    { key: "profit-loss", label: "Profit & Loss", icon: "📈", view: () => ProfitLossView },
    { key: "balance-sheet", label: "Balance Sheet", icon: "🏛️", view: () => BalanceSheetView },
    { key: "cash-flow", label: "Cash Flow Statement", icon: "💧", view: () => CashFlowView },
    { key: "ratios", label: "Financial Ratios", icon: "🧮", view: () => RatiosView },
  ] },
  { section: "Registers", items: [
    { key: "sales-register", label: "Sales Register", icon: "🛒", view: () => SalesRegisterView },
    { key: "purchase-register", label: "Purchase Register", icon: "📦", view: () => PurchaseRegisterView },
    { key: "expense-register", label: "Expense Register", icon: "🧾", view: () => ExpenseRegisterView },
    { key: "cash-book", label: "Cash Book", icon: "💵", view: () => CashBookView },
    { key: "bank-book", label: "Bank Book", icon: "🏦", view: () => BankBookView },
    { key: "tax-register", label: "Tax Register", icon: "🧾", view: () => TaxRegisterView },
    { key: "bank-reconciliation", label: "Bank Reconciliation", icon: "🔄", view: () => BankReconciliationView },
  ] },
  { section: "Capital", items: [
    { key: "capital-accounts", label: "Capital Accounts", icon: "🤝", view: () => CapitalAccountsView },
    { key: "capital-contributions", label: "Capital Contribution Log", icon: "💰", view: () => CapitalContributionsView },
  ] },
  { section: "Assets & Loans", items: [
    { key: "assets", label: "Fixed Asset Register", icon: "🖥️", view: () => AssetsView },
    { key: "loans", label: "Loan Register", icon: "🏦", view: () => LoansView },
  ] },
  { section: "Inventory", items: [
    { key: "items", label: "Items", icon: "📦", view: () => ItemsView },
    { key: "stock-register", label: "Stock Register", icon: "📊", view: () => StockRegisterView },
  ] },
  { section: "Payroll", items: [
    { key: "employees", label: "Employees", icon: "🧑‍💼", view: () => EmployeesView },
    { key: "payroll-runs", label: "Payroll Runs", icon: "💵", view: () => PayrollView },
  ] },
  { section: "Masters", items: [
    { key: "customers", label: "Customer Register", icon: "🧑‍💼", view: () => CustomersView },
    { key: "vendors", label: "Vendor Register", icon: "🏭", view: () => VendorsView },
  ] },
  { section: "Setup", items: [
    { key: "settings", label: "Company Info / Settings", icon: "⚙️", view: () => SettingsView },
    { key: "coa", label: "Chart of Accounts", icon: "📊", view: () => AccountsView },
  ] },
];

const App = (() => {
  let currentKey = "dashboard";

  function findNavItem(key) {
    for (const group of NAV) {
      const item = group.items.find((i) => i.key === key);
      if (item) return item;
    }
    return null;
  }

  function renderSidebar() {
    const nav = document.getElementById("sb-nav");
    nav.innerHTML = NAV.map((group) => `
      <div class="nav-group">
        <div class="nav-group-label">${group.section}</div>
        ${group.items.map((item) => `<div class="nav-item ${item.key === currentKey ? "active" : ""}" data-key="${item.key}"><span class="nav-icon">${item.icon}</span>${item.label}</div>`).join("")}
      </div>`).join("");
    nav.querySelectorAll(".nav-item").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.key));
    });
  }

  function refreshShell() {
    document.getElementById("sb-company-name").textContent = State.company.name;
    document.getElementById("sb-company-meta").textContent = `${State.company.legal_structure} · FY starts ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][State.company.fy_start_month - 1]}`;
    document.getElementById("topbar-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const logoEl = document.getElementById("sb-company-logo");
    if (State.company.logo_data) {
      logoEl.src = State.company.logo_data;
      logoEl.style.display = "";
    } else {
      logoEl.style.display = "none";
    }
    const userFooter = document.getElementById("sb-user-footer");
    if (Auth.user) {
      userFooter.style.display = "";
      userFooter.innerHTML = `<span>👤 ${escapeHtml(Auth.user.username)} <span class="text-muted">(${Auth.user.role})</span></span><button class="sb-logout" id="sb-logout-btn">Log Out</button>`;
      document.getElementById("sb-logout-btn").addEventListener("click", async () => {
        await Api.logout().catch(() => {});
        Auth.clear();
        boot();
      });
    } else {
      userFooter.style.display = "none";
    }
  }

  async function navigate(key, opts) {
    const item = findNavItem(key);
    if (!item) return;
    currentKey = key;
    renderSidebar();
    document.getElementById("view-title").textContent = item.label;
    document.getElementById("view-sub").textContent = "";
    const contentEl = document.getElementById("view-content");
    contentEl.innerHTML = `<div class="text-muted">Loading…</div>`;
    try {
      await item.view().render(contentEl, opts);
    } catch (err) {
      console.error(err);
      contentEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Something went wrong</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  function openModal(innerHtml, opts) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal ${opts && opts.wide ? "wide" : ""}">${innerHtml}</div></div>`;
    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });
  }

  function closeModal() {
    document.getElementById("modal-root").innerHTML = "";
  }

  function showLoginOnly() {
    document.getElementById("sidebar").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    const contentEl = document.getElementById("view-content");
    document.querySelector(".main").style.padding = "0";
    contentEl.style.padding = "0";
    LoginScreen.init(contentEl, () => {
      document.querySelector(".main").style.padding = "";
      contentEl.style.padding = "";
      boot();
    });
  }

  async function boot() {
    const authStatus = await Api.authStatus();
    if (authStatus.auth_enabled) {
      if (!Auth.token) { showLoginOnly(); return; }
      try {
        Auth.user = await Api.me();
      } catch (err) {
        showLoginOnly();
        return;
      }
    }
    const status = await Api.setupStatus();
    if (!status.setup_complete) {
      document.getElementById("sidebar").style.display = "none";
      document.querySelector(".topbar").style.display = "none";
      const contentEl = document.getElementById("view-content");
      document.querySelector(".main").style.padding = "0";
      contentEl.style.padding = "0";
      await Wizard.init(contentEl, async () => {
        await State.loadAll();
        document.getElementById("sidebar").style.display = "";
        document.querySelector(".topbar").style.display = "";
        contentEl.style.padding = "";
        refreshShell();
        renderSidebar();
        navigate("dashboard");
      });
      return;
    }
    await State.loadAll();
    refreshShell();
    renderSidebar();
    navigate("dashboard");
    Api.generateDueRecurring()
      .then((res) => { if (res.count > 0) toast(`Generated ${res.count} recurring document(s): ${res.generated.join(", ")}`); })
      .catch(() => { /* non-critical background check */ });
  }

  return { navigate, openModal, closeModal, refreshShell, boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.boot().catch((err) => {
    console.error(err);
    document.getElementById("view-content").innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Failed to start</h3><p>${escapeHtml(err.message)}</p></div>`;
  });

  const exportMenu = document.getElementById("export-menu");
  document.getElementById("export-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("open");
  });
  document.getElementById("export-menu-list").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportMenu.classList.remove("open");
      Export.run(btn.dataset.format);
    });
  });
  document.addEventListener("click", () => exportMenu.classList.remove("open"));
});

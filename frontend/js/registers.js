/* Sales/Purchase/Expense registers, Cash/Bank Book, Tax Register, Bank Reconciliation. */

function dateFilterToolbar(onChange) {
  return `
    <div class="toolbar">
      <div class="filters">
        <div><label>From</label><input type="date" id="rg-start" /></div>
        <div><label>To</label><input type="date" id="rg-end" /></div>
      </div>
    </div>`;
}

function bindDateFilter(load) {
  document.getElementById("rg-start").addEventListener("change", load);
  document.getElementById("rg-end").addEventListener("change", load);
}

const SalesRegisterView = (() => {
  async function render(container) {
    container.innerHTML = dateFilterToolbar() + `<div id="rg-results"></div>`;
    const load = async () => {
      const params = { start_date: document.getElementById("rg-start").value || undefined, end_date: document.getElementById("rg-end").value || undefined };
      const data = await Api.salesRegister(params);
      renderRegister(document.getElementById("rg-results"), data, "sale", "🧾", "No sales yet", "Sales entries (voucher type: Sales) will show up here with their tax breakup.");
    };
    bindDateFilter(load);
    load();
  }
  return { render };
})();

const PurchaseRegisterView = (() => {
  async function render(container) {
    container.innerHTML = dateFilterToolbar() + `<div id="rg-results"></div>`;
    const load = async () => {
      const params = { start_date: document.getElementById("rg-start").value || undefined, end_date: document.getElementById("rg-end").value || undefined };
      const data = await Api.purchaseRegister(params);
      renderRegister(document.getElementById("rg-results"), data, "purchase", "📦", "No purchases yet", "Purchase entries (voucher type: Purchase) will show up here with their tax breakup.");
    };
    bindDateFilter(load);
    load();
  }
  return { render };
})();

function renderRegister(results, data, kind, icon, emptyTitle, emptyMsg) {
  if (data.rows.length === 0) {
    results.innerHTML = emptyState(icon, emptyTitle, emptyMsg);
    return;
  }
  results.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Voucher No.</th><th>Party</th><th>Narration</th><th class="num">Net</th><th class="num">Tax</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          ${data.rows.map((r) => `
            <tr>
              <td>${fmtDate(r.date)}</td><td>${r.voucher_no}</td><td>${escapeHtml(r.party_name || "—")}</td>
              <td>${escapeHtml(r.narration || "")}</td>
              <td class="num">${fmtMoney(r.net)}</td><td class="num">${fmtMoney(r.tax)}</td><td class="num">${fmtMoney(r.total)}</td>
              <td>${r.payment_status === "Paid" ? '<span class="badge green">Paid</span>' : '<span class="badge gray">Unpaid</span>'}</td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="num">${fmtMoney(data.total_net)}</td><td class="num">${fmtMoney(data.total_tax)}</td><td class="num">${fmtMoney(data.total_gross)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

const ExpenseRegisterView = (() => {
  async function render(container) {
    container.innerHTML = dateFilterToolbar() + `<div id="rg-results"></div>`;
    const load = async () => {
      const params = { start_date: document.getElementById("rg-start").value || undefined, end_date: document.getElementById("rg-end").value || undefined };
      const data = await Api.expenseRegister(params);
      const results = document.getElementById("rg-results");
      if (data.rows.length === 0) {
        results.innerHTML = emptyState("🧮", "No expenses yet", "Every line posted to an Expense account will show up here.");
        return;
      }
      results.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Voucher No.</th><th>Account</th><th>Description</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${data.rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.voucher_no}</td><td>${escapeHtml(r.account_name)}</td><td>${escapeHtml(r.description || "")}</td><td class="num">${fmtMoney(r.amount)}</td></tr>`).join("")}
            </tbody>
            <tfoot><tr><td colspan="4">Total</td><td class="num">${fmtMoney(data.total)}</td></tr></tfoot>
          </table>
        </div>`;
    };
    bindDateFilter(load);
    load();
  }
  return { render };
})();

function bookView(fetchFn, label, icon) {
  return async function render(container) {
    container.innerHTML = dateFilterToolbar() + `<div id="rg-results"></div>`;
    const load = async () => {
      const params = { start_date: document.getElementById("rg-start").value || undefined, end_date: document.getElementById("rg-end").value || undefined };
      const data = await fetchFn(params);
      const results = document.getElementById("rg-results");
      if (!data.account || data.lines.length === 0) {
        results.innerHTML = emptyState(icon, `No ${label} activity yet`, `Every transaction touching ${label} will appear here with a running balance.`);
        return;
      }
      results.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Voucher No.</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Running Balance</th></tr></thead>
            <tbody>
              ${data.lines.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${l.voucher_no}</td><td>${escapeHtml(l.particulars)}</td><td class="num">${l.debit_amount ? fmtMoney(l.debit_amount) : ""}</td><td class="num">${l.credit_amount ? fmtMoney(l.credit_amount) : ""}</td><td class="num">${fmtMoney(l.running_balance)}</td></tr>`).join("")}
            </tbody>
            <tfoot><tr><td colspan="5">Closing Balance</td><td class="num">${fmtMoney(data.closing_balance)}</td></tr></tfoot>
          </table>
        </div>`;
    };
    bindDateFilter(load);
    load();
  };
}

const CashBookView = (() => ({ render: bookView(Api.cashBook, "Cash", "💵") }))();
const BankBookView = (() => ({ render: bookView(Api.bankBook, "Bank", "🏦") }))();

const TaxRegisterView = (() => {
  async function render(container) {
    container.innerHTML = `
      <div class="toolbar">
        <div class="filters"><div><label>Group By</label>
          <select id="tr-granularity">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </div></div>
      </div>
      <div id="tr-results"></div>`;
    const load = async () => {
      const data = await Api.taxRegister(document.getElementById("tr-granularity").value);
      const results = document.getElementById("tr-results");
      if (data.rows.length === 0) {
        results.innerHTML = emptyState("🧾", `No ${data.tax_name} activity yet`, `Output and input ${data.tax_name} from your Sales and Purchase entries will summarize here.`);
        return;
      }
      results.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
          <div class="kpi-card"><div class="kpi-label">Output ${data.tax_name} (Sales)</div><div class="kpi-value">${fmtMoney(data.total_output_tax)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Input ${data.tax_name} (Purchases)</div><div class="kpi-value">${fmtMoney(data.total_input_tax)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Net Payable</div><div class="kpi-value ${data.net_payable >= 0 ? "negative" : "positive"}">${fmtMoney(data.net_payable)}</div></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Period</th><th class="num">Output ${data.tax_name}</th><th class="num">Input ${data.tax_name}</th><th class="num">Net Payable / (Receivable)</th></tr></thead>
            <tbody>
              ${data.rows.map((r) => `<tr><td>${r.period}</td><td class="num">${fmtMoney(r.output_tax)}</td><td class="num">${fmtMoney(r.input_tax)}</td><td class="num">${fmtMoney(r.net_payable)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    };
    document.getElementById("tr-granularity").addEventListener("change", load);
    load();
  }
  return { render };
})();

const BankReconciliationView = (() => {
  let parsedRows = [];

  async function render(container) {
    const cashBankAccounts = State.activeAccounts().filter((a) => a.name === "Cash" || a.name === "Bank");
    container.innerHTML = `
      <div class="card" style="margin-bottom:20px;">
        <h3>Import Bank Statement</h3>
        <p class="text-muted" style="font-size:0.82rem;margin-top:-6px;">Upload a CSV or OFX/QFX export from your bank. Rows that match an existing unreconciled line (same amount, within 5 days) are cleared automatically; anything left over can be turned into new journal entries in one click.</p>
        <input type="file" id="bi-file" accept=".csv,.ofx,.qfx,text/csv" style="display:none;" />
        <button class="btn secondary small" id="bi-choose">Choose Statement File</button>
        <span class="text-muted" id="bi-filename" style="font-size:0.82rem;margin-left:8px;"></span>
        <div id="bi-results" style="margin-top:14px;"></div>
      </div>
      <div class="toolbar">
        <div class="filters">
          <div><label>Account</label>
            <select id="br-account">${cashBankAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
          </div>
          <div><label>Statement Date</label><input type="date" id="br-date" value="${todayStr()}" /></div>
          <div><label>Statement Balance</label><input type="number" step="0.01" id="br-balance" value="0" /></div>
        </div>
        <button class="btn" id="br-save">Save Reconciliation</button>
      </div>
      <div id="br-results"></div>`;

    const fileInput = document.getElementById("bi-file");
    document.getElementById("bi-choose").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      document.getElementById("bi-filename").textContent = file.name;
      const content = await file.text();
      const accountId = Number(document.getElementById("br-account").value);
      try {
        const res = await Api.parseBankStatement({ account_id: accountId, filename: file.name, content });
        parsedRows = res.rows;
        renderImportResults(container, accountId);
        toast(`Parsed ${res.rows.length} row(s): ${res.matched_count} matched, ${res.unmatched_count} unmatched`);
      } catch (err) {
        toast(err.message, true);
      }
    });

    const load = async () => {
      const accountId = Number(document.getElementById("br-account").value);
      if (!accountId) return;
      const statementBalance = Number(document.getElementById("br-balance").value) || 0;
      const statementDate = document.getElementById("br-date").value;
      const data = await Api.bankReconciliationPreview(accountId, { statement_balance: statementBalance, statement_date: statementDate });
      const results = document.getElementById("br-results");
      results.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px;">
          <div class="kpi-card"><div class="kpi-label">Book Balance</div><div class="kpi-value">${fmtMoney(data.book_balance)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Outstanding Deposits</div><div class="kpi-value">${fmtMoney(data.outstanding_deposits)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Outstanding Withdrawals</div><div class="kpi-value">${fmtMoney(data.outstanding_withdrawals)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Difference</div><div class="kpi-value ${Math.abs(data.difference) < 0.01 ? "positive" : "negative"}">${fmtMoney(data.difference)}</div></div>
        </div>
        <div class="flex-row" style="margin-bottom:12px;">
          <span class="badge ${data.is_reconciled ? "green" : "red"}">${data.is_reconciled ? "✓ Reconciled" : "✗ Not yet reconciled"}</span>
          <span class="text-muted" style="font-size:0.82rem;">Tick lines as "cleared" once they appear on your bank statement.</span>
        </div>
        ${data.lines.length === 0 ? emptyState("🏦", "No activity yet", "Lines posted to this account will appear here for reconciliation.") : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cleared</th><th>Date</th><th>Voucher No.</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
            <tbody>
              ${data.lines.map((l) => `
                <tr>
                  <td><input type="checkbox" class="br-clear" data-line="${l.line_id}" ${l.is_cleared ? "checked" : ""} style="width:auto;" /></td>
                  <td>${fmtDate(l.date)}</td><td>${l.voucher_no}</td><td>${escapeHtml(l.particulars)}</td>
                  <td class="num">${l.debit_amount ? fmtMoney(l.debit_amount) : ""}</td><td class="num">${l.credit_amount ? fmtMoney(l.credit_amount) : ""}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}`;
      results.querySelectorAll(".br-clear").forEach((cb) => cb.addEventListener("change", async () => {
        await Api.toggleLineCleared(Number(cb.dataset.line));
        load();
      }));
    };
    document.getElementById("br-account").addEventListener("change", load);
    document.getElementById("br-date").addEventListener("change", load);
    document.getElementById("br-balance").addEventListener("input", load);
    document.getElementById("br-save").addEventListener("click", async () => {
      const accountId = Number(document.getElementById("br-account").value);
      const statementBalance = Number(document.getElementById("br-balance").value) || 0;
      const statementDate = document.getElementById("br-date").value;
      await Api.saveBankReconciliation({ account_id: accountId, statement_date: statementDate, statement_balance: statementBalance });
      toast("Reconciliation saved");
    });
    if (cashBankAccounts.length > 0) load();
    else document.getElementById("br-results").innerHTML = emptyState("🏦", "No Cash or Bank account", "Add a Cash or Bank account in Chart of Accounts first.");
  }

  function renderImportResults(container, accountId) {
    const results = document.getElementById("bi-results");
    if (!results) return;
    if (parsedRows.length === 0) {
      results.innerHTML = `<p class="text-muted" style="font-size:0.82rem;">No rows found in that file.</p>`;
      return;
    }
    const matched = parsedRows.filter((r) => r.matched_line_id !== null);
    const unmatched = parsedRows.filter((r) => r.matched_line_id === null);
    const accounts = State.activeAccounts().filter((a) => a.id !== accountId);
    results.innerHTML = `
      <div class="table-wrap" style="max-height:280px;overflow-y:auto;">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${parsedRows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.description)}</td><td class="num">${fmtMoney(r.amount)}</td><td>${r.matched_line_id !== null ? '<span class="badge green">Matched</span>' : '<span class="badge amber">Unmatched</span>'}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="flex-row" style="margin-top:12px;gap:14px;flex-wrap:wrap;">
        <button class="btn secondary small" id="bi-clear-matched" ${matched.length === 0 ? "disabled" : ""}>Clear ${matched.length} Matched Line(s)</button>
        ${unmatched.length > 0 ? `
        <div class="flex-row" style="gap:8px;align-items:center;">
          <span class="text-muted" style="font-size:0.82rem;">Post ${unmatched.length} unmatched as new entries against:</span>
          <select id="bi-offset-account">${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join("")}</select>
          <button class="btn small" id="bi-create-entries">Create Entries</button>
        </div>` : ""}
      </div>`;
    document.getElementById("bi-clear-matched").addEventListener("click", async () => {
      const lineIds = matched.map((r) => r.matched_line_id);
      const res = await Api.clearMatchedStatementLines(lineIds);
      toast(`Cleared ${res.cleared} line(s)`);
      parsedRows = [];
      render(container);
    });
    const createBtn = document.getElementById("bi-create-entries");
    if (createBtn) createBtn.addEventListener("click", async () => {
      const offsetAccountId = Number(document.getElementById("bi-offset-account").value);
      const res = await Api.createEntriesFromStatement({
        account_id: accountId,
        offset_account_id: offsetAccountId,
        rows: unmatched.map((r) => ({ date: r.date, description: r.description, amount: r.amount })),
      });
      toast(`Created ${res.count} journal entries`);
      parsedRows = [];
      render(container);
    });
  }

  return { render };
})();

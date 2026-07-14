/* Profit & Loss, Balance Sheet, Cash Flow Statement, Financial Ratios. */

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, date.getDate());
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function fyStartForDate(date, fyStartMonth) {
  const y = date.getMonth() + 1 >= fyStartMonth ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(y, fyStartMonth - 1, 1);
}

function computePeriodRange(granularity) {
  const fyStartMonth = State.company.fy_start_month;
  const today = new Date();
  if (granularity === "monthly") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: toIso(start), end: toIso(end) };
  }
  if (granularity === "quarterly") {
    const fyStart = fyStartForDate(today, fyStartMonth);
    const monthsSince = (today.getFullYear() - fyStart.getFullYear()) * 12 + (today.getMonth() - fyStart.getMonth());
    const qStart = addMonths(fyStart, Math.floor(monthsSince / 3) * 3);
    const qEnd = new Date(addMonths(qStart, 3).getTime() - 86400000);
    return { start: toIso(qStart), end: toIso(qEnd) };
  }
  if (granularity === "annual") {
    const fyStart = fyStartForDate(today, fyStartMonth);
    const fyEnd = new Date(addMonths(fyStart, 12).getTime() - 86400000);
    return { start: toIso(fyStart), end: toIso(fyEnd) };
  }
  return { start: undefined, end: toIso(today) };
}

function periodToolbar(id) {
  return `
    <div class="toolbar">
      <div class="filters">
        <div><label>Period</label>
          <select id="${id}-granularity">
            <option value="monthly">This Month</option>
            <option value="quarterly">This Quarter</option>
            <option value="annual" selected>This Financial Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        <div id="${id}-custom-range" style="display:none;">
          <label>From</label><input type="date" id="${id}-start" />
        </div>
        <div id="${id}-custom-range-end" style="display:none;">
          <label>To</label><input type="date" id="${id}-end" />
        </div>
      </div>
    </div>`;
}

function bindPeriodToolbar(id, onChange) {
  const sel = document.getElementById(`${id}-granularity`);
  const custom1 = document.getElementById(`${id}-custom-range`);
  const custom2 = document.getElementById(`${id}-custom-range-end`);
  function getRange() {
    if (sel.value === "custom") {
      return { start: document.getElementById(`${id}-start`).value || undefined, end: document.getElementById(`${id}-end`).value || undefined };
    }
    return computePeriodRange(sel.value);
  }
  sel.addEventListener("change", () => {
    const isCustom = sel.value === "custom";
    custom1.style.display = isCustom ? "block" : "none";
    custom2.style.display = isCustom ? "block" : "none";
    onChange(getRange());
  });
  document.getElementById(`${id}-start`).addEventListener("change", () => onChange(getRange()));
  document.getElementById(`${id}-end`).addEventListener("change", () => onChange(getRange()));
  return getRange;
}

const ProfitLossView = (() => {
  async function render(container) {
    container.innerHTML = periodToolbar("pl") + `<div id="pl-results"></div>`;
    const load = async (range) => {
      const data = await Api.profitLoss({ start_date: range.start, end_date: range.end });
      const results = document.getElementById("pl-results");
      if (data.income.length === 0 && data.expenses.length === 0) {
        results.innerHTML = emptyState("📈", "Nothing to report yet", "Post income and expense journal entries to see your Profit & Loss statement.");
        return;
      }
      results.innerHTML = `
        <div class="chart-grid" style="grid-template-columns:1fr 1fr;">
          <div class="card">
            <h3>Income</h3>
            <div class="table-wrap"><table>
              <tbody>${data.income.map((i) => `<tr><td>${escapeHtml(i.name)}</td><td class="num">${fmtMoney(i.amount)}</td></tr>`).join("") || `<tr><td colspan="2" class="text-muted">No income this period</td></tr>`}</tbody>
              <tfoot><tr><td>Total Income</td><td class="num">${fmtMoney(data.total_income)}</td></tr></tfoot>
            </table></div>
          </div>
          <div class="card">
            <h3>Expenses</h3>
            <div class="table-wrap"><table>
              <tbody>${data.expenses.map((i) => `<tr><td>${escapeHtml(i.name)}</td><td class="num">${fmtMoney(i.amount)}</td></tr>`).join("") || `<tr><td colspan="2" class="text-muted">No expenses this period</td></tr>`}</tbody>
              <tfoot><tr><td>Total Expenses</td><td class="num">${fmtMoney(data.total_expense)}</td></tr></tfoot>
            </table></div>
          </div>
        </div>
        <div class="card" style="max-width:400px;">
          <h3>Net Profit</h3>
          <div class="kpi-value ${data.net_profit >= 0 ? "positive" : "negative"}" style="font-size:1.7rem;">${fmtMoney(data.net_profit)}</div>
        </div>`;
    };
    const getRange = bindPeriodToolbar("pl", load);
    load(getRange());
  }
  return { render };
})();

const BalanceSheetView = (() => {
  async function render(container) {
    container.innerHTML = `
      <div class="toolbar"><div class="filters"><div><label>As of</label><input type="date" id="bs-date" value="${todayStr()}" /></div></div></div>
      <div id="bs-results"></div>`;
    const load = async () => {
      const asOf = document.getElementById("bs-date").value || undefined;
      const data = await Api.balanceSheet(asOf);
      const results = document.getElementById("bs-results");
      if (data.assets.length === 0 && data.liabilities.length === 0 && data.capital.length === 0) {
        results.innerHTML = emptyState("🏛️", "Nothing to report yet", "Your Balance Sheet will populate once you post journal entries.");
        return;
      }
      results.innerHTML = `
        <div class="flex-row" style="margin-bottom:14px;">
          <span class="badge ${data.is_balanced ? "green" : "red"}" style="font-size:0.82rem;">${data.is_balanced ? "✓ Balanced (Assets = Liabilities + Capital)" : "✗ Out of Balance"}</span>
        </div>
        <div class="chart-grid" style="grid-template-columns:1fr 1fr;">
          <div class="card">
            <h3>Assets</h3>
            <div class="table-wrap"><table><tbody>
              ${data.assets.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td class="num">${fmtMoney(a.amount)}</td></tr>`).join("") || `<tr><td class="text-muted">No assets</td></tr>`}
            </tbody><tfoot><tr><td>Total Assets</td><td class="num">${fmtMoney(data.total_assets)}</td></tr></tfoot></table></div>
          </div>
          <div class="card">
            <h3>Liabilities</h3>
            <div class="table-wrap"><table><tbody>
              ${data.liabilities.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td class="num">${fmtMoney(a.amount)}</td></tr>`).join("") || `<tr><td class="text-muted">No liabilities</td></tr>`}
            </tbody><tfoot><tr><td>Total Liabilities</td><td class="num">${fmtMoney(data.total_liabilities)}</td></tr></tfoot></table></div>
            <h3 style="margin-top:18px;">Capital</h3>
            <div class="table-wrap"><table><tbody>
              ${data.capital.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td class="num">${fmtMoney(a.amount)}</td></tr>`).join("")}
              <tr><td>Current Period Profit</td><td class="num">${fmtMoney(data.current_period_profit)}</td></tr>
            </tbody><tfoot><tr><td>Total Capital</td><td class="num">${fmtMoney(data.total_capital)}</td></tr></tfoot></table></div>
          </div>
        </div>`;
    };
    document.getElementById("bs-date").addEventListener("change", load);
    load();
  }
  return { render };
})();

const CashFlowView = (() => {
  async function render(container) {
    container.innerHTML = periodToolbar("cf") + `<div id="cf-results"></div>`;
    const load = async (range) => {
      const data = await Api.cashFlow({ start_date: range.start, end_date: range.end });
      const results = document.getElementById("cf-results");
      if (data.operating === 0 && data.investing === 0 && data.financing === 0) {
        results.innerHTML = emptyState("💧", "No cash movement yet", "Cash inflows and outflows will be categorized here as Operating, Investing, or Financing.");
        return;
      }
      results.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="kpi-card"><div class="kpi-label">Operating Activities</div><div class="kpi-value ${data.operating >= 0 ? "positive" : "negative"}">${fmtMoney(data.operating)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Investing Activities</div><div class="kpi-value ${data.investing >= 0 ? "positive" : "negative"}">${fmtMoney(data.investing)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Financing Activities</div><div class="kpi-value ${data.financing >= 0 ? "positive" : "negative"}">${fmtMoney(data.financing)}</div></div>
        </div>
        <div class="card" style="max-width:460px;margin-top:16px;">
          <h3>Net Change in Cash</h3>
          <div class="kpi-value" style="font-size:1.5rem;">${fmtMoney(data.net_change_in_cash)}</div>
          <p class="text-muted" style="font-size:0.82rem;margin-top:10px;">Closing Cash + Bank balance: <strong>${fmtMoney(data.closing_cash_and_bank)}</strong>
          ${data.reconciles ? ' <span class="badge green">Reconciles ✓</span>' : ""}</p>
        </div>`;
    };
    const getRange = bindPeriodToolbar("cf", load);
    load(getRange());
  }
  return { render };
})();

const RatiosView = (() => {
  async function render(container) {
    container.innerHTML = `
      <div class="toolbar"><div class="filters"><div><label>As of</label><input type="date" id="ra-date" value="${todayStr()}" /></div></div></div>
      <div id="ra-results"></div>`;
    const load = async () => {
      const asOf = document.getElementById("ra-date").value || undefined;
      const data = await Api.ratios(asOf);
      const results = document.getElementById("ra-results");
      results.innerHTML = `
        <div class="kpi-card health" style="margin-bottom:20px;max-width:320px;">
          <div class="kpi-label">Financial Health Score</div>
          <div class="kpi-value">${data.health.score}<span style="font-size:0.9rem;opacity:0.7;">/100</span></div>
        </div>
        <div class="chart-grid">
          ${data.ratios.map((r) => `
            <div class="card">
              <h3>${r.label}</h3>
              <div class="kpi-value" style="font-size:1.5rem;">${r.is_currency ? fmtMoney(r.value) : r.is_percent ? fmtPercent(r.value) : fmtRatio(r.value)}</div>
              <p class="text-muted" style="font-size:0.82rem;margin-top:8px;">${escapeHtml(r.explanation)}</p>
            </div>`).join("")}
        </div>`;
    };
    document.getElementById("ra-date").addEventListener("change", load);
    load();
  }
  return { render };
})();

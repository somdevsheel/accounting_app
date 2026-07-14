/* Dashboard: KPI cards + Chart.js visualizations. */

const Dashboard = (() => {
  const chartInstances = {};

  function destroyChart(id) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  }

  const PALETTE = ["#2fb787", "#375073", "#d9a441", "#7f8fa6", "#5b8ac4", "#c45b8a", "#8a5bc4", "#c47f5b"];

  function kpiCard(label, value, opts = {}) {
    const cls = opts.tone === "positive" ? "positive" : opts.tone === "negative" ? "negative" : "";
    return `<div class="kpi-card ${opts.health ? "health" : ""}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${cls}">${value}</div>
    </div>`;
  }

  async function render(container) {
    container.innerHTML = `<div class="text-muted">Loading dashboard…</div>`;
    const data = await Api.dashboard();
    const k = data.kpis;
    const hasActivity = k.total_assets !== 0 || k.revenue !== 0 || k.expenses !== 0 || k.cash !== 0 || k.bank !== 0;

    const netProfitTone = k.net_profit >= 0 ? "positive" : "negative";

    container.innerHTML = `
      ${!hasActivity ? emptyState("📒", "No transactions yet", "Create your first Journal Entry to get started — every report on this dashboard will populate automatically.",
        `<button class="btn" id="dash-cta">+ New Journal Entry</button>`) : ""}
      <div class="kpi-grid">
        ${kpiCard("Financial Health Score", `${k.financial_health_score}<span style="font-size:0.9rem;opacity:0.7;">/100</span>`, { health: true })}
        ${kpiCard("Total Assets", fmtMoney(k.total_assets))}
        ${kpiCard("Total Liabilities", fmtMoney(k.total_liabilities))}
        ${kpiCard("Total Capital", fmtMoney(k.total_capital))}
        ${kpiCard("Net Worth", fmtMoney(k.net_worth))}
        ${kpiCard("Revenue", fmtMoney(k.revenue))}
        ${kpiCard("Expenses", fmtMoney(k.expenses))}
        ${kpiCard("Net Profit", fmtMoney(k.net_profit), { tone: netProfitTone })}
        ${kpiCard("Cash", fmtMoney(k.cash))}
        ${kpiCard("Bank", fmtMoney(k.bank))}
        ${kpiCard("Working Capital", fmtMoney(k.working_capital))}
        ${kpiCard("Current Ratio", fmtRatio(k.current_ratio))}
        ${kpiCard("Debt-Equity Ratio", fmtRatio(k.debt_equity_ratio))}
        ${kpiCard("Net Profit Margin", fmtPercent(k.net_profit_margin))}
        ${kpiCard("Return on Assets", fmtPercent(k.return_on_assets))}
        ${kpiCard("Asset Turnover", fmtRatio(k.asset_turnover))}
      </div>
      <div class="chart-grid">
        <div class="card chart-card"><h3>Monthly Revenue / Expense / Profit</h3><canvas id="chart-trend"></canvas></div>
        <div class="card chart-card"><h3>Expense Breakdown</h3><canvas id="chart-expense"></canvas></div>
        <div class="card chart-card"><h3>Asset Breakdown</h3><canvas id="chart-asset"></canvas></div>
        <div class="card chart-card"><h3>Capital Split by Owner</h3><canvas id="chart-capital"></canvas></div>
      </div>`;

    if (!hasActivity) {
      document.getElementById("dash-cta").addEventListener("click", () => App.navigate("journal", { openNew: true }));
    }

    renderTrendChart(data.monthly_trend);
    renderPie("chart-expense", data.expense_breakdown, "No expenses recorded yet");
    renderPie("chart-asset", data.asset_breakdown, "No assets recorded yet");
    renderPie("chart-capital", data.capital_split, "No capital contributions yet");
  }

  function renderTrendChart(trend) {
    destroyChart("chart-trend");
    const ctx = document.getElementById("chart-trend");
    chartInstances["chart-trend"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: trend.map((t) => t.period),
        datasets: [
          { label: "Revenue", data: trend.map((t) => t.income), backgroundColor: PALETTE[0] },
          { label: "Expense", data: trend.map((t) => t.expense), backgroundColor: PALETTE[2] },
          { label: "Profit", data: trend.map((t) => t.profit), type: "line", borderColor: PALETTE[1], backgroundColor: PALETTE[1], tension: 0.3 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { ticks: { callback: (v) => fmtMoney(v) } } },
      },
    });
  }

  function renderPie(canvasId, items, emptyMsg) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    const wrap = canvas.parentElement;
    if (!items || items.length === 0) {
      canvas.style.display = "none";
      if (!wrap.querySelector(".chart-empty")) {
        const div = document.createElement("div");
        div.className = "chart-empty text-muted";
        div.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;font-size:0.85rem;";
        div.textContent = emptyMsg;
        wrap.appendChild(div);
      }
      return;
    }
    canvas.style.display = "";
    const existing = wrap.querySelector(".chart-empty");
    if (existing) existing.remove();
    chartInstances[canvasId] = new Chart(canvas, {
      type: "pie",
      data: {
        labels: items.map((i) => i.name),
        datasets: [{ data: items.map((i) => i.amount), backgroundColor: PALETTE }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }

  return { render };
})();

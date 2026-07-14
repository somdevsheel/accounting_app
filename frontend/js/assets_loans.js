/* Fixed Asset Register + Depreciation Schedule, Loan Register + EMI schedule. */

const AssetsView = (() => {
  let tab = "register";
  let assetsCache = [];

  async function render(container) {
    container.innerHTML = `
      <div class="tabs">
        <div class="tab ${tab === "register" ? "active" : ""}" data-tab="register">Asset Register</div>
        <div class="tab ${tab === "schedule" ? "active" : ""}" data-tab="schedule">Depreciation Schedule</div>
      </div>
      <div id="assets-body"></div>`;
    container.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { tab = t.dataset.tab; render(container); }));
    const body = document.getElementById("assets-body");
    assetsCache = await Api.listAssets();
    if (tab === "register") renderRegister(body, container);
    else renderSchedule(body);
  }

  function renderRegister(body, container) {
    body.innerHTML = `
      <div class="toolbar"><div></div><button class="btn" id="asset-add">+ Add Fixed Asset</button></div>
      ${assetsCache.length === 0 ? emptyState("🖥️", "No fixed assets yet", "Add equipment, furniture, vehicles or other fixed assets to track depreciation automatically.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Purchase Date</th><th class="num">Cost</th><th class="num">Useful Life</th><th class="num">Accum. Depreciation</th><th class="num">Book Value</th><th></th></tr></thead>
          <tbody>
            ${assetsCache.map((a) => `
              <tr>
                <td>${escapeHtml(a.name)}${a.is_disposed ? ' <span class="badge gray">Disposed</span>' : ""}</td>
                <td>${escapeHtml(a.category || "")}</td>
                <td>${fmtDate(a.purchase_date)}</td>
                <td class="num">${fmtMoney(a.cost)}</td>
                <td class="num">${a.useful_life_years} yrs</td>
                <td class="num">${fmtMoney(a.accumulated_depreciation)}</td>
                <td class="num">${fmtMoney(a.book_value)}</td>
                <td>
                  <button class="btn secondary small asset-edit" data-id="${a.id}">Edit</button>
                  ${!a.is_disposed ? `<button class="btn secondary small asset-dispose" data-id="${a.id}">Dispose</button>` : ""}
                  <button class="btn secondary small asset-delete" data-id="${a.id}">Delete</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;
    document.getElementById("asset-add").addEventListener("click", () => openAssetModal(container));
    body.querySelectorAll(".asset-edit").forEach((btn) => btn.addEventListener("click", () => openAssetModal(container, Number(btn.dataset.id))));
    body.querySelectorAll(".asset-dispose").forEach((btn) => btn.addEventListener("click", async () => {
      const d = prompt("Disposal date (YYYY-MM-DD)?", todayStr());
      if (!d) return;
      await Api.disposeAsset(Number(btn.dataset.id), d);
      toast("Asset marked as disposed");
      render(container);
    }));
    body.querySelectorAll(".asset-delete").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Delete this fixed asset record?")) return;
      await Api.deleteAsset(Number(btn.dataset.id));
      toast("Asset deleted");
      render(container);
    }));
  }

  function renderSchedule(body) {
    if (assetsCache.length === 0) {
      body.innerHTML = emptyState("📅", "No assets to schedule", "Add a fixed asset first to see its depreciation schedule by financial year.");
      return;
    }
    body.innerHTML = `
      <div class="toolbar"><div class="filters"><div><label>Asset</label>
        <select id="dep-asset">${assetsCache.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}</select>
      </div></div></div>
      <div id="dep-results"></div>`;
    const load = async () => {
      const id = Number(document.getElementById("dep-asset").value);
      const data = await Api.assetDepreciationSchedule(id);
      const results = document.getElementById("dep-results");
      results.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Financial Year</th><th class="num">Days Held</th><th class="num">Depreciation</th><th class="num">Accumulated</th><th class="num">Book Value</th></tr></thead>
            <tbody>
              ${data.schedule.map((s) => `<tr><td>${s.financial_year}</td><td class="num">${s.days_held}</td><td class="num">${fmtMoney(s.depreciation_amount)}</td><td class="num">${fmtMoney(s.accumulated_depreciation)}</td><td class="num">${fmtMoney(s.book_value)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    };
    document.getElementById("dep-asset").addEventListener("change", load);
    load();
  }

  function openAssetModal(container, assetId) {
    const existing = assetId ? assetsCache.find((a) => a.id === assetId) : null;
    const fixedAssetAccounts = State.activeAccounts().filter((a) => a.category === "Fixed Asset" && a.normal_balance === "Debit");
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Fixed Asset" : "Add Fixed Asset"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field" style="grid-column:span 2;"><label>Asset Name</label><input type="text" id="a-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Category</label>
          <select id="a-account">${fixedAssetAccounts.map((a) => `<option value="${a.id}" ${existing && existing.account_id === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Purchase Date</label><input type="date" id="a-date" value="${existing ? existing.purchase_date : todayStr()}" /></div>
        <div class="field"><label>Cost</label><input type="number" step="0.01" id="a-cost" value="${existing ? existing.cost : ""}" /></div>
        <div class="field"><label>Useful Life (years)</label><input type="number" step="0.5" id="a-life" value="${existing ? existing.useful_life_years : ""}" /></div>
        <div class="field"><label>Residual Value</label><input type="number" step="0.01" id="a-residual" value="${existing ? existing.residual_value : 0}" /></div>
        <div class="field" style="grid-column:span 2;"><label>Notes</label><input type="text" id="a-notes" value="${existing ? escapeHtml(existing.notes || "") : ""}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="a-save">${existing ? "Save Changes" : "Add Asset"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("a-save").addEventListener("click", async () => {
      const payload = {
        name: document.getElementById("a-name").value.trim(),
        category: (() => { const opt = document.getElementById("a-account"); return opt.options[opt.selectedIndex] ? opt.options[opt.selectedIndex].text : null; })(),
        account_id: Number(document.getElementById("a-account").value) || null,
        purchase_date: document.getElementById("a-date").value,
        cost: Number(document.getElementById("a-cost").value),
        useful_life_years: Number(document.getElementById("a-life").value),
        residual_value: Number(document.getElementById("a-residual").value) || 0,
        notes: document.getElementById("a-notes").value,
      };
      if (!payload.name || !payload.purchase_date || !payload.cost || !payload.useful_life_years) {
        toast("Name, purchase date, cost and useful life are required", true);
        return;
      }
      if (existing) await Api.updateAsset(existing.id, payload);
      else await Api.createAsset(payload);
      toast("Asset saved");
      App.closeModal();
      render(container);
    });
  }

  return { render };
})();

/* ---------------- Loan Register ---------------- */

const LoansView = (() => {
  let loansCache = [];

  async function render(container) {
    loansCache = await Api.listLoans();
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn" id="loan-add">+ Add Loan</button></div>
      ${loansCache.length === 0 ? emptyState("🏦", "No loans yet", "Add a loan to auto-compute EMI and track the declining balance over time.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Lender</th><th class="num">Principal</th><th class="num">Rate</th><th class="num">Tenure</th><th class="num">EMI</th><th class="num">Outstanding</th><th class="num">Installments Paid</th><th></th></tr></thead>
          <tbody>
            ${loansCache.map((l) => `
              <tr>
                <td>${escapeHtml(l.lender_name)}${!l.is_active ? ' <span class="badge gray">Closed</span>' : ""}</td>
                <td class="num">${fmtMoney(l.principal)}</td>
                <td class="num">${l.interest_rate_annual}%</td>
                <td class="num">${l.tenure_months} mo</td>
                <td class="num">${fmtMoney(l.emi)}</td>
                <td class="num">${fmtMoney(l.outstanding_balance)}</td>
                <td class="num">${l.installments_paid} / ${l.tenure_months}</td>
                <td>
                  <button class="btn secondary small loan-schedule" data-id="${l.id}">Schedule</button>
                  <button class="btn secondary small loan-edit" data-id="${l.id}">Edit</button>
                  ${l.is_active ? `<button class="btn secondary small loan-close" data-id="${l.id}">Close</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;
    document.getElementById("loan-add").addEventListener("click", () => openLoanModal(container));
    container.querySelectorAll(".loan-edit").forEach((btn) => btn.addEventListener("click", () => openLoanModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".loan-schedule").forEach((btn) => btn.addEventListener("click", () => openScheduleModal(Number(btn.dataset.id))));
    container.querySelectorAll(".loan-close").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Mark this loan as closed?")) return;
      await Api.closeLoan(Number(btn.dataset.id));
      toast("Loan closed");
      render(container);
    }));
  }

  async function openScheduleModal(loanId) {
    const loan = loansCache.find((l) => l.id === loanId);
    const data = await Api.loanSchedule(loanId);
    const html = `
      <div class="modal-header"><h2>Amortization Schedule — ${escapeHtml(loan.lender_name)}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
        <table>
          <thead><tr><th>#</th><th>Due Date</th><th class="num">EMI</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Balance</th></tr></thead>
          <tbody>
            ${data.schedule.map((s) => `<tr><td>${s.installment_no}</td><td>${fmtDate(s.due_date)}</td><td class="num">${fmtMoney(s.emi)}</td><td class="num">${fmtMoney(s.principal_component)}</td><td class="num">${fmtMoney(s.interest_component)}</td><td class="num">${fmtMoney(s.balance)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="modal-actions"><button class="btn secondary" id="m-cancel">Close</button></div>`;
    App.openModal(html, { wide: true });
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
  }

  function openLoanModal(container, loanId) {
    const existing = loanId ? loansCache.find((l) => l.id === loanId) : null;
    const loanAccounts = State.activeAccounts().filter((a) => a.category === "Long Term Liability");
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Loan" : "Add Loan"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field" style="grid-column:span 2;"><label>Lender Name</label><input type="text" id="l-lender" value="${existing ? escapeHtml(existing.lender_name) : ""}" /></div>
        <div class="field"><label>Liability Account</label>
          <select id="l-account"><option value="">—</option>${loanAccounts.map((a) => `<option value="${a.id}" ${existing && existing.account_id === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Principal</label><input type="number" step="0.01" id="l-principal" value="${existing ? existing.principal : ""}" /></div>
        <div class="field"><label>Annual Interest Rate %</label><input type="number" step="0.01" id="l-rate" value="${existing ? existing.interest_rate_annual : ""}" /></div>
        <div class="field"><label>Tenure (months)</label><input type="number" id="l-tenure" value="${existing ? existing.tenure_months : ""}" /></div>
        <div class="field"><label>Start Date</label><input type="date" id="l-start" value="${existing ? existing.start_date : todayStr()}" /></div>
        <div class="field" style="grid-column:span 2;"><label>Notes</label><input type="text" id="l-notes" value="${existing ? escapeHtml(existing.notes || "") : ""}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="l-save">${existing ? "Save Changes" : "Add Loan"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("l-save").addEventListener("click", async () => {
      const payload = {
        lender_name: document.getElementById("l-lender").value.trim(),
        account_id: Number(document.getElementById("l-account").value) || null,
        principal: Number(document.getElementById("l-principal").value),
        interest_rate_annual: Number(document.getElementById("l-rate").value),
        tenure_months: Number(document.getElementById("l-tenure").value),
        start_date: document.getElementById("l-start").value,
        notes: document.getElementById("l-notes").value,
      };
      if (!payload.lender_name || !payload.principal || !payload.tenure_months || !payload.start_date) {
        toast("Lender, principal, tenure and start date are required", true);
        return;
      }
      if (existing) await Api.updateLoan(existing.id, payload);
      else await Api.createLoan(payload);
      toast("Loan saved");
      App.closeModal();
      render(container);
    });
  }

  return { render };
})();

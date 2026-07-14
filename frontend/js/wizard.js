/* First-run Setup Wizard: 4 steps, writes the Company profile + CoA once and never shows again. */

const Wizard = (() => {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const COUNTRIES = ["India", "United States", "United Kingdom", "Australia", "Canada", "New Zealand", "Singapore", "United Arab Emirates", "Germany", "France", "Japan", "South Africa"];
  const LEGAL_LABELS = {
    "Sole Proprietorship": "Owner",
    "Partnership": "Partners",
    "LLP": "Partners",
    "Private Limited": "Shareholders",
    "Corporation": "Shareholders",
  };
  const ACCOUNT_TYPES = ["Asset", "Liability", "Capital", "Income", "Expense"];
  const ACCOUNT_CATEGORIES = ["Current Asset", "Fixed Asset", "Current Liability", "Long Term Liability", "Capital", "Income", "Expense"];

  let container = null;
  let onComplete = null;
  let defaults = null;
  let fyTouched = false;

  const state = {
    step: 1,
    profile: {
      name: "",
      legal_structure: "Sole Proprietorship",
      country: "",
      currency_symbol: "$",
      currency_code: "USD",
      fy_start_month: 1,
      registration_no: "",
      tax_id: "",
    },
    tax_name: "GST",
    tax_rates: [],
    owners: [{ name: "", role: "", share_percent: 100 }],
    accounts: [],
    customCurrency: false,
  };

  const ROLE_PLACEHOLDER = {
    "Sole Proprietorship": "Owner",
    "Partnership": "Partner",
    "LLP": "Partner",
    "Private Limited": "Shareholder",
    "Corporation": "Shareholder",
  };

  function ownerLabel() {
    return LEGAL_LABELS[state.profile.legal_structure] || "Owners";
  }

  function ownerRolePlaceholder() {
    return ROLE_PLACEHOLDER[state.profile.legal_structure] || "Owner";
  }

  async function init(rootEl, completeCallback) {
    container = rootEl;
    onComplete = completeCallback;
    defaults = await Api.setupDefaults(state.tax_name, state.profile.country);
    state.tax_rates = defaults.tax_rates.map((r) => ({ ...r }));
    state.accounts = defaults.accounts.map((a) => ({ ...a }));
    render();
  }

  function render() {
    container.innerHTML = `
      <div class="wizard-shell">
        <div style="text-align:center;margin-bottom:22px;">
          <div style="font-size:1.4rem;font-weight:700;color:var(--navy-900);">Welcome — let's set up your company</div>
          <div class="text-muted" style="font-size:0.88rem;">This runs once. Everything here stays editable later from Settings.</div>
        </div>
        <div class="wizard-steps">
          ${[1, 2, 3, 4].map((n) => `<div class="wizard-step-dot ${n < state.step ? "done" : ""} ${n === state.step ? "active" : ""}"></div>`).join("")}
        </div>
        <div class="wizard-card" id="wizard-step-body"></div>
      </div>`;
    renderStep();
  }

  function renderStep() {
    const body = document.getElementById("wizard-step-body");
    if (state.step === 1) body.innerHTML = stepProfileHtml();
    else if (state.step === 2) body.innerHTML = stepOwnersHtml();
    else if (state.step === 3) body.innerHTML = stepTaxHtml();
    else body.innerHTML = stepAccountsHtml();
    bindStepEvents();
  }

  /* ---------- Step 1: Company Profile ---------- */

  function stepProfileHtml() {
    const p = state.profile;
    return `
      <h2>Step 1 — Company Profile</h2>
      <div class="step-desc">Tell us about your business. Nothing here is permanent — edit anytime from Settings.</div>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1;">
          <label>Company Name *</label>
          <input type="text" id="w-name" value="${escapeHtml(p.name)}" placeholder="e.g. Riverside Consulting" />
        </div>
        <div class="field">
          <label>Legal Structure</label>
          <select id="w-legal">
            ${Object.keys(LEGAL_LABELS).map((s) => `<option value="${s}" ${p.legal_structure === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Country</label>
          <input type="text" id="w-country" list="w-country-list" value="${escapeHtml(p.country)}" placeholder="e.g. India" />
          <datalist id="w-country-list">${COUNTRIES.map((c) => `<option value="${c}">`).join("")}</datalist>
        </div>
        <div class="field">
          <label>Base Currency</label>
          <select id="w-currency">
            ${defaults.currency_presets.map((c) => `<option value="${c.code}" ${!state.customCurrency && p.currency_code === c.code ? "selected" : ""}>${c.symbol} — ${c.code}</option>`).join("")}
            <option value="__custom__" ${state.customCurrency ? "selected" : ""}>Custom…</option>
          </select>
        </div>
        ${state.customCurrency ? `
        <div class="field">
          <label>Currency Symbol</label>
          <input type="text" id="w-currency-symbol" value="${escapeHtml(p.currency_symbol)}" placeholder="e.g. R$" />
        </div>
        <div class="field">
          <label>Currency Code</label>
          <input type="text" id="w-currency-code" value="${escapeHtml(p.currency_code)}" placeholder="e.g. BRL" />
        </div>` : ""}
        <div class="field">
          <label>Financial Year Start Month</label>
          <select id="w-fy-month">
            ${MONTHS.map((m, i) => `<option value="${i + 1}" ${p.fy_start_month === i + 1 ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Registration No.</label>
          <input type="text" id="w-reg" value="${escapeHtml(p.registration_no)}" placeholder="Optional" />
        </div>
        <div class="field">
          <label>Tax ID / GSTIN / VAT No.</label>
          <input type="text" id="w-taxid" value="${escapeHtml(p.tax_id)}" placeholder="Optional" />
        </div>
      </div>
      <div class="wizard-nav">
        <span></span>
        <button class="btn" id="w-next">Next: Owners →</button>
      </div>`;
  }

  function bindProfileEvents() {
    const byId = (id) => document.getElementById(id);
    byId("w-name").addEventListener("input", (e) => (state.profile.name = e.target.value));
    byId("w-legal").addEventListener("change", (e) => (state.profile.legal_structure = e.target.value));
    byId("w-country").addEventListener("change", async (e) => {
      state.profile.country = e.target.value;
      if (!fyTouched) {
        try {
          const d = await Api.setupDefaults(state.tax_name, state.profile.country);
          state.profile.fy_start_month = d.fy_start_month;
          renderStep();
        } catch (err) { /* ignore */ }
      }
    });
    byId("w-currency").addEventListener("change", (e) => {
      if (e.target.value === "__custom__") {
        state.customCurrency = true;
      } else {
        state.customCurrency = false;
        const preset = defaults.currency_presets.find((c) => c.code === e.target.value);
        if (preset) {
          state.profile.currency_symbol = preset.symbol;
          state.profile.currency_code = preset.code;
        }
      }
      renderStep();
    });
    if (byId("w-currency-symbol")) byId("w-currency-symbol").addEventListener("input", (e) => (state.profile.currency_symbol = e.target.value));
    if (byId("w-currency-code")) byId("w-currency-code").addEventListener("input", (e) => (state.profile.currency_code = e.target.value));
    byId("w-fy-month").addEventListener("change", (e) => {
      fyTouched = true;
      state.profile.fy_start_month = Number(e.target.value);
    });
    byId("w-reg").addEventListener("input", (e) => (state.profile.registration_no = e.target.value));
    byId("w-taxid").addEventListener("input", (e) => (state.profile.tax_id = e.target.value));
    byId("w-next").addEventListener("click", () => {
      if (!state.profile.name.trim()) {
        toast("Company name is required", true);
        return;
      }
      state.step = 2;
      render();
    });
  }

  /* ---------- Step 2: Owners / Partners ---------- */

  function stepOwnersHtml() {
    const total = state.owners.reduce((s, o) => s + (Number(o.share_percent) || 0), 0);
    return `
      <h2>Step 2 — ${ownerLabel()}</h2>
      <div class="step-desc">Add one row per owner/partner/shareholder. Each gets a matching Capital account automatically.</div>
      <table class="jl-table">
        <thead><tr><th style="width:34%">Name</th><th style="width:28%">Role</th><th style="width:20%">Share %</th><th></th></tr></thead>
        <tbody id="w-owners-body">
          ${state.owners.map((o, i) => `
            <tr data-i="${i}">
              <td><input type="text" class="w-owner-name" value="${escapeHtml(o.name)}" placeholder="Full name" /></td>
              <td><input type="text" class="w-owner-role" value="${escapeHtml(o.role)}" placeholder="e.g. ${ownerRolePlaceholder()}" /></td>
              <td><input type="number" class="w-owner-share" value="${o.share_percent}" min="0" max="100" step="0.01" /></td>
              <td><button class="jl-remove w-owner-remove" title="Remove">✕</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <button class="btn secondary small" id="w-add-owner">+ Add Row</button>
      <div id="w-owner-total-wrap">${ownerTotalHtml(total)}</div>
      <div class="wizard-nav">
        <button class="btn secondary" id="w-back">← Back</button>
        <button class="btn" id="w-next">Next: Tax Configuration →</button>
      </div>`;
  }

  function ownerTotalHtml(total) {
    return `
      <div style="margin-top:10px;font-size:0.86rem;">Total share: <strong>${total.toFixed(2)}%</strong></div>
      ${Math.abs(total - 100) > 0.01 ? `<div class="warn-text">⚠ Shares don't add up to 100% — you can fix this now or adjust later.</div>` : ""}`;
  }

  function bindOwnersEvents() {
    const body = document.getElementById("w-owners-body");
    body.querySelectorAll("tr").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector(".w-owner-name").addEventListener("input", (e) => (state.owners[i].name = e.target.value));
      row.querySelector(".w-owner-role").addEventListener("input", (e) => (state.owners[i].role = e.target.value));
      row.querySelector(".w-owner-share").addEventListener("input", (e) => {
        state.owners[i].share_percent = Number(e.target.value);
        const total = state.owners.reduce((s, o) => s + (Number(o.share_percent) || 0), 0);
        document.getElementById("w-owner-total-wrap").innerHTML = ownerTotalHtml(total);
      });
      row.querySelector(".w-owner-remove").addEventListener("click", () => {
        state.owners.splice(i, 1);
        renderStep();
      });
    });
    document.getElementById("w-add-owner").addEventListener("click", () => {
      state.owners.push({ name: "", role: "", share_percent: 0 });
      renderStep();
    });
    document.getElementById("w-back").addEventListener("click", () => { state.step = 1; render(); });
    document.getElementById("w-next").addEventListener("click", () => {
      state.owners = state.owners.filter((o) => o.name.trim());
      if (state.owners.length === 0) {
        toast("Add at least one owner/partner", true);
        return;
      }
      state.step = 3;
      render();
    });
  }

  /* ---------- Step 3: Tax Configuration ---------- */

  function stepTaxHtml() {
    return `
      <h2>Step 3 — Tax Configuration</h2>
      <div class="step-desc">Name your tax (GST, VAT, Sales Tax…) and set the rates you'll charge/pay. Fully editable later.</div>
      <div class="field" style="max-width:280px;">
        <label>Tax Name</label>
        <input type="text" id="w-tax-name" value="${escapeHtml(state.tax_name)}" />
      </div>
      <div class="field" style="margin-top:16px;">
        <label>Tax Rates (%)</label>
        <div id="w-rate-chips">
          ${state.tax_rates.map((r, i) => `<span class="rate-chip" data-i="${i}">${r.rate}%<button class="w-rate-remove" data-i="${i}">✕</button></span>`).join("")}
        </div>
        <div class="flex-row" style="margin-top:10px;max-width:220px;">
          <input type="number" id="w-new-rate" placeholder="e.g. 12" step="0.01" />
          <button class="btn secondary small" id="w-add-rate">Add</button>
        </div>
      </div>
      <div class="wizard-nav">
        <button class="btn secondary" id="w-back">← Back</button>
        <button class="btn" id="w-next">Next: Chart of Accounts →</button>
      </div>`;
  }

  function bindTaxEvents() {
    document.getElementById("w-tax-name").addEventListener("input", (e) => (state.tax_name = e.target.value));
    document.getElementById("w-add-rate").addEventListener("click", () => {
      const input = document.getElementById("w-new-rate");
      const v = Number(input.value);
      if (input.value !== "" && !isNaN(v)) {
        state.tax_rates.push({ rate: v, label: null });
        renderStep();
      }
    });
    document.querySelectorAll(".w-rate-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tax_rates.splice(Number(btn.dataset.i), 1);
        renderStep();
      });
    });
    document.getElementById("w-back").addEventListener("click", () => { state.step = 2; render(); });
    document.getElementById("w-next").addEventListener("click", async () => {
      // Refresh default CoA tax-linked account names to match the chosen tax name,
      // but only if the user hasn't customized the accounts list yet.
      try {
        const fresh = await Api.setupDefaults(state.tax_name, state.profile.country);
        state.accounts = state.accounts.map((a) => {
          if (a.name.endsWith(" Input Credit") || a.name.endsWith(" Payable")) {
            const match = fresh.accounts.find((f) => f.code === a.code);
            if (match) return { ...a, name: match.name };
          }
          return a;
        });
      } catch (e) { /* ignore, keep existing */ }
      state.step = 4;
      render();
    });
  }

  /* ---------- Step 4: Chart of Accounts ---------- */

  function stepAccountsHtml() {
    return `
      <h2>Step 4 — Chart of Accounts</h2>
      <div class="step-desc">A generic default template, pre-filled and fully editable. Use it as-is, or rename/add/remove rows now.</div>
      <div class="table-wrap" style="max-height:360px;overflow-y:auto;">
        <table class="jl-table" style="min-width:640px;">
          <thead><tr><th style="width:12%">Code</th><th style="width:28%">Name</th><th style="width:16%">Type</th><th style="width:22%">Category</th><th style="width:16%">Normal Bal.</th><th></th></tr></thead>
          <tbody id="w-accounts-body">
            ${state.accounts.map((a, i) => `
              <tr data-i="${i}">
                <td><input type="text" class="w-acc-code" value="${escapeHtml(a.code || "")}" /></td>
                <td><input type="text" class="w-acc-name" value="${escapeHtml(a.name)}" /></td>
                <td><select class="w-acc-type">${ACCOUNT_TYPES.map((t) => `<option ${a.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></td>
                <td><select class="w-acc-category">${ACCOUNT_CATEGORIES.map((c) => `<option ${a.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></td>
                <td><select class="w-acc-normal"><option ${a.normal_balance === "Debit" ? "selected" : ""}>Debit</option><option ${a.normal_balance === "Credit" ? "selected" : ""}>Credit</option></select></td>
                <td><button class="jl-remove w-acc-remove">✕</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="flex-row" style="margin-top:10px;">
        <button class="btn secondary small" id="w-add-account">+ Add Account</button>
        <button class="btn secondary small" id="w-reset-accounts">Reset to Defaults</button>
      </div>
      <div class="wizard-nav">
        <button class="btn secondary" id="w-back">← Back</button>
        <button class="btn" id="w-finish">Finish Setup ✓</button>
      </div>`;
  }

  function bindAccountsEvents() {
    const body = document.getElementById("w-accounts-body");
    body.querySelectorAll("tr").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector(".w-acc-code").addEventListener("input", (e) => (state.accounts[i].code = e.target.value));
      row.querySelector(".w-acc-name").addEventListener("input", (e) => (state.accounts[i].name = e.target.value));
      row.querySelector(".w-acc-type").addEventListener("change", (e) => (state.accounts[i].type = e.target.value));
      row.querySelector(".w-acc-category").addEventListener("change", (e) => (state.accounts[i].category = e.target.value));
      row.querySelector(".w-acc-normal").addEventListener("change", (e) => (state.accounts[i].normal_balance = e.target.value));
      row.querySelector(".w-acc-remove").addEventListener("click", () => {
        state.accounts.splice(i, 1);
        renderStep();
      });
    });
    document.getElementById("w-add-account").addEventListener("click", () => {
      state.accounts.push({ code: "", name: "", type: "Asset", category: "Current Asset", normal_balance: "Debit" });
      renderStep();
    });
    document.getElementById("w-reset-accounts").addEventListener("click", async () => {
      const fresh = await Api.setupDefaults(state.tax_name, state.profile.country);
      state.accounts = fresh.accounts.map((a) => ({ ...a }));
      renderStep();
    });
    document.getElementById("w-back").addEventListener("click", () => { state.step = 3; render(); });
    document.getElementById("w-finish").addEventListener("click", finishSetup);
  }

  async function finishSetup() {
    const btn = document.getElementById("w-finish");
    btn.disabled = true;
    btn.textContent = "Setting up…";
    try {
      const payload = {
        profile: state.profile,
        tax_name: state.tax_name,
        tax_rates: state.tax_rates.map((r) => ({ rate: Number(r.rate), label: r.label || null })),
        owners: state.owners.map((o) => ({ name: o.name, role: o.role, share_percent: Number(o.share_percent) || 0 })),
        accounts: state.accounts
          .filter((a) => a.name.trim())
          .map((a) => ({ code: a.code || null, name: a.name, type: a.type, category: a.category, normal_balance: a.normal_balance })),
      };
      await Api.setupComplete(payload);
      toast("Company set up successfully");
      onComplete();
    } catch (err) {
      toast("Setup failed: " + err.message, true);
      btn.disabled = false;
      btn.textContent = "Finish Setup ✓";
    }
  }

  function bindStepEvents() {
    if (state.step === 1) bindProfileEvents();
    else if (state.step === 2) bindOwnersEvents();
    else if (state.step === 3) bindTaxEvents();
    else bindAccountsEvents();
  }

  return { init };
})();

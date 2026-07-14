/* Journal Entries (list + multi-line form), General Ledger, Trial Balance. */

const VOUCHER_TYPES = ["Journal", "Receipt", "Payment", "Sales", "Purchase", "Contra", "Bank Import"];
const PAYMENT_STATUSES = ["Unpaid", "Paid", "Partial"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "Cheque", "Card", "UPI", "Other"];

const JournalView = (() => {
  let filters = { voucher_type: "", include_void: false };

  async function render(container, opts) {
    await refresh(container);
    if (opts && opts.openNew) openEntryModal(container);
  }

  async function refresh(container) {
    const entries = await Api.listJournal({ voucher_type: filters.voucher_type || undefined, include_void: filters.include_void });
    container.innerHTML = `
      <div class="toolbar">
        <div class="filters">
          <div>
            <label>Voucher Type</label>
            <select id="j-filter-type">
              <option value="">All Types</option>
              ${VOUCHER_TYPES.map((t) => `<option value="${t}" ${filters.voucher_type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
          <div style="align-self:flex-end;padding-bottom:8px;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;">
              <input type="checkbox" id="j-filter-void" ${filters.include_void ? "checked" : ""} style="width:auto;" /> Show voided
            </label>
          </div>
        </div>
        <button class="btn" id="j-new">+ New Journal Entry</button>
      </div>
      ${entries.length === 0 ? emptyState("📝", "No transactions yet", "Create your first Journal Entry to get started — every ledger, register and report reads from here.",
        `<button class="btn" id="j-new-empty">+ New Journal Entry</button>`) : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Voucher No.</th><th>Type</th><th>Party</th><th>Narration</th><th class="num">Debit</th><th class="num">Credit</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr data-id="${e.id}" style="${e.is_void ? "opacity:0.55;" : ""}">
                <td>${fmtDate(e.date)}</td>
                <td>${e.voucher_no}</td>
                <td>${e.voucher_type}</td>
                <td>${escapeHtml(e.party_name || "—")}</td>
                <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.narration || "")}</td>
                <td class="num">${fmtMoney(e.total_debit)}</td>
                <td class="num">${fmtMoney(e.total_credit)}</td>
                <td>${e.is_void ? '<span class="badge red">Void</span>' : statusBadge(e.payment_status)}</td>
                <td>
                  <button class="btn secondary small j-view" data-id="${e.id}">View</button>
                  ${!e.is_void ? `<button class="btn secondary small j-edit" data-id="${e.id}">Edit</button>
                  <button class="btn secondary small j-void" data-id="${e.id}">Void</button>` :
                  `<button class="btn secondary small j-unvoid" data-id="${e.id}">Unvoid</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;

    document.getElementById("j-filter-type").addEventListener("change", (e) => { filters.voucher_type = e.target.value; refresh(container); });
    document.getElementById("j-filter-void").addEventListener("change", (e) => { filters.include_void = e.target.checked; refresh(container); });
    document.getElementById("j-new").addEventListener("click", () => openEntryModal(container));
    const emptyBtn = document.getElementById("j-new-empty");
    if (emptyBtn) emptyBtn.addEventListener("click", () => openEntryModal(container));
    container.querySelectorAll(".j-view").forEach((btn) => btn.addEventListener("click", () => viewEntry(Number(btn.dataset.id))));
    container.querySelectorAll(".j-edit").forEach((btn) => btn.addEventListener("click", () => openEntryModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".j-void").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Void this journal entry? It stays in history but drops out of live balances... actually it is excluded from reports.")) return;
      await Api.voidJournalEntry(Number(btn.dataset.id));
      toast("Entry voided");
      refresh(container);
    }));
    container.querySelectorAll(".j-unvoid").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.unvoidJournalEntry(Number(btn.dataset.id));
      toast("Entry restored");
      refresh(container);
    }));
  }

  function statusBadge(status) {
    if (status === "Paid") return '<span class="badge green">Paid</span>';
    if (status === "Partial") return '<span class="badge amber">Partial</span>';
    return '<span class="badge gray">Unpaid</span>';
  }

  function fileIcon(mimeType) {
    if (mimeType && mimeType.startsWith("image/")) return "🖼️";
    if (mimeType === "application/pdf") return "📄";
    return "📎";
  }

  async function viewEntry(id) {
    const e = await Api.getJournalEntry(id);
    const html = `
      <div class="modal-header"><h2>${e.voucher_no} — ${e.voucher_type}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid" style="margin-bottom:16px;">
        <div><label>Date</label><div>${fmtDate(e.date)}</div></div>
        <div><label>Party</label><div>${escapeHtml(e.party_name || "—")}</div></div>
        <div><label>Payment Status</label><div>${statusBadge(e.payment_status)}</div></div>
        <div><label>Reference</label><div>${escapeHtml(e.reference || "—")}</div></div>
      </div>
      ${e.narration ? `<p><label>Narration</label>${escapeHtml(e.narration)}</p>` : ""}
      <table class="jl-table">
        <thead><tr><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
        <tbody>
          ${e.lines.map((l) => `<tr><td>${escapeHtml(l.account_name)}</td><td>${escapeHtml(l.description || "")}${l.currency_code ? `<div class="text-muted" style="font-size:0.75rem;">${l.currency_code} ${fmtNum(l.foreign_debit_amount || l.foreign_credit_amount, 2)} @ ${l.exchange_rate}</div>` : ""}</td><td class="num">${l.debit_amount ? fmtMoney(l.debit_amount) : ""}</td><td class="num">${l.credit_amount ? fmtMoney(l.credit_amount) : ""}</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${fmtMoney(e.total_debit)}</td><td class="num">${fmtMoney(e.total_credit)}</td></tr></tfoot>
      </table>
      <div style="margin-top:20px;">
        <div class="flex-row" style="justify-content:space-between;align-items:center;">
          <label style="margin:0;">Attachments</label>
          <div>
            <input type="file" id="att-file" accept="image/png,image/jpeg,image/webp,application/pdf" style="display:none;" />
            <button class="btn secondary small" id="att-upload">+ Add Attachment</button>
          </div>
        </div>
        <div id="att-list" style="margin-top:10px;">
          ${e.attachments.length === 0 ? `<p class="text-muted" style="font-size:0.82rem;">No receipts or documents attached yet.</p>` : `
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${e.attachments.map((a) => `
              <div class="flex-row" style="justify-content:space-between;padding:6px 10px;background:var(--surface-2,#f4f6f8);border-radius:6px;">
                <a href="${a.data}" download="${escapeHtml(a.filename)}" target="_blank" style="text-decoration:none;color:inherit;">${fileIcon(a.mime_type)} ${escapeHtml(a.filename)}</a>
                <button class="btn secondary small att-delete" data-id="${a.id}">Remove</button>
              </div>`).join("")}
          </div>`}
        </div>
      </div>
      <div class="modal-actions"><button class="btn secondary" id="m-cancel">Close</button></div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    const fileInput = document.getElementById("att-file");
    document.getElementById("att-upload").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast("File is too large (max 8MB)", true); return; }
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Could not read file"));
        r.readAsDataURL(file);
      });
      try {
        await Api.addAttachment(id, { filename: file.name, mime_type: file.type || "application/octet-stream", data: dataUrl });
        toast("Attachment added");
        viewEntry(id);
      } catch (err) {
        toast(err.message, true);
      }
    });
    document.querySelectorAll(".att-delete").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deleteAttachment(Number(btn.dataset.id));
      toast("Attachment removed");
      viewEntry(id);
    }));
  }

  const FX_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "SGD", "AED", "CNY"];

  function openEntryModal(container, entryId) {
    let lines = [
      { account_id: "", debit_amount: "", credit_amount: "", description: "", tax_rate_id: "", currency_code: "", exchange_rate: "", foreign_debit_amount: "", foreign_credit_amount: "", fxOpen: false },
      { account_id: "", debit_amount: "", credit_amount: "", description: "", tax_rate_id: "", currency_code: "", exchange_rate: "", foreign_debit_amount: "", foreign_credit_amount: "", fxOpen: false },
    ];
    let entry = null;
    let header = {
      date: todayStr(), voucher_type: "Journal", party_name: "", reference: "",
      payment_mode: "", payment_status: "Unpaid", narration: "",
    };

    const build = async () => {
      if (entryId && !entry) entry = await Api.getJournalEntry(entryId);
      if (entry) {
        lines = entry.lines.map((l) => ({
          account_id: l.account_id, debit_amount: l.debit_amount || "", credit_amount: l.credit_amount || "",
          description: l.description || "", tax_rate_id: l.tax_rate_id || "",
          currency_code: l.currency_code || "", exchange_rate: l.exchange_rate || "",
          foreign_debit_amount: l.foreign_debit_amount || "", foreign_credit_amount: l.foreign_credit_amount || "",
          fxOpen: !!l.currency_code,
        }));
        header = {
          date: entry.date, voucher_type: entry.voucher_type, party_name: entry.party_name || "",
          reference: entry.reference || "", payment_mode: entry.payment_mode || "",
          payment_status: entry.payment_status, narration: entry.narration || "",
        };
      }
      renderModal();
    };

    function accountOptions(selected) {
      return `<option value="">Select account…</option>` + State.activeAccounts().map((a) =>
        `<option value="${a.id}" ${Number(selected) === a.id ? "selected" : ""}>${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join("");
    }

    function taxOptions(selected) {
      return `<option value="">No tax</option>` + State.taxRates.map((r) =>
        `<option value="${r.id}" ${Number(selected) === r.id ? "selected" : ""}>${r.rate}%${r.label ? " " + r.label : ""}</option>`).join("");
    }

    function computeTotals() {
      let d = 0, c = 0;
      lines.forEach((l) => { d += Number(l.debit_amount) || 0; c += Number(l.credit_amount) || 0; });
      return { d: Math.round(d * 100) / 100, c: Math.round(c * 100) / 100 };
    }

    function renderModal() {
      const { d, c } = computeTotals();
      const diff = Math.round((d - c) * 100) / 100;
      const html = `
        <div class="modal-header"><h2>${entry ? `Edit ${entry.voucher_no}` : "New Journal Entry"}</h2><button class="modal-close" id="m-close">✕</button></div>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="field"><label>Date</label><input type="date" id="je-date" value="${header.date}" /></div>
          <div class="field"><label>Voucher Type</label>
            <select id="je-type">${VOUCHER_TYPES.map((t) => `<option ${header.voucher_type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Party Name</label><input type="text" id="je-party" value="${escapeHtml(header.party_name)}" placeholder="Customer / vendor / payee" /></div>
          <div class="field"><label>Reference</label><input type="text" id="je-ref" value="${escapeHtml(header.reference)}" placeholder="Invoice #, cheque #…" /></div>
          <div class="field"><label>Payment Mode</label>
            <select id="je-mode"><option value="">—</option>${PAYMENT_MODES.map((m) => `<option ${header.payment_mode === m ? "selected" : ""}>${m}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Payment Status</label>
            <select id="je-status">${PAYMENT_STATUSES.map((s) => `<option ${header.payment_status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>
          <div class="field" style="grid-column:1/-1;"><label>Narration</label><input type="text" id="je-narration" value="${escapeHtml(header.narration)}" /></div>
        </div>
        <table class="jl-table">
          <thead><tr><th style="width:28%">Account</th><th style="width:20%">Description</th><th style="width:14%">Tax</th><th style="width:14%">Debit</th><th style="width:14%">Credit</th><th></th></tr></thead>
          <tbody id="je-lines-body">
            ${lines.map((l, i) => `
              <tr data-i="${i}">
                <td><select class="jl-account">${accountOptions(l.account_id)}</select></td>
                <td><input type="text" class="jl-desc" value="${escapeHtml(l.description)}" /></td>
                <td><select class="jl-tax">${taxOptions(l.tax_rate_id)}</select></td>
                <td><input type="number" step="0.01" class="jl-debit" value="${l.debit_amount}" ${l.fxOpen ? "readonly" : ""} /></td>
                <td><input type="number" step="0.01" class="jl-credit" value="${l.credit_amount}" ${l.fxOpen ? "readonly" : ""} /></td>
                <td><button class="jl-fx ${l.fxOpen ? "active" : ""}" title="Foreign currency">🌐</button><button class="jl-remove" title="Remove line">✕</button></td>
              </tr>
              ${l.fxOpen ? `
              <tr class="fx-subrow" data-i="${i}">
                <td colspan="6" style="background:var(--slate-50,#f4f6f8);padding:8px 10px;">
                  <div class="flex-row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;">
                    <div class="field" style="max-width:110px;"><label style="font-size:0.72rem;">Currency</label>
                      <input type="text" class="fx-currency" list="fx-currency-list" value="${escapeHtml(l.currency_code)}" placeholder="USD" style="text-transform:uppercase;" />
                    </div>
                    <div class="field" style="max-width:130px;"><label style="font-size:0.72rem;">Exchange Rate → ${State.company.currency_code}</label>
                      <input type="number" step="0.0001" class="fx-rate" value="${l.exchange_rate}" placeholder="1.0000" />
                    </div>
                    <div class="field" style="max-width:130px;"><label style="font-size:0.72rem;">Foreign Debit</label>
                      <input type="number" step="0.01" class="fx-debit" value="${l.foreign_debit_amount}" />
                    </div>
                    <div class="field" style="max-width:130px;"><label style="font-size:0.72rem;">Foreign Credit</label>
                      <input type="number" step="0.01" class="fx-credit" value="${l.foreign_credit_amount}" />
                    </div>
                    <div class="text-muted fx-computed" style="font-size:0.78rem;padding-bottom:8px;">= ${fmtMoney((Number(l.foreign_debit_amount || l.foreign_credit_amount) || 0) * (Number(l.exchange_rate) || 0))} ${State.company.currency_code}</div>
                  </div>
                </td>
              </tr>` : ""}`).join("")}
          </tbody>
        </table>
        <datalist id="fx-currency-list">${FX_CURRENCIES.map((c) => `<option value="${c}">`).join("")}</datalist>
        <button class="btn secondary small" id="je-add-line">+ Add Line</button>
        <div class="balance-indicator ${diff === 0 ? "balanced" : "unbalanced"}" id="je-balance-bar" style="margin-top:14px;">
          <span>Debit: ${fmtMoney(d)} &nbsp;|&nbsp; Credit: ${fmtMoney(c)}</span>
          <span>${diff === 0 ? "✓ Balanced" : `Out of balance by ${fmtMoney(Math.abs(diff))}`}</span>
        </div>
        <div class="modal-actions">
          <button class="btn secondary" id="m-cancel">Cancel</button>
          <button class="btn" id="je-save" ${diff !== 0 || lines.length < 2 ? "disabled" : ""}>${entry ? "Save Changes" : "Post Entry"}</button>
        </div>`;
      App.openModal(html, { wide: true });
      bind();
    }

    function bind() {
      document.getElementById("m-close").addEventListener("click", App.closeModal);
      document.getElementById("m-cancel").addEventListener("click", App.closeModal);
      document.getElementById("je-date").addEventListener("change", (ev) => { header.date = ev.target.value; });
      document.getElementById("je-type").addEventListener("change", (ev) => { header.voucher_type = ev.target.value; });
      document.getElementById("je-party").addEventListener("input", (ev) => { header.party_name = ev.target.value; });
      document.getElementById("je-ref").addEventListener("input", (ev) => { header.reference = ev.target.value; });
      document.getElementById("je-mode").addEventListener("change", (ev) => { header.payment_mode = ev.target.value; });
      document.getElementById("je-status").addEventListener("change", (ev) => { header.payment_status = ev.target.value; });
      document.getElementById("je-narration").addEventListener("input", (ev) => { header.narration = ev.target.value; });
      const body = document.getElementById("je-lines-body");
      body.querySelectorAll("tr").forEach((row) => {
        const i = Number(row.dataset.i);
        row.querySelector(".jl-account").addEventListener("change", (ev) => { lines[i].account_id = ev.target.value; });
        row.querySelector(".jl-desc").addEventListener("input", (ev) => { lines[i].description = ev.target.value; });
        row.querySelector(".jl-tax").addEventListener("change", (ev) => { lines[i].tax_rate_id = ev.target.value; });
        row.querySelector(".jl-debit").addEventListener("input", (ev) => {
          lines[i].debit_amount = ev.target.value;
          if (ev.target.value) {
            lines[i].credit_amount = "";
            row.querySelector(".jl-credit").value = "";
          }
          updateBalanceBar();
        });
        row.querySelector(".jl-credit").addEventListener("input", (ev) => {
          lines[i].credit_amount = ev.target.value;
          if (ev.target.value) {
            lines[i].debit_amount = "";
            row.querySelector(".jl-debit").value = "";
          }
          updateBalanceBar();
        });
        row.querySelector(".jl-remove").addEventListener("click", () => {
          if (lines.length <= 2) { toast("An entry needs at least 2 lines", true); return; }
          lines.splice(i, 1);
          renderModal();
        });
        row.querySelector(".jl-fx").addEventListener("click", () => {
          lines[i].fxOpen = !lines[i].fxOpen;
          if (!lines[i].fxOpen) {
            lines[i].currency_code = ""; lines[i].exchange_rate = "";
            lines[i].foreign_debit_amount = ""; lines[i].foreign_credit_amount = "";
          }
          renderModal();
        });
      });
      body.querySelectorAll(".fx-subrow").forEach((row) => {
        const i = Number(row.dataset.i);
        const mainRow = body.querySelector(`tr[data-i="${i}"]:not(.fx-subrow)`);
        const recompute = () => {
          const rate = Number(lines[i].exchange_rate) || 0;
          const fd = Number(lines[i].foreign_debit_amount) || 0;
          const fc = Number(lines[i].foreign_credit_amount) || 0;
          lines[i].debit_amount = fd ? Math.round(fd * rate * 100) / 100 : "";
          lines[i].credit_amount = fc ? Math.round(fc * rate * 100) / 100 : "";
          mainRow.querySelector(".jl-debit").value = lines[i].debit_amount;
          mainRow.querySelector(".jl-credit").value = lines[i].credit_amount;
          row.querySelector(".fx-computed").textContent = `= ${fmtMoney((fd || fc) * rate)} ${State.company.currency_code}`;
          updateBalanceBar();
        };
        row.querySelector(".fx-currency").addEventListener("input", (ev) => { lines[i].currency_code = ev.target.value.toUpperCase(); });
        row.querySelector(".fx-rate").addEventListener("input", (ev) => { lines[i].exchange_rate = ev.target.value; recompute(); });
        row.querySelector(".fx-debit").addEventListener("input", (ev) => {
          lines[i].foreign_debit_amount = ev.target.value;
          if (ev.target.value) { lines[i].foreign_credit_amount = ""; row.querySelector(".fx-credit").value = ""; }
          recompute();
        });
        row.querySelector(".fx-credit").addEventListener("input", (ev) => {
          lines[i].foreign_credit_amount = ev.target.value;
          if (ev.target.value) { lines[i].foreign_debit_amount = ""; row.querySelector(".fx-debit").value = ""; }
          recompute();
        });
      });
      document.getElementById("je-add-line").addEventListener("click", () => {
        lines.push({ account_id: "", debit_amount: "", credit_amount: "", description: "", tax_rate_id: "", currency_code: "", exchange_rate: "", foreign_debit_amount: "", foreign_credit_amount: "", fxOpen: false });
        renderModal();
      });
      const saveBtn = document.getElementById("je-save");
      if (saveBtn) saveBtn.addEventListener("click", save);
    }

    function updateBalanceBar() {
      const { d, c } = computeTotals();
      const diff = Math.round((d - c) * 100) / 100;
      const bar = document.getElementById("je-balance-bar");
      bar.className = `balance-indicator ${diff === 0 ? "balanced" : "unbalanced"}`;
      bar.innerHTML = `
        <span>Debit: ${fmtMoney(d)} &nbsp;|&nbsp; Credit: ${fmtMoney(c)}</span>
        <span>${diff === 0 ? "✓ Balanced" : `Out of balance by ${fmtMoney(Math.abs(diff))}`}</span>`;
      const saveBtn = document.getElementById("je-save");
      if (saveBtn) saveBtn.disabled = diff !== 0 || lines.length < 2;
    }

    async function save() {
      const payload = {
        date: document.getElementById("je-date").value,
        voucher_type: document.getElementById("je-type").value,
        party_name: document.getElementById("je-party").value,
        reference: document.getElementById("je-ref").value,
        payment_mode: document.getElementById("je-mode").value || null,
        payment_status: document.getElementById("je-status").value,
        narration: document.getElementById("je-narration").value,
        lines: lines
          .filter((l) => l.account_id && (Number(l.debit_amount) > 0 || Number(l.credit_amount) > 0))
          .map((l) => ({
            account_id: Number(l.account_id),
            debit_amount: Number(l.debit_amount) || 0,
            credit_amount: Number(l.credit_amount) || 0,
            description: l.description || null,
            tax_rate_id: l.tax_rate_id ? Number(l.tax_rate_id) : null,
            currency_code: l.fxOpen && l.currency_code ? l.currency_code : null,
            exchange_rate: l.fxOpen && l.exchange_rate ? Number(l.exchange_rate) : null,
            foreign_debit_amount: l.fxOpen && l.foreign_debit_amount ? Number(l.foreign_debit_amount) : null,
            foreign_credit_amount: l.fxOpen && l.foreign_credit_amount ? Number(l.foreign_credit_amount) : null,
          })),
      };
      if (!payload.date) { toast("Date is required", true); return; }
      try {
        if (entry) await Api.updateJournalEntry(entry.id, payload);
        else await Api.createJournalEntry(payload);
        toast(entry ? "Entry updated" : "Entry posted");
        App.closeModal();
        refresh(container);
      } catch (err) {
        toast(err.message, true);
      }
    }

    build();
  }

  return { render };
})();

/* ---------------- General Ledger ---------------- */

const LedgerView = (() => {
  async function render(container) {
    const accounts = State.activeAccounts();
    container.innerHTML = `
      <div class="toolbar">
        <div class="filters">
          <div><label>Account</label>
            <select id="gl-account" style="min-width:260px;">
              <option value="">Select an account…</option>
              ${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join("")}
            </select>
          </div>
          <div><label>From</label><input type="date" id="gl-start" /></div>
          <div><label>To</label><input type="date" id="gl-end" /></div>
        </div>
      </div>
      <div id="gl-results">${emptyState("📒", "Pick an account", "Choose an account above to see every line posted to it, with a running balance.")}</div>`;

    const load = async () => {
      const accId = document.getElementById("gl-account").value;
      if (!accId) return;
      const start = document.getElementById("gl-start").value || undefined;
      const end = document.getElementById("gl-end").value || undefined;
      const data = await Api.generalLedger(Number(accId), { start_date: start, as_of: end });
      const results = document.getElementById("gl-results");
      if (data.lines.length === 0) {
        results.innerHTML = emptyState("📒", "No activity", "No journal lines have been posted to this account yet.");
        return;
      }
      results.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Voucher No.</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Running Balance</th></tr></thead>
            <tbody>
              ${data.lines.map((l) => `
                <tr>
                  <td>${fmtDate(l.date)}</td>
                  <td>${l.voucher_no}</td>
                  <td>${escapeHtml(l.particulars)}${l.narration ? ` <span class="text-muted">— ${escapeHtml(l.narration)}</span>` : ""}</td>
                  <td class="num">${l.debit_amount ? fmtMoney(l.debit_amount) : ""}</td>
                  <td class="num">${l.credit_amount ? fmtMoney(l.credit_amount) : ""}</td>
                  <td class="num">${fmtMoney(l.running_balance)}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot><tr><td colspan="5">Closing Balance</td><td class="num">${fmtMoney(data.closing_balance)}</td></tr></tfoot>
          </table>
        </div>`;
    };
    document.getElementById("gl-account").addEventListener("change", load);
    document.getElementById("gl-start").addEventListener("change", load);
    document.getElementById("gl-end").addEventListener("change", load);
  }
  return { render };
})();

/* ---------------- Trial Balance ---------------- */

const TrialBalanceView = (() => {
  async function render(container) {
    container.innerHTML = `
      <div class="toolbar">
        <div class="filters"><div><label>As of</label><input type="date" id="tb-date" value="${todayStr()}" /></div></div>
      </div>
      <div id="tb-results"></div>`;
    const load = async () => {
      const asOf = document.getElementById("tb-date").value || undefined;
      const data = await Api.trialBalance(asOf);
      const results = document.getElementById("tb-results");
      if (data.rows.length === 0) {
        results.innerHTML = emptyState("⚖️", "Nothing posted yet", "The trial balance will populate once you post journal entries.");
        return;
      }
      results.innerHTML = `
        <div class="flex-row" style="margin-bottom:14px;">
          <span class="badge ${data.is_balanced ? "green" : "red"}" style="font-size:0.82rem;">${data.is_balanced ? "✓ Balanced" : "✗ Out of Balance"}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
            <tbody>
              ${data.rows.map((r) => `<tr><td>${r.code}</td><td>${escapeHtml(r.name)}</td><td>${r.type}</td><td class="num">${r.debit_balance ? fmtMoney(r.debit_balance) : ""}</td><td class="num">${r.credit_balance ? fmtMoney(r.credit_balance) : ""}</td></tr>`).join("")}
            </tbody>
            <tfoot><tr><td colspan="3">Total</td><td class="num">${fmtMoney(data.total_debit)}</td><td class="num">${fmtMoney(data.total_credit)}</td></tr></tfoot>
          </table>
        </div>`;
    };
    document.getElementById("tb-date").addEventListener("change", load);
    load();
  }
  return { render };
})();

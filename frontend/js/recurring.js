/* Recurring Invoice/Receipt templates: generate a real document on each app launch when due. */

const RECURRING_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Annually"];

const RecurringInvoicesView = (() => {
  let templatesCache = [];

  async function render(container) {
    templatesCache = await Api.listRecurring();
    container.innerHTML = `
      <div class="toolbar">
        <div></div>
        <div class="flex-row">
          <button class="btn secondary" id="rec-generate">Generate Due Now</button>
          <button class="btn" id="rec-add">+ New Recurring Template</button>
        </div>
      </div>
      ${templatesCache.length === 0 ? emptyState("🔁", "No recurring templates yet", "Set up a template once — an invoice or receipt gets generated automatically each time it's due, checked on every app launch.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Party</th><th>Frequency</th><th>Next Run</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${templatesCache.map((r) => `
              <tr>
                <td>${r.doc_type}</td>
                <td>${escapeHtml(r.customer_name || r.vendor_name || "—")}</td>
                <td>${r.frequency}</td>
                <td>${fmtDate(r.next_run_date)}</td>
                <td class="num">${fmtMoney(r.items.reduce((s, it) => s + it.quantity * it.rate * (1 + it.tax_rate_percent / 100), 0))}</td>
                <td>${r.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Paused</span>'}</td>
                <td>
                  <button class="btn secondary small rec-edit" data-id="${r.id}">Edit</button>
                  <button class="btn secondary small rec-toggle" data-id="${r.id}">${r.is_active ? "Pause" : "Resume"}</button>
                  <button class="btn secondary small rec-delete" data-id="${r.id}">Delete</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;

    document.getElementById("rec-add").addEventListener("click", () => openModal(container));
    document.getElementById("rec-generate").addEventListener("click", async () => {
      const res = await Api.generateDueRecurring();
      toast(res.count === 0 ? "Nothing due right now" : `Generated ${res.count} document(s): ${res.generated.join(", ")}`);
      render(container);
    });
    container.querySelectorAll(".rec-edit").forEach((btn) => btn.addEventListener("click", () => openModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".rec-toggle").forEach((btn) => btn.addEventListener("click", async () => {
      const r = templatesCache.find((x) => x.id === Number(btn.dataset.id));
      await Api.updateRecurring(r.id, { ...r, is_active: !r.is_active });
      toast(r.is_active ? "Paused" : "Resumed");
      render(container);
    }));
    container.querySelectorAll(".rec-delete").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Delete this recurring template?")) return;
      await Api.deleteRecurring(Number(btn.dataset.id));
      toast("Template deleted");
      render(container);
    }));
  }

  function openModal(container, recurringId) {
    const existing = recurringId ? templatesCache.find((r) => r.id === recurringId) : null;
    let docType = existing ? existing.doc_type : "Invoice";
    let items = existing ? existing.items.map((it) => ({ ...it })) : [{ description: "", quantity: 1, rate: 0, tax_rate_percent: 0 }];

    async function renderModal() {
      const [customers, vendors] = await Promise.all([Api.listCustomers(), Api.listVendors()]);
      const usesCustomer = docType === "Invoice";
      const html = `
        <div class="modal-header"><h2>${existing ? "Edit" : "New"} Recurring Template</h2><button class="modal-close" id="m-close">✕</button></div>
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="field"><label>Generates</label>
            <select id="rec-doctype"><option ${docType === "Invoice" ? "selected" : ""}>Invoice</option><option ${docType === "Receipt" ? "selected" : ""}>Receipt</option></select>
          </div>
          <div class="field"><label>${usesCustomer ? "Customer" : "Vendor / Payee"}</label>
            <select id="rec-party"><option value="">—</option>${(usesCustomer ? customers : vendors).map((p) => `<option value="${p.id}" ${existing && (existing.customer_id === p.id || existing.vendor_id === p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Frequency</label>
            <select id="rec-frequency">${RECURRING_FREQUENCIES.map((f) => `<option ${existing && existing.frequency === f ? "selected" : ""}>${f}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Next Run Date</label><input type="date" id="rec-next-run" value="${existing ? existing.next_run_date : todayStr()}" /></div>
          <div class="field" style="grid-column:1/-1;"><label>Notes</label><input type="text" id="rec-notes" value="${existing ? escapeHtml(existing.notes || "") : ""}" /></div>
        </div>
        <table class="jl-table">
          <thead><tr><th style="width:40%">Description</th><th>Qty</th><th>Rate</th><th>Tax %</th><th></th></tr></thead>
          <tbody id="rec-items-body">
            ${items.map((it, i) => `
              <tr data-i="${i}">
                <td><input type="text" class="ri-desc" value="${escapeHtml(it.description)}" /></td>
                <td><input type="number" class="ri-qty" value="${it.quantity}" step="0.01" /></td>
                <td><input type="number" class="ri-rate" value="${it.rate}" step="0.01" /></td>
                <td><input type="number" class="ri-tax" value="${it.tax_rate_percent}" step="0.01" /></td>
                <td><button class="jl-remove ri-remove">✕</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
        <button class="btn secondary small" id="rec-add-item">+ Add Line</button>
        <div class="modal-actions">
          <button class="btn secondary" id="m-cancel">Cancel</button>
          <button class="btn" id="rec-save">${existing ? "Save Changes" : "Create Template"}</button>
        </div>`;
      App.openModal(html, { wide: true });
      bind();
    }

    function bind() {
      document.getElementById("m-close").addEventListener("click", App.closeModal);
      document.getElementById("m-cancel").addEventListener("click", App.closeModal);
      document.getElementById("rec-doctype").addEventListener("change", (e) => { docType = e.target.value; renderModal(); });
      const body = document.getElementById("rec-items-body");
      body.querySelectorAll("tr").forEach((row) => {
        const i = Number(row.dataset.i);
        row.querySelector(".ri-desc").addEventListener("input", (e) => { items[i].description = e.target.value; });
        row.querySelector(".ri-qty").addEventListener("input", (e) => { items[i].quantity = e.target.value; });
        row.querySelector(".ri-rate").addEventListener("input", (e) => { items[i].rate = e.target.value; });
        row.querySelector(".ri-tax").addEventListener("input", (e) => { items[i].tax_rate_percent = e.target.value; });
        row.querySelector(".ri-remove").addEventListener("click", () => {
          if (items.length <= 1) return;
          items.splice(i, 1);
          renderModal();
        });
      });
      document.getElementById("rec-add-item").addEventListener("click", () => {
        items.push({ description: "", quantity: 1, rate: 0, tax_rate_percent: 0 });
        renderModal();
      });
      document.getElementById("rec-save").addEventListener("click", async () => {
        const partyId = document.getElementById("rec-party").value;
        const payload = {
          doc_type: docType,
          customer_id: docType === "Invoice" && partyId ? Number(partyId) : null,
          vendor_id: docType === "Receipt" && partyId ? Number(partyId) : null,
          frequency: document.getElementById("rec-frequency").value,
          next_run_date: document.getElementById("rec-next-run").value,
          notes: document.getElementById("rec-notes").value,
          is_active: existing ? existing.is_active : true,
          items: items.filter((it) => it.description.trim()).map((it) => ({
            description: it.description, quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0, tax_rate_percent: Number(it.tax_rate_percent) || 0,
          })),
        };
        if (payload.items.length === 0) { toast("Add at least one line item", true); return; }
        if (!payload.next_run_date) { toast("Next run date is required", true); return; }
        try {
          if (existing) await Api.updateRecurring(existing.id, payload);
          else await Api.createRecurring(payload);
          toast(existing ? "Template updated" : "Template created");
          App.closeModal();
          render(container);
        } catch (err) {
          toast(err.message, true);
        }
      });
    }

    renderModal();
  }

  return { render };
})();

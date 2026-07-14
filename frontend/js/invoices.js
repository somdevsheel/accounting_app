/* Invoice / Receipt generator (printable) + Customer / Vendor registers. */

const CUSTOMER_DOC_TYPES = ["Invoice", "Quote"];
const STATUS_OPTIONS_BY_TYPE = {
  Invoice: ["Unpaid", "Paid", "Partial"],
  Receipt: ["Unpaid", "Paid"],
  Quote: ["Draft", "Sent", "Accepted", "Declined", "Converted"],
  "Purchase Order": ["Open", "Received", "Cancelled"],
};
const STATUS_GOOD = new Set(["Paid", "Accepted", "Received", "Converted"]);

function docTypeView(docType, icon) {
  const usesCustomer = CUSTOMER_DOC_TYPES.includes(docType);
  const canGenerateFromEntry = docType === "Invoice" || docType === "Receipt";
  const canConvert = docType === "Quote";

  return {
    async render(container) {
      const invoices = await Api.listInvoices(docType);
      container.innerHTML = `
        <div class="toolbar">
          <div></div>
          <div class="flex-row">
            ${canGenerateFromEntry ? `<button class="btn secondary" id="doc-from-entry">Generate from Journal Entry</button>` : ""}
            <button class="btn" id="doc-new">+ New ${docType}</button>
          </div>
        </div>
        <div id="doc-list">
          ${invoices.length === 0 ? emptyState(icon, `No ${docType.toLowerCase()}s yet`, `Create a ${docType.toLowerCase()} to get started.`) : `
          <div class="table-wrap">
            <table>
              <thead><tr><th>No.</th><th>Date</th><th>Party</th><th class="num">Subtotal</th><th class="num">Tax</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${invoices.map((i) => `
                  <tr>
                    <td>${i.invoice_no}</td><td>${fmtDate(i.date)}</td>
                    <td>${escapeHtml(i.customer_name || i.vendor_name || "—")}</td>
                    <td class="num">${fmtMoney(i.subtotal)}</td><td class="num">${fmtMoney(i.tax_amount)}</td><td class="num">${fmtMoney(i.total)}</td>
                    <td>${STATUS_GOOD.has(i.status) ? `<span class="badge green">${escapeHtml(i.status)}</span>` : `<span class="badge gray">${escapeHtml(i.status)}</span>`}</td>
                    <td>
                    ${canConvert && !i.converted_invoice_id ? `<button class="btn secondary small doc-convert" data-id="${i.id}">Convert to Invoice</button>` : ""}
                    ${canConvert && i.converted_invoice_id ? `<span class="text-muted" style="font-size:0.78rem;">Converted</span>` : ""}
                    <button class="btn secondary small doc-print" data-id="${i.id}">Print</button>
                    <button class="btn secondary small doc-delete" data-id="${i.id}">Delete</button></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`}
        </div>`;
      document.getElementById("doc-new").addEventListener("click", () => openManualModal(container));
      const fromEntryBtn = document.getElementById("doc-from-entry");
      if (fromEntryBtn) fromEntryBtn.addEventListener("click", () => openFromEntryModal(container));
      container.querySelectorAll(".doc-print").forEach((btn) => btn.addEventListener("click", () => renderPrintView(container, Number(btn.dataset.id))));
      container.querySelectorAll(".doc-convert").forEach((btn) => btn.addEventListener("click", async () => {
        try {
          const inv = await Api.convertQuoteToInvoice(Number(btn.dataset.id));
          toast(`Converted to ${inv.invoice_no}`);
          docTypeView(docType, icon).render(container);
        } catch (err) {
          toast(err.message, true);
        }
      }));
      container.querySelectorAll(".doc-delete").forEach((btn) => btn.addEventListener("click", async () => {
        if (!confirm(`Delete this ${docType.toLowerCase()}?`)) return;
        await Api.deleteInvoice(Number(btn.dataset.id));
        toast(`${docType} deleted`);
        this.render(container);
      }));
    },
  };

  async function openFromEntryModal(container) {
    const relevantTypes = docType === "Invoice" ? ["Sales"] : ["Receipt", "Payment"];
    const entries = (await Promise.all(relevantTypes.map((t) => Api.listJournal({ voucher_type: t })))).flat();
    if (entries.length === 0) {
      toast(`No ${relevantTypes.join("/")} journal entries found`, true);
      return;
    }
    const html = `
      <div class="modal-header"><h2>Generate ${docType} from Journal Entry</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="field"><label>Journal Entry</label>
        <select id="doc-entry-select">
          ${entries.map((e) => `<option value="${e.id}">${e.voucher_no} — ${fmtDate(e.date)} — ${escapeHtml(e.party_name || "")} — ${fmtMoney(e.total_debit)}</option>`).join("")}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="doc-generate">Generate</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("doc-generate").addEventListener("click", async () => {
      const entryId = Number(document.getElementById("doc-entry-select").value);
      const invoice = await Api.generateInvoiceFromEntry(entryId, docType);
      toast(`${docType} ${invoice.invoice_no} generated`);
      App.closeModal();
      docTypeView(docType, icon).render(container);
    });
  }

  async function openManualModal(container) {
    const [customers, vendors] = await Promise.all([Api.listCustomers(), Api.listVendors()]);
    let items = [{ description: "", quantity: 1, rate: 0, tax_rate_percent: 0, item_id: null }];

    function totals() {
      let subtotal = 0, tax = 0;
      items.forEach((it) => {
        const amt = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
        subtotal += amt;
        tax += amt * ((Number(it.tax_rate_percent) || 0) / 100);
      });
      return { subtotal: Math.round(subtotal * 100) / 100, tax: Math.round(tax * 100) / 100 };
    }

    function renderModal() {
      const { subtotal, tax } = totals();
      const html = `
        <div class="modal-header"><h2>New ${docType}</h2><button class="modal-close" id="m-close">✕</button></div>
        <div class="form-grid" style="margin-bottom:14px;">
          ${usesCustomer ? `
          <div class="field"><label>Customer</label>
            <select id="doc-party"><option value="">—</option>${customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
          </div>` : `
          <div class="field"><label>Vendor / Payee</label>
            <select id="doc-party"><option value="">—</option>${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}</select>
          </div>`}
          <div class="field"><label>Date</label><input type="date" id="doc-date" value="${todayStr()}" /></div>
          <div class="field"><label>${docType === "Purchase Order" ? "Expected Delivery" : "Due Date"}</label><input type="date" id="doc-due" /></div>
          <div class="field"><label>Status</label>
            <select id="doc-status">${STATUS_OPTIONS_BY_TYPE[docType].map((s) => `<option ${s === STATUS_OPTIONS_BY_TYPE[docType][0] ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>
        </div>
        <table class="jl-table">
          <thead><tr><th style="width:18%">Item</th><th style="width:26%">Description</th><th>Qty</th><th>Rate</th><th>Tax %</th><th>Amount</th><th></th></tr></thead>
          <tbody id="doc-items-body">
            ${items.map((it, i) => `
              <tr data-i="${i}">
                <td><select class="di-item"><option value="">—</option>${State.items.map((si) => `<option value="${si.id}" ${it.item_id === si.id ? "selected" : ""}>${escapeHtml(si.name)}</option>`).join("")}</select></td>
                <td><input type="text" class="di-desc" value="${escapeHtml(it.description)}" /></td>
                <td><input type="number" class="di-qty" value="${it.quantity}" step="0.01" /></td>
                <td><input type="number" class="di-rate" value="${it.rate}" step="0.01" /></td>
                <td><input type="number" class="di-tax" value="${it.tax_rate_percent}" step="0.01" /></td>
                <td class="num di-amount" style="padding-top:10px;">${fmtMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0))}</td>
                <td><button class="jl-remove di-remove">✕</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
        ${docType === "Invoice" ? `<p class="text-muted" style="font-size:0.78rem;margin-top:6px;">Picking a stock-tracked item automatically deducts the quantity sold from Inventory.</p>` : ""}
        <button class="btn secondary small" id="doc-add-item">+ Add Line</button>
        <div class="form-grid" style="margin-top:14px;max-width:300px;margin-left:auto;" id="doc-totals">
          <div><label>Subtotal</label><div id="doc-subtotal">${fmtMoney(subtotal)}</div></div>
          <div><label>Tax</label><div id="doc-tax">${fmtMoney(tax)}</div></div>
          <div><label>Total</label><div><strong id="doc-total">${fmtMoney(subtotal + tax)}</strong></div></div>
        </div>
        <div class="modal-actions">
          <button class="btn secondary" id="m-cancel">Cancel</button>
          <button class="btn" id="doc-save">Create ${docType}</button>
        </div>`;
      App.openModal(html, { wide: true });
      bind();
    }

    function bind() {
      document.getElementById("m-close").addEventListener("click", App.closeModal);
      document.getElementById("m-cancel").addEventListener("click", App.closeModal);
      const body = document.getElementById("doc-items-body");
      body.querySelectorAll("tr").forEach((row) => {
        const i = Number(row.dataset.i);
        row.querySelector(".di-item").addEventListener("change", (e) => {
          const si = State.items.find((x) => x.id === Number(e.target.value));
          items[i].item_id = si ? si.id : null;
          if (si) {
            items[i].description = si.name;
            items[i].rate = docType === "Purchase Order" ? si.purchase_price : si.sale_price;
            row.querySelector(".di-desc").value = items[i].description;
            row.querySelector(".di-rate").value = items[i].rate;
          }
          updateRowAndTotals(row, i);
        });
        row.querySelector(".di-desc").addEventListener("input", (e) => { items[i].description = e.target.value; });
        row.querySelector(".di-qty").addEventListener("input", (e) => { items[i].quantity = e.target.value; updateRowAndTotals(row, i); });
        row.querySelector(".di-rate").addEventListener("input", (e) => { items[i].rate = e.target.value; updateRowAndTotals(row, i); });
        row.querySelector(".di-tax").addEventListener("input", (e) => { items[i].tax_rate_percent = e.target.value; updateRowAndTotals(row, i); });
        row.querySelector(".di-remove").addEventListener("click", () => {
          if (items.length <= 1) return;
          items.splice(i, 1);
          renderModal();
        });
      });
      document.getElementById("doc-add-item").addEventListener("click", () => {
        items.push({ description: "", quantity: 1, rate: 0, tax_rate_percent: 0, item_id: null });
        renderModal();
      });
      function updateRowAndTotals(row, i) {
        const it = items[i];
        row.querySelector(".di-amount").textContent = fmtMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0));
        const { subtotal, tax } = totals();
        document.getElementById("doc-subtotal").textContent = fmtMoney(subtotal);
        document.getElementById("doc-tax").textContent = fmtMoney(tax);
        document.getElementById("doc-total").textContent = fmtMoney(subtotal + tax);
      }
      document.getElementById("doc-save").addEventListener("click", async () => {
        const partyId = document.getElementById("doc-party").value;
        const payload = {
          doc_type: docType,
          customer_id: usesCustomer && partyId ? Number(partyId) : null,
          vendor_id: !usesCustomer && partyId ? Number(partyId) : null,
          date: document.getElementById("doc-date").value,
          due_date: document.getElementById("doc-due").value || null,
          status: document.getElementById("doc-status").value,
          items: items.filter((it) => it.description.trim()).map((it) => ({
            description: it.description, quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0, tax_rate_percent: Number(it.tax_rate_percent) || 0,
            item_id: it.item_id || null,
          })),
        };
        if (payload.items.length === 0) { toast("Add at least one line item", true); return; }
        await Api.createInvoice(payload);
        toast(`${docType} created`);
        App.closeModal();
        docTypeView(docType, icon).render(container);
      });
    }
    renderModal();
  }

  async function renderPrintView(container, invoiceId) {
    const inv = await Api.getInvoice(invoiceId);
    const company = State.company;
    container.innerHTML = `
      <div class="no-print" style="margin-bottom:16px;">
        <button class="btn secondary" id="print-back">← Back</button>
        <button class="btn" id="print-now">🖨 Print</button>
      </div>
      <div class="card" style="max-width:720px;margin:0 auto;padding:36px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--navy-900);padding-bottom:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            ${company.logo_data ? `<img src="${company.logo_data}" style="max-width:56px;max-height:56px;object-fit:contain;" />` : ""}
            <div>
              <div style="font-size:1.3rem;font-weight:700;color:var(--navy-900);">${escapeHtml(company.name)}</div>
              ${company.registration_no ? `<div class="text-muted" style="font-size:0.8rem;">Reg. No: ${escapeHtml(company.registration_no)}</div>` : ""}
              ${company.tax_id ? `<div class="text-muted" style="font-size:0.8rem;">${escapeHtml(company.tax_name)} No: ${escapeHtml(company.tax_id)}</div>` : ""}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem;font-weight:700;">${docType.toUpperCase()}</div>
            <div>${inv.invoice_no}</div>
            <div class="text-muted" style="font-size:0.82rem;">${fmtDate(inv.date)}</div>
          </div>
        </div>
        <div style="margin-bottom:18px;">
          <div class="text-muted" style="font-size:0.75rem;text-transform:uppercase;">Billed To</div>
          <div style="font-weight:600;">${escapeHtml(inv.customer_name || inv.vendor_name || "—")}</div>
          ${inv.due_date ? `<div class="text-muted" style="font-size:0.82rem;">Due: ${fmtDate(inv.due_date)}</div>` : ""}
        </div>
        <table class="jl-table" style="width:100%;">
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax %</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${inv.items.map((it) => `<tr><td>${escapeHtml(it.description)}</td><td class="num">${it.quantity}</td><td class="num">${fmtMoney(it.rate)}</td><td class="num">${it.tax_rate_percent}%</td><td class="num">${fmtMoney(it.amount)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-left:auto;max-width:260px;margin-top:16px;">
          <div class="flex-row" style="justify-content:space-between;"><span>Subtotal</span><strong>${fmtMoney(inv.subtotal)}</strong></div>
          <div class="flex-row" style="justify-content:space-between;"><span>Tax</span><strong>${fmtMoney(inv.tax_amount)}</strong></div>
          <div class="flex-row" style="justify-content:space-between;font-size:1.1rem;border-top:1px solid var(--border);padding-top:6px;margin-top:6px;"><span>Total</span><strong>${fmtMoney(inv.total)}</strong></div>
        </div>
        ${inv.notes ? `<div style="margin-top:20px;"><div class="text-muted" style="font-size:0.75rem;text-transform:uppercase;">Notes</div><div>${escapeHtml(inv.notes)}</div></div>` : ""}
      </div>`;
    document.getElementById("print-back").addEventListener("click", () => docTypeView(docType, icon).render(container));
    document.getElementById("print-now").addEventListener("click", () => window.print());
  }
}

const InvoicesView = docTypeView("Invoice", "🧾");
const ReceiptsView = docTypeView("Receipt", "🧾");
const QuotesView = docTypeView("Quote", "📋");
const PurchaseOrdersView = docTypeView("Purchase Order", "📦");

/* ---------------- Customers / Vendors ---------------- */

function partyView(kind) {
  const listFn = kind === "Customer" ? Api.listCustomers : Api.listVendors;
  const createFn = kind === "Customer" ? Api.createCustomer : Api.createVendor;
  const updateFn = kind === "Customer" ? Api.updateCustomer : Api.updateVendor;
  const deactivateFn = kind === "Customer" ? Api.deactivateCustomer : Api.deactivateVendor;

  return {
    async render(container) {
      const parties = await listFn();
      container.innerHTML = `
        <div class="toolbar"><div></div><button class="btn" id="party-add">+ Add ${kind}</button></div>
        ${parties.length === 0 ? emptyState(kind === "Customer" ? "🧑‍💼" : "🏭", `No ${kind.toLowerCase()}s yet`, `Add ${kind.toLowerCase()}s to track outstanding balances from unpaid transactions.`) : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th class="num">Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${parties.map((p) => `
                <tr>
                  <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.contact_person || "")}</td>
                  <td>${escapeHtml(p.email || "")}</td><td>${escapeHtml(p.phone || "")}</td>
                  <td class="num">${fmtMoney(p.outstanding_balance)}</td>
                  <td>${p.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                  <td>${p.is_active ? `<button class="btn secondary small party-edit" data-id="${p.id}">Edit</button>
                  <button class="btn secondary small party-deactivate" data-id="${p.id}">Deactivate</button>` : ""}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}`;
      document.getElementById("party-add").addEventListener("click", () => openModal(container));
      container.querySelectorAll(".party-edit").forEach((btn) => btn.addEventListener("click", async () => {
        const p = parties.find((x) => x.id === Number(btn.dataset.id));
        openModal(container, p);
      }));
      container.querySelectorAll(".party-deactivate").forEach((btn) => btn.addEventListener("click", async () => {
        await deactivateFn(Number(btn.dataset.id));
        toast(`${kind} deactivated`);
        this.render(container);
      }));
    },
    openModal,
  };

  function openModal(container, existing) {
    const html = `
      <div class="modal-header"><h2>${existing ? `Edit ${kind}` : `Add ${kind}`}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field" style="grid-column:span 2;"><label>Name</label><input type="text" id="p-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Contact Person</label><input type="text" id="p-contact" value="${existing ? escapeHtml(existing.contact_person || "") : ""}" /></div>
        <div class="field"><label>Email</label><input type="email" id="p-email" value="${existing ? escapeHtml(existing.email || "") : ""}" /></div>
        <div class="field"><label>Phone</label><input type="text" id="p-phone" value="${existing ? escapeHtml(existing.phone || "") : ""}" /></div>
        <div class="field"><label>Tax ID</label><input type="text" id="p-taxid" value="${existing ? escapeHtml(existing.tax_id || "") : ""}" /></div>
        <div class="field" style="grid-column:1/-1;"><label>Address</label><textarea id="p-address" rows="2">${existing ? escapeHtml(existing.address || "") : ""}</textarea></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="p-save">${existing ? "Save Changes" : `Add ${kind}`}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("p-save").addEventListener("click", async () => {
      const payload = {
        name: document.getElementById("p-name").value.trim(),
        contact_person: document.getElementById("p-contact").value,
        email: document.getElementById("p-email").value,
        phone: document.getElementById("p-phone").value,
        tax_id: document.getElementById("p-taxid").value,
        address: document.getElementById("p-address").value,
      };
      if (!payload.name) { toast("Name is required", true); return; }
      if (existing) await updateFn(existing.id, payload);
      else await createFn(payload);
      toast(`${kind} saved`);
      App.closeModal();
      partyView(kind).render(container);
    });
  }
}

const CustomersView = partyView("Customer");
const VendorsView = partyView("Vendor");

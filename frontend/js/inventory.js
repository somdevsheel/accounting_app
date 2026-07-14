/* Inventory: Item master, Stock Register with reorder alerts, per-item movement history. */

const MOVEMENT_TYPES = ["Opening", "Purchase", "Sale", "Adjustment"];

const ItemsView = (() => {
  let itemsCache = [];

  async function render(container) {
    itemsCache = await Api.listItems({ include_inactive: true });
    State.items = itemsCache.filter((i) => i.is_active);
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn" id="item-add">+ Add Item</button></div>
      ${itemsCache.length === 0 ? emptyState("📦", "No items yet", "Add products or services to track stock, reorder points, and pull them straight into invoices.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th class="num">Sale Price</th><th class="num">On Hand</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${itemsCache.map((i) => `
              <tr>
                <td>${escapeHtml(i.sku)}</td>
                <td>${escapeHtml(i.name)}${i.below_reorder_point ? ' <span class="badge amber" title="At or below reorder point">Reorder</span>' : ""}</td>
                <td>${escapeHtml(i.category || "")}</td>
                <td class="num">${fmtMoney(i.sale_price)}</td>
                <td class="num">${i.is_stock_tracked ? fmtNum(i.stock_on_hand, 2) + " " + escapeHtml(i.unit) : "—"}</td>
                <td>${i.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                <td>
                  <button class="btn secondary small item-movements" data-id="${i.id}">Stock Ledger</button>
                  <button class="btn secondary small item-edit" data-id="${i.id}">Edit</button>
                  ${i.is_active
                    ? `<button class="btn secondary small item-deactivate" data-id="${i.id}">Deactivate</button>`
                    : `<button class="btn secondary small item-activate" data-id="${i.id}">Activate</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;

    document.getElementById("item-add").addEventListener("click", () => openItemModal(container));
    container.querySelectorAll(".item-edit").forEach((btn) => btn.addEventListener("click", () => openItemModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".item-movements").forEach((btn) => btn.addEventListener("click", () => openMovementsModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".item-deactivate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deactivateItem(Number(btn.dataset.id));
      toast("Item deactivated");
      render(container);
    }));
    container.querySelectorAll(".item-activate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.activateItem(Number(btn.dataset.id));
      toast("Item activated");
      render(container);
    }));
  }

  function openItemModal(container, itemId) {
    const existing = itemId ? itemsCache.find((i) => i.id === itemId) : null;
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Item" : "Add Item"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field"><label>SKU</label><input type="text" id="i-sku" value="${existing ? escapeHtml(existing.sku) : ""}" placeholder="Auto if blank" /></div>
        <div class="field" style="grid-column:span 2;"><label>Name</label><input type="text" id="i-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Category</label><input type="text" id="i-category" value="${existing ? escapeHtml(existing.category || "") : ""}" /></div>
        <div class="field"><label>Unit</label><input type="text" id="i-unit" value="${existing ? existing.unit : "pcs"}" placeholder="pcs, kg, hrs…" /></div>
        <div class="field"><label>Sale Price</label><input type="number" step="0.01" id="i-sale-price" value="${existing ? existing.sale_price : 0}" /></div>
        <div class="field"><label>Purchase Price</label><input type="number" step="0.01" id="i-purchase-price" value="${existing ? existing.purchase_price : 0}" /></div>
        <div class="field"><label>Reorder Point</label><input type="number" step="0.01" id="i-reorder" value="${existing ? existing.reorder_point : 0}" /></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px;font-weight:400;"><input type="checkbox" id="i-tracked" style="width:auto;" ${!existing || existing.is_stock_tracked ? "checked" : ""} /> Track stock for this item</label></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="i-save">${existing ? "Save Changes" : "Add Item"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("i-save").addEventListener("click", async () => {
      const payload = {
        sku: document.getElementById("i-sku").value || null,
        name: document.getElementById("i-name").value.trim(),
        category: document.getElementById("i-category").value,
        unit: document.getElementById("i-unit").value || "pcs",
        sale_price: Number(document.getElementById("i-sale-price").value) || 0,
        purchase_price: Number(document.getElementById("i-purchase-price").value) || 0,
        reorder_point: Number(document.getElementById("i-reorder").value) || 0,
        is_stock_tracked: document.getElementById("i-tracked").checked,
      };
      if (!payload.name) { toast("Item name is required", true); return; }
      try {
        if (existing) await Api.updateItem(existing.id, payload);
        else await Api.createItem(payload);
        toast("Item saved");
        App.closeModal();
        render(container);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  async function openMovementsModal(container, itemId) {
    const item = itemsCache.find((i) => i.id === itemId);
    const movements = await Api.listItemMovements(itemId);
    const html = `
      <div class="modal-header"><h2>Stock Ledger — ${escapeHtml(item.name)}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="flex-row" style="margin-bottom:14px;gap:20px;">
        <div><label>On Hand</label><div style="font-size:1.1rem;font-weight:600;">${fmtNum(item.stock_on_hand, 2)} ${escapeHtml(item.unit)}</div></div>
        <div><label>Reorder Point</label><div>${fmtNum(item.reorder_point, 2)} ${escapeHtml(item.unit)}</div></div>
      </div>
      <div class="table-wrap" style="max-height:320px;overflow-y:auto;">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th class="num">Qty</th><th>Reference</th><th class="num">Balance</th></tr></thead>
          <tbody>
            ${movements.length === 0 ? `<tr><td colspan="5" class="text-muted">No movements yet.</td></tr>` :
              movements.map((m) => `<tr><td>${fmtDate(m.date)}</td><td>${m.movement_type}</td><td class="num">${m.quantity > 0 ? "+" : ""}${fmtNum(m.quantity, 2)}</td><td>${escapeHtml(m.reference || "")}</td><td class="num">${fmtNum(m.running_balance, 2)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3>Record a Movement</h3>
        <div class="form-grid">
          <div class="field"><label>Type</label><select id="mv-type">${MOVEMENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="field"><label>Date</label><input type="date" id="mv-date" value="${todayStr()}" /></div>
          <div class="field"><label>Quantity (+ in / − out)</label><input type="number" step="0.01" id="mv-qty" /></div>
          <div class="field"><label>Reference</label><input type="text" id="mv-ref" placeholder="Optional" /></div>
        </div>
        <div class="modal-actions" style="border-top:none;"><button class="btn" id="mv-save">Add Movement</button></div>
      </div>
      <div class="modal-actions"><button class="btn secondary" id="m-cancel">Close</button></div>`;
    App.openModal(html, { wide: true });
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("mv-save").addEventListener("click", async () => {
      const qty = Number(document.getElementById("mv-qty").value);
      if (!qty) { toast("Enter a non-zero quantity", true); return; }
      await Api.addItemMovement(itemId, {
        date: document.getElementById("mv-date").value,
        movement_type: document.getElementById("mv-type").value,
        quantity: qty,
        reference: document.getElementById("mv-ref").value || null,
      });
      toast("Movement recorded");
      itemsCache = await Api.listItems({ include_inactive: true });
      openMovementsModal(container, itemId);
    });
  }

  return { render };
})();

const StockRegisterView = (() => {
  async function render(container) {
    const data = await Api.stockRegister();
    if (data.rows.length === 0) {
      container.innerHTML = emptyState("📦", "No stock-tracked items yet", "Add items in the Inventory screen with \"Track stock\" enabled to see them here.");
      return;
    }
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:18px;">
        <div class="kpi-card"><div class="kpi-label">Total Stock Value</div><div class="kpi-value">${fmtMoney(data.total_stock_value)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Items Below Reorder Point</div><div class="kpi-value ${data.below_reorder_count > 0 ? "negative" : ""}">${data.below_reorder_count}</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th class="num">On Hand</th><th class="num">Reorder Point</th><th class="num">Stock Value</th><th></th></tr></thead>
          <tbody>
            ${data.rows.map((r) => `<tr><td>${escapeHtml(r.sku)}</td><td>${escapeHtml(r.name)}</td><td class="num">${fmtNum(r.stock_on_hand, 2)} ${escapeHtml(r.unit)}</td><td class="num">${fmtNum(r.reorder_point, 2)}</td><td class="num">${fmtMoney(r.stock_value)}</td><td>${r.below_reorder_point ? '<span class="badge amber">Reorder</span>' : ""}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  return { render };
})();

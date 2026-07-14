/* Chart of Accounts screen + Company Info / Settings screen. */

const ACCOUNT_TYPES = ["Asset", "Liability", "Capital", "Income", "Expense"];
const ACCOUNT_CATEGORIES = ["Current Asset", "Fixed Asset", "Current Liability", "Long Term Liability", "Capital", "Income", "Expense"];

const AccountsView = (() => {
  async function render(container) {
    await refresh(container);
  }

  async function refresh(container, filterType) {
    const accounts = await Api.listAccounts({ include_inactive: true });
    State.accounts = accounts;
    const filtered = filterType ? accounts.filter((a) => a.type === filterType) : accounts;

    container.innerHTML = `
      <div class="toolbar">
        <div class="filters">
          <div>
            <label>Filter by Type</label>
            <select id="coa-filter">
              <option value="">All Types</option>
              ${ACCOUNT_TYPES.map((t) => `<option value="${t}" ${filterType === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="btn" id="coa-add">+ Add Account</button>
      </div>
      ${accounts.length === 0 ? emptyState("📊", "No accounts yet", "Your Chart of Accounts will appear here.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Category</th><th>Normal Bal.</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${filtered.map((a) => `
              <tr data-id="${a.id}">
                <td>${escapeHtml(a.code)}</td>
                <td>${escapeHtml(a.name)}</td>
                <td>${a.type}</td>
                <td>${a.category}</td>
                <td>${a.normal_balance}</td>
                <td>${a.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                <td>
                  <button class="btn secondary small coa-edit" data-id="${a.id}">Edit</button>
                  ${a.is_active
                    ? `<button class="btn secondary small coa-deactivate" data-id="${a.id}">Deactivate</button>`
                    : `<button class="btn secondary small coa-activate" data-id="${a.id}">Activate</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;

    document.getElementById("coa-filter").addEventListener("change", (e) => refresh(container, e.target.value || undefined));
    document.getElementById("coa-add").addEventListener("click", () => openAccountModal(container));
    container.querySelectorAll(".coa-edit").forEach((btn) => btn.addEventListener("click", () => openAccountModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".coa-deactivate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deactivateAccount(Number(btn.dataset.id));
      toast("Account deactivated");
      refresh(container, filterType);
    }));
    container.querySelectorAll(".coa-activate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.activateAccount(Number(btn.dataset.id));
      toast("Account activated");
      refresh(container, filterType);
    }));
  }

  function openAccountModal(container, accountId) {
    const existing = accountId ? State.accounts.find((a) => a.id === accountId) : null;
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Account" : "Add Account"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field"><label>Code</label><input type="text" id="acc-code" value="${existing ? escapeHtml(existing.code) : ""}" placeholder="Auto if blank" /></div>
        <div class="field" style="grid-column:span 2;"><label>Name</label><input type="text" id="acc-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Type</label><select id="acc-type">${ACCOUNT_TYPES.map((t) => `<option ${existing && existing.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Category</label><select id="acc-category">${ACCOUNT_CATEGORIES.map((c) => `<option ${existing && existing.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label>Normal Balance</label><select id="acc-normal"><option ${existing && existing.normal_balance === "Debit" ? "selected" : ""}>Debit</option><option ${existing && existing.normal_balance === "Credit" ? "selected" : ""}>Credit</option></select></div>
      </div>
      <div class="modal-actions">
        ${existing && !existing.is_system ? `<button class="btn danger" id="acc-delete" style="margin-right:auto;">Delete</button>` : ""}
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="acc-save">${existing ? "Save Changes" : "Add Account"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    if (document.getElementById("acc-delete")) {
      document.getElementById("acc-delete").addEventListener("click", async () => {
        try {
          await Api.deleteAccount(existing.id);
          toast("Account deleted");
          App.closeModal();
          refresh(container);
        } catch (err) {
          toast(err.message, true);
        }
      });
    }
    document.getElementById("acc-save").addEventListener("click", async () => {
      const payload = {
        code: document.getElementById("acc-code").value || null,
        name: document.getElementById("acc-name").value.trim(),
        type: document.getElementById("acc-type").value,
        category: document.getElementById("acc-category").value,
        normal_balance: document.getElementById("acc-normal").value,
      };
      if (!payload.name) { toast("Account name is required", true); return; }
      try {
        if (existing) await Api.updateAccount(existing.id, payload);
        else await Api.createAccount(payload);
        toast("Account saved");
        App.closeModal();
        refresh(container);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  return { render };
})();

/* ---------------- Company Settings ---------------- */

const SettingsView = (() => {
  let activeTab = "profile";

  async function render(container, opts) {
    if (opts && opts.tab) activeTab = opts.tab;
    container.innerHTML = `
      <div class="tabs">
        <div class="tab" data-tab="profile">Company Profile</div>
        <div class="tab" data-tab="owners">Owners / Partners</div>
        <div class="tab" data-tab="tax">Tax Configuration</div>
        <div class="tab" data-tab="coa">Chart of Accounts</div>
        <div class="tab" data-tab="users">Users &amp; Access</div>
      </div>
      <div id="settings-body"></div>`;
    container.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === activeTab);
      t.addEventListener("click", () => { activeTab = t.dataset.tab; render(container); });
    });
    const body = document.getElementById("settings-body");
    if (activeTab === "profile") renderProfileTab(body);
    else if (activeTab === "owners") renderOwnersTab(body);
    else if (activeTab === "tax") renderTaxTab(body);
    else if (activeTab === "users") await renderUsersTab(body);
    else await AccountsView.render(body);
  }

  function resizeImageToDataUrl(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Not a valid image"));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderProfileTab(body) {
    const c = State.company;
    body.innerHTML = `
      <div class="card" style="max-width:640px;">
        <h3>Company Logo</h3>
        <div class="flex-row" style="align-items:center;gap:16px;">
          <div id="s-logo-preview" style="width:72px;height:72px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--slate-50, #f4f6f8);">
            ${c.logo_data ? `<img src="${c.logo_data}" style="width:100%;height:100%;object-fit:contain;" />` : `<span class="text-muted" style="font-size:0.7rem;">No logo</span>`}
          </div>
          <div>
            <input type="file" id="s-logo-file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none;" />
            <button class="btn secondary small" id="s-logo-upload">Upload logo</button>
            ${c.logo_data ? `<button class="btn secondary small" id="s-logo-remove">Remove</button>` : ""}
            <div class="text-muted" style="font-size:0.75rem;margin-top:6px;">PNG/JPEG/SVG, resized to fit ${240}px. Shown in the sidebar and on invoices/receipts.</div>
          </div>
        </div>
      </div>
      <div class="card" style="max-width:640px;margin-top:16px;">
        <h3>Company Profile</h3>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;"><label>Company Name</label><input type="text" id="s-name" value="${escapeHtml(c.name)}" /></div>
          <div class="field"><label>Legal Structure</label>
            <select id="s-legal">
              ${["Sole Proprietorship", "Partnership", "LLP", "Private Limited", "Corporation"].map((s) => `<option ${c.legal_structure === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Country</label><input type="text" id="s-country" value="${escapeHtml(c.country || "")}" /></div>
          <div class="field"><label>Currency Symbol</label><input type="text" id="s-currency-symbol" value="${escapeHtml(c.currency_symbol)}" /></div>
          <div class="field"><label>Currency Code</label><input type="text" id="s-currency-code" value="${escapeHtml(c.currency_code)}" /></div>
          <div class="field"><label>Financial Year Start Month</label>
            <select id="s-fy-month">
              ${["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => `<option value="${i + 1}" ${c.fy_start_month === i + 1 ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Registration No.</label><input type="text" id="s-reg" value="${escapeHtml(c.registration_no || "")}" /></div>
          <div class="field"><label>Tax ID / GSTIN / VAT No.</label><input type="text" id="s-taxid" value="${escapeHtml(c.tax_id || "")}" /></div>
        </div>
        <div class="modal-actions" style="border-top:none;">
          <button class="btn" id="s-save">Save Changes</button>
        </div>
      </div>`;
    document.getElementById("s-save").addEventListener("click", async () => {
      const payload = {
        name: document.getElementById("s-name").value.trim(),
        legal_structure: document.getElementById("s-legal").value,
        country: document.getElementById("s-country").value,
        currency_symbol: document.getElementById("s-currency-symbol").value,
        currency_code: document.getElementById("s-currency-code").value,
        fy_start_month: Number(document.getElementById("s-fy-month").value),
        registration_no: document.getElementById("s-reg").value,
        tax_id: document.getElementById("s-taxid").value,
      };
      State.company = await Api.updateCompany(payload);
      App.refreshShell();
      toast("Company profile updated");
    });

    const logoInput = document.getElementById("s-logo-file");
    document.getElementById("s-logo-upload").addEventListener("click", () => logoInput.click());
    logoInput.addEventListener("change", async () => {
      const file = logoInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast("Image is too large (max 5MB)", true); return; }
      try {
        const dataUrl = file.type === "image/svg+xml" ? await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error("Could not read file"));
          r.readAsDataURL(file);
        }) : await resizeImageToDataUrl(file, 240);
        State.company = await Api.updateCompany({ logo_data: dataUrl });
        App.refreshShell();
        renderProfileTab(body);
        toast("Logo updated");
      } catch (err) {
        toast(err.message || "Could not upload logo", true);
      }
    });
    const removeBtn = document.getElementById("s-logo-remove");
    if (removeBtn) removeBtn.addEventListener("click", async () => {
      State.company = await Api.updateCompany({ logo_data: null });
      App.refreshShell();
      renderProfileTab(body);
      toast("Logo removed");
    });
  }

  function renderOwnersTab(body) {
    const owners = State.owners;
    const totalShare = owners.filter((o) => o.is_active).reduce((s, o) => s + o.share_percent, 0);
    body.innerHTML = `
      <div class="toolbar"><div></div><button class="btn" id="owner-add">+ Add Owner</button></div>
      ${owners.length === 0 ? emptyState("👤", "No owners yet", "Add owners or partners to track capital accounts.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th class="num">Share %</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${owners.map((o) => `
              <tr>
                <td>${escapeHtml(o.name)}</td>
                <td>${escapeHtml(o.role || "")}</td>
                <td class="num">${o.share_percent.toFixed(2)}%</td>
                <td>${o.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                <td>
                  ${o.is_active ? `<button class="btn secondary small owner-edit" data-id="${o.id}">Edit</button>
                  <button class="btn secondary small owner-deactivate" data-id="${o.id}">Deactivate</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="2">Total (active)</td><td class="num">${totalShare.toFixed(2)}%</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>
      ${Math.abs(totalShare - 100) > 0.01 ? `<div class="warn-text">⚠ Active owner shares don't add up to 100%.</div>` : ""}`}`;

    document.getElementById("owner-add").addEventListener("click", () => openOwnerModal(body));
    body.querySelectorAll(".owner-edit").forEach((btn) => btn.addEventListener("click", () => openOwnerModal(body, Number(btn.dataset.id))));
    body.querySelectorAll(".owner-deactivate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deactivateOwner(Number(btn.dataset.id));
      State.owners = await Api.listOwners();
      toast("Owner deactivated");
      renderOwnersTab(body);
    }));
  }

  function openOwnerModal(body, ownerId) {
    const existing = ownerId ? State.owners.find((o) => o.id === ownerId) : null;
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Owner" : "Add Owner"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field" style="grid-column:span 2;"><label>Name</label><input type="text" id="o-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Role</label><input type="text" id="o-role" value="${existing ? escapeHtml(existing.role || "") : ""}" placeholder="e.g. Partner" /></div>
        <div class="field"><label>Share %</label><input type="number" id="o-share" value="${existing ? existing.share_percent : 0}" step="0.01" /></div>
      </div>
      ${!existing ? `<p class="text-muted" style="font-size:0.8rem;">A matching "{Name} Capital" account will be created automatically.</p>` : ""}
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="o-save">${existing ? "Save Changes" : "Add Owner"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("o-save").addEventListener("click", async () => {
      const payload = {
        name: document.getElementById("o-name").value.trim(),
        role: document.getElementById("o-role").value,
        share_percent: Number(document.getElementById("o-share").value) || 0,
      };
      if (!payload.name) { toast("Name is required", true); return; }
      if (existing) await Api.updateOwner(existing.id, payload);
      else await Api.createOwner(payload);
      State.owners = await Api.listOwners();
      State.accounts = await Api.listAccounts({ include_inactive: true });
      App.closeModal();
      toast("Owner saved");
      renderOwnersTab(body);
    });
  }

  function renderTaxTab(body) {
    const c = State.company;
    const rates = State.taxRates;
    body.innerHTML = `
      <div class="card" style="max-width:640px;">
        <h3>Tax Name</h3>
        <div class="flex-row">
          <input type="text" id="t-name" value="${escapeHtml(c.tax_name)}" style="max-width:220px;" />
          <button class="btn secondary small" id="t-name-save">Save</button>
        </div>
      </div>
      <div class="card" style="max-width:640px;margin-top:16px;">
        <h3>Tax Rates</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Rate %</th><th>Label</th><th></th></tr></thead>
            <tbody>
              ${rates.map((r) => `<tr><td>${r.rate}%</td><td>${escapeHtml(r.label || "")}</td><td><button class="btn secondary small rate-del" data-id="${r.id}">Remove</button></td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="flex-row" style="margin-top:12px;max-width:340px;">
          <input type="number" id="t-new-rate" placeholder="Rate %" step="0.01" />
          <input type="text" id="t-new-label" placeholder="Label (optional)" />
          <button class="btn secondary small" id="t-add-rate">Add</button>
        </div>
      </div>`;
    document.getElementById("t-name-save").addEventListener("click", async () => {
      State.company = await Api.updateCompany({ tax_name: document.getElementById("t-name").value.trim() });
      App.refreshShell();
      toast("Tax name updated");
    });
    document.getElementById("t-add-rate").addEventListener("click", async () => {
      const rate = Number(document.getElementById("t-new-rate").value);
      if (isNaN(rate)) { toast("Enter a valid rate", true); return; }
      await Api.createTaxRate({ rate, label: document.getElementById("t-new-label").value || null });
      State.taxRates = await Api.listTaxRates();
      renderTaxTab(body);
    });
    body.querySelectorAll(".rate-del").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deleteTaxRate(Number(btn.dataset.id));
      State.taxRates = await Api.listTaxRates();
      renderTaxTab(body);
    }));
  }

  async function renderUsersTab(body) {
    const authStatus = await Api.authStatus();

    if (!authStatus.auth_enabled) {
      body.innerHTML = `
        <div class="card" style="max-width:480px;">
          <h3>Enable Login Protection</h3>
          <p class="text-muted" style="font-size:0.85rem;">Right now anyone with access to this app can see and edit everything — there's no login. If more than one person will use this company's books (e.g. a bookkeeper and an owner), create the first Admin account below. This is optional and permanent for this company once created.</p>
          <div class="form-grid">
            <div class="field"><label>Admin Username</label><input type="text" id="ua-username" /></div>
            <div class="field"><label>Password</label><input type="password" id="ua-password" placeholder="At least 6 characters" /></div>
          </div>
          <div class="modal-actions" style="border-top:none;"><button class="btn" id="ua-enable">Create Admin &amp; Enable Login</button></div>
        </div>`;
      document.getElementById("ua-enable").addEventListener("click", async () => {
        const username = document.getElementById("ua-username").value.trim();
        const password = document.getElementById("ua-password").value;
        if (!username || !password) { toast("Username and password are required", true); return; }
        try {
          const res = await Api.bootstrapAdmin({ username, password });
          Auth.setSession(res.token, res.user);
          toast("Login enabled — you're signed in as Admin");
          App.refreshShell();
          renderUsersTab(body);
        } catch (err) {
          toast(err.message, true);
        }
      });
      return;
    }

    if (!Auth.user || Auth.user.role !== "Admin") {
      body.innerHTML = `<div class="card" style="max-width:480px;"><p class="text-muted">Login is enabled for this company. Contact an Admin to manage user accounts.</p></div>`;
      return;
    }

    const users = await Api.listUsers();
    body.innerHTML = `
      <div class="card" style="max-width:640px;">
        <h3>Users</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr>
                  <td>${escapeHtml(u.username)}</td>
                  <td>${u.role}</td>
                  <td>${u.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                  <td>
                    ${u.id !== Auth.user.id ? `<button class="btn secondary small ua-toggle" data-id="${u.id}" data-active="${u.is_active}">${u.is_active ? "Deactivate" : "Activate"}</button>` : `<span class="text-muted" style="font-size:0.78rem;">You</span>`}
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <h3 style="margin-top:20px;">Add User</h3>
        <div class="form-grid">
          <div class="field"><label>Username</label><input type="text" id="ua-new-username" /></div>
          <div class="field"><label>Password</label><input type="password" id="ua-new-password" placeholder="At least 6 characters" /></div>
          <div class="field"><label>Role</label>
            <select id="ua-new-role"><option>Admin</option><option selected>Accountant</option><option>Viewer</option></select>
          </div>
        </div>
        <p class="text-muted" style="font-size:0.78rem;">Admin: full access, incl. Users &amp; Access. Accountant: can create/edit everything else. Viewer: read-only.</p>
        <div class="modal-actions" style="border-top:none;"><button class="btn" id="ua-add-user">Add User</button></div>
      </div>`;
    body.querySelectorAll(".ua-toggle").forEach((btn) => btn.addEventListener("click", async () => {
      const nowActive = btn.dataset.active === "true";
      try {
        await Api.updateUser(Number(btn.dataset.id), { is_active: !nowActive });
        toast(nowActive ? "User deactivated" : "User activated");
        renderUsersTab(body);
      } catch (err) {
        toast(err.message, true);
      }
    }));
    document.getElementById("ua-add-user").addEventListener("click", async () => {
      const username = document.getElementById("ua-new-username").value.trim();
      const password = document.getElementById("ua-new-password").value;
      const role = document.getElementById("ua-new-role").value;
      if (!username || !password) { toast("Username and password are required", true); return; }
      try {
        await Api.createUser({ username, password, role });
        toast("User added");
        renderUsersTab(body);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  return { render };
})();
